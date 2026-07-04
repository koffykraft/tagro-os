const TAGRO_MANIFEST = {
  api: '/api',
  version: '1.0.0',
  build: '2026-06-white',
  apps: [
    { id:'customers', label:'Customers', icon:'customers', description:'Customer profiles, contacts and machine history', file:'app-customers.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'branches', label:'Branches', icon:'branches', description:'Business locations, contact details and settings', file:'app-branches.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'machines', label:'Machines', icon:'machines', description:'Machine makes, models and specifications', file:'app-machines.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'catalog', label:'Items & Parts', icon:'catalog', description:'Machines, accessories, parts and service items', file:'app-catalog.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'purchase-orders', label:'Purchase Orders', icon:'purchase', description:'Create branch orders and export TAGRO and STIHL workbooks', file:'app-purchase-orders.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'services', label:'Service Rates', icon:'services', description:'Labour names, SAC, GST and standard charges', file:'app-services.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'jobs', label:'Repair Jobs', icon:'jobs', description:'Receive, inspect, repair and deliver machines', file:'app-jobs.html', enabled:true, ready:true, access:{roles:['all']} },
    { id:'staff', label:'Staff', icon:'staff', description:'Staff accounts, roles and branch access', file:'app-staff.html', enabled:true, ready:true, access:{roles:['manager','owner']} },
    { id:'reports', label:'Reports', icon:'reports', description:'Operational summaries and review queues', file:'app-reports.html', enabled:true, ready:true, access:{roles:['manager','owner']} }
  ],
  canAccess(app, session) {
    if (!app?.enabled || !session) return false;
    const role = String(session.role || 'staff').toLowerCase();
    return app.access.roles.includes('all') || app.access.roles.includes(role);
  }
};
