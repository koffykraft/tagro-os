import { readFile } from 'node:fs/promises';

const [worker, html, workspace] = await Promise.all([
  readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/work.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/work-space.js', import.meta.url), 'utf8')
]);

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(worker.includes('job_estimate_items') && worker.includes('estimate_number'), 'estimate persists numbered line items');
check(worker.includes("itemType === 'part' && !partNumber") &&
  worker.includes("['part', 'service', 'other']"), 'part and labour estimate rows are validated');
check(worker.includes('taxableAmount = roundMoney(quantity * unitPrice)') &&
  worker.includes('grandTotal: roundMoney'), 'estimate totals are derived on the server');
check(html.includes('id="estimate-labour-description"') &&
  html.includes('id="estimate-labour-rate"') &&
  workspace.includes("itemType: 'service'"), 'workbench can include labour');
check(workspace.includes('...parts.map(part =>') &&
  workspace.includes("itemType: 'part'"), 'job parts feed the estimate without re-entry');
check(html.includes('id="share-estimate-whatsapp"') &&
  html.includes('id="share-estimate-sms"') &&
  workspace.includes('https://wa.me/') &&
  workspace.includes('sms:'), 'WhatsApp and SMS fallback actions are prefilled');
check(workspace.includes("'estimate_created', 'Request approval'") ||
  workspace.includes('data-job-event="estimate_created"'), 'approval is requested explicitly');
check(workspace.includes("'estimate_approved', 'Approval received'"), 'customer approval is tracked as an event');
check(worker.includes('estimate cannot be changed') &&
  worker.includes("['returned', 'cancelled']"), 'closed estimates are immutable');

console.log(`Estimate verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
