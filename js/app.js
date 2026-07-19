/* ============================================================
   CR7 GAME STORE v2.0 - MAIN APP
   ============================================================ */

// ── Global state ──
let APP_SETTINGS = null;
let APP_PAGES = [];
let CURRENT_PAGE = 'home';
let CURRENT_CATEGORY = null;
let SEARCH_DATA = [];

// ============================================================
// APP INIT
// ============================================================
async function initApp() {
  showLoading('Starting CR7 Game Store...');
  initModalCloseButtons();

  // Auth init
  const loggedIn = await AUTH.init();
  if (!loggedIn) return; // AUTH shows auth page

  // Load settings
  try {
    const res = await apiGet('/settings');
    APP_SETTINGS = res.settings || {};
    applySettings(APP_SETTINGS);
  } catch (e) { console.warn('Settings load failed:', e); }

  // Load initial data in parallel
  await Promise.allSettled([loadBanners(), loadLiveText(), loadG2BulkCategories(), loadCustomPages()]);

  hideLoading();
  setupNavigation();
  setupTopBar();
  setupBalanceSwap();
  setupTopupButtons();

  // Periodic refresh
  setInterval(() => AUTH.refreshUser(), 60000);
}

// ============================================================
// SETTINGS
// ============================================================
function applySettings(s) {
  if (!s) return;
  const siteNameEl = document.getElementById('siteName');
  const logoEl = document.getElementById('siteLogo');
  if (siteNameEl) siteNameEl.style.display = 'none'; // use logo only
  if (logoEl) {
    const logoUrl = s.logo_url || '/images/logo.webp';
    logoEl.src = logoUrl;
    logoEl.style.display = 'block';
  }
}

// ============================================================
// BANNERS
// ============================================================
async function loadBanners() {
  try {
    const res = await apiGet('/banners?type=home');
    const banners = res.banners || [];
    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    if (!track || !banners.length) return;

    track.innerHTML = banners.map(b => `
      <div class="banner-slide"><img src="${escapeHtml(b.url)}" alt="Banner" loading="lazy"></div>
    `).join('');

    if (dots) {
      dots.innerHTML = banners.map((_, i) =>
        `<button class="banner-dot ${i===0?'active':''}" data-idx="${i}" type="button"></button>`
      ).join('');
    }

    if (banners.length > 1) startBannerAutoplay(banners.length);
  } catch (e) { console.warn('Banner load failed:', e); }
}

