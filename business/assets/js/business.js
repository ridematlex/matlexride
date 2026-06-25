/* =============================================
   MATLEX RIDE — Business Portal JS
   Talks to business/api/* over fetch(); token-based session.
   ============================================= */

const TOKEN_KEY = 'mlxBusinessToken';
const API_BASE  = 'api';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function saveToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res, body;
  try {
    res = await fetch(`${API_BASE}/${path}`, Object.assign({}, options, { headers }));
    body = await res.json();
  } catch (e) {
    return { ok: false, status: 0, body: { success: false, message: 'Network error — check your connection.' } };
  }
  if (res.status === 401) clearToken();
  return { ok: res.ok && body.success, status: res.status, body };
}
const apiGet  = (path)       => apiFetch(path, { method: 'GET' });
const apiPost = (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data || {}) });

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function fmt(n) { return Number(n || 0).toLocaleString(); }
function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function sameMonth(v) {
  if (!v) return false;
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function typeLabel(t) { return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
const INCOMING_TXN_TYPES = ['topup', 'payout_debit', 'refund'];

function getFilteredTxnData() {
  const from = document.getElementById('txnFromDate')?.value;
  const to = document.getElementById('txnToDate')?.value;
  if (!from && !to) return txnData;

  return txnData.filter(t => {
    const d = String(t.created_at).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

/* ---- Gate rendering ---- */
const gateScreen = document.getElementById('gateScreen');
const gateCard   = document.getElementById('gateCard');
const appShell   = document.getElementById('appShell');

function renderGate(state, business) {
  gateScreen.style.display = 'flex';
  appShell.style.display = 'none';

  if (state === 'pending') {
    gateCard.innerHTML = `
      <div class="gate-icon pending"><i class="fa-solid fa-hourglass-half"></i></div>
      <h2>Account Pending Approval</h2>
      <p>Thanks for registering <strong>${business.company_name}</strong> with Matlex Ride Business. Our team is reviewing your details and will activate your account shortly — usually within 1 business day.</p>
      <div class="gate-actions">
        <button class="gate-btn gate-btn-primary" id="gateRefreshBtn"><i class="fa-solid fa-rotate"></i> Refresh status</button>
        <button class="gate-btn gate-btn-outline" id="gateLogoutBtn"><i class="fa-solid fa-arrow-left"></i> Back to sign in</button>
      </div>
    `;
    document.getElementById('gateLogoutBtn').addEventListener('click', () => { clearToken(); window.location.href = '../pages/login.html'; });
    document.getElementById('gateRefreshBtn').addEventListener('click', () => boot());
    return;
  }

  if (state === 'rejected') {
    gateCard.innerHTML = `
      <div class="gate-icon denied"><i class="fa-solid fa-circle-xmark"></i></div>
      <h2>Account Not Approved</h2>
      <p>We weren't able to approve <strong>${business.company_name}</strong> for a Matlex Ride Business account. Please contact our business team for more details.</p>
      <div class="gate-actions">
        <a href="../pages/contact.html" class="gate-btn gate-btn-primary"><i class="fa-solid fa-headset"></i> Contact Support</a>
        <button class="gate-btn gate-btn-outline" id="gateLogoutBtn"><i class="fa-solid fa-arrow-left"></i> Back to sign in</button>
      </div>
    `;
    document.getElementById('gateLogoutBtn').addEventListener('click', () => { clearToken(); window.location.href = '../pages/login.html'; });
    return;
  }

  // No session at all
  gateCard.innerHTML = `
    <img src="../assets/images/Logo1.png" alt="Matlex Ride" class="gate-logo">
    <div class="gate-icon signin"><i class="fa-solid fa-building-lock"></i></div>
    <h2>Business Portal Access</h2>
    <p>This portal is only available to Matlex Ride business accounts that have been approved by our team. Sign in to continue, or create a new account to get started.</p>
    <div class="gate-actions">
      <a href="../pages/login.html" class="gate-btn gate-btn-primary"><i class="fa-solid fa-right-to-bracket"></i> Sign In</a>
      <a href="../pages/business.html" class="gate-btn gate-btn-outline"><i class="fa-solid fa-building"></i> Create a Business Account</a>
    </div>
  `;
}

/* ---- Live data (populated from the API) ---- */
let business = null;
let staffData = [];
let historyTrips = [];
let scheduledTrips = [];
let txnData = [];
let payoutStaff = null;
let selectedStaffId = null;
let activeStaffTab = 'details';

function statusPill(status) {
  const map = {
    completed: 'pill-success', active: 'pill-success', upcoming: 'pill-info',
    cancelled: 'pill-danger', suspended: 'pill-danger', pending: 'pill-warning',
  };
  const cls = map[status] || 'pill-secondary';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status-pill ${cls}">${label}</span>`;
}

function emptyRow(colspan, icon, text) {
  return `<tr class="table-empty-row"><td colspan="${colspan}"><i class="fa-solid ${icon}"></i>${text}</td></tr>`;
}

function ridesThisMonthFor(staffId) {
  return historyTrips.filter(t => t.staff_id === staffId && t.status === 'completed' && sameMonth(t.scheduled_at)).length;
}

/* ---- Staff List: master-detail workspace ---- */
function renderStaffWorkspace() {
  renderStaffListPanel();
  renderStaffDetailPanel();
}

function renderStaffListPanel() {
  const scroll = document.getElementById('staffListScroll');
  if (!scroll) return;

  if (!staffData.length) {
    scroll.innerHTML = `<div class="table-empty-row"><i class="fa-solid fa-users"></i>No staff added yet — invite your first team member.</div>`;
    return;
  }

  const q = (document.getElementById('staffSearch')?.value || '').toLowerCase();
  const filtered = staffData.filter(s => !q || `${s.name} ${s.phone}`.toLowerCase().includes(q));

  if (!filtered.length) {
    scroll.innerHTML = `<div class="table-empty-row"><i class="fa-solid fa-magnifying-glass"></i>No staff match your search.</div>`;
    return;
  }

  scroll.innerHTML = filtered.map(s => `
    <div class="staff-list-item ${s.id === selectedStaffId ? 'active' : ''}" data-staff-id="${s.id}">
      <div class="user-avatar">${initials(s.name)}</div>
      <div>
        <div class="user-name-cell">${s.name}</div>
        <div class="user-sub-cell">${s.phone}</div>
      </div>
    </div>
  `).join('');

  scroll.querySelectorAll('.staff-list-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedStaffId = parseInt(item.dataset.staffId, 10);
      activeStaffTab = 'details';
      renderStaffWorkspace();
    });
  });
}

function renderStaffDetailPanel() {
  const panel = document.getElementById('staffDetailPanel');
  if (!panel) return;

  const staff = staffData.find(s => s.id === selectedStaffId);
  if (!staff) {
    panel.innerHTML = `
      <div class="staff-detail-empty">
        <i class="fa-solid fa-user-group"></i>
        <p>Select a staff member from the list to view their details, trips, and transactions.</p>
      </div>`;
    return;
  }

  const nameParts = staff.name.trim().split(/\s+/);
  const firstName = nameParts[0] || '—';
  const lastName = nameParts.slice(1).join(' ') || '—';

  let bodyHtml = '';
  if (activeStaffTab === 'trips') {
    const trips = [...historyTrips, ...scheduledTrips]
      .filter(t => t.staff_id === staff.id)
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
    bodyHtml = trips.length ? `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Route</th><th class="hide-mobile">Date</th><th>Fare</th><th>Status</th></tr></thead>
          <tbody>
            ${trips.map(t => `
              <tr>
                <td style="font-size:12px;">${t.pickup_address} → ${t.dropoff_address}</td>
                <td class="hide-mobile">${formatDateTime(t.scheduled_at)}</td>
                <td style="font-weight:600;">UGX ${t.fare !== null ? fmt(t.fare) : '—'}</td>
                <td>${statusPill(t.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="table-empty-row"><i class="fa-solid fa-route"></i>No trips for this staff member yet.</div>`;
  } else if (activeStaffTab === 'transactions') {
    const INCOMING = ['topup', 'payout_debit', 'refund'];
    const txns = txnData.filter(t => t.staff_id === staff.id);
    bodyHtml = txns.length ? `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Type</th><th class="hide-mobile">Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${txns.map(t => {
              const credit = INCOMING.includes(t.type);
              return `
              <tr>
                <td>${typeLabel(t.type)}</td>
                <td class="hide-mobile">${formatDateTime(t.created_at)}</td>
                <td style="font-weight:600;color:${credit ? 'var(--success)' : 'var(--text-strong)'};">${credit ? '+' : '-'}UGX ${fmt(t.amount)}</td>
                <td>${statusPill(t.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="table-empty-row"><i class="fa-solid fa-receipt"></i>No transactions for this staff member yet.</div>`;
  } else {
    bodyHtml = `
      <div class="staff-wallet-line">
        <span>Wallet Balance</span>
        <strong>UGX ${fmt(staff.wallet_balance)}</strong>
      </div>
      <div class="staff-info-grid">
        <div><label>First Name</label><div class="staff-info-value">${firstName}</div></div>
        <div><label>Last Name</label><div class="staff-info-value">${lastName}</div></div>
        <div><label>Phone Number</label><div class="staff-info-value">${staff.phone}</div></div>
        <div><label>Email</label><div class="staff-info-value">${staff.email || '—'}</div></div>
        <div><label>Department</label><div class="staff-info-value">${staff.department || '—'}</div></div>
        <div><label>Status</label><div class="staff-info-value">${statusPill(staff.status)}</div></div>
        <div><label>Date Added</label><div class="staff-info-value">${formatDateTime(staff.created_at)}</div></div>
      </div>
      <div class="staff-detail-actions">
        <button class="btn-outline-brand staff-edit-btn" data-staff-id="${staff.id}"><i class="fa-solid fa-pen me-2"></i>Edit</button>
        <button class="btn-outline-brand staff-remove-btn" data-staff-id="${staff.id}" style="color:var(--danger);border-color:var(--danger);"><i class="fa-solid fa-trash me-2"></i>Remove</button>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="staff-detail-banner">
      <div class="staff-detail-avatar">${initials(staff.name)}</div>
      <div class="staff-detail-name">
        <div class="staff-detail-name-text">${staff.name}</div>
        <div class="staff-detail-name-sub">${staff.phone}</div>
      </div>
      <button class="btn-brand staff-topup-btn" data-staff-id="${staff.id}"><i class="fa-solid fa-wallet me-2"></i>Top-Up</button>
    </div>
    <div class="staff-detail-tabs">
      <div class="staff-tab ${activeStaffTab === 'details' ? 'active' : ''}" data-tab="details">Staff Details</div>
      <div class="staff-tab ${activeStaffTab === 'trips' ? 'active' : ''}" data-tab="trips">Trips</div>
      <div class="staff-tab ${activeStaffTab === 'transactions' ? 'active' : ''}" data-tab="transactions">Transactions</div>
    </div>
    <div class="staff-detail-body">${bodyHtml}</div>
  `;

  panel.querySelectorAll('.staff-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeStaffTab = tab.dataset.tab;
      renderStaffDetailPanel();
    });
  });

  panel.querySelector('.staff-topup-btn')?.addEventListener('click', () => openPayoutModalForStaff(staff.id));
  panel.querySelector('.staff-edit-btn')?.addEventListener('click', () => openEditStaffModal(staff.id));
  panel.querySelector('.staff-remove-btn')?.addEventListener('click', () => handleRemoveStaff(staff.id));
}

function renderTxnTable() {
  const txnBody = document.querySelector('#txnTable tbody');
  if (!txnBody) return;
  const filtered = getFilteredTxnData();
  txnBody.innerHTML = filtered.length ? filtered.map(t => {
    const credit = INCOMING_TXN_TYPES.includes(t.type);
    return `
      <tr>
        <td style="font-weight:600;color:var(--brand);">#${t.id}</td>
        <td>${typeLabel(t.type)}</td>
        <td class="hide-mobile">${formatDateTime(t.created_at)}</td>
        <td style="font-weight:600;color:${credit ? 'var(--success)' : 'var(--text-strong)'};">${credit ? '+' : '-'}UGX ${fmt(t.amount)}</td>
        <td>${statusPill(t.status)}</td>
      </tr>`;
  }).join('') : emptyRow(5, 'fa-receipt', txnData.length ? 'No transactions in this period.' : 'No transactions yet.');
}

function exportTxnCsv() {
  const filtered = getFilteredTxnData();
  if (!filtered.length) { showToast('No transactions to export for this period.', 'fa-triangle-exclamation'); return; }

  const rows = [['Transaction ID', 'Type', 'Staff', 'Date', 'Amount (UGX)', 'Reason', 'Status']];
  filtered.forEach(t => {
    rows.push([t.id, typeLabel(t.type), t.staff_name || '', t.created_at, t.amount, t.reason || '', t.status]);
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');

  const from = document.getElementById('txnFromDate')?.value;
  const to = document.getElementById('txnToDate')?.value;
  const suffix = (from || to) ? `_${from || 'start'}_to_${to || 'now'}` : '_all';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `matlex-transactions${suffix}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderTables() {
  renderStaffWorkspace();

  // Rides table (full)
  const ridesBody = document.querySelector('#ridesTable tbody');
  if (ridesBody) {
    ridesBody.innerHTML = historyTrips.length ? historyTrips.map(r => `
      <tr>
        <td style="font-weight:600;color:var(--brand);">#${r.id}</td>
        <td>${r.staff_name || '—'}</td>
        <td style="font-size:12px;">${r.pickup_address} → ${r.dropoff_address}</td>
        <td class="hide-mobile">${formatDateTime(r.scheduled_at)}</td>
        <td style="font-weight:600;">UGX ${r.fare !== null ? fmt(r.fare) : '—'}</td>
        <td>${statusPill(r.status)}</td>
      </tr>
    `).join('') : emptyRow(6, 'fa-route', 'No rides booked yet.');
  }

  // Dashboard mini rides table (top 4)
  const dashRidesBody = document.querySelector('#dashRidesTable tbody');
  if (dashRidesBody) {
    dashRidesBody.innerHTML = historyTrips.length ? historyTrips.slice(0, 4).map(r => `
      <tr>
        <td>${r.staff_name || '—'}</td>
        <td style="font-size:12px;">${r.pickup_address} → ${r.dropoff_address}</td>
        <td class="hide-mobile">${formatDateTime(r.scheduled_at)}</td>
        <td style="font-weight:600;">UGX ${r.fare !== null ? fmt(r.fare) : '—'}</td>
        <td>${statusPill(r.status)}</td>
      </tr>
    `).join('') : emptyRow(5, 'fa-route', 'No rides yet.');
  }

  renderTxnTable();

  // Dashboard mini transactions table (top 4)
  const dashTxnBody = document.querySelector('#dashTxnTable tbody');
  if (dashTxnBody) {
    dashTxnBody.innerHTML = txnData.length ? txnData.slice(0, 4).map(t => {
      const credit = INCOMING_TXN_TYPES.includes(t.type);
      return `
      <tr>
        <td>${typeLabel(t.type)}</td>
        <td>${formatDateTime(t.created_at)}</td>
        <td style="font-weight:600;color:${credit ? 'var(--success)' : 'var(--text-strong)'};">${credit ? '+' : '-'}UGX ${fmt(t.amount)}</td>
      </tr>`;
    }).join('') : emptyRow(3, 'fa-receipt', 'No transactions yet.');
  }

  // Scheduled trips table
  const schedBody = document.querySelector('#scheduledTable tbody');
  if (schedBody) {
    schedBody.innerHTML = scheduledTrips.length ? scheduledTrips.map(s => `
      <tr>
        <td>${s.staff_name || '—'}</td>
        <td style="font-size:12px;">${s.pickup_address}</td>
        <td style="font-size:12px;">${s.dropoff_address}</td>
        <td class="hide-mobile">${formatDateTime(s.scheduled_at)}</td>
        <td>${statusPill(s.status)}</td>
        <td>${s.status === 'upcoming' ? `<i class="fa-solid fa-xmark cancel-trip-trigger" data-trip-id="${s.id}" style="color:var(--danger);cursor:pointer;"></i>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}</td>
      </tr>
    `).join('') : emptyRow(6, 'fa-calendar-check', 'No trips scheduled yet.');
  }

  // Dashboard secondary stats (derived from the data above)
  const totalRidesEl = document.getElementById('statTotalRides');
  if (totalRidesEl) totalRidesEl.textContent = fmt(historyTrips.length + scheduledTrips.length);
  const spendMonthEl = document.getElementById('statSpendMonth');
  if (spendMonthEl) {
    const spend = historyTrips.filter(t => t.status === 'completed' && sameMonth(t.scheduled_at)).reduce((sum, t) => sum + (t.fare || 0), 0);
    spendMonthEl.textContent = fmt(spend);
  }
  const scheduledCountEl = document.getElementById('statScheduledCount');
  if (scheduledCountEl) scheduledCountEl.textContent = fmt(scheduledTrips.length);

  // Transactions page summary stats (respect the active date filter)
  const filteredTxn = getFilteredTxnData();
  const toppedUpEl = document.getElementById('statToppedUp');
  if (toppedUpEl) toppedUpEl.textContent = fmt(filteredTxn.filter(t => t.type === 'topup').reduce((sum, t) => sum + t.amount, 0));
  const totalSpentEl = document.getElementById('statTotalSpent');
  if (totalSpentEl) totalSpentEl.textContent = fmt(filteredTxn.filter(t => ['payout_credit', 'ride_payment'].includes(t.type)).reduce((sum, t) => sum + t.amount, 0));

  // Sidebar badges
  const navStaffBadge = document.getElementById('navStaffBadge');
  if (navStaffBadge) navStaffBadge.textContent = staffData.length;
  const navScheduledBadge = document.getElementById('navScheduledBadge');
  if (navScheduledBadge) navScheduledBadge.textContent = scheduledTrips.length;
}

async function loadDashboardData() {
  const [staffRes, historyRes, scheduledRes, txnRes] = await Promise.all([
    apiGet('staff/list.php'),
    apiGet('trips/history.php'),
    apiGet('trips/scheduled.php'),
    apiGet('transactions/list.php'),
  ]);
  staffData      = staffRes.ok     ? staffRes.body.data.staff           : [];
  historyTrips   = historyRes.ok   ? historyRes.body.data.trips         : [];
  scheduledTrips = scheduledRes.ok ? scheduledRes.body.data.trips       : [];
  txnData        = txnRes.ok       ? txnRes.body.data.transactions     : [];
  renderTables();
}

/* ---- Toast ---- */
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

/* ---- Staff actions: edit / remove ---- */
let editStaffModal = null;

function openEditStaffModal(id) {
  const s = staffData.find(x => x.id === id);
  if (!s || !editStaffModal) return;
  document.getElementById('editStaffId').value = s.id;
  document.getElementById('editStaffName').value = s.name;
  document.getElementById('editStaffPhone').value = s.phone;
  document.getElementById('editStaffDept').value = s.department || '';
  document.getElementById('editStaffStatus').value = s.status;
  editStaffModal.show();
}

async function handleRemoveStaff(id) {
  const s = staffData.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Remove ${s.name} from your staff list?`)) return;

  const { ok, body } = await apiPost('staff/remove.php', { staff_id: id });
  if (!ok) { showToast(body.message || 'Failed to remove staff member.', 'fa-triangle-exclamation'); return; }
  showToast('Staff member removed.', 'fa-circle-check');
  await loadDashboardData();
}

/* ---- Payout modal ---- */
const REASON_OPTIONS = {
  debit:  ['Staff Wallet Deduction'],
  credit: ['Staff Wallet Top Up', 'Salary Payment', 'Bonus Payment', 'Expense Reimbursement'],
};

function renderReasonOptions(type) {
  const list = document.getElementById('reasonOptionsList');
  if (!list) return;
  list.innerHTML = REASON_OPTIONS[type].map(r => `<div class="reason-option">${r}</div>`).join('');
  list.querySelectorAll('.reason-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.getElementById('reasonDropdownText').textContent = opt.textContent;
      document.getElementById('reasonDropdownText').style.color = 'var(--text-strong)';
      document.getElementById('reasonDropdown').classList.remove('open');
    });
  });
}

let payoutModal = null;

function openPayoutModalForStaff(id) {
  const payoutModalEl = document.getElementById('payoutModal');
  if (!payoutModalEl || !payoutModal) return;

  payoutStaff = staffData.find(s => s.id === id);
  if (!payoutStaff) return;
  document.getElementById('payoutSubject').textContent = `${payoutStaff.name} · ${payoutStaff.phone}`;
  document.getElementById('payoutBannerName').textContent = `${payoutStaff.name}'s`;
  document.getElementById('payoutAmount').value = '';
  document.getElementById('reasonDropdownText').textContent = 'Select or type reason';
  document.getElementById('reasonDropdownText').style.color = 'rgba(15,23,42,.4)';
  payoutModalEl.querySelectorAll('input[name="payoutType"]').forEach(r => r.checked = r.value === 'debit');
  payoutModalEl.querySelectorAll('.radio-pill').forEach(label => label.classList.toggle('checked', label.querySelector('input').checked));
  document.getElementById('payoutBannerVerb').textContent = 'debit';
  renderReasonOptions('debit');
  payoutModal.show();
}

function wirePayoutModal() {
  const payoutModalEl = document.getElementById('payoutModal');
  payoutModal = payoutModalEl ? new bootstrap.Modal(payoutModalEl) : null;

  // Radio pill styling + dependent UI
  payoutModalEl?.querySelectorAll('.radio-pill input').forEach(input => {
    input.addEventListener('change', () => {
      const group = input.closest('.radio-pill-group');
      group.querySelectorAll('.radio-pill').forEach(label => label.classList.toggle('checked', label.querySelector('input').checked));
      if (input.name === 'payoutType') {
        document.getElementById('payoutBannerVerb').textContent = input.value;
        renderReasonOptions(input.value);
        document.getElementById('reasonDropdownText').textContent = 'Select or type reason';
        document.getElementById('reasonDropdownText').style.color = 'rgba(15,23,42,.4)';
      }
    });
  });

  // Reason dropdown open/close
  const reasonDropdown = document.getElementById('reasonDropdown');
  document.getElementById('reasonDropdownInput')?.addEventListener('click', () => reasonDropdown.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (reasonDropdown && !reasonDropdown.contains(e.target)) reasonDropdown.classList.remove('open');
  });
  document.getElementById('reasonAddCustom')?.addEventListener('click', () => {
    const text = prompt('Enter a custom reason:');
    if (text) {
      document.getElementById('reasonDropdownText').textContent = text;
      document.getElementById('reasonDropdownText').style.color = 'var(--text-strong)';
    }
    reasonDropdown.classList.remove('open');
  });

  document.getElementById('confirmPayoutBtn')?.addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('payoutAmount').value, 10);
    if (!amount || amount < 1000) { showToast('Enter a valid payout amount.', 'fa-triangle-exclamation'); return; }
    if (!payoutStaff) return;
    const type = payoutModalEl.querySelector('input[name="payoutType"]:checked').value;
    const reasonText = document.getElementById('reasonDropdownText').textContent;
    const reason = reasonText === 'Select or type reason' ? null : reasonText;

    const { ok, body } = await apiPost('transactions/payout.php', { staff_id: payoutStaff.id, type, amount, reason });
    if (!ok) { showToast(body.message || 'Payout failed.', 'fa-triangle-exclamation'); return; }

    business.wallet_balance = body.data.business_wallet_balance;
    refreshProfileUI(business);
    payoutModal.hide();
    await loadDashboardData();
    showToast(`UGX ${fmt(amount)} ${type === 'debit' ? 'debited from' : 'credited to'} ${payoutStaff.name}'s wallet.`, 'fa-circle-check');
  });
}

/* ---- Invite Staff / Edit Staff / Schedule Trip modals ---- */
function toMysqlDateTime(localValue) {
  // datetime-local gives "YYYY-MM-DDTHH:MM" — MySQL DATETIME needs a space + seconds
  return localValue.replace('T', ' ') + ':00';
}

function wireStaffAndTripModals() {
  const inviteModalEl = document.getElementById('inviteStaffModal');
  const inviteModal = inviteModalEl ? new bootstrap.Modal(inviteModalEl) : null;
  const editModalEl = document.getElementById('editStaffModal');
  editStaffModal = editModalEl ? new bootstrap.Modal(editModalEl) : null;
  const scheduleModalEl = document.getElementById('scheduleTripModal');
  const scheduleModal = scheduleModalEl ? new bootstrap.Modal(scheduleModalEl) : null;

  document.getElementById('inviteStaffBtn')?.addEventListener('click', () => {
    document.getElementById('inviteStaffForm').reset();
    inviteModal && inviteModal.show();
  });

  document.getElementById('inviteStaffForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('inviteStaffName').value.trim();
    const phone = document.getElementById('inviteStaffPhone').value.trim();

    const { ok, body } = await apiPost('staff/invite.php', { name, phone });
    if (!ok) { showToast(body.message || 'Failed to add staff member.', 'fa-triangle-exclamation'); return; }
    inviteModal.hide();
    showToast(`${name} added to your staff list.`, 'fa-circle-check');
    await loadDashboardData();
  });

  document.getElementById('editStaffForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const staff_id = parseInt(document.getElementById('editStaffId').value, 10);
    const name = document.getElementById('editStaffName').value.trim();
    const phone = document.getElementById('editStaffPhone').value.trim();
    const department = document.getElementById('editStaffDept').value.trim();
    const status = document.getElementById('editStaffStatus').value;

    const { ok, body } = await apiPost('staff/update.php', { staff_id, name, phone, department, status });
    if (!ok) { showToast(body.message || 'Failed to update staff member.', 'fa-triangle-exclamation'); return; }
    editStaffModal.hide();
    showToast('Staff member updated.', 'fa-circle-check');
    await loadDashboardData();
  });

  document.getElementById('scheduleTripBtn')?.addEventListener('click', () => {
    document.getElementById('scheduleTripForm').reset();
    const select = document.getElementById('scheduleStaffSelect');
    select.innerHTML = '<option value="">No specific staff member</option>' +
      staffData.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    scheduleModal && scheduleModal.show();
  });

  document.getElementById('scheduleTripForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const staff_id = document.getElementById('scheduleStaffSelect').value || null;
    const pickup_address = document.getElementById('schedulePickup').value.trim();
    const dropoff_address = document.getElementById('scheduleDropoff').value.trim();
    const scheduled_at = toMysqlDateTime(document.getElementById('scheduleWhen').value);
    const ride_type = document.getElementById('scheduleRideType').value;
    const fareVal = document.getElementById('scheduleFare').value;
    const fare = fareVal ? parseInt(fareVal, 10) : null;

    const { ok, body } = await apiPost('trips/schedule.php', { staff_id, pickup_address, dropoff_address, scheduled_at, ride_type, fare });
    if (!ok) { showToast(body.message || 'Failed to schedule trip.', 'fa-triangle-exclamation'); return; }
    scheduleModal.hide();
    showToast('Trip scheduled successfully.', 'fa-circle-check');
    await loadDashboardData();
  });
}

