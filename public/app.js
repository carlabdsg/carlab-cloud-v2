// ── CARLAB CLOUD V4 ── Frontend Logic ──────────────────────────────────────

const S = {
  token: localStorage.getItem('carlabToken') || '',
  user: null,
  garantias: [],
  users: [],
  companies: [],
  requests: [],
  schedules: [],
  units: [],
  policies: [],
  parts: [],
  campanas: [],
  currentEvidence: [],
  currentRefEvidence: [],
  drawing: false,
  hasSignature: false,
  activePanel: 'board',
  editingUnitId: '',
  editingPolicyId: '',
  editingUserId: '',
  editingCompanyId: '',
  editingCampanaId: '',
  currentUnitDashboardId: '',
};

// ── API ──────────────────────────────────────────────────────────────────────
const api = {
  async req(url, opts = {}) {
    const h = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData)) h['Content-Type'] = h['Content-Type'] || 'application/json';
    if (S.token) h.Authorization = `Bearer ${S.token}`;
    const r = await fetch(url, { ...opts, headers: h });
    const txt = await r.text();
    const data = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(data?.error || 'Error desconocido.');
    return data;
  },
  login: (e, p) => api.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password: p }) }),
  me: () => api.req('/api/auth/me'),
  pubCompanies: () => api.req('/api/public/companies'),
  register: d => api.req('/api/public/register-operator', { method: 'POST', body: JSON.stringify(d) }),
  getGarantias: () => api.req('/api/garantias'),
  createGarantia: d => api.req('/api/garantias', { method: 'POST', body: JSON.stringify(d) }),
  deleteGarantia: id => api.req(`/api/garantias/${id}`, { method: 'DELETE' }),
  reviewGarantia: (id, d) => api.req(`/api/garantias/${id}/review`, { method: 'PATCH', body: JSON.stringify(d) }),
  updateOp: (id, d) => api.req(`/api/garantias/${id}/operational`, { method: 'PATCH', body: JSON.stringify(d) }),
  requestSchedule: id => api.req(`/api/garantias/${id}/request-schedule`, { method: 'POST' }),
  getAudit: id => api.req(`/api/audit/${id}`),
  getUnitHistory: eco => api.req(`/api/history/unit/${encodeURIComponent(eco)}`),
  getSchedules: (date = '') => api.req(`/api/schedules${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  confirmSchedule: (id, d) => api.req(`/api/schedules/${id}/confirm`, { method: 'PATCH', body: JSON.stringify(d) }),
  getUsers: () => api.req('/api/users'),
  createUser: d => api.req('/api/users', { method: 'POST', body: JSON.stringify(d) }),
  updateUser: (id, d) => api.req(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deleteUser: id => api.req(`/api/users/${id}`, { method: 'DELETE' }),
  getCompanies: () => api.req('/api/companies'),
  createCompany: d => api.req('/api/companies', { method: 'POST', body: JSON.stringify(d) }),
  updateCompany: (id, d) => api.req(`/api/companies/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deactivateCompany: id => api.req(`/api/companies/${id}/deactivate`, { method: 'PATCH' }),
  deleteCompany: id => api.req(`/api/companies/${id}`, { method: 'DELETE' }),
  getRequests: () => api.req('/api/registration-requests'),
  updateRequest: (id, d) => api.req(`/api/registration-requests/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  getNotifications: () => api.req('/api/notifications'),
  getAnalytics: () => api.req('/api/analytics'),
  // Units
  getUnits: (empresa = '') => api.req(`/api/units${empresa ? `?empresa=${encodeURIComponent(empresa)}` : ''}`),
  createUnit: d => api.req('/api/units', { method: 'POST', body: JSON.stringify(d) }),
  updateUnit: (id, d) => api.req(`/api/units/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deleteUnit: id => api.req(`/api/units/${id}`, { method: 'DELETE' }),
  unitDashboard: id => api.req(`/api/units/${id}/dashboard`),
  // Parts
  getParts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.req(`/api/parts${q ? `?${q}` : ''}`);
  },
  createPart: d => api.req('/api/parts', { method: 'POST', body: JSON.stringify(d) }),
  deletePart: id => api.req(`/api/parts/${id}`, { method: 'DELETE' }),
  getPartsSummary: (empresa = '') => api.req(`/api/parts/summary${empresa ? `?empresa=${encodeURIComponent(empresa)}` : ''}`),
  // Policies
  getPolicies: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.req(`/api/policies${q ? `?${q}` : ''}`);
  },
  createPolicy: d => api.req('/api/policies', { method: 'POST', body: JSON.stringify(d) }),
  updatePolicy: (id, d) => api.req(`/api/policies/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deletePolicy: id => api.req(`/api/policies/${id}`, { method: 'DELETE' }),
  notifyPolicy: id => api.req(`/api/policies/${id}/notify`, { method: 'POST' }),
  // Campanas
  getCampanas: (empresa = '') => api.req(`/api/campanas${empresa ? `?empresa=${encodeURIComponent(empresa)}` : ''}`),
  createCampana: d => api.req('/api/campanas', { method: 'POST', body: JSON.stringify(d) }),
  updateCampana: (id, d) => api.req(`/api/campanas/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
const g = id => document.getElementById(id);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const fmtDate = v => v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDateOnly = v => v ? new Date(v).toLocaleDateString('es-MX') : '—';
const fmtMoney = n => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isRole = (...roles) => S.user && roles.includes(S.user.role);
const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
let toastTimer;
function toast(msg, type = 'success') {
  const el = g('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function fillSel(sel, opts, placeholder = 'Selecciona', val = '') {
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>` + opts.map(o => `<option value="${esc(o.nombre)}">${esc(o.nombre)}</option>`).join('');
  if (val) sel.value = val;
}
function badgeVal(ev) {
  return { 'nueva': 'badge-new', 'pendiente de revisión': 'badge-review', 'aceptada': 'badge-accepted', 'rechazada': 'badge-rejected' }[ev] || 'badge-info';
}
function badgeOp(ev) {
  return { 'sin iniciar': 'badge-info', 'en proceso': 'badge-progress', 'espera refacción': 'badge-waiting', 'terminada': 'badge-done' }[ev] || 'badge-info';
}
function countBy(arr, fn) {
  const m = new Map();
  arr.forEach(x => { const k = fn(x) || '—'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ── MODAL ────────────────────────────────────────────────────────────────────
function showModal(title, html) {
  g('modalTitle').textContent = title;
  g('modalBody').innerHTML = html;
  g('modal').classList.remove('hidden');
}
function closeModal() { g('modal').classList.add('hidden'); }
g('modal').addEventListener('click', e => { if (e.target === g('modal')) closeModal(); });
g('modalClose').addEventListener('click', closeModal);

// ── CANVAS FIRMA ─────────────────────────────────────────────────────────────
const canvas = g('firmaCanvas');
const ctx = canvas?.getContext('2d');
if (ctx) { ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#e8eaf0'; }
function resetSignature() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  S.hasSignature = false;
}
resetSignature();
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
}
function startDraw(e) { S.drawing = true; S.hasSignature = true; const { x, y } = pointerPos(e); ctx.beginPath(); ctx.moveTo(x, y); }
function moveDraw(e) { if (!S.drawing) return; e.preventDefault(); const { x, y } = pointerPos(e); ctx.lineTo(x, y); ctx.stroke(); }
function endDraw() { S.drawing = false; }
if (canvas) {
  ['mousedown', 'touchstart'].forEach(ev => canvas.addEventListener(ev, startDraw));
  ['mousemove', 'touchmove'].forEach(ev => canvas.addEventListener(ev, moveDraw, { passive: false }));
  ['mouseup', 'mouseleave', 'touchend'].forEach(ev => canvas.addEventListener(ev, endDraw));
}
g('clearSignatureBtn')?.addEventListener('click', resetSignature);

// ── IMÁGENES ─────────────────────────────────────────────────────────────────
async function fileToUrl(file) {
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const ratio = Math.min(1600 / img.width, 1600 / img.height, 1);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}
function drawPreviews(container, items, target) {
  if (!container) return;
  container.innerHTML = '';
  items.forEach((src, i) => {
    const wrap = document.createElement('div'); wrap.className = 'preview-item';
    const img = document.createElement('img'); img.src = src;
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'preview-remove'; rm.textContent = '×';
    rm.addEventListener('click', () => {
      if (target === 'ref') S.currentRefEvidence.splice(i, 1);
      else S.currentEvidence.splice(i, 1);
      drawPreviews(container, target === 'ref' ? S.currentRefEvidence : S.currentEvidence, target);
    });
    wrap.appendChild(img); wrap.appendChild(rm); container.appendChild(wrap);
  });
}
g('evidencias')?.addEventListener('change', async e => {
  const imgs = await Promise.all([...e.target.files].map(fileToUrl));
  S.currentEvidence = [...S.currentEvidence, ...imgs];
  drawPreviews(g('previewEvidencias'), S.currentEvidence, 'ev');
  e.target.value = '';
});
g('evidenciasRefaccion')?.addEventListener('change', async e => {
  const imgs = await Promise.all([...e.target.files].map(fileToUrl));
  S.currentRefEvidence = [...S.currentRefEvidence, ...imgs];
  drawPreviews(g('previewRefaccion'), S.currentRefEvidence, 'ref');
  e.target.value = '';
});
g('solicitaRefaccion')?.addEventListener('change', () => {
  g('refaccionFields')?.classList.toggle('hidden', !g('solicitaRefaccion').checked);
});

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────────
function switchPanel(panel) {
  S.activePanel = panel;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = g(`panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-panel="${panel}"]`);
  if (activeNav) activeNav.classList.add('active');
  // operator nav
  const isOp = S.user?.role === 'operador';
  [g('opNavBoard'), g('opNavNew'), g('opNavSchedule')].forEach(b => b?.classList.remove('active'));
  if (isOp) {
    if (panel === 'board') g('opNavBoard')?.classList.add('active');
    if (panel === 'report') g('opNavNew')?.classList.add('active');
    if (panel === 'schedule') g('opNavSchedule')?.classList.add('active');
  }
  // page title
  const titles = { board: 'Tablero', report: 'Nuevo reporte', schedule: 'Agenda', analytics: 'Analítica', history: 'Historial unidad', units: 'Flota', policies: 'Pólizas', parts: 'Refacciones', campanas: 'Campañas', users: 'Usuarios', requests: 'Solicitudes', companies: 'Empresas' };
  if (g('pageTitle')) g('pageTitle').textContent = titles[panel] || panel;
  if (panel === 'schedule') loadSchedules();
  if (panel === 'analytics') loadAnalytics();
  if (panel === 'units') loadUnits();
  if (panel === 'policies') loadPolicies();
  if (panel === 'parts') loadParts();
  if (panel === 'campanas') loadCampanas();
  if (panel === 'report') window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const panel = item.dataset.panel;
    if (panel) switchPanel(panel);
  });
});

// ── USER/ROLE SETUP ──────────────────────────────────────────────────────────
function setupForRole() {
  const role = S.user.role;
  const isAdmin = role === 'admin';
  const isOp = role === 'operador';
  const isOperativo = role === 'operativo';
  const isSupervisor = role === 'supervisor';
  const isFlota = role === 'flota';
  // avatar & name
  if (g('avatarCircle')) g('avatarCircle').textContent = S.user.nombre?.[0]?.toUpperCase() || 'C';
  if (g('currentUserName')) g('currentUserName').textContent = S.user.nombre;
  if (g('currentRoleBadge')) g('currentRoleBadge').textContent = { admin: 'Admin', operador: 'Operador', operativo: 'Operativo', supervisor: 'Supervisor', flota: 'Flota' }[role] || role;
  // nav visibility
  const show = (id, cond) => g(id)?.classList.toggle('hidden', !cond);
  show('navNewReport', isAdmin || isOp);
  show('navSchedule', true);
  show('navAnalytics', isAdmin || isOperativo || isSupervisor);
  show('navHistory', isAdmin || isOperativo || isSupervisor);
  show('navUnits', true);
  show('navPolicies', true);
  show('navParts', isAdmin || isOperativo);
  show('navCampanas', true);
  show('navAdminSection', isAdmin);
  // add buttons
  show('addUnitBtn', isAdmin || isOperativo);
  show('addPolicyBtn', isAdmin || isOperativo);
  show('addPartBtn', isAdmin || isOperativo);
  show('addCampanaBtn', isAdmin || isOperativo);
  // operator mode
  document.body.classList.toggle('operator-mode', isOp);
  // empresa filter for units
  if (isAdmin) g('unitEmpresaFilter')?.classList.remove('hidden');
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const d = await api.getNotifications();
    const nr = d.newReports || 0, ps = d.pendingSchedules || 0, ep = d.expiringPolicies || 0, cu = d.criticalUnits || 0;
    if (g('nNewReports')) g('nNewReports').querySelector('span:last-child').textContent = `${nr} nuevos`;
    if (g('nPending')) g('nPending').querySelector('span:last-child').textContent = `${ps} agenda`;
    if (g('nPolicies')) g('nPolicies').querySelector('span:last-child').textContent = `${ep} pólizas`;
    if (g('nCritical')) g('nCritical').querySelector('span:last-child').textContent = `${cu} críticas`;
    // alert dots blink if active
    g('nNewReports')?.classList.toggle('notif-active', nr > 0);
    g('nCritical')?.classList.toggle('notif-active', cu > 0);
  } catch {}
}

// ── GARANTÍAS ────────────────────────────────────────────────────────────────
async function loadGarantias() {
  try {
    S.garantias = await api.getGarantias();
    renderGarantias();
    updateStats();
    await loadNotifications();
  } catch (e) { toast(e.message, 'error'); }
}
function updateStats() {
  if (g('statTotal')) g('statTotal').textContent = S.garantias.length;
  if (g('statNew')) g('statNew').textContent = S.garantias.filter(x => x.estatusValidacion === 'nueva').length;
  if (g('statAccepted')) g('statAccepted').textContent = S.garantias.filter(x => x.estatusValidacion === 'aceptada').length;
  if (g('statDone')) g('statDone').textContent = S.garantias.filter(x => x.estatusOperativo === 'terminada').length;
}
function filteredGarantias() {
  const q = g('searchInput')?.value.trim().toLowerCase() || '';
  const fv = g('validationFilter')?.value || 'todos';
  const fo = g('operationalFilter')?.value || 'todos';
  return S.garantias.filter(x => {
    const blob = `${x.folio} ${x.numeroObra} ${x.numeroEconomico} ${x.empresa} ${x.modelo} ${x.descripcionFallo} ${x.contactoNombre} ${x.telefono}`.toLowerCase();
    return (!q || blob.includes(q)) && (fv === 'todos' || x.estatusValidacion === fv) && (fo === 'todos' || x.estatusOperativo === fo);
  });
}
function renderGarantias() {
  const list = g('garantiasList');
  const empty = g('emptyState');
  if (!list) return;
  const items = filteredGarantias();
  list.innerHTML = '';
  empty?.classList.toggle('hidden', items.length > 0);
  const tmpl = g('garantiaCardTemplate');
  items.forEach(item => {
    const node = tmpl.content.cloneNode(true);
    node.querySelector('.gcard-folio').textContent = item.folio || 'GAR-—';
    node.querySelector('.gcard-meta').textContent = `${item.empresa} · ${item.modelo} · ${item.reportadoPorNombre || '—'} · ${fmtDate(item.createdAt)}`;
    node.querySelector('.gcard-desc').textContent = item.descripcionFallo;
    const vb = node.querySelector('.validation-badge'); vb.textContent = item.estatusValidacion; vb.className = `badge ${badgeVal(item.estatusValidacion)}`;
    const ob = node.querySelector('.operational-badge'); ob.textContent = item.estatusOperativo; ob.className = `badge ${badgeOp(item.estatusOperativo)}`;
    const grid = node.querySelector('.gcard-grid');
    [['Económico', item.numeroEconomico], ['Obra', item.numeroObra], ['KM', item.kilometraje || '—'], ['Tipo', item.tipoIncidente], ['Contacto', item.contactoNombre || '—'], ['Revisó', item.revisadoPorNombre || 'Pendiente']].forEach(([k, v]) => {
      const d = document.createElement('div'); d.innerHTML = `<strong>${esc(k)}</strong>${esc(String(v))}`;
      grid.appendChild(d);
    });
    const strip = node.querySelector('.evidence-strip');
    [...(item.evidencias || []), ...(item.evidenciasRefaccion || [])].slice(0, 5).forEach(src => {
      const img = document.createElement('img'); img.src = src; strip.appendChild(img);
    });
    if (item.firma) { const img = document.createElement('img'); img.src = item.firma; strip.appendChild(img); }
    const actions = node.querySelector('.gcard-actions');
    const baseRow = document.createElement('div'); baseRow.className = 'action-row';
    baseRow.appendChild(btn('PDF', 'btn-ghost', () => exportPdf(item)));
    if (isRole('admin', 'operativo', 'supervisor')) baseRow.appendChild(btn('Historial', 'btn-ghost', () => showAudit(item)));
    if (isRole('admin')) baseRow.appendChild(btn('Eliminar', 'btn-danger', async () => {
      if (!confirm(`¿Eliminar reporte ${item.folio}?`)) return;
      try { await api.deleteGarantia(item.id); toast('Eliminado.'); await loadGarantias(); } catch (e) { toast(e.message, 'error'); }
    }));
    actions.appendChild(baseRow);
    if (isRole('operativo', 'admin')) {
      const rbox = document.createElement('div'); rbox.className = 'review-box';
      rbox.innerHTML = `<label>Decisión</label><div class="action-row"><select class="revSel"><option value="pendiente de revisión">Pendiente revisión</option><option value="aceptada">Aceptada</option><option value="rechazada">Rechazada</option></select><input class="revReason" placeholder="Motivo o comentario" style="flex:1"/><button class="btn-secondary revBtn" type="button">Guardar</button></div>`;
      rbox.querySelector('.revSel').value = item.estatusValidacion === 'nueva' ? 'pendiente de revisión' : item.estatusValidacion;
      rbox.querySelector('.revReason').value = item.motivoDecision || item.observacionesOperativo || '';
      rbox.querySelector('.revBtn').addEventListener('click', async () => {
        const st = rbox.querySelector('.revSel').value;
        const tx = rbox.querySelector('.revReason').value.trim();
        try { await api.reviewGarantia(item.id, { estatusValidacion: st, observacionesOperativo: st !== 'rechazada' ? tx : '', motivoDecision: st === 'rechazada' ? tx : '' }); toast('Decisión guardada.'); await loadGarantias(); }
        catch (e) { toast(e.message, 'error'); }
      });
      actions.appendChild(rbox);
      if (item.estatusValidacion === 'aceptada') {
        const ar = document.createElement('div'); ar.className = 'action-row';
        if (isRole('admin', 'operativo')) ar.appendChild(btn('Programar unidad', 'btn-secondary', async () => {
          try { await api.requestSchedule(item.id); toast('Enviado por WhatsApp.'); switchPanel('schedule'); } catch (e) { toast(e.message, 'error'); }
        }));
        actions.appendChild(ar);
        const opbox = document.createElement('div'); opbox.className = 'op-box';
        opbox.innerHTML = `<label>Flujo operativo</label><div class="action-row"><select class="opSel"><option value="sin iniciar">Sin iniciar</option><option value="en proceso">En proceso</option><option value="espera refacción">Espera refacción</option><option value="terminada">Terminada</option></select><input class="opNotes" placeholder="Observación" style="flex:1"/><button class="btn-secondary opBtn" type="button">Actualizar</button></div>`;
        opbox.querySelector('.opSel').value = item.estatusOperativo;
        opbox.querySelector('.opNotes').value = item.observacionesOperativo || '';
        opbox.querySelector('.opBtn').addEventListener('click', async () => {
          try { await api.updateOp(item.id, { estatusOperativo: opbox.querySelector('.opSel').value, observacionesOperativo: opbox.querySelector('.opNotes').value.trim() }); toast('Flujo actualizado.'); await loadGarantias(); }
          catch (e) { toast(e.message, 'error'); }
        });
        actions.appendChild(opbox);
      }
    }
    list.appendChild(node);
  });
}
['input', 'change'].forEach(ev => {
  g('searchInput')?.addEventListener(ev, renderGarantias);
  g('validationFilter')?.addEventListener(ev, renderGarantias);
  g('operationalFilter')?.addEventListener(ev, renderGarantias);
});

// ── REPORTE FORM ─────────────────────────────────────────────────────────────
function resetReportForm() {
  g('reportForm')?.reset();
  S.currentEvidence = []; S.currentRefEvidence = [];
  drawPreviews(g('previewEvidencias'), [], 'ev');
  drawPreviews(g('previewRefaccion'), [], 'ref');
  g('refaccionFields')?.classList.add('hidden');
  const r = document.querySelector('input[name="tipoIncidente"][value="daño"]');
  if (r) r.checked = true;
  if (isRole('operador') && S.user?.empresa && g('empresa')) g('empresa').value = S.user.empresa;
  if (isRole('operador') && g('contactoNombre')) g('contactoNombre').value = S.user.nombre || '';
  if (isRole('operador') && g('telefono')) g('telefono').value = S.user.telefono || '';
  resetSignature();
}
g('reportForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api.createGarantia({
      numeroObra: g('numeroObra').value.trim(), modelo: g('modelo').value.trim(),
      numeroEconomico: g('numeroEconomico').value.trim(), empresa: g('empresa').value.trim(),
      kilometraje: g('kilometraje').value.trim(), contactoNombre: g('contactoNombre').value.trim(),
      telefono: g('telefono').value.trim(), tipoIncidente: radio('tipoIncidente'),
      descripcionFallo: g('descripcionFallo').value.trim(), solicitaRefaccion: g('solicitaRefaccion').checked,
      detalleRefaccion: g('detalleRefaccion').value.trim(), evidencias: S.currentEvidence,
      evidenciasRefaccion: S.currentRefEvidence, firma: S.hasSignature ? canvas.toDataURL('image/jpeg', 0.95) : '',
    });
    toast('Reporte enviado.'); resetReportForm(); switchPanel('board'); await loadGarantias();
  } catch (e) { toast(e.message, 'error'); }
});
g('cancelReportBtn')?.addEventListener('click', () => { resetReportForm(); switchPanel('board'); });
g('cancelReportBtn2')?.addEventListener('click', () => { resetReportForm(); switchPanel('board'); });

// ── AUDIT ────────────────────────────────────────────────────────────────────
async function showAudit(item) {
  try {
    const logs = await api.getAudit(item.id);
    const html = logs.length
      ? `<div style="display:flex;flex-direction:column;gap:10px;">${logs.map(l => `<div style="background:var(--bg2);border-radius:6px;padding:10px 12px;border:1px solid var(--border)"><div style="font-size:.78rem;color:var(--text3);font-family:'JetBrains Mono',monospace;">${fmtDate(l.created_at)}</div><div style="font-weight:600;margin:3px 0;">${esc(l.user_nombre || 'Sistema')}</div><div style="font-size:.83rem;color:var(--text2);">${esc(l.accion)} — ${esc(l.detalle || '')}</div></div>`).join('')}</div>`
      : '<p style="color:var(--text2)">Sin movimientos aún.</p>';
    showModal(`Historial — ${item.folio}`, html);
  } catch (e) { toast(e.message, 'error'); }
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function getImgData(src) {
  if (!src) return null;
  if (src.startsWith('data:image/')) return src;
  try { const r = await fetch(src); const b = await r.blob(); return await new Promise((res, rej) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }); } catch { return null; }
}
async function exportPdf(item) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  const line = (txt, gap = 7, x = 14) => { doc.text(String(txt), x, y); y += gap; };
  doc.setFillColor(10, 11, 14); doc.rect(0, 0, 210, 297, 'F');
  const logo = await getImgData('/logo.jpg');
  if (logo) try { doc.addImage(logo, 'JPEG', 14, 12, 40, 40); } catch {}
  doc.setTextColor(232, 234, 240); doc.setFontSize(18); doc.text('REPORTE DE GARANTÍA', 60, 24);
  doc.setFontSize(10); doc.setTextColor(139, 144, 160); doc.text('CARLAB CLOUD V4', 60, 32);
  doc.setFontSize(10); doc.setTextColor(85, 90, 110); doc.text(`Folio: ${item.folio || '—'}`, 196, 20, { align: 'right' });
  y = 56;
  doc.setFontSize(11); doc.setTextColor(232, 234, 240);
  doc.text(`Empresa: ${item.empresa}`, 14, y); doc.text(`Unidad: ${item.numeroEconomico}`, 105, y); y += 8;
  doc.text(`Modelo: ${item.modelo}`, 14, y); doc.text(`Obra: ${item.numeroObra}`, 105, y); y += 8;
  doc.text(`KM: ${item.kilometraje || '—'}`, 14, y); doc.text(`Estatus: ${item.estatusValidacion}`, 105, y); y += 12;
  doc.setFontSize(12); doc.setTextColor(59, 130, 246); doc.text('Descripción', 14, y); y += 7;
  doc.setFontSize(10); doc.setTextColor(200, 200, 210);
  const split = doc.splitTextToSize(item.descripcionFallo || '—', 180);
  doc.text(split, 14, y); y += split.length * 6 + 8;
  doc.save(`${item.folio || 'garantia'}_${item.numeroEconomico}.pdf`);
}

// ── SCHEDULE ─────────────────────────────────────────────────────────────────
async function loadSchedules() {
  if (!isRole('admin', 'operativo', 'supervisor', 'operador', 'flota')) return;
  try {
    S.schedules = await api.getSchedules('');
    renderScheduleCalendar();
    renderScheduleList();
    renderScheduleAlerts();
  } catch (e) { toast(e.message, 'error'); }
}
function renderScheduleAlerts() {
  const alerts = g('scheduleAlerts');
  if (!alerts) return;
  const bits = [];
  const pending = S.schedules.filter(s => s.status === 'proposed').length;
  const waiting = S.schedules.filter(s => s.status === 'waiting_operator').length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = S.schedules.filter(s => (s.scheduledFor || '').slice(0, 10) === today).length;
  if (pending) bits.push(`<div class="alert-card warn">⚠️ <strong>${pending}</strong> propuestas esperando confirmación</div>`);
  if (waiting) bits.push(`<div class="alert-card info">📨 <strong>${waiting}</strong> solicitudes enviadas esperando respuesta del operador</div>`);
  if (todayCount) bits.push(`<div class="alert-card danger">🚗 <strong>${todayCount}</strong> unidades programadas para hoy</div>`);
  alerts.innerHTML = bits.join('');
}
function renderScheduleCalendar() {
  const cal = g('scheduleCalendar');
  if (!cal) return;
  const selDate = g('scheduleDateInput')?.value || new Date().toISOString().slice(0, 10);
  const d = new Date(`${selDate}T00:00:00`);
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const eventDates = new Set(S.schedules.map(s => (s.scheduledFor || s.proposedAt || '').slice(0, 10)).filter(Boolean));
  let cells = '';
  for (let i = 0; i < startDay; i++) cells += '<div class="cal-cell empty"></div>';
  for (let day = 1; day <= last.getDate(); day++) {
    const iso = new Date(year, month, day).toISOString().slice(0, 10);
    const hasEv = eventDates.has(iso);
    const active = iso === selDate ? 'active' : '';
    const he = hasEv ? 'has-event' : '';
    cells += `<button type="button" class="cal-cell ${active} ${he}" data-date="${iso}">${day}</button>`;
  }
  const monthName = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  cal.innerHTML = `
    <div style="text-align:center;font-weight:600;font-size:.88rem;margin-bottom:10px;text-transform:capitalize;">${monthName}</div>
    <div class="cal-head">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
  cal.querySelectorAll('.cal-cell[data-date]').forEach(b => b.addEventListener('click', () => {
    if (g('scheduleDateInput')) g('scheduleDateInput').value = b.dataset.date;
    renderScheduleCalendar();
    renderScheduleList();
  }));
}
function renderScheduleList() {
  const list = g('scheduleList');
  if (!list) return;
  const selDate = g('scheduleDateInput')?.value || new Date().toISOString().slice(0, 10);
  const items = S.schedules.filter(s => {
    const raw = s.scheduledFor || s.proposedAt || s.requestedAt;
    return raw && raw.slice(0, 10) === selDate;
  });
  if (!items.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><strong>Sin unidades para esta fecha</strong><span>Las propuestas aparecen automáticamente.</span></div>'; return; }
  list.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div'); row.className = 'sched-row';
    const statusCls = item.status === 'confirmed' ? 'badge-accepted' : item.status === 'proposed' ? 'badge-review' : 'badge-info';
    row.innerHTML = `<strong>${esc(item.folio || '—')} · Unidad ${esc(item.unidad)}</strong><div class="sched-meta">${esc(item.empresa)} · ${esc(item.contactoNombre || '—')}</div><div class="action-row"><span class="badge ${statusCls}">${esc(item.status)}</span><span style="font-size:.8rem;color:var(--text2)">${esc(item.originalText || fmtDate(item.scheduledFor || item.proposedAt))}</span></div>`;
    if (isRole('admin', 'operativo') && item.status === 'proposed') {
      const ar = document.createElement('div'); ar.className = 'action-row'; ar.style.marginTop = '8px';
      ar.appendChild(btn('Confirmar', 'btn-secondary', async () => {
        try { await api.confirmSchedule(item.id, { status: 'confirmed', scheduledFor: item.scheduledFor || item.proposedAt }); toast('Cita confirmada. WhatsApp enviado ✅'); await loadSchedules(); }
        catch (e) { toast(e.message, 'error'); }
      }));
      ar.appendChild(btn('Rechazar fecha', 'btn-ghost', async () => {
        try { await api.confirmSchedule(item.id, { status: 'rejected' }); toast('Fecha rechazada. Se notificó al operador.'); await loadSchedules(); }
        catch (e) { toast(e.message, 'error'); }
      }));
      row.appendChild(ar);
    }
    list.appendChild(row);
  });
}
g('scheduleRefreshBtn')?.addEventListener('click', loadSchedules);
g('scheduleDateInput')?.addEventListener('change', () => { renderScheduleCalendar(); renderScheduleList(); });

