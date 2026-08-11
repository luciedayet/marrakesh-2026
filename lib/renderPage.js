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

const SW_REGISTER_SCRIPT = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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
