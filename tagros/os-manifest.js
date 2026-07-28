const TAGRO_MANIFEST = {
  api: '/api',
  version: '1.0.0',
  build: '2026-06-white',
  apps: [
    { id:'home', label:'My Space', navIcon:'⌂', navigation:['desktop','mobile-core','mobile-receive'], description:'Personal workshop home', file:'index.html', enabled:true, ready:true, launcher:false, access:{roles:['all']} },
    { id:'receive', label:'Receive', navIcon:'＋', navigation:['desktop','mobile-core','mobile-receive'], description:'Receive a machine for service', file:'receive.html', enabled:true, ready:true, launcher:false, access:{roles:['all']} },
    { id:'bench', label:'My Bench', navIcon:'⌑', navigation:['desktop','mobile-core','mobile-receive'], description:'Assigned workshop jobs', file:'bench.html', enabled:true, ready:true, launcher:false, access:{roles:['all']} },
    { id:'jobs', label:'Workbench', navIcon:'W', navigation:['desktop','drawer'], icon:'jobs', description:'Daily workshop queue and active machine work', file:'app-jobs.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'customers', label:'Customers', navIcon:'C', navigation:['desktop','drawer'], icon:'customers', description:'Customer profiles, contacts and machine history', file:'app-customers.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'branches', label:'Branches', navIcon:'B', navigation:['desktop','drawer'], icon:'branches', description:'Business locations, contact details and settings', file:'app-branches.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'machines', label:'Machines', navIcon:'M', navigation:['desktop','drawer'], icon:'machines', description:'Machine makes, models and specifications', file:'app-machines.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'catalog', label:'Parts', navIcon:'P', navigation:['desktop','drawer'], icon:'catalog', description:'Parts, machines, accessories and service items', file:'app-catalog.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'stock-count', label:'Stock Count', navIcon:'N', navigation:['desktop','drawer'], icon:'catalog', description:'Count branch stock and submit it safely', file:'stock-count/index.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'purchase-orders', label:'Purchase Orders', navIcon:'P', navigation:['desktop','drawer'], icon:'purchase', description:'Create branch orders and export TAGRO and STIHL workbooks', file:'app-purchase-orders.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'settings', label:'Settings', navIcon:'⚙', navigation:['drawer'], description:'Personal workshop settings', file:'index.html#settings', enabled:true, ready:true, launcher:false, access:{roles:['all']} },
    { id:'services', label:'Service Rates', navIcon:'S', navigation:['desktop','drawer'], icon:'services', description:'Labour names, SAC, GST and standard charges', file:'app-services.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'staff', label:'Staff', navIcon:'T', navigation:['desktop','drawer'], icon:'staff', description:'Staff accounts, roles and branch access', file:'app-staff.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'reports', label:'Reports', navIcon:'R', navigation:['desktop','drawer'], icon:'reports', description:'Operational summaries and review queues', file:'app-reports.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'warehouse', label:'Warehouse', navIcon:'H', navigation:['desktop','drawer'], icon:'reports', description:'Historical sales and purchase records', file:'app-warehouse.html', enabled:true, ready:true, access:{roles:['all']} }
  ],
  canAccess(app, session) {
    if (!app?.enabled || !session) return false;
    const role = String(session.role || 'staff').toLowerCase();
    return app.access.roles.includes('all') || app.access.roles.includes(role);
  }
};
globalThis.TAGRO_MANIFEST = TAGRO_MANIFEST;