// ── ANALYTICS ────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const d = await api.getAnalytics();
    const makeList = (arr, keyFn, valFn, valClass = '') => arr.length
      ? `<div class="list-stat">${arr.slice(0, 6).map(r => `<div class="list-stat-row"><span class="stat-name">${esc(keyFn(r))}</span><span class="stat-val ${valClass}">${esc(String(valFn(r)))}</span></div>`).join('')}</div>`
      : '<span style="color:var(--text3);font-size:.83rem">Sin datos aún.</span>';
    if (g('topCompanies')) g('topCompanies').innerHTML = makeList(d.porEmpresa, r => r.empresa, r => r.total + ' reportes');
    if (g('topModels')) g('topModels').innerHTML = makeList(d.porModelo, r => r.modelo, r => r.total + ' reportes');
    if (g('topIncidentTypes')) g('topIncidentTypes').innerHTML = makeList(d.porTipo, r => r.tipo_incidente, r => r.total + ' casos');
    if (g('repeatUnits')) g('repeatUnits').innerHTML = makeList(d.reincidentes, r => `Unidad ${r.numero_economico} (${r.empresa})`, r => r.total + ' reportes');
    if (g('costsByCompany')) g('costsByCompany').innerHTML = makeList(d.costosPorEmpresa, r => r.empresa, r => fmtMoney(r.total_gasto));
    if (g('criticalUnitsAnalytics')) g('criticalUnitsAnalytics').innerHTML = d.unidadesCriticas?.length
      ? `<div class="list-stat">${d.unidadesCriticas.map(u => `<div class="list-stat-row"><span class="stat-name">Unidad ${esc(u.numeroEconomico)} — ${esc(u.empresa)}</span><span class="stat-val" style="color:var(--red)">🔴</span></div>`).join('')}</div>`
      : '<span style="color:var(--green);font-size:.83rem">✓ Sin unidades críticas</span>';
  } catch (e) { toast(e.message, 'error'); }
}

