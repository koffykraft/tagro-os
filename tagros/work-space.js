const JobWorkspace = {
  session: null,
  id: null,
  order: null,
  allOrders: [],
  queueOrders: [],
  staff: [],
  estimate: null,
  frequentKey: '',
  toastTimer: null,
  partsTimer: null,
  modelKey: '',
  benchModelOverride: '',
  modelParts: [],
  loadedModelKey: '',
  diagramAsset: null,
  diagramImages: [],
  modelChoicesLoaded: false,
  activeSection: '',
  partsMode: 'fast',

  async mount({ session, id, order }) {
    this.session = session;
    this.id = id;
    this.order = order;
    this.frequentKey = `tagro_frequent_parts_${session.id || 'staff'}`;
    this.applyIdentity();
    this.bind();
    this.renderOrder();
    this.consumePartHandoff();
    await this.loadSupplementary();
  },

  applyIdentity() {
    const name = String(this.session.name || 'Staff').trim();
    const initials = name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase() || 'ST';
    document.getElementById('profile-button').textContent = initials;
  },

  bind() {
    document.getElementById('mobile-menu').addEventListener('click', () => this.openDrawer());
    document.getElementById('mobile-more').addEventListener('click', () => this.openDrawer());
    document.getElementById('profile-button').addEventListener('click', () => this.openDrawer());
    document.querySelector('.drawer-backdrop').addEventListener('click', () => this.closeDrawer());
    document.querySelector('.drawer-heading button').addEventListener('click', () => this.closeDrawer());
    document.getElementById('sign-out').addEventListener('click', () => this.signOut());
    document.getElementById('edit-details').addEventListener('click', () => this.openDialog('job-details-dialog'));
    document.getElementById('edit-bench-details').addEventListener('click', () => this.openDialog('job-details-dialog'));
    document.getElementById('open-parts-search').addEventListener('click', () => this.openPartsPicker());
    document.getElementById('open-visual-reference').addEventListener('click', async () => {
      await this.openParts();
      this.setPartsMode('visual');
    });
    document.getElementById('edit-frequent').addEventListener('click', () => this.openParts());
    document.getElementById('close-parts-sheet').addEventListener('click', () => this.closeParts());
    document.getElementById('add-manual-part').addEventListener('click', () => this.addManualPart());
    document.getElementById('create-estimate').addEventListener('click', () => this.createEstimate());
    document.getElementById('parts-search-button').addEventListener('click', () => this.searchParts());
    document.getElementById('parts-fast-mode').addEventListener('click', () => this.setPartsMode('fast'));
    document.getElementById('parts-visual-mode').addEventListener('click', () => this.setPartsMode('visual'));
    document.getElementById('parts-model-select').addEventListener('change', async event => {
      this.modelKey = event.target.value;
      this.benchModelOverride = this.modelKey;
      this.loadedModelKey = '';
      document.getElementById('parts-model-title').textContent = this.modelLabel(this.modelKey);
      document.getElementById('parts-query').value = '';
      this.updatePartsLinks();
      await this.loadWorkbenchParts();
      await this.loadModelParts();
    });
    document.getElementById('parts-query').addEventListener('input', () => {
      clearTimeout(this.partsTimer);
      this.partsTimer = setTimeout(() => this.searchParts(), 220);
    });
    document.getElementById('parts-query').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.searchParts(); }
    });
    document.getElementById('bench-part-search-button').addEventListener('click', () => this.searchBenchParts());
    document.getElementById('bench-part-query').addEventListener('input', () => {
      clearTimeout(this.partsTimer);
      this.partsTimer = setTimeout(() => this.searchBenchParts(), 180);
    });
    document.getElementById('bench-part-query').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.searchBenchParts(); }
    });
    document.getElementById('switch-job').addEventListener('click', () => this.openSwitch());
    document.getElementById('previous-job').addEventListener('click', () => this.navigateRelative(-1));
    document.getElementById('next-job').addEventListener('click', () => this.navigateRelative(1));
    document.getElementById('park-job').addEventListener('click', () => this.parkJob());
    document.getElementById('refresh-queue').addEventListener('click', () => this.loadQueue());
    document.getElementById('assigned-to').addEventListener('change', () => {
      WorkOrderForm.changed();
      document.getElementById('technician-name').textContent =
        document.getElementById('assigned-to').selectedOptions[0]?.textContent || 'Unassigned';
    });
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
      document.getElementById(button.dataset.closeDialog).close();
    }));
    document.querySelectorAll('.quick-note').forEach(button => button.addEventListener('click', () => {
      this.copyCustomerTemplate(button.dataset.template);
    }));
    document.querySelectorAll('.workspace-tabs a').forEach(link => link.addEventListener('click', () => {
      document.querySelectorAll('.workspace-tabs a').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    }));
    document.addEventListener('tagro:parts-updated', () => this.renderBasket());
    document.addEventListener('tagro:open-parts', () => this.openParts());
    document.addEventListener('tagro:work-order-saved', event => {
      if (!event.detail?.workOrder) return;
      this.order = event.detail.workOrder;
      this.renderOrder();
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('global-query').focus();
      }
      if (event.key === 'Escape') this.closeDrawer();
    });
  },

  async loadSupplementary() {
    const role = String(this.session.role || '').toLowerCase();
    await Promise.all([
      this.loadQueue(),
      this.loadEstimate(),
      this.loadWorkbenchParts(),
      ['manager', 'owner'].includes(role) ? this.loadStaff() : Promise.resolve()
    ]);
    this.renderFrequentParts();
  },

  async refreshOrder() {
    const data = await Api.request('/work-orders/' + encodeURIComponent(this.id));
    this.order = data.workOrder;
    WorkOrderForm.order = data.workOrder;
    WorkOrderForm.populate(data.workOrder);
    this.renderOrder();
  },

  renderOrder() {
    const order = this.order || {};
    const machine = ServiceUI.machine(order) || 'Machine details pending';
    const complaint = order.complaint || 'Complaint not recorded';
    document.title = `${machine} — TAGRO`;
    document.getElementById('top-work-order').textContent = order.workOrder || 'Work order';
    document.getElementById('top-machine').textContent = machine;
    document.getElementById('screen-title').textContent = order.workOrder || 'Work order';
    document.getElementById('job-machine').textContent = machine;
    document.getElementById('job-complaint').textContent = complaint;
    document.getElementById('job-age').textContent = this.age(order.openedAt);
    document.getElementById('job-status').textContent = order.statusLabel || this.title(order.status);
    document.getElementById('job-status').className = `workspace-status ${this.statusClass(order.status)}`;
    document.getElementById('job-assignee').textContent = order.assignedToName || 'Unassigned';
    document.getElementById('job-last-update').textContent = this.lastUpdateText(order);
    document.getElementById('technician-name').textContent = order.assignedToName || 'Unassigned';
    this.ensureAssignedOption(order);
    this.renderProgress();
    this.renderNextAction();
    this.renderBasket();
    this.renderTimeline();
    this.renderCommunication();
    this.renderBenchFacts();
    if (!this.benchModelOverride) this.modelKey = this.machineModel(order.machineDescription || machine);
    const globalUrl = `app-catalog.html?job=${encodeURIComponent(this.id)}&model=${encodeURIComponent(this.modelKey)}`;
    document.getElementById('global-parts-link').href = globalUrl;
    document.getElementById('model-reference-link').href = globalUrl;
    document.getElementById('open-global-parts').href = globalUrl;
    document.getElementById('order-parts-link').href = globalUrl;
  },

  renderBenchFacts() {
    const order = this.order || {};
    const phone = String(order.customerPhone || '').replace(/\D/g, '');
    document.getElementById('bench-customer').textContent = order.customerName || 'Not recorded';
    document.getElementById('bench-phone').textContent = order.customerPhone || 'Not recorded';
    document.getElementById('bench-phone').href = phone ? `tel:${phone}` : '#';
    document.getElementById('bench-place').textContent = order.customerPlace || 'Not recorded';
    document.getElementById('bench-machine').textContent = ServiceUI.machine(order);
    document.getElementById('bench-serial').textContent = order.serialNumber || 'Not recorded';
    document.getElementById('bench-technician').textContent = order.assignedToName || 'Unassigned';
    document.getElementById('bench-complaint').textContent = order.complaint || 'Not recorded';
    document.getElementById('bench-observation').textContent = order.observation || 'No observation yet.';
  },

  ensureAssignedOption(order) {
    const select = document.getElementById('assigned-to');
    if (order.assignedTo && ![...select.options].some(option => option.value === order.assignedTo)) {
      select.add(new Option(order.assignedToName || 'Assigned technician', order.assignedTo));
    }
    select.value = order.assignedTo || '';
    const role = String(this.session.role || '').toLowerCase();
    select.disabled = !['manager', 'owner'].includes(role);
    select.title = select.disabled ? 'Managers assign technicians' : 'Assign this job';
  },

  renderProgress() {
    const steps = [
      ['received', 'Received'],
      ['inspecting', 'Inspection'],
      ['awaiting_approval', 'Approval'],
      ['repairing', 'Repair'],
      ['ready', 'Ready'],
      ['returned', 'Returned']
    ];
    const status = String(this.order.status || 'received');
    const rank = { received: 0, inspecting: 1, awaiting_approval: 2, repairing: 3, paused: 3, waiting_parts: 3, ready: 4, returned: 5 };
    const current = rank[status] ?? 0;
    document.getElementById('progress-track').innerHTML = steps.map(([key, label], index) => {
      const className = index < current ? 'done' : index === current ? 'current' : '';
      return `<span class="progress-step ${className}"><i>${index < current ? '✓' : index + 1}</i>${ServiceUI.esc(label)}</span>`;
    }).join('');
  },

  statusActions() {
    const map = {
      received: [['job_taken', 'Take this job', true]],
      inspecting: [['repair_started', 'Start repair', true], ['parts_requested', 'Waiting for parts', false], ['job_paused', 'Pause job', false]],
      awaiting_approval: [['estimate_approved', 'Approval received', true], ['job_paused', 'Pause job', false]],
      repairing: [['parts_requested', 'Waiting for parts', false], ['job_paused', 'Pause job', false], ['job_completed', 'Work complete', true]],
      paused: [['job_resumed', 'Resume job', true]],
      waiting_parts: [['job_resumed', 'Parts arrived — resume', true]],
      ready: [['job_returned', 'Return machine', true]],
      returned: [],
      cancelled: []
    };
    return map[this.order.status] || [];
  },

  renderNextAction() {
    const status = String(this.order.status || 'received');
    const actions = this.statusActions();
    const terminal = ['returned', 'cancelled'].includes(status);
    const latestPause = [...(this.order.events || [])].reverse().find(event =>
      ['job_paused', 'repair_paused'].includes(event.event_type)
    );
    const pauseContext = latestPause?.data?.pauseReason || latestPause?.data?.reason || latestPause?.data?.note || '';
    const heading = {
      received: 'Ready for a technician',
      inspecting: 'Record what you observe',
      awaiting_approval: 'Waiting for customer approval',
      repairing: 'Continue the repair',
      paused: 'Job paused',
      waiting_parts: 'Waiting for parts',
      ready: 'Ready for collection'
    }[status] || 'Next useful action';
    const guidance = {
      received: 'Take the job to put it on your bench. The customer complaint is already recorded.',
      inspecting: 'Write one clear fact in your own words. No diagnostic choice is required.',
      awaiting_approval: 'Record approval when the customer confirms the estimate.',
      repairing: 'Parts and work notes autosave while you continue.',
      paused: pauseContext ? `Paused because: ${pauseContext}` : 'Resume when the blocking reason is resolved.',
      waiting_parts: 'Resume when the required parts have arrived.',
      ready: 'Return the machine only after handover to the customer.'
    }[status] || '';
    document.getElementById('diagnostic-step').textContent = terminal ? 'Closed' : 'Next';
    document.getElementById('next-action-content').innerHTML = terminal
      ? `<h3>${status === 'returned' ? 'Machine returned' : 'Job closed'}</h3><p>The full record remains available for reference.</p>`
      : `<h3>${ServiceUI.esc(heading)}</h3>
         <p>${ServiceUI.esc(guidance)}</p>
         ${status === 'inspecting' ? `
           <label class="bench-note-field" for="bench-note-input">Bench note
             <textarea id="bench-note-input" placeholder="What do you see, hear or feel?"></textarea>
           </label>
           <button class="workspace-primary bench-note-button" type="button" data-record-observation>Record observation</button>
         ` : ''}
         ${status === 'inspecting' && this.estimate ? '<button class="outline-button approval-button" type="button" data-job-event="estimate_created">Request approval</button>' : ''}
         ${actions.some(([eventType]) => eventType === 'job_paused') ? `
           <label class="pause-reason-field" id="pause-reason-field" hidden>Pause reason
             <select id="pause-reason">
               <option value="">Choose reason</option>
               <option>Waiting Customer</option>
               <option>Waiting Parts</option>
               <option>Outside Work</option>
               <option>Priority Changed</option>
               <option>End of Day</option>
               <option>Other</option>
             </select>
           </label>
         ` : ''}
         <div class="next-action-buttons">
           ${actions.map(([eventType, label, primary]) => `<button class="${primary ? 'workspace-primary' : 'outline-button'}" type="button" data-job-event="${eventType}">${ServiceUI.esc(label)}</button>`).join('')}
           ${status === 'inspecting' ? '<button class="outline-button" type="button" data-open-estimate>Prepare estimate</button>' : ''}
         </div>
         <p class="next-action-message" id="next-action-message"></p>`;
    document.querySelectorAll('[data-job-event]').forEach(button => button.addEventListener('click', () => this.postEvent(button.dataset.jobEvent, button)));
    document.querySelector('[data-record-observation]')?.addEventListener('click', event => {
      const note = document.getElementById('bench-note-input')?.value.trim();
      this.postEvent('inspection_observed', event.currentTarget, { note });
    });
    document.querySelector('[data-open-estimate]')?.addEventListener('click', () => this.createEstimate());
  },

  async postEvent(eventType, button, extra = {}) {
    if (eventType === 'job_returned' && !confirm('Confirm that the machine has been returned to the customer.')) return;
    const message = document.getElementById('next-action-message');
    const pauseReason = eventType === 'job_paused' ? document.getElementById('pause-reason')?.value : null;
    if (eventType === 'job_paused' && !pauseReason) {
      document.getElementById('pause-reason-field').hidden = false;
      message.textContent = 'Choose why the job is paused.';
      message.className = 'next-action-message error';
      document.getElementById('pause-reason')?.focus();
      return;
    }
    if (eventType === 'inspection_observed' && !extra.note) {
      message.textContent = 'Write a bench note first.';
      message.className = 'next-action-message error';
      document.getElementById('bench-note-input')?.focus();
      return;
    }
    button.disabled = true;
    message.textContent = 'Recording update…';
    message.className = 'next-action-message';
    try {
      await Api.request(`/repair-jobs/${encodeURIComponent(this.id)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          eventType,
          note: extra.note || (eventType === 'job_taken' ? 'Job taken from Workbench' : null),
          pauseReason
        })
      });
      await Promise.all([this.refreshOrder(), this.loadQueue()]);
      this.showToast(eventType === 'inspection_observed' ? 'Bench observation recorded.' : 'Job updated.');
    } catch (error) {
      message.textContent = error.message;
      message.className = 'next-action-message error';
    } finally {
      button.disabled = false;
    }
  },

  async loadQueue() {
    try {
      const [allData, mineData] = await Promise.all([
        Api.request('/work-orders?limit=160'),
        Api.request('/work-orders?mine=1&limit=160')
      ]);
      const active = order => !['returned', 'cancelled'].includes(String(order.status || '').toLowerCase());
      this.allOrders = (allData.workOrders || []).filter(active);
      const mine = (mineData.workOrders || []).filter(active);
      this.queueOrders = mine.some(order => order.id === this.id) ? mine : this.allOrders;
      this.renderQueue();
      this.renderSwitchList();
      this.updateRelativeButtons();
    } catch (error) {
      document.getElementById('workspace-queue').innerHTML = `<div class="workspace-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  renderQueue() {
    const host = document.getElementById('workspace-queue');
    const ordered = [...this.queueOrders].sort((a, b) => a.id === this.id ? -1 : b.id === this.id ? 1 : 0).slice(0, 4);
    host.innerHTML = ordered.length ? ordered.map(order => `
      <a class="queue-job ${order.id === this.id ? 'current' : ''}" href="work.html?id=${encodeURIComponent(order.id)}">
        <span class="queue-job-mark">${ServiceUI.esc((ServiceUI.machine(order) || 'M')[0].toUpperCase())}</span>
        <span><strong>${ServiceUI.esc(ServiceUI.machine(order))}</strong><small>${ServiceUI.esc(order.complaint || order.workOrder)}</small></span>
        <span>›</span>
      </a>`).join('') : '<div class="workspace-empty">No active jobs in this queue.</div>';
  },

  renderSwitchList() {
    document.getElementById('switch-job-list').innerHTML = this.queueOrders.length ? this.queueOrders.map(order => `
      <a class="switch-job ${order.id === this.id ? 'current' : ''}" href="work.html?id=${encodeURIComponent(order.id)}">
        <span><strong>${ServiceUI.esc(ServiceUI.machine(order))}</strong><small>${ServiceUI.esc(order.workOrder)} · ${ServiceUI.esc(order.statusLabel)}</small></span><span>›</span>
      </a>`).join('') : '<div class="workspace-empty">No other active jobs.</div>';
  },

  updateRelativeButtons() {
    const index = this.queueOrders.findIndex(order => order.id === this.id);
    document.getElementById('previous-job').disabled = index <= 0;
    document.getElementById('next-job').disabled = index < 0 || index >= this.queueOrders.length - 1;
  },

  navigateRelative(offset) {
    const index = this.queueOrders.findIndex(order => order.id === this.id);
    const target = this.queueOrders[index + offset];
    if (target) location.href = `work.html?id=${encodeURIComponent(target.id)}`;
  },

  async loadStaff() {
    try {
      const data = await Api.request('/staff');
      this.staff = (data.staff || []).filter(item => item.active !== 0);
      const select = document.getElementById('assigned-to');
      select.innerHTML = '<option value="">Unassigned</option>' + this.staff.map(item =>
        `<option value="${ServiceUI.esc(item.id)}">${ServiceUI.esc(item.name)}</option>`
      ).join('');
      this.ensureAssignedOption(this.order);
    } catch {
      document.getElementById('assigned-to').disabled = true;
    }
  },

  async loadEstimate() {
    try {
      const data = await Api.request(`/repair-jobs/${encodeURIComponent(this.id)}/estimate`);
      this.estimate = data.estimate || null;
      this.renderEstimateState();
      this.renderNextAction();
    } catch (error) {
      document.getElementById('estimate-state').textContent = error.message;
    }
  },

  renderEstimateState() {
    const state = document.getElementById('estimate-state');
    const share = document.getElementById('estimate-share-actions');
    if (!this.estimate) {
      state.textContent = 'No estimate saved yet.';
      share.hidden = true;
      return;
    }
    state.textContent = `${this.estimate.estimate_number || 'Estimate'} · ${this.title(this.estimate.status || 'draft')} · ${this.money(this.estimate.grand_total)}`;
    const digits = String(this.order.customerPhone || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const message = `TAGRO estimate ${this.estimate.estimate_number} for ${ServiceUI.machine(this.order)}: ${this.money(this.estimate.grand_total)}. Please confirm before work proceeds.`;
    const whatsapp = document.getElementById('share-estimate-whatsapp');
    const sms = document.getElementById('share-estimate-sms');
    if (phone.length >= 10) {
      whatsapp.href = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
      sms.href = `sms:${encodeURIComponent(this.order.customerPhone)}?body=${encodeURIComponent(message)}`;
      share.hidden = false;
    } else {
      share.hidden = true;
    }
  },

  renderBasket() {
    if (!document.getElementById('basket-preview')) return;
    WorkOrderForm.readParts();
    const parts = WorkOrderForm.parts.filter(part => !part.draft && part.partNumber && part.itemName);
    const total = parts.reduce((sum, part) => sum + (Number(part.quantity) || 0) * (Number(part.unitPrice) || 0), 0);
    document.getElementById('basket-count').textContent = String(parts.length);
    document.getElementById('basket-total').textContent = this.money(total);
    document.getElementById('basket-preview').innerHTML = parts.length
      ? parts.slice(0, 4).map(part => `<div class="basket-line"><strong>${ServiceUI.esc(part.itemName || part.partNumber)}</strong><span>${ServiceUI.esc(String(part.quantity || 1))} × ${this.money(part.unitPrice)}</span></div>`).join('')
      : '<div class="workspace-empty">No parts selected.</div>';
  },

  async createEstimate() {
    WorkOrderForm.readParts();
    const parts = WorkOrderForm.parts.filter(part => !part.draft && part.partNumber && part.itemName);
    const incomplete = parts.filter(part => !part.partNumber || !part.itemName || !part.hsnSac || part.gstRate === '' || part.gstRate == null || part.unitPrice === '' || part.unitPrice == null);
    const labour = {
      description: document.getElementById('estimate-labour-description').value.trim(),
      quantity: Number(document.getElementById('estimate-labour-quantity').value),
      unitPrice: Number(document.getElementById('estimate-labour-rate').value),
      hsnSac: document.getElementById('estimate-labour-sac').value.trim(),
      gstRate: Number(document.getElementById('estimate-labour-gst').value)
    };
    const labourStarted = labour.description || labour.hsnSac ||
      document.getElementById('estimate-labour-rate').value ||
      document.getElementById('estimate-labour-gst').value;
    if (!parts.length && !labourStarted) {
      this.showToast('Add a part or labour before creating an estimate.');
      this.openParts();
      return;
    }
    if (incomplete.length) {
      this.showToast('Estimate needs part number, name, HSN, GST and price. Add verified catalogue parts.');
      this.openDialog('job-details-dialog');
      return;
    }
    if (labourStarted && (!labour.description || !labour.hsnSac ||
        !Number.isFinite(labour.quantity) || labour.quantity <= 0 ||
        !Number.isFinite(labour.unitPrice) || labour.unitPrice < 0 ||
        !Number.isFinite(labour.gstRate) || labour.gstRate < 0 || labour.gstRate > 100)) {
      this.showToast('Complete labour name, SAC, GST, quantity and rate.');
      document.querySelector('.estimate-labour').open = true;
      return;
    }
    const button = document.getElementById('create-estimate');
    button.disabled = true;
    button.textContent = 'Creating…';
    try {
      const data = await Api.request(`/repair-jobs/${encodeURIComponent(this.id)}/estimate`, {
        method: 'PUT',
        body: JSON.stringify({
          notes: 'Prepared from Service Workspace',
          items: [
            ...parts.map(part => ({
              itemType: 'part',
              partNumber: part.partNumber,
              description: part.itemName,
              hsnSac: part.hsnSac,
              gstRate: Number(part.gstRate),
              quantity: Number(part.quantity) || 1,
              unitPrice: Number(part.unitPrice) || 0,
              source: part.source || 'catalog'
            })),
            ...(labourStarted ? [{
              itemType: 'service',
              partNumber: null,
              description: labour.description,
              hsnSac: labour.hsnSac,
              gstRate: labour.gstRate,
              quantity: labour.quantity,
              unitPrice: labour.unitPrice,
              source: 'workbench_labour'
            }] : [])
          ]
        })
      });
      this.estimate = data.estimate;
      this.renderEstimateState();
      this.renderNextAction();
      this.showToast(`Estimate ${data.estimate.estimate_number} saved.`);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Create estimate';
    }
  },

  openPartsPicker() {
    location.href = `app-catalog.html?job=${encodeURIComponent(this.id)}`;
  },

  closeParts() {
    document.body.classList.remove('parts-sheet-open');
  },

  async searchParts() {
    const query = document.getElementById('bench-part-query').value.trim();
    const host = document.getElementById('bench-fast-results');
    if (query.length < 2) {
      host.innerHTML = '<div class="workspace-empty">Enter at least two characters.</div>';
      return;
    }
    host.innerHTML = '<div class="workspace-loading">Searching live catalogue…</div>';
    try {
      const data = await Api.request(`/catalog?type=part&limit=40&query=${encodeURIComponent(query)}`);
      const items = data.items || [];
      host.innerHTML = items.length ? items.map((item, index) => `
        <article class="parts-result">
          <div><strong>${ServiceUI.esc(item.tagro_name || item.item_name)}</strong><span>${ServiceUI.esc(item.part_number)}</span><small>${ServiceUI.esc(item.stihl_name || '')} · HSN ${ServiceUI.esc(item.hsn_sac || 'pending')} · GST ${ServiceUI.esc(String(item.gst_rate ?? 'pending'))}%</small></div>
          <b class="parts-result-price">${this.money(item.retail_price ?? item.mrp)}</b>
          <div class="parts-result-actions"><button type="button" data-pin-result="${index}">Pin</button><button class="add-result" type="button" data-add-result="${index}">Add</button></div>
        </article>`).join('') : '<div class="workspace-empty">No matching parts.</div>';
      host.querySelectorAll('[data-add-result]').forEach(button => button.addEventListener('click', () => this.addCatalogPart(items[Number(button.dataset.addResult)])));
      host.querySelectorAll('[data-pin-result]').forEach(button => button.addEventListener('click', () => this.pinPart(items[Number(button.dataset.pinResult)])));
    } catch (error) {
      host.innerHTML = `<div class="workspace-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  machineModel(value) {
    const match = String(value || '').toUpperCase().match(/\b(MS|MSE|FS|FSA|SR|BR|BG|HS|HT|TS|RE|RM)\s*-?\s*(\d{2,4}[A-Z]?)\b/);
    return match ? `${match[1]}${match[2]}` : '';
  },

  consumePartHandoff() {
    const key = `tagro_parts_handoff_${this.id}`;
    const pending = OS.get(key, []);
    if (!Array.isArray(pending) || !pending.length) return;
    WorkOrderForm.readParts();
    for (const item of pending) {
      if (!item?.partNumber || !item?.itemName) continue;
      if (WorkOrderForm.parts.some(part => part.partNumber === item.partNumber)) continue;
      WorkOrderForm.parts.push({ ...item, quantity: Number(item.quantity) || 1, draft: false });
    }
    OS.set(key, []);
    WorkOrderForm.renderParts();
    WorkOrderForm.changed();
    this.showToast(`${pending.length} selected part${pending.length === 1 ? '' : 's'} added to this job.`);
  },

  async openParts() {
    if (!this.modelKey) this.modelKey = this.machineModel(this.order?.machineDescription || ServiceUI.machine(this.order));
    await this.loadModelChoices();
    const modelSelect = document.getElementById('parts-model-select');
    if (this.modelKey && ![...modelSelect.options].some(option => option.value === this.modelKey)) {
      modelSelect.add(new Option(this.modelLabel(this.modelKey), this.modelKey));
    }
    modelSelect.value = this.modelKey;
    document.getElementById('parts-model-title').textContent = this.modelLabel(this.modelKey);
    document.getElementById('parts-destination').textContent = this.order?.workOrder || 'current work order';
    this.updatePartsLinks();
    this.openDialog('parts-dialog');
    document.getElementById('parts-query').value = '';
    await this.loadModelParts();
    document.getElementById('parts-query').focus();
  },

  setPartsMode(mode, section = '') {
    this.partsMode = mode === 'visual' ? 'visual' : 'fast';
    document.getElementById('parts-fast-mode').classList.toggle('active', this.partsMode === 'fast');
    document.getElementById('parts-visual-mode').classList.toggle('active', this.partsMode === 'visual');
    document.getElementById('parts-visual-tools').hidden = this.partsMode !== 'visual';
    if (section) this.activeSection = section;
    document.getElementById('parts-query').value = '';
    if (this.partsMode === 'visual' && this.activeSection) {
      const carousel = document.getElementById('parts-assembly-carousel');
      carousel.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.section === this.activeSection));
      this.renderPartResults(this.modelParts.filter(part => part.section === this.activeSection));
    } else {
      document.getElementById('parts-search-results').innerHTML =
        '<div class="workspace-empty"><strong>Fast Mode ready.</strong><span>Type a TAGRO name, alias or part number to see the current price and add it.</span></div>';
      document.getElementById('parts-query').focus();
    }
  },

  async loadModelChoices() {
    if (this.modelChoicesLoaded) return;
    const select = document.getElementById('parts-model-select');
    const data = await Api.request('/knowledge/models');
    const models = (data.models || []).filter(model => model.hasParts);
    select.innerHTML = models.map(model =>
      `<option value="${ServiceUI.esc(model.key)}">${ServiceUI.esc(model.label)}</option>`
    ).join('');
    this.modelChoicesLoaded = true;
  },

  modelLabel(model) {
    return model ? model.replace(/^([A-Z]+)(\d)/, '$1 $2') : 'this machine';
  },

  updatePartsLinks() {
    const globalUrl = `app-catalog.html?job=${encodeURIComponent(this.id)}&model=${encodeURIComponent(this.modelKey)}`;
    document.getElementById('open-global-parts').href = globalUrl;
    document.getElementById('global-parts-link').href = globalUrl;
    document.getElementById('model-reference-link').href = globalUrl;
    document.getElementById('order-parts-link').href = globalUrl;
  },

  async ensureModelParts() {
    if (!this.modelKey) {
      this.modelParts = [];
      this.loadedModelKey = '';
      this.diagramAsset = null;
      return;
    }
    if (this.loadedModelKey === this.modelKey && this.modelParts.length) return;
    const [data, assetData] = await Promise.all([
      Api.request(`/knowledge/parts?model=${encodeURIComponent(this.modelKey)}&limit=500`).catch(() => ({ parts: [] })),
      Api.request(`/knowledge/assets?model=${encodeURIComponent(this.modelKey)}`).catch(() => ({ assets: [] }))
    ]);
    this.modelParts = (data.parts || []).map(part => this.catalogItem(part));
    this.diagramAsset = (assetData.assets || []).find(asset => asset.type === 'pdf' || /parts|catalog/i.test(asset.name || '')) || null;
    this.diagramImages = (assetData.assets || []).filter(asset => asset.type === 'image');
    this.loadedModelKey = this.modelKey;
  },

  async loadWorkbenchParts() {
    const host = document.getElementById('common-model-parts');
    document.getElementById('bench-parts-model').textContent = this.modelLabel(this.modelKey);
    if (!this.modelKey) {
      host.innerHTML = '<div class="workspace-empty">Add the machine model to load its parts.</div>';
      return;
    }
    host.innerHTML = '<div class="workspace-loading">Preparing machine parts...</div>';
    try {
      await this.ensureModelParts();
      this.renderCommonModelParts();
    } catch (error) {
      host.innerHTML = `<div class="workspace-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  commonModelParts() {
    const keywords = ['air filter', 'fuel filter', 'spark plug', 'starter rope', 'clutch', 'sprocket', 'oil pump', 'av mount'];
    const model = this.modelLabel(this.modelKey).toLowerCase();
    const chosen = [];
    const seen = new Set();
    for (const keyword of keywords) {
      const candidates = this.modelParts.filter(part => {
        const name = `${part.tagro_name} ${part.stihl_name}`.toLowerCase();
        return name.includes(keyword) && !seen.has(part.part_number) && (part.retail_price !== '' || part.mrp !== '');
      }).sort((a, b) => {
        const aName = `${a.tagro_name} ${a.stihl_name}`.toLowerCase();
        const bName = `${b.tagro_name} ${b.stihl_name}`.toLowerCase();
        const rank = name =>
          (/pack of|tool|wrench|boot/.test(name) ? 50 : 0) -
          (name.includes(model) ? 10 : 0) -
          (name.startsWith(keyword) ? 4 : 0) +
          name.length / 100;
        return rank(aName) - rank(bName);
      });
      if (candidates[0]) {
        seen.add(candidates[0].part_number);
        chosen.push(candidates[0]);
      }
    }
    return chosen.slice(0, 8);
  },

  renderCommonModelParts() {
    const host = document.getElementById('common-model-parts');
    const items = this.commonModelParts();
    host.innerHTML = items.length ? items.map((item, index) => `
      <button type="button" data-common-part="${index}">
        <strong>${ServiceUI.esc(item.tagro_name || item.stihl_name || item.part_number)}</strong>
        <span>${this.money(item.retail_price ?? item.mrp)}</span>
      </button>`).join('') : '<div class="workspace-empty">Pin familiar parts as you use them.</div>';
    host.querySelectorAll('[data-common-part]').forEach(button => button.addEventListener('click', () => {
      this.addCatalogPart(items[Number(button.dataset.commonPart)], 1, false);
    }));
  },

  searchBenchParts() {
    const query = document.getElementById('bench-part-query').value.trim();
    const host = document.getElementById('bench-fast-results');
    if (query.length < 2) {
      host.innerHTML = '<div class="workspace-empty">Type a familiar part name to see price and add it.</div>';
      return;
    }
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const items = this.modelParts.filter(item => {
      const text = [item.part_number, item.tagro_name, item.stihl_name, ...(item.aliases || [])].join(' ').toLowerCase();
      return tokens.every(token => text.includes(token));
    }).slice(0, 10);
    host.innerHTML = items.length ? items.map((item, index) => `
      <article class="bench-part-result">
        <div><strong>${ServiceUI.esc(item.tagro_name || item.stihl_name || item.part_number)}</strong>
        <small>${ServiceUI.esc(item.part_number)}${item.stihl_name ? ` - ${ServiceUI.esc(item.stihl_name)}` : ''}</small></div>
        <b>${this.money(item.retail_price ?? item.mrp)}</b>
        <label>Qty<input type="number" min="1" step="1" value="1" data-bench-qty="${index}"></label>
        <button type="button" data-bench-add="${index}">Add</button>
      </article>`).join('') : '<div class="workspace-empty">No matching part for this machine. Try fewer words or open STIHL reference.</div>';
    host.querySelectorAll('[data-bench-add]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.benchAdd);
      const quantity = Number(host.querySelector(`[data-bench-qty="${index}"]`)?.value) || 1;
      this.addCatalogPart(items[index], quantity, false);
    }));
  },

  async loadModelParts() {
    const host = document.getElementById('parts-search-results');
    const carousel = document.getElementById('parts-assembly-carousel');
    if (!this.modelKey) {
      this.modelParts = [];
      carousel.innerHTML = '';
      host.innerHTML = '<div class="workspace-empty"><strong>Model not identified.</strong><span>Search globally or add the model to this job first.</span></div>';
      return;
    }
    host.innerHTML = '<div class="workspace-loading">Loading model assemblies…</div>';
    try {
      await this.ensureModelParts();
      const diagramAsset = this.diagramAsset;
      const diagramLink = document.getElementById('parts-diagram-link');
      diagramLink.hidden = !diagramAsset;
      if (diagramAsset) diagramLink.href = diagramAsset.url;
      const sections = [...new Set(this.modelParts.map(part => part.section).filter(Boolean))];
      this.activeSection = sections[0] || '';
      if (sections.length) {
        carousel.innerHTML = sections.map((section, index) =>
          `<button type="button" class="${index === 0 ? 'active' : ''}" data-section="${ServiceUI.esc(section)}">${ServiceUI.esc(section)}</button>`
        ).join('');
        carousel.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
          this.partsMode = 'visual';
          this.activeSection = button.dataset.section;
          carousel.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
          this.renderPartResults(this.modelParts.filter(part => part.section === this.activeSection));
        }));
      } else if ((this.diagramImages || []).length) {
        carousel.innerHTML = this.diagramImages.map(image =>
          `<a class="assembly-diagram-thumb" href="${ServiceUI.esc(image.url)}" target="_blank" rel="noopener" title="${ServiceUI.esc(image.name)}"><img src="${ServiceUI.esc(image.url)}" alt="${ServiceUI.esc(image.name)}" loading="lazy"></a>`
        ).join('');
      } else {
        carousel.innerHTML = '<span class="assembly-empty">No uploaded assembly map yet—search remains available.</span>';
      }
      this.setPartsMode('fast');
    } catch (error) {
      carousel.innerHTML = '';
      host.innerHTML = `<div class="workspace-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  catalogItem(part) {
    return {
      part_number: part.currentPartNumber || part.partNumber || '',
      item_name: part.stihlName || part.name || part.tagroName || '',
      stihl_name: part.stihlName || part.name || '',
      tagro_name: part.tagroName || '',
      hsn_sac: part.hsn || '',
      gst_rate: part.gst ?? '',
      retail_price: part.retailPrice ?? '',
      mrp: part.mrp ?? '',
      data_source: (part.sources || []).join('+') || 'knowledge_catalog',
      section: part.section || '',
      reference: part.reference || '',
      mapping_status: part.mappingStatus || '',
      aliases: Array.isArray(part.aliases) ? part.aliases : []
    };
  },

  async searchParts() {
    const query = document.getElementById('parts-query').value.trim();
    const host = document.getElementById('parts-search-results');
    if (query.length < 2) {
      if (this.partsMode === 'visual' && this.activeSection) this.renderPartResults(this.modelParts.filter(part => part.section === this.activeSection));
      else host.innerHTML = '<div class="workspace-empty">Type two characters or choose an assembly.</div>';
      return;
    }
    host.innerHTML = '<div class="workspace-loading">Finding matching parts…</div>';
    try {
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const merged = this.modelParts.filter(item => {
        const text = [item.part_number, item.tagro_name, item.stihl_name, ...(item.aliases || [])].join(' ').toLowerCase();
        return tokens.every(token => text.includes(token));
      });
      const seen = new Set();
      const items = merged.filter(item => {
        const key = String(item.part_number || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 40);
      this.renderPartResults(items, query);
    } catch (error) {
      host.innerHTML = `<div class="workspace-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  renderPartResults(items, query = '') {
    const host = document.getElementById('parts-search-results');
    host.innerHTML = items.length ? items.map((item, index) => {
      const officialName = item.stihl_name || item.item_name || 'Unnamed part';
      const workshopName = item.tagro_name || '';
      const primaryName = workshopName || officialName;
      const officialDetail = officialName.toLowerCase() !== primaryName.toLowerCase() ? `Official STIHL: ${ServiceUI.esc(officialName)} · ` : '';
      return `<article class="parts-result">
        <div class="parts-result-main"><span class="diagram-reference">${ServiceUI.esc(item.reference || String(index + 1))}</span><div><strong>${ServiceUI.esc(primaryName)}</strong><span>${ServiceUI.esc(item.part_number)}</span><small>${officialDetail}HSN ${ServiceUI.esc(item.hsn_sac || 'pending')} · GST ${ServiceUI.esc(String(item.gst_rate ?? 'pending'))}%</small></div></div>
        <b class="parts-result-price">${this.money(item.retail_price ?? item.mrp)}</b>
        <div class="parts-result-actions">${this.partsMode === 'fast' && item.section ? `<button type="button" data-view-diagram="${index}">View diagram</button>` : ''}${workshopName ? '' : `<button type="button" data-need-tagro-name="${index}">Needs TAGRO Name</button>`}<button type="button" data-pin-result="${index}">Pin</button><label>Qty<input data-result-qty="${index}" type="number" min="1" step="1" value="1"></label><button class="add-result" type="button" data-add-result="${index}">Add</button></div>
      </article>`;
    }).join('') : `<div class="workspace-empty"><strong>No exact match${query ? ` for “${ServiceUI.esc(query)}”` : ''}.</strong><span>Try fewer words, choose an assembly, or open Global parts.</span></div>`;
    host.querySelectorAll('[data-add-result]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.addResult);
      const quantity = Number(host.querySelector(`[data-result-qty="${index}"]`)?.value) || 1;
      this.addCatalogPart(items[index], quantity);
    }));
    host.querySelectorAll('[data-pin-result]').forEach(button => button.addEventListener('click', () => this.pinPart(items[Number(button.dataset.pinResult)])));
    host.querySelectorAll('[data-view-diagram]').forEach(button => button.addEventListener('click', () => {
      const item = items[Number(button.dataset.viewDiagram)];
      this.setPartsMode('visual', item.section);
    }));
    host.querySelectorAll('[data-need-tagro-name]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.needTagroName)];
      button.disabled = true;
      try {
        await Api.request('/catalog/name-requests', {
          method: 'POST',
          body: JSON.stringify({ model: this.modelKey, partNumber: item.part_number, stihlName: item.stihl_name || item.item_name })
        });
        button.textContent = 'Marked for naming';
      } catch (error) {
        button.disabled = false;
        this.showToast(error.message);
      }
    }));
  },

  addCatalogPart(item, quantity = 1, closeDialog = true) {
    if (!item) return;
    WorkOrderForm.readParts();
    const partNumber = item.part_number || '';
    const existing = WorkOrderForm.parts.find(part => !part.draft && part.partNumber === partNumber);
    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + (Number(quantity) || 1);
    } else {
      WorkOrderForm.parts.push({
        partNumber,
        itemName: item.tagro_name || item.item_name || item.stihl_name || '',
        quantity: Number(quantity) || 1,
        unitPrice: item.retail_price ?? item.mrp ?? '',
        hsnSac: item.hsn_sac || '',
        gstRate: item.gst_rate ?? '',
        notes: '',
        source: item.data_source || 'catalog',
        draft: false
      });
    }
    WorkOrderForm.renderParts();
    WorkOrderForm.changed();
    this.renderBasket();
    if (closeDialog && document.getElementById('parts-dialog').open) document.getElementById('parts-dialog').close();
    this.showToast(existing ? 'Quantity updated on this job.' : 'Part added to this job.');
  },

  frequentParts() {
    const items = OS.get(this.frequentKey, []);
    return Array.isArray(items) ? items.filter(item => item && item.partNumber && item.itemName).slice(0, 8) : [];
  },

  pinPart(item) {
    if (!item) return;
    const parts = this.frequentParts();
    if (parts.some(part => part.partNumber === item.part_number)) {
      this.showToast('This part is already in your frequent list.');
      return;
    }
    parts.push({
      partNumber: item.part_number,
      itemName: item.tagro_name || item.item_name || item.stihl_name,
      unitPrice: item.retail_price ?? item.mrp ?? '',
      hsnSac: item.hsn_sac || '',
      gstRate: item.gst_rate ?? '',
      source: item.data_source || 'catalog'
    });
    OS.set(this.frequentKey, parts);
    this.renderFrequentParts();
    this.showToast('Part pinned to your frequent list.');
  },

  removeFrequent(partNumber) {
    OS.set(this.frequentKey, this.frequentParts().filter(part => part.partNumber !== partNumber));
    this.renderFrequentParts();
  },

  renderFrequentParts() {
    const host = document.getElementById('frequent-parts');
    const parts = this.frequentParts();
    host.innerHTML = parts.length ? parts.slice(0, 4).map(part => `
      <article class="frequent-part">
        <button class="remove-frequent" type="button" data-remove-frequent="${ServiceUI.esc(part.partNumber)}" aria-label="Remove frequent part">×</button>
        <strong>${ServiceUI.esc(part.itemName)}</strong><small>${ServiceUI.esc(part.partNumber)} · ${this.money(part.unitPrice)}</small>
        <button type="button" data-add-frequent="${ServiceUI.esc(part.partNumber)}">Add</button>
      </article>`).join('') : '<div class="workspace-empty">Pin your own frequently used parts from the catalogue.</div>';
    host.querySelectorAll('[data-add-frequent]').forEach(button => button.addEventListener('click', () => {
      const item = parts.find(part => part.partNumber === button.dataset.addFrequent);
      this.addCatalogPart({
        part_number: item.partNumber, item_name: item.itemName, tagro_name: item.itemName,
        retail_price: item.unitPrice, hsn_sac: item.hsnSac, gst_rate: item.gstRate, data_source: item.source
      });
    }));
    host.querySelectorAll('[data-remove-frequent]').forEach(button => button.addEventListener('click', () => this.removeFrequent(button.dataset.removeFrequent)));
  },

  addManualPart() {
    WorkOrderForm.readParts();
    WorkOrderForm.parts.push({ quantity: 1, source: 'manual', draft: true });
    WorkOrderForm.renderParts();
    this.openDialog('job-details-dialog');
    this.showToast('Manual draft added. It will not save until you confirm it.');
  },

  renderCommunication() {
    const digits = String(this.order.customerPhone || '').replace(/\D/g, '');
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const message = document.getElementById('message-customer');
    const call = document.getElementById('call-customer');
    if (normalized.length >= 10) {
      const text = `TAGRO update for ${ServiceUI.machine(this.order)} (${this.order.workOrder}).`;
      message.href = `https://wa.me/${encodeURIComponent(normalized)}?text=${encodeURIComponent(text)}`;
      call.href = `tel:${encodeURIComponent(this.order.customerPhone)}`;
      message.removeAttribute('aria-disabled');
      call.removeAttribute('aria-disabled');
    } else {
      message.href = '#';
      call.href = '#';
      message.setAttribute('aria-disabled', 'true');
      call.setAttribute('aria-disabled', 'true');
    }
  },

  async copyCustomerTemplate(template) {
    const text = `TAGRO: ${template} — ${ServiceUI.machine(this.order)} (${this.order.workOrder}).`;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Customer update copied. Review before sending.');
    } catch {
      this.showToast('Clipboard unavailable. Open job details and copy manually.');
    }
  },

  renderTimeline() {
    const events = Array.isArray(this.order.events)
      ? [...this.order.events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      : [];
    document.getElementById('workspace-timeline').innerHTML = events.length ? events.map((event, index) => `
      <article class="timeline-event ${index === 0 ? 'current' : ''}">
        <strong>${ServiceUI.esc(this.eventLabel(event.event_type))}</strong>
        <span>${ServiceUI.esc(event.data?.note || event.created_by_name || 'Workshop update')}</span>
        <small>${ServiceUI.esc(ServiceUI.date(event.created_at))}</small>
      </article>`).join('') : '<div class="workspace-empty">No timeline events yet.</div>';
  },

  openSwitch() {
    this.renderSwitchList();
    this.openDialog('switch-dialog');
  },

  openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
  },

  parkJob() {
    const key = `tagro_my_space_parked_${this.session.id || 'staff'}`;
    const stored = OS.get(key, []);
    const items = Array.isArray(stored) ? stored : [];
    if (!items.some(item => item.id === this.id)) {
      items.unshift({
        id: this.id,
        kind: 'job',
        title: ServiceUI.machine(this.order),
        detail: this.order.workOrder || this.order.complaint || 'Work order',
        href: `work.html?id=${encodeURIComponent(this.id)}`
      });
      OS.set(key, items.slice(0, 10));
    }
    this.showToast('Job parked in My Space.');
  },

  openDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    drawer.hidden = false;
    drawer.querySelector('.drawer-panel a,.drawer-panel button').focus();
  },

  closeDrawer() {
    document.getElementById('mobile-drawer').hidden = true;
  },

  async signOut() {
    if (!confirm('Sign out of TAGRO OS?')) return;
    await Session.logout();
    location.replace('login.html');
  },

  showToast(message) {
    const toast = document.getElementById('space-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  },

  eventLabel(value) {
    return this.title(String(value || '').replaceAll('_', ' '));
  },

  statusClass(status) {
    if (['waiting_parts', 'awaiting_approval', 'paused'].includes(status)) return 'waiting';
    if (status === 'ready') return 'ready';
    if (['returned', 'cancelled'].includes(status)) return 'closed';
    return '';
  },

  lastUpdateText(order) {
    const events = Array.isArray(order?.events) ? [...order.events] : [];
    const latest = events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!latest) return 'No timeline yet';
    const when = ServiceUI.date(latest.created_at);
    return `Last: ${this.eventLabel(latest.event_type)}${when ? ` · ${when}` : ''}`;
  },

  age(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
    return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} old`;
  },

  money(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }) : '—';
  },

  title(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }
};
