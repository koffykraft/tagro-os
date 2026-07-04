(function(global) {
  'use strict';
  const Guardian = {
    inspectPreCommit: function(job, proposedEvent, deviceContext) {
      if (proposedEvent.type === 'payment_received' && deviceContext?.appId !== 'app-billing') {
        return { authorized: false, fault: 'SECURITY_VIOLATION', reason: 'Cross-App boundary logic blocked.' };
      }
      return { authorized: true, fault: null };
    },
    raiseAlert: function(jobId, faultType, context) { console.warn('[GUARDIAN ALERT]', faultType, context); }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Guardian = Object.freeze(Guardian);
})(typeof window !== 'undefined' ? window : this);