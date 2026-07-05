const ServiceUI={
  esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))},
  date(value){if(!value)return'';return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})},
  shortDate(value){if(!value)return'';return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short'})},
  money(value){return value===null||value===undefined||value===''?'':Number(value).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2})},
  machine(order){return order.machineDescription||[order.makeName,order.modelName].filter(Boolean).join(' ')||'Machine details pending'},
  customer(order){return order.customerName||order.customerPhone||'Customer details pending'},
  async session(){
    const current=await Session.restore();
    if(!current){location.replace('login.html');return null}
    return current;
  },
  header(session){
    const initials=(session.name||'Staff').split(/\s+/).map(word=>word[0]).join('').slice(0,2).toUpperCase();
    const header=document.querySelector('.service-header');
    if(!header)return;
    header.innerHTML='<a href="index.html"><img class="service-logo" src="tagro-logo.png" alt="TAGRO"></a><span class="header-space"></span><span class="branch-chip">'+this.esc(session.branch||'')+'</span><button class="user-chip" id="user-menu" type="button" title="Account">'+this.esc(initials)+'</button>';
    document.getElementById('user-menu').addEventListener('click',async()=>{
      if(String(session.role).toLowerCase()==='owner'||String(session.role).toLowerCase()==='manager'){
        location.href='manage.html';
      }else if(confirm('Sign out of TAGRO Service?')){
        await Api.request('/auth/logout',{method:'POST'}).catch(()=>{});
        Session.clear();location.replace('login.html');
      }
    });
  },
  jobCard(order){
    return '<a class="job-card" href="work.html?id='+encodeURIComponent(order.id)+'"><div class="job-main"><div class="job-title">'+this.esc(this.machine(order))+' · '+this.esc(this.customer(order))+'</div><div class="job-meta">'+this.esc(order.complaint||'Complaint can be added later')+'</div></div><div class="job-side"><div class="job-number">'+this.esc(order.workOrder)+'</div><span class="status">'+this.esc(order.statusLabel)+'</span></div></a>';
  },
  debounce(fn,delay=500){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay)}}
};
