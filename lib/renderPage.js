const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const TEMPLATE_PATH = path.join(__dirname, '..', 'server', 'template.html');
let templateCache = null;

function loadTemplate() {
  if (!templateCache) {
    templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }
  return templateCache;
}

const RESTRICTED_BANNER = `
      <div class="restricted-banner">
        <div class="lock-icon">🔒</div>
        <p>Cette section est réservée aux organisateurs du voyage.</p>
      </div>`;

const PWA_HEAD_EXTRA = `
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1A3D2E">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Marrakech">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/icons/icon-192.png">
`;

const PWA_UPDATE_STYLE = `
<style>
.pwa-update-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(20, 20, 16, 0.55);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.pwa-update-overlay.show { display: flex; }
.pwa-update-card {
  background: var(--white);
  border-radius: var(--r);
  padding: 28px 26px;
  width: 100%;
  max-width: 340px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  animation: fadeUp 0.3s ease both;
}
.pwa-update-icon { font-size: 34px; margin-bottom: 10px; }
.pwa-update-title {
  font-family: 'Playfair Display', serif;
  font-size: 19px;
  color: var(--atlas2);
  margin-bottom: 8px;
}
.pwa-update-text { font-size: 13px; color: var(--muted); line-height: 1.5; }
.pwa-update-actions { display: flex; gap: 10px; margin-top: 20px; }
.pwa-update-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.pwa-update-btn-secondary {
  background: var(--sand);
  border: 1px solid var(--border);
  color: var(--muted);
}
.pwa-update-btn-secondary:hover { background: var(--sand2); }
.pwa-update-btn-primary {
  background: var(--terrac);
  border: none;
  color: #fff;
}
.pwa-update-btn-primary:hover { background: #B5692E; }

.pwa-update-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9997;
  display: none;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  background: var(--atlas2);
  color: #fff;
  padding: 10px 16px;
  font-size: 13px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.pwa-update-banner.show { display: flex; }
.pwa-update-banner-btn {
  background: var(--terrac);
  border: none;
  color: #fff;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  white-space: nowrap;
}
.pwa-update-banner-btn:hover { background: #B5692E; }
</style>
`;

const PWA_UPDATE_MARKUP = `
<div class="pwa-update-banner" id="pwaUpdateBanner">
  <span>Une nouvelle version est disponible.</span>
  <button type="button" class="pwa-update-banner-btn" id="pwaUpdateBannerBtn">Mettre à jour</button>
</div>
<div class="pwa-update-overlay" id="pwaUpdateOverlay">
  <div class="pwa-update-card">
    <div class="pwa-update-icon">🔄</div>
    <h3 class="pwa-update-title">Mise à jour disponible</h3>
    <p class="pwa-update-text">Une nouvelle version du carnet de voyage est prête. Mettez à jour pour profiter des dernières améliorations.</p>
    <div class="pwa-update-actions">
      <button type="button" class="pwa-update-btn-secondary" id="pwaUpdateLaterBtn">Plus tard</button>
      <button type="button" class="pwa-update-btn-primary" id="pwaUpdateNowBtn">Mettre à jour</button>
    </div>
  </div>
</div>
`;

const SW_REGISTER_SCRIPT = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const overlay = document.getElementById('pwaUpdateOverlay');
      const banner = document.getElementById('pwaUpdateBanner');
      const laterBtn = document.getElementById('pwaUpdateLaterBtn');
      const nowBtn = document.getElementById('pwaUpdateNowBtn');
      const bannerBtn = document.getElementById('pwaUpdateBannerBtn');

      function showOverlay() {
        banner.classList.remove('show');
        overlay.classList.add('show');
      }

      function showBanner() {
        overlay.classList.remove('show');
        banner.classList.add('show');
      }

      function trackInstallingWorker(worker) {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showOverlay();
          }
        });
      }

      if (registration.waiting && navigator.serviceWorker.controller) {
        showOverlay();
      }

      if (registration.installing) {
        trackInstallingWorker(registration.installing);
      }

      registration.addEventListener('updatefound', () => {
        if (registration.installing) trackInstallingWorker(registration.installing);
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      nowBtn.addEventListener('click', () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });

      laterBtn.addEventListener('click', () => {
        showBanner();
      });

      bannerBtn.addEventListener('click', () => {
        showOverlay();
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
</script>
`;

// Replaces the original inline PIN-check script: the PIN list and the
// budget/finance figures must never be sent to the browser before (or
// without) a verified server-side login, so this only talks to /api/login.
const CLIENT_SCRIPT_LOGGED_OUT = `
<script>
let pin = '';

function updateDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('d' + i);
    dot.className = 'pin-dot' + (i < pin.length ? ' filled' : '');
  }
  document.getElementById('connectBtn').disabled = pin.length < 4;
}

function addDigit(d) {
  if (pin.length >= 4) return;
  pin += d;
  updateDots();
  document.getElementById('lockError').textContent = '';
}

function delDigit() {
  pin = pin.slice(0, -1);
  updateDots();
  document.getElementById('lockError').textContent = '';
}

function showError(message) {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i).className = 'pin-dot error';
  }
  document.getElementById('lockError').textContent = message;
  document.getElementById('connectBtn').disabled = false;
  setTimeout(() => { pin = ''; updateDots(); }, 800);
}

