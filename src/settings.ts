const Settings: SettingsModule = (() => {
  function render(): void { renderUsers(); renderOIDC(); renderMisc(); renderAudit(); }

  // ── Users ───────────────────────────────────────────────────────────────
  async function renderUsers(): Promise<void> {
    const tbody = document.getElementById('usersTbody');
    if (!tbody) return;
    const me    = Auth.currentUser();
    const users = await Auth.listUsers();
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td><span class="chip ${u.role==='admin'?'chip-h':'chip-l'}">${esc(u.role)}</span></td>
        <td>${new Date(u.created).toLocaleDateString()}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Change password"
            onclick="Settings.showChangePassword('${esc(u.username)}')">🔑</button>
          ${u.username !== me?.username
            ? `<button class="btn btn-danger btn-sm" onclick="Settings.deleteUser('${esc(u.username)}')">🗑</button>`
            : `<span style="font-size:11px;color:var(--c-muted);margin-left:4px">you</span>`}
        </td>
      </tr>`).join('');
  }

  function showAddUser(): void {
    App.openModal('Add User', `
      <div class="vuln-form">
        <div class="form-field"><label>Username</label><input type="text" id="nu_user" /></div>
        <div class="form-field"><label>Role</label>
          <select id="nu_role"><option value="user">user</option><option value="admin">admin</option></select></div>
        <div class="form-field full"><label>Password</label><input type="password" id="nu_pass" /></div>
        <div class="form-field full"><label>Confirm Password</label><input type="password" id="nu_pass2" /></div>
        <div id="nu_err" style="grid-column:1/-1;color:var(--c-danger);font-size:12px;min-height:16px"></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="Settings.confirmAddUser()">Add User</button>`);
  }

  async function confirmAddUser(): Promise<void> {
    const u  = ((document.getElementById('nu_user')  as HTMLInputElement|null)?.value||'').trim();
    const p  =  (document.getElementById('nu_pass')  as HTMLInputElement|null)?.value||'';
    const p2 =  (document.getElementById('nu_pass2') as HTMLInputElement|null)?.value||'';
    const r  = ((document.getElementById('nu_role')  as HTMLSelectElement|null)?.value||'user') as UserRole;
    const e  =   document.getElementById('nu_err');
    if (!u)       { if(e)e.textContent='Username required.'; return; }
    if (!p)       { if(e)e.textContent='Password required.'; return; }
    if (p !== p2) { if(e)e.textContent='Passwords do not match.'; return; }
    const err = await Auth.addUser(u, p, r);
    if (err) { if(e)e.textContent=err; return; }
    App.closeModal(); await renderUsers(); App.toast(`User "${u}" added.`,'ok');
  }

  async function deleteUser(username: string): Promise<void> {
    if (!confirm(`Delete user "${username}"?`)) return;
    const err = await Auth.removeUser(username);
    if (err) { App.toast(err,'error'); return; }
    await renderUsers(); App.toast(`User "${username}" removed.`,'ok');
  }

  function showChangePassword(username: string): void {
    App.openModal(`Change Password – ${esc(username)}`, `
      <div class="vuln-form">
        <div class="form-field full"><label>New Password</label><input type="password" id="cp_pass" /></div>
        <div class="form-field full"><label>Confirm Password</label><input type="password" id="cp_pass2" /></div>
        <div id="cp_err" style="grid-column:1/-1;color:var(--c-danger);font-size:12px;min-height:16px"></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="Settings.confirmChangePassword('${esc(username)}')">Save</button>`);
  }

  async function confirmChangePassword(username: string): Promise<void> {
    const p  =  (document.getElementById('cp_pass')  as HTMLInputElement|null)?.value||'';
    const p2 =  (document.getElementById('cp_pass2') as HTMLInputElement|null)?.value||'';
    const e  =   document.getElementById('cp_err');
    if (!p)       { if(e)e.textContent='Password required.'; return; }
    if (p !== p2) { if(e)e.textContent='Passwords do not match.'; return; }
    const err = await Auth.changePassword(username, p);
    if (err) { if(e)e.textContent=err; return; }
    App.closeModal(); App.toast('Password updated.','ok');
  }

  // ── OIDC ────────────────────────────────────────────────────────────────
  function renderOIDC(): void {
    const w = document.getElementById('oidcForm');
    if (!w) return;
    const c = Auth.getOIDC();
    w.innerHTML = `
      <div class="form-field" style="margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;text-transform:none;letter-spacing:0;font-weight:500">
          <input type="checkbox" id="oidcEnabled" ${c.enabled?'checked':''} onchange="Settings.saveOIDC()" />
          Enable Single Sign-On (OpenID Connect / Active Directory)
        </label>
      </div>
      <div id="oidcFields" style="display:${c.enabled?'grid':'none'};grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-field" style="grid-column:1/-1">
          <label>Authority / Issuer URL</label>
          <input type="text" id="oidcAuthority" value="${esc(c.authority||'')}"
            placeholder="https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0" oninput="Settings.saveOIDC()" />
        </div>
        <div class="form-field"><label>Client ID</label>
          <input type="text" id="oidcClientId" value="${esc(c.clientId||'')}"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" oninput="Settings.saveOIDC()" /></div>
        <div class="form-field"><label>Scopes</label>
          <input type="text" id="oidcScopes" value="${esc(c.scopes||'openid profile email')}" oninput="Settings.saveOIDC()" /></div>
        <div class="form-field" style="grid-column:1/-1">
          <label>Redirect URI <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--c-muted)">(register in your IdP)</span></label>
          <input type="text" value="${esc(location.origin+location.pathname)}" disabled
            style="color:var(--c-muted);background:#f1f5f9;font-family:monospace;font-size:12px" /></div>
      </div>`;
  }

  function saveOIDC(): void {
    const enabled   = (document.getElementById('oidcEnabled')  as HTMLInputElement|null)?.checked||false;
    const authority = (document.getElementById('oidcAuthority') as HTMLInputElement|null)?.value.trim()||'';
    const clientId  = (document.getElementById('oidcClientId')  as HTMLInputElement|null)?.value.trim()||'';
    const scopes    = (document.getElementById('oidcScopes')    as HTMLInputElement|null)?.value.trim()||'openid profile email';
    const f = document.getElementById('oidcFields');
    if (f) f.style.display = enabled ? 'grid' : 'none';
    Auth.saveOIDC({ enabled, authority, clientId, scopes });
    App.toast('SSO settings saved.','ok');
  }

  // ── Misc / Night Mode ───────────────────────────────────────────────────
  function renderMisc(): void {
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

  function applyTheme(theme: string): void {
    document.documentElement.classList.toggle('night-mode', theme === 'dark');
    localStorage.setItem('timmy_theme', theme);
    renderMisc();
    App.toast(`${theme==='dark'?'Night':'Light'} mode enabled.`,'ok');
  }

  // ── Audit Log ───────────────────────────────────────────────────────────
  async function renderAudit(): Promise<void> {
    const w = document.getElementById('auditLog');
    if (!w || !Auth.isAdmin()) return;
    w.innerHTML = '<p style="color:var(--c-muted);font-size:12px">Loading…</p>';
    try {
      const res     = await fetch('/api/audit');
      const entries = await res.json() as AuditEntry[];
      if (!entries.length) { w.innerHTML = '<p style="color:var(--c-muted);font-size:12px">No events recorded yet.</p>'; return; }
      w.innerHTML = `<table class="data-table" style="font-size:12px">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${entries.slice(0,200).map(e => `<tr>
          <td style="white-space:nowrap">${new Date(e.ts).toLocaleString()}</td>
          <td>${esc(e.user)}</td>
          <td><code>${esc(e.action)}</code></td>
          <td style="color:var(--c-muted)">${e.details && Object.keys(e.details).length ? esc(JSON.stringify(e.details)) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch { w.innerHTML = '<p style="color:var(--c-danger);font-size:12px">Failed to load audit log.</p>'; }
  }

  return {
    render,
    showAddUser: showAddUser as () => void,
    confirmAddUser: confirmAddUser as () => void,
    deleteUser: deleteUser as (u: string) => void,
    showChangePassword,
    confirmChangePassword: confirmChangePassword as (u: string) => void,
    saveOIDC, applyTheme,
  };
})();
