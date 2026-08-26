// Mobile point-of-sale billing: create/list/read counter sales (mobile_sales_invoices
// + mobile_sales_invoice_lines), queued into busy_write_queue for BUSY write-back.
//
// Scope for this first version, deliberately: create a sale, list a branch's recent
// sales, fetch one sale for a receipt/reprint view. No edit or void/cancel yet --
// voiding a sale correctly needs real accounting semantics (credit note vs. hard
// delete, whether tax already reported, etc.) that shouldn't be guessed at; flagged
// as a fast-follow if it's needed rather than built speculatively here.
//
// Money handling: every line's price and GST rate is re-read on the server, never
// trusted from the client -- the client only supplies which item and how many. A
// line either resolves against the local `catalog_items` table (real id) or, for an
// `official:<partNumber>` id (a part not yet imported into catalog_items), directly
// against the TAGRO_DATA KV master price list -- see resolvePartForSale(). Tax split (CGST+SGST vs IGST) is inferred from the customer's GSTIN
// state code versus Kerala's ("32"): TAGRO's branches are all in Kerala today, so any
// sale with no GSTIN or a Kerala GSTIN is treated as intra-state (CGST+SGST); any
// other state's GSTIN is treated as inter-state (IGST). If TAGRO ever opens a branch
// outside Kerala this assumption needs revisiting -- it is not read from `branches`
// dynamically because that table's `state` column is a free-text name, not a GST
// state code, and every existing branch is Kerala anyway.

const PAYMENT_MODES = new Set(['cash', 'upi', 'card', 'bank', 'credit', 'mixed']);
const PAYMENT_STATUS_FILTERS = new Set(['queued', 'processing', 'written', 'failed', 'cancelled']);
const KERALA_GST_STATE_CODE = '32';
// Standard 15-char GSTIN: 2-digit state code, 10-char PAN (5 letters, 4 digits, 1
// letter), 1-char entity number, literal 'Z', 1-char checksum. This checks shape
// only, not the actual checksum digit (verifying that requires the full GSTIN
// checksum algorithm, not just a regex) -- good enough to reject typos and garbage
// without needing a real GST-registry lookup.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const VALID_GST_STATE_CODES = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '97'
]);

export async function listMobileSales(env, session, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 300);
  let branchId = session.branch_id;
  if (hasRole(session, 'owner')) {
    const requested = cleanText(url.searchParams.get('branchId'), 80);
    if (requested === 'all') branchId = null;
    else if (requested) branchId = requested;
  }
  const conditions = [];
  const values = [];
  if (branchId) { conditions.push('msi.branch_id = ?'); values.push(branchId); }
  // 'date' is kept for existing callers (e.g. an exact single business date); 'from'/'to'
  // are additive for range queries (the Transactions page's date-range filter).
  const businessDate = cleanText(url.searchParams.get('date'), 10);
  if (businessDate) { conditions.push('msi.business_date = ?'); values.push(businessDate); }
  const from = cleanText(url.searchParams.get('from'), 10);
  if (from) { conditions.push('msi.business_date >= ?'); values.push(from); }
  const to = cleanText(url.searchParams.get('to'), 10);
  if (to) { conditions.push('msi.business_date <= ?'); values.push(to); }
  const status = cleanText(url.searchParams.get('status'), 20).toLowerCase();
  if (status && PAYMENT_STATUS_FILTERS.has(status)) { conditions.push('msi.status = ?'); values.push(status); }
  const q = cleanText(url.searchParams.get('q'), 120);
  if (q) {
    conditions.push('(msi.party_name LIKE ? OR msi.busy_voucher_number LIKE ? OR msi.id LIKE ?)');
    const like = '%' + q + '%';
    values.push(like, like, like);
  }
  values.push(limit);
  const where = conditions.length ? ('WHERE ' + conditions.join(' AND ')) : '';
  const result = await env.DB.prepare(
    'SELECT msi.id, msi.branch_id, b.code AS branch_code, b.name AS branch_name, ' +
    'msi.business_date, msi.party_name, msi.party_phone, msi.payment_mode, ' +
    'msi.taxable_total, msi.cgst_total, msi.sgst_total, msi.igst_total, ' +
    'msi.round_off, msi.grand_total, msi.status, msi.busy_voucher_number, msi.busy_series, ' +
    'msi.failure_reason, msi.created_at, msi.processed_at, s.name AS created_by_name, ' +
    '(SELECT COUNT(*) FROM mobile_sales_invoice_lines l WHERE l.invoice_id = msi.id) AS line_count ' +
    'FROM mobile_sales_invoices msi ' +
    'JOIN branches b ON b.id = msi.branch_id ' +
    'JOIN staff s ON s.id = msi.created_by ' +
    where + ' ORDER BY msi.business_date DESC, msi.created_at DESC LIMIT ?'
  ).bind(...values).all();
  return json({ ok: true, invoices: result.results || [] });
}

