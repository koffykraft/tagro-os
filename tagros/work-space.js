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

  async mount({ session, id, order }) {
    this.session = session;
    this.id = id;
    this.order = order;
    this.frequentKey = `tagro_frequent_parts_${session.id || 'staff'}`;
    this.applyIdentity();
    this.bind();
    this.renderOrder();
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
    document.getElementById('open-parts-search').addEventListener('click', () => this.openParts());
    document.getElementById('edit-frequent').addEventListener('click', () => this.openParts());
    document.getElementById('add-manual-part').addEventListener('click', () => this.addManualPart());
    document.getElementById('create-estimate').addEventListener('click', () => this.createEstimate());
    document.getElementById('parts-search-button').addEventListener('click', () => this.searchParts());
    document.getElementById('parts-query').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.searchParts(); }
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
    document.getElementById('technician-name').textContent = order.assignedToName || 'Unassigned';
    this.ensureAssignedOption(order);
    this.renderProgress();
    this.renderNextAction();
    this.renderBasket();
    this.renderTimeline();
    this.renderCommunication();
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
      ['delivered', 'Delivered']
    ];
    const status = String(this.order.status || 'received');
    const rank = { received: 0, inspecting: 1, awaiting_approval: 2, approved: 2, repairing: 3, paused: 3, waiting_parts: 3, ready: 4, delivered: 5 };
    const current = rank[status] ?? 0;
    document.getElementById('progress-track').innerHTML = steps.map(([key, label], index) => {
      const className = index < current ? 'done' : index === current ? 'current' : '';
      return `<span class="progress-step ${className}"><i>${index < current ? '✓' : index + 1}</i>${ServiceUI.esc(label)}</span>`;
    }).join('');
  },

  diagnosticSpec() {
    const text = `${this.order.complaint || ''} ${this.order.observation || ''}`.toLowerCase();
    if (/(vibrat|noise|sound)/.test(text)) return { question: 'Which side?', hint: 'Choose where the symptom is strongest.', options: ['Clutch side', 'Flywheel side', 'Not yet clear'] };
    if (/(won.?t start|not start|no start)/.test(text)) return { question: 'Does the engine turn?', hint: 'Check movement before fuel or ignition diagnosis.', options: ['Turns normally', 'Hard to turn', 'Locked'] };
    if (/(no power|low power|power loss)/.test(text)) return { question: 'When is power lost?', hint: 'Choose the closest confirmed condition.', options: ['At full speed', 'Under load', 'At all speeds'] };
    if (/(chain|clutch)/.test(text)) return { question: 'What does the chain do?', hint: 'Observe safely with the machine secured.', options: ['Moves at idle', 'Stops under load', 'Does not move'] };
    if (/(fuel|leak)/.test(text)) return { question: 'Where is fuel visible?', hint: 'Record the first confirmed leak area.', options: ['Tank / cap', 'Hose / filter', 'Carburettor'] };
    return { question: 'Where is the fault most noticeable?', hint: 'Record one confirmed fact before opening the machine.', options: ['Engine side', 'Tool / drive side', 'Not yet clear'] };
  },

  statusActions() {
    const map = {
      received: [['inspection_started', 'Start inspection', true], ['repair_started', 'Start repair', false]],
      inspecting: [['repair_started', 'Start repair', true], ['repair_paused', 'Pause job', false]],
      awaiting_approval: [],
      approved: [['repair_started', 'Start repair', true]],
      repairing: [['parts_requested', 'Waiting for parts', false], ['repair_completed', 'Repair complete', true]],
      paused: [['repair_resumed', 'Resume repair', true], ['parts_requested', 'Waiting for parts', false]],
      waiting_parts: [['parts_received', 'Parts received', true]],
      ready: [['customer_notified', 'Customer notified', false], ['machine_delivered', 'Machine delivered', true]],
      delivered: [],
      cancelled: []
    };
    return map[this.order.status] || [];
  },

  renderNextAction() {
    const status = String(this.order.status || 'received');
    const spec = this.diagnosticSpec();
    const actions = this.statusActions();
    const terminal = ['delivered', 'cancelled'].includes(status);
    const approval = status === 'awaiting_approval';
    document.getElementById('diagnostic-step').textContent = terminal ? 'Closed' : approval ? 'Estimate required' : 'Guided check';
    document.getElementById('next-action-content').innerHTML = terminal
      ? `<h3>${status === 'delivered' ? 'Job delivered' : 'Job closed'}</h3><p>The record remains available for reference.</p>`
      : `<h3>${ServiceUI.esc(spec.question)}</h3>
         <p>${ServiceUI.esc(spec.hint)} This starter guidance is rule-based; AI diagnosis is not connected yet.</p>
         <div class="diagnostic-options">${spec.options.map(option => `<button class="diagnostic-choice" type="button" data-finding="${ServiceUI.esc(option)}">${ServiceUI.esc(option)}<span>Record this finding</span></button>`).join('')}</div>
         <div class="next-action-buttons">
           ${approval ? '<button class="workspace-primary" type="button" data-open-estimate>Prepare estimate</button>' : ''}
           ${actions.map(([eventType, label, primary]) => `<button class="${primary ? 'workspace-primary' : 'outline-button'}" type="button" data-job-event="${eventType}">${ServiceUI.esc(label)}</button>`).join('')}
           <button class="outline-button" type="button" data-open-details>Add note</button>
         </div>
         <p class="next-action-message" id="next-action-message"></p>`;
    document.querySelectorAll('[data-finding]').forEach(button => button.addEventListener('click', () => this.recordFinding(spec.question, button.dataset.finding)));
    document.querySelectorAll('[data-job-event]').forEach(button => button.addEventListener('click', () => this.postEvent(button.dataset.jobEvent, button)));
    document.querySelector('[data-open-details]')?.addEventListener('click', () => this.openDialog('job-details-dialog'));
    document.querySelector('[data-open-estimate]')?.addEventListener('click', () => this.createEstimate());
  },

  recordFinding(question, answer) {
    const observation = document.getElementById('observation');
    const line = `Guided check: ${question} — ${answer}`;
    if (!observation.value.includes(line)) observation.value = [observation.value.trim(), line].filter(Boolean).join('\n');
    WorkOrderForm.changed();
    document.getElementById('next-action-message').textContent = 'Finding recorded and queued for autosave.';
    this.showToast('Finding added to workshop observation.');
  },

  async postEvent(eventType, button) {
    if (eventType === 'machine_delivered' && !confirm('Mark this machine as delivered?')) return;
    const message = document.getElementById('next-action-message');
    button.disabled = true;
    message.textContent = 'Updating job…';
    message.className = 'next-action-message';
    try {
      await Api.request(`/repair-jobs/${encodeURIComponent(this.id)}/events`, {
        method: 'POST',
        body: JSON.stringify({ eventType, note: 'Updated from Service Workspace' })
      });
      await Promise.all([this.refreshOrder(), this.loadQueue()]);
      this.showToast('Job status updated.');
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
      const active = order => !['delivered', 'cancelled'].includes(String(order.status || '').toLowerCase());
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
    } catch (error) {
      document.getElementById('estimate-state').textContent = error.message;
    }
  },

  renderEstimateState() {
    const state = document.getElementById('estimate-state');
    if (!this.estimate) {
      state.textContent = 'No estimate saved yet.';
      return;
    }
    state.textContent = `${this.estimate.estimate_number || 'Estimate'} · ${this.title(this.estimate.status || 'draft')} · ${this.money(this.estimate.grand_total)}`;
  },

  renderBasket() {
    if (!document.getElementById('basket-preview')) return;
    WorkOrderForm.readParts();
    const parts = WorkOrderForm.parts.filter(part => part.partNumber || part.itemName);
    const total = parts.reduce((sum, part) => sum + (Number(part.quantity) || 0) * (Number(part.unitPrice) || 0), 0);
    document.getElementById('basket-count').textContent = String(parts.length);
    document.getElementById('basket-total').textContent = this.money(total);
    document.getElementById('basket-preview').innerHTML = parts.length
      ? parts.slice(0, 4).map(part => `<div class="basket-line"><strong>${ServiceUI.esc(part.itemName || part.partNumber)}</strong><span>${ServiceUI.esc(String(part.quantity || 1))} × ${this.money(part.unitPrice)}</span></div>`).join('')
      : '<div class="workspace-empty">No parts selected.</div>';
  },

  async createEstimate() {
    WorkOrderForm.readParts();
    const parts = WorkOrderForm.parts.filter(part => part.partNumber || part.itemName);
    const incomplete = parts.filter(part => !part.partNumber || !part.itemName || !part.hsnSac || part.gstRate === '' || part.gstRate == null || part.unitPrice === '' || part.unitPrice == null);
    if (!parts.length) {
      this.showToast('Add a catalogue part before creating an estimate.');
      this.openParts();
      return;
    }
    if (incomplete.length) {
      this.showToast('Estimate needs part number, name, HSN, GST and price. Add verified catalogue parts.');
      this.openDialog('job-details-dialog');
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
          items: parts.map(part => ({
            itemType: 'part',
            partNumber: part.partNumber,
            description: part.itemName,
            hsnSac: part.hsnSac,
            gstRate: Number(part.gstRate),
            quantity: Number(part.quantity) || 1,
            unitPrice: Number(part.unitPrice) || 0,
            source: part.source || 'catalog'
          }))
        })
      });
      this.estimate = data.estimate;
      this.renderEstimateState();
      this.showToast(`Estimate ${data.estimate.estimate_number} saved.`);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Create estimate';
    }
  },

  openParts() {
    this.openDialog('parts-dialog');
    document.getElementById('parts-query').focus();
  },

  async searchParts() {
    const query = document.getElementById('parts-query').value.trim();
    const host = document.getElementById('parts-search-results');
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

  addCatalogPart(item) {
    if (!item) return;
    WorkOrderForm.readParts();
    WorkOrderForm.parts.push({
      partNumber: item.part_number || '',
      itemName: item.tagro_name || item.item_name || item.stihl_name || '',
      quantity: 1,
      unitPrice: item.retail_price ?? item.mrp ?? '',
      hsnSac: item.hsn_sac || '',
      gstRate: item.gst_rate ?? '',
      notes: '',
      source: item.data_source || 'catalog'
    });
    WorkOrderForm.renderParts();
    WorkOrderForm.changed();
    document.getElementById('parts-dialog').close();
    this.showToast('Part added. Continue working on this job.');
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
    WorkOrderForm.parts.push({ quantity: 1, source: 'manual' });
    WorkOrderForm.renderParts();
    this.openDialog('job-details-dialog');
    this.showToast('Manual part row added. Complete the details.');
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
    const events = Array.isArray(this.order.events) ? this.order.events : [];
    document.getElementById('workspace-timeline').innerHTML = events.length ? events.map((event, index) => `
      <article class="timeline-event ${index === events.length - 1 ? 'current' : ''}">
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
    if (['delivered', 'cancelled'].includes(status)) return 'closed';
    return '';
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
