const AppShell = {
  visibleApps(session) {
    return TAGRO_MANIFEST.apps.filter(app => TAGRO_MANIFEST.canAccess(app, session));
  },

  renderNavigation(container, session) {
    if (!container) return;
    const activeId = container.dataset.activeApp || '';
    const scope = container.dataset.appNavigation || '';
    container.querySelectorAll('[data-app-nav-item]').forEach(node => node.remove());
    const apps = this.visibleApps(session).filter(app => !Array.isArray(app.navigation) || app.navigation.includes(scope));
    for (const app of apps) {
      const link = document.createElement('a');
      link.href = app.file;
      link.dataset.appNavItem = app.id;
      link.dataset.appId = app.id;
      if (app.id === activeId) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
      const mark = document.createElement('span');
      mark.className = 'nav-icon';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = app.navIcon || '•';
      link.append(mark, document.createTextNode(app.label));
      container.insertBefore(link, container.querySelector('[data-app-nav-static]'));
    }
  },

  renderAll(session, root = document) {
    root.querySelectorAll('[data-app-navigation]').forEach(container => this.renderNavigation(container, session));
  },

  installCustomerSearch(root = document) {
    if (root.body?.matches('.my-space-page,.intake-page,.job-workspace-page')) return;
    if (root.getElementById('global-customer-search')) return;
    const button = root.createElement('button');
    button.id = 'global-customer-search';
    button.className = 'global-customer-search';
    button.type = 'button';
    button.textContent = 'Find customer';
    button.setAttribute('aria-label', 'Find a customer by name or phone');

    const dialog = root.createElement('dialog');
    dialog.className = 'global-customer-dialog';
    dialog.innerHTML = '<form method="dialog" class="global-customer-card"><div class="global-customer-head"><div><strong>Find customer</strong><small>Name or phone</small></div><button value="cancel" aria-label="Close">×</button></div><input class="control" id="global-customer-query" type="search" autocomplete="off" placeholder="Customer name or phone"><div id="global-customer-results" class="global-customer-results"><span>Type at least two characters.</span></div></form>';
    root.body.append(button, dialog);

    const input = dialog.querySelector('#global-customer-query');
    const results = dialog.querySelector('#global-customer-results');
    let timer;
    button.addEventListener('click', () => {
      dialog.showModal();
      input.focus();
    });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = input.value.trim();
        if (query.length < 2) {
          results.innerHTML = '<span>Type at least two characters.</span>';
          return;
        }
        results.innerHTML = '<span>Searching…</span>';
        try {
          const data = await Api.request('/customers?limit=8&query=' + encodeURIComponent(query));
          results.innerHTML = (data.customers || []).length
            ? data.customers.map(customer =>
                '<a href="app-customers.html?customer=' + encodeURIComponent(customer.id) + '"><strong>' +
                OS.esc(customer.name) + '</strong><small>' +
                OS.esc([customer.phone, customer.address].filter(Boolean).join(' · ')) + '</small></a>'
              ).join('')
            : '<span>No matching customer.</span>';
        } catch (error) {
          results.innerHTML = '<span>' + OS.esc(error.message) + '</span>';
        }
      }, 220);
    });
  }
};

window.addEventListener('DOMContentLoaded', () => AppShell.installCustomerSearch());
