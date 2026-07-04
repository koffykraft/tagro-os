(function(global) {
  'use strict';
  const Registry = {
    WORKSHOP: {
      JOB_CREATED: 'job_created',
      INSPECTION_STARTED: 'inspection_started',
      INSPECTION_COMPLETED: 'inspection_completed',
      DIAGNOSTIC_DISCOVERY: 'workshop_diagnostic_discovery',
      REPAIR_STARTED: 'repair_started',
      REPAIR_PAUSED: 'repair_paused',
      REPAIR_RESUMED: 'repair_resumed',
      REPAIR_COMPLETED: 'repair_completed'
    },
    ESTIMATE: { DRAFTED: 'estimate_drafted', REVISED: 'estimate_revised', SENT: 'estimate_sent' },
    APPROVAL: { APPROVED: 'customer_approved', DECLINED: 'customer_declined', ABANDONED: 'customer_abandoned' },
    INVENTORY: { REQUESTED: 'parts_requested', ORDERED: 'parts_ordered', ARRIVED: 'parts_arrived' },
    FINANCE: { PAYMENT_RECEIVED: 'payment_received' }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Registry = Object.freeze(Registry);
})(typeof window !== 'undefined' ? window : this);