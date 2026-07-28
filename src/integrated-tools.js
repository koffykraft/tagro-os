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

export async function routeIntegratedTools(request, env, url, session) {
  if (url.pathname === '/api/warehouse/branches' && request.method === 'GET') return warehouseBranches(env, session);
  if (url.pathname === '/api/warehouse/summary' && request.method === 'GET') return warehouseSummary(env, url, session);
  if (url.pathname === '/api/warehouse/transactions' && request.method === 'GET') return warehouseTransactions(env, url, session);
  const detail = url.pathname.match(/^\/api\/warehouse\/transaction\/([^/]+)$/);
  if (detail && request.method === 'GET') return warehouseDetail(env, decodeURIComponent(detail[1]), session);
  if (url.pathname === '/api/stock-count/submissions' && request.method === 'POST') return submitStockCount(request, env, session);
  if (url.pathname === '/api/stock-count/submissions' && request.method === 'GET') return listStockCounts(env, url, session);
  return null;
}