export async function getMobileSale(env, session, id) {
  const invoice = await loadInvoice(env, cleanText(id, 100));
  if (!invoice) return json({ ok: false, error: 'Sale not found.' }, 404);
  if (!hasRole(session, 'owner') && invoice.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This sale belongs to another branch.' }, 403);
  }
  return json({ ok: true, invoice });
}

export async function createMobileSale(request, env, session) {
  const body = await readJsonBody(request);

  const clientRequestId = cleanText(body.clientRequestId, 100);
  if (!clientRequestId) return json({ ok: false, error: 'Missing client request id.' }, 400);

  const branch = await env.DB.prepare(
    'SELECT id, code, name FROM branches WHERE id = ? AND active = 1'
  ).bind(session.branch_id).first();
  if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);

  // Idempotency is scoped to the requesting branch -- a client_request_id is only ever
  // generated by one device/session, so a collision belonging to a different branch is
  // either a spoofed/replayed id or an extraordinarily unlikely UUID clash, and must
  // never leak that other branch's invoice back to this request.
  const existing = await env.DB.prepare(
    'SELECT id FROM mobile_sales_invoices WHERE client_request_id = ? AND branch_id = ?'
  ).bind(clientRequestId, branch.id).first();
  if (existing) {
    return json({ ok: true, invoice: await loadInvoice(env, existing.id), duplicate: true });
  }

  const paymentMode = cleanText(body.paymentMode, 20).toLowerCase();
  if (!PAYMENT_MODES.has(paymentMode)) return json({ ok: false, error: 'Select a valid payment mode.' }, 400);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) return json({ ok: false, error: 'Add at least one item.' }, 400);
  if (rawLines.length > 200) return json({ ok: false, error: 'Too many lines in one sale.' }, 400);

  const partyName = cleanText(body.partyName, 200) || 'Cash sale';
  const partyPhone = cleanText(body.partyPhone, 20);
  const partyGstinRaw = cleanText(body.partyGstin, 20).toUpperCase();
  if (partyGstinRaw && (!GSTIN_PATTERN.test(partyGstinRaw) || !VALID_GST_STATE_CODES.has(partyGstinRaw.slice(0, 2)))) {
    return json({ ok: false, error: 'GSTIN format looks invalid -- double-check it or leave it blank.' }, 400);
  }
  const partyGstin = partyGstinRaw;
  const narration = cleanText(body.narration, 500);
  const suppliedDate = cleanText(body.businessDate, 10);
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate) ? suppliedDate : new Date().toISOString().slice(0, 10);

  const interState = Boolean(partyGstin) && partyGstin.slice(0, 2) !== KERALA_GST_STATE_CODE;
  const lineItems = [];
  for (const raw of rawLines) {
    const catalogItemId = cleanText(raw && raw.catalogItemId, 100);
    const quantity = Number(raw && raw.quantity);
    if (!catalogItemId || !Number.isFinite(quantity) || quantity <= 0) {
      return json({ ok: false, error: 'Each line needs a valid item and quantity.' }, 400);
    }
    const resolved = await resolvePartForSale(env, catalogItemId);
    if (!resolved) return json({ ok: false, error: 'Item not found or not priced for sale: ' + catalogItemId }, 400);
    const unitPrice = Number(resolved.unitPrice) || 0;
    const gstRate = Number(resolved.gstRate) || 0;
    const taxableAmount = round2(unitPrice * quantity);
    const lineTax = round2(taxableAmount * gstRate / 100);
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
    if (interState) {
      igstAmount = lineTax;
    } else {
      cgstAmount = round2(lineTax / 2);
      sgstAmount = round2(lineTax - cgstAmount);
    }
    const lineTotal = round2(taxableAmount + cgstAmount + sgstAmount + igstAmount);
    lineItems.push({
      partNumber: resolved.partNumber, itemName: resolved.itemName, source: resolved.source,
      gstRate, quantity, unitPrice, taxableAmount, cgstAmount, sgstAmount, igstAmount, lineTotal
    });
  }

  const taxableTotal = round2(lineItems.reduce((sum, line) => sum + line.taxableAmount, 0));
  const cgstTotal = round2(lineItems.reduce((sum, line) => sum + line.cgstAmount, 0));
  const sgstTotal = round2(lineItems.reduce((sum, line) => sum + line.sgstAmount, 0));
  const igstTotal = round2(lineItems.reduce((sum, line) => sum + line.igstAmount, 0));
  const rawGrandTotal = taxableTotal + cgstTotal + sgstTotal + igstTotal;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = round2(grandTotal - rawGrandTotal);

  const now = new Date().toISOString();
  const id = makeId('invoice');
  const statements = [
    env.DB.prepare(
      'INSERT INTO mobile_sales_invoices ' +
      '(id, client_request_id, branch_id, created_by, business_date, party_name, party_phone, ' +
      'party_gstin, narration, payment_mode, taxable_total, cgst_total, sgst_total, igst_total, ' +
      "round_off, grand_total, status, busy_series, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'CLOUD', ?)"
    ).bind(
      id, clientRequestId, branch.id, session.id, businessDate, partyName, partyPhone || null,
      partyGstin || null, narration || null, paymentMode, taxableTotal, cgstTotal, sgstTotal, igstTotal,
      roundOff, grandTotal, now
    )
  ];
  lineItems.forEach((line, index) => {
    statements.push(env.DB.prepare(
      'INSERT INTO mobile_sales_invoice_lines ' +
      '(id, invoice_id, line_number, item_name, part_number, quantity, unit, unit_rate_before_tax, ' +
      'discount, taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_total, source) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      makeId('invline'), id, index + 1, line.itemName, line.partNumber, line.quantity, 'Nos',
      line.unitPrice, line.taxableAmount, line.gstRate, line.cgstAmount, line.sgstAmount, line.igstAmount,
      line.lineTotal, line.source
    ));
  });

  const queuePayload = {
    invoiceId: id, branchCode: branch.code, businessDate, partyName, partyPhone, partyGstin,
    paymentMode, taxableTotal, cgstTotal, sgstTotal, igstTotal, roundOff, grandTotal,
    lines: lineItems.map(line => ({
      partNumber: line.partNumber, itemName: line.itemName, source: line.source,
      gstRate: line.gstRate, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal
    }))
  };
  const payloadJson = JSON.stringify(queuePayload);
  statements.push(env.DB.prepare(
    'INSERT INTO busy_write_queue ' +
    '(id, invoice_id, branch_id, payload_json, payload_sha256, status, attempt_count, created_at, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)"
  ).bind(makeId('bwq'), id, branch.id, payloadJson, await sha256(payloadJson), now, now));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const message = String(error && error.message || error);
    if (message.indexOf('UNIQUE') !== -1 && message.indexOf('client_request_id') !== -1) {
      const raced = await env.DB.prepare(
        'SELECT id FROM mobile_sales_invoices WHERE client_request_id = ? AND branch_id = ?'
      ).bind(clientRequestId, branch.id).first();
      if (raced) return json({ ok: true, invoice: await loadInvoice(env, raced.id), duplicate: true });
      // client_request_id is globally unique in the schema (not scoped per branch), so a
      // collision that isn't this branch's own race belongs to a different branch. Never
      // load or leak that invoice -- return a clean conflict instead of an unhandled 500.
      return json({ ok: false, error: 'This request id was already used for another sale. Retry with a new id.' }, 409);
    }
    throw error;
  }

  console.log(JSON.stringify({
    event: 'mobile_sale.created', invoiceId: id, branchId: branch.id, grandTotal,
    lineCount: lineItems.length, staffId: session.id
  }));

  return json({ ok: true, invoice: await loadInvoice(env, id) }, 201);
}

