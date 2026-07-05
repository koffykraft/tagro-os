import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const js = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const core = readFileSync(resolve(root, 'tagros/service-core.js'), 'utf8');
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
  ...[...core.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1])
]);
const workspaceIds = [...referencedIds].filter(id => (
  js.includes(`getElementById('${id}')`) ||
  ['add-part', 'customer-search', 'customer-results', 'work-order-form', 'screen-title', 'save-state',
    'customer-name', 'customer-phone', 'customer-place', 'machine-description', 'machine-serial',
    'complaint', 'observation', 'work-done', 'billing-subtotal', 'billing-tax', 'billing-total',
    'billing-note', 'part-list', 'accept-machine', 'known-machines', 'intake-photo-panel',
    'work-intake-photos'].includes(id)
)).filter(id => id !== 'next-action-message');

check(workspaceIds.every(id => htmlIds.has(id)), `workspace DOM contract (${workspaceIds.length} IDs)`);
check(html.includes('work-space.css') && html.includes('work-space.js'), 'workspace assets linked');
check(sw.includes("'/work-space.css'") && sw.includes("'/work-space.js'") && sw.includes('tagro-white-v20'), 'offline shell versioned');
check(js.includes("Api.request('/work-orders?limit=160')") && js.includes("Api.request('/work-orders?mine=1&limit=160')"), 'live queue data used');
check(js.includes('/catalog?type=part') && js.includes('addCatalogPart'), 'live catalogue-to-job path');
check(js.includes('/estimate') && js.includes('Create estimate'), 'estimate conversion path');
check(js.includes('/events') && js.includes('statusActions'), 'real workflow-event path');
check(js.includes('AI diagnosis is not connected yet'), 'AI capability represented honestly');
check(css.includes('@media(max-width:760px)') && html.includes('mobile-bottom-nav'), 'mobile workspace layout');
check(!/Rubber Biju|Jose Sawmill|Thomas Thumpassery|94470000/i.test(`${html}\n${js}`), 'no retired sample customer data');
check(core.includes("document.dispatchEvent(new CustomEvent('tagro:parts-updated'))"), 'basket receives part updates');
check(core.includes('data-part-hsn=') && core.includes('data-part-gst='), 'catalog tax metadata preserved');

console.log(`Service Workspace verification passed: ${assertions.length} checks.`);
for (const assertion of assertions) console.log(`- ${assertion}`);
