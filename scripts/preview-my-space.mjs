import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../tagros/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const port = Number(process.env.PORT || 4174);
const workOrder = {
  id: 'preview-work-order',
  workOrder: 'PREVIEW-WORK-ORDER',
  machineDescription: 'Assigned machine',
  complaint: 'Inspection',
  status: 'received',
  statusLabel: 'Received'
};
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function json(response, body) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/auth/session') {
    json(response, {
      ok: true,
      staff: { id: 'preview-staff', name: 'Workshop Staff', role: 'staff', branch: 'KVR', branchName: 'TAGRO Workshop' }
    });
    return;
  }
  if (url.pathname === '/api/work-orders') {
    json(response, { ok: true, workOrders: [workOrder] });
    return;
  }
  if (url.pathname === '/api/auth/logout') {
    json(response, { ok: true });
    return;
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = normalize(join(root, requested));
  if (!file.startsWith(normalize(root))) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`My Space preview: http://127.0.0.1:${port}`);
});
