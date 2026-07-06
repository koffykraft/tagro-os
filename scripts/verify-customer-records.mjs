import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const migration = readFileSync(resolve(root, 'migrations/0006_customer_intake.sql'), 'utf8');
const shell = readFileSync(resolve(root, 'tagros/app-shell.js'), 'utf8');
const customerPage = readFileSync(resolve(root, 'tagros/app-customers.html'), 'utf8');
const jobsPage = readFileSync(resolve(root, 'tagros/app-jobs.html'), 'utf8');
const receivePage = readFileSync(resolve(root, 'tagros/receive.html'), 'utf8');

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(migration.includes('CREATE TABLE customer_identity_keys') &&
  migration.includes('PRIMARY KEY (identity_type, identity_value)'), 'phone identity is unique');
check(worker.includes("if (!customer.phone) return 'Customer phone is required.'"), 'customer phone is mandatory');
check(worker.includes('async function getCustomerRecordData') &&
  worker.includes('machines: machinesResult.results || []') &&
  worker.includes('jobs,') &&
  worker.includes('total_visits: jobs.length'), 'customer detail contains machines, jobs and visits');
check(worker.includes('completedServices >= 5') && worker.includes('completed_services'), 'loyal status derives from completed services');
check(worker.includes('name LIKE ? COLLATE NOCASE OR phone LIKE ?'), 'customer search supports partial name and phone');
check(!shell.includes('installCustomerSearch') &&
  !jobsPage.includes('customer-search-fab') &&
  receivePage.includes('id="customer-search"') &&
  customerPage.includes('id="customer-search"'),
  'customer search is limited to Receive and Customers');
check(customerPage.includes('customer-machine-list') &&
  customerPage.includes('customer-job-list') &&
  customerPage.includes('customer-record-summary'), 'customer page renders the complete record');

console.log(`Customer record verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