/* ---- App shell wiring (runs once per boot) ---- */
let wired = false;
function wireAppShell() {
  if (wired) return;
  wired = true;

  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('sidebarToggle');

  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
  toggleBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  overlay.addEventListener('click', closeSidebar);

  const navLinks = document.querySelectorAll('[data-page]');
  const pages = document.querySelectorAll('.page-section');
  const pageTitle = document.getElementById('pageTitle');
  const pageTitles = {
    dashboard: 'Dashboard', staff: 'Staff List', rides: 'Ride History',
    transactions: 'Transactions', scheduled: 'Scheduled Trips', reports: 'Reports', settings: 'Settings',
  };

  function navigateTo(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (!target) return;
    target.classList.add('active');
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === pageId));
    if (pageTitle) pageTitle.textContent = pageTitles[pageId] || pageId;
    if (window.innerWidth < 992) closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (location.hash !== '#' + pageId) history.replaceState(null, '', '#' + pageId);
  }
  navLinks.forEach(l => l.addEventListener('click', () => navigateTo(l.dataset.page)));
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && pageTitles[id]) navigateTo(id);
  });

  document.querySelectorAll('[data-page-link]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.pageLink));
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await apiPost('auth/logout.php');
    clearToken();
    window.location.href = '../pages/login.html';
  });

  wireStaffAndTripModals();

  document.querySelector('#scheduledTable')?.addEventListener('click', async e => {
    const cancelBtn = e.target.closest('.cancel-trip-trigger');
    if (!cancelBtn) return;
    if (!confirm('Cancel this scheduled trip?')) return;

    const { ok, body } = await apiPost('trips/cancel.php', { trip_id: parseInt(cancelBtn.dataset.tripId, 10) });
    if (!ok) { showToast(body.message || 'Failed to cancel trip.', 'fa-triangle-exclamation'); return; }
    showToast('Trip cancelled.', 'fa-circle-check');
    await loadDashboardData();
  });

  document.getElementById('staffSearch')?.addEventListener('input', renderStaffListPanel);

  document.getElementById('txnFromDate')?.addEventListener('change', renderTables);
  document.getElementById('txnToDate')?.addEventListener('change', renderTables);
  document.getElementById('txnClearFilterBtn')?.addEventListener('click', () => {
    document.getElementById('txnFromDate').value = '';
    document.getElementById('txnToDate').value = '';
    renderTables();
  });
  document.getElementById('txnExportBtn')?.addEventListener('click', exportTxnCsv);

  document.getElementById('settingsForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const company_name = document.getElementById('settingsCompanyName').value.trim();
    const phone = document.getElementById('settingsPhone')?.value.trim() || '';
    const tin = document.getElementById('settingsTin')?.value.trim() || '';
    const address = document.getElementById('settingsAddress')?.value.trim() || '';

    const { ok, body } = await apiPost('profile/update.php', { company_name, phone, tin, address });
    if (!ok) { showToast(body.message || 'Failed to update profile.', 'fa-triangle-exclamation'); return; }

    business.company_name = company_name || business.company_name;
    business.phone = phone; business.tin = tin; business.address = address;
    refreshProfileUI(business);
    showToast('Company profile updated.', 'fa-circle-check');
  });

  wirePayoutModal();

  const initialId = location.hash.replace('#', '');
  navigateTo(pageTitles[initialId] ? initialId : 'dashboard');
}

