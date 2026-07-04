(function(global) {
  'use strict';
  const TimelineQuery = {
    getActiveEstimate: function(job) {
      if (!job || !Array.isArray(job.timeline)) return null;
      return job.timeline.slice().reverse().find(ev => ev && (ev.type === 'estimate_drafted' || ev.type === 'estimate_revised'));
    },
    getLatestRepairStage: function(job) {
      if (!job || !Array.isArray(job.timeline)) return { stage: 'QUEUED' };
      const validTypes = ['repair_started', 'repair_paused', 'repair_resumed', 'repair_completed'];
      const last = job.timeline.slice().reverse().find(ev => ev && validTypes.includes(ev.type));
      if (!last) return { stage: 'QUEUED' };
      const findTechnician = () => {
        const start = job.timeline.slice().reverse().find(ev => ev && ev.type === 'repair_started' && ev.technician);
        return start ? start.technician : 'Assigned Staff';
      };
      if (last.type === 'repair_started' || last.type === 'repair_resumed') {
        return { stage: 'ACTIVE', technician: findTechnician(), at: last.at, by: last.by };
      }
      if (last.type === 'repair_paused') {
        return { stage: 'STALLED', reason: last.reason || 'General Delay', technician: findTechnician(), at: last.at, by: last.by };
      }
      if (last.type === 'repair_completed') return { stage: 'COMPLETED', at: last.at, by: last.by };
      return { stage: 'QUEUED' };
    },
    getJobPartsStatusMap: function(job) {
      if (!job || !Array.isArray(job.timeline)) return {};
      const statusMap = {};
      job.timeline.forEach(ev => {
        if (!ev) return;
        if (ev.type === 'parts_requested' && Array.isArray(ev.partNumbers)) {
          ev.partNumbers.forEach(p => { statusMap[p] = { status: 'REQUESTED', at: ev.at }; });
        }
        if (ev.type === 'parts_ordered' && Array.isArray(ev.partNumbers)) {
          ev.partNumbers.forEach(p => { if (statusMap[p]) statusMap[p].status = 'ORDERED'; });
        }
        if (ev.type === 'parts_arrived' && Array.isArray(ev.partNumbers)) {
          ev.partNumbers.forEach(p => { if (statusMap[p]) statusMap[p].status = 'ARRIVED'; });
        }
      });
      return statusMap;
    },
    getAuthoritativeBillingInvoice: function(job) {
      if (!job || !Array.isArray(job.timeline)) return null;
      const activeEst = this.getActiveEstimate(job);
      if (!activeEst || !activeEst.estimateSummary) return null;
      const receipt = job.timeline.slice().reverse().find(ev => ev && ev.type === 'payment_received');
      return {
        estimateId: activeEst.estimateId,
        totalsMatrix: activeEst.estimateSummary.calculations,
        isSettled: !!receipt,
        settlementDetails: receipt ? { receiptNo: receipt.receiptNo, method: receipt.method, processedAt: receipt.at } : null
      };
    },
    getNextRevisionNumber: function(job) {
      if (!job || !Array.isArray(job.timeline)) return 1;
      return job.timeline.filter(ev => ev && ev.type === 'estimate_revised').length + 2;
    },
    getPresentationLog: function(job, estimateId) {
      if (!job || !Array.isArray(job.timeline) || !estimateId) return null;
      return job.timeline.find(ev => ev && ev.type === 'estimate_sent' && ev.estimateId === estimateId);
    },
    getLatestInspection: function(job) {
      if (!job || !Array.isArray(job.timeline)) return null;
      return job.timeline.slice().reverse().find(ev => ev && ev.type === 'inspection_completed');
    }
  };
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.TimelineQuery = TimelineQuery;
})(typeof window !== 'undefined' ? window : this);