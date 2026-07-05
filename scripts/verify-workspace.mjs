import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const js = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const workOrderForm = readFileSync(resolve(root, 'tagros/work-order-form.js'), 'utf8');
const css = readFileSync(resolve(root, 'tagros/work-space.css'), 'utf8');
const sw = readFileSync(resolve(root, 'tagros/sw.js'), 'utf8');

const assertions = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  assertions.push(message);
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const referencedIds = new Set([
  ...[...js.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]),
  ...[...workOrderForm.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1])
]);
const workspaceIds = [...referencedIds].filter(id => (
  js.includes(`getElementById('${id}')`) ||
  ['add-part', 'customer-search', 'customer-results', 'work-order-form', 'screen-title', 'save-state',
    'customer-name', 'customer-phone', 'customer-place', 'machine-description', 'machine-serial',
    'complaint', 'observation', 'work-done', 'billing-subtotal', 'billing-tax', 'billing-total',
    'billing-note', 'part-list', 'accept-machine', 'known-machines', 'intake-photo-panel',
    'work-intake-photos'].includes(id)
)).filter(id => !['next-action-message', 'bench-note-input', 'pause-reason', 'pause-reason-field'].includes(id));

check(workspaceIds.every(id => htmlIds.has(id)), `workspace DOM contract (${workspaceIds.length} IDs)`);
check(html.includes('work-space.css') && html.includes('work-space.js'), 'workspace assets linked');
check(sw.includes("'/work-space.css'") && sw.includes("'/work-space.js'") && sw.includes('tagro-white-v24'), 'offline shell versioned');
check(js.includes("Api.request('/work-orders?limit=160')") && js.includes("Api.request('/work-orders?mine=1&limit=160')"), 'live queue data used');
check(js.includes('/knowledge/parts?query=') && js.includes('addCatalogPart'), 'parts:master-to-job path');
check(js.includes('/estimate') && js.includes('Create estimate'), 'estimate conversion path');
check(js.includes('/events') && js.includes('statusActions'), 'real workflow-event path');
check(js.includes("'job_taken', 'Take this job'") && js.includes('data-record-observation') &&
  js.includes("'inspection_observed'"), 'take-job and free-text bench observation flow');
check(!js.includes('diagnosticSpec()') && !js.includes('data-finding'), 'guided diagnosis is not an entry gate');
check(css.includes('@media(max-width:760px)') && html.includes('mobile-bottom-nav'), 'mobile workspace layout');
check(!/Rubber Biju|Jose Sawmill|Thomas Thumpassery|94470000/i.test(`${html}\n${js}`), 'no retired sample customer data');
check(workOrderForm.includes("document.dispatchEvent(new CustomEvent('tagro:parts-updated'))"), 'basket receives part updates');
check(workOrderForm.includes('data-part-hsn=') && workOrderForm.includes('data-part-gst='), 'catalog tax metadata preserved');
check(workOrderForm.includes("draft:row.dataset.partDraft==='1'") && workOrderForm.includes('savedParts=this.parts.filter'), 'search drafts excluded from autosave');
check(html.includes('bench-glance-card') && js.includes('renderBenchFacts'), 'customer and machine facts visible on the bench');
check(html.includes('bench-part-query') && js.includes('async searchParts()'), 'inline TAGRO price-and-add search available');
check(js.includes('existing.quantity =') && js.includes('this.renderBasket()'), 'repeat adds update the visible job list');
check(html.includes('My queue') && html.includes('My pinned parts'), 'personal queue and pinned parts remain on the bench');

console.log(`Service Workspace verification passed: ${assertions.length} checks.`);
for (const assertion of assertions) console.log(`- ${assertion}`);
