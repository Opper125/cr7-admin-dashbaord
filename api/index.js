/* ============================================================
   CR7 GAME STORE v2.0 - UNIFIED API
   Web-based auth (email+password), no Telegram
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// ENV VARS (never hardcoded)
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const G2BULK_API_URL = process.env.G2BULK_API_URL || 'https://api.g2bulk.com/v1';
const G2BULK_SMM_URL = process.env.G2BULK_SMM_API_URL || 'https://api.g2bulk.com/api/v2';
const G2BULK_API_KEY = process.env.G2BULK_API_KEY;
const APP_URL = process.env.APP_URL || '';
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
const ADMIN_IPADDRESS = process.env.ADMIN_IPADDRESS;
const ADMIN_DOMAIN = process.env.ADMIN_DOMAIN || 'cr7-panel-dashboard.vercel.app';
const USER_DOMAIN = process.env.USER_DOMAIN || 'cr7game.shop';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const MLBB_CHECK_URL = process.env.MLBB_CHECK_URL || 'https://www.gameshopbot.online/mlbb_checkrole-main/api/games/mlbb_checkrole';
const REGION_CHECK_URL = 'https://www.gameshopbot.online/Region_Check/sever.php';

// ============================================================
// SUPABASE CLIENT
// ============================================================
let supabase = null;
function getSupabase() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return supabase;
}

// ============================================================
// MAIN ROUTER
// ============================================================
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Session-Token,X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const hostname = req.headers.host || '';
  let endpoint = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '') || req.query.endpoint || '';
  endpoint = endpoint.replace(/^\//, '');

  // ── Page serving (HTML routing via vercel.json catch-all) ──
  if (endpoint === '__page__') {
    return handlePageRouting(req, res, hostname);
  }

  // ── Security: block admin paths on user domain ──
  if (!isAdminDomain(hostname) && (endpoint.startsWith('admin') || endpoint === 'admin.html')) {
    return res.status(302).setHeader('Location', '/').end();
  }

  try {
    const db = getSupabase();
    switch (endpoint) {
      case 'auth':          return await handleAuth(req, res, db);
      case 'admin-auth':    return await handleAdminAuth(req, res, db, hostname);
      case 'users':         return await handleUsers(req, res, db);
      case 'orders':        return await handleOrders(req, res, db);
      case 'deposits':      return await handleDeposits(req, res, db);
      case 'settings':      return await handleSettings(req, res, db);
      case 'news':          return await handleNews(req, res, db);
      case 'banners':       return await handleBanners(req, res, db);
      case 'payments':      return await handlePayments(req, res, db);
      case 'custom':        return await handleCustom(req, res, db);
      case 'feedback':      return await handleFeedback(req, res, db);
      case 'leaderboard':   return await handleLeaderboard(req, res, db);
      case 'location':      return await handleLocation(req, res, db);
      case 'g2bulk':        return await handleG2Bulk(req, res, db);
      case 'region-check':  return await handleRegionCheck(req, res);
      case 'mlbb-check':
      case 'mlbb_checkrole':return await handleMlbbCheck(req, res);
      case 'upload':        return await handleUpload(req, res, db);
      case 'vpn-check':     return await handleVpnCheck(req, res);
      case 'ip':            return handleGetIp(req, res);
      default:              return res.status(404).json({ error: `Unknown endpoint: ${endpoint}` });
    }
  } catch (err) {
    console.error(`[CR7 API Error][${endpoint}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};

// ============================================================
// HELPER: Domain Detection
// ============================================================
function isAdminDomain(hostname) {
  return hostname.includes('cr7-panel-dashboard') || hostname.includes('admin.');
}

function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

// ============================================================
// PAGE ROUTING HANDLER
// ============================================================
async function handlePageRouting(req, res, hostname) {
  const fs = require('fs');
  const path = require('path');
  const reqPath = req.query.path || '/';

  if (isAdminDomain(hostname)) {
    // Check IP restriction
    if (ADMIN_IPADDRESS) {
      const clientIp = getClientIp(req);
      if (clientIp !== ADMIN_IPADDRESS) {
        const notFoundPath = path.join(process.cwd(), '404.html');
        if (fs.existsSync(notFoundPath)) {
          res.setHeader('Content-Type', 'text/html');
          return res.status(404).send(fs.readFileSync(notFoundPath, 'utf8'));
        }
        return res.status(404).send('<h1>404 Not Found</h1>');
      }
    }
    // Serve admin page
    const adminPath = path.join(process.cwd(), 'admin.html');
    if (fs.existsSync(adminPath)) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(fs.readFileSync(adminPath, 'utf8'));
    }
    return res.status(404).json({ error: 'Admin page not found' });
  }

  // User domain: block /admin paths
  if (reqPath.startsWith('/admin') || reqPath.includes('admin.html')) {
    return res.status(302).setHeader('Location', '/').end();
  }

  // Serve user page
  const indexPath = path.join(process.cwd(), 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(fs.readFileSync(indexPath, 'utf8'));
  }
  return res.status(404).json({ error: 'Index page not found' });
}

// ============================================================
// HELPER: Get User From Session
// ============================================================
async function getUserFromSession(req, db) {
  const token = req.headers['x-session-token'];
  if (!token) return null;
  const { data: session } = await db
    .from('user_sessions')
    .select('*, users(*)')
    .eq('session_token', token)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();
  return session?.users || null;
}

// ============================================================
// HELPER: Verify Admin Token
// ============================================================
async function verifyAdmin(req, db) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  const { data } = await db
    .from('admin_sessions')
    .select('*')
    .eq('session_token', token)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();
  return !!data;
}

// ============================================================
// AUTH HANDLER (Email + Password - no Telegram)
// ============================================================
async function handleAuth(req, res, db) {
  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'verify') {
      const user = await getUserFromSession(req, db);
      if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });
      return res.status(200).json({ success: true, user: sanitizeUser(user) });
    }
    // Check username availability
    if (action === 'check-username') {
      const username = req.query.username;
      if (!username) return res.status(400).json({ error: 'Username required' });
      const clean = username.replace(/^@/, '');
      const { data } = await db.from('users').select('id').eq('username', clean).single();
      return res.status(200).json({ available: !data });
    }
    // Check email availability
    if (action === 'check-email') {
      const email = req.query.email;
      if (!email) return res.status(400).json({ error: 'Email required' });
      const { data } = await db.from('users').select('id').eq('email', email.toLowerCase()).single();
      return res.status(200).json({ available: !data });
    }
    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    // ── SIGNUP ──
    if (action === 'signup') {
      const { name, username, email, password } = req.body;

      if (!name || !username || !email || !password) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
      }

      const cleanUsername = username.replace(/^@/, '');

      // Server-side username validation
      const usernameError = validateUsername(cleanUsername);
      if (usernameError) return res.status(400).json({ success: false, error: usernameError });

      // Server-side password validation
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ success: false, error: passwordError });

      // Email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      // Check username duplicate
      const { data: existingUser } = await db.from('users').select('id').eq('username', cleanUsername).single();
      if (existingUser) return res.status(409).json({ success: false, error: 'Username already taken', field: 'username' });

      // Check email duplicate
      const { data: existingEmail } = await db.from('users').select('id').eq('email', email.toLowerCase()).single();
      if (existingEmail) return res.status(409).json({ success: false, error: 'Email already registered', field: 'email' });

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const { data: newUser, error: createErr } = await db.from('users').insert({
        name: name.trim(),
        username: cleanUsername,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        balance_mmk: 0,
        balance_usd: 0,
        is_banned: false,
        balance_locked: false,
        created_at: new Date().toISOString()
      }).select().single();

      if (createErr) {
        console.error('Create user error:', createErr);
        return res.status(500).json({ success: false, error: 'Failed to create account' });
      }

      // Create session
      const sessionToken = crypto.randomBytes(64).toString('hex');
      await db.from('user_sessions').insert({
        user_id: newUser.id,
        session_token: sessionToken,
        is_active: true,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      });

      return res.status(200).json({
        success: true,
        session_token: sessionToken,
        user: sanitizeUser(newUser)
      });
    }

    // ── LOGIN ──
    if (action === 'login') {
      const { identifier, password } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ success: false, error: 'Identifier and password required' });
      }

      const cleanId = identifier.replace(/^@/, '').toLowerCase().trim();
      // Find by email or username
      const { data: user } = await db.from('users')
        .select('*')
        .or(`email.eq.${cleanId},username.eq.${cleanId}`)
        .single();

      if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      if (user.is_banned) {
        return res.status(403).json({ success: false, error: 'Account has been suspended. Contact support.' });
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      // Invalidate old sessions
      await db.from('user_sessions').update({ is_active: false }).eq('user_id', user.id);

      // Create new session
      const sessionToken = crypto.randomBytes(64).toString('hex');
      await db.from('user_sessions').insert({
        user_id: user.id,
        session_token: sessionToken,
        is_active: true,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      });

      return res.status(200).json({
        success: true,
        session_token: sessionToken,
        user: sanitizeUser(user)
      });
    }

    // ── LOGOUT ──
    if (action === 'logout') {
      const token = req.headers['x-session-token'];
      if (token) await db.from('user_sessions').update({ is_active: false }).eq('session_token', token);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// ADMIN AUTH HANDLER
// ============================================================
async function handleAdminAuth(req, res, db, hostname) {
  if (req.method === 'POST') {
    const { action } = req.body;

    if (action === 'login') {
      const { password } = req.body;
      if (!ADMIN_LOGIN_PASSWORD) {
        return res.status(500).json({ success: false, error: 'Admin password not configured' });
      }
      if (!password || password !== ADMIN_LOGIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Invalid admin password' });
      }

      const clientIp = getClientIp(req);
      const sessionToken = crypto.randomBytes(64).toString('hex');

      await db.from('admin_sessions').insert({
        session_token: sessionToken,
        ip_address: clientIp,
        is_active: true,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
      });

      return res.status(200).json({
        success: true,
        session_token: sessionToken,
        admin_ip: clientIp
      });
    }

    if (action === 'logout') {
      const token = req.headers['x-admin-token'];
      if (token) await db.from('admin_sessions').update({ is_active: false }).eq('session_token', token);
      return res.status(200).json({ success: true });
    }
  }

  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'verify') {
      const isAdmin = await verifyAdmin(req, db);
      const clientIp = getClientIp(req);
      return res.status(200).json({ success: isAdmin, admin_ip: clientIp });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// GET CLIENT IP
// ============================================================
function handleGetIp(req, res) {
  const ip = getClientIp(req);
  return res.status(200).json({ ip, success: true });
}

// ============================================================
// VPN CHECK
// ============================================================
async function handleVpnCheck(req, res) {
  const ip = req.query.ip || getClientIp(req);

  try {
    // Use ipapi.co to check for VPN/proxy/hosting
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'CR7GameStore/2.0' },
      timeout: 8000
    });
    const data = await r.json();

    const isVpn = !!(
      data.vpn ||
      data.proxy ||
      data.hosting ||
      data.tor ||
      data.relay
    );

    return res.status(200).json({
      success: true,
      ip,
      is_vpn: isVpn,
      country: data.country_name,
      city: data.city,
      region: data.region,
      org: data.org,
      latitude: data.latitude,
      longitude: data.longitude
    });
  } catch (err) {
    // Fallback: try ipinfo.io
    try {
      const r2 = await fetch(`https://ipinfo.io/${ip}/json`, { timeout: 6000 });
      const d2 = await r2.json();
      const org = (d2.org || '').toLowerCase();
      const isVpnFallback = /vpn|proxy|hosting|cloud|datacenter|digitalocean|aws|azure|google|linode|vultr|hetzner|ovh|cloudflare/i.test(org);
      return res.status(200).json({
        success: true,
        ip,
        is_vpn: isVpnFallback,
        country: d2.country,
        city: d2.city,
        region: d2.region,
        org: d2.org,
        latitude: d2.loc ? parseFloat(d2.loc.split(',')[0]) : null,
        longitude: d2.loc ? parseFloat(d2.loc.split(',')[1]) : null
      });
    } catch (err2) {
      return res.status(200).json({ success: false, ip, is_vpn: false, error: err2.message });
    }
  }
}

// ============================================================
// LOCATION HANDLER
// ============================================================
async function handleLocation(req, res, db) {
  if (req.method === 'POST') {
    const action = req.body.action;

    if (action === 'save') {
      const user = await getUserFromSession(req, db);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { latitude, longitude, city, country, region, ip, is_vpn } = req.body;

      if (!latitude || !longitude) return res.status(400).json({ error: 'Location coordinates required' });

      // Block VPN users
      if (is_vpn) {
        return res.status(403).json({ success: false, error: 'vpn_detected', message: 'VPN detected. Please disable VPN to use this service.' });
      }

      // Upsert location
      await db.from('user_locations').upsert({
        user_id: user.id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        city: city || null,
        country: country || null,
        region: region || null,
        ip_address: ip || getClientIp(req),
        is_vpn: !!is_vpn,
        last_seen: new Date().toISOString(),
        is_online: true
      }, { onConflict: 'user_id' });

      return res.status(200).json({ success: true });
    }
  }

  if (req.method === 'GET') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    const action = req.query.action;

    if (action === 'active-users') {
      // Get all users with location in last 30 min
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data } = await db.from('user_locations')
        .select('*, users(id, name, username, email, balance_mmk, balance_usd, is_banned, balance_locked, created_at)')
        .gte('last_seen', since)
        .eq('is_online', true);

      return res.status(200).json({ success: true, locations: data || [] });
    }

    if (action === 'user-detail') {
      const userId = req.query.user_id;
      const { data } = await db.from('user_locations')
        .select('*, users(*)')
        .eq('user_id', userId)
        .single();
      return res.status(200).json({ success: true, location: data });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// USERS HANDLER
// ============================================================
async function handleUsers(req, res, db) {
  if (req.method === 'GET') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    const action = req.query.action;
    if (action === 'list') {
      const { data } = await db.from('users').select('id,name,username,email,balance_mmk,balance_usd,is_banned,balance_locked,balance_locked_reason,created_at,total_spent_mmk,total_spent_usd').order('created_at', { ascending: false });
      return res.status(200).json({ success: true, users: data || [] });
    }
    if (action === 'stats') {
      const { count } = await db.from('users').select('id', { count: 'exact', head: true });
      return res.status(200).json({ success: true, total_users: count || 0 });
    }
  }

  if (req.method === 'POST') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { action, user_id } = req.body;

    if (action === 'ban') {
      await db.from('users').update({ is_banned: true }).eq('id', user_id);
      await db.from('user_sessions').update({ is_active: false }).eq('user_id', user_id);
      return res.status(200).json({ success: true });
    }
    if (action === 'unban') {
      await db.from('users').update({ is_banned: false }).eq('id', user_id);
      return res.status(200).json({ success: true });
    }
    if (action === 'lock_balance') {
      const { reason } = req.body;
      await db.from('users').update({ balance_locked: true, balance_locked_reason: reason || 'Suspicious activity' }).eq('id', user_id);
      // Log the lock
      await db.from('balance_audit_log').insert({
        user_id,
        action: 'balance_locked',
        performed_by: 'admin',
        reason: reason || 'Suspicious activity',
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }
    if (action === 'unlock_balance') {
      await db.from('users').update({ balance_locked: false, balance_locked_reason: null }).eq('id', user_id);
      await db.from('balance_audit_log').insert({
        user_id,
        action: 'balance_unlocked',
        performed_by: 'admin',
        reason: 'Admin unlocked',
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }
    // Admin direct balance adjustment
    if (action === 'add_balance') {
      const { amount, currency, reason } = req.body;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const field = currency === 'USD' ? 'balance_usd' : 'balance_mmk';
      const { data: user } = await db.from('users').select(field).eq('id', user_id).single();
      const current = parseFloat(user?.[field] || 0);
      await db.from('users').update({ [field]: current + amt }).eq('id', user_id);
      await db.from('balance_transactions').insert({
        user_id,
        type: 'admin_credit',
        amount: amt,
        currency: currency || 'MMK',
        balance_after: current + amt,
        description: reason || 'Admin manual credit',
        performed_by: 'admin',
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }
    if (action === 'deduct_balance') {
      const { amount, currency, reason } = req.body;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const field = currency === 'USD' ? 'balance_usd' : 'balance_mmk';
      const { data: user } = await db.from('users').select(field).eq('id', user_id).single();
      const current = parseFloat(user?.[field] || 0);
      const newBalance = Math.max(0, current - amt);
      await db.from('users').update({ [field]: newBalance }).eq('id', user_id);
      await db.from('balance_transactions').insert({
        user_id,
        type: 'admin_debit',
        amount: amt,
        currency: currency || 'MMK',
        balance_after: newBalance,
        description: reason || 'Admin manual debit',
        performed_by: 'admin',
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// DEPOSITS HANDLER
// ============================================================
async function handleDeposits(req, res, db) {
  if (req.method === 'GET') {
    const isAdmin = await verifyAdmin(req, db);
    if (isAdmin) {
      const action = req.query.action || 'list';
      if (action === 'list') {
        const status = req.query.status || 'pending';
        const q = db.from('deposits').select('*, users(name,username,email)');
        if (status !== 'all') q.eq('status', status);
        const { data } = await q.order('created_at', { ascending: false }).limit(200);
        return res.status(200).json({ success: true, deposits: data || [] });
      }
      if (action === 'stats') {
        const { count } = await db.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        return res.status(200).json({ success: true, pending_count: count || 0 });
      }
    } else {
      const user = await getUserFromSession(req, db);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const { data } = await db.from('deposits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
      return res.status(200).json({ success: true, deposits: data || [] });
    }
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    // User deposit request
    if (action === 'request') {
      const user = await getUserFromSession(req, db);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { amount, currency, payment_method_id, receipt_url, notes } = req.body;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

      const { data: deposit } = await db.from('deposits').insert({
        user_id: user.id,
        amount: amt,
        currency: currency || 'MMK',
        payment_method_id: payment_method_id || null,
        receipt_url: receipt_url || null,
        notes: notes || null,
        status: 'pending',
        created_at: new Date().toISOString()
      }).select().single();

      return res.status(200).json({ success: true, deposit });
    }

    // Admin approve/reject
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    if (action === 'approve') {
      const { deposit_id, notes } = req.body;
      const { data: deposit } = await db.from('deposits').select('*, users(*)').eq('id', deposit_id).single();
      if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
      if (deposit.status !== 'pending') return res.status(400).json({ error: 'Deposit already processed' });

      const user = deposit.users;
      const field = deposit.currency === 'USD' ? 'balance_usd' : 'balance_mmk';
      const current = parseFloat(user[field] || 0);
      const newBalance = current + parseFloat(deposit.amount);

      await db.from('users').update({ [field]: newBalance }).eq('id', user.id);
      await db.from('deposits').update({ status: 'approved', admin_notes: notes || null, processed_at: new Date().toISOString() }).eq('id', deposit_id);
      await db.from('balance_transactions').insert({
        user_id: user.id,
        type: 'deposit',
        amount: deposit.amount,
        currency: deposit.currency,
        balance_after: newBalance,
        description: `Deposit approved`,
        reference_id: deposit_id,
        reference_type: 'deposit',
        performed_by: 'admin',
        created_at: new Date().toISOString()
      });

      return res.status(200).json({ success: true });
    }

    if (action === 'reject') {
      const { deposit_id, reason } = req.body;
      await db.from('deposits').update({ status: 'rejected', admin_notes: reason || null, processed_at: new Date().toISOString() }).eq('id', deposit_id);
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// ORDERS HANDLER
// ============================================================
async function handleOrders(req, res, db) {
  if (req.method === 'GET') {
    const isAdmin = await verifyAdmin(req, db);
    if (isAdmin) {
      const { data } = await db.from('orders').select('*, users(name,username,email)').order('created_at', { ascending: false }).limit(500);
      return res.status(200).json({ success: true, orders: data || [] });
    }
    const user = await getUserFromSession(req, db);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const action = req.query.action;
    if (action === 'stats') {
      const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
      return res.status(200).json({ success: true, total_orders: count || 0 });
    }
    const { data } = await db.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
    return res.status(200).json({ success: true, orders: data || [] });
  }

  if (req.method === 'POST') {
    const user = await getUserFromSession(req, db);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Check balance lock
    if (user.balance_locked) return res.status(403).json({ error: 'Your account balance is locked. Please contact support.' });

    const { action } = req.body;
    if (action === 'game_topup') return await processGameTopup(user, req, res, db);
    if (action === 'product_purchase') return await processProductPurchase(user, req, res, db);
    if (action === 'custom_purchase') return await processCustomPurchase(user, req, res, db);
    if (action === 'game_account_purchase') return await processGameAccountPurchase(user, req, res, db);
    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// BALANCE DEDUCTION (via DB function for security)
// ============================================================
async function deductBalance(db, userId, amount, currency, description, refType) {
  const field = currency === 'USD' ? 'balance_usd' : 'balance_mmk';
  const { data: user } = await db.from('users').select(`id,${field},balance_locked`).eq('id', userId).single();
  if (!user) throw new Error('User not found');
  if (user.balance_locked) throw new Error('Balance is locked');
  const current = parseFloat(user[field] || 0);
  if (current < amount) throw new Error('Insufficient balance');
  const newBalance = current - amount;
  const { error } = await db.from('users').update({ [field]: newBalance }).eq('id', userId);
  if (error) throw new Error('Failed to deduct balance');
  await db.from('balance_transactions').insert({
    user_id: userId, type: 'debit', amount, currency,
    balance_after: newBalance, description,
    reference_type: refType, performed_by: 'system',
    created_at: new Date().toISOString()
  });
  return newBalance;
}

async function addBalance(db, userId, amount, currency, description, txType) {
  const field = currency === 'USD' ? 'balance_usd' : 'balance_mmk';
  const { data: user } = await db.from('users').select(`id,${field}`).eq('id', userId).single();
  if (!user) throw new Error('User not found');
  const current = parseFloat(user[field] || 0);
  const newBalance = current + amount;
  await db.from('users').update({ [field]: newBalance }).eq('id', userId);
  await db.from('balance_transactions').insert({
    user_id: userId, type: txType || 'credit', amount, currency,
    balance_after: newBalance, description,
    performed_by: 'system', created_at: new Date().toISOString()
  });
  return newBalance;
}

// ============================================================
// PROCESS GAME TOPUP
// ============================================================
async function processGameTopup(user, req, res, db) {
  const { game_code, catalogue_name, player_id, player_name, server_id, api_price_usd, display_price, currency, game_name, remark } = req.body;
  if (!game_code || !catalogue_name || !player_id) return res.status(400).json({ error: 'Missing required fields' });
  const priceAmount = parseFloat(display_price);
  if (!priceAmount || priceAmount <= 0) return res.status(400).json({ error: 'Invalid price' });

  try {
    await deductBalance(db, user.id, priceAmount, currency, `Game Topup: ${game_name} - ${catalogue_name}`, 'order');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data: order } = await db.from('orders').insert({
    user_id: user.id, order_type: 'g2bulk_topup',
    product_name: catalogue_name, category_name: game_name, game_code,
    player_id, player_name: player_name || '', server_id: server_id || '',
    price_amount: priceAmount, price_currency: currency,
    api_price_usd: parseFloat(api_price_usd || 0),
    status: 'pending', callback_url: `${APP_URL}/api/webhook`
  }).select().single();

  try {
    const g2body = { catalogue_name, player_id, callback_url: `${APP_URL}/api/webhook` };
    if (server_id) g2body.server_id = server_id;
    if (remark) g2body.remark = remark;

    const idempotencyKey = uuidv4();
    const g2r = await fetch(`${G2BULK_API_URL}/games/${game_code}/order`, {
      method: 'POST',
      headers: { 'X-API-Key': G2BULK_API_KEY, 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(g2body)
    });
    const g2data = await g2r.json();

    if (g2data.success && g2data.order) {
      await db.from('orders').update({ g2bulk_order_id: String(g2data.order.order_id), status: g2data.order.status?.toLowerCase() || 'pending' }).eq('id', order.id);
      order.status = g2data.order.status?.toLowerCase() || 'pending';
    } else {
      await addBalance(db, user.id, priceAmount, currency, `Refund: ${g2data.message || 'Failed'}`, 'refund');
      await db.from('orders').update({ status: 'failed', is_refunded: true }).eq('id', order.id);
      order.status = 'failed';
    }
  } catch (apiErr) {
    await addBalance(db, user.id, priceAmount, currency, 'Refund: API error', 'refund');
    await db.from('orders').update({ status: 'failed', is_refunded: true }).eq('id', order.id);
    order.status = 'failed';
  }

  return res.status(200).json({ success: true, order });
}

// ============================================================
// PROCESS PRODUCT PURCHASE
// ============================================================
async function processProductPurchase(user, req, res, db) {
  const { product_id, display_price, currency } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product ID required' });
  const priceAmount = parseFloat(display_price);
  if (!priceAmount || priceAmount <= 0) return res.status(400).json({ error: 'Invalid price' });

  const { data: product } = await db.from('custom_products').select('*').eq('id', product_id).single();
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock <= 0) return res.status(400).json({ error: 'Out of stock' });

  try {
    await deductBalance(db, user.id, priceAmount, currency, `Product: ${product.name}`, 'order');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  await db.from('custom_products').update({ stock: product.stock - 1 }).eq('id', product_id);
  const { data: order } = await db.from('orders').insert({
    user_id: user.id, order_type: 'product',
    product_name: product.name, price_amount: priceAmount,
    price_currency: currency, status: 'completed'
  }).select().single();

  return res.status(200).json({ success: true, order });
}

// ============================================================
// PROCESS CUSTOM/GAME ACCOUNT PURCHASE
// ============================================================
async function processCustomPurchase(user, req, res, db) {
  const { product_id, display_price, currency, custom_inputs } = req.body;
  const priceAmount = parseFloat(display_price);
  if (!priceAmount || priceAmount <= 0) return res.status(400).json({ error: 'Invalid price' });
  try {
    await deductBalance(db, user.id, priceAmount, currency, `Custom purchase`, 'order');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const { data: order } = await db.from('orders').insert({
    user_id: user.id, order_type: 'custom',
    price_amount: priceAmount, price_currency: currency, status: 'completed',
    custom_inputs: custom_inputs || null
  }).select().single();
  return res.status(200).json({ success: true, order });
}

async function processGameAccountPurchase(user, req, res, db) {
  const { account_id, display_price, currency } = req.body;
  const priceAmount = parseFloat(display_price);
  if (!priceAmount) return res.status(400).json({ error: 'Invalid price' });
  const { data: account } = await db.from('game_accounts').select('*').eq('id', account_id).single();
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    await deductBalance(db, user.id, priceAmount, currency, `Game Account: ${account.game_name}`, 'order');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  await db.from('game_accounts').update({ is_sold: true, sold_to_user_id: user.id }).eq('id', account_id);
  const { data: order } = await db.from('orders').insert({
    user_id: user.id, order_type: 'game_account',
    product_name: account.game_name, price_amount: priceAmount,
    price_currency: currency, status: 'completed'
  }).select().single();
  return res.status(200).json({ success: true, order, account });
}

// ============================================================
// G2BULK HANDLER
// ============================================================
async function handleG2Bulk(req, res, db) {
  if (!G2BULK_API_KEY) return res.status(500).json({ error: 'G2Bulk API key not configured' });

  const action = req.query.action || req.body?.action;

  if (action === 'games') {
    const data = await g2bulkGet('/games');
    return res.status(200).json(data);
  }
  if (action === 'game-detail') {
    const code = req.query.code;
    const data = await g2bulkGet(`/games/${code}`);
    return res.status(200).json(data);
  }
  if (action === 'catalogues') {
    const code = req.query.code;
    const data = await g2bulkGet(`/games/${code}/catalogues`);
    return res.status(200).json(data);
  }
  if (action === 'servers') {
    const { game_code } = req.body;
    const { status, data } = await g2bulkPostWithStatus(`/games/${game_code}/servers`, {});
    if (status === 403) return res.status(200).json({ success: true, servers: [] });
    return res.status(200).json(data);
  }
  if (action === 'balance') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const data = await g2bulkGet('/balance');
    return res.status(200).json(data);
  }
  if (action === 'search') {
    const query = req.query.q || '';
    const data = await g2bulkGet('/games');
    const games = Array.isArray(data?.data) ? data.data : [];
    const filtered = games.filter(g => {
      const name = (g.name || g.title || '').toLowerCase();
      return name.startsWith(query.toLowerCase());
    });
    return res.status(200).json({ success: true, games: filtered });
  }
  return res.status(400).json({ error: 'Invalid action' });
}

async function g2bulkGet(endpoint) {
  const r = await fetch(`${G2BULK_API_URL}${endpoint}`, { headers: { 'X-API-Key': G2BULK_API_KEY } });
  return await r.json();
}
async function g2bulkPostWithStatus(endpoint, body) {
  const r = await fetch(`${G2BULK_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': G2BULK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, data: await r.json() };
}

// ============================================================
// SETTINGS HANDLER
// ============================================================
async function handleSettings(req, res, db) {
  if (req.method === 'GET') {
    const { data } = await db.from('settings').select('*').single();
    return res.status(200).json({ success: true, settings: data || {} });
  }
  if (req.method === 'POST') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { data: existing } = await db.from('settings').select('id').single();
    if (existing) {
      await db.from('settings').update(req.body).eq('id', existing.id);
    } else {
      await db.from('settings').insert(req.body);
    }
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// NEWS HANDLER
// ============================================================
async function handleNews(req, res, db) {
  if (req.method === 'GET') {
    const { data } = await db.from('news').select('*').eq('is_active', true).order('created_at', { ascending: false });
    return res.status(200).json({ success: true, news: data || [] });
  }
  if (req.method === 'POST') {
    const { action } = req.body;
    if (action === 'claim') {
      const user = await getUserFromSession(req, db);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const { news_id } = req.body;
      const { data: existing } = await db.from('news_claims').select('id').eq('news_id', news_id).eq('user_id', user.id).single();
      if (existing) return res.status(400).json({ error: 'Already claimed' });
      const { data: news } = await db.from('news').select('*').eq('id', news_id).single();
      if (!news?.has_claim) return res.status(400).json({ error: 'No claim available' });
      await db.from('news_claims').insert({ news_id, user_id: user.id });
      if (news.claim_mmk > 0) await addBalance(db, user.id, news.claim_mmk, 'MMK', `News reward: ${news.title}`, 'bonus');
      if (news.claim_usd > 0) await addBalance(db, user.id, news.claim_usd, 'USD', `News reward: ${news.title}`, 'bonus');
      return res.status(200).json({ success: true });
    }
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    if (action === 'create') {
      const { title, content, media_link, social_links, has_claim, claim_mmk, claim_usd } = req.body;
      const { data } = await db.from('news').insert({ title, content, media_link, social_links: social_links || [], has_claim: !!has_claim, claim_mmk: parseFloat(claim_mmk)||0, claim_usd: parseFloat(claim_usd)||0, is_active: true }).select().single();
      return res.status(200).json({ success: true, news: data });
    }
    if (action === 'delete') {
      await db.from('news').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// BANNERS HANDLER
// ============================================================
async function handleBanners(req, res, db) {
  if (req.method === 'GET') {
    const type = req.query.type || 'home';
    const category_id = req.query.category_id;
    let q = db.from('banners').select('*').eq('type', type).eq('is_active', true).order('sort_order');
    if (category_id) q = q.eq('category_id', category_id);
    const { data } = await q;
    return res.status(200).json({ success: true, banners: data || [] });
  }
  if (req.method === 'POST') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { action } = req.body;
    if (action === 'add') {
      const { type, url, category_id, guide_video, guide_text } = req.body;
      const { data } = await db.from('banners').insert({ type: type||'home', url, category_id: category_id||null, guide_video: guide_video||null, guide_text: guide_text||null, is_active: true, sort_order: 99 }).select().single();
      return res.status(200).json({ success: true, banner: data });
    }
    if (action === 'delete') {
      await db.from('banners').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// PAYMENTS HANDLER
// ============================================================
async function handlePayments(req, res, db) {
  if (req.method === 'GET') {
    const currency = req.query.currency;
    let q = db.from('payment_methods').select('*').eq('is_active', true);
    if (currency) q = q.eq('currency', currency);
    const { data } = await q.order('sort_order');
    return res.status(200).json({ success: true, methods: data || [] });
  }
  if (req.method === 'POST') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { action } = req.body;
    if (action === 'create') {
      const { name, address, note, currency, icon_url, qr_url } = req.body;
      const { data } = await db.from('payment_methods').insert({ name, address, note, currency: currency||'MMK', icon_url: icon_url||null, qr_url: qr_url||null, is_active: true, sort_order: 99 }).select().single();
      return res.status(200).json({ success: true, method: data });
    }
    if (action === 'delete') {
      await db.from('payment_methods').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// FEEDBACK HANDLER
// ============================================================
async function handleFeedback(req, res, db) {
  if (req.method === 'GET') {
    const category_id = req.query.category_id;
    let q = db.from('feedback').select('*, users(name,username)').eq('is_active', true);
    if (category_id) q = q.eq('category_id', category_id);
    const { data } = await q.order('created_at', { ascending: false }).limit(50);
    return res.status(200).json({ success: true, feedback: data || [] });
  }
  if (req.method === 'POST') {
    const user = await getUserFromSession(req, db);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { category_id, rating, message } = req.body;
    const { data } = await db.from('feedback').insert({ user_id: user.id, category_id, rating: parseInt(rating)||5, message: message||'', is_active: true }).select().single();
    return res.status(200).json({ success: true, feedback: data });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// LEADERBOARD HANDLER
// ============================================================
async function handleLeaderboard(req, res, db) {
  const { data } = await db.from('users').select('name,username,total_spent_mmk,total_spent_usd').order('total_spent_mmk', { ascending: false }).limit(20);
  return res.status(200).json({ success: true, leaderboard: data || [] });
}

// ============================================================
// CUSTOM (Pages, Categories, Products, Game Accounts) HANDLER
// ============================================================
async function handleCustom(req, res, db) {
  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'pages') {
      const { data } = await db.from('custom_pages').select('*').order('sort_order');
      return res.status(200).json({ success: true, pages: data || [] });
    }
    if (action === 'categories') {
      const page_id = req.query.page_id;
      let q = db.from('custom_categories').select('*');
      if (page_id) q = q.eq('page_id', page_id);
      const { data } = await q.order('sort_order');
      return res.status(200).json({ success: true, categories: data || [] });
    }
    if (action === 'products') {
      const category_id = req.query.category_id;
      let q = db.from('custom_products').select('*').eq('is_active', true);
      if (category_id) q = q.eq('category_id', category_id);
      const { data } = await q.order('sort_order');
      return res.status(200).json({ success: true, products: data || [] });
    }
    if (action === 'game-accounts') {
      const page_id = req.query.page_id;
      let q = db.from('game_accounts').select('*, game_account_images(*), game_account_contacts(*)').eq('is_active', true).eq('is_sold', false);
      if (page_id) q = q.eq('page_id', page_id);
      const { data } = await q.order('created_at', { ascending: false });
      return res.status(200).json({ success: true, accounts: data || [] });
    }
    if (action === 'inputs') {
      const category_id = req.query.category_id;
      const { data } = await db.from('input_tables').select('*').eq('category_id', category_id).order('sort_order');
      return res.status(200).json({ success: true, inputs: data || [] });
    }
  }

  if (req.method === 'POST') {
    const isAdmin = await verifyAdmin(req, db);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { action } = req.body;

    if (action === 'create_page') {
      const { data } = await db.from('custom_pages').insert({ name: req.body.name, page_type: req.body.page_type||'normal', sort_order: 99 }).select().single();
      return res.status(200).json({ success: true, page: data });
    }
    if (action === 'delete_page') {
      await db.from('custom_pages').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
    if (action === 'create_category') {
      const { data } = await db.from('custom_categories').insert({ page_id: req.body.page_id, name: req.body.name, icon_url: req.body.icon_url||null, sort_order: 99 }).select().single();
      return res.status(200).json({ success: true, category: data });
    }
    if (action === 'delete_category') {
      await db.from('custom_categories').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
    if (action === 'create_product') {
      const { category_id, name, amount, price_mmk, price_usd, delivery_time, stock, icon_url } = req.body;
      const { data } = await db.from('custom_products').insert({ category_id, name, amount:amount||null, price_mmk:parseFloat(price_mmk)||0, price_usd:parseFloat(price_usd)||0, delivery_time:delivery_time||'Instant', stock:parseInt(stock)||0, icon_url:icon_url||null, is_active:true, sort_order:99 }).select().single();
      return res.status(200).json({ success: true, product: data });
    }
    if (action === 'delete_product') {
      await db.from('custom_products').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
    if (action === 'create_game_account') {
      const { page_id, game_name, description, game_version, linked_platforms, price_mmk, price_usd, image_links, contacts } = req.body;
      const { data: acc } = await db.from('game_accounts').insert({ page_id, game_name, description:description||null, game_version:game_version||null, linked_platforms:linked_platforms||[], price_mmk:parseFloat(price_mmk)||0, price_usd:parseFloat(price_usd)||0, is_active:true, is_sold:false }).select().single();
      if (image_links?.length > 0) await db.from('game_account_images').insert(image_links.map((l,i)=>({ game_account_id: acc.id, image_url: l, sort_order: i })));
      if (contacts?.length > 0) await db.from('game_account_contacts').insert(contacts.map((c,i)=>({ game_account_id: acc.id, social_name: c.social_name, contact_value: c.contact_value, sort_order: i })));
      return res.status(200).json({ success: true, account: acc });
    }
    if (action === 'delete_game_account') {
      await db.from('game_accounts').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
    if (action === 'create_input') {
      const { data } = await db.from('input_tables').insert({ category_id: req.body.category_id, name: req.body.name, placeholder: req.body.placeholder||null, sort_order:99 }).select().single();
      return res.status(200).json({ success: true, input: data });
    }
    if (action === 'delete_input') {
      await db.from('input_tables').delete().eq('id', req.body.id);
      return res.status(200).json({ success: true });
    }
    if (action === 'update_settings') {
      const { data } = await db.from('settings').select('id').single();
      const vals = { site_name: req.body.site_name, logo_url: req.body.logo_url, live_text: req.body.live_text, mmk_rate: parseFloat(req.body.mmk_rate)||4500, mmk_profit_percent: parseFloat(req.body.mmk_profit_percent)||0, usd_profit_percent: parseFloat(req.body.usd_profit_percent)||0, min_deposit_mmk: parseFloat(req.body.min_deposit_mmk)||0, max_deposit_mmk: parseFloat(req.body.max_deposit_mmk)||0, min_deposit_usd: parseFloat(req.body.min_deposit_usd)||0, max_deposit_usd: parseFloat(req.body.max_deposit_usd)||0, deposit_note_mmk: req.body.deposit_note_mmk||'', deposit_note_usd: req.body.deposit_note_usd||'' };
      if (data) await db.from('settings').update(vals).eq('id', data.id);
      else await db.from('settings').insert(vals);
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// UPLOAD HANDLER
// ============================================================
async function handleUpload(req, res, db) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromSession(req, db);
  const isAdmin = await verifyAdmin(req, db);
  if (!user && !isAdmin) return res.status(401).json({ error: 'Not authenticated' });

  if (!IMGBB_API_KEY) return res.status(500).json({ error: 'IMGBB_API_KEY not configured' });

  const busboy = require('busboy');
  return new Promise((resolve) => {
    const fields = {}; let fileBuffer = null; let fileName = ''; let fileMimeType = '';
    const bb = busboy({ headers: req.headers, limits: { fileSize: 20*1024*1024 } });
    bb.on('field', (n, v) => { fields[n] = v; });
    bb.on('file', (n, file, info) => {
      fileName = info.filename || 'file'; fileMimeType = info.mimeType || 'application/octet-stream';
      const chunks = []; file.on('data', c => chunks.push(c)); file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });
    bb.on('finish', async () => {
      try {
        if (!fileBuffer) { res.status(400).json({ error: 'No file provided' }); return resolve(); }

        // Upload to IMGBB — base64 encode the buffer
        const base64Image = fileBuffer.toString('base64');
        const imgbbForm = new URLSearchParams();
        imgbbForm.append('key', IMGBB_API_KEY);
        imgbbForm.append('image', base64Image);
        if (fields.name) imgbbForm.append('name', fields.name);
        // Optional expiration in seconds (e.g. fields.expiration = '0' means no expire)
        if (fields.expiration) imgbbForm.append('expiration', fields.expiration);

        const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: imgbbForm.toString()
        });
        const imgbbData = await imgbbRes.json();

        if (!imgbbData.success) {
          res.status(500).json({ error: imgbbData.error?.message || 'IMGBB upload failed' });
          return resolve();
        }

        // Return all useful URLs that IMGBB provides
        const { url, display_url, thumb, delete_url } = imgbbData.data;
        res.status(200).json({
          success: true,
          url: display_url || url,          // direct image URL (stored in Supabase)
          thumb_url: thumb?.url || null,     // thumbnail URL
          delete_url: delete_url || null,    // deletion URL (optionally store for later cleanup)
          full: imgbbData.data               // full IMGBB response if frontend needs it
        });
        resolve();
      } catch (err) {
        res.status(500).json({ error: err.message }); resolve();
      }
    });
    req.pipe(bb);
  });
}

// ============================================================
// REGION CHECK HANDLER
// ============================================================
async function handleRegionCheck(req, res) {
  const { game, user_id, server_id } = req.method === 'POST' ? req.body : req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const params = new URLSearchParams();
    if (game) params.append('game', game);
    params.append('user_id', user_id);
    if (server_id) params.append('server_id', server_id);
    const r = await fetch(`${REGION_CHECK_URL}?${params}`, { headers: { 'User-Agent': 'CR7GameStore/2.0' }, timeout: 10000 });
    const text = await r.text();
    try { return res.status(200).json(JSON.parse(text)); } catch {}
    const result = { success: false, name: null, region: null };
    if (text.includes('Role Found')||text.includes('✅')) result.success = true;
    const nm = text.match(/Name:\s*(.+)/i); if (nm) result.name = nm[1].trim();
    const rm = text.match(/Region:\s*(\w+)/i); if (rm) result.region = rm[1].trim();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}

// ============================================================
// MLBB CHECK HANDLER
// ============================================================
async function handleMlbbCheck(req, res) {
  const id = req.method === 'POST' ? (req.body?.id||req.body?.player_id) : (req.query.id||req.query.player_id);
  const zone = req.method === 'POST' ? (req.body?.zone||req.body?.zone_id) : (req.query.zone||req.query.zone_id);
  if (!id || !zone) return res.status(400).json({ success: false, error: 'id and zone are required' });
  try {
    const r = await fetch(MLBB_CHECK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, zone }), timeout: 10000
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}

// ============================================================
// VALIDATION HELPERS
// ============================================================
function validateUsername(username) {
  const BANNED_WORDS = ['fuck','shit','ass','bitch','cunt','dick','pussy','nigger','faggot','whore','slut','bastard','retard'];
  if (!username) return 'Username is required';
  if (username.length < 8) return 'Username must be at least 8 characters';
  if (username.length > 16) return 'Username must be at most 16 characters';
  if (!/^[A-Z]/.test(username)) return 'Username must start with an uppercase letter';
  if (!/^[A-Za-z0-9]+$/.test(username)) return 'Username can only contain English letters and numbers';
  const lettersOnly = username.replace(/[0-9]/g, '');
  if (lettersOnly.length < 5) return 'Username must contain at least 5 English letters';
  const lc = username.toLowerCase();
  for (const w of BANNED_WORDS) { if (lc.includes(w)) return 'Username contains prohibited words'; }
  return null;
}

function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 18) return 'Password must be at most 18 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[@+$%#&*]/.test(password)) return 'Password must contain at least one special character (@+$%#&*)';
  return null;
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}
