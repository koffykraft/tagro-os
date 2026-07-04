(function(global) {
  'use strict';
  global.TAGRO_CORE = global.TAGRO_CORE || {};
  global.TAGRO_CORE.Clock = Object.freeze({ now: function() { return new Date().toISOString(); } });
  global.TAGRO_CORE.persist = async function(jobId, eventPayload, activeSession, deviceMetaContext) {
    const context = typeof deviceMetaContext === 'string' ? { appId: deviceMetaContext, appVersion: '1.0.0' } : deviceMetaContext;
    
    let currentJobState = null;
    if (global.parent && global.parent.Jobs && typeof global.parent.Jobs.find === 'function') {
      currentJobState = global.parent.Jobs.find(jobId);
    }
    const gate = global.TAGRO_CORE.Guardian.inspectPreCommit(currentJobState, eventPayload, context);
    if (!gate.authorized) {
      global.TAGRO_CORE.Guardian.raiseAlert(jobId, gate.fault, gate.reason);
      throw new Error("This action is unavailable. Please refresh the workspace queue.");
    }
    
    const apiEndpoint = (global.parent && global.parent.TAGRO_MANIFEST?.api) || 'https://tagro-api.icy-fire-d2ac.workers.dev';
    const response = await fetch(apiEndpoint + '/api/persist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': context?.appId || 'unknown',
        'X-App-Version': context?.appVersion || '1.0.0',
        'X-Device-Id': 'terminal_client_node'
      },
      body: JSON.stringify({ jobId, event: eventPayload, session: activeSession })
    });
    if (!response.ok) throw new Error("This action is unavailable.");
    const updatedJob = await response.json();
    global.TAGRO_CORE.Observatory.observe(updatedJob, eventPayload);
    if (global.parent && global.parent.Jobs && typeof global.parent.Jobs.syncLocalCache === 'function') {
      global.parent.Jobs.syncLocalCache(updatedJob);
    }
    return updatedJob;
  };
})(typeof window !== 'undefined' ? window : this);