// ── HISTORIAL UNIDAD ─────────────────────────────────────────────────────────
g('unitHistoryBtn')?.addEventListener('click', async () => {
  const eco = g('unitHistoryInput')?.value.trim();
  if (!eco) return toast('Escribe un número económico.', 'error');
  try {
    const hist = await api.getUnitHistory(eco);
    const res = g('unitHistoryResult');
    if (!hist.length) { res.innerHTML = '<div class="empty-state"><strong>Sin historial.</strong><span>No hay reportes para esa unidad.</span></div>'; return; }
    res.innerHTML = hist.map(x => `<div class="table-row"><div><strong>${esc(x.folio || 'GAR-—')} · Obra ${esc(x.numeroObra)}</strong><div class="muted">${esc(x.empresa)} · ${esc(x.modelo)}</div></div><div><span class="badge ${badgeVal(x.estatusValidacion)}">${esc(x.estatusValidacion)}</span></div><div><span class="badge ${badgeOp(x.estatusOperativo)}">${esc(x.estatusOperativo)}</span></div><div style="font-size:.78rem;color:var(--text2)">${fmtDate(x.createdAt)}</div></div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
});

// ── UNITS / FLOTAS ────────────────────────────────────────────────────────────
async function loadUnits() {
  try {
    const empresa = isRole('admin') ? (g('unitEmpresaFilter')?.value || '') : '';
    S.units = await api.getUnits(empresa);
    renderUnits();
    // populate empresa filter
    if (isRole('admin') && g('unitEmpresaFilter') && S.companies.length) {
      const cur = g('unitEmpresaFilter').value;
      fillSel(g('unitEmpresaFilter'), S.companies.filter(c => c.activo), 'Todas las empresas');
      if (cur) g('unitEmpresaFilter').value = cur;
    }
  } catch (e) { toast(e.message, 'error'); }
}
function renderUnits() {
  const container = g('unitsList');
  const detail = g('unitDetail');
  if (!container) return;
  // If detail is visible, skip
  if (detail && !detail.classList.contains('hidden')) return;
  const q = g('unitSearchInput')?.value.trim().toLowerCase() || '';
  const semFilt = g('unitSemaforoFilter')?.value || 'todos';
  const units = S.units.filter(u => {
    const blob = `${u.numeroEconomico} ${u.marca} ${u.modelo} ${u.empresa} ${u.placa}`.toLowerCase();
    return (!q || blob.includes(q)) && (semFilt === 'todos' || u.semaforoColor === semFilt);
  });
  container.style.display = 'grid';
  container.innerHTML = '';
  if (!units.length) { container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🚌</div><strong>Sin unidades</strong><span>Agrega la primera unidad de tu flota.</span></div>'; return; }
  units.forEach(u => {
    const card = document.createElement('div');
    card.className = `unit-card semaforo-${u.semaforoColor}`;
    card.innerHTML = `
      <div class="unit-card-header">
        <span class="unit-eco">${esc(u.numeroEconomico)}</span>
        <span class="semaforo-badge ${u.semaforoColor}">${u.semaforoColor === 'verde' ? '🟢 Operativa' : u.semaforoColor === 'amarillo' ? '🟡 Atención' : '🔴 Crítica'}</span>
      </div>
      <div class="unit-brand">${esc(u.marca)} ${esc(u.modelo)} ${esc(u.anio)}</div>
      <div class="unit-empresa">${esc(u.empresa)}</div>
      <div class="unit-km">KM: ${u.kmActual.toLocaleString('es-MX')} ${u.kmProximoServicio ? `· Próx. servicio: ${u.kmProximoServicio.toLocaleString('es-MX')}` : ''}</div>
      <div class="unit-actions"></div>`;
    const ua = card.querySelector('.unit-actions');
    ua.appendChild(btn('Ver detalle', 'btn-secondary', () => showUnitDetail(u.id)));
    if (isRole('admin', 'operativo')) {
      ua.appendChild(btn('Editar', 'btn-ghost', e => { e.stopPropagation(); openUnitForm(u); }));
    }
    container.appendChild(card);
  });
}
function openUnitForm(unit = null) {
  const form = g('unitForm');
  if (!form) return;
  form.classList.remove('hidden');
  g('unitFormTitle').textContent = unit ? 'Editar unidad' : 'Nueva unidad';
  S.editingUnitId = unit?.id || '';
  if (unit) {
    g('uId').value = unit.id;
    g('uNumEco').value = unit.numeroEconomico;
    g('uMarca').value = unit.marca;
    g('uModelo').value = unit.modelo;
    g('uAnio').value = unit.anio;
    g('uPlaca').value = unit.placa;
    g('uVin').value = unit.vin;
    g('uColor').value = unit.color;
    g('uCapacidad').value = unit.capacidad;
    g('uCombustible').value = unit.combustible;
    g('uKmActual').value = unit.kmActual;
    g('uKmProximo').value = unit.kmProximoServicio;
    g('uEstatus').value = unit.estatus;
    g('uSemaforo').value = unit.semaforoColor;
    g('uNotas').value = unit.notas;
    g('uEmpresa').value = unit.empresa;
  } else {
    g('uId').value = '';
    g('uNumEco').value = '';
    ['uMarca','uModelo','uAnio','uPlaca','uVin','uColor','uCapacidad','uNotas'].forEach(id => { if (g(id)) g(id).value = ''; });
    if (g('uKmActual')) g('uKmActual').value = '0';
    if (g('uKmProximo')) g('uKmProximo').value = '0';
    if (g('uCombustible')) g('uCombustible').value = 'diesel';
    if (g('uEstatus')) g('uEstatus').value = 'activa';
    if (g('uSemaforo')) g('uSemaforo').value = 'verde';
  }
  form.scrollIntoView({ behavior: 'smooth' });
}
g('addUnitBtn')?.addEventListener('click', () => openUnitForm());
g('cancelUnitBtn')?.addEventListener('click', () => { g('unitForm')?.classList.add('hidden'); S.editingUnitId = ''; });
g('saveUnitBtn')?.addEventListener('click', async () => {
  const payload = {
    numeroEconomico: g('uNumEco').value.trim(),
    empresa: g('uEmpresa').value.trim(),
    marca: g('uMarca').value.trim(),
    modelo: g('uModelo').value.trim(),
    anio: g('uAnio').value.trim(),
    placa: g('uPlaca').value.trim(),
    vin: g('uVin').value.trim(),
    color: g('uColor').value.trim(),
    capacidad: g('uCapacidad').value.trim(),
    combustible: g('uCombustible').value,
    kmActual: g('uKmActual').value,
    kmProximoServicio: g('uKmProximo').value,
    estatus: g('uEstatus').value,
    semaforoColor: g('uSemaforo').value,
    notas: g('uNotas').value.trim(),
  };
  try {
    if (S.editingUnitId) { await api.updateUnit(S.editingUnitId, payload); toast('Unidad actualizada.'); }
    else { await api.createUnit(payload); toast('Unidad registrada.'); }
    g('unitForm')?.classList.add('hidden'); S.editingUnitId = '';
    await loadUnits();
  } catch (e) { toast(e.message, 'error'); }
});
g('unitSearchInput')?.addEventListener('input', renderUnits);
g('unitSemaforoFilter')?.addEventListener('change', renderUnits);
g('unitEmpresaFilter')?.addEventListener('change', loadUnits);

async function showUnitDetail(unitId) {
  try {
    const data = await api.unitDashboard(unitId);
    S.currentUnitDashboardId = unitId;
    g('unitsList').style.display = 'none';
    g('unitForm')?.classList.add('hidden');
    const detail = g('unitDetail');
    detail.classList.remove('hidden');
    const u = data.unit;
    const res = data.resumen;
    detail.querySelector('#unitDetailContent').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="font-size:1.2rem;font-weight:700;">Unidad ${esc(u.numeroEconomico)} <span class="semaforo-badge ${u.semaforoColor}">${u.semaforoColor === 'verde' ? '🟢 Operativa' : u.semaforoColor === 'amarillo' ? '🟡 Atención' : '🔴 Crítica'}</span></h3>
          <div style="font-size:.85rem;color:var(--text2);margin-top:4px;">${esc(u.marca)} ${esc(u.modelo)} ${esc(u.anio)} · ${esc(u.empresa)}</div>
        </div>
        ${isRole('admin','operativo') ? `<button id="editUnitFromDetail" class="btn-ghost" type="button">Editar unidad</button>` : ''}
      </div>
      <div class="unit-dash-grid">
        <div class="unit-dash-card"><div class="val">${res.totalGarantias}</div><div class="lbl">Total reportes</div></div>
        <div class="unit-dash-card"><div class="val" style="color:var(--amber)">${res.garantiasAbiertas}</div><div class="lbl">Reportes abiertos</div></div>
        <div class="unit-dash-card"><div class="val" style="color:var(--accent)">${fmtMoney(res.gastoRefacciones)}</div><div class="lbl">Gasto refacciones</div></div>
        <div class="unit-dash-card"><div class="val" style="color:${res.tienePoliza?'var(--green)':'var(--red)'};">${res.tienePoliza ? '✓' : '✗'}</div><div class="lbl">Póliza vigente</div></div>
        <div class="unit-dash-card"><div class="val">${u.kmActual.toLocaleString('es-MX')}</div><div class="lbl">KM actuales</div></div>
        <div class="unit-dash-card"><div class="val">${data.campanas.length}</div><div class="lbl">Campañas</div></div>
      </div>
      <div class="unit-section" style="margin-bottom:14px;">
        <h4>Reportes de garantía</h4>
        ${data.garantias.length ? data.garantias.map(g2 => `<div class="table-row" style="grid-template-columns:2fr 1fr 1fr;"><div><strong>${esc(g2.folio)}</strong><div class="muted">${esc(g2.tipoIncidente)} · ${fmtDate(g2.createdAt)}</div></div><span class="badge ${badgeVal(g2.estatusValidacion)}">${esc(g2.estatusValidacion)}</span><span class="badge ${badgeOp(g2.estatusOperativo)}">${esc(g2.estatusOperativo)}</span></div>`).join('') : '<p style="color:var(--text3);font-size:.83rem;padding:8px 0">Sin reportes.</p>'}
      </div>
      <div class="unit-section" style="margin-bottom:14px;">
        <h4>Pólizas</h4>
        ${data.policies.length ? data.policies.map(p => `<div class="table-row" style="grid-template-columns:2fr 1fr 1fr;"><div><strong>${esc(p.folio)} — ${esc(p.tipoPoliza || 'Póliza')}</strong><div class="muted">${esc(p.proveedor)} · Vence: ${fmtDateOnly(p.fechaVencimiento)}</div></div><div class="dias-tag" style="color:${p.diasRestantes>30?'var(--green)':p.diasRestantes>0?'var(--amber)':'var(--red)'};">${p.diasRestantes > 0 ? `${p.diasRestantes} días` : 'Vencida'}</div><div>${fmtMoney(p.monto)}</div></div>`).join('') : '<p style="color:var(--text3);font-size:.83rem;padding:8px 0">Sin pólizas registradas.</p>'}
      </div>
      <div class="unit-section" style="margin-bottom:14px;">
        <h4>Refacciones (${fmtMoney(res.gastoRefacciones)} total)</h4>
        ${data.parts.length ? data.parts.slice(0,10).map(p => `<div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr;"><div><strong>${esc(p.nombre)}</strong><div class="muted">${esc(p.proveedor || '—')}</div></div><div>${p.cantidad} ${esc(p.unidad)}</div><div>${fmtMoney(p.costo)}</div><div>${fmtDate(p.createdAt)}</div></div>`).join('') : '<p style="color:var(--text3);font-size:.83rem;padding:8px 0">Sin refacciones.</p>'}
      </div>
      <div class="unit-section">
        <h4>Campañas de mantenimiento</h4>
        ${data.campanas.length ? data.campanas.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem;"><strong>${esc(c.nombre)}</strong> <span class="campana-tipo">${esc(c.tipo)}</span><div style="color:var(--text2);font-size:.78rem;margin-top:2px;">${esc(c.descripcion || '—')}</div></div>`).join('') : '<p style="color:var(--text3);font-size:.83rem;padding:8px 0">Sin campañas.</p>'}
      </div>`;
    document.getElementById('editUnitFromDetail')?.addEventListener('click', () => {
      const u2 = S.units.find(x => x.id === unitId);
      if (u2) { g('unitDetail').classList.add('hidden'); g('unitsList').style.display = 'grid'; openUnitForm(u2); }
    });
  } catch (e) { toast(e.message, 'error'); }
}
g('backToUnits')?.addEventListener('click', () => {
  g('unitDetail').classList.add('hidden');
  g('unitsList').style.display = 'grid';
});

// ── PÓLIZAS ──────────────────────────────────────────────────────────────────
async function loadPolicies() {
  try {
    S.policies = await api.getPolicies();
    renderPolicies();
  } catch (e) { toast(e.message, 'error'); }
}
function renderPolicies() {
  const list = g('policiesList');
  if (!list) return;
  if (!S.policies.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">🛡️</div><strong>Sin pólizas</strong><span>Registra la primera póliza de garantía.</span></div>'; return; }
  list.innerHTML = S.policies.map(p => {
    const dClass = p.diasRestantes > 30 ? '' : p.diasRestantes > 0 ? 'expiring-soon' : 'expired';
    const dColor = p.diasRestantes > 30 ? 'var(--green)' : p.diasRestantes > 0 ? 'var(--amber)' : 'var(--red)';
    const diasTxt = p.diasRestantes > 0 ? `${p.diasRestantes}d restantes` : 'Vencida';
    return `<div class="policy-row ${dClass}">
      <div><strong>${esc(p.folio)} — Unidad ${esc(p.numeroEconomico)}</strong><div class="muted">${esc(p.empresa)} · ${esc(p.tipoPoliza || '—')} · ${esc(p.proveedor || '—')}</div></div>
      <div><div class="dias-tag" style="color:${dColor}">${diasTxt}</div><div class="muted" style="font-size:.75rem;">${fmtDateOnly(p.fechaVencimiento)}</div></div>
      <div>${fmtMoney(p.monto)}</div>
      <div><span class="badge ${p.diasRestantes > 30 ? 'badge-accepted' : p.diasRestantes > 0 ? 'badge-review' : 'badge-rejected'}">${p.diasRestantes > 30 ? 'Vigente' : p.diasRestantes > 0 ? 'Por vencer' : 'Vencida'}</span></div>
      <div class="row-actions">
        ${isRole('admin','operativo') ? `<button class="btn-ghost pol-edit" data-id="${esc(p.id)}" type="button">Editar</button><button class="btn-secondary pol-notify" data-id="${esc(p.id)}" type="button">Notif. WA</button>` : ''}
        ${isRole('admin') ? `<button class="btn-danger pol-del" data-id="${esc(p.id)}" type="button">Eliminar</button>` : ''}
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.pol-edit').forEach(b => b.addEventListener('click', () => {
    const pol = S.policies.find(p => p.id === b.dataset.id);
    if (pol) openPolicyForm(pol);
  }));
  list.querySelectorAll('.pol-notify').forEach(b => b.addEventListener('click', async () => {
    try { await api.notifyPolicy(b.dataset.id); toast('Notificación WhatsApp enviada ✅'); } catch (e) { toast(e.message, 'error'); }
  }));
  list.querySelectorAll('.pol-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta póliza?')) return;
    try { await api.deletePolicy(b.dataset.id); toast('Póliza eliminada.'); await loadPolicies(); } catch (e) { toast(e.message, 'error'); }
  }));
}
function openPolicyForm(pol = null) {
  const form = g('policyForm');
  if (!form) return;
  form.classList.remove('hidden');
  g('policyFormTitle').textContent = pol ? 'Editar póliza' : 'Nueva póliza';
  S.editingPolicyId = pol?.id || '';
  if (pol) {
    g('pId').value = pol.id;
    g('pNumEco').value = pol.numeroEconomico || '';
    g('pTipo').value = pol.tipoPoliza || '';
    g('pProveedor').value = pol.proveedor || '';
    g('pNumPoliza').value = pol.numeroPoliza || '';
    g('pMonto').value = pol.monto || '';
    g('pFechaInicio').value = pol.fechaInicio ? pol.fechaInicio.slice(0,10) : '';
    g('pFechaVenc').value = pol.fechaVencimiento ? pol.fechaVencimiento.slice(0,10) : '';
    g('pContactoProv').value = pol.contactoProveedor || '';
    g('pTelProv').value = pol.telefonoProveedor || '';
    g('pCobertura').value = pol.cobertura || '';
    g('pNotas').value = pol.notas || '';
    g('pEmpresa').value = pol.empresa || '';
  } else {
    g('pId').value = '';
    ['pNumEco','pProveedor','pNumPoliza','pMonto','pFechaInicio','pFechaVenc','pContactoProv','pTelProv','pCobertura','pNotas'].forEach(id => { if(g(id)) g(id).value = ''; });
    if (g('pTipo')) g('pTipo').value = '';
  }
  form.scrollIntoView({ behavior: 'smooth' });
}
g('addPolicyBtn')?.addEventListener('click', () => openPolicyForm());
g('cancelPolicyBtn')?.addEventListener('click', () => { g('policyForm')?.classList.add('hidden'); S.editingPolicyId = ''; });
g('savePolicyBtn')?.addEventListener('click', async () => {
  const payload = {
    unitId: null, numeroEconomico: g('pNumEco').value.trim(), empresa: g('pEmpresa').value.trim(),
    tipoPoliza: g('pTipo').value, proveedor: g('pProveedor').value.trim(),
    numeroPoliza: g('pNumPoliza').value.trim(), monto: g('pMonto').value,
    fechaInicio: g('pFechaInicio').value || null, fechaVencimiento: g('pFechaVenc').value || null,
    contactoProveedor: g('pContactoProv').value.trim(), telefonoProveedor: g('pTelProv').value.trim(),
    cobertura: g('pCobertura').value.trim(), notas: g('pNotas').value.trim(),
  };
  // link unit if found
  const unit = S.units.find(u => u.numeroEconomico === payload.numeroEconomico && u.empresa === payload.empresa);
  if (unit) payload.unitId = unit.id;
  try {
    if (S.editingPolicyId) { await api.updatePolicy(S.editingPolicyId, payload); toast('Póliza actualizada.'); }
    else { await api.createPolicy(payload); toast('Póliza registrada.'); }
    g('policyForm')?.classList.add('hidden'); S.editingPolicyId = '';
    await loadPolicies();
  } catch (e) { toast(e.message, 'error'); }
});

