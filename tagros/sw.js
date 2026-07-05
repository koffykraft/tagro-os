const CACHE='tagro-white-v24';
importScripts('/os-manifest.js');
const APP_FILES=TAGRO_MANIFEST.apps.filter(app=>app.enabled&&app.file).map(app=>'/'+app.file);
const SHELL=[...new Set(['/login.html','/work.html','/manage.html','/robots.txt','/os-shell.css','/service.css','/my-space.css','/intake.css','/work-space.css','/os-core.js','/app-shell.js','/service-ui.js','/work-order-form.js','/my-space.js','/intake.js','/work-space.js','/os-manifest.js','/os-icons.js','/tagro-logo.png',...APP_FILES])];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));});
