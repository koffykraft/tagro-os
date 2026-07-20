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
      const plane = TAGRO_MANIFEST.planeForApp(app.id);
      if (plane) link.dataset.workspacePlane = plane.id;
      if (app.id === activeId) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
      const mark = document.createElement('span');
      mark.className = 'nav-icon';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = app.navIcon || '•';
      link.append(mark, document.createTextNode(app.label));
      link.addEventListener('click', () => Workspace.rememberDestination(app.id, link.href));
      container.insertBefore(link, container.querySelector('[data-app-nav-static]'));
    }
  },

  renderAll(session, root = document) {
    root.querySelectorAll('[data-app-navigation]').forEach(container => this.renderNavigation(container, session));
  },

  installMobileMore(root = document) {
    const button = root.getElementById('app-mobile-more');
    if (!button || root.getElementById('app-more-dialog')) return;
    const dialog = root.createElement('dialog');
    dialog.id = 'app-more-dialog';
    dialog.className = 'app-more-dialog';
    dialog.innerHTML = '<div class="app-more-card"><div class="app-more-head"><strong>More</strong><button type="button" data-close-more aria-label="Close">×</button></div><nav data-app-navigation="drawer" aria-label="More tools"></nav></div>';
    root.body.append(dialog);
    button.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-close-more]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    const session = Session.get();
    if (session) this.renderNavigation(dialog.querySelector('[data-app-navigation]'), session);
  }
};

window.addEventListener('DOMContentLoaded', () => AppShell.installMobileMore());
