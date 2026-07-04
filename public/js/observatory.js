(function(global) {
  'use strict';
  let _warehouse = [];
  const Observatory = {
    observe: function(job, event) {
      if (!job || !event) return;
      if (event.type === 'inspection_completed') {
        const start = job.timeline.find(ev => ev && ev.type === 'inspection_started');
        if (start) {
          const duration = (new Date(event.at) - new Date(start.at)) / 60000;
          this.emitFact(job.id, job.branch, 'WORKSHOP', 'INSPECTION_DURATION_MINUTES', { value: duration });
        }
      }
    },
    emitFact: function(jobId, branch, domain, metric, payload) {
      _warehouse.push({ factId: 'fact_' + Math.random().toString(36).slice(2, 9), jobId, branch, domain, metric, timestamp: new Date().toISOString(), payload });
    },
    getFacts: function() { return [..._warehouse]; }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Observatory = Object.freeze(Observatory);
})(typeof window !== 'undefined' ? window : this);