import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const work = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const workspace = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const workOrderForm = readFileSync(resolve(root, 'tagros/work-order-form.js'), 'utf8');

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

const parkedTerms = [
  'loadModelChoices', 'loadModelParts', 'ensureModelParts', 'machineModel', 'catalogItem',
  '/knowledge/models', '/catalog/name-requests', 'modelParts', 'loadedModelKey',
  'diagramAsset', 'modelChoicesLoaded', 'partsMode', 'benchModelOverride',
  'parts-assembly-carousel', 'parts-fast-mode', 'parts-visual-mode', 'parts-model-select'
];
check(parkedTerms.every(term => !workspace.includes(term) && !work.includes(term)), 'parked model and diagram scope removed from workbench');
check((workspace.match(/async searchParts\(\)/g) || []).length === 1, 'workbench has one parts search method');
check(workspace.includes('Api.request(`/knowledge/parts?query=${encodeURIComponent(query)}&limit=40`)'), 'workbench uses one Worker search endpoint');
check(!workspace.includes('model=${') && !workspace.includes('/catalog?type=part'), 'workbench search has no model or catalog fallback');
check(worker.includes("env.TAGRO_DATA.get('parts:master'") && worker.includes('async function searchKnowledgeParts'), 'Worker search reads TAGRO_DATA parts:master');
check(!worker.includes("get(`parts:${") && !worker.includes("get(`parts-price:${") &&
  !worker.includes("get('parts:_index'"), 'model-specific catalog KV reads remain parked');
check(workspace.includes('part.tagroName || part.name') && workspace.includes('part.aliases'), 'TAGRO names and aliases are returned');
check(workspace.includes('data-bench-qty') && workspace.includes('data-bench-add'), 'price results include quantity and add controls');
check(workspace.includes('existing.quantity =') && workspace.includes('addCatalogPart(items[index], quantity)'), 'repeat add updates quantity');
check(workOrderForm.includes("draft:row.dataset.partDraft==='1'") && workOrderForm.includes('savedParts=this.parts.filter'), 'typed drafts cannot autosave as parts');

console.log(`Parts workflow verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