async function loadInvoice(env, id) {
  if (!id) return null;
  const invoice = await env.DB.prepare(
    'SELECT msi.*, b.code AS branch_code, b.name AS branch_name, s.name AS created_by_name ' +
    'FROM mobile_sales_invoices msi ' +
    'JOIN branches b ON b.id = msi.branch_id ' +
    'LEFT JOIN staff s ON s.id = msi.created_by ' +
    'WHERE msi.id = ?'
  ).bind(id).first();
  if (!invoice) return null;
  const lines = await env.DB.prepare(
    'SELECT id, line_number, part_number, item_name, quantity, unit, unit_rate_before_tax, discount, ' +
    'taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_total, source ' +
    'FROM mobile_sales_invoice_lines WHERE invoice_id = ? ORDER BY line_number'
  ).bind(id).all();
  return Object.assign({}, invoice, { lines: lines.results || [] });
}

async function resolvePartForSale(env, catalogItemId) {
  if (catalogItemId.indexOf('official:') === 0) {
    if (!env.TAGRO_DATA) return null;
    const wanted = normalizePartNumber(catalogItemId.slice('official:'.length));
    if (!wanted) return null;
    const master = await env.TAGRO_DATA.get('parts:master', { type: 'json' });
    if (!Array.isArray(master)) return null;
    for (const part of master) {
      const rawPartNumber = cleanText(part && (part.no || part.partNumber || part.id), 100).toUpperCase();
      if (normalizePartNumber(rawPartNumber) !== wanted) continue;
      const tagroName = cleanText(part && (part.tagroName || part.name), 240);
      const stihlName = cleanText(part && part.stihlName, 240);
      const itemName = tagroName || stihlName;
      const retailPrice = optionalNumber(part && (part.retail != null ? part.retail : part.price));
      if (!itemName || !retailPrice || retailPrice <= 0) return null;
      return {
        source: 'tagro_parts_master', partNumber: rawPartNumber, itemName,
        gstRate: optionalNumber(part && part.gst) || 0, unitPrice: retailPrice
      };
    }
    return null;
  }
  // 'service:<id>' lines are labour/service charges from service_job_types -- a
  // separate table from catalog_items (Service Rates admin, not the parts catalog).
  // Added for Repair Bill mode, where a bill can include a labour line alongside
  // parts. Same resolved shape as a normal part: no partNumber (labour has none).
  if (catalogItemId.indexOf('service:') === 0) {
    const serviceId = cleanText(catalogItemId.slice('service:'.length), 100);
    if (!serviceId) return null;
    const serviceType = await env.DB.prepare(
      'SELECT id, name, gst_rate, default_price FROM service_job_types WHERE id = ? AND active = 1'
    ).bind(serviceId).first();
    if (!serviceType) return null;
    const unitPrice = Number(serviceType.default_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
    return {
      source: 'service_job_types', partNumber: null, itemName: serviceType.name,
      gstRate: Number(serviceType.gst_rate) || 0, unitPrice
    };
  }
  const item = await env.DB.prepare(
    'SELECT id, part_number, item_name, gst_rate, retail_price FROM catalog_items WHERE id = ? AND active = 1'
  ).bind(catalogItemId).first();
  if (!item) return null;
  const unitPrice = Number(item.retail_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return {
    source: 'catalog_items', partNumber: item.part_number, itemName: item.item_name,
    gstRate: Number(item.gst_rate) || 0, unitPrice
  };
}

function normalizePartNumber(value) {
  return cleanText(value, 100).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function optionalNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function cleanText(value, max) {
  var text = String(value || '').trim();
  var out = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code >= 32 && code !== 127) out += text[i];
  }
  return out.slice(0, max);
}

function makeId(prefix) {
  return prefix + '_' + crypto.randomUUID();
}

function hasRole(session) {
  var roles = Array.prototype.slice.call(arguments, 1);
  return roles.indexOf(String(session && session.role || '').toLowerCase()) !== -1;
}

async function readJsonBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('JSON body required');
  return request.json();
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  var bytes = new Uint8Array(digest);
  var hexStr = '';
  for (var i = 0; i < bytes.length; i++) hexStr += bytes[i].toString(16).padStart(2, '0');
  return hexStr;
}
