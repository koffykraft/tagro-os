import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const manifestSource = fs.readFileSync(new URL('tagros/os-manifest.js', root), 'utf8');
const shellSource = fs.readFileSync(new URL('tagros/app-shell.js', root), 'utf8');

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
const context = vm.createContext({ document, globalThis: null });
context.globalThis = context;
vm.runInContext(`${manifestSource}\n${shellSource}\nglobalThis.__manifest=TAGRO_MANIFEST;globalThis.__shell=AppShell;`, context);

const session = { role: 'staff' };
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
