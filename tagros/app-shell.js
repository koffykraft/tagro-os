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
  }
};
