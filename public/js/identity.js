(function(global) {
  'use strict';
  const Identity = {
    generate: function(prefix = 'id') {
      const epoch = Date.now().toString();
      const entropy = Math.floor(1000 + Math.random() * 9000).toString();
      return prefix + '_' + epoch.slice(-6) + '_' + entropy;
    }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Identity = Object.freeze(Identity);
})(typeof window !== 'undefined' ? window : this);