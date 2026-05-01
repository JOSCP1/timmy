'use strict';

const Auth = (() => {
  const SESSION_KEY = 'timmy_session';
  const USERS_KEY   = 'timmy_users';
  const OIDC_KEY    = 'timmy_oidc';
  const SALT        = 'timmy_v1_';

  // ── Crypto ────────────────────────────────────────────────────────────
  async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── User storage ──────────────────────────────────────────────────────
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  async function ensureDefaultAdmin() {
    if (!loadUsers().length) {
      saveUsers([{
        username: 'admin',
        passwordHash: await sha256hex(SALT + 'admin'),
        role: 'admin',
        created: new Date().toISOString()
      }]);
    }
  }

  // ── Session ───────────────────────────────────────────────────────────
  function getSession()   { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
  function setSession(u)  { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: u.username, role: u.role, loginTime: Date.now() })); }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  // ── OIDC config ───────────────────────────────────────────────────────
  function getOIDC()   { try { return JSON.parse(localStorage.getItem(OIDC_KEY)) || {}; } catch { return {}; } }
  function saveOIDC(c) { localStorage.setItem(OIDC_KEY, JSON.stringify(c)); }

  // ── Login UI ──────────────────────────────────────────────────────────
  function showLogin(err = '') {
    const oidc = getOIDC();
    const ssoBtn = oidc.enabled && oidc.authority && oidc.clientId
      ? `<div class="login-divider"><span>or</span></div>
         <button class="btn btn-secondary" style="width:100%" onclick="Auth.startOIDC()">🔑 Sign in with SSO</button>`
      : '';
    document.getElementById('loginOverlay').innerHTML = `
      <div class="login-box">
        <div class="login-logo">
          <img src="images/timmy.png" alt="Timmy" class="login-logo-img" />
          <div class="login-title">Timmy</div>
          <div class="login-subtitle">Threat &amp; Risk Management</div>
        </div>
        ${err ? `<div class="login-error">${esc(err)}</div>` : ''}
        <div class="form-field">
          <label>Username</label>
          <input type="text" id="loginUser" autocomplete="username"
            onkeydown="if(event.key==='Enter')document.getElementById('loginPass').focus()" />
        </div>
        <div class="form-field">
          <label>Password</label>
          <input type="password" id="loginPass" autocomplete="current-password"
            onkeydown="if(event.key==='Enter')Auth.submitLogin()" />
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="Auth.submitLogin()">Sign In</button>
        ${ssoBtn}
      </div>`;
    document.getElementById('loginOverlay').classList.add('visible');
    document.getElementById('appShell').style.display = 'none';
    setTimeout(() => document.getElementById('loginUser')?.focus(), 50);
  }

  function hideLogin() {
    document.getElementById('loginOverlay').classList.remove('visible');
    document.getElementById('appShell').style.display = 'flex';
    const s = getSession();
    const el = document.getElementById('headerUsername');
    if (el && s) el.textContent = s.username;
  }

  // ── Auth actions ──────────────────────────────────────────────────────
  async function submitLogin() {
    const username = (document.getElementById('loginUser')?.value || '').trim();
    const password =  document.getElementById('loginPass')?.value || '';
    if (!username) { showLogin('Please enter your username.'); return; }
    const user = loadUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || await sha256hex(SALT + password) !== user.passwordHash) {
      showLogin('Invalid username or password.');
      return;
    }
    setSession(user);
    hideLogin();
  }

  function logout() { clearSession(); showLogin(); }
  function currentUser() { return getSession(); }
  function isAdmin()     { return getSession()?.role === 'admin'; }

  // ── User management (used by settings.js) ─────────────────────────────
  function listUsers() { return loadUsers(); }

  async function addUser(username, password, role = 'user') {
    if (!username) return 'Username is required.';
    const users = loadUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return 'User already exists.';
    users.push({ username, passwordHash: await sha256hex(SALT + password), role, created: new Date().toISOString() });
    saveUsers(users);
    return null;
  }

  function removeUser(username) {
    if (getSession()?.username.toLowerCase() === username.toLowerCase())
      return 'Cannot delete the currently logged-in user.';
    saveUsers(loadUsers().filter(u => u.username.toLowerCase() !== username.toLowerCase()));
    return null;
  }

  async function changePassword(username, newPassword) {
    const users = loadUsers();
    const user  = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return 'User not found.';
    user.passwordHash = await sha256hex(SALT + newPassword);
    saveUsers(users);
    return null;
  }

  // ── OIDC / PKCE ───────────────────────────────────────────────────────
  function rand(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }

  async function pkceChallenge(verifier) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }

  async function startOIDC() {
    const oidc = getOIDC();
    if (!oidc.authority || !oidc.clientId) { App.toast('SSO not fully configured.', 'error'); return; }
    try {
      const meta = await (await fetch(
        oidc.authority.replace(/\/$/, '') + '/.well-known/openid-configuration'
      )).json();
      const verifier = rand(32), state = rand(16);
      const challenge = await pkceChallenge(verifier);
      sessionStorage.setItem('oidc_v',  verifier);
      sessionStorage.setItem('oidc_s',  state);
      sessionStorage.setItem('oidc_te', meta.token_endpoint);
      const params = new URLSearchParams({
        response_type:         'code',
        client_id:             oidc.clientId,
        redirect_uri:          location.origin + location.pathname,
        scope:                 oidc.scopes || 'openid profile email',
        state,
        code_challenge:        challenge,
        code_challenge_method: 'S256',
      });
      location.href = meta.authorization_endpoint + '?' + params;
    } catch (e) { App.toast('SSO error: ' + e.message, 'error'); }
  }

  async function handleOIDCCallback() {
    const p    = new URLSearchParams(location.search);
    const code = p.get('code'), state = p.get('state');
    const sv   = sessionStorage.getItem('oidc_s');
    const vf   = sessionStorage.getItem('oidc_v');
    const te   = sessionStorage.getItem('oidc_te');
    if (!code || state !== sv) return false;
    ['oidc_s','oidc_v','oidc_te'].forEach(k => sessionStorage.removeItem(k));
    history.replaceState({}, '', location.pathname);
    try {
      const oidc = getOIDC();
      const data = await (await fetch(te, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          client_id:     oidc.clientId,
          code,
          redirect_uri:  location.origin + location.pathname,
          code_verifier: vf,
        }),
      })).json();
      if (data.id_token) {
        const pl = JSON.parse(atob(
          data.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
        ));
        setSession({ username: pl.preferred_username || pl.upn || pl.email || pl.sub, role: 'user' });
        return true;
      }
    } catch (e) { console.error('OIDC callback error', e); }
    return false;
  }

  // ── Init ──────────────────────────────────────────────────────────────
  async function init() {
    await ensureDefaultAdmin();
    if (location.search.includes('code=') && sessionStorage.getItem('oidc_s')) {
      if (await handleOIDCCallback()) { hideLogin(); return; }
    }
    if (getSession()) { hideLogin(); return; }
    showLogin();
  }

  return {
    init, submitLogin, logout, currentUser, isAdmin, startOIDC,
    listUsers, addUser, removeUser, changePassword, getOIDC, saveOIDC,
  };
})();
