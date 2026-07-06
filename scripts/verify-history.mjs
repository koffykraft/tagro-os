import { readFile } from 'node:fs/promises';

const [worker, customers, machineHistory, jobs] = await Promise.all([
  readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/app-customers.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/machine-history.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/app-jobs.html', import.meta.url), 'utf8')
]);

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(worker.includes('total_visits: jobs.length') &&
  worker.includes('completed_services: completedServices') &&
  worker.includes('loyal: completedServices >= 5'), 'customer history derives visits, completion and loyalty');
check(customers.includes('record.machines') && customers.includes('record.jobs') &&
  customers.includes('record.total_visits') && customers.includes('record.loyal'), 'customer history renders machines and all visits');
check(customers.includes('machine-history.html?id=') && customers.includes('encodeURIComponent(machine.id)'), 'customer machines open their physical history');
check(machineHistory.includes("Api.request('/customer-machines/'") &&
  machineHistory.includes('machine.jobs') &&
  machineHistory.includes('machine.parts') &&
  machineHistory.includes('machine.complaints'), 'machine history renders jobs, parts and complaints');
check(worker.includes('SUM(COALESCE(wp.quantity, 0)) AS total_quantity') &&
  worker.includes('WHERE j.customer_machine_id = ?'), 'machine parts aggregate across its jobs');
check(worker.includes("SUBSTR(j.opened_at, 1, 10) >= ?") &&
  worker.includes("SUBSTR(j.opened_at, 1, 10) <= ?") &&
  worker.includes("conditions.push('d.assigned_to = ?')"), 'branch history API filters by date and mechanic');
check(jobs.includes('id="status-filter"') &&
  jobs.includes('id="mechanic-filter"') &&
  jobs.includes("mechanic==='unassigned'") &&
  jobs.includes("addEventListener('change',renderJobs)") &&
  !jobs.includes('id="date-from"') &&
  !jobs.includes('id="date-to"'), 'branch jobs exposes only the approved status and mechanic filters');

console.log(`History verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