// ── REFACCIONES ───────────────────────────────────────────────────────────────
async function loadParts() {
  try {
    S.parts = await api.getParts();
    renderParts();
    renderPartsSummary();
  } catch (e) { toast(e.message, 'error'); }
}
function renderPartsSummary() {
  const row = g('partsSummaryRow');
  if (!row) return;
  const total = S.parts.reduce((sum, p) => sum + (p.costo * p.cantidad), 0);
  const count = S.parts.length;
  const salidas = S.parts.filter(p => p.tipo === 'salida').length;
  row.innerHTML = `
    <div class="summary-chip"><strong>${count}</strong><span>Movimientos</span></div>
    <div class="summary-chip"><strong>${salidas}</strong><span>Salidas</span></div>
    <div class="summary-chip"><strong style="color:var(--accent)">${fmtMoney(total)}</strong><span>Gasto total</span></div>`;
}
function renderParts() {
  const list = g('partsList');
  if (!list) return;
  if (!S.parts.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔧</div><strong>Sin refacciones</strong><span>Registra movimientos de refacciones.</span></div>'; return; }
  list.innerHTML = S.parts.map(p => `
    <div class="table-row">
      <div><strong>${esc(p.nombre)}</strong><div class="muted">${esc(p.descripcion || '—')} · OEM: ${esc(p.numeroParte || '—')}</div></div>
      <div>${p.cantidad} ${esc(p.unidad)}<div class="muted">${esc(p.proveedor || '—')}</div></div>
      <div>${fmtMoney(p.costo)}<div class="muted">Total: ${fmtMoney(p.costo * p.cantidad)}</div></div>
      <div><div class="muted">${esc(p.empresa || '—')}</div><div class="muted">Unidad ${esc(p.numeroEconomico || '—')}</div><div class="muted" style="font-size:.72rem;">${fmtDate(p.createdAt)}</div>
      ${isRole('admin','operativo') ? `<button class="btn-danger part-del" data-id="${esc(p.id)}" type="button" style="margin-top:6px;">Eliminar</button>` : ''}</div>
    </div>`).join('');
  list.querySelectorAll('.part-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta refacción?')) return;
    try { await api.deletePart(b.dataset.id); toast('Eliminado.'); await loadParts(); } catch (e) { toast(e.message, 'error'); }
  }));
}
g('addPartBtn')?.addEventListener('click', () => { g('partForm')?.classList.toggle('hidden'); });
g('cancelPartBtn')?.addEventListener('click', () => { g('partForm')?.classList.add('hidden'); });
g('savePartBtn')?.addEventListener('click', async () => {
  const payload = {
    nombre: g('ptNombre').value.trim(), descripcion: g('ptDesc').value.trim(),
    numeroParte: g('ptNumParte').value.trim(), proveedor: g('ptProveedor').value.trim(),
    costo: g('ptCosto').value, cantidad: g('ptCantidad').value,
    unidad: g('ptUnidad').value, empresa: g('ptEmpresa').value.trim(),
    numeroEconomico: g('ptNumEco').value.trim(), tipo: g('ptTipo').value,
  };
  const unit = S.units.find(u => u.numeroEconomico === payload.numeroEconomico && u.empresa === payload.empresa);
  if (unit) payload.unitId = unit.id;
  try { await api.createPart(payload); toast('Refacción registrada.'); g('partForm')?.classList.add('hidden'); await loadParts(); }
  catch (e) { toast(e.message, 'error'); }
});

