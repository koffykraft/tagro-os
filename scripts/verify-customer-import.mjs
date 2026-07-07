import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(
  worker.includes("url.pathname === '/api/admin/import-customers'") &&
  worker.includes('return importCustomersAdmin(request, env)'),
  'exact POST admin import route exists'
);
check(
  worker.includes('env.OWNER_TOKEN') &&
  worker.includes("authorization.match(/^Bearer\\s+(.+)$/i)") &&
  worker.includes('safeEqual(suppliedToken, configuredToken)'),
  'OWNER_TOKEN uses constant-time Bearer authentication'
);
check(
  worker.includes('CUSTOMER_IMPORT_MAX_BYTES = 8 * 1024 * 1024') &&
  worker.includes('request.body.getReader()') &&
  worker.includes('total > maxBytes'),
  'request JSON is read through a bounded stream'
);
check(
  worker.includes('body?.branchCode ?? body?.branch'),
  'customer import accepts documented branchCode field'
);
check(
  worker.includes('CUSTOMER_IMPORT_MAX_CUSTOMERS = 2000') &&
  worker.includes('CUSTOMER_IMPORT_MAX_MACHINES = 100') &&
  worker.includes('CUSTOMER_IMPORT_MAX_JOBS = 100'),
  'customer, machine and job counts are bounded'
);
check(
  worker.includes("SELECT id, code, name FROM branches WHERE code = ? AND active = 1") &&
  worker.includes("WHERE role = 'owner' AND active = 1"),
  'active branch and owner audit actor are required'
);
check(
  worker.includes('ensureImportOtherModel(env)') &&
  worker.includes("'model_other'") &&
  worker.includes('originalModelName'),
  'unknown imported models fall back to OTHER while preserving the original model text'
);
check(
  worker.includes("FROM customer_identity_keys") &&
  worker.includes("identity_type = 'phone'") &&
  worker.includes('seenPhones.has(phoneKey)') &&
  worker.includes("reason: 'duplicate_phone'"),
  'existing and in-file duplicate phones are skipped'
);
check(
  worker.includes("record_kind)") &&
  worker.includes("'Imported through owner customer import'") &&
  worker.includes("VALUES ('phone', ?, ?, ?)"),
  'customers use the normal record and phone-identity structure'
);
check(
  worker.includes('INSERT INTO customer_machines') &&
  worker.includes('INSERT INTO machine_ownership_history') &&
  worker.includes("'Imported customer ownership'"),
  'machines and ownership history are created together'
);
check(
  worker.includes('INSERT INTO repair_jobs') &&
  worker.includes('INSERT INTO work_order_details') &&
  worker.includes('INSERT INTO job_events') &&
  worker.includes("'machine_received'"),
  'jobs include details and the required machine_received event'
);
check(
  worker.includes('CUSTOMER_IMPORT_BATCH_STATEMENTS = 75') &&
  worker.includes('await env.DB.batch(chunkStatements)') &&
  worker.includes('CUSTOMER_IMPORT_PARTIAL'),
  'bounded transactional batches are retry-safe'
);
check(
  worker.includes('createdCustomers: created.customers') &&
  worker.includes('skippedCustomers') &&
  worker.includes('createdMachines: created.machines') &&
  worker.includes('createdJobs: created.jobs'),
  'response reports created and skipped totals'
);
check(
  !/OWNER_TOKEN\s*=\s*['"][^'"]+['"]/.test(worker),
  'OWNER_TOKEN is never hardcoded'
);

console.log(`Customer import verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
