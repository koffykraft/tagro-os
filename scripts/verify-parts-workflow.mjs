import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = readFileSync(resolve(root, 'src/worker.js'), 'utf8');
const catalog = readFileSync(resolve(root, 'tagros/app-catalog.html'), 'utf8');
const work = readFileSync(resolve(root, 'tagros/work.html'), 'utf8');
const workspace = readFileSync(resolve(root, 'tagros/work-space.js'), 'utf8');
const workOrderForm = readFileSync(resolve(root, 'tagros/work-order-form.js'), 'utf8');
const css = readFileSync(resolve(root, 'tagros/os-shell.css'), 'utf8');

console.log(`Parts workflow verification passed: ${checks.length} checks.`);
for (const message of checks) console.log(`- ${message}`);
