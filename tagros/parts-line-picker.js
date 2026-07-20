const PartsLinePicker = {
  session: null,
  order: null,
  jobId: '',
  lines: [],
  nextId: 1,
  timers: new Map(),
  destination: 'hold:1',
  model: '',
  workspace: null,

  async boot() {
    this.session = await Session.restore();
    if (!this.session) {
      location.replace('login.html');
      return;
    }
    const params = new URLSearchParams(location.search);
    this.workspace = TAGRO_WORKSPACE.read();
    this.jobId = String(params.get('job') || this.workspace.objects?.jobId || '').trim();
    this.destination = this.jobId ? `job:${this.jobId}` : 'hold:1';
    this.model = this.normalizeModel(params.get('model') || this.workspace.objects?.model || '');
    const planeUrl = new URL(location.href);
    planeUrl.searchParams.set('plane', 'parts-selection');
    TAGRO_WORKSPACE.capture('catalog', planeUrl);
    this.syncViewport();
    window.addEventListener('resize', () => this.syncViewport());
    window.visualViewport?.addEventListener('resize', () => this.syncViewport());
    window.visualViewport?.addEventListener('scroll', () => this.syncViewport());
    document.getElementById('picker-done').addEventListener('click', () => this.done());
    document.getElementById('add-selected-parts').addEventListener('click', () => this.commit());
    if (this.model) this.showModelContext(this.model);
    if (this.jobId) await this.loadJobContext();
    if (!this.restoreWorkspaceSelection()) this.addLine(true);
  },

  showModelContext(model) {
    const state = document.getElementById('picker-plane-state');
    document.getElementById('picker-plane-model').textContent = model;
    document.getElementById('picker-machine').textContent = model;
    state.hidden = false;
  },

  restoreWorkspaceSelection() {
    const selected = Array.isArray(this.workspace?.selectedParts) ? this.workspace.selectedParts : [];
    if (!selected.length) return false;
    if (this.jobId && this.workspace.objects?.jobId !== this.jobId) return false;
    this.lines = selected.map(part => ({
      id: this.nextId++, query: '', results: [],
      selected: {
        partNumber: part.partNumber || '',
        tagroName: part.itemName || part.tagroName || '',
        officialName: part.officialName || '',
        retailPrice: part.unitPrice ?? part.retailPrice ?? 0,
        hsn: part.hsnSac || part.hsn || '',
        gst: part.gstRate ?? part.gst ?? '',
        source: part.source || 'parts_master'
      },
      quantity: Math.max(1, Number(part.quantity || 1)),
      draftReady: part.draft !== true,
      editing: part.draft === true,
      error: ''
    }));
    this.render();
    return true;
  },

  async loadJobContext() {
    const message = document.getElementById('parts-picker-message');
    try {
      const data = await Api.request(`/work-orders/${encodeURIComponent(this.jobId)}`);
      this.order = data.workOrder || {};
      const machine = this.order.machineDescription ||
        [this.order.makeName, this.order.modelName].filter(Boolean).join(' ') || 'Machine not recorded';
      this.model = this.model || this.normalizeModel(machine);
      TAGRO_WORKSPACE.setObjects({
        customerId: this.order.customerId || this.workspace.objects?.customerId || null,
        machineId: this.order.machineId || this.workspace.objects?.machineId || null,
        model: this.model || this.workspace.objects?.model || null,
        jobId: this.jobId
      });
      if (this.model) this.showModelContext(this.model);
      document.getElementById('picker-machine').textContent = machine;
      document.getElementById('picker-destination').textContent = 'Current job';
      document.getElementById('picker-customer').textContent =
        [this.order.customerName, this.order.customerPlace].filter(Boolean).join(', ') || 'Not recorded';
      document.getElementById('picker-complaint').textContent = this.order.complaint || 'Not recorded';
      document.getElementById('picker-job-context').hidden = false;
      const observation = String(this.order.observation || '').trim();
      if (observation) {
        document.getElementById('picker-observation').textContent = observation;
        document.getElementById('picker-observation-row').hidden = false;
      }
    } catch (error) {
      message.textContent = error.message;
    }
  },

  syncViewport() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--picker-viewport-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
    document.documentElement.style.setProperty('--picker-viewport-top', `${Math.round(viewport?.offsetTop || 0)}px`);
  },

  addLine(focus = false) {
    this.lines.push({
      id: this.nextId++,
      query: '',
      results: [],
      selected: null,
      quantity: 1,
      draftReady: false,
      editing: true,
      error: ''
    });
    this.render();
    if (focus) this.focusLine(this.lines[this.lines.length - 1].id);
  },

  render() {
    const host = document.getElementById('parts-lines');
    host.innerHTML = this.lines.map((line, index) => this.lineTemplate(line, index)).join('') +
      `<div class="part-line add-line-row">
        <span class="part-line-number">${this.lines.length + 1}</span>
        <button class="add-part-line" type="button" data-add-line>＋ Add another line</button>
      </div>`;
    this.bindLines();
    this.renderSummary();
  },

  lineTemplate(line, index) {
    if (line.selected && line.draftReady && !line.editing) {
      const total = this.price(line.selected) * line.quantity;
      return `<article class="part-line confirmed" data-line="${line.id}">
        <span class="part-line-number">${index + 1}</span>
        <div class="confirmed-line-wrap">
          <button class="confirmed-part-line" type="button" data-edit-line="${line.id}" aria-label="Edit ${OS.esc(this.name(line.selected))}">
            <span><strong>${OS.esc(this.name(line.selected))}</strong><small>${OS.esc(line.selected.partNumber || '')}</small></span>
            <span class="confirmed-quantity">Qty ${line.quantity}</span>
            <b>${this.money(total)}</b>
            <i aria-hidden="true">✓</i>
          </button>
          <button class="delete-part-line" type="button" data-remove-line="${line.id}" aria-label="Delete ${OS.esc(this.name(line.selected))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8l-.6 12H8.6L8 7Zm2-3h4l1 1h4v2H5V5h4l1-1Z"/></svg>
          </button>
        </div>
      </article>`;
    }
    if (line.selected) {
      const price = this.price(line.selected);
      return `<article class="part-line editing" data-line="${line.id}">
        <span class="part-line-number">${index + 1}</span>
        <div class="part-line-content">
          <div class="part-line-selected">
            <button class="part-selected-name" type="button" data-change-part="${line.id}" aria-label="Change ${OS.esc(this.name(line.selected))}">
              <strong>${OS.esc(this.name(line.selected))}</strong>
              <small>${OS.esc(line.selected.partNumber || '')}</small>
            </button>
            <span class="part-quantity" aria-label="Quantity">
              <button type="button" data-quantity-down="${line.id}" aria-label="Reduce quantity">−</button>
              <output>${line.quantity}</output>
              <button type="button" data-quantity-up="${line.id}" aria-label="Increase quantity">+</button>
            </span>
            <b class="part-line-total">${this.money(price * line.quantity)}</b>
            <button class="delete-part-line" type="button" data-remove-line="${line.id}" aria-label="Delete ${OS.esc(this.name(line.selected))}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8l-.6 12H8.6L8 7Zm2-3h4l1 1h4v2H5V5h4l1-1Z"/></svg>
            </button>
            <button class="confirm-part-line" type="button" data-confirm-line="${line.id}"
              aria-label="Keep ${OS.esc(this.name(line.selected))} in the draft list"
              title="Draft only — use Add to Job / Estimate to save">✓</button>
          </div>
        </div>
      </article>`;
    }
    return `<article class="part-line search-part-line" data-line="${line.id}">
      <span class="part-line-number">${index + 1}</span>
      <div class="part-line-content">
        <label class="part-line-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" autocomplete="off" enterkeyhint="search"
            data-line-query="${line.id}" value="${OS.esc(line.query)}"
            placeholder="Search name, alias or number">
        </label>
        <div class="part-inline-results" data-line-results="${line.id}" hidden></div>
      </div>
    </article>`;
  },

  bindLines() {
    document.querySelectorAll('[data-line-query]').forEach(input => {
      input.addEventListener('input', event => this.queueSearch(Number(event.target.dataset.lineQuery), event.target.value));
      input.addEventListener('focus', () => this.keepLineVisible(Number(input.dataset.lineQuery)));
      input.addEventListener('blur', () => {
        setTimeout(() => this.closeResults(Number(input.dataset.lineQuery)), 160);
      });
    });
    document.querySelectorAll('[data-quantity-down]').forEach(button => button.addEventListener('click', () => this.changeQuantity(Number(button.dataset.quantityDown), -1)));
    document.querySelectorAll('[data-quantity-up]').forEach(button => button.addEventListener('click', () => this.changeQuantity(Number(button.dataset.quantityUp), 1)));
    document.querySelectorAll('[data-confirm-line]').forEach(button => button.addEventListener('click', () => this.confirmLine(Number(button.dataset.confirmLine))));
    document.querySelectorAll('[data-edit-line]').forEach(button => button.addEventListener('click', () => this.editLine(Number(button.dataset.editLine))));
    document.querySelectorAll('[data-change-part]').forEach(button => button.addEventListener('click', () => this.changePart(Number(button.dataset.changePart))));
    document.querySelectorAll('[data-remove-line]').forEach(button => button.addEventListener('click', () => this.removeLine(Number(button.dataset.removeLine))));
    document.querySelector('[data-add-line]')?.addEventListener('click', () => this.addLine(true));
  },

  queueSearch(lineId, value) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line) return;
    line.query = value;
    line.error = '';
    clearTimeout(this.timers.get(lineId));
    if (value.trim().length < 2) {
      line.results = [];
      this.renderLineResults(lineId);
      return;
    }
    this.timers.set(lineId, setTimeout(() => this.search(lineId), 220));
  },

  async search(lineId) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line || line.selected) return;
    const query = line.query.trim();
    if (query.length < 2) return;
    try {
      const path = `/knowledge/parts?query=${encodeURIComponent(query)}&limit=8` +
        (this.model ? `&model=${encodeURIComponent(this.model)}` : '');
      const data = await Api.request(path);
      if (line.query.trim() !== query) return;
      line.results = (data.parts || []).map(part => ({
        partNumber: part.currentPartNumber || part.partNumber || '',
        officialName: part.stihlName || part.name || '',
        tagroName: part.tagroName || part.name || part.stihlName || '',
        retailPrice: part.retailPrice,
        mrp: part.mrp,
        hsn: part.hsn,
        gst: part.gst,
        source: (part.sources || []).join('+') || 'parts_master'
      }));
      line.error = '';
    } catch (error) {
      line.results = [];
      line.error = error.message;
    }
    this.renderLineResults(lineId);
  },

  renderLineResults(lineId) {
    const line = this.lines.find(item => item.id === lineId);
    const article = document.querySelector(`[data-line="${lineId}"]`);
    const host = article?.querySelector(`[data-line-results="${lineId}"]`);
    if (!line || !article || !host) return;
    const markup = line.error
      ? `<div class="part-line-note">${OS.esc(line.error)}</div>`
      : line.results.length
        ? line.results.map((part, resultIndex) => `
            <button class="part-inline-result" type="button" data-select-result="${line.id}:${resultIndex}">
              <span><strong>${OS.esc(this.name(part))}</strong><small>${OS.esc(part.partNumber || '')}</small></span>
              <b>${this.money(this.price(part))}</b><i aria-hidden="true">＋</i>
            </button>`).join('')
        : line.query.trim().length >= 2
          ? '<div class="part-line-note">No matching parts</div>'
          : '';
    host.innerHTML = markup;
    host.hidden = !markup;
    article.classList.toggle('results-open', Boolean(markup));
    host.querySelectorAll('[data-select-result]').forEach(button => button.addEventListener('pointerdown', event => {
      event.preventDefault();
      const [selectedLineId, resultIndex] = button.dataset.selectResult.split(':').map(Number);
      this.selectResult(selectedLineId, resultIndex);
    }));
  },

  closeResults(lineId) {
    const article = document.querySelector(`[data-line="${lineId}"]`);
    const host = article?.querySelector(`[data-line-results="${lineId}"]`);
    if (!article || !host) return;
    host.hidden = true;
    article.classList.remove('results-open');
  },

  selectResult(lineId, resultIndex) {
    const line = this.lines.find(item => item.id === lineId);
    const part = line?.results[resultIndex];
    if (!line || !part) return;
    line.selected = part;
    line.results = [];
    line.quantity = 1;
    line.draftReady = false;
    line.editing = true;
    line.error = '';
    this.render();
    this.syncWorkspaceSelection();
  },

  changeQuantity(lineId, amount) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line?.selected) return;
    line.quantity = Math.max(1, Number(line.quantity || 1) + amount);
    this.render();
    this.syncWorkspaceSelection();
  },

  confirmLine(lineId) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line?.selected) return;
    line.draftReady = true;
    line.editing = false;
    const index = this.lines.indexOf(line);
    const hasEmptyAfter = this.lines.slice(index + 1).some(item => !item.selected);
    if (!hasEmptyAfter) this.addLine(true);
    else this.render();
    this.syncWorkspaceSelection();
  },

  editLine(lineId) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line?.selected) return;
    line.editing = true;
    this.render();
  },

  changePart(lineId) {
    const line = this.lines.find(item => item.id === lineId);
    if (!line?.selected) return;
    line.query = '';
    line.results = [];
    line.selected = null;
    line.quantity = 1;
    line.draftReady = false;
    line.editing = true;
    this.render();
    this.focusLine(lineId);
    this.syncWorkspaceSelection();
  },

  removeLine(lineId) {
    const index = this.lines.findIndex(item => item.id === lineId);
    if (index < 0) return;
    this.lines.splice(index, 1);
    if (!this.lines.length) this.addLine(true);
    else this.render();
    this.syncWorkspaceSelection();
  },

  syncWorkspaceSelection(committed = false) {
    const selectedParts = this.lines.filter(line => line.selected).map(line => ({
      partNumber: line.selected.partNumber,
      itemName: this.name(line.selected),
      quantity: line.quantity,
      unitPrice: this.price(line.selected),
      hsnSac: line.selected.hsn || '',
      gstRate: line.selected.gst ?? '',
      source: line.selected.source || 'parts_master',
      draft: committed ? false : !line.draftReady
    }));
    const confirmed = selectedParts.filter(part => part.draft === false);
    TAGRO_WORKSPACE.setSelection(selectedParts, { lineCount: confirmed.length });
  },

  focusLine(lineId, cursor = null) {
    requestAnimationFrame(() => {
      const input = document.querySelector(`[data-line-query="${lineId}"]`);
      if (!input) return;
      input.focus({ preventScroll: true });
      if (cursor !== null) input.setSelectionRange(cursor, cursor);
      this.keepLineVisible(lineId);
    });
  },

  keepLineVisible(lineId) {
    requestAnimationFrame(() => {
      document.querySelector(`[data-line="${lineId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  },

  renderSummary() {
    const confirmed = this.lines.filter(line => line.draftReady && line.selected);
    const total = confirmed.reduce((sum, line) => sum + this.price(line.selected) * line.quantity, 0);
    document.getElementById('selected-count').textContent = String(confirmed.length);
    document.getElementById('selected-total').textContent = this.money(total);
    document.getElementById('add-selected-parts').disabled = confirmed.length === 0;
  },

  commit() {
    const confirmed = this.lines.filter(line => line.draftReady && line.selected);
    if (!confirmed.length) return;
    const key = this.destination.startsWith('job:')
      ? `tagro_parts_handoff_${this.destination.slice(4)}`
      : `tagro_parts_hold_${this.destination.slice(5)}`;
    const stored = OS.get(key, []);
    const parts = Array.isArray(stored) ? stored : [];
    for (const line of confirmed) {
      const part = {
        partNumber: line.selected.partNumber,
        itemName: this.name(line.selected),
        quantity: line.quantity,
        unitPrice: this.price(line.selected),
        hsnSac: line.selected.hsn || '',
        gstRate: line.selected.gst ?? '',
        source: line.selected.source || 'parts_master',
        draft: false
      };
      const existing = parts.find(item => item.partNumber === part.partNumber);
      if (existing) existing.quantity = Number(existing.quantity || 0) + part.quantity;
      else parts.push(part);
    }
    OS.set(key, parts);
    this.syncWorkspaceSelection(true);
    if (this.jobId) {
      location.href = `work.html?id=${encodeURIComponent(this.jobId)}#parts-reference`;
      return;
    }
    document.getElementById('parts-picker-message').textContent =
      `${confirmed.length} part${confirmed.length === 1 ? '' : 's'} saved to My Pick List.`;
    this.lines = [];
    this.nextId = 1;
    this.addLine(true);
  },

  done() {
    if (this.jobId) {
      location.href = `work.html?id=${encodeURIComponent(this.jobId)}#parts-reference`;
      return;
    }
    const previous = TAGRO_WORKSPACE.read().previous;
    if (previous?.href && previous.planeId !== 'parts-selection') {
      location.href = previous.href;
      return;
    }
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  },

  normalizeModel(value) {
    const match = String(value || '').toUpperCase().match(/\b(MS|FS|BR|SR)\s*-?\s*(\d{2,4})\b/);
    return match ? `${match[1]}${match[2]}` : '';
  },

  name(part) {
    return part.tagroName || part.officialName || part.partNumber || 'Unnamed part';
  },

  price(part) {
    const value = Number(part?.retailPrice ?? part?.mrp ?? 0);
    return Number.isFinite(value) ? value : 0;
  },

  money(value) {
    return Number(value || 0).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    });
  }
};

PartsLinePicker.boot();
