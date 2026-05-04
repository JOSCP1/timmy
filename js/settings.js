'use strict';

const Settings = (() => {
  function render() { renderMisc(); }

  function renderMisc() {
    const w = document.getElementById('miscSettings');
    if (!w) return;
    const current = localStorage.getItem('timmy_theme') || 'light';
    w.innerHTML = `
      <div class="form-field">
        <label style="font-size:13px;text-transform:none;letter-spacing:0;font-weight:600;margin-bottom:10px;display:block">Display Theme</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400">
            <input type="radio" name="appTheme" value="light" ${current==='light'?'checked':''} onchange="Settings.applyTheme('light')" /> Light
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400">
            <input type="radio" name="appTheme" value="dark" ${current==='dark'?'checked':''} onchange="Settings.applyTheme('dark')" /> Night
          </label>
        </div>
      </div>`;
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('night-mode', theme === 'dark');
    localStorage.setItem('timmy_theme', theme);
    renderMisc();
    App.toast(`${theme==='dark'?'Night':'Light'} mode enabled.`, 'ok');
  }

  return { render, applyTheme };
})();
