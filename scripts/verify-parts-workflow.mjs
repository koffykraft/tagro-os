import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const work = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const workspace = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const workOrderForm = readFileSync(resolve(root, 'tagros/work-order-form.js'), 'utf8');
const linePickerPage = readFileSync(resolve(root, 'tagros/app-catalog.html'), 'utf8');
const linePicker = readFileSync(resolve(root, 'tagros/parts-line-picker.js'), 'utf8');
const linePickerCss = readFileSync(resolve(root, 'tagros/parts-line-picker.css'), 'utf8');

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
check(worker.includes("normalizeModelKey(url.searchParams.get('model'))") &&
  worker.includes('knowledgePartModelKeys') &&
  worker.includes('!modelKeys.has(modelKey)'),
  'job picker excludes parts explicitly named for other machine models');
check(!worker.includes("get(`parts:${") && !worker.includes("get(`parts-price:${") &&
  !worker.includes("get('parts:_index'"), 'model-specific catalog KV reads remain parked');
check(workspace.includes('part.tagroName || part.name') && workspace.includes('part.aliases'), 'TAGRO names and aliases are returned');
check(workspace.includes('data-bench-qty') && workspace.includes('data-bench-add'), 'price results include quantity and add controls');
check(workspace.includes('existing.quantity =') && workspace.includes('addCatalogPart(items[index], quantity)'), 'repeat add updates quantity');
check(workOrderForm.includes("draft:row.dataset.partDraft==='1'") && workOrderForm.includes('savedParts=this.parts.filter'), 'typed drafts cannot autosave as parts');
check(linePickerPage.includes('id="parts-lines"') &&
  !linePickerPage.includes('id="catalog-search"') &&
  !linePickerPage.includes('id="global-model"') &&
  !linePickerPage.includes('id="destination-select"'),
  'parts picker is line-by-line with no separate search or default dropdown zone');
check(linePicker.includes('data-line-query') &&
  linePicker.includes('part-inline-results') &&
  linePicker.includes('data-select-result'),
  'each numbered line owns its search and inline results');
check(linePicker.includes('confirmLine(lineId)') &&
  linePicker.includes('if (!hasEmptyAfter) this.addLine(true)'),
  'confirming a part line opens the next empty line');
check(linePicker.includes('line.draftReady && line.selected') &&
  linePickerPage.includes('id="selected-count"') &&
  linePickerPage.includes('id="selected-total"') &&
  linePickerPage.includes('Add to Job / Estimate'),
  'footer totals and final action use confirmed lines only');
check(linePickerCss.includes('.search-part-line{position:relative;min-height:62px') &&
  linePickerCss.includes('.part-inline-results{') &&
  linePickerCss.includes('position:absolute;') &&
  linePickerCss.includes('top:53px;'),
  'line search keeps a fixed row while results overlay following content');
check(linePicker.includes('renderLineResults(lineId)') &&
  !linePicker.includes('this.render();\n    this.focusLine(lineId, line.query.length);'),
  'search results update in place without rebuilding or refocusing the input');
const confirmStart = linePicker.indexOf('confirmLine(lineId)');
const confirmEnd = linePicker.indexOf('\n  editLine(lineId)', confirmStart);
const confirmBody = linePicker.slice(confirmStart, confirmEnd);
check(confirmStart >= 0 && confirmEnd > confirmStart &&
  confirmBody.includes('line.draftReady = true') &&
  !/(Api\.request|fetch\(|OS\.set|this\.commit\()/.test(confirmBody),
  'line checkmark changes draft UI state only with no API, storage or commit call');
check(linePicker.includes("getElementById('add-selected-parts').addEventListener('click', () => this.commit())") &&
  (linePicker.match(/this\.commit\(\)/g) || []).length === 1,
  'only the sticky footer action invokes the parts commit');
check(workspace.includes('openPartsPicker()') && workspace.includes('app-catalog.html?job='),
  'workbench opens the line picker with job context');
check(workOrderForm.includes('consumePartsHandoff()') &&
  workOrderForm.includes('tagro_parts_handoff_') &&
  workOrderForm.includes('OS.del(key)'),
  'workbench consumes and clears the saved picker handoff');

console.log(`Parts workflow verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
