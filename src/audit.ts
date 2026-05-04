const Audit: AuditModule = (() => {
  function log(action: string, details: Record<string, unknown> = {}): void {
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details }),
    }).catch(() => { /* silently ignore network errors */ });
  }
  return { log };
})();