let bannerInterval = null;
function startBannerAutoplay(total) {
  let current = 0;
  clearInterval(bannerInterval);
  bannerInterval = setInterval(() => {
    current = (current + 1) % total;
    moveBanner(current);
  }, 4000);
  document.querySelectorAll('.banner-dot').forEach(btn => {
    btn.addEventListener('click', () => { clearInterval(bannerInterval); moveBanner(parseInt(btn.dataset.idx)); });
  });
}
function moveBanner(idx) {
  const track = document.getElementById('bannerTrack');
  if (track) track.style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('.banner-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

// ============================================================
// LIVE TEXT
// ============================================================
async function loadLiveText() {
  const el = document.getElementById('liveText');
  if (!el) return;
  const text = APP_SETTINGS?.live_text || 'Welcome to CR7 Game Store!';
  el.textContent = text;
}

// ============================================================
// G2BULK CATEGORIES
// ============================================================
async function loadG2BulkCategories() {
  try {
    const res = await apiGet('/g2bulk?action=games');
    const games = Array.isArray(res?.data) ? res.data : [];
    SEARCH_DATA = games; // cache for search

    const grid = document.getElementById('g2bulkCategoriesGrid');
    if (!grid) return;

    if (!games.length) {
      grid.innerHTML = `<div class="empty-state"><p>No games available</p></div>`;
      return;
    }

    grid.innerHTML = games.map(g => `
      <button class="category-card" data-game="${escapeHtml(g.code||g.game_code||g.id)}" type="button">
        <div class="cat-icon">
          <img src="${escapeHtml(g.image||g.icon_url||'/images/icons/game.png')}"
               alt="${escapeHtml(g.name||'')}"
               onerror="this.src='/images/icons/game.png'"
               loading="lazy">
        </div>
        <span class="cat-name">${escapeHtml(g.name||'')}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => openGameCategory(card.dataset.game, card.querySelector('.cat-name')?.textContent));
    });
  } catch (e) { console.warn('G2Bulk load failed:', e); }
}

// ============================================================
// CUSTOM PAGES (TAB NAVIGATION)
// ============================================================
async function loadCustomPages() {
  try {
    const res = await apiGet('/custom?action=pages');
    APP_PAGES = res.pages || [];
    const tabsEl = document.getElementById('categoryTabs');
    const tabContent = document.getElementById('tabContent');
    if (!tabsEl || !tabContent) return;

    APP_PAGES.forEach(page => {
      const tab = document.createElement('button');
      tab.className = 'category-tab';
      tab.dataset.tab = page.id;
      tab.type = 'button';
      tab.innerHTML = `<img src="/images/icons/page.png" onerror="this.style.display='none'" alt=""> ${escapeHtml(page.name)}`;
      tabsEl.appendChild(tab);

      const pane = document.createElement('div');
      pane.className = 'tab-pane';
      pane.id = `pane-${page.id}`;
      pane.dataset.pane = page.id;
      pane.dataset.pageType = page.page_type;
      tabContent.appendChild(pane);

      tab.addEventListener('click', () => switchTab(page.id, page));
    });

    // Tab click for G2Bulk
    document.querySelector('[data-tab="g2bulk"]')?.addEventListener('click', () => switchTab('g2bulk'));
  } catch (e) { console.warn('Pages load failed:', e); }
}

function switchTab(tabId, page) {
  document.querySelectorAll('.category-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tabId || (tabId === 'g2bulk' && p.id === 'g2bulkPane')));

  if (tabId !== 'g2bulk' && page) {
    const pane = document.getElementById(`pane-${tabId}`);
    if (pane && !pane.dataset.loaded) {
      pane.dataset.loaded = '1';
      loadCustomPageContent(pane, page);
    }
  }
}

async function loadCustomPageContent(paneEl, page) {
  paneEl.innerHTML = `<div class="loading-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>`;
  try {
    if (page.page_type === 'game_account') {
      const res = await apiGet(`/custom?action=game-accounts&page_id=${page.id}`);
      const accounts = res.accounts || [];
      paneEl.innerHTML = accounts.length ?
        accounts.map(a => renderGameAccountCard(a)).join('') :
        `<div class="empty-state"><p>No game accounts available</p></div>`;
      paneEl.querySelectorAll('.game-account-card').forEach(c => {
        c.addEventListener('click', () => openGameAccount(c.dataset.id));
      });
    } else {
      const res = await apiGet(`/custom?action=categories&page_id=${page.id}`);
      const cats = res.categories || [];
      paneEl.innerHTML = cats.length ?
        `<div class="categories-grid">${cats.map(c => renderCustomCategoryCard(c)).join('')}</div>` :
        `<div class="empty-state"><p>No categories yet</p></div>`;
      paneEl.querySelectorAll('.category-card').forEach(c => {
        c.addEventListener('click', () => openCustomCategory(c.dataset.id, c.dataset.name));
      });
    }
  } catch (e) {
    paneEl.innerHTML = `<div class="empty-state"><p>Failed to load</p></div>`;
  }
}

function renderGameAccountCard(a) {
  const img = a.game_account_images?.[0]?.image_url || '/images/icons/game.png';
  return `
    <div class="game-account-card" data-id="${escapeHtml(a.id)}">
      <img src="${escapeHtml(img)}" onerror="this.src='/images/icons/game.png'" alt="${escapeHtml(a.game_name)}" loading="lazy">
      <div class="ga-info">
        <h4>${escapeHtml(a.game_name)}</h4>
        <p>${escapeHtml(a.game_version||'')}</p>
        <span class="ga-price">${formatMMK(a.price_mmk)} MMK</span>
      </div>
    </div>`;
}

function renderCustomCategoryCard(c) {
  return `
    <button class="category-card" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}" type="button">
      <div class="cat-icon">
        <img src="${escapeHtml(c.icon_url||'/images/icons/category.png')}" alt="${escapeHtml(c.name)}" onerror="this.src='/images/icons/category.png'" loading="lazy">
      </div>
      <span class="cat-name">${escapeHtml(c.name)}</span>
    </button>`;
}

// ============================================================
// GAME CATEGORY DETAIL (G2BULK)
// ============================================================
async function openGameCategory(gameCode, gameName) {
  CURRENT_CATEGORY = { type: 'g2bulk', code: gameCode, name: gameName };
  showPage('categoryDetail');

  const title = document.getElementById('categoryDetailTitle');
  if (title) title.textContent = gameName || 'Category';

  const productsList = document.getElementById('categoryProductsList');
  const playerSection = document.getElementById('playerIdSection');
  const bannerEl = document.getElementById('categoryBanner');

  if (productsList) productsList.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div><div class="skeleton-item"></div><div class="skeleton-item"></div></div>`;
  if (playerSection) playerSection.style.display = 'none';

  try {
    // Load catalogues and category banner in parallel
    const [catRes, bannerRes] = await Promise.allSettled([
      apiGet(`/g2bulk?action=catalogues&code=${encodeURIComponent(gameCode)}`),
      apiGet(`/banners?type=category&category_id=${encodeURIComponent(gameCode)}`)
    ]);

    // Banner
    const banners = bannerRes.value?.banners || [];
    if (bannerEl && banners[0]) {
      bannerEl.innerHTML = `<img src="${escapeHtml(banners[0].url)}" alt="Banner" loading="lazy">`;
    } else if (bannerEl) bannerEl.innerHTML = '';

    // Catalogues
    const catalogues = catRes.value?.data || catRes.value?.catalogues || [];
    renderCatalogues(catalogues, gameCode, gameName);

    // Load feedback
    loadFeedback(gameCode);

    // Guide
    if (banners[0]?.guide_text) {
      const guideEl = document.getElementById('categoryGuide');
      const guideText = document.getElementById('guideText');
      if (guideEl) guideEl.style.display = 'block';
      if (guideText) guideText.textContent = banners[0].guide_text;
    }
  } catch (e) {
    if (productsList) productsList.innerHTML = `<div class="empty-state"><p>Failed to load products</p></div>`;
  }
}

function renderCatalogues(catalogues, gameCode, gameName) {
  const productsList = document.getElementById('categoryProductsList');
  const playerSection = document.getElementById('playerIdSection');
  if (!productsList) return;

  if (!catalogues.length) {
    productsList.innerHTML = `<div class="empty-state"><p>No products available</p></div>`;
    return;
  }

  // Show player ID section
  if (playerSection) {
    playerSection.style.display = 'block';
    playerSection.innerHTML = `
      <div class="player-id-form">
        <div class="pid-input-row">
          <div class="pid-field">
            <label>Player ID</label>
            <input type="text" id="playerIdInput" placeholder="Enter Player ID" autocomplete="off">
          </div>
          <div class="pid-field" id="serverFieldWrap" style="display:none;">
            <label>Server ID</label>
            <input type="text" id="serverIdInput" placeholder="Server ID">
          </div>
        </div>
        <button class="verify-btn" id="verifyPlayerBtn" type="button">
          <img src="/images/icons/check.png" onerror="this.style.display='none'" style="width:14px;height:14px;" alt="">
          Verify Player
        </button>
        <div class="verify-result" id="verifyResult" style="display:none;"></div>
      </div>
    `;
    loadGameServers(gameCode);
    document.getElementById('verifyPlayerBtn')?.addEventListener('click', () => verifyPlayer(gameCode));
  }

  // Group: numeric (denominations) first, then text-based
  const numeric = catalogues.filter(c => /^\d/.test(c.name||c.catalogue_name||''));
  const text = catalogues.filter(c => !/^\d/.test(c.name||c.catalogue_name||''));
  const sorted = [...numeric.sort((a,b) => parseFloat(a.name||0) - parseFloat(b.name||0)), ...text];

  const cur = getPreferredCurrency();
  productsList.innerHTML = sorted.map(c => {
    const name = c.name || c.catalogue_name || '';
    const price = APP_SETTINGS ? formatPrice(c.price_usd || c.api_price_usd || 0, APP_SETTINGS, cur) : (c.price_usd || '?');
    return `
      <div class="product-item" data-catalogue="${escapeHtml(name)}" data-price-usd="${escapeHtml(String(c.price_usd||0))}" data-game="${escapeHtml(gameCode)}" data-game-name="${escapeHtml(gameName)}">
        <div class="prod-icon">
          <img src="/images/icons/diamond.png" onerror="this.src='/images/icons/game.png'" alt="" loading="lazy">
        </div>
        <div class="prod-info">
          <h4>${escapeHtml(name)}</h4>
          <span class="prod-delivery">
            <img src="/images/icons/flash.png" onerror="this.style.display='none'" style="width:12px;" alt="">
            Instant
          </span>
        </div>
        <div class="prod-price">
          <span class="price-val">${cur === 'MMK' ? formatMMK(price) : formatUSD(price)}</span>
          <span class="price-cur">${cur}</span>
        </div>
        <button class="buy-btn" type="button">
          <img src="/images/icons/cart.png" onerror="this.style.display='none'" style="width:14px;" alt="">
          Buy
        </button>
      </div>
    `;
  }).join('');

  productsList.querySelectorAll('.product-item').forEach(item => {
    item.querySelector('.buy-btn')?.addEventListener('click', () => openOrderModal({
      type: 'g2bulk_topup',
      catalogue_name: item.dataset.catalogue,
      api_price_usd: parseFloat(item.dataset.priceUsd),
      game_code: item.dataset.game,
      game_name: item.dataset.gameName
    }));
  });
}

async function loadGameServers(gameCode) {
  try {
    const res = await apiPost('/g2bulk', { action: 'servers', game_code: gameCode });
    const servers = res.servers || res.data || [];
    if (servers.length > 0) {
      const wrap = document.getElementById('serverFieldWrap');
      if (wrap) wrap.style.display = 'block';
    }
  } catch {}
}

async function verifyPlayer(gameCode) {
  const playerId = document.getElementById('playerIdInput')?.value?.trim();
  const serverId = document.getElementById('serverIdInput')?.value?.trim();
  const resultEl = document.getElementById('verifyResult');
  if (!playerId) { showToast('Enter Player ID first', 'warning'); return; }
  if (!resultEl) return;

  resultEl.style.display = 'block';
  resultEl.innerHTML = `<span class="verify-checking">Verifying...</span>`;

  try {
    const body = { game: gameCode, user_id: playerId };
    if (serverId) body.server_id = serverId;
    const res = await apiPost('/region-check', body);
    if (res.success && res.name) {
      resultEl.innerHTML = `<span class="verify-ok"><img src="/images/icons/check.png" onerror="this.style.display='none'" style="width:14px;" alt=""> ${escapeHtml(res.name)}${res.region ? ` · ${escapeHtml(res.region)}` : ''}</span>`;
    } else {
      resultEl.innerHTML = `<span class="verify-fail">Player not found</span>`;
    }
  } catch {
    resultEl.innerHTML = `<span class="verify-fail">Verification failed</span>`;
  }
}

// ============================================================
// CUSTOM CATEGORY DETAIL
// ============================================================
async function openCustomCategory(categoryId, categoryName) {
  CURRENT_CATEGORY = { type: 'custom', id: categoryId, name: categoryName };
  showPage('categoryDetail');

  const title = document.getElementById('categoryDetailTitle');
  if (title) title.textContent = categoryName || 'Category';

  const productsList = document.getElementById('categoryProductsList');
  const playerSection = document.getElementById('playerIdSection');
  const customInputsSection = document.getElementById('customInputsSection');

  if (playerSection) playerSection.style.display = 'none';
  if (productsList) productsList.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div></div>`;

  try {
    const [prodsRes, inputsRes] = await Promise.allSettled([
      apiGet(`/custom?action=products&category_id=${categoryId}`),
      apiGet(`/custom?action=inputs&category_id=${categoryId}`)
    ]);

    const products = prodsRes.value?.products || [];
    const inputs = inputsRes.value?.inputs || [];

    // Custom inputs section
    if (inputs.length > 0 && customInputsSection) {
      customInputsSection.style.display = 'block';
      customInputsSection.innerHTML = inputs.map(inp => `
        <div class="input-field-group">
          <label>${escapeHtml(inp.name)}</label>
          <input type="text" id="customInput_${escapeHtml(inp.id)}" placeholder="${escapeHtml(inp.placeholder||'Enter value')}">
        </div>
      `).join('');
    }

    const cur = getPreferredCurrency();
    if (!products.length) {
      if (productsList) productsList.innerHTML = `<div class="empty-state"><p>No products available</p></div>`;
      return;
    }

    if (productsList) {
      productsList.innerHTML = products.map(p => {
        const price = cur === 'MMK' ? p.price_mmk : p.price_usd;
        return `
          <div class="product-item">
            <div class="prod-icon">
              <img src="${escapeHtml(p.icon_url||'/images/icons/product.png')}" onerror="this.src='/images/icons/product.png'" alt="" loading="lazy">
            </div>
            <div class="prod-info">
              <h4>${escapeHtml(p.name)}</h4>
              <span class="prod-amount">${escapeHtml(p.amount||'')}</span>
              <span class="prod-delivery">
                <img src="/images/icons/flash.png" onerror="this.style.display='none'" style="width:12px;" alt="">
                ${escapeHtml(p.delivery_time||'Instant')}
              </span>
            </div>
            <div class="prod-price">
              <span class="price-val">${cur === 'MMK' ? formatMMK(price) : formatUSD(price)}</span>
              <span class="price-cur">${cur}</span>
            </div>
            <button class="buy-btn" data-product="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-price-mmk="${p.price_mmk}" data-price-usd="${p.price_usd}" type="button">
              <img src="/images/icons/cart.png" onerror="this.style.display='none'" style="width:14px;" alt="">
              Buy
            </button>
          </div>`;
      }).join('');

      productsList.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', () => openOrderModal({
          type: 'product_purchase',
          product_id: btn.dataset.product,
          product_name: btn.dataset.name,
          price_mmk: parseFloat(btn.dataset.priceMmk),
          price_usd: parseFloat(btn.dataset.priceUsd)
        }));
      });
    }
  } catch (e) {
    if (productsList) productsList.innerHTML = `<div class="empty-state"><p>Failed to load</p></div>`;
  }

  loadFeedback(categoryId);
}

