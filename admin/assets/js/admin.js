/* =============================================
   MATLEX RIDE - Admin Panel JS
   ============================================= */

/* ---- Sidebar toggle ---- */
const sidebar  = document.getElementById('sidebar');
const overlay  = document.getElementById('sidebarOverlay');
const toggleBtn = document.getElementById('sidebarToggle');

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('show');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
toggleBtn.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay.addEventListener('click', closeSidebar);

/* ---- Page navigation ---- */
const navLinks   = document.querySelectorAll('[data-page]');
const pages      = document.querySelectorAll('.page-section');
const mobileNavItems = document.querySelectorAll('.mobile-nav-item[data-page]');
const pageTitle  = document.getElementById('pageTitle');

const pageTitles = {
  dashboard:  'Dashboard',
  drivers:    'Drivers',
  passengers: 'Passengers',
  trips:      'Trips',
  business:   'Business Accounts',
  payments:   'Payments',
  reports:    'Reports',
  settings:   'Settings',
};

function navigateTo(pageId) {
  // hide all pages
  pages.forEach(p => p.classList.remove('active'));
  // show target
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  // update nav links active state
  navLinks.forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageId);
  });
  mobileNavItems.forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageId);
  });

  // update topbar title
  if (pageTitle) pageTitle.textContent = pageTitles[pageId] || pageId;

  // close sidebar on mobile after nav
  if (window.innerWidth < 992) closeSidebar();

  if (pageId === 'business') loadBusinesses();
}

navLinks.forEach(l => l.addEventListener('click', () => navigateTo(l.dataset.page)));
mobileNavItems.forEach(l => l.addEventListener('click', () => navigateTo(l.dataset.page)));

/* ---- Business Accounts (real data via business/api/admin) ---- */
// Stopgap key until the admin panel has its own real login/session system.
// Must match ADMIN_API_KEY in config.php.
const ADMIN_API_KEY = 'mx_admin_change_in_prod_2025';
const BUSINESS_API_BASE = '../business/api/admin';

let businessAccounts = [];

async function adminApiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_API_KEY }, options.headers || {});
  let res, body;
  try {
    res = await fetch(`${BUSINESS_API_BASE}/${path}`, Object.assign({}, options, { headers }));
    body = await res.json();
  } catch (e) {
    return { ok: false, body: { success: false, message: 'Network error — check your connection.' } };
  }
  return { ok: res.ok && body.success, body };
}

