/* ============================================================
   CR7 GAME STORE v2.0 - LOCATION & VPN DETECTION
   ============================================================ */

const LOCATION_MGR = {
  locationData: null,
  vpnChecked: false,
  locationGranted: false,

  // ── Main entry: called after successful login ──
  async init() {
    if (this.locationGranted) return true;
    return await this.requestLocation();
  },

  // ── Request location permission ──
  async requestLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        showToast('Your browser does not support location services.', 'error');
        this.showLocationBlockedScreen('Your browser does not support geolocation.');
        return resolve(false);
      }

      // Show location permission modal
      this.showLocationPermissionModal(async () => {
        // User clicked Allow
        showLoading('Getting your location...');
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            hideLoading();
            await this.onLocationSuccess(pos);
            resolve(true);
          },
          (err) => {
            hideLoading();
            this.onLocationError(err);
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
      });
    });
  },

  // ── Location success ──
  async onLocationSuccess(position) {
    const { latitude, longitude } = position.coords;
    showLoading('Verifying location...');

    try {
      // Get client IP and check for VPN simultaneously
      const ipRes = await fetch('/api/ip');
      const ipData = await ipRes.json();
      const ip = ipData.ip;

      // VPN check
      const vpnRes = await fetch(`/api/vpn-check?ip=${encodeURIComponent(ip)}`);
      const vpnData = await vpnRes.json();

      if (vpnData.is_vpn) {
        hideLoading();
        this.showVpnBlockedScreen();
        return false;
      }

      this.locationData = {
        latitude,
        longitude,
        city: vpnData.city || null,
        country: vpnData.country || null,
        region: vpnData.region || null,
        ip,
        is_vpn: false
      };

      // Save location to server
      await apiPost('/location', {
        action: 'save',
        ...this.locationData
      });

      this.locationGranted = true;
      hideLoading();
      this.closeLocationModal();
      window.dispatchEvent(new CustomEvent('locationGranted', { detail: this.locationData }));
      return true;
    } catch (err) {
      hideLoading();
      // If server error, still allow access (location save failed but not user's fault)
      this.locationGranted = true;
      this.closeLocationModal();
      return true;
    }
  },

  // ── Location error ──
  onLocationError(err) {
    let msg = 'Location access was denied.';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'Location permission denied. Please enable location access in your browser settings.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      msg = 'Location information unavailable. Please check your device location settings.';
    } else if (err.code === err.TIMEOUT) {
      msg = 'Location request timed out. Please try again.';
    }
    this.showLocationBlockedScreen(msg);
  },

  // ── Show location permission modal ──
  showLocationPermissionModal(onAllow) {
    let modal = document.getElementById('locationModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'locationModal';
      modal.className = 'location-gate';
      modal.innerHTML = `
        <div class="location-gate-bg"></div>
        <div class="location-gate-card">
          <div class="loc-icon-wrap">
            <img src="/images/icons/location.png" onerror="this.style.display='none'" alt="">
            <div class="loc-icon-fallback">📍</div>
          </div>
          <h2 class="loc-title">Location Required</h2>
          <p class="loc-desc">CR7 Game Store requires your location to provide services. Please allow location access to continue.</p>
          <div class="loc-bullets">
            <div class="loc-bullet"><span class="bullet-dot"></span>Your location is used for service availability</div>
            <div class="loc-bullet"><span class="bullet-dot"></span>VPN usage is not allowed on this platform</div>
            <div class="loc-bullet"><span class="bullet-dot"></span>Location data is kept secure</div>
          </div>
          <button class="loc-allow-btn" id="locAllowBtn">
            <img src="/images/icons/location.png" onerror="this.style.display='none'" style="width:18px;height:18px;" alt="">
            Allow Location Access
          </button>
          <p class="loc-note">If prompted by your browser, please click "Allow"</p>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    const btn = modal.querySelector('#locAllowBtn');
    if (btn) {
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'Requesting...';
        onAllow();
      };
    }
  },

  closeLocationModal() {
    const modal = document.getElementById('locationModal');
    if (modal) modal.style.display = 'none';
  },

  // ── VPN blocked screen ──
  showVpnBlockedScreen() {
    this.showGateScreen(
      '🔒',
      'VPN Detected',
      'This service is not available while using a VPN or proxy. Please disable your VPN and reload the page.',
      true
    );
  },

  // ── Location blocked screen ──
  showLocationBlockedScreen(msg) {
    this.showGateScreen(
      '📍',
      'Location Required',
      msg + '\n\nPlease enable location access and reload the page.',
      true
    );
  },

  showGateScreen(icon, title, message, showReload) {
    // Hide main app
    const app = document.getElementById('appContainer');
    if (app) app.style.display = 'none';
    this.closeLocationModal();

    let screen = document.getElementById('locationBlockedScreen');
    if (!screen) {
      screen = document.createElement('div');
      screen.id = 'locationBlockedScreen';
      screen.className = 'gate-screen';
      document.body.appendChild(screen);
    }

    screen.innerHTML = `
      <div class="gate-screen-content">
        <div class="gate-icon">${icon}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        ${showReload ? `<button class="gate-reload-btn" onclick="location.reload()">Reload Page</button>` : ''}
      </div>
    `;
    screen.style.display = 'flex';
  }
};
