'use strict';

const Storage = (() => {
  const KEY = 'olysec_data';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function clear() { localStorage.removeItem(KEY); }

  return { load, save, clear };
})();