function tryConnect() {
  if (pin.length !== 4) return;
  document.getElementById('connectBtn').disabled = true;
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'invalid');
      }
      return res.json();
    })
    .then((user) => {
      const overlay = document.getElementById('welcomeOverlay');
      document.getElementById('welcomeName').textContent = user.name;
      overlay.classList.add('show');
      setTimeout(() => { window.location.reload(); }, 1200);
    })
    .catch((err) => {
      const messages = {
        rate_limited: 'Trop de tentatives — réessayez dans quelques minutes',
        server_misconfigured: 'Erreur de configuration serveur (variables d\'environnement manquantes) — contactez l\'administrateur',
        method_not_allowed: 'Erreur serveur — réessayez',
      };
      showError(messages[err.message] || 'Code incorrect — réessayez');
    });
}

document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') addDigit(e.key);
  if (e.key === 'Backspace') delDigit();
  if (e.key === 'Enter' && pin.length === 4) tryConnect();
});
</script>
`;

const CLIENT_SCRIPT_LOGGED_IN = `
<script>
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const clicked = document.querySelector('.nav-item[data-section="' + id + '"]');
  if (clicked) clicked.classList.add('active');
}

function logout() {
  fetch('/api/logout', { method: 'POST' }).finally(() => { window.location.href = '/'; });
}

const sections = document.querySelectorAll('section[id]');
const navItems = document.querySelectorAll('.nav-item');
const obs = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      navItems.forEach((n) => n.classList.remove('active'));
      const active = document.querySelector('.nav-item[data-section="' + e.target.id + '"]');
      if (active) active.classList.add('active');
    }
  });
}, { threshold: 0.25, rootMargin: '-60px 0px -60% 0px' });
sections.forEach((s) => obs.observe(s));
</script>
`;

function maskPrices($) {
  $('.price-field').each((_, el) => {
    $(el).text('•••');
  });
}

function applyRestrictedSections($) {
  $('#budgetContent').html(RESTRICTED_BANNER);
  $('#financeContent').html(RESTRICTED_BANNER);
  $('#navBudget').addClass('hidden');
  $('#navFinance').addClass('hidden');
  $('#mobileNavBudget').addClass('hidden');
  $('#mobileNavFinance').addClass('hidden');
}

// The original inline script embedded the PIN list and all budget figures
// in plain text regardless of login state; drop it entirely so nothing
// sensitive ships in the markup we serve.
function stripLegacyAuthScript($) {
  $('script').each((_, el) => {
    const content = $(el).html() || '';
    if (content.includes('const USERS')) {
      $(el).remove();
    }
  });
}

function injectPwaAndSw($) {
  $('head').append(PWA_HEAD_EXTRA);
  $('head').append(PWA_UPDATE_STYLE);
  $('body').append(PWA_UPDATE_MARKUP);
  $('body').append(SW_REGISTER_SCRIPT);
}

function renderLoggedOut() {
  const $ = cheerio.load(loadTemplate(), { decodeEntities: false });
  stripLegacyAuthScript($);

  // Nothing beyond the lock screen shell is sent until login succeeds.
  $('#app').remove();
  $('#mobileHeader').remove();
  $('#mobileNav').remove();

  $('body').append(CLIENT_SCRIPT_LOGGED_OUT);
  injectPwaAndSw($);
  return $.html();
}

function renderLoggedIn(user) {
  const $ = cheerio.load(loadTemplate(), { decodeEntities: false });
  stripLegacyAuthScript($);

  $('#lockscreen').remove();
  $('#welcomeOverlay').remove();

  if (!user.fullAccess) {
    maskPrices($);
    applyRestrictedSections($);
  }

  const initial = user.name ? user.name[0].toUpperCase() : '?';
  $('#userAvatar').text(initial);
  $('#userName').text(user.name);
  $('#userRole').text(user.fullAccess ? 'Accès complet' : 'Voyageur');
  $('#mobileAvatar').text(initial);
  $('#heroWelcome').text('Bonjour,');
  $('#heroPerson').text(user.name + ' 👋');

  $('#app').addClass('visible');
  // The template ships these two with a stray inline display:none that a
  // non-!important media query can never override; drop it so the existing
  // "@media (max-width:768px)" rules actually get to show the mobile nav.
  $('#mobileHeader').removeAttr('style');
  $('#mobileNav').removeAttr('style');

  $('body').append(CLIENT_SCRIPT_LOGGED_IN);
  injectPwaAndSw($);
  return $.html();
}

module.exports = { renderLoggedOut, renderLoggedIn };
