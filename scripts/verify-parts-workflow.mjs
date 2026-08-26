import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const catalog = readFileSync(resolve(root, 'tagros/app-catalog.html'), 'utf8');
const work = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const workspace = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const workOrderForm = readFileSync(resolve(root, 'tagros/work-order-form.js'), 'utf8');
const css = readFileSync(resolve(root, 'tagros/os-shell.css'), 'utf8');

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(worker.includes('flexiblePartScore(query') && worker.includes('officialMatches'), 'master catalog uses flexible ranked search');
check(worker.includes('if (!modelKey || (masterKey && results.has(masterKey)))'), 'model knowledge search excludes unrelated master parts');
check(catalog.includes('Model-first parts workspace') && catalog.includes('global-assembly-carousel'), 'global model-first workspace present');
check(catalog.includes('destination-select') && catalog.includes('tagro_parts_handoff_'), 'global destination handoff present');
check(catalog.includes('HOLD 1') && catalog.includes('length: 10'), 'ten HOLD destinations available');
check(!catalog.includes('Use TAGRO names</option>'), 'misleading TAGRO-name mode removed from visible UI');
check(work.includes('parts-assembly-carousel') && work.includes('open-global-parts'), 'bench picker links assemblies and global workspace');
check(work.includes('parts-model-select') && workspace.includes('loadModelChoices'), 'bench model can switch without creating a job');
check(work.includes('parts-fast-mode') && work.includes('parts-visual-mode') && workspace.includes("setPartsMode('fast')"), 'fast price-and-add mode is the default');
check(workspace.includes('loadModelParts') && workspace.includes('renderPartResults'), 'bench model carousel loads real parts');
check(workspace.includes('const merged = this.modelParts.filter') && !workspace.includes('const requests = [Api.request(`/catalog?type=part'), 'bench search is isolated to the loaded model');
check(workspace.includes('...(item.aliases || [])') && workspace.includes('data-view-diagram'), 'fast search supports aliases with a visual fallback');
check(workspace.includes('const primaryName = workshopName || officialName') && workspace.includes('Official STIHL:'), 'bench prefers TAGRO workshop names with STIHL reference');
check(catalog.includes("'<small>TAGRO: '") && catalog.includes('Needs TAGRO Name'), 'global catalog keeps STIHL primary and supports TAGRO naming requests');
check(worker.includes('/api/catalog/name-requests') && worker.includes('Marked for TAGRO naming'), 'TAGRO naming requests persist for admin review');
check(workOrderForm.includes("draft:row.dataset.partDraft==='1'") && workOrderForm.includes('savedParts=this.parts.filter'), 'typed drafts cannot autosave as parts');
check(workspace.includes('data-result-qty') && workspace.includes('addCatalogPart(items[index], quantity)'), 'quantity selection connected');
check(css.includes('.global-assembly-carousel') && css.includes('nth-child(8)'), 'global desktop/mobile parts UI styled');

console.log(`Parts workflow verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
