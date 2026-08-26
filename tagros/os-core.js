const OS = {
  get(key, fallback=null) { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  del(key) { localStorage.removeItem(key); },
  esc(value) { return value == null ? '' : String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
};
const Workspace = {
  key: 'tagro_workspace_context_v1',
  empty() {
    return {
      version: 1,
      scope: { staffId: null, branchId: null },
      current: { planeId: null, appId: null, href: null },
      previous: null,
      objects: { customerId: null, machineId: null, model: null, jobId: null },
      selectedParts: [],
      cart: { id: null, lineCount: 0 },
      updatedAt: null
    };
  },
  read() { return OS.get(this.key, this.empty()); },
  write(context) {
    const next = { ...this.empty(), ...context, updatedAt: new Date().toISOString() };
    next.scope = { ...this.empty().scope, ...(context.scope || {}) };
    next.current = { ...this.empty().current, ...(context.current || {}) };
    next.objects = { ...this.empty().objects, ...(context.objects || {}) };
    next.cart = { ...this.empty().cart, ...(context.cart || {}) };
    next.selectedParts = Array.isArray(context.selectedParts) ? context.selectedParts : [];
    OS.set(this.key, next);
    window.dispatchEvent(new CustomEvent('tagro:workspace-change', { detail: next }));
    return next;
  },
  bindSession(profile) {
    if (!profile) return this.read();
    const current = this.read();
    const scope = { staffId: profile.id || profile.staff_id || null, branchId: profile.branch_id || profile.branchId || null };
    const changedStaff = current.scope?.staffId && scope.staffId && current.scope.staffId !== scope.staffId;
    const changedBranch = current.scope?.branchId && scope.branchId && current.scope.branchId !== scope.branchId;
    if (changedStaff || changedBranch) return this.write({ ...this.empty(), scope });
    return this.write({ ...current, scope });
  },
  setObjects(patch) { const current = this.read(); return this.write({ ...current, objects: { ...current.objects, ...patch } }); },
  setSelection(selectedParts, cart = null) {
    const current = this.read();
    return this.write({ ...current, selectedParts: Array.isArray(selectedParts) ? selectedParts : current.selectedParts, cart: cart ? { ...current.cart, ...cart } : current.cart });
  },
  resolvePlane(appId, url = new URL(location.href)) {
    const requested = url.searchParams.get('plane');
    if (requested && TAGRO_MANIFEST.plane(requested)) return requested;
    const path = url.pathname.split('/').pop() || 'index.html';
    if (path === 'work.html') return url.hash === '#parts-reference' ? 'parts-selection' : 'service-handoff';
    if (path === 'billing-mobile.html') return url.hash === '#cart' ? 'cart' : 'sell';
    if (path === 'app-catalog.html') return url.searchParams.has('job') ? 'parts-selection' : 'model-parts';
    return TAGRO_MANIFEST.planeForApp(appId)?.id || null;
  },
  capture(appId, url = new URL(location.href)) {
    const current = this.read();
    const nextLocation = { planeId: this.resolvePlane(appId, url), appId: appId || null, href: url.pathname + url.search + url.hash };
    const objects = { ...current.objects };
    const value = name => url.searchParams.get(name);
    if (value('customer')) objects.customerId = value('customer');
    if (value('machine')) objects.machineId = value('machine');
    if (value('model')) objects.model = value('model');
    if (value('job') || (url.pathname.endsWith('/work.html') && value('id'))) objects.jobId = value('job') || value('id');
    const moved = current.current?.href && current.current.href !== nextLocation.href;
    return this.write({ ...current, previous: moved ? current.current : current.previous, current: nextLocation, objects });
  },
  rememberDestination(appId, href) {
    const url = new URL(href, location.href); const current = this.read();
    return this.write({ ...current, previous: current.current, current: { planeId: this.resolvePlane(appId, url), appId: appId || null, href: url.pathname + url.search + url.hash } });
  },
  clear() { OS.del(this.key); }
};
globalThis.TAGRO_WORKSPACE = Workspace;
const Session = {
  get: () => OS.get('tagro_session_profile', null),
  set: profile => { OS.set('tagro_session_profile', profile); Workspace.bindSession(profile); },
  clear: () => { OS.del('tagro_session_profile'); Workspace.clear(); },
  async restore() {
    try {
      const response=await fetch(TAGRO_MANIFEST.api+'/auth/session',{credentials:'include',headers:{Accept:'application/json'}});
      const data=await response.json();
      if(!response.ok||!data.ok||!data.staff) throw new Error('Session expired');
      Session.set(data.staff); return data.staff;
    } catch { Session.clear(); return null; }
  },
  async logout() { try { await fetch(TAGRO_MANIFEST.api+'/auth/logout',{method:'POST',credentials:'include'}); } catch {} Session.clear(); }
};
window.addEventListener('DOMContentLoaded',()=>{
  const active=document.querySelector('[data-active-app]')?.dataset.activeApp||null;
  Workspace.bindSession(Session.get());
  if(active) Workspace.capture(active);
});
const Api = {
  async request(path, options={}) {
    const isFormData=typeof FormData!=='undefined'&&options.body instanceof FormData;
    const headers={Accept:'application/json',...(options.body&&!isFormData?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    const response=await fetch(TAGRO_MANIFEST.api+path,{credentials:'include',...options,headers});
    const data=await response.json().catch(()=>({ok:false,error:'Invalid server response.'}));
    if(response.status===401){Session.clear();location.href='login.html';throw new Error('Session expired.');}
    if(!response.ok||!data.ok){const error=new Error(data.error||'Unable to complete the request.');error.data=data;error.status=response.status;throw error;}
    return data;
  }
};
const Toast = { show(message) { const node=document.getElementById('toast'); if(!node)return; node.textContent=message; node.classList.add('show'); clearTimeout(Toast.timer); Toast.timer=setTimeout(()=>node.classList.remove('show'),2600); } };
