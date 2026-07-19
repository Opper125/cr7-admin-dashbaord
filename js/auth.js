/* ============================================================
   CR7 GAME STORE v2.0 - WEB AUTH
   Email + Password (no Telegram)
   ============================================================ */

const AUTH = {
  user: null,
  isInitialized: false,

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const token = getSessionToken();
    if (!token) {
      this.showAuthPage();
      return false;
    }

    try {
      showLoading('Loading...');
      const result = await apiGet('/auth?action=verify');
      if (result.success && result.user) {
        this.user = result.user;
        setUserData(result.user);
        await this.onLoginSuccess();
        return true;
      }
    } catch (err) {
      console.warn('Session invalid:', err.message);
    } finally {
      hideLoading();
    }

    removeSessionToken();
    removeUserData();
    this.showAuthPage();
    return false;
  },

  // ── Show auth page (login/signup) ──
  showAuthPage() {
    const app = document.getElementById('appContainer');
    const authPage = document.getElementById('authPage');
    if (app) app.style.display = 'none';
    if (authPage) authPage.style.display = 'flex';
    hideLoading();
  },

  hideAuthPage() {
    const authPage = document.getElementById('authPage');
    const app = document.getElementById('appContainer');
    if (authPage) authPage.style.display = 'none';
    if (app) app.style.display = 'flex';
  },

  // ── Login ──
  async login(identifier, password) {
    if (!identifier || !password) {
      showToast('Please enter your credentials', 'error');
      return false;
    }
    showLoading('Signing in...');
    try {
      const result = await apiPost('/auth', { action: 'login', identifier, password });
      if (result.success) {
        setSessionToken(result.session_token);
        setUserData(result.user);
        this.user = result.user;
        await this.onLoginSuccess();
        return true;
      }
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      hideLoading();
    }
    return false;
  },

  // ── Signup ──
  async signup(name, username, email, password) {
    showLoading('Creating account...');
    try {
      const result = await apiPost('/auth', { action: 'signup', name, username, email, password });
      if (result.success) {
        setSessionToken(result.session_token);
        setUserData(result.user);
        this.user = result.user;
        await this.onLoginSuccess();
        showToast('Account created successfully!', 'success');
        return true;
      }
    } catch (err) {
      showToast(err.message || 'Signup failed', 'error');
      return { error: err.message };
    } finally {
      hideLoading();
    }
    return false;
  },

  // ── After login: request location ──
  async onLoginSuccess() {
    this.hideAuthPage();
    this.updateUI();

    // Request location AFTER login
    const locationGranted = await LOCATION_MGR.init();
    if (!locationGranted) return;

    // Dispatch event
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: this.user } }));
  },

  // ── Logout ──
  async logout() {
    try {
      await apiPost('/auth', { action: 'logout' }).catch(() => {});
    } catch {}
    removeSessionToken();
    removeUserData();
    this.user = null;
    this.showAuthPage();
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: false } }));
  },

  // ── Update UI with user data ──
  updateUI() {
    const user = this.user;
    if (!user) return;

    const els = {
      profileName:        document.getElementById('profileName'),
      profileUsername:    document.getElementById('profileUsername'),
      profileBalanceMMK:  document.getElementById('profileBalanceMMK'),
      profileBalanceUSD:  document.getElementById('profileBalanceUSD'),
      profileTotalOrders: document.getElementById('profileTotalOrders'),
      primaryAmount:      document.getElementById('primaryBalanceAmount'),
      primaryCur:         document.getElementById('primaryCurrency'),
      secondaryAmount:    document.getElementById('secondaryBalanceAmount'),
      secondaryCur:       document.getElementById('secondaryCurrency'),
      balanceContainer:   document.getElementById('balanceContainer'),
      logoutBtn:          document.getElementById('logoutBtn')
    };

    if (els.profileName) els.profileName.textContent = user.name || user.username;
    if (els.profileUsername) els.profileUsername.textContent = `@${user.username}`;
    if (els.profileBalanceMMK) els.profileBalanceMMK.textContent = formatMMK(user.balance_mmk) + ' MMK';
    if (els.profileBalanceUSD) els.profileBalanceUSD.textContent = '$' + formatUSD(user.balance_usd);
    if (els.balanceContainer) els.balanceContainer.style.display = 'flex';
    if (els.logoutBtn) els.logoutBtn.style.display = 'flex';

    const cur = getPreferredCurrency();
    if (cur === 'MMK') {
      if (els.primaryAmount) els.primaryAmount.textContent = formatMMK(user.balance_mmk);
      if (els.primaryCur) els.primaryCur.textContent = 'MMK';
      if (els.secondaryAmount) els.secondaryAmount.textContent = formatUSD(user.balance_usd);
      if (els.secondaryCur) els.secondaryCur.textContent = 'USD';
    } else {
      if (els.primaryAmount) els.primaryAmount.textContent = formatUSD(user.balance_usd);
      if (els.primaryCur) els.primaryCur.textContent = 'USD';
      if (els.secondaryAmount) els.secondaryAmount.textContent = formatMMK(user.balance_mmk);
      if (els.secondaryCur) els.secondaryCur.textContent = 'MMK';
    }
  },

  async refreshUser() {
    if (!isLoggedIn()) return;
    try {
      const result = await apiGet('/auth?action=verify');
      if (result.success && result.user) {
        this.user = result.user;
        setUserData(result.user);
        this.updateUI();
      }
    } catch {}
  }
};

