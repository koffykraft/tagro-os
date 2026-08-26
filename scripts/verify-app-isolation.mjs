import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const manifestSource = fs.readFileSync(new URL('tagros/os-manifest.js', root), 'utf8');
const shellSource = fs.readFileSync(new URL('tagros/app-shell.js', root), 'utf8');
const mySpaceSource = fs.readFileSync(new URL('tagros/my-space.js', root), 'utf8');

function element(tagName) {
  return {
    tagName,
    children: [],
    dataset: {},
    classList: { add() {} },
    setAttribute() {},
    append(...nodes) { this.children.push(...nodes); }
  };
}

const document = {
  createElement: element,
  createTextNode: textContent => ({ textContent })
};
const context = vm.createContext({ document, window: { addEventListener() {} }, globalThis: null });
context.globalThis = context;
vm.runInContext(`${manifestSource}\n${shellSource}\nglobalThis.__manifest=TAGRO_MANIFEST;globalThis.__shell=AppShell;`, context);

const session = { role: 'staff' };
const dailyMobile = context.__manifest.apps
  .filter(app => app.navigation?.includes('mobile-core'))
  .map(app => app.label);
if (dailyMobile.join('|') !== 'My Space|Receive|My Bench') {
  throw new Error(`Daily mobile navigation is incorrect: ${dailyMobile.join(', ')}`);
}
const jobsApp = context.__manifest.apps.find(app => app.id === 'jobs');
if (jobsApp.navigation.includes('mobile-core') || !jobsApp.navigation.includes('drawer')) {
  throw new Error('Repair Jobs must be in More and outside the daily mobile bar');
}
const settingsApp = context.__manifest.apps.find(app => app.id === 'settings');
if (settingsApp?.file !== 'index.html#settings' || !settingsApp.navigation.includes('drawer')) {
  throw new Error('Personal Settings must be available through More');
}
if (!mySpaceSource.includes("getElementById('staff-name').textContent = name") ||
    !mySpaceSource.includes("getElementById('heading-staff-name').textContent = name") ||
    mySpaceSource.includes('textContent = firstName')) {
  throw new Error('My Space greeting must display the authenticated staff name in full');
}
const pages = ['index.html', 'receive.html', 'work.html'];

function containersFor(page) {
  const html = fs.readFileSync(new URL(`tagros/${page}`, root), 'utf8');
  const tags = [...html.matchAll(/<(?:nav|div)\b[^>]*data-app-navigation="([^"]+)"[^>]*>/g)];
  if (!tags.length) throw new Error(`${page}: no manifest navigation containers found`);
  return tags.map(match => {
    const active = match[0].match(/data-active-app="([^"]+)"/)?.[1] || '';
    const nodes = [];
    return {
      dataset: { appNavigation: match[1], activeApp: active },
      nodes,
      querySelectorAll: selector => selector === '[data-app-nav-item]' ? nodes : [],
      querySelector: () => null,
      insertBefore: node => nodes.push(node)
    };
  });
}

const fake = {
  id: 'isolation-test',
  label: 'Isolation Test',
  file: 'fake-app.html',
  enabled: true,
  ready: true,
  access: { roles: ['all'] }
};

context.__manifest.apps.push(fake);
for (const page of pages) {
  for (const container of containersFor(page)) {
    context.__shell.renderNavigation(container, session);
    if (!container.nodes.some(node => node.dataset.appId === fake.id)) {
      throw new Error(`${page} (${container.dataset.appNavigation}): fake app did not appear`);
    }
  }
}

context.__manifest.apps = context.__manifest.apps.filter(app => app.id !== fake.id);
for (const page of pages) {
  for (const container of containersFor(page)) {
    context.__shell.renderNavigation(container, session);
    if (container.nodes.some(node => node.dataset.appId === fake.id)) {
      throw new Error(`${page} (${container.dataset.appNavigation}): fake app did not disappear`);
    }
  }
}

console.log('Manifest navigation isolation verified: fake app appeared and disappeared on every navigation surface.');

const serviceUi = fs.readFileSync(new URL('tagros/service-ui.js', root), 'utf8');
const workOrderForm = fs.readFileSync(new URL('tagros/work-order-form.js', root), 'utf8');
if (!serviceUi.includes('const ServiceUI=') || serviceUi.includes('WorkOrderForm')) {
  throw new Error('service-ui.js must contain ServiceUI only');
}
if (!workOrderForm.includes('const WorkOrderForm=') || workOrderForm.includes('const ServiceUI=')) {
  throw new Error('work-order-form.js must contain WorkOrderForm only');
}

for (const page of ['index.html', 'receive.html']) {
  const html = fs.readFileSync(new URL(`tagros/${page}`, root), 'utf8');
  if (!html.includes('service-ui.js')) throw new Error(`${page}: service-ui.js is not loaded`);
  if (html.includes('work-space.js') || html.includes('work-order-form.js')) {
    throw new Error(`${page}: workbench code must not be loaded`);
  }
}

const workHtml = fs.readFileSync(new URL('tagros/work.html', root), 'utf8');
if (!workHtml.includes('service-ui.js') || !workHtml.includes('work-order-form.js') || !workHtml.includes('work-space.js')) {
  throw new Error('work.html must load shared UI and both workbench files');
}

console.log('Service split verified: home and intake remain independent when work-space.js is excluded.');
