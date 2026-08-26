// Dedicated verification suite for src/mobile-sales.js, built against a REAL
// SQLite database created from the repo's own migrations/*.sql (including
// 0013_mobile_sales_busy_writeback.sql) -- not mocks, not stubbed-out column
// names. Run with: node scripts/verify-mobile-sales.mjs
//
// This exercises createMobileSale/getMobileSale/listMobileSales directly
// against a D1-shaped adapter over node:sqlite, so it catches exactly the
// class of bug that slipped through in production: a mismatch between the
// code's assumed schema and the real one.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mobileSales from '../src/mobile-sales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failures = 0;
let passed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; return; }
  failures++;
  console.error('FAIL: ' + label + (detail ? ' -- ' + detail : ''));
}
async function expectThrowOrError(label, fn) {
  try {
    const result = await fn();
    if (result && result.status >= 400) { passed++; return result; }
    failures++;
    console.error('FAIL: ' + label + ' -- expected an error response, got status ' + (result && result.status));
    return result;
  } catch (e) {
    passed++;
    return null;
  }
}

// ---------- D1-shaped adapter over node:sqlite ----------
function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const files = fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(root, 'migrations', f), 'utf8');
    sqlite.exec(sql);
  }

  function wrapRow(row) {
    if (!row) return row;
    // node:sqlite returns [Object: null prototype] rows; D1 returns plain objects.
    return Object.assign({}, row);
  }

  function prepare(sql) {
    return {
      bind(...args) {
        return {
          _sql: sql, _args: args,
          first() {
            const stmt = sqlite.prepare(sql);
            return wrapRow(stmt.get(...args)) || null;
          },
          all() {
            const stmt = sqlite.prepare(sql);
            return { results: stmt.all(...args).map(wrapRow) };
          },
          run() {
            const stmt = sqlite.prepare(sql);
            const info = stmt.run(...args);
            return { success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
          }
        };
      }
    };
  }

  async function batch(boundStatements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const stmt of boundStatements) {
        const s = sqlite.prepare(stmt._sql);
        results.push(s.run(...stmt._args));
      }
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  return { prepare, batch, _raw: sqlite };
}

