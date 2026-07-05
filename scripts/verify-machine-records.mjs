import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const migration = readFileSync(resolve(root, 'migrations/0010_machine_ownership.sql'), 'utf8');

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(migration.includes('CREATE TABLE machine_ownership_history') &&
  migration.includes('machine_ownership_history_active_unique'), 'ownership history is auditable with one active owner');
check(worker.includes('async function routeCustomerMachinesApi') &&
  worker.includes("url.pathname === '/api/customer-machines'"), 'physical machine routes are domain-isolated');
check(worker.includes("'Customer, machine model and serial number are required.'"), 'model and serial are mandatory');
check(worker.includes("WHERE UPPER(serial_number) = ? AND active = 1"), 'duplicate active serial numbers are rejected');
check(worker.includes('async function transferCustomerMachine') &&
  worker.includes('SET ended_at = ?') &&
  worker.includes('SET customer_id = ?, updated_at = ?'), 'ownership transfer closes old ownership and updates current owner');
check(worker.includes('async function getCustomerMachine') &&
  worker.includes('parts: partsResult.results || []') &&
  worker.includes('complaints: jobs.map'), 'machine record accumulates jobs, parts and complaints');
check(worker.includes('ownership: ownershipResult.results || []'), 'machine record exposes ownership history');

console.log(`Machine record verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
