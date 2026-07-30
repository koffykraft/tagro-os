const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);
const owner = (session) => String(session.role || '').toLowerCase() === 'owner';
const branchCode = (session) => clean(session.branch, 8).toUpperCase();

function requestedBranches(url, session) {
  if (!owner(session)) return [branchCode(session)];
  const requested = clean(url.searchParams.get('branches') || url.searchParams.get('branch'), 100)
    .toUpperCase().split(',').map((value) => value.trim())
    .filter((value) => /^[A-Z0-9 -]{2,12}$/.test(value)).slice(0, 12);
  return requested.length ? requested : [branchCode(session)];
}

function transferMode(url) {
  const mode = url.searchParams.get('transfer_mode') || 'exclude';
  return ['exclude', 'separate', 'include'].includes(mode) ? mode : 'exclude';
}

const internalTransferSql = (alias = 'v') =>
  `(${alias}.vch_type=9 and exists(select 1 from internal_transfer_parties tp where tp.party_name=${alias}.party_name collate nocase))`;

function warehouseFilters(url, session) {
  const branches = requestedBranches(url, session);
  const kind = url.searchParams.get('kind') || 'sales';
  const types = kind === 'all' ? [2, 9, 10] : [kind === 'purchases' ? 2 : kind === 'purchase-returns' ? 10 : 9];
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);
  const branchMarks = branches.map(() => '?').join(',');
  const typeMarks = types.map(() => '?').join(',');
  const mode = transferMode(url);
  const transferFilter = mode === 'include' ? '' : ` and not ${internalTransferSql()}`;
  return { branches, kind, types, from, to, mode, branchMarks, typeMarks, transferFilter };
}

async function warehouseBranches(env, session) {
  if (!owner(session)) {
    const row = await env.HISTORY_DB.prepare(
      'select branch,count(*) voucher_count,min(vch_date) first_date,max(vch_date) last_date from vouchers where branch=? group by branch'
    ).bind(branchCode(session)).all();
    return jsonResponse({ ok: true, branches: row.results || [] });
  }
  const rows = await env.HISTORY_DB.prepare(
    'select branch,count(*) voucher_count,min(vch_date) first_date,max(vch_date) last_date from vouchers group by branch order by branch'
  ).all();
  return jsonResponse({ ok: true, branches: rows.results || [] });
}

async function warehouseSummary(env, url, session) {
  const f = warehouseFilters(url, session);
  const bindings = [...f.branches, ...f.types, f.from, f.from, f.to, f.to];
  const vouchers = await env.HISTORY_DB.prepare(
    `select count(*) voucher_count,coalesce(sum(v.taxable_amount),0) before_tax,coalesce(sum(v.total_amount),0) total from vouchers v where v.branch in (${f.branchMarks}) and v.vch_type in (${f.typeMarks}) and coalesce(v.cancelled,0)=0 and coalesce(v.vch_cancelled,0)=0 and (?='' or v.vch_date>=?) and (?='' or v.vch_date<=?)${f.transferFilter}`
  ).bind(...bindings).first();
  const transfers = await env.HISTORY_DB.prepare(
    `select count(*) voucher_count,coalesce(sum(v.taxable_amount),0) before_tax,coalesce(sum(v.total_amount),0) total from vouchers v where v.branch in (${f.branchMarks}) and v.vch_type=9 and coalesce(v.cancelled,0)=0 and coalesce(v.vch_cancelled,0)=0 and (?='' or v.vch_date>=?) and (?='' or v.vch_date<=?) and ${internalTransferSql()}`
  ).bind(...f.branches, f.from, f.from, f.to, f.to).first();
  return jsonResponse({ ok: true,
    branches: f.branches, kind: f.kind, from: f.from, to: f.to, transfer_mode: f.mode,
    vouchers: { ...vouchers, gst: Number(vouchers?.total || 0) - Number(vouchers?.before_tax || 0) },
    transfers
  });
}

async function warehouseTransactions(env, url, session) {
  const f = warehouseFilters(url, session);
  const q = clean(url.searchParams.get('q'), 100);
  const like = `%${q.replaceAll('%', '').replaceAll('_', '')}%`;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 1000);
  const where = `v.branch in (${f.branchMarks}) and v.vch_type in (${f.typeMarks}) and coalesce(v.cancelled,0)=0 and coalesce(v.vch_cancelled,0)=0 and (?='' or v.vch_date>=?) and (?='' or v.vch_date<=?) and (?='' or v.vch_no like ? or v.party_name like ? or n.search_text like ? or exists(select 1 from voucher_items qi where qi.voucher_id=v.voucher_id and qi.item_name like ?))${f.transferFilter}`;
  const bindings = [...f.branches, ...f.types, f.from, f.from, f.to, f.to, q, like, like, like, like];
  const rows = await env.HISTORY_DB.prepare(
    `select v.voucher_id,v.branch,v.vch_type,v.vch_date,v.vch_no,v.series_code,v.party_name,v.taxable_amount,v.total_amount,n.narration1,n.narration2 from vouchers v left join voucher_narration n on n.voucher_id=v.voucher_id where ${where} order by v.vch_date desc,v.branch,v.vch_no desc limit ?`
  ).bind(...bindings, limit).all();
  return jsonResponse({ ok: true, rows: rows.results || [], branches: f.branches, kind: f.kind, transfer_mode: f.mode });
}