// ============================================================
// ORDER MODAL
// ============================================================
function openOrderModal(product) {
  if (!isLoggedIn()) { showToast('Please login first', 'warning'); return; }
  const user = getUserData();
  if (!user) return;

  const cur = getPreferredCurrency();
  const price = product.type === 'product_purchase'
    ? (cur === 'MMK' ? product.price_mmk : product.price_usd)
    : formatPrice(product.api_price_usd, APP_SETTINGS, cur);

  const body = document.getElementById('orderModalBody');
  if (!body) return;

  body.innerHTML = `
    <div class="order-detail">
      <div class="order-row">
        <span>Product</span>
        <strong>${escapeHtml(product.catalogue_name || product.product_name || '')}</strong>
      </div>
      <div class="order-row">
        <span>Game</span>
        <strong>${escapeHtml(product.game_name || CURRENT_CATEGORY?.name || '')}</strong>
      </div>
      <div class="order-row price-row">
        <span>Price</span>
        <strong class="order-price">${cur === 'MMK' ? formatMMK(price) : formatUSD(price)} ${cur}</strong>
      </div>
      <div class="order-row">
        <span>Your Balance</span>
        <strong>${cur === 'MMK' ? formatMMK(user.balance_mmk) : formatUSD(user.balance_usd)} ${cur}</strong>
      </div>
    </div>
    ${product.type === 'g2bulk_topup' ? `
      <div class="order-player-check" id="orderPlayerInfo">
        <div class="verify-result" id="orderVerifyResult"></div>
      </div>
    ` : ''}
    <button class="confirm-order-btn" id="confirmOrderBtn" type="button">
      <img src="/images/icons/check.png" onerror="this.style.display='none'" style="width:16px;" alt="">
      Confirm Order
    </button>
  `;

  // Pre-fill player info if entered
  if (product.type === 'g2bulk_topup') {
    const pid = document.getElementById('playerIdInput')?.value?.trim();
    const sid = document.getElementById('serverIdInput')?.value?.trim();
    const vr = document.getElementById('verifyResult')?.innerHTML;
    const ovr = document.getElementById('orderVerifyResult');
    if (ovr && pid) ovr.innerHTML = `<strong>Player ID:</strong> ${escapeHtml(pid)}${sid ? ` | Server: ${escapeHtml(sid)}` : ''}${vr ? `<br>${vr}` : ''}`;
  }

  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';
      await submitOrder(product, cur, price);
      confirmBtn.disabled = false;
    });
  }

  openModal('orderModal');
}