// ---------- fixtures ----------
function seedFixtures(DB) {
  const now = '2026-08-26T00:00:00.000Z';
  DB.prepare("INSERT INTO branches (id, code, name, city, state, phone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind('branch_a', 'BR-A', 'Branch A', 'Kochi', 'Kerala', '9000000001', now, now).run();
  DB.prepare("INSERT INTO branches (id, code, name, city, state, phone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind('branch_b', 'BR-B', 'Branch B', 'Kochi', 'Kerala', '9000000002', now, now).run();
  DB.prepare("INSERT INTO staff (id, name, role, branch_id, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
    .bind('staff_a', 'Staff A', 'staff', 'branch_a', 'x', now, now).run();
  DB.prepare("INSERT INTO staff (id, name, role, branch_id, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
    .bind('staff_b', 'Staff B', 'staff', 'branch_b', 'x', now, now).run();
  DB.prepare("INSERT INTO staff (id, name, role, branch_id, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
    .bind('staff_owner', 'Owner', 'owner', 'branch_a', 'x', now, now).run();

  const items = [
    ['item_priced_18', 'PN-18', 'Widget 18%', 'part', '84679100', 18, 100, 130],
    ['item_priced_0', 'PN-0', 'Axe 0%', 'part', '82015000', 0, 200, 220],
    ['item_zero_price', 'PN-ZERO', 'Broken Price Item', 'part', '84679100', 18, 0, 0],
    ['item_null_price', 'PN-NULL', 'Null Price Item', 'part', '84679100', 18, null, null]
  ];
  for (const [id, pn, name, type, hsn, gst, retail, mrp] of items) {
    DB.prepare(
      `INSERT INTO catalog_items (id, part_number, item_name, item_type, hsn_sac, gst_rate, retail_price, mrp, data_source, review_required, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, 1, ?, ?)`
    ).bind(id, pn, name, type, hsn, gst, retail, mrp, now, now).run();
  }
}

function fakeEnv(DB) {
  const master = [
    { no: 'OFF-1', tagroName: 'Official Part', stihlName: 'OFFPART', hsn: '84679100', gst: 18, retail: 55, mrp: 65 }
  ];
  return {
    DB,
    TAGRO_DATA: { async get(key, opts) { return key === 'parts:master' ? master : null; } }
  };
}

function req(body) {
  return new Request('https://example.test/api/mobile-sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function jsonOf(response) {
  return response.json();
}

function baseSale(overrides) {
  return Object.assign({
    clientRequestId: 'crid-' + Math.random().toString(36).slice(2),
    paymentMode: 'cash',
    partyName: 'Cash sale',
    lines: [{ catalogItemId: 'item_priced_18', quantity: 2 }]
  }, overrides);
}

async function run() {
  const DB = makeDb();
  seedFixtures(DB);
  const env = fakeEnv(DB);
  const sessionA = { id: 'staff_a', branch_id: 'branch_a', role: 'staff' };
  const sessionB = { id: 'staff_b', branch_id: 'branch_b', role: 'staff' };
  const sessionOwner = { id: 'staff_owner', branch_id: 'branch_a', role: 'owner' };

  // 1. Basic insert against the real schema, single line
  {
    const res = await mobileSales.createMobileSale(req(baseSale()), env, sessionA);
    const body = await jsonOf(res);
    check('basic sale creates ok', body.ok === true, JSON.stringify(body));
    check('taxable total correct (100*2)', body.invoice && body.invoice.taxable_total === 200, body.invoice && body.invoice.taxable_total);
    check('cgst correct (18%/2 of 200)', body.invoice && body.invoice.cgst_total === 18, body.invoice && body.invoice.cgst_total);
    check('sgst correct', body.invoice && body.invoice.sgst_total === 18, body.invoice && body.invoice.sgst_total);
    check('grand total correct (236)', body.invoice && body.invoice.grand_total === 236, body.invoice && body.invoice.grand_total);
    check('line uses real column names', body.invoice && body.invoice.lines[0] && 'unit_rate_before_tax' in body.invoice.lines[0], body.invoice && JSON.stringify(body.invoice.lines));
    check('line does not use old fake columns', body.invoice && !('unit_price' in (body.invoice.lines[0] || {})));
    check('line source tagged catalog_items', body.invoice && body.invoice.lines[0].source === 'catalog_items', body.invoice && body.invoice.lines[0].source);
  }

  // 2. Multiple lines, sequential line_number
  {
    const res = await mobileSales.createMobileSale(req(baseSale({
      lines: [{ catalogItemId: 'item_priced_18', quantity: 1 }, { catalogItemId: 'item_priced_0', quantity: 3 }]
    })), env, sessionA);
    const body = await jsonOf(res);
    check('multi-line sale ok', body.ok === true);
    check('two lines present', body.invoice && body.invoice.lines.length === 2);
    check('line numbers sequential', body.invoice && body.invoice.lines[0].line_number === 1 && body.invoice.lines[1].line_number === 2);
    check('0% GST line has zero tax', body.invoice && body.invoice.lines[1].cgst_amount === 0 && body.invoice.lines[1].sgst_amount === 0);
  }

  // 3. Server-side repricing: client-forged price/quantity fields on the line are ignored
  {
    const res = await mobileSales.createMobileSale(req(baseSale({
      lines: [{ catalogItemId: 'item_priced_18', quantity: 1, unitPrice: 1, retail_price: 1, price: 1 }]
    })), env, sessionA);
    const body = await jsonOf(res);
    check('forged client price ignored, real price used', body.ok && body.invoice.taxable_total === 100, body.ok && body.invoice.taxable_total);
  }

  // 4. Zero-priced local catalog item rejected
  await expectThrowOrError('zero-priced catalog item rejected', () =>
    mobileSales.createMobileSale(req(baseSale({ lines: [{ catalogItemId: 'item_zero_price', quantity: 1 }] })), env, sessionA));

  // 4b. Null-priced local catalog item rejected
  await expectThrowOrError('null-priced catalog item rejected', () =>
    mobileSales.createMobileSale(req(baseSale({ lines: [{ catalogItemId: 'item_null_price', quantity: 1 }] })), env, sessionA));

  // 5. GST math across rates
  {
    const rates = [
      ['item_priced_18', 18],
      ['item_priced_0', 0]
    ];
    for (const [id, rate] of rates) {
      const res = await mobileSales.createMobileSale(req(baseSale({ lines: [{ catalogItemId: id, quantity: 1 }] })), env, sessionA);
      const body = await jsonOf(res);
      const line = body.invoice.lines[0];
      const expectedTax = Math.round(line.taxable_amount * rate / 100 * 100) / 100;
      const actualTax = Math.round((line.cgst_amount + line.sgst_amount + line.igst_amount) * 100) / 100;
      check(`GST math correct for rate ${rate}%`, Math.abs(actualTax - expectedTax) < 0.02, `expected ~${expectedTax}, got ${actualTax}`);
    }
  }

  // 6. Kerala GSTIN -> CGST+SGST, other-state GSTIN -> IGST
  {
    const resKerala = await mobileSales.createMobileSale(req(baseSale({ partyGstin: '32AAAAA0000A1Z5' })), env, sessionA);
    const bodyKerala = await jsonOf(resKerala);
    check('Kerala GSTIN uses CGST+SGST', bodyKerala.ok && bodyKerala.invoice.igst_total === 0 && bodyKerala.invoice.cgst_total > 0, JSON.stringify(bodyKerala));

    const resOther = await mobileSales.createMobileSale(req(baseSale({ partyGstin: '27AAAAA0000A1Z5' })), env, sessionA);
    const bodyOther = await jsonOf(resOther);
    check('Maharashtra GSTIN uses IGST', bodyOther.ok && bodyOther.invoice.cgst_total === 0 && bodyOther.invoice.igst_total > 0, JSON.stringify(bodyOther));

    const resNone = await mobileSales.createMobileSale(req(baseSale({})), env, sessionA);
    const bodyNone = await jsonOf(resNone);
    check('missing GSTIN uses CGST+SGST', bodyNone.ok && bodyNone.invoice.igst_total === 0, JSON.stringify(bodyNone));
  }

  // 7. Rounding
  {
    // price 100 * qty 1, 18% => 118.00 exactly, round_off should be 0
    const res = await mobileSales.createMobileSale(req(baseSale()), env, sessionA);
    const body = await jsonOf(res);
    check('round_off is a number and consistent', typeof body.invoice.round_off === 'number');
  }

  // 8. Invalid GSTIN rejected
  await expectThrowOrError('malformed GSTIN rejected', () =>
    mobileSales.createMobileSale(req(baseSale({ partyGstin: 'NOT-A-GSTIN' })), env, sessionA));
  await expectThrowOrError('GSTIN with bad state code rejected', () =>
    mobileSales.createMobileSale(req(baseSale({ partyGstin: '99AAAAA0000A1Z5' })), env, sessionA));

  // 9. Branch isolation: client_request_id is globally UNIQUE at the schema level (not
  // scoped per branch), so two branches genuinely cannot share one -- the correct,
  // safe behavior is a clean 409 for the second branch, and critically: branch A's
  // invoice must never be returned to branch B's request.
  {
    const sharedId = 'shared-crid-' + Math.random().toString(36).slice(2);
    const resA = await mobileSales.createMobileSale(req(baseSale({ clientRequestId: sharedId })), env, sessionA);
    const bodyA = await jsonOf(resA);
    const resB = await mobileSales.createMobileSale(req(baseSale({ clientRequestId: sharedId })), env, sessionB);
    const bodyB = await jsonOf(resB);
    check('branch A sale created', bodyA.ok === true);
    check('branch B collision returns a clean conflict, not a 500 or a leaked invoice',
      resB.status === 409 && bodyB.ok === false, JSON.stringify({ status: resB.status, bodyB }));
    check('branch B response never contains branch A\'s invoice data', !bodyB.invoice);
  }

  // 10. Owner cross-branch read vs staff same-branch-only read
  {
    const created = await jsonOf(await mobileSales.createMobileSale(req(baseSale()), env, sessionB));
    const invoiceId = created.invoice.id;
    const ownerRead = await mobileSales.getMobileSale(env, sessionOwner, invoiceId);
    const ownerBody = await jsonOf(ownerRead);
    check('owner can read another branch\'s sale', ownerBody.ok === true, JSON.stringify(ownerBody));

    const staffRead = await mobileSales.getMobileSale(env, sessionA, invoiceId);
    check('non-owner blocked from another branch\'s sale', staffRead.status === 403, staffRead.status);
  }

  // 11. Idempotent retry: same branch + same client_request_id returns the SAME invoice, no duplicate row
  {
    const crid = 'idem-' + Math.random().toString(36).slice(2);
    const first = await jsonOf(await mobileSales.createMobileSale(req(baseSale({ clientRequestId: crid })), env, sessionA));
    const second = await jsonOf(await mobileSales.createMobileSale(req(baseSale({ clientRequestId: crid })), env, sessionA));
    check('retry returns ok', second.ok === true);
    check('retry marked duplicate', second.duplicate === true);
    check('retry returns same invoice id', first.invoice.id === second.invoice.id);
    const countRow = env.DB.prepare('SELECT COUNT(*) AS c FROM mobile_sales_invoices WHERE client_request_id = ?').bind(crid).first();
    check('only one row exists for this client_request_id', countRow.c === 1, countRow.c);
  }

  // 12. Concurrent duplicate race: pre-existing row with same client_request_id+branch causes
  // a UNIQUE violation on insert; must resolve to the existing invoice, not throw.
  {
    const crid = 'race-' + Math.random().toString(36).slice(2);
    // Insert a colliding invoice directly, simulating a racing request that won.
    const now = new Date(0).toISOString();
    DB.prepare(
      `INSERT INTO mobile_sales_invoices
        (id, client_request_id, branch_id, created_by, business_date, party_name, payment_mode,
         taxable_total, cgst_total, sgst_total, igst_total, round_off, grand_total, status, busy_series, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'CLOUD', ?)`
    ).bind('invoice_raced', crid, 'branch_a', 'staff_a', '2026-08-26', 'Raced Sale', 'cash', 100, 9, 9, 0, 0, 118, now).run();

    const res = await mobileSales.createMobileSale(req(baseSale({ clientRequestId: crid })), env, sessionA);
    const body = await jsonOf(res);
    check('race resolves to ok (not a thrown 500)', body.ok === true, JSON.stringify(body));
    check('race resolves to the pre-existing invoice', body.invoice && body.invoice.id === 'invoice_raced', body.invoice && body.invoice.id);
    const countRow = env.DB.prepare('SELECT COUNT(*) AS c FROM mobile_sales_invoices WHERE client_request_id = ?').bind(crid).first();
    check('race did not create a second row', countRow.c === 1, countRow.c);
  }

  // 13. busy_write_queue row created for a fresh sale, linked correctly
  {
    const created = await jsonOf(await mobileSales.createMobileSale(req(baseSale()), env, sessionA));
    const q = env.DB.prepare('SELECT * FROM busy_write_queue WHERE invoice_id = ?').bind(created.invoice.id).first();
    check('queue row exists for new sale', Boolean(q), created.invoice.id);
    check('queue row starts pending', q && q.status === 'pending', q && q.status);
    check('queue row branch matches invoice branch', q && q.branch_id === created.invoice.branch_id);
  }

  // 14. Official (KV master list) item can be sold and is correctly tagged
  {
    const res = await mobileSales.createMobileSale(req(baseSale({ lines: [{ catalogItemId: 'official:OFF-1', quantity: 1 }] })), env, sessionA);
    const body = await jsonOf(res);
    check('official/master-list item sells ok', body.ok === true, JSON.stringify(body));
    check('official item tagged tagro_parts_master', body.ok && body.invoice.lines[0].source === 'tagro_parts_master', body.ok && body.invoice.lines[0].source);
    check('official item price from master list (55)', body.ok && body.invoice.lines[0].unit_rate_before_tax === 55, body.ok && body.invoice.lines[0].unit_rate_before_tax);
  }

  // 15. Documented current behavior: same idempotency key, DIFFERENT payload -> still
  // returns the original invoice (no payload-hash comparison implemented yet). This is
  // a known, explicitly-flagged gap, not a silent one -- see diary.
  {
    const crid = 'diffpayload-' + Math.random().toString(36).slice(2);
    const first = await jsonOf(await mobileSales.createMobileSale(req(baseSale({ clientRequestId: crid, lines: [{ catalogItemId: 'item_priced_18', quantity: 1 }] })), env, sessionA));
    const second = await jsonOf(await mobileSales.createMobileSale(req(baseSale({ clientRequestId: crid, lines: [{ catalogItemId: 'item_priced_0', quantity: 5 }] })), env, sessionA));
    check('documented: differing payload with same key returns original, not a 409',
      second.ok && second.invoice.id === first.invoice.id && second.invoice.taxable_total === first.invoice.taxable_total);
  }

  console.log(`\n${passed} checks passed, ${failures} failed.`);
  if (failures > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