function bizStatusPill(status) {
  const map = { pending: 'pill-warning', approved: 'pill-success', rejected: 'pill-danger' };
  const cls = map[status] || 'pill-secondary';
  return `<span class="status-pill ${cls}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

function bizInitials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatBizDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, icon) {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const el = document.createElement('div');
  el.style.cssText = 'background:#1e1b2e;color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;';
  el.innerHTML = `<i class="fa-solid ${icon || 'fa-circle-check'}" style="color:#D946EF;"></i><span>${message}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

function renderBusinessTable() {
  const tbody = document.querySelector('#businessTable tbody');
  if (!tbody) return;

  const q = (document.getElementById('bizSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('bizStatusFilter')?.value || '';

  const filtered = businessAccounts.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false;
    if (q && !(`${b.company_name} ${b.email}`.toLowerCase().includes(q))) return false;
    return true;
  });

  tbody.innerHTML = filtered.length ? filtered.map(b => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar" style="width:36px;height:36px;border-radius:50%;background:#7367f0;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700;flex-shrink:0;">${bizInitials(b.company_name)}</div>
          <div><div class="user-name-cell">${b.company_name}</div><div class="user-sub-cell">${b.email}</div></div>
        </div>
      </td>
      <td class="hide-mobile">${b.phone || '—'}</td>
      <td>UGX ${Number(b.wallet_balance).toLocaleString()}</td>
      <td>${bizStatusPill(b.status)}</td>
      <td class="hide-mobile">${formatBizDate(b.created_at)}</td>
      <td>
        ${b.status === 'pending' ? `
          <button class="btn btn-sm biz-approve-btn" data-id="${b.id}" style="background:rgba(40,199,111,.12);color:#28c76f;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:4px 10px;margin-right:4px;">Approve</button>
          <button class="btn btn-sm biz-reject-btn" data-id="${b.id}" style="background:rgba(234,84,85,.12);color:#ea5455;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:4px 10px;">Reject</button>
        ` : b.status === 'approved' ? `
          <button class="btn btn-sm biz-topup-btn" data-id="${b.id}" style="background:rgba(115,103,240,.12);color:#7367f0;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:4px 10px;margin-right:4px;"><i class="fa-solid fa-wallet me-1"></i>Top Up</button>
          <button class="btn btn-sm biz-txn-btn" data-id="${b.id}" style="background:rgba(0,207,232,.12);color:#00838f;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:4px 10px;"><i class="fa-solid fa-receipt me-1"></i>Transactions</button>
          <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">Approved ${formatBizDate(b.approved_at)}</span>
        ` : `<span style="font-size:12px;color:var(--text-muted);">Rejected</span>`}
      </td>
    </tr>
  `).join('') : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No business accounts match.</td></tr>`;

  const pending  = businessAccounts.filter(b => b.status === 'pending').length;
  const approved = businessAccounts.filter(b => b.status === 'approved').length;
  const rejected = businessAccounts.filter(b => b.status === 'rejected').length;
  document.getElementById('bizStatPending').textContent  = pending;
  document.getElementById('bizStatApproved').textContent = approved;
  document.getElementById('bizStatRejected').textContent = rejected;
  document.getElementById('bizStatTotal').textContent    = businessAccounts.length;

  const badge = document.getElementById('navBusinessBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? '' : 'none';
  }
}

async function loadBusinesses() {
  const { ok, body } = await adminApiFetch('list.php', { method: 'GET' });
  if (!ok) {
    const tbody = document.querySelector('#businessTable tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger);">${body.message || 'Failed to load business accounts.'}</td></tr>`;
    return;
  }
  businessAccounts = body.data.businesses;
  renderBusinessTable();
}

async function handleBizApprove(id) {
  const biz = businessAccounts.find(b => b.id === id);
  if (!biz || !confirm(`Approve ${biz.company_name}? They'll get full dashboard access immediately.`)) return;
  const { ok, body } = await adminApiFetch('approve.php', { method: 'POST', body: JSON.stringify({ business_id: id }) });
  if (!ok) { showToast(body.message || 'Failed to approve.', 'fa-triangle-exclamation'); return; }
  showToast(`${biz.company_name} approved.`, 'fa-circle-check');
  await loadBusinesses();
}

async function handleBizReject(id) {
  const biz = businessAccounts.find(b => b.id === id);
  if (!biz || !confirm(`Reject ${biz.company_name}? They will be signed out and blocked from the portal.`)) return;
  const { ok, body } = await adminApiFetch('reject.php', { method: 'POST', body: JSON.stringify({ business_id: id }) });
  if (!ok) { showToast(body.message || 'Failed to reject.', 'fa-triangle-exclamation'); return; }
  showToast(`${biz.company_name} rejected.`, 'fa-circle-check');
  await loadBusinesses();
}

let bizTopupModal = null;

function openBizTopupModal(id) {
  const biz = businessAccounts.find(b => b.id === id);
  if (!biz || !bizTopupModal) return;
  document.getElementById('bizTopupId').value = biz.id;
  document.getElementById('bizTopupSubject').textContent = `${biz.company_name} · ${biz.email}`;
  document.getElementById('bizTopupAmount').value = '';
  document.getElementById('bizTopupReason').value = '';
  bizTopupModal.show();
}

function wireBizTopupModal() {
  const bizTopupModalEl = document.getElementById('bizTopupModal');
  bizTopupModal = bizTopupModalEl ? new bootstrap.Modal(bizTopupModalEl) : null;

  document.getElementById('bizTopupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = parseInt(document.getElementById('bizTopupId').value, 10);
    const biz = businessAccounts.find(b => b.id === id);
    const amount = parseInt(document.getElementById('bizTopupAmount').value, 10);
    if (!amount || amount <= 0) { showToast('Enter a valid amount.', 'fa-triangle-exclamation'); return; }
    const reason = document.getElementById('bizTopupReason').value.trim();

    const { ok, body } = await adminApiFetch('topup.php', { method: 'POST', body: JSON.stringify({ business_id: id, amount, reason }) });
    if (!ok) { showToast(body.message || 'Failed to top up.', 'fa-triangle-exclamation'); return; }
    bizTopupModal.hide();
    showToast(`UGX ${amount.toLocaleString()} credited to ${biz.company_name}'s wallet.`, 'fa-circle-check');
    await loadBusinesses();
  });
}
wireBizTopupModal();

const BIZ_TXN_CREDIT_TYPES = ['topup', 'payout_debit', 'refund'];
const BIZ_TXN_TYPE_LABELS = {
  topup: 'Top Up',
  payout_debit: 'Payout (Debit)',
  payout_credit: 'Payout (Credit)',
  ride_payment: 'Ride Payment',
  refund: 'Refund',
  topup_reversal: 'Top-Up Reversal',
};

let bizTxnModal = null;
let bizTxnBusinessId = null;

function openBizTxnModal(id) {
  const biz = businessAccounts.find(b => b.id === id);
  if (!biz || !bizTxnModal) return;
  bizTxnBusinessId = id;
  document.getElementById('bizTxnSubject').textContent = `${biz.company_name} · ${biz.email}`;
  bizTxnModal.show();
  loadBizTransactions(id);
}

async function loadBizTransactions(businessId) {
  const tbody = document.querySelector('#bizTxnTable tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Loading…</td></tr>`;

  const { ok, body } = await adminApiFetch(`transactions.php?business_id=${businessId}`);
  if (!ok) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">${body.message || 'Failed to load transactions.'}</td></tr>`;
    return;
  }

  const txns = body.data.transactions || [];
  if (!txns.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No transactions yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = txns.map(t => {
    const isCredit = BIZ_TXN_CREDIT_TYPES.includes(t.type);
    const sign = isCredit ? '+' : '-';
    const color = isCredit ? '#28c76f' : '#ea5455';
    const canReverse = t.type === 'topup' && !t.is_reversed;
    return `
      <tr>
        <td>${BIZ_TXN_TYPE_LABELS[t.type] || t.type}</td>
        <td class="hide-mobile">${t.staff_name || '—'}</td>
        <td class="hide-mobile">${formatBizDate(t.created_at)}</td>
        <td style="color:${color};font-weight:600;">${sign} UGX ${Number(t.amount).toLocaleString()}</td>
        <td>${t.reason || '—'}</td>
        <td>
          ${canReverse
            ? `<button class="btn btn-sm biz-reverse-btn" data-id="${t.id}" style="background:rgba(234,84,85,.12);color:#ea5455;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:4px 10px;">Reverse</button>`
            : (t.is_reversed ? `<span style="font-size:11px;color:var(--text-muted);">Reversed</span>` : '—')}
        </td>
      </tr>`;
  }).join('');
}

async function handleReverseTransaction(txnId) {
  if (!confirm('Reverse this top-up? This will debit the wallet back and log a correction entry. The original transaction stays on record.')) return;
  const { ok, body } = await adminApiFetch('reverse.php', { method: 'POST', body: JSON.stringify({ transaction_id: txnId }) });
  if (!ok) { showToast(body.message || 'Failed to reverse top-up.', 'fa-triangle-exclamation'); return; }
  showToast('Top-up reversed.', 'fa-circle-check');
  if (bizTxnBusinessId) await loadBizTransactions(bizTxnBusinessId);
  await loadBusinesses();
}

function wireBizTxnModal() {
  const bizTxnModalEl = document.getElementById('bizTxnModal');
  bizTxnModal = bizTxnModalEl ? new bootstrap.Modal(bizTxnModalEl) : null;

  document.querySelector('#bizTxnTable')?.addEventListener('click', e => {
    const reverseBtn = e.target.closest('.biz-reverse-btn');
    if (reverseBtn) handleReverseTransaction(parseInt(reverseBtn.dataset.id, 10));
  });
}
wireBizTxnModal();

document.querySelector('#businessTable')?.addEventListener('click', e => {
  const approveBtn = e.target.closest('.biz-approve-btn');
  const rejectBtn  = e.target.closest('.biz-reject-btn');
  const topupBtn   = e.target.closest('.biz-topup-btn');
  const txnBtn     = e.target.closest('.biz-txn-btn');
  if (approveBtn) handleBizApprove(parseInt(approveBtn.dataset.id, 10));
  if (rejectBtn)  handleBizReject(parseInt(rejectBtn.dataset.id, 10));
  if (topupBtn)   openBizTopupModal(parseInt(topupBtn.dataset.id, 10));
  if (txnBtn)     openBizTxnModal(parseInt(txnBtn.dataset.id, 10));
});

document.getElementById('bizSearch')?.addEventListener('input', renderBusinessTable);
document.getElementById('bizStatusFilter')?.addEventListener('change', renderBusinessTable);
document.getElementById('bizRefreshBtn')?.addEventListener('click', loadBusinesses);

/* ---- Charts (Chart.js) ---- */
function initCharts() {
  // Earnings chart
  const earningsCtx = document.getElementById('earningsChart');
  if (earningsCtx) {
    new Chart(earningsCtx, {
      type: 'line',
      data: {
        labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        datasets: [{
          label: 'Revenue (UGX)',
          data: [2100000,2800000,2400000,3200000,3800000,4100000,3600000,4500000,4200000,5100000,4800000,5600000],
          borderColor: '#D946EF',
          backgroundColor: 'rgba(217,70,239,.08)',
          fill: true,
          tension: 0.45,
          pointBackgroundColor: '#D946EF',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(0,0,0,.04)' },
            ticks: {
              font: { size: 11 },
              callback: v => 'UGX ' + (v / 1000000).toFixed(1) + 'M'
            }
          }
        }
      }
    });
  }

  // Trips donut chart
  const tripsCtx = document.getElementById('tripsDonut');
  if (tripsCtx) {
    new Chart(tripsCtx, {
      type: 'doughnut',
      data: {
        labels: ['Completed','Cancelled','Pending','In Progress'],
        datasets: [{
          data: [68, 12, 10, 10],
          backgroundColor: ['#28c76f','#ea5455','#ff9f43','#00cfe8'],
          borderWidth: 0,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, boxWidth: 10, padding: 14 }
          }
        }
      }
    });
  }

  // Weekly trips bar chart
  const weeklyCtx = document.getElementById('weeklyTrips');
  if (weeklyCtx) {
    new Chart(weeklyCtx, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Trips',
          data: [42, 58, 51, 65, 78, 92, 55],
          backgroundColor: 'rgba(217,70,239,.85)',
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // Payments bar chart
  const paymentsCtx = document.getElementById('paymentsChart');
  if (paymentsCtx) {
    new Chart(paymentsCtx, {
      type: 'bar',
      data: {
        labels: ['Mobile Money','Cash','Card'],
        datasets: [{
          data: [65, 25, 10],
          backgroundColor: ['#7367f0','#ff9f43','#00cfe8'],
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(0,0,0,.04)' },
            ticks: { callback: v => v + '%' }
          }
        }
      }
    });
  }
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  navigateTo('dashboard');
  initCharts();
  loadBusinesses();

  // Animate stat numbers
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    let current = 0;
    const step = Math.ceil(target / 50);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString();
      if (current >= target) clearInterval(timer);
    }, 25);
  });
});