async function submitOrder(product, currency, displayPrice) {
  try {
    let body = { action: product.type, display_price: displayPrice, currency };

    if (product.type === 'g2bulk_topup') {
      const pid = document.getElementById('playerIdInput')?.value?.trim();
      const sid = document.getElementById('serverIdInput')?.value?.trim();
      if (!pid) { showToast('Please enter Player ID', 'error'); return; }
      body = { ...body, game_code: product.game_code, catalogue_name: product.catalogue_name, player_id: pid, server_id: sid || '', api_price_usd: product.api_price_usd, game_name: product.game_name };
    } else if (product.type === 'product_purchase') {
      body.product_id = product.product_id;
    }

    showLoading('Placing order...');
    const res = await apiPost('/orders', body);
    hideLoading();
    closeModal('orderModal');

    if (res.success) {
      showToast('Order placed successfully!', 'success', 5000);
      await AUTH.refreshUser();
      showOrderReceipt(res.order);
    } else {
      showToast(res.error || 'Order failed', 'error');
    }
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Order failed', 'error');
  }
}

function showOrderReceipt(order) {
  const container = document.getElementById('receiptContainer');
  if (!container) return;
  const status = order.status === 'completed' ? 'success' : order.status === 'failed' ? 'error' : 'info';
  const icon = order.status === 'completed' ? '✓' : order.status === 'failed' ? '✕' : '⏳';
  container.innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <img src="/images/logo.webp" alt="CR7" style="height:40px;" onerror="this.style.display='none'">
        <h3>Order Receipt</h3>
      </div>
      <div class="receipt-status ${status}"><span>${icon}</span> ${escapeHtml(order.status?.toUpperCase()||'PENDING')}</div>
      <div class="receipt-row"><span>Order ID</span><span>#${escapeHtml(String(order.id||'').slice(-8).toUpperCase())}</span></div>
      <div class="receipt-row"><span>Product</span><span>${escapeHtml(order.product_name||'')}</span></div>
      <div class="receipt-row"><span>Amount</span><span>${formatMMK(order.price_amount)} ${escapeHtml(order.price_currency||'MMK')}</span></div>
      <div class="receipt-row"><span>Date</span><span>${formatDateTime(order.created_at)}</span></div>
    </div>
  `;
  openModal('receiptModal');
}

// ============================================================
// FEEDBACK
// ============================================================
async function loadFeedback(categoryId) {
  try {
    const res = await apiGet(`/feedback?category_id=${encodeURIComponent(categoryId)}`);
    const feedback = res.feedback || [];
    const listEl = document.getElementById('feedbackList');
    const summaryEl = document.getElementById('feedbackSummary');
    if (!listEl) return;

    if (!feedback.length) {
      listEl.innerHTML = `<div class="empty-state"><p>No reviews yet</p></div>`;
      return;
    }

    const avgRating = feedback.reduce((s, f) => s + (f.rating||0), 0) / feedback.length;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="rating-avg">
          <span class="avg-num">${avgRating.toFixed(1)}</span>
          <div class="stars">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5-Math.round(avgRating))}</div>
          <span class="review-count">${feedback.length} reviews</span>
        </div>
      `;
    }

    listEl.innerHTML = feedback.slice(0, 10).map(f => `
      <div class="feedback-item">
        <div class="fb-header">
          <span class="fb-user">@${escapeHtml(f.users?.username||'User')}</span>
          <span class="fb-stars">${'★'.repeat(f.rating||5)}${'☆'.repeat(5-(f.rating||5))}</span>
          <span class="fb-date">${formatDate(f.created_at)}</span>
        </div>
        <p class="fb-msg">${escapeHtml(f.message||'')}</p>
      </div>
    `).join('');

    const writeBtn = document.getElementById('writeFeedbackBtn');
    if (writeBtn) {
      writeBtn.style.display = isLoggedIn() ? 'flex' : 'none';
      writeBtn.onclick = () => openFeedbackModal(categoryId);
    }
  } catch {}
}

