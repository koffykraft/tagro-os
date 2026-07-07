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
  worker.includes("url.pathname === '/api/admin/import-machines'") &&
  worker.includes('return importMachinesAdmin(request, env)'),
  'exact POST admin machine import route exists'
);
check(
  worker.includes("authorizeOwnerImport(request, env, 'Machine import')") &&
  worker.includes('safeEqual(suppliedToken, configuredToken)'),
  'machine import uses OWNER_TOKEN Bearer authentication'
);
check(
  worker.includes('readJsonLimited(request, CUSTOMER_IMPORT_MAX_BYTES)') &&
  worker.includes('MACHINE_IMPORT_MAX_MACHINES = 2000'),
  'machine import uses bounded JSON and row limits'
);
check(
  worker.includes("SELECT id, code, name FROM branches WHERE code = ? AND active = 1") &&
  worker.includes("WHERE role = 'owner' AND active = 1"),
  'active branch and owner audit actor are required'
);
check(
  worker.includes('customer_identity_keys') &&
  worker.includes('customerByPhone') &&
  worker.includes('customer_phone_not_found'),
  'machine import links by existing customer phone only'
);
check(
  worker.includes('existingSerials') &&
  worker.includes('duplicate_serial_existing') &&
  worker.includes('duplicate_serial_in_request'),
  'machine import is duplicate-safe by serial number'
);
check(
  worker.includes('Ownership not confirmed; customer phone is service context only.') &&
  !worker.includes("Machine record created', now)\n  ]);\n  return getCustomerMachine(env, machineId, 201);\n}\n\nasync function importMachinesAdmin"),
  'machine import records service context without creating ownership history'
);
check(
  worker.includes('normalizeImportSerial') &&
  worker.includes('importSerialKey'),
  'machine import normalizes serial numbers'
);
check(
  worker.includes('createdMachines') &&
  worker.includes('skippedMachines') &&
  worker.includes('skippedDetailsTruncated'),
  'machine import response reports created and skipped totals'
);

console.log(`Machine import verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
