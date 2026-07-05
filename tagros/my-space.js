const MySpace = {
  session: null,
  allOrders: [],
  mineOrders: [],
  activeMine: [],
  preferences: null,
  preferenceKey: '',
  parkedKey: '',
  toastTimer: null,
  builtInShortcuts: [
    { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', mark: 'W', className: 'whatsapp', enabled: true },
    { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/', mark: 'M', className: 'gmail', enabled: true },
    { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', mark: 'S', className: 'spotify', enabled: true },
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', mark: '▶', className: 'youtube', enabled: true },
    { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/', mark: 'I', className: 'instagram', enabled: true },
    { id: 'call', name: 'Call', url: 'tel:', mark: '☎', className: 'call', enabled: true }
  ],

  async boot() {
    this.session = await ServiceUI.session();
    if (!this.session) return;
    AppShell.renderAll(this.session);
    this.preferenceKey = `tagro_my_space_preferences_${this.session.id || 'staff'}`;
    this.parkedKey = `tagro_my_space_parked_${this.session.id || 'staff'}`;
    this.preferences = this.loadPreferences();
    this.applyIdentity();
    this.applyPreferences();
    this.bind();
    this.renderShortcuts();
    this.renderParked();
    await this.loadWork();
  },

  loadPreferences() {
    const stored = OS.get(this.preferenceKey, {});
    const custom = Array.isArray(stored.customShortcuts)
      ? stored.customShortcuts.filter(item => item && item.id && item.name && item.url)
      : [];
    const enabledIds = Array.isArray(stored.enabledShortcutIds)
      ? stored.enabledShortcutIds
      : this.builtInShortcuts.filter(item => item.enabled).map(item => item.id);
    return { compact: Boolean(stored.compact), enabledShortcutIds: enabledIds, customShortcuts: custom };
  },

  applyIdentity() {
    const name = String(this.session.name || 'Staff').trim();
    const firstName = name.split(/\s+/)[0] || 'Staff';
    const initials = name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase() || 'ST';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const role = String(this.session.role || 'staff').toLowerCase();
    const roleName = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Mechanic';
    document.getElementById('compact-greeting').textContent = greeting;
    document.getElementById('staff-name').textContent = firstName;
    document.getElementById('role-label').textContent = roleName;
    document.getElementById('profile-button').textContent = initials;
    document.getElementById('branch-label').textContent = this.session.branch || 'Branch';
    document.getElementById('queue-name').textContent = `${this.session.branch || 'Branch'} Queue`;
    document.getElementById('manage-link').hidden = !['owner', 'manager'].includes(role);
  },

  applyPreferences() {
    document.body.classList.toggle('compact', this.preferences.compact);
    document.getElementById('compact-mode').checked = this.preferences.compact;
  },

  bind() {
    const dialog = document.getElementById('personalize-dialog');
    document.getElementById('personalize-button').addEventListener('click', () => this.openPersonalization());
    document.querySelector('.customize-shortcuts').addEventListener('click', () => this.openPersonalization());
    document.getElementById('add-shortcut').addEventListener('click', () => this.addCustomShortcut());
    document.getElementById('save-personalization').addEventListener('click', event => {
      event.preventDefault();
      this.savePersonalization();
      dialog.close();
    });
    document.getElementById('clear-parked').addEventListener('click', () => this.clearParked());
    document.getElementById('profile-button').addEventListener('click', () => this.openDrawer());
    document.getElementById('mobile-menu').addEventListener('click', () => this.openDrawer());
    document.getElementById('mobile-more').addEventListener('click', () => this.openDrawer());
    document.querySelector('.drawer-backdrop').addEventListener('click', () => this.closeDrawer());
    document.querySelector('.drawer-heading button').addEventListener('click', () => this.closeDrawer());
    document.getElementById('sign-out').addEventListener('click', () => this.signOut());
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('global-query').focus();
      }
      if (event.key === 'Escape') this.closeDrawer();
    });
  },

  async loadWork() {
    try {
      const [allData, mineData] = await Promise.all([
        Api.request('/work-orders?limit=160'),
        Api.request('/work-orders?mine=1&limit=160')
      ]);
      this.allOrders = Array.isArray(allData.workOrders) ? allData.workOrders : [];
      this.mineOrders = Array.isArray(mineData.workOrders) ? mineData.workOrders : [];
      const active = order => !['delivered', 'cancelled'].includes(String(order.status || '').toLowerCase());
      const activeAll = this.allOrders.filter(active);
      this.activeMine = this.mineOrders.filter(active);
      document.getElementById('bench-count').textContent = String(this.activeMine.length);
      document.getElementById('queue-count').textContent = String(activeAll.length);
      this.renderResume();
      this.reconcileParked();
    } catch (error) {
      document.getElementById('bench-count').textContent = '—';
      document.getElementById('queue-count').textContent = '—';
      document.getElementById('resume-work').innerHTML = `<div class="space-empty compact">${ServiceUI.esc(error.message)}</div>`;
    }
  },

  renderResume() {
    const host = document.getElementById('resume-work');
    const order = this.activeMine[0];
    if (!order) {
      host.innerHTML = '<div class="space-empty compact">No active job is assigned to you. Open My Bench when a job is assigned.</div>';
      return;
    }
    const machine = ServiceUI.machine(order);
    const complaint = order.complaint || 'Work details pending';
    host.innerHTML = `
      <article class="resume-job">
        <div class="resume-details">
          <p class="resume-machine">${ServiceUI.esc(machine)} <span class="resume-complaint">· ${ServiceUI.esc(complaint)}</span></p>
          <span class="resume-number">${ServiceUI.esc(order.workOrder || '')}</span>
          <div class="resume-actions">
            <a class="resume-button" href="work.html?id=${encodeURIComponent(order.id)}">▶ Resume</a>
            <button class="park-button" type="button" data-park-order="${ServiceUI.esc(order.id)}">Park</button>
          </div>
        </div>
        <span class="resume-machine-mark" aria-hidden="true">T</span>
      </article>`;
    host.querySelector('[data-park-order]').addEventListener('click', () => this.parkOrder(order));
  },

  parkedItems() {
    const items = OS.get(this.parkedKey, []);
    return Array.isArray(items) ? items.filter(item => item && item.id && item.href && item.title) : [];
  },

  parkOrder(order) {
    const items = this.parkedItems();
    if (items.some(item => item.id === order.id)) {
      this.showToast('This job is already parked.');
      return;
    }
    items.unshift({
      id: order.id,
      kind: 'job',
      title: ServiceUI.machine(order),
      detail: order.workOrder || order.complaint || 'Work order',
      href: `work.html?id=${encodeURIComponent(order.id)}`
    });
    OS.set(this.parkedKey, items.slice(0, 10));
    this.renderParked();
    this.showToast('Job parked in My Space.');
  },

  reconcileParked() {
    const knownOrders = new Set(this.allOrders.map(order => String(order.id)));
    const items = this.parkedItems();
    const filtered = items.filter(item => item.kind !== 'job' || knownOrders.has(String(item.id)));
    if (filtered.length !== items.length) OS.set(this.parkedKey, filtered);
    this.renderParked();
  },

  renderParked() {
    const host = document.getElementById('parked-list');
    const items = this.parkedItems();
    document.getElementById('clear-parked').hidden = items.length === 0;
    if (!items.length) {
      host.innerHTML = '<div class="parked-empty">Park a job here when you need to return to it quickly.</div>';
      return;
    }
    host.innerHTML = items.map(item => `
      <article class="parked-item">
        <a href="${ServiceUI.esc(item.href)}">
          <span class="parked-item-icon" aria-hidden="true">${item.kind === 'job' ? '▱' : '◇'}</span>
          <span><strong>${ServiceUI.esc(item.title)}</strong><small>${ServiceUI.esc(item.detail || '')}</small></span>
        </a>
        <button class="remove-parked" type="button" data-remove-parked="${ServiceUI.esc(item.id)}" aria-label="Remove ${ServiceUI.esc(item.title)}">×</button>
      </article>`).join('');
    host.querySelectorAll('[data-remove-parked]').forEach(button => button.addEventListener('click', () => {
      this.removeParked(button.dataset.removeParked);
    }));
  },

  removeParked(id) {
    OS.set(this.parkedKey, this.parkedItems().filter(item => String(item.id) !== String(id)));
    this.renderParked();
  },

  clearParked() {
    if (!this.parkedItems().length) return;
    OS.set(this.parkedKey, []);
    this.renderParked();
    this.showToast('Parked items cleared.');
  },

  allShortcuts() {
    return [
      ...this.builtInShortcuts,
      ...this.preferences.customShortcuts.map(item => ({
        ...item,
        mark: item.mark || item.name[0].toUpperCase(),
        className: 'custom',
        custom: true
      }))
    ];
  },

  renderShortcuts() {
    const host = document.getElementById('shortcut-list');
    const enabled = new Set(this.preferences.enabledShortcutIds);
    const visible = this.allShortcuts().filter(item => enabled.has(item.id));
    if (!visible.length) {
      host.innerHTML = '<div class="parked-empty">Choose shortcuts in Personalize.</div>';
      return;
    }
    host.innerHTML = visible.map(item => {
      const isExternalWeb = /^https?:/i.test(item.url);
      const target = isExternalWeb ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="shortcut-tile" href="${ServiceUI.esc(item.url)}"${target} aria-label="Open ${ServiceUI.esc(item.name)}"><span class="shortcut-logo ${ServiceUI.esc(item.className)}">${ServiceUI.esc(item.mark)}</span><span>${ServiceUI.esc(item.name)}</span></a>`;
    }).join('');
  },

  openPersonalization() {
    this.preferences = this.loadPreferences();
    document.getElementById('compact-mode').checked = this.preferences.compact;
    this.renderShortcutSettings();
    document.getElementById('shortcut-message').textContent = '';
    document.getElementById('personalize-dialog').showModal();
  },

  renderShortcutSettings() {
    const host = document.getElementById('shortcut-settings');
    const enabled = new Set(this.preferences.enabledShortcutIds);
    host.innerHTML = this.allShortcuts().map(item => `
      <div class="shortcut-setting">
        <label>
          <input type="checkbox" data-shortcut-toggle="${ServiceUI.esc(item.id)}"${enabled.has(item.id) ? ' checked' : ''}>
          <span>${ServiceUI.esc(item.name)}</span>
        </label>
        ${item.custom ? `<button type="button" data-delete-shortcut="${ServiceUI.esc(item.id)}" aria-label="Delete ${ServiceUI.esc(item.name)}">×</button>` : ''}
      </div>`).join('');
    host.querySelectorAll('[data-delete-shortcut]').forEach(button => button.addEventListener('click', () => this.deleteCustomShortcut(button.dataset.deleteShortcut)));
  },

  captureShortcutToggles() {
    this.preferences.enabledShortcutIds = [...document.querySelectorAll('[data-shortcut-toggle]:checked')]
      .map(input => input.dataset.shortcutToggle);
  },

  safeShortcutUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|tel:|mailto:|whatsapp:)/i.test(url) ? url : '';
  },

  addCustomShortcut() {
    const nameInput = document.getElementById('custom-name');
    const urlInput = document.getElementById('custom-url');
    const message = document.getElementById('shortcut-message');
    const name = nameInput.value.trim();
    const url = this.safeShortcutUrl(urlInput.value);
    if (!name || !url) {
      message.textContent = 'Enter a name and a link beginning with https://, tel:, mailto: or whatsapp:.';
      return;
    }
    this.captureShortcutToggles();
    const id = `custom-${Date.now().toString(36)}`;
    this.preferences.customShortcuts.push({ id, name, url, mark: name[0].toUpperCase(), className: 'custom', custom: true });
    this.preferences.enabledShortcutIds.push(id);
    nameInput.value = '';
    urlInput.value = '';
    message.textContent = 'Shortcut added. Save changes to keep it.';
    this.renderShortcutSettings();
  },

  deleteCustomShortcut(id) {
    this.captureShortcutToggles();
    this.preferences.customShortcuts = this.preferences.customShortcuts.filter(item => item.id !== id);
    this.preferences.enabledShortcutIds = this.preferences.enabledShortcutIds.filter(item => item !== id);
    this.renderShortcutSettings();
  },

  savePersonalization() {
    this.preferences.compact = document.getElementById('compact-mode').checked;
    this.captureShortcutToggles();
    OS.set(this.preferenceKey, this.preferences);
    this.applyPreferences();
    this.renderShortcuts();
    this.showToast('My Space updated.');
  },

  openDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    drawer.hidden = false;
    drawer.querySelector('.drawer-panel a:not([hidden]),.drawer-panel button').focus();
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
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
};

MySpace.boot();