// ── CAMPAÑAS ──────────────────────────────────────────────────────────────────
async function loadCampanas() {
  try {
    S.campanas = await api.getCampanas();
    renderCampanas();
  } catch (e) { toast(e.message, 'error'); }
}
function renderCampanas() {
  const container = g('campanasList');
  if (!container) return;
  if (!S.campanas.length) { container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔔</div><strong>Sin campañas</strong><span>Crea la primera campaña de mantenimiento.</span></div>'; return; }
  container.innerHTML = '';
  S.campanas.forEach(c => {
    const card = document.createElement('div'); card.className = 'campana-card';
    const estatusCls = c.estatus === 'activa' ? 'badge-accepted' : c.estatus === 'pausada' ? 'badge-review' : 'badge-info';
    card.innerHTML = `
      <div class="campana-header">
        <span class="campana-name">${esc(c.nombre)}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="campana-tipo">${esc(c.tipo)}</span>
          <span class="badge ${estatusCls}">${esc(c.estatus)}</span>
        </div>
      </div>
      <div class="campana-empresa">${esc(c.empresa || '—')}</div>
      <div class="campana-desc">${esc(c.descripcion || 'Sin descripción.')}</div>
      <div class="campana-dates">${c.fechaInicio ? `Inicio: ${fmtDateOnly(c.fechaInicio)}` : ''}${c.fechaFin ? ` · Fin: ${fmtDateOnly(c.fechaFin)}` : ''}</div>
      <div class="campana-actions">
        ${isRole('admin','operativo') ? `<button class="btn-ghost camp-edit" data-id="${esc(c.id)}" type="button">Editar</button>` : ''}
      </div>`;
    card.querySelector('.camp-edit')?.addEventListener('click', () => openCampanaForm(c));
    container.appendChild(card);
  });
}
function openCampanaForm(camp = null) {
  const form = g('campanaForm');
  if (!form) return;
  form.classList.remove('hidden');
  S.editingCampanaId = camp?.id || '';
  if (camp) {
    g('caId').value = camp.id;
    g('caNombre').value = camp.nombre;
    g('caTipo').value = camp.tipo;
    g('caEmpresa').value = camp.empresa || '';
    g('caEstatus').value = camp.estatus;
    g('caFechaInicio').value = camp.fechaInicio ? camp.fechaInicio.slice(0,10) : '';
    g('caFechaFin').value = camp.fechaFin ? camp.fechaFin.slice(0,10) : '';
    g('caDesc').value = camp.descripcion || '';
  } else {
    g('caId').value = '';
    ['caNombre','caDesc','caFechaInicio','caFechaFin'].forEach(id => { if(g(id)) g(id).value = ''; });
    if(g('caTipo')) g('caTipo').value = 'preventivo';
    if(g('caEstatus')) g('caEstatus').value = 'activa';
  }
  form.scrollIntoView({ behavior: 'smooth' });
}
g('addCampanaBtn')?.addEventListener('click', () => openCampanaForm());
g('cancelCampanaBtn')?.addEventListener('click', () => { g('campanaForm')?.classList.add('hidden'); S.editingCampanaId = ''; });
g('saveCampanaBtn')?.addEventListener('click', async () => {
  const payload = {
    nombre: g('caNombre').value.trim(), descripcion: g('caDesc').value.trim(),
    tipo: g('caTipo').value, empresa: g('caEmpresa').value.trim(),
    estatus: g('caEstatus').value,
    fechaInicio: g('caFechaInicio').value || null, fechaFin: g('caFechaFin').value || null,
    unidadesObjetivo: [],
  };
  try {
    if (S.editingCampanaId) { await api.updateCampana(S.editingCampanaId, payload); toast('Campaña actualizada.'); }
    else { await api.createCampana(payload); toast('Campaña creada. WhatsApp enviado si hay empresa configurada ✅'); }
    g('campanaForm')?.classList.add('hidden'); S.editingCampanaId = '';
    await loadCampanas();
  } catch (e) { toast(e.message, 'error'); }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  if (!isRole('admin')) return;
  try {
    S.users = await api.getUsers();
    renderUsers();
  } catch (e) { toast(e.message, 'error'); }
}
function renderUsers() {
  const list = g('usersList');
  if (!list) return;
  list.innerHTML = S.users.map(u => `
    <div class="table-row">
      <div><strong>${esc(u.nombre)}</strong><div class="muted">${esc(u.email)}</div><div class="muted">${esc(u.empresa || 'Sin empresa')}</div></div>
      <div><span class="badge badge-info">${esc(u.role)}</span></div>
      <div><div class="muted">${esc(u.telefono || '—')}</div></div>
      <div class="row-actions">
        <button class="btn-ghost user-edit" data-id="${esc(u.id)}" type="button">Editar</button>
        ${u.role !== 'admin' ? `<button class="btn-danger user-del" data-id="${esc(u.id)}" type="button">Borrar</button>` : ''}
      </div>
    </div>`).join('');
  list.querySelectorAll('.user-edit').forEach(b => b.addEventListener('click', () => {
    const usr = S.users.find(u => u.id === b.dataset.id);
    if (!usr) return;
    S.editingUserId = usr.id;
    g('userId').value = usr.id;
    g('userNombre').value = usr.nombre;
    g('userEmail').value = usr.email;
    g('userRole').value = usr.role;
    g('userEmpresa').value = usr.empresa || '';
    g('userTelefono').value = usr.telefono || '';
    g('userPassword').value = '';
    g('userSubmitBtn').textContent = 'Guardar cambios';
    g('userCancelEditBtn')?.classList.remove('hidden');
    g('panelUsers')?.scrollIntoView({ behavior: 'smooth' });
  }));
  list.querySelectorAll('.user-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este usuario?')) return;
    try { await api.deleteUser(b.dataset.id); toast('Usuario borrado.'); await loadUsers(); } catch (e) { toast(e.message, 'error'); }
  }));
}
g('userSubmitBtn')?.addEventListener('click', async () => {
  const payload = { nombre: g('userNombre').value.trim(), email: g('userEmail').value.trim(), role: g('userRole').value, empresa: g('userEmpresa').value.trim(), telefono: g('userTelefono').value.trim(), password: g('userPassword').value };
  try {
    if (S.editingUserId) { await api.updateUser(S.editingUserId, payload); toast('Usuario actualizado.'); }
    else { await api.createUser(payload); toast('Usuario creado.'); }
    S.editingUserId = ''; g('userId').value = ''; g('userSubmitBtn').textContent = 'Crear usuario';
    g('userCancelEditBtn')?.classList.add('hidden');
    ['userNombre','userEmail','userPassword','userTelefono'].forEach(id => { if(g(id)) g(id).value = ''; });
    await loadUsers();
  } catch (e) { toast(e.message, 'error'); }
});
g('userCancelEditBtn')?.addEventListener('click', () => {
  S.editingUserId = ''; g('userId').value = ''; g('userSubmitBtn').textContent = 'Crear usuario';
  g('userCancelEditBtn')?.classList.add('hidden');
  ['userNombre','userEmail','userPassword','userTelefono'].forEach(id => { if(g(id)) g(id).value = ''; });
});

