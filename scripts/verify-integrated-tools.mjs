import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const worker = read('src/worker.js');
const module = read('src/integrated-tools.js');
const manifest = read('tagros/os-manifest.js');
const stockPage = read('tagros/stock-count/index.html');
const warehousePage = read('tagros/app-warehouse.html');
const migration = read('migrations/0012_stock_count.sql');
const config = read('wrangler.toml');
const catalogue = JSON.parse(read('tagros/stock-count/catalogue.json'));

const checks = [
  ['integrated router imported', worker.includes("from './integrated-tools.js'")],
  ['warehouse APIs require OS session', worker.includes("url.pathname.startsWith('/api/warehouse/')") && worker.includes('getSession(request, env)')],
  ['history database bound', config.includes('binding = "HISTORY_DB"')],
  ['warehouse is query-only', !/HISTORY_DB\.prepare\(\s*[`'\"]\s*(insert|update|delete)/i.test(module)],
  ['branch boundary enforced', module.includes("if (!owner(session)) return [branchCode(session)]")],
  ['stock submissions append-only', migration.includes('stock_count_entries_no_update') && migration.includes('stock_count_entries_no_delete')],
  ['stock page keeps offline draft', stockPage.includes('localStorage.setItem') && stockPage.includes('Kept safely on this phone')],
  ['stock page submits through OS API', stockPage.includes("Api.request('/stock-count/submissions'")],
  ['warehouse uses OS API', warehousePage.includes("Api.request('/warehouse/summary")],
  ['manifest contains both tools', manifest.includes("id:'stock-count'") && manifest.includes("id:'warehouse'")],
  ['stock page keeps illustrated models', stockPage.includes('model-catalogues.json') && stockPage.includes('renderDiagram')],
  ['catalogue is populated', Array.isArray(catalogue.items) && catalogue.items.length > 4000]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Integrated tools verification failed:', failed.map(([name]) => name).join(', '));
  process.exit(1);
}
console.log(`Integrated tools verification passed: ${checks.length} checks; ${catalogue.items.length} catalogue items.`);
