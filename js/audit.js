'use strict';
// No-op when running without a server — calls silently succeed
const Audit = (() => {
  function log() {}
  return { log };
})();
