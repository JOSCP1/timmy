'use strict';
const Audit = (() => {
  function log(action, details = {}) {
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details }),
    }).catch(() => {});
  }
  return { log };
})();
