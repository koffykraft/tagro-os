(function(global) {
  'use strict';
  const _schemas = {};
  const EventFactory = {
    registerSchemaDecorator: function(type, decoratorFn) { _schemas[type] = decoratorFn; },
    build: function(job, type, sourceForm, session) {
      const node = {
        factId: global.TAGRO_CORE.Identity.generate('fact'),
        type: type,
        at: global.TAGRO_CORE.Clock.now(),
        by: session?.name || 'Operator Counter',
        branch: session?.branch || job?.branch || 'HQ',
        note: sourceForm?.note || null
      };
      const activeEst = global.TAGRO_CORE.TimelineQuery.getActiveEstimate(job);
      if (activeEst && activeEst.estimateId) node.estimateId = activeEst.estimateId;
      if (type === 'estimate_drafted' || type === 'estimate_revised') node.estimateId = global.TAGRO_CORE.Identity.generate('est');
      if (_schemas[type]) { _schemas[type](node, sourceForm, job); } else { Object.assign(node, sourceForm); }
      return node;
    }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.EventFactory = EventFactory;
})(typeof window !== 'undefined' ? window : this);