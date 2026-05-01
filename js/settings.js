'use strict';

const Settings = (() => {
  function render() { renderUsers(); renderOIDC(); }

  // ── User Management ───────────────────────────────────────────────────
  function renderUsers() {
    const tbody = document.getElementById('usersTbody');
    if (!tbody) return;
    const me = Auth.currentUser();
    tbody.innerHTML = Auth.listUsers().map(u => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td><span class="chip ${u.role === 'admin' ? 'chip-h' : 'chip-l'}">${esc(u.role)}</span></td>
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

  function showAddUser() {
    App.openModal('Add User', `
      <div class="vuln-form">
        <div class="form-field"><label>Username</label><input type="text" id="nu_user" /></div>
        <div class="form-field"><label>Role</label>
          <select id="nu_role">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div class="form-field full"><label>Password</label><input type="password" id="nu_pass" /></div>
        <div class="form-field full"><label>Confirm Password</label><input type="password" id="nu_pass2" /></div>
        <div id="nu_err" style="grid-column:1/-1;color:var(--c-danger);font-size:12px;min-height:16px"></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="Settings.confirmAddUser()">Add User</button>`);
  }

  async function confirmAddUser() {
    const u  = (document.getElementById('nu_user')?.value || '').trim();
    const p  =  document.getElementById('nu_pass')?.value  || '';
    const p2 =  document.getElementById('nu_pass2')?.value || '';
    const r  =  document.getElementById('nu_role')?.value  || 'user';
    const e  =  document.getElementById('nu_err');
    if (!u)       { e.textContent = 'Username is required.'; return; }
    if (!p)       { e.textContent = 'Password is required.'; return; }
    if (p !== p2) { e.textContent = 'Passwords do not match.'; return; }
    const err = await Auth.addUser(u, p, r);
    if (err) { e.textContent = err; return; }
    App.closeModal(); renderUsers(); App.toast(`User "${u}" added.`, 'ok');
  }

  function deleteUser(username) {
    if (!confirm(`Delete user "${username}"?`)) return;
    const err = Auth.removeUser(username);
    if (err) { App.toast(err, 'error'); return; }
    renderUsers(); App.toast(`User "${username}" removed.`, 'ok');
  }

  function showChangePassword(username) {
    App.openModal(`Change Password – ${esc(username)}`, `
      <div class="vuln-form">
        <div class="form-field full"><label>New Password</label><input type="password" id="cp_pass" /></div>
        <div class="form-field full"><label>Confirm Password</label><input type="password" id="cp_pass2" /></div>
        <div id="cp_err" style="grid-column:1/-1;color:var(--c-danger);font-size:12px;min-height:16px"></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="Settings.confirmChangePassword('${esc(username)}')">Save</button>`);
  }

  async function confirmChangePassword(username) {
    const p  =  document.getElementById('cp_pass')?.value  || '';
    const p2 =  document.getElementById('cp_pass2')?.value || '';
    const e  =  document.getElementById('cp_err');
    if (!p)       { e.textContent = 'Password is required.'; return; }
    if (p !== p2) { e.textContent = 'Passwords do not match.'; return; }
    const err = await Auth.changePassword(username, p);
    if (err) { e.textContent = err; return; }
    App.closeModal(); App.toast('Password updated.', 'ok');
  }

  // ── OIDC / SSO ────────────────────────────────────────────────────────
  function renderOIDC() {
    const w = document.getElementById('oidcForm');
    if (!w) return;
    const c = Auth.getOIDC();
    w.innerHTML = `
      <div class="form-field" style="margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                      font-size:14px;text-transform:none;letter-spacing:0;font-weight:500">
          <input type="checkbox" id="oidcEnabled" ${c.enabled ? 'checked' : ''}
            onchange="Settings.saveOIDC()" />
          Enable Single Sign-On (OpenID Connect / Active Directory)
        </label>
      </div>
      <div id="oidcFields"
           style="display:${c.enabled ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-field" style="grid-column:1/-1">
          <label>Authority / Issuer URL</label>
          <input type="text" id="oidcAuthority" value="${esc(c.authority || '')}"
            placeholder="https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0"
            oninput="Settings.saveOIDC()" />
        </div>
        <div class="form-field">
          <label>Client ID</label>
          <input type="text" id="oidcClientId" value="${esc(c.clientId || '')}"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" oninput="Settings.saveOIDC()" />
        </div>
        <div class="form-field">
          <label>Scopes</label>
          <input type="text" id="oidcScopes" value="${esc(c.scopes || 'openid profile email')}"
            oninput="Settings.saveOIDC()" />
        </div>
        <div class="form-field" style="grid-column:1/-1">
          <label>Redirect URI
            <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--c-muted)">
              (register this URI in your IdP app registration)
            </span>
          </label>
          <input type="text" value="${esc(location.origin + location.pathname)}" disabled
            style="color:var(--c-muted);background:#f1f5f9;font-family:monospace;font-size:12px" />
        </div>
      </div>`;
  }

  function saveOIDC() {
    const enabled   = document.getElementById('oidcEnabled')?.checked || false;
    const authority = document.getElementById('oidcAuthority')?.value.trim() || '';
    const clientId  = document.getElementById('oidcClientId')?.value.trim() || '';
    const scopes    = document.getElementById('oidcScopes')?.value.trim() || 'openid profile email';
    document.getElementById('oidcFields').style.display = enabled ? 'grid' : 'none';
    Auth.saveOIDC({ enabled, authority, clientId, scopes });
    App.toast('SSO settings saved.', 'ok');
  }

  return {
    render,
    showAddUser, confirmAddUser, deleteUser,
    showChangePassword, confirmChangePassword,
    saveOIDC,
  };
})();