window.AUTH = AUTH;

// ============================================================
// AUTH FORM CONTROLLER
// ============================================================
const AUTH_FORM = {
  mode: 'login', // 'login' | 'signup'
  usernameCheckTimeout: null,
  emailCheckTimeout: null,

  init() {
    this.bindEvents();
    this.initPasswordChecklist();
  },

  switchMode(mode) {
    this.mode = mode;
    const loginForm = document.getElementById('loginFormSection');
    const signupForm = document.getElementById('signupFormSection');
    const loginTab = document.getElementById('authTabLogin');
    const signupTab = document.getElementById('authTabSignup');

    if (mode === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (signupForm) signupForm.style.display = 'none';
      if (loginTab) loginTab.classList.add('active');
      if (signupTab) signupTab.classList.remove('active');
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (signupForm) signupForm.style.display = 'block';
      if (loginTab) loginTab.classList.remove('active');
      if (signupTab) signupTab.classList.add('active');
    }
  },

  bindEvents() {
    // Tab switches
    const loginTab = document.getElementById('authTabLogin');
    const signupTab = document.getElementById('authTabSignup');
    if (loginTab) loginTab.addEventListener('click', () => this.switchMode('login'));
    if (signupTab) signupTab.addEventListener('click', () => this.switchMode('signup'));

    // Login form submit
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('loginIdentifier')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value;
        await AUTH.login(identifier, password);
      });
    }

    // Signup form submit
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSignup();
      });
    }

    // Username input: real-time validation + availability
    const usernameInput = document.getElementById('signupUsername');
    if (usernameInput) {
      usernameInput.addEventListener('input', (e) => {
        let val = e.target.value;
        // Remove @ prefix if user typed it
        val = val.replace(/^@+/, '');
        // Show @ prefix visually (handled in CSS)
        e.target.value = val;
        this.validateUsernameField(val);
      });
    }

    // Email input: real-time availability
    const emailInput = document.getElementById('signupEmail');
    if (emailInput) {
      emailInput.addEventListener('input', debounce((e) => {
        this.checkEmailAvailability(e.target.value);
      }, 600));
    }

    // Password input: live checklist
    const pwInput = document.getElementById('signupPassword');
    if (pwInput) {
      pwInput.addEventListener('input', (e) => this.updatePasswordChecklist(e.target.value));
    }

    // Toggle password visibility
    document.querySelectorAll('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          btn.textContent = input.type === 'password' ? '👁' : '🙈';
        }
      });
    });
  },

  validateUsernameField(val) {
    const errorEl = document.getElementById('usernameError');
    const inputEl = document.getElementById('signupUsername');
    if (!val) { this.setFieldState(inputEl, errorEl, '', 'normal'); return; }

    const error = validateUsernameClient(val);
    if (error) {
      this.setFieldState(inputEl, errorEl, error, 'error');
      return;
    }

    // Check availability (debounced)
    clearTimeout(this.usernameCheckTimeout);
    this.setFieldState(inputEl, errorEl, 'Checking...', 'checking');
    this.usernameCheckTimeout = setTimeout(async () => {
      try {
        const res = await apiGet(`/auth?action=check-username&username=${encodeURIComponent(val)}`);
        if (!res.available) {
          this.setFieldState(inputEl, errorEl, 'This username is already taken', 'error');
        } else {
          this.setFieldState(inputEl, errorEl, 'Username available', 'success');
        }
      } catch { this.setFieldState(inputEl, errorEl, '', 'normal'); }
    }, 500);
  },

  async checkEmailAvailability(email) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const errorEl = document.getElementById('emailError');
    const inputEl = document.getElementById('signupEmail');
    this.setFieldState(inputEl, errorEl, 'Checking...', 'checking');
    try {
      const res = await apiGet(`/auth?action=check-email&email=${encodeURIComponent(email)}`);
      if (!res.available) {
        this.setFieldState(inputEl, errorEl, 'Email already registered', 'error');
      } else {
        this.setFieldState(inputEl, errorEl, '', 'success');
      }
    } catch { this.setFieldState(inputEl, errorEl, '', 'normal'); }
  },

  setFieldState(input, errorEl, message, state) {
    if (!input) return;
    input.classList.remove('field-error', 'field-success', 'field-checking');
    if (state === 'error') input.classList.add('field-error');
    if (state === 'success') input.classList.add('field-success');
    if (state === 'checking') input.classList.add('field-checking');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.className = `field-msg ${state === 'error' ? 'msg-error' : state === 'success' ? 'msg-success' : 'msg-info'}`;
      errorEl.style.display = message ? 'block' : 'none';
    }
  },

  initPasswordChecklist() {
    const checklist = document.getElementById('pwChecklist');
    if (!checklist) return;
    checklist.innerHTML = `
      <div class="pw-check" id="pwCheckLen" data-check="len">
        <span class="check-dot"></span><span>At least 8 characters</span>
      </div>
      <div class="pw-check" id="pwCheckUpper" data-check="upper">
        <span class="check-dot"></span><span>Uppercase letter (A-Z)</span>
      </div>
      <div class="pw-check" id="pwCheckSpecial" data-check="special">
        <span class="check-dot"></span><span>Special character (@+$%#&*)</span>
      </div>
      <div class="pw-check" id="pwCheckMaxLen" data-check="maxlen">
        <span class="check-dot"></span><span>Maximum 18 characters</span>
      </div>
    `;
  },

  updatePasswordChecklist(pw) {
    const checks = {
      len:     pw.length >= 8,
      upper:   /[A-Z]/.test(pw),
      special: /[@+$%#&*]/.test(pw),
      maxlen:  pw.length >= 1 && pw.length <= 18
    };
    Object.keys(checks).forEach(key => {
      const el = document.getElementById(`pwCheck${key.charAt(0).toUpperCase() + key.slice(1)}`);
      if (el) el.classList.toggle('check-pass', checks[key]);
    });
  },

  async handleSignup() {
    const name     = document.getElementById('signupName')?.value?.trim();
    const username = document.getElementById('signupUsername')?.value?.trim();
    const email    = document.getElementById('signupEmail')?.value?.trim();
    const password = document.getElementById('signupPassword')?.value;

    if (!name) { showToast('Please enter your name', 'error'); return; }
    if (!username) { showToast('Please enter a username', 'error'); return; }
    if (!email) { showToast('Please enter your email', 'error'); return; }
    if (!password) { showToast('Please enter a password', 'error'); return; }

    // Check for red fields
    const usernameInput = document.getElementById('signupUsername');
    if (usernameInput?.classList.contains('field-error')) {
      showToast('Please fix username errors', 'error');
      return;
    }

    const pwError = validatePasswordClient(password);
    if (pwError) { showToast(pwError, 'error'); return; }

    const result = await AUTH.signup(name, username, email, password);
    if (result?.error) {
      // Highlight specific field if known
      if (result.error.includes('username')) {
        const errEl = document.getElementById('usernameError');
        const inp = document.getElementById('signupUsername');
        this.setFieldState(inp, errEl, result.error, 'error');
      } else if (result.error.includes('email') || result.error.includes('Email')) {
        const errEl = document.getElementById('emailError');
        const inp = document.getElementById('signupEmail');
        this.setFieldState(inp, errEl, result.error, 'error');
      }
    }
  }
};

window.AUTH_FORM = AUTH_FORM;