async function warehouseDetail(env, id, session) {
  const voucher = await env.HISTORY_DB.prepare('select * from vouchers where voucher_id=?').bind(id).first();
  if (!voucher) return jsonResponse({ error: 'Voucher not found.' }, 404);
  if (!owner(session) && clean(voucher.branch, 12).toUpperCase() !== branchCode(session)) {
    return jsonResponse({ error: 'This voucher belongs to another branch.' }, 403);
  }
  const [narration, items, ledger] = await Promise.all([
    env.HISTORY_DB.prepare('select * from voucher_narration where voucher_id=?').bind(id).first(),
    env.HISTORY_DB.prepare('select sr_no,item_code,item_name,unit_name,qty,unit_rate,taxable_amount,total_amount,short_narration from voucher_items where voucher_id=? order by sr_no').bind(id).all(),
    env.HISTORY_DB.prepare('select sr_no,ledger_code,ledger_name,value1,value2,value3,short_narration from voucher_ledger where voucher_id=? order by sr_no').bind(id).all()
  ]);
  return jsonResponse({ ok: true, voucher, narration, items: items.results || [], ledger: ledger.results || [] });
}

async function submitStockCount(request, env, session) {
  const body = await request.json().catch(() => null);
  const entries = Array.isArray(body?.entries) ? body.entries.slice(0, 1000) : [];
  if (!entries.length) return jsonResponse({ ok: false, error: 'Add at least one counted item.' }, 400);
  const submissionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = entries.map((entry) => {
    const quantity = Number(entry.quantity ?? entry.qty);
    const itemName = clean(entry.itemName ?? entry.n, 240);
    if (!itemName || !Number.isFinite(quantity) || quantity < 0) throw new Error('INVALID_STOCK_COUNT_ENTRY');
    return env.DB.prepare(
      `insert into stock_count_entries (id,submission_id,branch_id,staff_id,part_number,item_name,category,quantity,entry_source,created_at)
       values (?,?,?,?,?,?,?,?,?,?)`
    ).bind(crypto.randomUUID(), submissionId, session.branch_id, session.id, clean(entry.partNumber ?? entry.p, 80), itemName,
      clean(entry.category ?? entry.c, 40), quantity, clean(entry.source, 20) || 'manual', createdAt);
  });
  await env.DB.batch([
    env.DB.prepare(
      `insert into stock_count_submissions (id,branch_id,staff_id,entry_count,device_reference,created_at)
       values (?,?,?,?,?,?)`
    ).bind(submissionId, session.branch_id, session.id, statements.length, clean(body?.deviceReference, 100), createdAt),
    ...statements
  ]);
  console.log(JSON.stringify({ event: 'stock_count.submitted', submissionId, branch: session.branch, staffId: session.id, entries: statements.length }));
  return jsonResponse({ ok: true, submissionId, branch: session.branch, entryCount: statements.length, createdAt }, 201);
}

async function listStockCounts(env, url, session) {
  const branch = owner(session) ? clean(url.searchParams.get('branch'), 12).toUpperCase() : branchCode(session);
  const condition = branch ? 'where b.code=?' : '';
  const rows = await env.DB.prepare(
    `select s.id,b.code branch,s.staff_id,st.name staff_name,s.entry_count,s.device_reference,s.created_at
     from stock_count_submissions s join branches b on b.id=s.branch_id join staff st on st.id=s.staff_id
     ${condition} order by s.created_at desc limit 100`
  );
  const result = branch ? await rows.bind(branch).all() : await rows.all();
  return jsonResponse({ ok: true, submissions: result.results || [] });
}

async function invoiceBranch(env, requested, session) {
  const code = clean(requested, 12).toUpperCase();
  if (!owner(session) && code !== branchCode(session)) return null;
  return env.DB.prepare('select id,code from branches where code=? and active=1').bind(code).first();
}

