const WorkOrderForm={
  mode:'edit',id:null,order:null,customerId:null,parts:[],saving:false,queued:false,session:null,
  async mount(options){
    this.mode=options.mode||'edit';this.id=options.id||null;this.session=options.session;
    this.bind();
    if(this.mode==='edit'){
      const data=await Api.request('/work-orders/'+encodeURIComponent(this.id));
      this.order=data.workOrder;this.populate(data.workOrder);
    }else{
      this.parts=[];this.renderParts();this.setState('Accept first. Inspection, parts and billing come later.','');
    }
  },
  async consumePartsHandoff(){
    if(this.mode!=='edit'||!this.id)return false;
    const key=`tagro_parts_handoff_${this.id}`;
    const incoming=OS.get(key,[]);
    if(!Array.isArray(incoming)||!incoming.length)return false;
    for(const part of incoming){
      if(!part?.partNumber||!part?.itemName)continue;
      const existing=this.parts.find(item=>item.partNumber===part.partNumber&&!item.draft);
      if(existing){
        existing.quantity=Number(existing.quantity||0)+Number(part.quantity||1);
        if(part.unitPrice!==''&&part.unitPrice!=null)existing.unitPrice=part.unitPrice;
      }else{
        this.parts.push({
          partNumber:part.partNumber,itemName:part.itemName,quantity:Number(part.quantity)||1,
          unitPrice:part.unitPrice??'',hsnSac:part.hsnSac||'',gstRate:part.gstRate??'',
          notes:part.notes||'',source:part.source||'parts_master',draft:false
        });
      }
    }
    this.renderParts();
    const saved=await this.save(false);
    if(!saved)return false;
    OS.del(key);
    Toast.show(`${incoming.length} selected part${incoming.length===1?'':'s'} added to this job.`);
    return true;
  },
  bind(){
    document.getElementById('add-part').addEventListener('click',()=>document.dispatchEvent(new CustomEvent('tagro:open-parts')));
    document.getElementById('customer-search').addEventListener('input',ServiceUI.debounce(()=>this.searchCustomers(),300));
    document.getElementById('customer-search').addEventListener('keydown',event=>{if(event.key==='Escape')this.hideSearch()});
    document.querySelectorAll('[data-accessory]').forEach(button=>button.addEventListener('click',()=>{
      button.classList.toggle('selected');this.changed();
    }));
    document.querySelectorAll('[data-complaint]').forEach(button=>button.addEventListener('click',()=>{
      const complaint=document.getElementById('complaint'),value=button.dataset.complaint;
      document.querySelectorAll('[data-complaint]').forEach(choice=>{choice.classList.remove('selected');choice.setAttribute('aria-pressed','false')});
      button.classList.add('selected');button.setAttribute('aria-pressed','true');
      if(value==='Other'){complaint.value='';complaint.focus()}
      else complaint.value=value;
      this.changed();
    }));
    document.querySelectorAll('#work-order-form input,#work-order-form textarea,#work-order-form select').forEach(control=>{
      if(control.id!=='customer-search')control.addEventListener('input',()=>this.changed());
    });
    document.getElementById('work-order-form').addEventListener('submit',event=>{event.preventDefault();this.mode==='new'?this.create():this.save(true)});
  },
  populate(order){
    this.customerId=order.customerId;
    const fields={
      'customer-name':order.customerName,'customer-phone':order.customerPhone,'customer-place':order.customerPlace,
      'machine-description':order.machineDescription,'machine-serial':order.serialNumber,
      'complaint':order.complaint,'observation':order.observation,'work-done':order.workDone,
      'billing-subtotal':order.billingSubtotal,'billing-tax':order.billingTax,
      'billing-total':order.billingTotal,'billing-note':order.billingNote
    };
    Object.entries(fields).forEach(([id,value])=>{document.getElementById(id).value=value??''});
    document.querySelectorAll('[data-complaint]').forEach(button=>{
      const selected=button.dataset.complaint===order.complaint;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',selected?'true':'false');
    });
    document.querySelectorAll('[data-accessory]').forEach(button=>button.classList.toggle('selected',(order.accessories||[]).includes(button.dataset.accessory)));
    this.parts=(order.parts||[]).map(part=>({
      partNumber:part.part_number||'',itemName:part.item_name||'',quantity:part.quantity??1,
      unitPrice:part.unit_price??'',hsnSac:part.hsn_sac||'',gstRate:part.gst_rate??'',
      notes:part.notes||'',source:part.source||'manual',draft:!(part.part_number&&part.item_name)
    }));
    this.renderParts();
    this.renderIntakePhotos(order.intake);
    document.getElementById('screen-title').textContent=order.workOrder;
    const subtitle=document.getElementById('screen-subtitle');
    if(subtitle)subtitle.textContent=ServiceUI.date(order.openedAt)+' · accepted by '+(order.openedByName||'staff');
    this.setState('All changes are saved automatically.','good');
  },
  renderIntakePhotos(intake){
    const panel=document.getElementById('intake-photo-panel'),host=document.getElementById('work-intake-photos');
    if(!panel||!host)return;
    const photos=intake?.photos||[];
    panel.hidden=!photos.length;
    host.innerHTML=photos.map(photo=>'<a class="work-intake-photo" href="'+ServiceUI.esc(photo.url)+'" target="_blank" rel="noopener"><img src="'+ServiceUI.esc(photo.url)+'" alt="'+ServiceUI.esc(photo.photoType||'Intake photo')+'" loading="lazy"><span>'+ServiceUI.esc(String(photo.photoType||'photo').replaceAll('_',' '))+'</span></a>').join('');
  },
  value(id){return document.getElementById(id).value.trim()},
  payload(){
    this.readParts();
    const savedParts=this.parts.filter(part=>!part.draft&&part.partNumber&&part.itemName);
    return{
      customerId:this.customerId,customerName:this.value('customer-name'),customerPhone:this.value('customer-phone'),
      customerPlace:this.value('customer-place'),machineDescription:this.value('machine-description'),
      serialNumber:this.value('machine-serial'),
      accessories:[...document.querySelectorAll('[data-accessory].selected')].map(button=>button.dataset.accessory),
      complaint:this.value('complaint'),observation:this.value('observation'),workDone:this.value('work-done'),
      parts:savedParts,billingSubtotal:this.value('billing-subtotal'),billingTax:this.value('billing-tax'),
      billingTotal:this.value('billing-total'),billingNote:this.value('billing-note'),
      assignedTo:document.getElementById('assigned-to')?.value||this.order?.assignedTo||null
    };
  },
  changed(){
    if(this.mode!=='edit')return;
    this.setState('Unsaved changes…','');
    this.queueSave();
  },
  queueSave:ServiceUI.debounce(()=>WorkOrderForm.save(false),700),
  async create(){
    const button=document.getElementById('accept-machine');button.disabled=true;button.textContent='Accepting machine…';
    this.setState('Creating the work order…','');
    try{
      const data=await Api.request('/work-orders',{method:'POST',body:JSON.stringify(this.payload())});
      location.replace('work.html?id='+encodeURIComponent(data.workOrder.id));
    }catch(error){
      this.setState(error.message,'bad');button.disabled=false;button.textContent='Accept machine';
    }
  },
  async save(explicit){
    if(this.saving){this.queued=true;return false}
    this.saving=true;this.setState('Saving…','');
    try{
      const data=await Api.request('/work-orders/'+encodeURIComponent(this.id),{method:'PUT',body:JSON.stringify(this.payload())});
      this.order=data.workOrder;this.customerId=data.workOrder.customerId;this.setState('Saved '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),'good');
      document.dispatchEvent(new CustomEvent('tagro:work-order-saved',{detail:{workOrder:data.workOrder}}));
      if(explicit)Toast.show('Work order saved.');
      return true;
    }catch(error){this.setState(error.message,'bad');return false}
    finally{this.saving=false;if(this.queued){this.queued=false;this.save(false)}}
  },
  setState(message,kind){
    const node=document.getElementById('save-state');node.textContent=message;
    node.className=(document.body.classList.contains('job-workspace-page')?'workspace-save':'save-state')+(kind?' '+kind:'');
    const details=document.getElementById('details-save-state');if(details)details.textContent=message;
  },
  async searchCustomers(){
    const query=this.value('customer-search'),results=document.getElementById('customer-results');
    if(query.length<2){this.hideSearch();return}
    try{
      const data=await Api.request('/customers?query='+encodeURIComponent(query)+'&limit=8');
      const customers=data.customers||[];
      results.innerHTML=customers.length?customers.map(customer=>'<button class="search-result" type="button" data-customer-id="'+ServiceUI.esc(customer.id)+'"><strong>'+ServiceUI.esc(customer.name)+'</strong><small>'+ServiceUI.esc([customer.phone,customer.address].filter(Boolean).join(' · '))+'</small></button>').join(''):'<div class="search-result"><strong>No previous customer</strong><small>Continue typing the new details below.</small></div>';
      results.classList.remove('hidden');
      results.querySelectorAll('[data-customer-id]').forEach(button=>button.addEventListener('click',()=>this.chooseCustomer(customers.find(item=>item.id===button.dataset.customerId))));
    }catch(error){results.innerHTML='<div class="search-result">'+ServiceUI.esc(error.message)+'</div>';results.classList.remove('hidden')}
  },
  async chooseCustomer(customer){
    this.customerId=customer.id;document.getElementById('customer-name').value=customer.name||'';
    document.getElementById('customer-phone').value=customer.phone||'';document.getElementById('customer-place').value=customer.address||'';
    document.getElementById('customer-search').value=customer.name||'';this.hideSearch();this.changed();
    try{
      const data=await Api.request('/customers/'+encodeURIComponent(customer.id)+'/machines');
      this.renderMachines(data.machines||[]);
    }catch(error){}
  },
  renderMachines(machines){
    const wrap=document.getElementById('known-machines');
    if(!machines.length){wrap.innerHTML='';return}
    wrap.innerHTML='<div class="quiet" style="margin-bottom:7px">Previous machines</div><div class="chip-row">'+machines.map(machine=>'<button type="button" class="choice-chip" data-machine-id="'+ServiceUI.esc(machine.id)+'">'+ServiceUI.esc(machine.display_name)+'</button>').join('')+'</div>';
    wrap.querySelectorAll('[data-machine-id]').forEach(button=>button.addEventListener('click',()=>{
      const machine=machines.find(item=>item.id===button.dataset.machineId);
      document.getElementById('machine-description').value=machine.display_name||'';
      document.getElementById('machine-serial').value=machine.serial_number||'';this.changed();
    }));
  },
  hideSearch(){document.getElementById('customer-results').classList.add('hidden')},
  readParts(){
    this.parts=[...document.querySelectorAll('.part-row')].map(row=>({
      partNumber:row.querySelector('[data-part-number]').value.trim(),itemName:row.querySelector('[data-part-name]').value.trim(),
      quantity:row.querySelector('[data-part-quantity]').value,unitPrice:row.querySelector('[data-part-price]').value,
      hsnSac:row.dataset.partHsn||'',gstRate:row.dataset.partGst??'',notes:row.dataset.partNotes||'',
      source:row.dataset.partSource||'manual',draft:row.dataset.partDraft==='1'
    }));
  },
  legacyRenderParts(){
    const list=document.getElementById('part-list');
    list.innerHTML=this.parts.map((part,index)=>'<div class="part-row" data-part-index="'+index+'" data-part-hsn="'+ServiceUI.esc(part.hsnSac||'')+'" data-part-gst="'+ServiceUI.esc(part.gstRate??'')+'" data-part-notes="'+ServiceUI.esc(part.notes||'')+'" data-part-source="'+ServiceUI.esc(part.source||'manual')+'"><input class="control" data-part-number placeholder="Part number" value="'+ServiceUI.esc(part.partNumber||'')+'"><input class="control" data-part-name placeholder="Part name / description" value="'+ServiceUI.esc(part.itemName||'')+'"><input class="control" data-part-quantity type="number" min=".01" step=".01" placeholder="Qty" value="'+ServiceUI.esc(part.quantity??1)+'"><input class="control" data-part-price type="number" min="0" step=".01" placeholder="Price" value="'+ServiceUI.esc(part.unitPrice??'')+'"><button class="remove-part" type="button" aria-label="Remove part">×</button></div>').join('');
    list.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>this.changed()));
    list.querySelectorAll('.remove-part').forEach((button,index)=>button.addEventListener('click',()=>{this.readParts();this.parts.splice(index,1);this.renderParts();this.changed()}));
    document.dispatchEvent(new CustomEvent('tagro:parts-updated'));
  },
  renderParts(){
    const list=document.getElementById('part-list');
    list.innerHTML=this.parts.map((part,index)=>{
      const source=part.source||'manual',draft=Boolean(part.draft),locked=source!=='manual'&&!draft;
      const sourceLabel=locked?'Catalogue part':(draft?'Unsaved manual draft':'Manual part');
      return '<div class="part-row" data-part-index="'+index+'" data-part-hsn="'+ServiceUI.esc(part.hsnSac||'')+'" data-part-gst="'+ServiceUI.esc(part.gstRate??'')+'" data-part-notes="'+ServiceUI.esc(part.notes||'')+'" data-part-source="'+ServiceUI.esc(source)+'" data-part-draft="'+(draft?'1':'0')+'"><input class="control" data-part-number placeholder="Part number" value="'+ServiceUI.esc(part.partNumber||'')+'" '+(locked?'readonly':'')+'><input class="control" data-part-name placeholder="Part name / description" value="'+ServiceUI.esc(part.itemName||'')+'" '+(locked?'readonly':'')+'><input class="control" data-part-quantity type="number" min=".01" step=".01" placeholder="Qty" value="'+ServiceUI.esc(part.quantity??1)+'"><input class="control" data-part-price type="number" min="0" step=".01" placeholder="Price" value="'+ServiceUI.esc(part.unitPrice??'')+'"><span class="part-source">'+ServiceUI.esc(sourceLabel)+'</span>'+(draft?'<button class="confirm-part" type="button">Confirm</button>':'')+'<button class="remove-part" type="button" aria-label="Remove part">×</button></div>';
    }).join('');
    list.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>this.changed()));
    list.querySelectorAll('.confirm-part').forEach(button=>button.addEventListener('click',()=>{
      const row=button.closest('.part-row');
      if(!row.querySelector('[data-part-number]').value.trim()||!row.querySelector('[data-part-name]').value.trim()){
        Toast.show('Enter both part number and part name before confirming.');return;
      }
      row.dataset.partDraft='0';button.remove();row.querySelector('.part-source').textContent='Manual part';this.changed();
    }));
    list.querySelectorAll('.remove-part').forEach((button,index)=>button.addEventListener('click',()=>{
      this.readParts();this.parts.splice(index,1);this.renderParts();this.changed();
    }));
    document.dispatchEvent(new CustomEvent('tagro:parts-updated'));
  }
};