function openFeedbackModal(categoryId) {
  openModal('feedbackModal');
  let rating = 5;
  const stars = document.querySelectorAll('#starsInput .star');
  stars.forEach((s, i) => {
    s.addEventListener('click', () => {
      rating = i + 1;
      stars.forEach((st, j) => st.classList.toggle('active', j < rating));
    });
  });

  const submitBtn = document.getElementById('submitFeedbackBtn');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const msg = document.getElementById('feedbackMessage')?.value?.trim();
      showLoading('Submitting...');
      try {
        await apiPost('/feedback', { category_id: categoryId, rating, message: msg });
        showToast('Review submitted!', 'success');
        closeModal('feedbackModal');
        loadFeedback(categoryId);
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        hideLoading();
      }
    };
  }
}

// ============================================================
// HISTORY PAGE
// ============================================================
async function loadOrderHistory(filter = 'all') {
  const listEl = document.getElementById('ordersList');
  if (!listEl) return;
  listEl.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div><div class="skeleton-item"></div></div>`;
  try {
    const res = await apiGet('/orders');
    let orders = res.orders || [];
    if (filter !== 'all') orders = orders.filter(o => o.status === filter);

    if (!orders.length) {
      listEl.innerHTML = `<div class="empty-state"><img src="/images/icons/receipt.png" onerror="this.style.display='none'" alt=""><p>No orders yet</p></div>`;
      return;
    }

    listEl.innerHTML = orders.map(o => `
      <div class="order-item" data-status="${escapeHtml(o.status||'')}">
        <div class="order-item-header">
          <span class="order-id">#${(o.id||'').slice(-8).toUpperCase()}</span>
          <span class="order-status status-${escapeHtml(o.status||'pending')}">${escapeHtml(o.status||'Pending')}</span>
        </div>
        <div class="order-item-body">
          <div class="order-item-info">
            <strong>${escapeHtml(o.product_name||'')}</strong>
            <span>${escapeHtml(o.category_name||o.order_type||'')}</span>
          </div>
          <div class="order-item-price">
            <strong>${formatMMK(o.price_amount)} ${escapeHtml(o.price_currency||'MMK')}</strong>
            <span>${formatDate(o.created_at)}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><p>Failed to load orders</p></div>`;
  }
}

// ============================================================
// NEWS PAGE
// ============================================================
async function loadNews() {
  const listEl = document.getElementById('newsList');
  if (!listEl) return;
  listEl.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div></div>`;
  try {
    const res = await apiGet('/news');
    const news = res.news || [];
    if (!news.length) {
      listEl.innerHTML = `<div class="empty-state"><img src="/images/icons/news.png" onerror="this.style.display='none'" alt=""><p>No news yet</p></div>`;
      return;
    }
    listEl.innerHTML = news.map(n => `
      <div class="news-card">
        ${n.media_link ? `<div class="news-media"><img src="${escapeHtml(n.media_link)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
        <div class="news-body">
          <h3>${escapeHtml(n.title)}</h3>
          <p>${escapeHtml(n.content||'')}</p>
          <span class="news-date">${formatDate(n.created_at)}</span>
          ${n.has_claim ? `<button class="claim-btn" data-news="${escapeHtml(n.id)}" type="button">
            <img src="/images/icons/gift.png" onerror="this.style.display='none'" style="width:14px;" alt="">
            Claim Reward
          </button>` : ''}
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.claim-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!isLoggedIn()) { showToast('Please login first', 'warning'); return; }
        btn.disabled = true;
        btn.textContent = 'Claiming...';
        try {
          await apiPost('/news', { action: 'claim', news_id: btn.dataset.news });
          showToast('Reward claimed!', 'success');
          btn.textContent = 'Claimed!';
          AUTH.refreshUser();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Claim Reward';
          showToast(e.message, 'error');
        }
      });
    });
  } catch {}
}