async function saveMobileInvoice(request, env, session) {
  const body = await request.json().catch(() => null);
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 200) : [];
  const branch = await invoiceBranch(env, body?.branch, session);
  if (!branch) return jsonResponse({ ok: false, error: 'Branch access is not allowed.' }, 403);
  const id = clean(body?.id, 80);
  const bill = clean(body?.bill, 80);
  const date = clean(body?.date, 10);
  if (!id || !bill || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !lines.length) {
    return jsonResponse({ ok: false, error: 'Invoice id, number, date and item lines are required.' }, 400);
  }
  const existing = await env.DB.prepare('select id,branch_id,status,created_at from mobile_invoices where id=? or (branch_id=? and bill_no=?) limit 1')
    .bind(id, branch.id, bill).first();
  if (existing && existing.branch_id !== branch.id) return jsonResponse({ ok: false, error: 'Invoice identity belongs to another branch.' }, 409);
  if (existing && ['written_to_busy','cancelled'].includes(existing.status)) return jsonResponse({ ok: false, error: 'This invoice is locked.' }, 409);
  const now = new Date().toISOString();
  const totals = body?.totals || {};
  const taxable = Number(totals.taxable || 0), gst = Number(totals.gst || 0), total = Number(totals.total || 0);
  if (![taxable,gst,total].every(Number.isFinite)) return jsonResponse({ ok: false, error: 'Invoice totals are invalid.' }, 400);
  const normalized = lines.map((line, index) => {
    const qty = Number(line.qty), rate = Number(line.rate), tax = Number(line.gst);
    if (!clean(line.name,240) || ![qty,rate,tax].every(Number.isFinite) || qty <= 0 || rate < 0 || tax < 0) throw new Error('INVALID_MOBILE_INVOICE_LINE');
    const before = qty * rate, taxAmount = before * tax / 100;
    return { ...line, lineNo:index+1, qty, rate, gst:tax, before, taxAmount, total:before+taxAmount };
  });
  const invoiceId = existing?.id || id;
  const payload = { ...body, id:invoiceId, branch:branch.code, lines:normalized, cloud_saved_at:now };
  const createdAt = existing?.created_at || clean(body?.created,40) || now;
  const statements = [
    env.DB.prepare(`insert into mobile_invoices
      (id,branch_id,staff_id,bill_no,invoice_date,series,account_name,customer_name,customer_phone,customer_place,machine_model,serial_number,narration,other_amount,taxable_amount,gst_amount,total_amount,status,payload_json,created_at,updated_at)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict(id) do update set bill_no=excluded.bill_no,invoice_date=excluded.invoice_date,series=excluded.series,account_name=excluded.account_name,
      customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,customer_place=excluded.customer_place,machine_model=excluded.machine_model,
      serial_number=excluded.serial_number,narration=excluded.narration,other_amount=excluded.other_amount,taxable_amount=excluded.taxable_amount,
      gst_amount=excluded.gst_amount,total_amount=excluded.total_amount,status='pending_busy_sync',payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
      .bind(invoiceId,branch.id,session.id,bill,date,clean(body?.series,40)||'MOBILE SALES',clean(body?.account,80)||'Cash',clean(body?.customer?.name,160),clean(body?.customer?.phone,30),clean(body?.customer?.place,160),clean(body?.customer?.machine,160),clean(body?.customer?.serial,100),clean(body?.note,1000),Number(body?.other||0),taxable,gst,total,'pending_busy_sync',JSON.stringify(payload),createdAt,now),
    env.DB.prepare('delete from mobile_invoice_lines where invoice_id=?').bind(invoiceId),
    ...normalized.map((line) => env.DB.prepare(`insert into mobile_invoice_lines
      (id,invoice_id,line_no,item_code,item_name,item_group,quantity,unit_name,unit_rate,gst_rate,taxable_amount,gst_amount,total_amount)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),invoiceId,line.lineNo,clean(line.alias,100),clean(line.name,240),clean(line.group,100),line.qty,clean(line.unit,30)||'Pcs',line.rate,line.gst,line.before,line.taxAmount,line.total))
  ];
  await env.DB.batch(statements);
  return jsonResponse({ ok:true, invoiceId, bill, branch:branch.code, status:'pending_busy_sync', savedAt:now }, existing ? 200 : 201);
}

async function listMobileInvoices(env, url, session) {
  const branch = await invoiceBranch(env, url.searchParams.get('branch'), session);
  if (!branch) return jsonResponse({ ok:false, error:'Branch access is not allowed.' },403);
  const date = clean(url.searchParams.get('date'),10);
  const result = await env.DB.prepare(`select payload_json,status,created_at,updated_at,exported_at from mobile_invoices
    where branch_id=? and (?='' or invoice_date=?) order by invoice_date,created_at`).bind(branch.id,date,date).all();
  const invoices = (result.results||[]).map(row => ({...JSON.parse(row.payload_json),status:row.status,cloud_created_at:row.created_at,cloud_updated_at:row.updated_at,exported_at:row.exported_at}));
  return jsonResponse({ok:true,branch:branch.code,date,invoices});
}

export async function routeIntegratedTools(request, env, url, session) {
  if (url.pathname === '/api/warehouse/branches' && request.method === 'GET') return warehouseBranches(env, session);
  if (url.pathname === '/api/warehouse/summary' && request.method === 'GET') return warehouseSummary(env, url, session);
  if (url.pathname === '/api/warehouse/transactions' && request.method === 'GET') return warehouseTransactions(env, url, session);
  const detail = url.pathname.match(/^\/api\/warehouse\/transaction\/([^/]+)$/);
  if (detail && request.method === 'GET') return warehouseDetail(env, decodeURIComponent(detail[1]), session);
  if (url.pathname === '/api/stock-count/submissions' && request.method === 'POST') return submitStockCount(request, env, session);
  if (url.pathname === '/api/stock-count/submissions' && request.method === 'GET') return listStockCounts(env, url, session);
  if (url.pathname === '/api/mobile-invoices' && request.method === 'POST') return saveMobileInvoice(request, env, session);
  if (url.pathname === '/api/mobile-invoices' && request.method === 'GET') return listMobileInvoices(env, url, session);
  return null;
}
