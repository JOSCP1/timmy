'use strict';

const express = require('express');
const path    = require('path');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'timmy-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// ── Data helpers ───────────────────────────────────────────────────────────
function readUsers() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8')); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(path.join(DATA, 'users.json'), JSON.stringify(users, null, 2));
}
function appendAudit(entry) {
  fs.appendFileSync(path.join(DATA, 'audit.jsonl'), JSON.stringify(entry) + '\n');
}
function readAudit() {
  try {
    return fs.readFileSync(path.join(DATA, 'audit.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map(JSON.parse).reverse();
  } catch { return []; }
}

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
function requireAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
}

// ── Auth routes ────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = readUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Invalid username or password' });
  req.session.user = { username: user.username, role: user.role };
  appendAudit({ ts: new Date().toISOString(), user: user.username, action: 'login', ip: req.ip });
  res.json({ username: user.username, role: user.role });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const username = req.session.user?.username;
  req.session.destroy(() => {
    appendAudit({ ts: new Date().toISOString(), user: username, action: 'logout', ip: req.ip });
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session.user) return res.json(req.session.user);
  res.status(401).json({ error: 'Not authenticated' });
});

// ── User management ────────────────────────────────────────────────────────
app.get('/api/users', requireAdmin, (_req, res) => {
  res.json(readUsers().map(({ username, role, created }) => ({ username, role, created })));
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const users = readUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: 'User already exists' });
  users.push({ username, passwordHash: await bcrypt.hash(password, 10), role, created: new Date().toISOString() });
  writeUsers(users);
  appendAudit({ ts: new Date().toISOString(), user: req.session.user.username, action: 'create_user', details: { target: username }, ip: req.ip });
  res.json({ ok: true });
});

app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const target = req.params.username;
  if (target === req.session.user.username) return res.status(400).json({ error: 'Cannot delete yourself' });
  const users = readUsers();
  if (!users.find(u => u.username === target)) return res.status(404).json({ error: 'User not found' });
  writeUsers(users.filter(u => u.username !== target));
  appendAudit({ ts: new Date().toISOString(), user: req.session.user.username, action: 'delete_user', details: { target }, ip: req.ip });
  res.json({ ok: true });
});

app.put('/api/users/:username/password', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Missing password' });
  const users = readUsers();
  const user  = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(password, 10);
  writeUsers(users);
  res.json({ ok: true });
});

// ── Audit log ──────────────────────────────────────────────────────────────
app.post('/api/audit', requireAuth, (req, res) => {
  const { action, details } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  appendAudit({ ts: new Date().toISOString(), user: req.session.user.username, action, details: details || {}, ip: req.ip });
  res.json({ ok: true });
});

app.get('/api/audit', requireAdmin, (_req, res) => res.json(readAudit()));

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Startup ────────────────────────────────────────────────────────────────
async function start() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA);
  if (!readUsers().length) {
    writeUsers([{ username: 'admin', passwordHash: await bcrypt.hash('admin', 10), role: 'admin', created: new Date().toISOString() }]);
    console.log('Default admin user created (admin / admin) — change password after first login.');
  }
  app.listen(PORT, () => console.log(`Timmy running at http://localhost:${PORT}`));
}
start();
