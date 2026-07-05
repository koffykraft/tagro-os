const IntakeApp = {
  session: null,
  draft: null,
  customerId: null,
  selectedCustomer: null,
  ensurePromise: null,
  saveChain: Promise.resolve(),
  toastTimer: null,
  complaintKey: '',
  complaints: [],
  workingComplaints: [],
  defaultComplaints: ["Won't Start", 'No Power', 'Chain Problem', 'Fuel Leak', 'Engine Noise', 'Service', 'Other'],

  async boot() {
    this.session = await ServiceUI.session();
    if (!this.session) return;
    ServiceUI.header(this.session);
    this.complaintKey = `tagro_intake_complaints_${this.session.id || 'staff'}`;
    this.complaints = this.loadComplaints();
    document.querySelectorAll('.admin-only').forEach(node => {
      node.hidden = !['manager', 'owner'].includes(String(this.session.role || '').toLowerCase());
    });
    this.bind();
    this.renderComplaints();
    this.updateAccessories();
    const draftId = new URLSearchParams(location.search).get('draft');
    if (draftId) await this.loadDraft(draftId);
    else this.renderPhotos();
    await this.loadInbox(false);
  },

  bind() {
    document.getElementById('take-photo').addEventListener('click', () => document.getElementById('camera-input').click());
    document.getElementById('upload-photo').addEventListener('click', () => document.getElementById('gallery-input').click());
    document.getElementById('admin-add').addEventListener('click', () => document.getElementById('gallery-input').click());
    document.getElementById('add-more').addEventListener('click', () => document.getElementById('gallery-input').click());
    document.getElementById('camera-input').addEventListener('change', event => this.uploadFiles(event.target.files, event.target));
    document.getElementById('gallery-input').addEventListener('change', event => this.uploadFiles(event.target.files, event.target));
    document.getElementById('save-draft').addEventListener('click', async () => {
      if (await this.saveDraft(true)) location.href = 'index.html';
    });
    document.getElementById('start-review').addEventListener('click', () => {
      this.setStep('review');
      document.querySelector('.review-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('customer-search').focus({ preventScroll: true });
    });
    document.getElementById('intake-form').addEventListener('submit', event => {
      event.preventDefault();
      this.createJob();
    });
    document.querySelectorAll('#intake-form input:not([type=file]),#intake-form textarea').forEach(control => {
      if (control.id !== 'customer-search') control.addEventListener('input', () => this.changed());
    });
    document.querySelectorAll('.accessory-options input').forEach(control => control.addEventListener('change', () => {
      this.updateAccessories();
      this.changed();
    }));
    document.getElementById('customer-search').addEventListener('input', ServiceUI.debounce(() => this.searchCustomers(), 300));
    document.getElementById('customer-search').addEventListener('keydown', event => {
      if (event.key === 'Escape') this.hideCustomerResults();
    });
    document.getElementById('customer-name').addEventListener('input', () => this.clearSelectedCustomerIfChanged());
    document.getElementById('customer-phone').addEventListener('input', () => this.clearSelectedCustomerIfChanged());
    document.getElementById('manage-complaints').addEventListener('click', () => this.openComplaintSettings());
    document.getElementById('add-complaint').addEventListener('click', () => this.addComplaint());
    document.getElementById('reset-complaints').addEventListener('click', () => {
      this.workingComplaints = [...this.defaultComplaints];
      this.renderComplaintSettings();
      document.getElementById('complaint-message').textContent = 'Default choices restored. Save to keep them.';
    });
    document.getElementById('save-complaints').addEventListener('click', event => {
      event.preventDefault();
      this.complaints = [...this.workingComplaints];
      OS.set(this.complaintKey, this.complaints);
      this.renderComplaints();
      document.getElementById('complaint-dialog').close();
      this.showToast('Quick complaint choices updated.');
    });
    document.getElementById('open-inbox').addEventListener('click', async () => {
      await this.loadInbox(true);
      document.getElementById('inbox-dialog').showModal();
    });
    document.getElementById('close-inbox').addEventListener('click', () => document.getElementById('inbox-dialog').close());
  },

  value(id) {
    return document.getElementById(id).value.trim();
  },

  payload() {
    return {
      customerId: this.customerId,
      customerName: this.value('customer-name') || null,
      customerPhone: this.value('customer-phone') || null,
      customerPlace: this.value('customer-place') || null,
      machineDescription: this.value('machine-description') || null,
      serialNumber: this.value('machine-serial') || null,
      complaint: this.value('complaint') || null,
      accessories: [...document.querySelectorAll('.accessory-options input:checked')].map(input => input.value),
      status: this.draft?.status === 'ready' ? 'ready' : 'needs_review'
    };
  },

  changed() {
    this.setStep('review');
    if (!this.draft) {
      this.setDraftState('Not saved', '');
      return;
    }
    this.setDraftState('Unsaved changes', 'saving');
    this.queueSave();
  },

  queueSave: ServiceUI.debounce(() => IntakeApp.saveDraft(false), 750),

  async ensureDraft() {
    if (this.draft) return this.draft;
    if (this.ensurePromise) return this.ensurePromise;
    this.setDraftState('Creating draft…', 'saving');
    this.ensurePromise = Api.request('/intake-drafts', {
      method: 'POST',
      body: JSON.stringify(this.payload())
    }).then(data => {
      this.draft = data.draft;
      this.customerId = data.draft.customerId || this.customerId;
      const url = new URL(location.href);
      url.searchParams.set('draft', this.draft.id);
      history.replaceState({}, '', url);
      this.renderDraft();
      return this.draft;
    }).catch(error => {
      this.setDraftState(error.message, 'error');
      throw error;
    }).finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  },

  async saveDraft(explicit) {
    this.saveChain = this.saveChain.catch(() => {}).then(async () => {
      const draft = await this.ensureDraft();
      this.setDraftState('Saving…', 'saving');
      const data = await Api.request(`/intake-drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PUT',
        body: JSON.stringify(this.payload())
      });
      this.draft = data.draft;
      this.setDraftState('Saved', 'saved');
      this.renderPhotos();
      if (explicit) this.showToast('Intake draft saved.');
      return true;
    }).catch(error => {
      this.setDraftState(error.message, 'error');
      this.showToast(error.message);
      return false;
    });
    return this.saveChain;
  },

  async loadDraft(id) {
    this.setDraftState('Loading…', 'saving');
    try {
      const data = await Api.request(`/intake-drafts/${encodeURIComponent(id)}`);
      this.draft = data.draft;
      this.customerId = data.draft.customerId || null;
      this.selectedCustomer = data.draft.customerId
        ? { name: data.draft.customerName || '', phone: data.draft.customerPhone || '' }
        : null;
      this.populate(data.draft);
      this.renderDraft();
    } catch (error) {
      this.setDraftState(error.message, 'error');
      this.showToast(error.message);
    }
  },

  populate(draft) {
    document.getElementById('customer-name').value = draft.customerName || '';
    document.getElementById('customer-phone').value = draft.customerPhone || '';
    document.getElementById('customer-place').value = draft.customerPlace || '';
    document.getElementById('machine-description').value = draft.machineDescription || '';
    document.getElementById('machine-serial').value = draft.serialNumber || '';
    document.getElementById('complaint').value = draft.complaint || '';
    const selected = new Set(draft.accessories || []);
    document.querySelectorAll('.accessory-options input').forEach(input => {
      input.checked = selected.has(input.value);
    });
    this.updateAccessories();
  },

  renderDraft() {
    if (!this.draft) return;
    this.setDraftState('Saved', 'saved');
    this.renderPhotos();
    this.setStep(this.draft.status === 'ready' ? 'create' : (this.draft.photoCount ? 'review' : 'photos'));
  },

  async uploadFiles(fileList, input) {
    const files = [...(fileList || [])];
    input.value = '';
    if (!files.length) return;
    const existingCount = this.draft?.photos?.length || 0;
    if (existingCount + files.length > 8) {
      this.showToast(`Choose ${Math.max(0, 8 - existingCount)} or fewer additional photos.`);
      return;
    }
    const invalid = files.find(file => file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (invalid) {
      this.showToast('Photos must be JPEG, PNG or WebP and 10 MB or smaller.');
      return;
    }
    try {
      const draft = await this.ensureDraft();
      const progress = document.getElementById('photo-progress');
      const bar = document.getElementById('photo-progress-bar');
      progress.classList.remove('hidden');
      for (let index = 0; index < files.length; index += 1) {
        const form = new FormData();
        form.append('photo', files[index]);
        form.append('photoType', (existingCount + index) === 0 ? 'service_sheet' : 'other');
        document.getElementById('photo-progress-label').textContent = `Uploading ${index + 1} of ${files.length}…`;
        bar.value = Math.round((index / files.length) * 100);
        const data = await Api.request(`/intake-drafts/${encodeURIComponent(draft.id)}/photos`, {
          method: 'POST',
          body: form
        });
        this.draft = data.draft;
        bar.value = Math.round(((index + 1) / files.length) * 100);
        this.renderPhotos();
      }
      this.setStep('review');
      this.setDraftState('Saved', 'saved');
      this.showToast(`${files.length} photo${files.length === 1 ? '' : 's'} attached.`);
      await this.loadInbox(false);
    } catch (error) {
      this.setDraftState(error.message, 'error');
      this.showToast(error.message);
    } finally {
      document.getElementById('photo-progress').classList.add('hidden');
      document.getElementById('photo-progress-bar').value = 0;
    }
  },

  renderPhotos() {
    const photos = this.draft?.photos || [];
    document.getElementById('photo-count').textContent = `(${photos.length})`;
    const grid = document.getElementById('photo-grid');
    if (!photos.length) {
      grid.innerHTML = '<div class="intake-empty">No photos yet. Typed entry remains available.</div>';
      return;
    }
    const labels = {
      service_sheet: 'Service sheet',
      machine: 'Machine',
      serial_plate: 'Serial plate',
      damage: 'Damage',
      other: 'Other'
    };
    grid.innerHTML = photos.map(photo => `
      <article class="intake-photo">
        <img src="${ServiceUI.esc(photo.url)}" alt="${ServiceUI.esc(labels[photo.photoType] || 'Intake photo')}" loading="lazy">
        <button class="delete-photo" type="button" data-delete-photo="${ServiceUI.esc(photo.id)}" aria-label="Remove ${ServiceUI.esc(photo.originalFilename)}">×</button>
        <div class="intake-photo-meta">
          <span class="intake-photo-name" title="${ServiceUI.esc(photo.originalFilename)}">${ServiceUI.esc(photo.originalFilename)}</span>
          <select class="photo-type" data-photo-type="${ServiceUI.esc(photo.id)}" aria-label="Photo type">
            ${Object.entries(labels).map(([value, label]) => `<option value="${value}"${photo.photoType === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      </article>`).join('');
    grid.querySelectorAll('[data-delete-photo]').forEach(button => button.addEventListener('click', () => this.deletePhoto(button.dataset.deletePhoto)));
    grid.querySelectorAll('[data-photo-type]').forEach(select => select.addEventListener('change', () => this.updatePhotoType(select.dataset.photoType, select.value)));
  },

  async updatePhotoType(photoId, photoType) {
    try {
      const data = await Api.request(`/intake-drafts/${encodeURIComponent(this.draft.id)}/photos/${encodeURIComponent(photoId)}`, {
        method: 'PUT',
        body: JSON.stringify({ photoType })
      });
      this.draft = data.draft;
      this.setDraftState('Saved', 'saved');
    } catch (error) {
      this.showToast(error.message);
      await this.loadDraft(this.draft.id);
    }
  },

  async deletePhoto(photoId) {
    const photo = (this.draft?.photos || []).find(item => item.id === photoId);
    if (!photo || !confirm(`Remove ${photo.originalFilename}? The stored original will be deleted.`)) return;
    try {
      const data = await Api.request(`/intake-drafts/${encodeURIComponent(this.draft.id)}/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE'
      });
      this.draft = data.draft;
      this.renderPhotos();
      this.showToast('Photo removed.');
    } catch (error) {
      this.showToast(error.message);
    }
  },

  async createJob() {
    const button = document.getElementById('create-job');
    button.disabled = true;
    button.textContent = 'Creating job…';
    this.setStep('create');
    try {
      const saved = await this.saveDraft(false);
      if (!saved) throw new Error('Save the intake before creating the job.');
      const data = await Api.request(`/intake-drafts/${encodeURIComponent(this.draft.id)}/complete`, {
        method: 'POST',
        body: JSON.stringify(this.payload())
      });
      location.href = `work.html?id=${encodeURIComponent(data.workOrder.id)}`;
    } catch (error) {
      this.showToast(error.message);
      button.disabled = false;
      button.textContent = 'Confirm & create job';
      this.setStep('review');
    }
  },

  async searchCustomers() {
    const query = this.value('customer-search');
    const results = document.getElementById('customer-results');
    if (query.length < 2) {
      this.hideCustomerResults();
      return;
    }
    try {
      const data = await Api.request(`/customers?query=${encodeURIComponent(query)}&limit=8`);
      const customers = data.customers || [];
      results.innerHTML = customers.length
        ? customers.map(customer => `<button class="search-result" type="button" data-customer-id="${ServiceUI.esc(customer.id)}"><strong>${ServiceUI.esc(customer.name)}</strong><small>${ServiceUI.esc([customer.phone, customer.address].filter(Boolean).join(' · '))}</small></button>`).join('')
        : '<div class="search-result"><strong>No previous customer</strong><small>Continue with the details below.</small></div>';
      results.classList.remove('hidden');
      results.querySelectorAll('[data-customer-id]').forEach(button => button.addEventListener('click', () => {
        this.chooseCustomer(customers.find(customer => customer.id === button.dataset.customerId));
      }));
    } catch (error) {
      results.innerHTML = `<div class="search-result">${ServiceUI.esc(error.message)}</div>`;
      results.classList.remove('hidden');
    }
  },

  async chooseCustomer(customer) {
    if (!customer) return;
    this.customerId = customer.id;
    this.selectedCustomer = { name: customer.name || '', phone: customer.phone || '' };
    document.getElementById('customer-name').value = customer.name || '';
    document.getElementById('customer-phone').value = customer.phone || '';
    document.getElementById('customer-place').value = customer.address || '';
    document.getElementById('customer-search').value = customer.name || '';
    this.hideCustomerResults();
    this.changed();
    try {
      const data = await Api.request(`/customers/${encodeURIComponent(customer.id)}/machines`);
      this.renderMachines(data.machines || []);
    } catch {}
  },

  clearSelectedCustomerIfChanged() {
    if (!this.selectedCustomer) return;
    if (this.value('customer-name') !== this.selectedCustomer.name || this.value('customer-phone') !== this.selectedCustomer.phone) {
      this.customerId = null;
      this.selectedCustomer = null;
    }
  },

  renderMachines(machines) {
    const host = document.getElementById('known-machines');
    if (!machines.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `<div class="field-label">Previous machines</div><div class="chip-row">${machines.map(machine => `<button type="button" class="choice-chip" data-known-machine="${ServiceUI.esc(machine.id)}">${ServiceUI.esc(machine.display_name)}</button>`).join('')}</div>`;
    host.querySelectorAll('[data-known-machine]').forEach(button => button.addEventListener('click', () => {
      const machine = machines.find(item => item.id === button.dataset.knownMachine);
      document.getElementById('machine-description').value = machine?.display_name || '';
      document.getElementById('machine-serial').value = machine?.serial_number || '';
      this.changed();
    }));
  },

  hideCustomerResults() {
    document.getElementById('customer-results').classList.add('hidden');
  },

  updateAccessories() {
    const selected = [...document.querySelectorAll('.accessory-options input:checked')].map(input => input.value);
    document.getElementById('accessory-summary').textContent = selected.length ? selected.join(', ') : 'None selected';
  },

  loadComplaints() {
    const stored = OS.get(this.complaintKey, null);
    if (!Array.isArray(stored)) return [...this.defaultComplaints];
    const safe = stored.map(value => String(value || '').trim().slice(0, 60)).filter(Boolean);
    return [...new Set(safe)].slice(0, 16);
  },

  renderComplaints() {
    const host = document.getElementById('complaint-quick-list');
    host.innerHTML = this.complaints.length
      ? this.complaints.map(label => `<button class="complaint-chip" type="button" data-quick-complaint="${ServiceUI.esc(label)}">${ServiceUI.esc(label)}</button>`).join('')
      : '<span class="quiet">No quick choices. Type the complaint below or configure choices.</span>';
    host.querySelectorAll('[data-quick-complaint]').forEach(button => button.addEventListener('click', () => {
      const field = document.getElementById('complaint');
      const label = button.dataset.quickComplaint;
      const parts = field.value.split(/\s*;\s*/).filter(Boolean);
      if (!parts.some(part => part.toLowerCase() === label.toLowerCase())) parts.push(label);
      field.value = parts.join('; ');
      button.classList.add('selected');
      this.changed();
      field.focus();
    }));
  },

  openComplaintSettings() {
    this.workingComplaints = [...this.complaints];
    document.getElementById('complaint-message').textContent = '';
    document.getElementById('new-complaint').value = '';
    this.renderComplaintSettings();
    document.getElementById('complaint-dialog').showModal();
  },

  renderComplaintSettings() {
    const host = document.getElementById('configured-complaints');
    host.innerHTML = this.workingComplaints.length
      ? this.workingComplaints.map((label, index) => `<div class="configured-complaint"><span>${ServiceUI.esc(label)}</span><button type="button" data-remove-complaint="${index}" aria-label="Remove ${ServiceUI.esc(label)}">×</button></div>`).join('')
      : '<div class="intake-empty">No quick choices configured.</div>';
    host.querySelectorAll('[data-remove-complaint]').forEach(button => button.addEventListener('click', () => {
      this.workingComplaints.splice(Number(button.dataset.removeComplaint), 1);
      this.renderComplaintSettings();
    }));
  },

  addComplaint() {
    const input = document.getElementById('new-complaint');
    const label = input.value.trim().slice(0, 60);
    const message = document.getElementById('complaint-message');
    if (!label) {
      message.textContent = 'Enter a complaint choice first.';
      return;
    }
    if (this.workingComplaints.some(item => item.toLowerCase() === label.toLowerCase())) {
      message.textContent = 'That choice already exists.';
      return;
    }
    if (this.workingComplaints.length >= 16) {
      message.textContent = 'Keep no more than 16 quick choices.';
      return;
    }
    this.workingComplaints.push(label);
    input.value = '';
    message.textContent = 'Choice added. Save to keep it.';
    this.renderComplaintSettings();
  },

  async loadInbox(render) {
    try {
      const data = await Api.request('/intake-drafts');
      const drafts = data.drafts || [];
      document.getElementById('inbox-count').textContent = String(drafts.length);
      if (!render) return;
      const host = document.getElementById('intake-inbox-list');
      host.innerHTML = drafts.length
        ? drafts.map(draft => `<a class="intake-inbox-item" href="receive.html?draft=${encodeURIComponent(draft.id)}"><span><strong>${ServiceUI.esc(draft.machineDescription || draft.customerName || 'Intake details pending')}</strong><small>${ServiceUI.esc(draft.branchCode)} · ${draft.photoCount} photo${draft.photoCount === 1 ? '' : 's'} · Updated ${ServiceUI.shortDate(draft.updatedAt)}</small></span><b>Resume →</b></a>`).join('')
        : '<div class="intake-empty">No unfinished intakes for this branch.</div>';
    } catch (error) {
      if (render) document.getElementById('intake-inbox-list').innerHTML = `<div class="intake-empty">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  setStep(step) {
    document.querySelectorAll('[data-step-indicator]').forEach(item => item.classList.toggle('active', item.dataset.stepIndicator === step));
  },

  setDraftState(message, kind) {
    const node = document.getElementById('draft-state');
    node.textContent = message;
    node.className = `draft-state${kind ? ` ${kind}` : ''}`;
  },

  showToast(message) {
    const toast = document.getElementById('intake-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
};

IntakeApp.boot();
