'use strict';
const Auth = (() => {
  const OIDC_KEY = 'timmy_oidc';
  let _user = null;

  function getOIDC()   { try { return JSON.parse(localStorage.getItem(OIDC_KEY) || 'null') || {}; } catch { return {}; } }
  function saveOIDC(c) { localStorage.setItem(OIDC_KEY, JSON.stringify(c)); }

  function showLogin(err = '') {
    const oidc = getOIDC();
    const ssoBtn = oidc.enabled && oidc.authority && oidc.clientId
      ? `<div class="login-divider"><span>or</span></div>
         <button class="btn btn-secondary" style="width:100%" onclick="Auth.startOIDC()">🔑 Sign in with SSO</button>`
      : '';
    const overlay = document.getElementById('loginOverlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="login-box">
        <div class="login-logo">
          <img src="images/timmy.png" alt="Timmy" class="login-logo-img" />
          <div class="login-title">Timmy</div>
          <div class="login-subtitle">Threat &amp; Risk Management</div>
        </div>
        ${err ? `<div class="login-error">${esc(err)}</div>` : ''}
        <div class="form-field"><label>Username</label>
          <input type="text" id="loginUser" autocomplete="username"
            onkeydown="if(event.key==='Enter')document.getElementById('loginPass')?.focus()" /></div>
        <div class="form-field"><label>Password</label>
          <input type="password" id="loginPass" autocomplete="current-password"
            onkeydown="if(event.key==='Enter')Auth.submitLogin()" /></div>
        <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="Auth.submitLogin()">Sign In</button>
        ${ssoBtn}
      </div>`;
    overlay.classList.add('visible');
    const shell = document.getElementById('appShell');
    if (shell) shell.style.display = 'none';
    setTimeout(() => document.getElementById('loginUser')?.focus(), 50);
  }

  function hideLogin() {
    document.getElementById('loginOverlay')?.classList.remove('visible');
    const shell = document.getElementById('appShell');
    if (shell) shell.style.display = 'flex';
    const el = document.getElementById('headerUsername');
    if (el && _user) el.textContent = _user.username;
  }

  async function submitLogin() {
    const username = (document.getElementById('loginUser')?.value || '').trim();
    const password =  document.getElementById('loginPass')?.value || '';
    if (!username) { showLogin('Please enter your username.'); return; }
    try {
      const res  = await fetch('/api/auth/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { showLogin(data.error || 'Login failed.'); return; }
      _user = { username: data.username, role: data.role };
      hideLogin();
    } catch { showLogin('Cannot reach server.'); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method:'POST' }).catch(() => {});
    _user = null; showLogin();
  }

  function currentUser() { return _user; }
  function isAdmin()     { return _user?.role === 'admin'; }

  async function listUsers() {
    const res = await fetch('/api/users');
    return res.ok ? res.json() : [];
  }
  async function addUser(username, password, role = 'user') {
    const res  = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password,role}) });
    const data = await res.json();
    return res.ok ? null : (data.error || 'Unknown error');
  }
  async function removeUser(username) {
    const res  = await fetch(`/api/users/${encodeURIComponent(username)}`, { method:'DELETE' });
    const data = await res.json();
    return res.ok ? null : (data.error || 'Unknown error');
  }
  async function changePassword(username, newPassword) {
    const res  = await fetch(`/api/users/${encodeURIComponent(username)}/password`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:newPassword}) });
    const data = await res.json();
    return res.ok ? null : (data.error || 'Unknown error');
  }

  function rand(n) {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }
  async function pkceChallenge(v) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }

  async function startOIDC() {
    const oidc = getOIDC();
    if (!oidc.authority || !oidc.clientId) { App.toast('SSO not fully configured.','error'); return; }
    try {
      const meta = await (await fetch(oidc.authority.replace(/\/$/, '') + '/.well-known/openid-configuration')).json();
      const verifier = rand(32), state = rand(16), challenge = await pkceChallenge(verifier);
      sessionStorage.setItem('oidc_v', verifier); sessionStorage.setItem('oidc_s', state); sessionStorage.setItem('oidc_te', meta.token_endpoint);
      const params = new URLSearchParams({ response_type:'code', client_id:oidc.clientId,
        redirect_uri:location.origin+location.pathname, scope:oidc.scopes||'openid profile email',
        state, code_challenge:challenge, code_challenge_method:'S256' });
      location.href = meta.authorization_endpoint + '?' + params;
    } catch(e) { App.toast('SSO error: ' + e.message, 'error'); }
  }

  async function handleOIDCCallback() {
    const p=new URLSearchParams(location.search), code=p.get('code'), state=p.get('state');
    const sv=sessionStorage.getItem('oidc_s'), vf=sessionStorage.getItem('oidc_v'), te=sessionStorage.getItem('oidc_te');
    if (!code || state !== sv) return false;
    ['oidc_s','oidc_v','oidc_te'].forEach(k=>sessionStorage.removeItem(k));
    history.replaceState({}, '', location.pathname);
    try {
      const oidc = getOIDC();
      const data = await (await fetch(te, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',client_id:oidc.clientId,code,redirect_uri:location.origin+location.pathname,code_verifier:vf}) })).json();
      if (data.id_token) {
        const pl = JSON.parse(atob(data.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        _user = { username: pl.preferred_username||pl.upn||pl.email||pl.sub||'sso-user', role:'user' };
        return true;
      }
    } catch(e) { console.error('OIDC callback error', e); }
    return false;
  }

  async function init() {
    if (location.search.includes('code=') && sessionStorage.getItem('oidc_s')) {
      if (await handleOIDCCallback()) { hideLogin(); return; }
    }
    try {
      const res  = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok && data.username) { _user = { username:data.username, role:data.role }; hideLogin(); return; }
    } catch { }
    showLogin();
  }

  return { init, submitLogin, logout, currentUser, isAdmin, startOIDC,
           listUsers, addUser, removeUser, changePassword, getOIDC, saveOIDC };
})();
