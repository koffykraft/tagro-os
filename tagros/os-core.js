const OS = {
  get(key, fallback=null) { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  del(key) { localStorage.removeItem(key); },
  esc(value) { return value == null ? '' : String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
};
const Session = {
  get: () => OS.get('tagro_session_profile', null),
  set: profile => OS.set('tagro_session_profile', profile),
  clear: () => OS.del('tagro_session_profile'),
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