// ============================================================
// TRANSACTIONS PAGE
// ============================================================
async function loadTransactions() {
  const listEl = document.getElementById('transactionsList');
  if (!listEl) return;
  listEl.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div></div>`;
  // Transactions loaded from balance_transactions via orders page for now
  // TODO: add a dedicated transactions endpoint if needed
  listEl.innerHTML = `<div class="empty-state"><p>View your deposit and order history in Orders and Deposits sections.</p></div>`;
}

// ============================================================
// TOP-UP MODAL
// ============================================================
async function loadTopupModal() {
  const cur = document.querySelector('.tcur-tab.active')?.dataset.tcur || 'MMK';
  const noteEl = document.getElementById('topupNote');
  const limitsEl = document.getElementById('topupLimits');
  const methodsGrid = document.getElementById('paymentMethodsGrid');

  if (noteEl && APP_SETTINGS) {
    noteEl.textContent = cur === 'MMK' ? (APP_SETTINGS.deposit_note_mmk||'') : (APP_SETTINGS.deposit_note_usd||'');
  }
  if (limitsEl && APP_SETTINGS) {
    const min = cur === 'MMK' ? APP_SETTINGS.min_deposit_mmk : APP_SETTINGS.min_deposit_usd;
    const max = cur === 'MMK' ? APP_SETTINGS.max_deposit_mmk : APP_SETTINGS.max_deposit_usd;
    limitsEl.textContent = min || max ? `Min: ${cur === 'MMK' ? formatMMK(min) : formatUSD(min)} ${cur} | Max: ${cur === 'MMK' ? formatMMK(max) : formatUSD(max)} ${cur}` : '';
  }

  if (methodsGrid) {
    methodsGrid.innerHTML = `<div class="loading-small">Loading...</div>`;
    try {
      const res = await apiGet(`/payments?currency=${cur}`);
      const methods = res.methods || [];
      if (!methods.length) {
        methodsGrid.innerHTML = `<div class="empty-small">No payment methods</div>`;
        return;
      }
      methodsGrid.innerHTML = methods.map(m => `
        <button class="payment-method-btn" data-id="${escapeHtml(m.id)}" data-name="${escapeHtml(m.name)}" data-addr="${escapeHtml(m.address)}" data-note="${escapeHtml(m.note||'')}" type="button">
          <img src="${escapeHtml(m.icon_url||'/images/icons/payment.png')}" onerror="this.src='/images/icons/payment.png'" alt="" loading="lazy">
          <span>${escapeHtml(m.name)}</span>
        </button>
      `).join('');

      methodsGrid.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.addEventListener('click', () => selectPaymentMethod(btn));
      });
    } catch {}
  }
}

function selectPaymentMethod(btn) {
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const selectedDiv = document.getElementById('selectedPayment');
  const infoDiv = document.getElementById('paymentInfo');
  if (selectedDiv) selectedDiv.style.display = 'block';
  if (infoDiv) {
    infoDiv.innerHTML = `
      <div class="pay-info-row">
        <strong>${escapeHtml(btn.dataset.name)}</strong>
        <button class="copy-btn" type="button" onclick="copyToClipboard('${escapeHtml(btn.dataset.addr)}')">
          <img src="/images/icons/copy.png" onerror="this.style.display='none'" style="width:12px;" alt="">
          Copy
        </button>
      </div>
      <div class="pay-addr">${escapeHtml(btn.dataset.addr)}</div>
      ${btn.dataset.note ? `<p class="pay-note">${escapeHtml(btn.dataset.note)}</p>` : ''}
    `;
  }

  const submitBtn = document.getElementById('submitDepositBtn');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const amount = document.getElementById('topupAmount')?.value;
      if (!amount || parseFloat(amount) <= 0) { showToast('Enter valid amount', 'error'); return; }
      const cur = document.querySelector('.tcur-tab.active')?.dataset.tcur || 'MMK';
      const receiptFile = document.getElementById('receiptFile')?.files[0];

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      showLoading('Submitting deposit...');

      try {
        let receiptUrl = null;
        if (receiptFile) {
          const fd = new FormData();
          fd.append('file', receiptFile);
          fd.append('name', `receipt_${Date.now()}`);
          const up = await apiUpload('/upload', fd);
          receiptUrl = up.url;
        }

        await apiPost('/deposits', {
          action: 'request',
          amount: parseFloat(amount),
          currency: cur,
          payment_method_id: btn.dataset.id,
          receipt_url: receiptUrl
        });

        hideLoading();
        closeModal('topupModal');
        showToast('Deposit request submitted!', 'success', 6000);
      } catch (e) {
        hideLoading();
        showToast(e.message || 'Failed to submit', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Deposit';
      }
    };
  }
}

// ============================================================
// SEARCH
// ============================================================
function initSearch() {
  const searchBtn = document.getElementById('searchBtn');
  const searchPage = document.getElementById('searchPage');
  const searchBack = document.getElementById('searchBackBtn');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  if (searchBtn) searchBtn.addEventListener('click', () => showPage('search'));
  if (searchBack) searchBack.addEventListener('click', () => showPage('home'));

  if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      if (!q) { if (searchResults) searchResults.innerHTML = ''; return; }
      if (searchResults) searchResults.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div><div class="skeleton-item"></div></div>`;

      try {
        const res = await apiGet(`/g2bulk?action=search&q=${encodeURIComponent(q)}`);
        const games = res.games || [];
        if (!games.length) {
          searchResults.innerHTML = `<div class="empty-state"><p>No games found for "${escapeHtml(q)}"</p></div>`;
          return;
        }
        searchResults.innerHTML = games.map(g => `
          <button class="search-result-item" data-game="${escapeHtml(g.code||g.game_code||g.id)}" data-name="${escapeHtml(g.name||'')}" type="button">
            <img src="${escapeHtml(g.image||'/images/icons/game.png')}" onerror="this.src='/images/icons/game.png'" alt="" loading="lazy">
            <span>${escapeHtml(g.name||'')}</span>
            <img src="/images/icons/arrow-right.png" onerror="this.style.display='none'" style="width:14px;margin-left:auto;" alt="">
          </button>
        `).join('');
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            searchInput.value = '';
            openGameCategory(item.dataset.game, item.dataset.name);
          });
        });
      } catch {
        searchResults.innerHTML = `<div class="empty-state"><p>Search failed</p></div>`;
      }
    }, 300));
  }
}

