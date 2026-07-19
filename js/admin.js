/* ============================================================
   CR7 GAME STORE v2.0 - ADMIN PANEL
   Password-based auth, IP restriction
   ============================================================ */

let ADMIN_MAP = null;
let ADMIN_MARKERS = {};

const ADMIN = {
  isAuthorized: false,
  adminIp: null,
  currentSection: 'overview',

  async init() {
    // Check if already logged in
    const token = getAdminToken();
    if (token) {
      const res = await this.verifyToken(token);
      if (res.success) {
        this.isAuthorized = true;
        this.adminIp = res.admin_ip;
        this.showDashboard();
        return;
      } else {
        removeAdminToken();
      }
    }
    this.showLoginForm();
  },

  async verifyToken(token) {
    try {
      const res = await fetch('/api/admin-auth?action=verify', {
        headers: { 'X-Admin-Token': token }
      });
      return await res.json();
    } catch { return { success: false }; }
  },

  showLoginForm() {
    const gate = document.getElementById('adminAuthGate');
    const loginForm = document.getElementById('adminLoginForm');
    const dashboard = document.getElementById('adminDashboard');
    if (gate) gate.style.display = 'none';
    if (loginForm) loginForm.style.display = 'flex';
    if (dashboard) dashboard.style.display = 'none';
    hideLoading();
  },

  async login(password) {
    if (!password) { adminToast('Enter password', 'error'); return; }
    showLoading('Verifying...');
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password })
      });
      const data = await res.json();
      if (data.success) {
        setAdminToken(data.session_token);
        this.adminIp = data.admin_ip;
        this.isAuthorized = true;
        hideLoading();
        this.showDashboard();
      } else {
        hideLoading();
        adminToast(data.error || 'Invalid password', 'error');
      }
    } catch (e) {
      hideLoading();
      adminToast('Login failed: ' + e.message, 'error');
    }
  },

  async logout() {
    try { await apiPost('/admin-auth', { action: 'logout' }).catch(()=>{}); } catch {}
    removeAdminToken();
    this.isAuthorized = false;
    location.reload();
  },

  showDashboard() {
    const gate = document.getElementById('adminAuthGate');
    const loginForm = document.getElementById('adminLoginForm');
    const dashboard = document.getElementById('adminDashboard');
    if (gate) gate.style.display = 'none';
    if (loginForm) loginForm.style.display = 'none';
    if (dashboard) dashboard.style.display = 'flex';

    // Show admin IP
    const ipEl = document.getElementById('adminIpDisplay');
    if (ipEl && this.adminIp) ipEl.textContent = `IP: ${this.adminIp}`;

    this.loadSection('overview');
    this.bindNavigation();
    this.loadPendingDepositsBadge();
    setInterval(() => this.loadPendingDepositsBadge(), 30000);
  },

  bindNavigation() {
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const section = btn.dataset.section;
        this.currentSection = section;
        this.loadSection(section);
      });
    });

    const menuToggle = document.getElementById('adminMenuToggle');
    const sidebar = document.getElementById('adminSidebar');
    if (menuToggle && sidebar) {
      menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }

    document.getElementById('adminLogoutBtn')?.addEventListener('click', () => this.logout());
  },

  loadSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.toggle('active', s.dataset.section === section));
    switch(section) {
      case 'overview':    this.loadOverview(); break;
      case 'g2bulk':      this.loadG2Bulk(); break;
      case 'deposits':    this.loadDeposits(); break;
      case 'users':       this.loadUsers(); break;
      case 'orders':      this.loadOrders(); break;
      case 'banners':     this.loadBanners(); break;
      case 'payments':    this.loadPayments(); break;
      case 'news':        this.loadNews(); break;
      case 'location':    this.loadLocationMap(); break;
      case 'settings':    this.loadSettings(); break;
      case 'pages':       this.loadPages(); break;
      case 'categories':  this.loadCategories(); break;
      case 'products':    this.loadProducts(); break;
      case 'game-accounts': this.loadGameAccounts(); break;
    }
  },

  async loadPendingDepositsBadge() {
    try {
      const res = await apiGet('/deposits?action=stats');
      const badge = document.getElementById('pendingDepositsBadge');
      if (badge) {
        const count = res.pending_count || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    } catch {}
  },

  // ── OVERVIEW ──
  async loadOverview() {
    try {
      const [usersRes, ordersRes, depositsRes, g2bulkRes] = await Promise.allSettled([
        apiGet('/users?action=stats'),
        apiGet('/orders'),
        apiGet('/deposits?action=stats'),
        apiGet('/g2bulk?action=balance')
      ]);

      const totalUsers = usersRes.value?.total_users || 0;
      const orders = ordersRes.value?.orders || [];
      const pendingDeposits = depositsRes.value?.pending_count || 0;
      const apiBalance = g2bulkRes.value?.balance || g2bulkRes.value?.data?.balance || 0;

      setEl('statTotalUsers', totalUsers);
      setEl('statTotalOrders', orders.length);
      setEl('statPendingDeposits', pendingDeposits);
      setEl('statApiBalance', '$' + formatUSD(apiBalance));

      // Warnings: detect suspicious balance issues
      const activityList = document.getElementById('activityList');
      if (activityList) {
        const recentOrders = orders.slice(0, 5);
        activityList.innerHTML = recentOrders.length ? recentOrders.map(o => `
          <div class="activity-item">
            <span class="act-type">${escapeHtml(o.order_type||'')}</span>
            <span class="act-desc">${escapeHtml(o.product_name||'')} · ${escapeHtml(o.price_amount)} ${escapeHtml(o.price_currency||'MMK')}</span>
            <span class="act-status status-${escapeHtml(o.status||'')}">${escapeHtml(o.status||'')}</span>
            <span class="act-time">${formatDate(o.created_at)}</span>
          </div>
        `).join('') : '<p style="color:#666;padding:12px">No recent activity</p>';
      }
    } catch (e) { adminToast('Overview load failed: ' + e.message, 'error'); }
  },

  // ── DEPOSITS ──
  async loadDeposits(status = 'pending') {
    const listEl = document.getElementById('depositsAdminList');
    if (!listEl) return;
    listEl.innerHTML = adminLoader();
    try {
      const res = await apiGet(`/deposits?action=list&status=${status}`);
      const deposits = res.deposits || [];
      if (!deposits.length) { listEl.innerHTML = emptyState('No deposits'); return; }
      listEl.innerHTML = deposits.map(d => `
        <div class="admin-card deposit-card" data-status="${escapeHtml(d.status||'')}">
          <div class="admin-card-header">
            <span class="dep-id">#${(d.id||'').slice(-8).toUpperCase()}</span>
            <span class="dep-status status-${escapeHtml(d.status||'')}">${escapeHtml(d.status||'pending')}</span>
          </div>
          <div class="admin-card-body">
            <div class="dep-user">
              <strong>@${escapeHtml(d.users?.username||'')}</strong>
              <span>${escapeHtml(d.users?.email||'')}</span>
            </div>
            <div class="dep-amount"><strong>${formatMMK(d.amount)} ${escapeHtml(d.currency||'MMK')}</strong></div>
          </div>
          ${d.receipt_url ? `<div class="dep-receipt"><a href="${escapeHtml(d.receipt_url)}" target="_blank" rel="noopener">View Receipt</a></div>` : ''}
          <div class="dep-date">${formatDateTime(d.created_at)}</div>
          ${d.status === 'pending' ? `
            <div class="dep-actions">
              <button class="admin-btn success" onclick="ADMIN.approveDeposit('${escapeHtml(d.id)}')">
                <img src="/images/icons/check.png" onerror="this.style.display='none'" style="width:12px;" alt="">
                Approve
              </button>
              <button class="admin-btn danger" onclick="ADMIN.rejectDeposit('${escapeHtml(d.id)}')">
                <img src="/images/icons/close.png" onerror="this.style.display='none'" style="width:12px;" alt="">
                Reject
              </button>
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (e) { listEl.innerHTML = emptyState('Failed to load: ' + e.message); }
  },

  async approveDeposit(depositId) {
    if (!confirm('Approve this deposit?')) return;
    showLoading('Approving...');
    try {
      await apiPost('/deposits', { action: 'approve', deposit_id: depositId });
      adminToast('Deposit approved!', 'success');
      this.loadDeposits();
      this.loadPendingDepositsBadge();
    } catch (e) {
      adminToast('Failed: ' + e.message, 'error');
    } finally { hideLoading(); }
  },

  async rejectDeposit(depositId) {
    const reason = prompt('Rejection reason (optional):');
    showLoading('Rejecting...');
    try {
      await apiPost('/deposits', { action: 'reject', deposit_id: depositId, reason: reason || '' });
      adminToast('Deposit rejected', 'info');
      this.loadDeposits();
      this.loadPendingDepositsBadge();
    } catch (e) {
      adminToast('Failed: ' + e.message, 'error');
    } finally { hideLoading(); }
  },

  // ── USERS ──
  async loadUsers() {
    const listEl = document.getElementById('usersAdminList');
    if (!listEl) return;
    listEl.innerHTML = adminLoader();
    try {
      const res = await apiGet('/users?action=list');
      const users = res.users || [];
      if (!users.length) { listEl.innerHTML = emptyState('No users'); return; }
      listEl.innerHTML = `
        <div class="admin-search-row">
          <input type="text" id="userSearchInput" placeholder="Search users..." class="admin-search-input">
        </div>
        <div id="usersTable">
        ${users.map(u => `
          <div class="admin-card user-card ${u.is_banned ? 'banned' : ''} ${u.balance_locked ? 'locked' : ''}">
            <div class="user-header">
              <div>
                <strong class="user-name">${escapeHtml(u.name||'')}</strong>
                <span class="user-username">@${escapeHtml(u.username||'')}</span>
                <span class="user-email">${escapeHtml(u.email||'')}</span>
              </div>
              <div class="user-badges">
                ${u.is_banned ? '<span class="badge-banned">BANNED</span>' : ''}
                ${u.balance_locked ? '<span class="badge-locked">LOCKED</span>' : ''}
              </div>
            </div>
            <div class="user-balance-row">
              <span>MMK: <strong>${formatMMK(u.balance_mmk)}</strong></span>
              <span>USD: <strong>$${formatUSD(u.balance_usd)}</strong></span>
            </div>
            ${u.balance_locked ? `<div class="lock-reason">Lock reason: ${escapeHtml(u.balance_locked_reason||'')}</div>` : ''}
            <div class="user-actions">
              <button class="admin-btn sm" onclick="ADMIN.showAddBalanceModal('${escapeHtml(u.id)}', '${escapeHtml(u.username)}')">+ Balance</button>
              <button class="admin-btn sm danger-outline" onclick="ADMIN.showDeductBalanceModal('${escapeHtml(u.id)}', '${escapeHtml(u.username)}')">- Balance</button>
              ${u.is_banned
                ? `<button class="admin-btn sm success-outline" onclick="ADMIN.unbanUser('${escapeHtml(u.id)}')">Unban</button>`
                : `<button class="admin-btn sm danger-outline" onclick="ADMIN.banUser('${escapeHtml(u.id)}')">Ban</button>`}
              ${u.balance_locked
                ? `<button class="admin-btn sm success-outline" onclick="ADMIN.unlockBalance('${escapeHtml(u.id)}')">Unlock Balance</button>`
                : `<button class="admin-btn sm warning-outline" onclick="ADMIN.lockBalance('${escapeHtml(u.id)}')">Lock Balance</button>`}
            </div>
          </div>
        `).join('')}
        </div>
      `;
      // User search
      document.getElementById('userSearchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.user-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(q) ? '' : 'none';
        });
      });
    } catch (e) { listEl.innerHTML = emptyState('Failed: ' + e.message); }
  },

  async banUser(userId) {
    if (!confirm('Ban this user?')) return;
    try { await apiPost('/users', { action: 'ban', user_id: userId }); adminToast('User banned', 'success'); this.loadUsers(); } catch (e) { adminToast(e.message, 'error'); }
  },
  async unbanUser(userId) {
    try { await apiPost('/users', { action: 'unban', user_id: userId }); adminToast('User unbanned', 'success'); this.loadUsers(); } catch (e) { adminToast(e.message, 'error'); }
  },
  async lockBalance(userId) {
    const reason = prompt('Lock reason:') || 'Admin locked';
    try { await apiPost('/users', { action: 'lock_balance', user_id: userId, reason }); adminToast('Balance locked', 'success'); this.loadUsers(); } catch (e) { adminToast(e.message, 'error'); }
  },
  async unlockBalance(userId) {
    if (!confirm('Unlock balance?')) return;
    try { await apiPost('/users', { action: 'unlock_balance', user_id: userId }); adminToast('Balance unlocked', 'success'); this.loadUsers(); } catch (e) { adminToast(e.message, 'error'); }
  },

  showAddBalanceModal(userId, username) {
    const amount = parseFloat(prompt(`Add balance to @${username}\nEnter amount:`));
    if (!amount || amount <= 0) return;
    const currency = confirm('MMK? (Cancel for USD)') ? 'MMK' : 'USD';
    const reason = prompt('Reason:') || 'Admin credit';
    this.adjustBalance(userId, amount, currency, reason, 'add');
  },
  showDeductBalanceModal(userId, username) {
    const amount = parseFloat(prompt(`Deduct balance from @${username}\nEnter amount:`));
    if (!amount || amount <= 0) return;
    const currency = confirm('MMK? (Cancel for USD)') ? 'MMK' : 'USD';
    const reason = prompt('Reason:') || 'Admin debit';
    this.adjustBalance(userId, amount, currency, reason, 'deduct');
  },
  async adjustBalance(userId, amount, currency, reason, type) {
    showLoading('Updating balance...');
    try {
      await apiPost('/users', { action: type === 'add' ? 'add_balance' : 'deduct_balance', user_id: userId, amount, currency, reason });
      hideLoading();
      adminToast('Balance updated!', 'success');
      this.loadUsers();
    } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
  },

  // ── ORDERS ──
  async loadOrders() {
    const listEl = document.getElementById('ordersAdminList');
    if (!listEl) return;
    listEl.innerHTML = adminLoader();
    try {
      const res = await apiGet('/orders');
      const orders = res.orders || [];
      if (!orders.length) { listEl.innerHTML = emptyState('No orders'); return; }
      listEl.innerHTML = orders.slice(0, 100).map(o => `
        <div class="admin-card order-admin-card">
          <div class="order-admin-header">
            <span>#${(o.id||'').slice(-8).toUpperCase()}</span>
            <span class="status-${escapeHtml(o.status||'')}">${escapeHtml(o.status||'')}</span>
            <span>${formatDate(o.created_at)}</span>
          </div>
          <div class="order-admin-body">
            <span>@${escapeHtml(o.users?.username||'')}</span>
            <span>${escapeHtml(o.product_name||'')} | ${escapeHtml(o.order_type||'')}</span>
            <span><strong>${formatMMK(o.price_amount)} ${escapeHtml(o.price_currency||'MMK')}</strong></span>
          </div>
        </div>
      `).join('');
    } catch (e) { listEl.innerHTML = emptyState('Failed: ' + e.message); }
  },

  // ── G2BULK ──
  async loadG2Bulk() {
    try {
      const [balRes, settingsRes] = await Promise.allSettled([
        apiGet('/g2bulk?action=balance'),
        apiGet('/settings')
      ]);
      const balance = balRes.value?.data?.balance || balRes.value?.balance || '0';
      setEl('g2bulkBalance', '$' + formatUSD(balance));
      setEl('g2bulkStatus', 'Online');
      const s = settingsRes.value?.settings || {};
      setVal('mmkRateInput', s.mmk_rate||4500);
      setVal('mmkProfitInput', s.mmk_profit_percent||5);
      setVal('usdProfitInput', s.usd_profit_percent||3);
    } catch {}
    document.getElementById('savePriceSettingsBtn')?.addEventListener('click', async () => {
      showLoading('Saving...');
      try {
        await apiPost('/custom', { action: 'update_settings', mmk_rate: getVal('mmkRateInput'), mmk_profit_percent: getVal('mmkProfitInput'), usd_profit_percent: getVal('usdProfitInput') });
        hideLoading(); adminToast('Settings saved!', 'success');
      } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
    });
  },

  // ── BANNERS ──
  async loadBanners() {
    const listEl = document.getElementById('bannersAdminList');
    if (!listEl) return;
    try {
      const res = await apiGet('/banners?type=home');
      const banners = res.banners || [];
      listEl.innerHTML = banners.length ?
        banners.map(b => `
          <div class="banner-admin-item">
            <img src="${escapeHtml(b.url)}" alt="" style="height:60px;object-fit:cover;border-radius:6px;">
            <button class="admin-btn sm danger" onclick="ADMIN.deleteBanner('${escapeHtml(b.id)}')">Delete</button>
          </div>
        `).join('') : emptyState('No banners');

      document.getElementById('addBannerBtn')?.addEventListener('click', async () => {
        const file = document.getElementById('bannerFile')?.files[0];
        if (!file) { adminToast('Select a file first', 'error'); return; }
        showLoading('Uploading...');
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('name', `banner_${Date.now()}`);
          const up = await apiUpload('/upload', fd);
          await apiPost('/banners', { action: 'add', type: 'home', url: up.url });
          hideLoading(); adminToast('Banner added!', 'success'); this.loadBanners();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },

  async deleteBanner(id) {
    if (!confirm('Delete banner?')) return;
    try { await apiPost('/banners', { action: 'delete', id }); adminToast('Deleted', 'success'); this.loadBanners(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── PAYMENTS ──
  async loadPayments() {
    const listEl = document.getElementById('paymentsAdminList');
    if (!listEl) return;
    try {
      const res = await apiGet('/payments');
      const methods = res.methods || [];
      listEl.innerHTML = methods.length ?
        methods.map(m => `
          <div class="pay-admin-item">
            <strong>${escapeHtml(m.name)}</strong> | ${escapeHtml(m.address)} | ${escapeHtml(m.currency)}
            <button class="admin-btn sm danger" onclick="ADMIN.deletePayment('${escapeHtml(m.id)}')">Delete</button>
          </div>
        `).join('') : emptyState('No payment methods');

      document.getElementById('createPaymentBtn')?.addEventListener('click', async () => {
        const name = getVal('payName'), address = getVal('payAddress'), note = getVal('payNote');
        const currency = document.querySelector('.ptype-tab.active')?.dataset.ptype || 'MMK';
        if (!name || !address) { adminToast('Fill required fields', 'error'); return; }
        showLoading('Creating...');
        try {
          await apiPost('/payments', { action: 'create', name, address, note, currency });
          hideLoading(); adminToast('Payment method created!', 'success'); this.loadPayments();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },

  async deletePayment(id) {
    if (!confirm('Delete payment method?')) return;
    try { await apiPost('/payments', { action: 'delete', id }); adminToast('Deleted', 'success'); this.loadPayments(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── NEWS ──
  async loadNews() {
    const listEl = document.getElementById('newsListAdmin');
    if (!listEl) return;
    try {
      const res = await apiGet('/news');
      const news = res.news || [];
      listEl.innerHTML = news.length ?
        news.map(n => `
          <div class="news-admin-item">
            <strong>${escapeHtml(n.title)}</strong>
            <button class="admin-btn sm danger" onclick="ADMIN.deleteNews('${escapeHtml(n.id)}')">Delete</button>
          </div>
        `).join('') : emptyState('No news');

      document.getElementById('createNewsBtn')?.addEventListener('click', async () => {
        const title = getVal('newsTitle'), content = getVal('newsContent');
        if (!title) { adminToast('Enter title', 'error'); return; }
        const hasClaim = document.getElementById('newsHasClaim')?.checked;
        showLoading('Creating...');
        try {
          await apiPost('/news', { action: 'create', title, content, has_claim: hasClaim, claim_mmk: hasClaim ? getVal('newsClaimMMK') : 0, claim_usd: hasClaim ? getVal('newsClaimUSD') : 0 });
          hideLoading(); adminToast('News created!', 'success'); this.loadNews();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });

      document.getElementById('newsHasClaim')?.addEventListener('change', (e) => {
        const cs = document.getElementById('claimSettings');
        if (cs) cs.style.display = e.target.checked ? 'block' : 'none';
      });
    } catch {}
  },

  async deleteNews(id) {
    if (!confirm('Delete news?')) return;
    try { await apiPost('/news', { action: 'delete', id }); adminToast('Deleted', 'success'); this.loadNews(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── SETTINGS ──
  async loadSettings() {
    try {
      const res = await apiGet('/settings');
      const s = res.settings || {};
      setVal('settingsSiteName', s.site_name || 'CR7 Game Store');
      setVal('settingsLiveText', s.live_text || '');
      setVal('settingsMinMMK', s.min_deposit_mmk || 0);
      setVal('settingsMaxMMK', s.max_deposit_mmk || 0);
      setVal('settingsMinUSD', s.min_deposit_usd || 0);
      setVal('settingsMaxUSD', s.max_deposit_usd || 0);
      setVal('settingsNoteMMK', s.deposit_note_mmk || '');
      setVal('settingsNoteUSD', s.deposit_note_usd || '');

      document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
        showLoading('Saving...');
        try {
          await apiPost('/custom', { action: 'update_settings', site_name: getVal('settingsSiteName'), live_text: getVal('settingsLiveText'), min_deposit_mmk: getVal('settingsMinMMK'), max_deposit_mmk: getVal('settingsMaxMMK'), min_deposit_usd: getVal('settingsMinUSD'), max_deposit_usd: getVal('settingsMaxUSD'), deposit_note_mmk: getVal('settingsNoteMMK'), deposit_note_usd: getVal('settingsNoteUSD') });
          hideLoading(); adminToast('Settings saved!', 'success');
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },

  // ── PAGES ──
  async loadPages() {
    const listEl = document.getElementById('pagesList');
    if (!listEl) return;
    try {
      const res = await apiGet('/custom?action=pages');
      const pages = res.pages || [];
      listEl.innerHTML = pages.length ?
        pages.map(p => `
          <div class="page-admin-item">
            <strong>${escapeHtml(p.name)}</strong> <em>(${escapeHtml(p.page_type)})</em>
            <button class="admin-btn sm danger" onclick="ADMIN.deletePage('${escapeHtml(p.id)}')">Delete</button>
          </div>
        `).join('') : emptyState('No pages');

      document.getElementById('createPageBtn')?.addEventListener('click', async () => {
        const name = getVal('pageNameInput');
        const type = document.getElementById('pageTypeSelect')?.value || 'normal';
        if (!name) { adminToast('Enter page name', 'error'); return; }
        showLoading('Creating...');
        try {
          await apiPost('/custom', { action: 'create_page', name, page_type: type });
          hideLoading(); adminToast('Page created!', 'success'); this.loadPages();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },
  async deletePage(id) {
    if (!confirm('Delete page and all its content?')) return;
    try { await apiPost('/custom', { action: 'delete_page', id }); adminToast('Deleted', 'success'); this.loadPages(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── CATEGORIES ──
  async loadCategories() {
    const listEl = document.getElementById('categoriesListAdmin');
    if (!listEl) return;
    try {
      const [catsRes, pagesRes] = await Promise.allSettled([
        apiGet('/custom?action=categories'),
        apiGet('/custom?action=pages')
      ]);
      const cats = catsRes.value?.categories || [];
      const pages = pagesRes.value?.pages || [];

      // Populate page select
      const pageSelect = document.getElementById('catPageSelect');
      if (pageSelect) pageSelect.innerHTML = pages.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');

      listEl.innerHTML = cats.length ? cats.map(c => `
        <div class="cat-admin-item">
          ${c.icon_url ? `<img src="${escapeHtml(c.icon_url)}" style="width:32px;height:32px;border-radius:6px;">` : ''}
          <strong>${escapeHtml(c.name)}</strong>
          <button class="admin-btn sm danger" onclick="ADMIN.deleteCategory('${escapeHtml(c.id)}')">Delete</button>
        </div>
      `).join('') : emptyState('No categories');

      document.getElementById('createCategoryBtn')?.addEventListener('click', async () => {
        const page_id = pageSelect?.value, name = getVal('catNameInput');
        if (!page_id || !name) { adminToast('Fill required fields', 'error'); return; }
        const iconFile = document.getElementById('catIconFile')?.files[0];
        let icon_url = null;
        if (iconFile) {
          const fd = new FormData(); fd.append('file', iconFile); fd.append('name', `cat_icon_${Date.now()}`);
          const up = await apiUpload('/upload', fd); icon_url = up.url;
        }
        showLoading('Creating...');
        try {
          await apiPost('/custom', { action: 'create_category', page_id, name, icon_url });
          hideLoading(); adminToast('Category created!', 'success'); this.loadCategories();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },
  async deleteCategory(id) {
    if (!confirm('Delete category?')) return;
    try { await apiPost('/custom', { action: 'delete_category', id }); adminToast('Deleted', 'success'); this.loadCategories(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── PRODUCTS ──
  async loadProducts() {
    const listEl = document.getElementById('productsListAdmin');
    if (!listEl) return;
    try {
      const [prodsRes, catsRes] = await Promise.allSettled([
        apiGet('/custom?action=products'),
        apiGet('/custom?action=categories')
      ]);
      const prods = prodsRes.value?.products || [];
      const cats = catsRes.value?.categories || [];

      const catSelect = document.getElementById('prodCategorySelect');
      if (catSelect) catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');

      listEl.innerHTML = prods.length ? prods.map(p => `
        <div class="prod-admin-item">
          ${p.icon_url ? `<img src="${escapeHtml(p.icon_url)}" style="width:28px;height:28px;border-radius:4px;">` : ''}
          <div><strong>${escapeHtml(p.name)}</strong><br><small>${formatMMK(p.price_mmk)} MMK | $${formatUSD(p.price_usd)}</small></div>
          <button class="admin-btn sm danger" onclick="ADMIN.deleteProduct('${escapeHtml(p.id)}')">Delete</button>
        </div>
      `).join('') : emptyState('No products');

      document.getElementById('createProductBtn')?.addEventListener('click', async () => {
        const category_id = catSelect?.value, name = getVal('prodNameInput');
        if (!category_id || !name) { adminToast('Fill required fields', 'error'); return; }
        showLoading('Creating...');
        try {
          let icon_url = null;
          const f = document.getElementById('prodIconFile')?.files[0];
          if (f) { const fd = new FormData(); fd.append('file', f); fd.append('name', `prod_icon_${Date.now()}`); const up = await apiUpload('/upload', fd); icon_url = up.url; }
          await apiPost('/custom', { action: 'create_product', category_id, name, amount: getVal('prodAmountInput'), price_mmk: getVal('prodPriceMMK'), price_usd: getVal('prodPriceUSD'), delivery_time: getVal('prodDeliveryTime')||'Instant', stock: getVal('prodStock')||0, icon_url });
          hideLoading(); adminToast('Product created!', 'success'); this.loadProducts();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },
  async deleteProduct(id) {
    if (!confirm('Delete product?')) return;
    try { await apiPost('/custom', { action: 'delete_product', id }); adminToast('Deleted', 'success'); this.loadProducts(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── GAME ACCOUNTS ──
  async loadGameAccounts() {
    const listEl = document.getElementById('gameAccountsList');
    if (!listEl) return;
    try {
      const [accsRes, pagesRes] = await Promise.allSettled([
        apiGet('/custom?action=game-accounts'),
        apiGet('/custom?action=pages')
      ]);
      const accs = accsRes.value?.accounts || [];
      const pages = pagesRes.value?.pages || [];

      const pageSelect = document.getElementById('gaPageSelect');
      if (pageSelect) pageSelect.innerHTML = pages.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');

      listEl.innerHTML = accs.length ? accs.map(a => `
        <div class="ga-admin-item ${a.is_sold ? 'sold' : ''}">
          <strong>${escapeHtml(a.game_name)}</strong> ${a.is_sold ? '<span class="badge-sold">SOLD</span>' : ''}
          <div>${formatMMK(a.price_mmk)} MMK | $${formatUSD(a.price_usd)}</div>
          <button class="admin-btn sm danger" onclick="ADMIN.deleteGameAccount('${escapeHtml(a.id)}')">Delete</button>
        </div>
      `).join('') : emptyState('No game accounts');

      document.getElementById('createGameAccountBtn')?.addEventListener('click', async () => {
        const page_id = pageSelect?.value, game_name = getVal('gaGameName');
        if (!page_id || !game_name) { adminToast('Fill required fields', 'error'); return; }
        showLoading('Creating...');
        try {
          const platforms = Array.from(document.querySelectorAll('#gaPlatforms input:checked')).map(c => c.value);
          await apiPost('/custom', { action: 'create_game_account', page_id, game_name, description: getVal('gaDescription'), game_version: getVal('gaVersion'), linked_platforms: platforms, price_mmk: getVal('gaPriceMMK'), price_usd: getVal('gaPriceUSD') });
          hideLoading(); adminToast('Game account created!', 'success'); this.loadGameAccounts();
        } catch (e) { hideLoading(); adminToast(e.message, 'error'); }
      });
    } catch {}
  },
  async deleteGameAccount(id) {
    if (!confirm('Delete game account?')) return;
    try { await apiPost('/custom', { action: 'delete_game_account', id }); adminToast('Deleted', 'success'); this.loadGameAccounts(); } catch (e) { adminToast(e.message, 'error'); }
  },

  // ── LOCATION MAP ──
  async loadLocationMap() {
    const mapEl = document.getElementById('adminMap');
    if (!mapEl) return;

    // Initialize Leaflet map if not done
    if (!ADMIN_MAP) {
      ADMIN_MAP = L.map('adminMap', { center: [20, 95], zoom: 4, zoomControl: true });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        subdomains: 'abcd', maxZoom: 19
      }).addTo(ADMIN_MAP);
    }

    // Load active user locations
    await this.refreshLocationData();
    setInterval(() => this.refreshLocationData(), 30000);
  },

  async refreshLocationData() {
    try {
      const res = await apiGet('/location?action=active-users');
      const locations = res.locations || [];
      const listEl = document.getElementById('locationUserList');

      // Clear old markers
      Object.values(ADMIN_MARKERS).forEach(m => m.remove());
      ADMIN_MARKERS = {};

      // Add markers
      locations.forEach(loc => {
        if (!loc.latitude || !loc.longitude) return;
        const user = loc.users || {};
        const marker = L.circleMarker([loc.latitude, loc.longitude], {
          radius: 8, fillColor: '#e8b84b', color: '#fff',
          weight: 2, opacity: 1, fillOpacity: 0.9
        }).addTo(ADMIN_MAP);

        marker.bindPopup(`
          <div class="map-popup">
            <strong>@${escapeHtml(user.username||'')}</strong><br>
            <small>${escapeHtml(user.email||'')}</small><br>
            <small>${escapeHtml(loc.city||'')}${loc.country ? ', ' + escapeHtml(loc.country) : ''}</small><br>
            <small>IP: ${escapeHtml(loc.ip_address||'')}</small><br>
            <small>Last seen: ${formatDate(loc.last_seen)}</small>
            ${loc.is_vpn ? '<br><span style="color:red">⚠ VPN Detected</span>' : ''}
          </div>
        `);
        ADMIN_MARKERS[loc.user_id] = marker;
      });

      // Update user list
      if (listEl) {
        if (!locations.length) { listEl.innerHTML = emptyState('No active users'); return; }
        listEl.innerHTML = locations.map(loc => {
          const user = loc.users || {};
          return `
            <div class="loc-user-item" onclick="ADMIN.focusUser('${escapeHtml(loc.user_id)}', ${loc.latitude}, ${loc.longitude})">
              <div class="loc-user-info">
                <strong>@${escapeHtml(user.username||'')}</strong>
                <span>${escapeHtml(loc.city||'')}${loc.country ? ', ' + escapeHtml(loc.country) : ''}</span>
              </div>
              <div class="loc-user-meta">
                <span class="loc-ip">IPv4: ${escapeHtml(loc.ip_address||'N/A')}</span>
                ${loc.is_vpn ? '<span class="vpn-warning">⚠ VPN</span>' : ''}
                <span class="loc-time">${formatDate(loc.last_seen)}</span>
              </div>
              <div class="loc-user-balance">
                <span>MMK: ${formatMMK(user.balance_mmk)}</span>
                <span>USD: $${formatUSD(user.balance_usd)}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (e) { console.warn('Location load failed:', e); }
  },

  focusUser(userId, lat, lng) {
    if (ADMIN_MAP && lat && lng) {
      ADMIN_MAP.setView([lat, lng], 12);
      ADMIN_MARKERS[userId]?.openPopup();
    }
  }
};

// ============================================================
// HELPERS
// ============================================================
function adminToast(msg, type = 'info') { showToast(msg, type); }
function adminLoader() { return `<div class="admin-loader"><div class="spinner-ring"></div></div>`; }
function emptyState(msg) { return `<div class="empty-state" style="padding:24px;text-align:center;color:#666;">${escapeHtml(msg)}</div>`; }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function getVal(id) { return document.getElementById(id)?.value || ''; }

window.ADMIN = ADMIN;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  initModalCloseButtons();

  // Login form
  const loginForm = document.getElementById('adminPasswordForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('adminPasswordInput')?.value;
      await ADMIN.login(pw);
    });
  }

  ADMIN.init();
});
