/* =============================================
   MATLEX RIDE — Driver Interface JS
   ============================================= */

const screens = document.querySelectorAll('.phone-screen[data-screen]');
const demoBtns = document.querySelectorAll('.demo-btn');

/* ---- Demo toolbar navigation ---- */
function showScreen(name) {
  screens.forEach(s => {
    s.style.display = s.dataset.screen === name ? 'flex' : 'none';
  });
  demoBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
}

demoBtns.forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen)));

/* ---- Online/Offline toggle ---- */
document.querySelectorAll('.driver-online-toggle').forEach(toggle => {
  toggle.addEventListener('change', function () {
    const badge = this.closest('.online-toggle-wrap')?.querySelector('.online-status-text');
    if (badge) badge.textContent = this.checked ? 'Online' : 'Offline';

    const mapBadge = document.querySelector('.status-badge-map');
    if (mapBadge) {
      mapBadge.textContent = this.checked ? '● Online' : '● Offline';
      mapBadge.className = 'status-badge-map ' + (this.checked ? 'badge-online' : 'badge-offline');
    }
  });
});

/* ---- Accept/Decline trip buttons ---- */
document.querySelectorAll('.btn-accept-trip').forEach(btn => {
  btn.addEventListener('click', () => showScreen('active'));
});
document.querySelectorAll('.btn-decline-trip').forEach(btn => {
  btn.addEventListener('click', () => showScreen('home'));
});

/* ---- Trip action buttons ---- */
document.querySelectorAll('.btn-complete-trip').forEach(btn => {
  btn.addEventListener('click', () => showScreen('earnings'));
});

/* ---- Bottom tab bar navigation ---- */
document.querySelectorAll('.tab-item[data-screen]').forEach(tab => {
  tab.addEventListener('click', function () {
    const parent = this.closest('.phone-screen');
    const targetScreen = this.dataset.screen;
    showScreen(targetScreen);
  });
});

/* ---- Registration steps ---- */
let currentRegStep = 1;
const totalRegSteps = 4;

function updateRegSteps() {
  document.querySelectorAll('.reg-step-dot').forEach((dot, i) => {
    dot.classList.remove('done', 'active');
    if (i + 1 < currentRegStep) dot.classList.add('done');
    if (i + 1 === currentRegStep) dot.classList.add('active');
  });
  const stepContents = document.querySelectorAll('.reg-step-content');
  stepContents.forEach((sc, i) => {
    sc.style.display = i + 1 === currentRegStep ? 'block' : 'none';
  });
  const stepCounter = document.querySelector('.reg-step-counter');
  if (stepCounter) stepCounter.textContent = `Step ${currentRegStep} of ${totalRegSteps}`;
}

document.querySelectorAll('.btn-reg-next').forEach(btn => {
  btn.addEventListener('click', () => {
    if (currentRegStep < totalRegSteps) { currentRegStep++; updateRegSteps(); }
    else showScreen('home');
  });
});
document.querySelectorAll('.btn-reg-prev').forEach(btn => {
  btn.addEventListener('click', () => {
    if (currentRegStep > 1) { currentRegStep--; updateRegSteps(); }
    else showScreen('login');
  });
});

/* ---- Countdown timer on trip request ---- */
function startCountdown(seconds, el) {
  if (!el) return;
  let remaining = seconds;
  el.textContent = remaining;
  const timer = setInterval(() => {
    remaining--;
    if (el) el.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(timer);
      showScreen('home');
    }
  }, 1000);
  return timer;
}

/* ---- Period tabs on earnings ---- */
document.querySelectorAll('.period-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    this.closest('.period-tabs').querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
  });
});

/* ---- Login → Home flow ---- */
document.querySelectorAll('.btn-login-submit').forEach(btn => {
  btn.addEventListener('click', () => showScreen('home'));
});
document.querySelectorAll('.btn-go-register').forEach(btn => {
  btn.addEventListener('click', () => showScreen('register'));
});
document.querySelectorAll('.btn-reg-back').forEach(btn => {
  btn.addEventListener('click', () => showScreen('login'));
});

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  showScreen('login');
  updateRegSteps();

  // Start countdown when request screen is shown
  const observer = new MutationObserver(() => {
    const reqScreen = document.querySelector('.phone-screen[data-screen="request"]');
    if (reqScreen && reqScreen.style.display !== 'none') {
      const cdEl = reqScreen.querySelector('.countdown-number');
      if (cdEl && cdEl.dataset.started !== 'true') {
        cdEl.dataset.started = 'true';
        startCountdown(25, cdEl);
      }
    }
  });
  screens.forEach(s => observer.observe(s, { attributes: true, attributeFilter: ['style'] }));
});
