/* ============================================================
   CR7 GAME STORE v2.0 - UTILITIES
   No hardcoded secrets - all via ENV
   ============================================================ */

// ============================================================
// API BASE
// ============================================================
const API_BASE = '/api';

// ============================================================
// API HELPERS
// ============================================================
async function apiCall(endpoint, options = {}) {
  const sessionToken = getSessionToken();
  const adminToken = getAdminToken();
  const headers = {
    ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    let data = null;
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${response.status}` }; }
    }
    if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') throw new Error('Network error. Please check your connection.');
    throw err;
  }
}
async function apiGet(endpoint) { return apiCall(endpoint, { method: 'GET' }); }
async function apiPost(endpoint, body) { return apiCall(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(endpoint, body) { return apiCall(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDelete(endpoint) { return apiCall(endpoint, { method: 'DELETE' }); }
async function apiUpload(endpoint, formData) {
  const sessionToken = getSessionToken();
  const adminToken = getAdminToken();
  const headers = {};
  if (sessionToken) headers['X-Session-Token'] = sessionToken;
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', headers, body: formData });
  if (!response.ok) { const d = await response.json(); throw new Error(d.error || `HTTP ${response.status}`); }
  return await response.json();
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
function getSessionToken() { try { return localStorage.getItem('cr7_session_token'); } catch { return null; } }
function setSessionToken(t) { try { localStorage.setItem('cr7_session_token', t); } catch {} }
function removeSessionToken() { try { localStorage.removeItem('cr7_session_token'); } catch {} }
function getUserData() { try { const d = localStorage.getItem('cr7_user_data'); return d ? JSON.parse(d) : null; } catch { return null; } }
function setUserData(d) { try { localStorage.setItem('cr7_user_data', JSON.stringify(d)); } catch {} }
function removeUserData() { try { localStorage.removeItem('cr7_user_data'); } catch {} }
function isLoggedIn() { return !!getSessionToken() && !!getUserData(); }
function getPreferredCurrency() { try { return localStorage.getItem('cr7_currency') || 'MMK'; } catch { return 'MMK'; } }
function setPreferredCurrency(c) { try { localStorage.setItem('cr7_currency', c); } catch {} }
function getAdminToken() { try { return localStorage.getItem('cr7_admin_token'); } catch { return null; } }
function setAdminToken(t) { try { localStorage.setItem('cr7_admin_token', t); } catch {} }
function removeAdminToken() { try { localStorage.removeItem('cr7_admin_token'); } catch {} }

// ============================================================
// LOADING
// ============================================================
function showLoading(msg) {
  const el = document.getElementById('loadingScreen');
  const txt = document.querySelector('#loadingScreen .loading-text');
  if (el) el.classList.add('active');
  if (txt && msg) txt.textContent = msg;
}
function hideLoading() {
  const el = document.getElementById('loadingScreen');
  if (el) el.classList.remove('active');
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; container.className = 'toast-container'; document.body.appendChild(container); }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400); }, duration);
}

// ============================================================
// MODAL
// ============================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('active');
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('active');
  if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open');
}
function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.body.classList.remove('modal-open');
}
function initModalCloseButtons() {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', () => {
      const m = o.closest('.modal');
      if (m) { m.classList.remove('active'); if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open'); }
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.closest('.modal');
      if (m) { m.classList.remove('active'); if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open'); }
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const m = document.querySelector('.modal.active'); if (m) { m.classList.remove('active'); if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open'); } }
  });
}

// ============================================================
// FORMATTING
// ============================================================
function formatMMK(amount) { return (parseFloat(amount) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function formatUSD(amount) { return (parseFloat(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); }
function formatCurrency(amount, currency) { return currency === 'MMK' ? `${formatMMK(amount)} MMK` : `$${formatUSD(amount)}`; }
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr); const now = new Date(); const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatPrice(usdPrice, settings, currency) {
  if (!settings) return '0';
  const rate = parseFloat(settings.mmk_rate) || 4500;
  const mmkProfit = parseFloat(settings.mmk_profit_percent) || 0;
  const usdProfit = parseFloat(settings.usd_profit_percent) || 0;
  if (currency === 'MMK') return Math.ceil(parseFloat(usdPrice) * rate * (1 + mmkProfit / 100));
  return Math.round(parseFloat(usdPrice) * (1 + usdProfit / 100) * 10000) / 10000;
}

// ============================================================
// SECURITY
// ============================================================
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  const d = document.createElement('div'); d.textContent = String(str); return d.innerHTML;
}
function sanitizeInput(str) {
  if (!str) return ''; return String(str).replace(/[<>"'&]/g, '').trim();
}

// ============================================================
// USERNAME VALIDATION (CLIENT SIDE - mirrors server)
// ============================================================
const BANNED_WORDS = ['fuck','shit','ass','bitch','cunt','dick','pussy','nigger','faggot','whore','slut','bastard','retard'];

function validateUsernameClient(username) {
  if (!username) return 'Username is required';
  if (username.length < 8) return 'At least 8 characters required';
  if (username.length > 16) return 'Maximum 16 characters allowed';
  if (!/^[A-Z]/.test(username)) return 'Must start with uppercase letter';
  if (!/^[A-Za-z0-9]+$/.test(username)) return 'English letters and numbers only';
  const letters = username.replace(/[0-9]/g, '');
  if (letters.length < 5) return 'At least 5 English letters required';
  const lc = username.toLowerCase();
  for (const w of BANNED_WORDS) { if (lc.includes(w)) return 'Contains prohibited words'; }
  return null;
}

function validatePasswordClient(password) {
  if (!password) return 'Password required';
  if (password.length < 8) return 'At least 8 characters';
  if (password.length > 18) return 'Maximum 18 characters';
  if (!/[A-Z]/.test(password)) return 'Must include uppercase letter';
  if (!/[@+$%#&*]/.test(password)) return 'Must include special char (@+$%#&*)';
  return null;
}

// ============================================================
// CLIPBOARD
// ============================================================
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    showToast('Copied!', 'success', 2000);
  } catch { showToast('Copy failed', 'error', 2000); }
}

// ============================================================
// SLEEP
// ============================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// DEBOUNCE
// ============================================================
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