// ============================================================
// LEADERBOARD PAGE
// ============================================================
async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;
  listEl.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div></div>`;
  try {
    const res = await apiGet('/leaderboard');
    const lb = res.leaderboard || [];
    if (!lb.length) { listEl.innerHTML = `<div class="empty-state"><p>No data yet</p></div>`; return; }
    listEl.innerHTML = lb.map((u, i) => `
      <div class="lb-item rank-${i+1}">
        <span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}</span>
        <span class="lb-name">@${escapeHtml(u.username||u.name||'User')}</span>
        <span class="lb-amount">${formatMMK(u.total_spent_mmk)} MMK</span>
      </div>
    `).join('');
  } catch {}
}

// ============================================================
// NAVIGATION
// ============================================================
function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.nav;
      showPage(page);
      document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === page));
    });
  });

  document.getElementById('categoryBackBtn')?.addEventListener('click', () => showPage('home'));
  document.getElementById('gameAccountBackBtn')?.addEventListener('click', () => showPage('home'));
  document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => showPage('profile'));
  document.getElementById('transactionsBackBtn')?.addEventListener('click', () => showPage('profile'));
  document.getElementById('leaderboardBtn')?.addEventListener('click', () => { showPage('leaderboard'); loadLeaderboard(); });
  document.getElementById('transactionHistoryBtn')?.addEventListener('click', () => { showPage('transactions'); loadTransactions(); });
  document.getElementById('logoutBtn')?.addEventListener('click', () => AUTH.logout());

  initSearch();

  // History tab filters
  document.querySelectorAll('.htab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.htab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadOrderHistory(tab.dataset.htab);
    });
  });
}

function showPage(name) {
  CURRENT_PAGE = name;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
  if (name === 'history') loadOrderHistory('all');
  if (name === 'news') loadNews();
  if (name === 'profile') loadProfile();
  if (name === 'search') { const si = document.getElementById('searchInput'); if (si) si.focus(); }
}

async function loadProfile() {
  const user = AUTH.user || getUserData();
  if (!user) return;
  AUTH.updateUI();
  try {
    const res = await apiGet('/orders?action=stats');
    const el = document.getElementById('profileTotalOrders');
    if (el) el.textContent = res.total_orders || 0;
  } catch {}
}

// ============================================================
// TOP BAR
// ============================================================
function setupTopBar() {
  // Logo from settings
  const logoEl = document.getElementById('siteLogo');
  if (logoEl) {
    logoEl.src = '/images/logo.webp';
    logoEl.style.display = 'block';
  }
  const siteNameEl = document.getElementById('siteName');
  if (siteNameEl) siteNameEl.style.display = 'none';
}

function setupBalanceSwap() {
  const btn = document.getElementById('swapCurrencyBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = getPreferredCurrency() === 'MMK' ? 'USD' : 'MMK';
    setPreferredCurrency(cur);
    AUTH.updateUI();
  });
}

function setupTopupButtons() {
  const openTopup = () => { openModal('topupModal'); loadTopupModal(); };
  document.getElementById('topupBtnSmall')?.addEventListener('click', openTopup);
  document.getElementById('topupCenterBtn')?.addEventListener('click', openTopup);
  document.querySelectorAll('.tcur-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tcur-tab').forEach(t => t.classList.toggle('active', t === tab));
      loadTopupModal();
    });
  });

  // Receipt file preview
  const receiptFile = document.getElementById('receiptFile');
  const receiptPreview = document.getElementById('receiptPreview');
  if (receiptFile && receiptPreview) {
    receiptFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      receiptPreview.innerHTML = `<img src="${url}" alt="Receipt preview">`;
      receiptPreview.style.display = 'block';
    });
  }
}

async function openGameAccount(accountId) {
  showPage('gameAccountDetail');
  const detailEl = document.getElementById('gameAccountDetail');
  if (!detailEl) return;
  detailEl.innerHTML = `<div class="loading-list"><div class="skeleton-item"></div></div>`;
  try {
    const res = await apiGet(`/custom?action=game-accounts`);
    const accounts = res.accounts || [];
    const account = accounts.find(a => a.id === accountId);
    if (!account) { detailEl.innerHTML = `<div class="empty-state"><p>Account not found</p></div>`; return; }
    const cur = getPreferredCurrency();
    const price = cur === 'MMK' ? account.price_mmk : account.price_usd;
    detailEl.innerHTML = `
      <div class="ga-detail">
        <h2>${escapeHtml(account.game_name)}</h2>
        ${account.game_version ? `<span class="ga-version">${escapeHtml(account.game_version)}</span>` : ''}
        <p class="ga-desc">${escapeHtml(account.description||'')}</p>
        ${(account.game_account_images||[]).length > 0 ? `
          <div class="ga-images">${account.game_account_images.map(img => `<img src="${escapeHtml(img.image_url)}" alt="" onerror="this.style.display='none'" loading="lazy">`).join('')}</div>
        ` : ''}
        <div class="ga-platforms">
          ${(account.linked_platforms||[]).map(p => `<span class="platform-tag">${escapeHtml(p)}</span>`).join('')}
        </div>
        <div class="ga-price-row">
          <span class="ga-price-big">${cur === 'MMK' ? formatMMK(price) : formatUSD(price)} ${cur}</span>
          <button class="buy-btn-large" id="gaOrderBtn" type="button">
            <img src="/images/icons/cart.png" onerror="this.style.display='none'" style="width:16px;" alt="">
            Buy Account
          </button>
        </div>
        ${(account.game_account_contacts||[]).length > 0 ? `
          <div class="ga-contacts">
            <h4>Contact Info</h4>
            ${account.game_account_contacts.map(c => `
              <div class="ga-contact-row">
                <span>${escapeHtml(c.social_name)}</span>
                <span>${escapeHtml(c.contact_value)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('gaOrderBtn')?.addEventListener('click', () => {
      openOrderModal({ type: 'game_account_purchase', account_id: account.id, product_name: account.game_name, price_mmk: account.price_mmk, price_usd: account.price_usd });
    });
  } catch {
    detailEl.innerHTML = `<div class="empty-state"><p>Failed to load</p></div>`;
  }
}

// ============================================================
// START APP
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  AUTH_FORM.init();
  initApp();
});
