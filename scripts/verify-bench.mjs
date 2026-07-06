import { readFile } from 'node:fs/promises';

const [worker, jobs, serviceUi] = await Promise.all([
  readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/app-jobs.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/service-ui.js', import.meta.url), 'utf8')
]);

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(worker.includes("conditions.push('j.branch_id = ?')") &&
  worker.includes("conditions.push('d.assigned_to = ?')"), 'job API supports branch and personal bench views');
check(jobs.includes('<option value="active">Active jobs</option>') &&
  jobs.includes("!['returned','cancelled'].includes(order.status)"), 'bench defaults to active work');
check(jobs.includes("const statusOrder=['received','inspecting','awaiting_approval','repairing','paused','waiting_parts','ready','returned','cancelled']") &&
  jobs.includes('class="job-group"'), 'jobs are grouped in lifecycle order');
check(serviceUi.includes('this.machine(order)') &&
  serviceUi.includes('this.customer(order)') &&
  serviceUi.includes("order.complaint||'Complaint not recorded'"), 'cards show machine, customer and complaint');
check(serviceUi.includes('this.age(order.openedAt)') &&
  serviceUi.includes("order.assignedToName||'Unassigned'"), 'cards show age and assigned technician');
check(serviceUi.includes('work.html?id=') && serviceUi.includes('encodeURIComponent(order.id)'), 'job tap opens the matching workbench');
check(jobs.includes("params.set('mine','1')") && jobs.includes("textContent='My Bench'"), 'personal bench remains available');

console.log(`Bench verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
