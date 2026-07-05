import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const osRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(osRoot, '..');
const serviceRoot = path.join(workspaceRoot, 'service_tagro_live');

const read = file => fs.readFileSync(file, 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    enabled ? this.values.add(name) : this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.options = [];
    this.attributes = {};
    this.classList = new FakeClassList();
  }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  get innerHTML() { return this._innerHTML || ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, handler) { this[`on${type}`] = handler; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
  querySelectorAll() { return []; }
}

function receiveHarness() {
  const html = read(path.join(serviceRoot, 'receive.html'));
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
  scripts.forEach(source => new Function(source));
  const main = scripts.find(source => source.includes('var commonComplaints='));
  assert.ok(main, 'receive page controller script is present');

  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const customers = [{
    id: 'customer-real',
    branch: 'KVR',
    name: 'Verification Customer',
    phone: '9000000000',
    machines: []
  }];
  const jobs = [];
  let savedJobs = [];
  const document = {
    getElementById: getElement,
    createElement: () => new FakeElement(),
    querySelectorAll: () => []
  };
  const context = vm.createContext({
    console,
    document,
    window: { scrollTo() {} },
    location: { href: '' },
    navigator: {},
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    requireLogin: () => ({ name: 'Verification Staff', role: 'Staff', branch: 'KVR' }),
    initShell() {},
    jget: (_key, fallback) => fallback,
    jset() {},
    customers: () => customers,
    jobs: () => jobs,
    saveJobs: all => { savedJobs = structuredClone(all); },
    getBranchModels: () => [],
    wo: () => 'WO-VERIFY',
    esc: value => String(value ?? ''),
    toast() {},
    TAGRO: { branches: { KVR: 'KVR' } }
  });
  vm.runInContext(main, context);
  getElement('machine-model').value = 'MS 250';
  vm.runInContext('selectedCustomer = customers()[0]', context);
  return { context, elements, get savedJobs() { return savedJobs; } };
}

const expectedComplaints = [
  "Won't Start",
  'No Power',
  'Chain Problem',
  'Fuel Leak',
  'Engine Noise',
  'Service',
  'Other'
];

for (const complaint of expectedComplaints) {
  const harness = receiveHarness();
  const quoted = JSON.stringify(complaint);
  vm.runInContext(`quickComplaint(${quoted})`, harness.context);
  const pill = harness.elements.get('complaint-pills').children
    .find(button => button.textContent.startsWith(complaint));
  assert.equal(pill?.attributes['aria-pressed'], 'true', `${complaint} is visibly selected`);
  if (complaint === 'Other') {
    harness.elements.get('complaint-input').value = 'Custom verification complaint';
    vm.runInContext('addComplaint()', harness.context);
  }
  vm.runInContext('receiveMachine()', harness.context);
  const saved = harness.savedJobs.at(-1);
  assert.ok(saved, `${complaint} saves a job`);
  assert.equal(saved.customerId, 'customer-real', `${complaint} preserves customer lineage`);
  assert.deepEqual(
    saved.complaints.map(item => item.text),
    [complaint === 'Other' ? 'Custom verification complaint' : complaint],
    `${complaint} saves the intended complaint`
  );
}

{
  const appSource = read(path.join(serviceRoot, 'app.js'));
  const functionSource = appSource.match(
    /function purgeLegacySampleData\(\) \{[\s\S]*?\n\}\n\nfunction seed\(\)/
  );
  assert.ok(functionSource, 'browser cleanup function is present');
  const storage = new Map();
  const state = {
    tagro_customers: [
      { id:'c1', branch:'KVR', createdAt:'2026-07-04T00:00:00Z', machines:[{id:'m1'},{id:'m2'}] },
      { id:'c2', branch:'KVR', machines:[{id:'m3'}] },
      { id:'c-real', branch:'KVR', createdAt:'2026-07-04T00:00:00Z', machines:[] }
    ],
    tagro_jobs: [
      { id:'real-c1-job', customerId:'c1', workOrder:'WO-REAL-1' },
      { id:'fixture-job', customerId:'c2', workOrder:'WO-FIXTURE' },
      { id:'real-job', customerId:'c-real', workOrder:'WO-REAL-2' }
    ]
  };
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    jget: (key, fallback) => structuredClone(state[key] ?? fallback),
    jset: (key, value) => { state[key] = structuredClone(value); }
  });
  vm.runInContext(functionSource[0].replace(/\n\nfunction seed\(\)$/, ''), context);
  vm.runInContext('purgeLegacySampleData()', context);
  assert.deepEqual(state.tagro_customers.map(item => item.id), ['c1', 'c-real']);
  assert.deepEqual(state.tagro_jobs.map(item => item.id), ['real-c1-job', 'real-job']);
  assert.deepEqual(state.tagro_cleanup_backup_v2.customers.map(item => item.id), ['c2']);
  assert.deepEqual(state.tagro_cleanup_backup_v2.jobs.map(item => item.id), ['fixture-job']);
}

{
  const receiveSource = read(path.join(serviceRoot, 'receive.html'));
  const complaintsLiteral = receiveSource.match(/var commonComplaints=(\[[^;]+\]);/);
  assert.ok(complaintsLiteral, 'complaint list is defined');
  assert.deepEqual([...vm.runInNewContext(complaintsLiteral[1])], expectedComplaints);

  const serviceFiles = fs.readdirSync(serviceRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:html|js|css|json)$/i.test(entry.name))
    .map(entry => read(path.join(serviceRoot, entry.name)))
    .join('\n');
  for (const retiredValue of [
    'Thomas Thumpassery',
    'Jose Sawmill',
    'Rubber Biju',
    'Victor Farms',
    '9447000001',
    '9447000002',
    '9447000003'
  ]) {
    assert.equal(serviceFiles.includes(retiredValue), false, `retired fixture ${retiredValue} is absent`);
  }
  assert.equal(serviceFiles.includes('sampleNames'), false, 'name-based customer deletion is absent');
  assert.equal(serviceFiles.includes('samplePhones'), false, 'phone-based customer deletion is absent');
}

{
  const worker = read(path.join(osRoot, 'src', 'worker.js'));
  const workspace = read(path.join(osRoot, 'tagros', 'work-space.js'));
  assert.match(worker, /env\.TAGRO_DATA\.get\('parts:master'/);
  assert.match(worker, /mappingStatus:\s*'tagro_master'/);
  assert.doesNotMatch(worker, /needs_supersession_review/);
  assert.match(workspace, /part\.tagroName \|\| part\.name/);
  assert.match(workspace, /data-bench-add/);
}

console.log(`PASS: ${expectedComplaints.length} complaint paths save correctly`);
console.log('PASS: fixture cleanup backs up exact fixtures and preserves real-ID jobs');
console.log('PASS: retired names and phone fixtures are absent from deployable service files');
console.log('PASS: workbench reads only the TAGRO parts master and keeps diagram scope parked');
