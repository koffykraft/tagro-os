import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseFile } from 'fast-csv';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, 'output/catalog-mapping/priority-model-parts-mapping.csv');
const output = resolve(root, 'output/staging-ms382');
const sections = {};

await new Promise((resolveParse, rejectParse) => {
  parseFile(input, { headers: true, ignoreEmpty: true })
    .on('error', rejectParse)
    .on('data', item => {
      if (String(item.model).trim() !== 'MS 382') return;
      const section = String(item.section || 'Other').trim();
      if (!sections[section]) sections[section] = [];
      sections[section].push({
        ref: String(item.reference || '').trim(),
        no: String(item.pdfPartNumber || '').replace(/\s/g, '').toUpperCase(),
        name: String(item.pdfDescription || item.stihlName || '').trim(),
        stihlName: String(item.stihlName || item.pdfDescription || '').trim(),
        tagroName: String(item.tagroName || '').trim(),
        currentPartNumber: String(item.currentPartNumber || '').replace(/\s/g, '').toUpperCase(),
        mappingStatus: String(item.status || '').trim(),
        retail: item.retail === '' ? null : Number(item.retail),
        mrp: item.mrp === '' ? null : Number(item.mrp),
        hsn: String(item.hsn || '').trim(),
        gst: item.gst === '' ? null : Number(item.gst),
        page: Number(item.page) || null,
        qty: 1,
        models: ['MS 382']
      });
    })
    .on('end', resolveParse);
  });

const structure = {
  model: 'MS382',
  label: 'MS 382',
  catalog: 'MS 382 parts catalog.pdf',
  generatedAt: new Date().toISOString(),
  policy: {
    diagramNumbersAreReferences: true,
    onlyExactCurrentNumbersMayBeOrdered: true
  },
  sections
};

await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'parts-MS382.json'), JSON.stringify(structure));
await writeFile(resolve(output, 'parts-index.json'), JSON.stringify({
  MS382: {
    label: 'MS 382',
    sections: Object.keys(sections).length,
    parts: Object.values(sections).reduce((total, rows) => total + rows.length, 0)
  }
}));

console.log(JSON.stringify({
  model: structure.model,
  sections: Object.keys(sections).length,
  rows: Object.values(sections).reduce((total, rows) => total + rows.length, 0),
  output
}, null, 2));
