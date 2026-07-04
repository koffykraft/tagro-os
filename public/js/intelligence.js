(function(global) {
  'use strict';
  const Intelligence = {
    deriveCoachingReports: function(facts) {
      const reports = [];
      if (facts.some(f => f.metric === 'INSPECTION_DURATION_MINUTES' && f.payload.value < 5)) {
        reports.push({ focus: 'Documentation Invariants', directive: 'Some work notes need more detail to reinforce long-term confidence.' });
      }
      return reports;
    }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Intelligence = Object.freeze(Intelligence);
})(typeof window !== 'undefined' ? window : this);