function refreshProfileUI(b) {
  const ini = initials(b.company_name);
  document.getElementById('profileCompanyName').textContent = b.company_name;
  document.getElementById('profileAvatar').textContent = ini;
  document.getElementById('sidebarCompanyName').textContent = b.company_name;
  document.getElementById('sidebarCompanyAvatar').textContent = ini;
  document.getElementById('topbarAvatar').textContent = ini;
  document.getElementById('statWallet').textContent = fmt(b.wallet_balance);
  document.getElementById('statRides').textContent = fmt(b.rides_this_month);
  document.getElementById('statStaff').textContent = fmt(b.active_staff);
  document.getElementById('txnWalletBalance').textContent = fmt(b.wallet_balance);
  document.getElementById('navStaffBadge').textContent = b.active_staff;
  document.getElementById('settingsCompanyName').value = b.company_name;
  document.getElementById('settingsEmail').value = b.email;
  const phoneEl = document.getElementById('settingsPhone'); if (phoneEl) phoneEl.value = b.phone || '';
  const tinEl   = document.getElementById('settingsTin');   if (tinEl) tinEl.value = b.tin || '';
  const addrEl  = document.getElementById('settingsAddress'); if (addrEl) addrEl.value = b.address || '';
}

/* ---- Boot ---- */
async function boot() {
  const token = getToken();
  if (!token) { renderGate('none'); return; }

  const { ok, body } = await apiGet('auth/me.php');
  if (!ok) { clearToken(); renderGate('none'); return; }

  business = body.data.business;

  if (business.status === 'pending')  { renderGate('pending', business); return; }
  if (business.status === 'rejected') { renderGate('rejected', business); return; }

  gateScreen.style.display = 'none';
  appShell.style.display = 'block';
  refreshProfileUI(business);
  await loadDashboardData();
  wireAppShell();
}

document.addEventListener('DOMContentLoaded', boot);