// ── REQUESTS ──────────────────────────────────────────────────────────────────
async function loadRequests() {
  if (!isRole('admin')) return;
  try {
    S.requests = await api.getRequests();
    renderRequests();
  } catch (e) { toast(e.message, 'error'); }
}
function renderRequests() {
  const list = g('requestsList');
  if (!list) return;
  if (!S.requests.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><strong>Sin solicitudes</strong><span>Aparecerán cuando un operador solicite acceso.</span></div>'; return; }
  list.innerHTML = S.requests.map(r => `
    <div class="table-row">
      <div><strong>${esc(r.nombre)}</strong><div class="muted">${esc(r.email)}</div></div>
      <div>${esc(r.empresa)}<div class="muted">Unidad ${esc(r.numeroEconomico || '—')}</div></div>
      <div>${esc(r.telefono || '—')}</div>
      <div><span class="badge ${r.status === 'pendiente' ? 'badge-review' : r.status === 'aprobada' ? 'badge-accepted' : 'badge-rejected'}">${esc(r.status)}</span>
      ${r.status === 'pendiente' ? `<div class="row-actions" style="margin-top:8px;"><button class="btn-secondary req-ok" data-id="${esc(r.id)}" type="button">Aprobar</button><button class="btn-danger req-no" data-id="${esc(r.id)}" type="button">Rechazar</button></div>` : `<div class="muted" style="font-size:.75rem;margin-top:4px;">${esc(r.motivo || 'Procesada')}</div>`}
      </div>
    </div>`).join('');
  list.querySelectorAll('.req-ok').forEach(b => b.addEventListener('click', async () => {
    try { await api.updateRequest(b.dataset.id, { status: 'aprobada', motivo: '' }); toast('Solicitud aprobada.'); await loadRequests(); await loadUsers(); } catch (e) { toast(e.message, 'error'); }
  }));
  list.querySelectorAll('.req-no').forEach(b => b.addEventListener('click', async () => {
    const motivo = prompt('Motivo del rechazo:') || 'No autorizado';
    try { await api.updateRequest(b.dataset.id, { status: 'rechazada', motivo }); toast('Solicitud rechazada.'); await loadRequests(); } catch (e) { toast(e.message, 'error'); }
  }));
}

// ── COMPANIES ─────────────────────────────────────────────────────────────────
async function loadCompanies() {
  try {
    S.companies = isRole('admin') ? await api.getCompanies() : await api.pubCompanies();
    renderCompanies();
    fillSel(g('empresa'), S.companies.filter(c => c.activo), 'Selecciona empresa', S.user?.empresa || '');
    fillSel(g('regEmpresa'), S.companies.filter(c => c.activo), 'Selecciona empresa');
    fillSel(g('userEmpresa'), S.companies.filter(c => c.activo), 'Sin empresa');
    fillSel(g('uEmpresa'), S.companies.filter(c => c.activo), 'Selecciona empresa');
    fillSel(g('pEmpresa'), S.companies.filter(c => c.activo), 'Selecciona empresa');
    fillSel(g('ptEmpresa'), S.companies.filter(c => c.activo), 'Selecciona empresa');
    fillSel(g('caEmpresa'), S.companies.filter(c => c.activo), 'Selecciona empresa');
    if (isRole('operador') && S.user?.empresa) {
      if (g('empresa')) g('empresa').value = S.user.empresa;
    }
  } catch (e) { toast(e.message, 'error'); }
}
function renderCompanies() {
  const list = g('companiesList');
  if (!list) return;
  list.innerHTML = S.companies.map(c => `
    <div class="table-row">
      <div><strong>${esc(c.nombre)}</strong><div class="muted">${esc(c.contacto || 'Sin contacto')} · ${esc(c.telefono || '—')}</div><div class="muted">${esc(c.email || '—')}</div></div>
      <div><span class="badge ${c.activo ? 'badge-accepted' : 'badge-rejected'}">${c.activo ? 'Activa' : 'Inactiva'}</span></div>
      <div class="muted" style="font-size:.8rem;">${esc(c.notas || '—')}</div>
      <div class="row-actions">
        <button class="btn-ghost co-edit" data-id="${esc(c.id)}" type="button">Editar</button>
        <button class="btn-ghost co-toggle" data-id="${esc(c.id)}" data-activo="${c.activo}" type="button">${c.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="btn-danger co-del" data-id="${esc(c.id)}" type="button">Eliminar</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.co-edit').forEach(b => b.addEventListener('click', () => {
    const co = S.companies.find(c => c.id === b.dataset.id);
    if (!co) return;
    S.editingCompanyId = co.id;
    g('companyId').value = co.id;
    g('companyNombre').value = co.nombre;
    g('companyContacto').value = co.contacto || '';
    g('companyTelefono').value = co.telefono || '';
    g('companyEmail').value = co.email || '';
    g('companyNotas').value = co.notas || '';
    g('companySubmitBtn').textContent = 'Guardar cambios';
    g('companyCancelEditBtn')?.classList.remove('hidden');
  }));
  list.querySelectorAll('.co-toggle').forEach(b => b.addEventListener('click', async () => {
    try {
      if (b.dataset.activo === 'true') { await api.deactivateCompany(b.dataset.id); toast('Desactivada.'); }
      else { const co = S.companies.find(c => c.id === b.dataset.id); await api.updateCompany(b.dataset.id, { ...co, activo: true }); toast('Activada.'); }
      await loadCompanies();
    } catch (e) { toast(e.message, 'error'); }
  }));
  list.querySelectorAll('.co-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar empresa? Solo si no tiene historial.')) return;
    try { await api.deleteCompany(b.dataset.id); toast('Eliminada.'); await loadCompanies(); } catch (e) { toast(e.message, 'error'); }
  }));
}
g('companySubmitBtn')?.addEventListener('click', async () => {
  const payload = { nombre: g('companyNombre').value.trim(), contacto: g('companyContacto').value.trim(), telefono: g('companyTelefono').value.trim(), email: g('companyEmail').value.trim(), notas: g('companyNotas').value.trim(), activo: true };
  try {
    if (S.editingCompanyId) { await api.updateCompany(S.editingCompanyId, payload); toast('Empresa actualizada.'); }
    else { await api.createCompany(payload); toast('Empresa guardada.'); }
    S.editingCompanyId = ''; g('companyId').value = '';
    g('companySubmitBtn').textContent = 'Guardar empresa';
    g('companyCancelEditBtn')?.classList.add('hidden');
    ['companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas'].forEach(id => { if(g(id)) g(id).value = ''; });
    await loadCompanies();
  } catch (e) { toast(e.message, 'error'); }
});
g('companyCancelEditBtn')?.addEventListener('click', () => {
  S.editingCompanyId = ''; g('companyId').value = '';
  g('companySubmitBtn').textContent = 'Guardar empresa';
  g('companyCancelEditBtn')?.classList.add('hidden');
});

// ── LOGIN/LOGOUT ──────────────────────────────────────────────────────────────
function showLogin() { g('dashboardView')?.classList.add('hidden'); g('loginView')?.classList.remove('hidden'); }
async function showDashboard() {
  g('loginView')?.classList.add('hidden'); g('dashboardView')?.classList.remove('hidden');
  setupForRole();
  const initialPanel = S.user?.role === 'operador' ? 'report' : 'board';
  await Promise.all([loadCompanies(), loadGarantias(), loadUsers(), loadRequests(), loadNotifications()]);
  switchPanel(initialPanel);
}

g('tabLoginBtn')?.addEventListener('click', () => {
  g('loginPane')?.classList.remove('hidden'); g('registerPane')?.classList.add('hidden');
  g('tabLoginBtn')?.classList.add('active'); g('tabRegisterBtn')?.classList.remove('active');
});
g('tabRegisterBtn')?.addEventListener('click', () => {
  g('loginPane')?.classList.add('hidden'); g('registerPane')?.classList.remove('hidden');
  g('tabLoginBtn')?.classList.remove('active'); g('tabRegisterBtn')?.classList.add('active');
});
g('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault(); g('loginError')?.classList.add('hidden');
  try {
    const d = await api.login(g('loginEmail').value.trim(), g('loginPassword').value);
    S.token = d.token; localStorage.setItem('carlabToken', S.token);
    S.user = d.user; await showDashboard();
  } catch (err) {
    const el = g('loginError');
    if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
    else toast(err.message, 'error');
  }
});
g('registerForm')?.addEventListener('submit', async e => {
  e.preventDefault(); g('registerMessage')?.classList.add('hidden');
  try {
    const d = await api.register({ nombre: g('regNombre').value.trim(), email: g('regEmail').value.trim(), telefono: g('regTelefono').value.trim(), empresa: g('regEmpresa').value.trim(), numeroEconomico: g('regNumeroEconomico').value.trim(), password: g('regPassword').value });
    const el = g('registerMessage');
    if (el) { el.textContent = d.message; el.classList.remove('hidden'); }
    g('registerForm')?.reset();
  } catch (err) {
    const el = g('registerMessage');
    if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
  }
});
function logout() { localStorage.removeItem('carlabToken'); S.token = ''; S.user = null; showLogin(); }
g('logoutBtn')?.addEventListener('click', logout);
g('opNavLogout')?.addEventListener('click', logout);

// ── GLOBAL REFRESH ────────────────────────────────────────────────────────────
g('globalRefreshBtn')?.addEventListener('click', async () => {
  await Promise.all([loadGarantias(), loadNotifications()]);
  if (S.activePanel === 'schedule') await loadSchedules();
  if (S.activePanel === 'analytics') await loadAnalytics();
  if (S.activePanel === 'units') await loadUnits();
  if (S.activePanel === 'policies') await loadPolicies();
  if (S.activePanel === 'parts') await loadParts();
  if (S.activePanel === 'campanas') await loadCampanas();
  toast('Datos actualizados.');
});

// ── OPERATOR NAV ──────────────────────────────────────────────────────────────
g('opNavBoard')?.addEventListener('click', () => switchPanel('board'));
g('opNavNew')?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
g('opNavSchedule')?.addEventListener('click', () => switchPanel('schedule'));

// ── SIDEBAR TOGGLE (mobile) ───────────────────────────────────────────────────
g('sidebarToggle')?.addEventListener('click', () => g('sidebar')?.classList.toggle('open'));
document.addEventListener('click', e => {
  const sidebar = g('sidebar');
  const toggle = g('sidebarToggle');
  if (sidebar && !sidebar.contains(e.target) && !toggle?.contains(e.target)) sidebar.classList.remove('open');
});

// ── INIT ──────────────────────────────────────────────────────────────────────
(async () => {
  try { S.companies = await api.pubCompanies(); loadCompanies(); } catch {}
  if (!S.token) return showLogin();
  try {
    const d = await api.me();
    S.user = d.user; await showDashboard();
  } catch {
    localStorage.removeItem('carlabToken'); S.token = ''; showLogin();
  }
})();

// Auto-refresh cada 45s
setInterval(async () => {
  if (!S.token || !S.user) return;
  try {
    await loadNotifications();
    if (S.activePanel === 'schedule') await loadSchedules();
  } catch {}
}, 45000);
