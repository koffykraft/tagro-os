(function(global) {
  'use strict';
  const PolicyEngine = {
    validate: function(job, targetType, payload) {
      const outcome = { block: false, warnings: [] };
      if (!job) return outcome;
      const timeline = job.timeline || [];
      if (targetType === 'repair_started') {
        if (!timeline.some(ev => ev && ev.type === 'customer_approved')) {
          outcome.block = true; outcome.warnings.push("Cannot initialize execution loops without customer authorization.");
        }
      }
      if (targetType === 'payment_received') {
        if (!timeline.some(ev => ev && ev.type === 'repair_completed')) {
          outcome.block = true; outcome.warnings.push("Cannot clear receipts before completion confirmation.");
        }
      }
      return outcome;
    }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.PolicyEngine = Object.freeze(PolicyEngine);
})(typeof window !== 'undefined' ? window : this);