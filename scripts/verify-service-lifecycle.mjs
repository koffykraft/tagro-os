import { readFile } from 'node:fs/promises';

const [worker, workspace, jobs] = await Promise.all([
  readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/work-space.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/app-jobs.html', import.meta.url), 'utf8')
]);

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

const canonical = {
  job_received: 'received',
  job_taken: 'inspecting',
  inspection_observed: 'inspecting',
  repair_started: 'repairing',
  job_paused: 'paused',
  job_resumed: 'repairing',
  parts_requested: 'waiting_parts',
  estimate_created: 'awaiting_approval',
  estimate_approved: 'repairing',
  job_completed: 'ready',
  job_returned: 'returned'
};
for (const [eventType, status] of Object.entries(canonical)) {
  check(worker.includes(`${eventType}: '${status}'`), `${eventType} derives ${status}`);
}

const legacy = {
  machine_received: 'received',
  inspection_started: 'inspecting',
  repair_paused: 'paused',
  repair_resumed: 'repairing',
  repair_completed: 'ready',
  machine_delivered: 'returned'
};
for (const [eventType, status] of Object.entries(legacy)) {
  check(worker.includes(`${eventType}: '${status}'`), `${eventType} remains compatible`);
}

for (const reason of ['Waiting Customer', 'Waiting Parts', 'Outside Work', 'Priority Changed', 'End of Day', 'Other']) {
  check(worker.includes(`'${reason}'`) && workspace.includes(`<option>${reason}</option>`), `pause reason available: ${reason}`);
}

check(worker.includes("eventType === 'job_taken'") &&
  worker.includes('assigned_to = excluded.assigned_to'), 'taking a job assigns the technician');
check(worker.includes("eventType === 'inspection_observed'") &&
  worker.includes("work_order_details.observation || CHAR(10)"), 'bench observations enrich the work record');
check(worker.includes('resumedFromReason') && worker.includes('pauseReason'), 'pause and resume context is retained');
check(worker.includes('ORDER BY e.created_at, e.id') && workspace.includes('renderTimeline()'), 'timeline remains chronological');
check(workspace.includes("'job_taken', 'Take this job'") &&
  workspace.includes("this.postEvent('inspection_observed'"), 'workbench uses canonical take and observe events');
check(!workspace.includes("['inspection_started', 'Start inspection'") &&
  !workspace.includes("['repair_paused', 'Pause job'") &&
  !workspace.includes("['machine_delivered', 'Machine delivered'"), 'workbench does not emit legacy lifecycle actions');
check(!workspace.includes('diagnosticSpec()') && !workspace.includes('data-finding'), 'diagnostic branching is not an entry requirement');
check(jobs.includes('value="returned"') && !jobs.includes('value="delivered"'), 'job filtering uses returned status');

console.log(`Service lifecycle verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
