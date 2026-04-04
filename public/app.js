const state = {
  token: localStorage.getItem('carlabToken') || '',
  user: null,
  garantias: [],
  users: [],
  companies: [],
  registrationRequests: [],
  schedules: [],
  currentEvidence: [],
  currentRefEvidence: [],
  drawing: false,
  hasSignature: false,
  activePanel: 'board',
  editingUserId: '',
  editingCompanyId: '',
  fleetUnits: [],
  fleetSummary: { total:0, operando:0, enTaller:0, detenidas:0, programadas:0 },
  selectedFleetUnit: null,
  editingFleetUnitId: '',
  unitHistoryRows: [],
  partsPending: [],
  partsCacheAt: 0,
  partsDirtyIds: new Set(),
  fleetDirty: false,
  unitCostsAdmin: [],
  independentPartsRequests: [],
  editingGarantiaId: '',
  editingFirmaOriginal: '',
  boardDirtyIds: new Set(),
  userEditing: false,
  activeEditorContext: '',
  stockParts: [],
  stockMovements: [],
  cobranzaOverview: null,
  cobranzaQuotes: [],
  directSales: [],
  selectedQuoteId: '',
  directSaleDraftPartId: '',
  quoteDrafts: {},
  directSaleItems: [],
};

const api = {
  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers: { ...headers, 'Cache-Control': 'no-store, no-cache, max-age=0', Pragma: 'no-cache' }, cache: 'no-store' });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_error) {
      if (!response.ok) throw new Error(`Error ${response.status}: el servidor respondió fuera de formato JSON.`);
      throw new Error('La respuesta del servidor no se pudo interpretar.');
    }
    if (!response.ok) throw new Error(data?.error || `Error ${response.status}.`);
    return data;
  },
  login(email, password) { return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); },
  me() { return this.request('/api/auth/me'); },
  getPublicCompanies() { return this.request('/api/public/companies'); },
  registerOperator(payload) { return this.request('/api/public/register-operator', { method: 'POST', body: JSON.stringify(payload) }); },
  getGarantias() { return this.request('/api/garantias'); },
  createGarantia(payload) { return this.request('/api/garantias', { method: 'POST', body: JSON.stringify(payload) }); },
  updateGarantia(id, payload) { return this.request(`/api/garantias/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteGarantia(id) { return this.request(`/api/garantias/${id}`, { method: 'DELETE' }); },
  reviewGarantia(id, payload) { return this.request(`/api/garantias/${id}/review`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  updateOperational(id, payload) { return this.request(`/api/garantias/${id}/operational`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  getUsers() { return this.request('/api/users'); },
  createUser(payload) { return this.request('/api/users', { method: 'POST', body: JSON.stringify(payload) }); },
  updateUser(id, payload) { return this.request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  deleteUser(id) { return this.request(`/api/users/${id}`, { method: 'DELETE' }); },
  getAudit(id) { return this.request(`/api/audit/${id}`); },
  getCompanies() { return this.request('/api/companies'); },
  createCompany(payload) { return this.request('/api/companies', { method: 'POST', body: JSON.stringify(payload) }); },
  updateCompany(id, payload) { return this.request(`/api/companies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  deactivateCompany(id) { return this.request(`/api/companies/${id}/deactivate`, { method: 'PATCH' }); },
  deleteCompany(id) { return this.request(`/api/companies/${id}`, { method: 'DELETE' }); },
  getRequests() { return this.request('/api/registration-requests'); },
  updateRequest(id, payload) { return this.request(`/api/registration-requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  getUnitHistory(numeroEconomico) { return this.request(`/api/history/unit/${encodeURIComponent(numeroEconomico)}`); },
  getSchedules(date='') { return this.request(`/api/schedules${date ? `?date=${encodeURIComponent(date)}` : ''}`); },
  createManualSchedule(payload) { return this.request('/api/schedules/manual', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  requestSchedule(id) { return this.request(`/api/garantias/${id}/request-schedule`, { method: 'POST' }); },
  confirmSchedule(id, payload) { return this.request(`/api/schedules/${id}/confirm`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  cancelSchedule(id, payload) { return this.request(`/api/schedules/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  rescheduleSchedule(id, payload) { return this.request(`/api/schedules/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getPartsPending() { return this.request('/api/parts/pending'); },
  updateParts(id, payload) { return this.request(`/api/garantias/${id}/parts`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getIndependentPartsRequests() { return this.request('/api/parts/requests'); },
  createIndependentPartsRequest(payload) { return this.request('/api/parts/requests', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateIndependentPartsRequest(id, payload) { return this.request(`/api/parts/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getNotifications() { return this.request('/api/notifications'); },

  getFleetSummary() { return this.request('/api/fleet/summary'); },
  getFleetUnits() { return this.request('/api/fleet/units'); },
  getFleetUnit(id) { return this.request(`/api/fleet/units/${id}`); },
  createFleetUnit(payload) { return this.request('/api/fleet/units', { method: 'POST', body: JSON.stringify(payload) }); },
  updateFleetUnit(id, payload) { return this.request(`/api/fleet/units/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  updateFleetStatus(id, payload) { return this.request(`/api/fleet/units/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  deleteFleetUnit(id) { return this.request(`/api/fleet/units/${id}`, { method: 'DELETE' }); },
  createFleetCost(id, payload) { return this.request(`/api/fleet/units/${id}/costs`, { method: 'POST', body: JSON.stringify(payload) }); },
  getFleetCosts(id) { return this.request(`/api/fleet/units/${id}/costs`); },
  updateFleetCost(id, payload) { return this.request(`/api/fleet/costs/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteFleetCost(id) { return this.request(`/api/fleet/costs/${id}`, { method: 'DELETE' }); },
  getStock() { return this.request('/api/stock/parts'); },
  createStockPart(payload) { return this.request('/api/stock/parts', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateStockPart(id, payload) { return this.request(`/api/stock/parts/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteStockPart(id) { return this.request(`/api/stock/parts/${id}`, { method: 'DELETE' }); },
  createStockMovement(id, payload) { return this.request(`/api/stock/parts/${id}/movements`, { method: 'POST', body: JSON.stringify(payload || {}) }); },
  getCobranzaOverview() { return this.request('/api/cobranza/overview'); },
  getCobranzaQuotes() { return this.request('/api/cobranza/quotes'); },
  createQuoteFromReport(id) { return this.request(`/api/cobranza/quotes/from-report/${id}`, { method: 'POST' }); },
  updateQuote(id, payload) { return this.request(`/api/cobranza/quotes/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteQuote(id) { return this.request(`/api/cobranza/quotes/${id}`, { method: 'DELETE' }); },
  replaceQuoteItems(id, payload) { return this.request(`/api/cobranza/quotes/${id}/items`, { method: 'PUT', body: JSON.stringify(payload || {}) }); },
  getDirectSales() { return this.request('/api/cobranza/direct-sales'); },
  createDirectSale(payload) { return this.request('/api/cobranza/direct-sales', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateDirectSale(id, payload) { return this.request(`/api/cobranza/direct-sales/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },

};

const els = {};
function bind() {
  [
    'loginView','dashboardView','loginForm','loginEmail','loginPassword','loginError','registerForm','registerMessage','regNombre','regEmail','regTelefono','regEmpresa','regNumeroEconomico','regPassword',
    'tabLoginBtn','tabRegisterBtn','welcomeText','currentUserName','currentUserEmail','currentRoleBadge','avatarCircle','pageTitle','roleSummaryText','roleBrief','logoutBtn',
    'navBoardBtn','navNewReportBtn','navAnalyticsBtn','navHistoryBtn','navScheduleBtn','navFleetBtn','navPartsBtn','navStockBtn','navCobranzaBtn','navUsersBtn','navRequestsBtn','navCompaniesBtn','reportFormPanel','usersPanel','requestsPanel','companiesPanel','analyticsPanel','historyPanel','schedulePanel','filtersPanel','stockPanel','cobranzaPanel',
    'reportForm','numeroObra','modelo','numeroEconomico','empresa','kilometraje','contactoNombre','telefono','descripcionFallo','solicitaRefaccion','refaccionFields','detalleRefaccion',
    'evidencias','evidenciasRefaccion','previewEvidencias','previewRefaccion','firmaCanvas','clearSignatureBtn','cancelReportBtn','searchInput','validationFilter','operationalFilter',
    'garantiasList','garantiaCardTemplate','statTotal','statNew','statAccepted','statDone','listTitle','boardKicker','statusLegend','userForm','userId','userNombre','userEmail',
    'userRole','userEmpresa','userTelefono','userPassword','userSubmitBtn','userCancelEditBtn','usersList','emptyState','toast','requestsList','companiesList','companyForm','companyId','companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas','companySubmitBtn','companyCancelEditBtn',
    'executiveDeck','executiveDeckGrid','liveRefreshBadge','topCompanies','topModels','topIncidentTypes','repeatUnits','unitHistoryInput','unitHistorySearchInput','unitHistoryBtn','unitHistoryResult','scheduleDateInput','scheduleRefreshBtn','scheduleList','scheduleCalendar','scheduleAlerts','partsPanel','partsRefreshBtn','partsSummary','partsList','globalRefreshBtn','notifSummary','operatorAppNav','opNavHomeBtn','opNavNewBtn','opNavScheduleBtn','opNavLogoutBtn','fleetOwnerDeck','imageLightbox','imageLightboxImg','imageLightboxClose',
    'navFleetBtn','fleetPanel','fleetEmpresa','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota','fleetPolizaActiva','fleetCampaignActiva','fleetSaveBtn','fleetRefreshBtn','fleetUnitsList','fleetDetail','fleetTotal','fleetOperando','fleetTaller','fleetDetenidas','fleetProgramadas','fleetNewBtn','fleetCancelBtn','fleetFormBox','fleetSearchInput','fleetStatusFilter',
    'partsRequestModal','partsRequestClose','partsRequestCancel','partsRequestForm','partsRequestEmpresa','partsRequestUnidad','partsRequestSolicitud','partsRequestPriority','partsRequestNotes','partsRequestOwnerHint','imageLightboxCaption','stockRefreshBtn','stockSummary','stockList','stockMovements','stockPartForm','stockPartId','stockNombre','stockSku','stockProveedor','stockActual','stockMinimo','stockCosto','stockPrecio','stockUbicacion','stockNotas','stockSaveBtn','stockCancelBtn','scheduleManualForm','scheduleManualEmpresa','scheduleManualUnidad','scheduleManualTelefono','scheduleManualFolio','scheduleManualDatetime','scheduleManualContacto','scheduleManualNotes','scheduleManualCancelBtn','cobranzaRefreshBtn','cobranzaSummary','cobranzaQuotesList','cobranzaQuoteDetail','directSaleForm','directSaleCustomer','directSalePhone','directSaleCompany','directSaleUnit','directSaleType','directSaleConcept','directSaleStockPart','directSaleQty','directSalePrice','directSaleMethod','directSalePaymentStatus','directSaleNotes','directSaleAddConceptBtn','directSaleItemsList','directSaleResetBtn','directSalePdfBtn','directSaleTotal','directSalesList','stockAssignModal','stockAssignClose','stockAssignCancel','stockAssignForm','stockAssignPartName','stockAssignPartMeta','stockAssignQty','stockAssignUnit','stockAssignCompany','stockAssignFolio','stockAssignNotes'
  ].forEach(id => els[id] = document.getElementById(id));
}
bind();

const ctx = els.firmaCanvas?.getContext('2d');
if (ctx) {
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111';
}

function roleName(role) { return ({ admin: 'Admin', operador: 'Operador', operativo: 'Operativo', supervisor: 'Supervisor', supervisor_flotas: 'Supervisor flotas' })[role] || role; }
function isRole(...roles) { return state.user && roles.includes(state.user.role); }
function selectedRadio(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function fmtDate(value) { return value ? new Date(value).toLocaleString('es-MX') : '—'; }
function escapeHtml(text='') { return String(text).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
function notify(message, isError = false) {
  if (!els.toast) return alert(message);
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  els.toast.style.background = isError ? 'rgba(219,104,104,.18)' : '';
  clearTimeout(notify._t);
  notify._t = setTimeout(() => { els.toast.classList.add('hidden'); els.toast.style.background = ''; }, 2800);
}
function isInteractiveField(el) {
  return !!(el && (el.matches('input, textarea, select') || el.closest('.parts-request-modal, .parts-edit-box, .independent-request-editor, .action-row')));
}
function updateEditingState(active, context = '') {
  state.userEditing = active;
  state.activeEditorContext = active ? (context || state.activeEditorContext) : '';
}
function detectEditingContext(el) {
  if (!el) return '';
  if (el.closest('#partsPanel, .parts-request-modal')) return 'parts';
  if (el.closest('#boardPanel')) return 'board';
  if (el.closest('#fleetPanel')) return 'fleet';
  if (el.closest('#schedulePanel')) return 'schedule';
  return '';
}
function shouldPauseLiveRefresh(panel = state.activePanel) {
  const active = document.activeElement;
  const modalOpen = (!els.partsRequestModal?.classList.contains('hidden')) || (!els.imageLightbox?.classList.contains('hidden'));
  if (modalOpen) return true;
  if (state.userEditing && (!panel || !state.activeEditorContext || state.activeEditorContext === panel)) return true;
  if (isInteractiveField(active) && (!panel || detectEditingContext(active) === panel)) return true;
  if (panel === 'parts' && state.partsDirtyIds.size) return true;
  if (panel === 'board' && state.boardDirtyIds.size) return true;
  if (panel === 'fleet' && state.fleetDirty) return true;
  return false;
}
document.addEventListener('focusin', (e) => {
  if (isInteractiveField(e.target)) updateEditingState(true, detectEditingContext(e.target));
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const active = document.activeElement;
    if (!isInteractiveField(active)) updateEditingState(false, '');
  }, 0);
});
function badgeClassValidation(status) { return ({ 'nueva':'badge-new','pendiente de revisión':'badge-review','aceptada':'badge-accepted','rechazada':'badge-rejected' })[status] || 'badge-info'; }
function badgeClassOperational(status) { return ({ 'sin iniciar':'badge-info','en proceso':'badge-progress','espera refacción':'badge-waiting','terminada':'badge-done' })[status] || 'badge-info'; }

function partsStatusMeta(status='pendiente') {
  return ({
    pendiente: { label:'Pendiente', note:'Solicitud abierta, en espera de atención.', step:1, cls:'badge-waiting' },
    pedida: { label:'Pedida', note:'La pieza ya fue pedida al proveedor.', step:2, cls:'badge-info' },
    asignada: { label:'Asignada', note:'Ya hay pieza o responsable asignado.', step:2, cls:'badge-info' },
    en_compra: { label:'En compra', note:'Compra o traslado en curso.', step:3, cls:'badge-progress' },
    recibida: { label:'Recibida', note:'La pieza llegó y puede verse en evidencia.', step:4, cls:'badge-accepted' },
    instalada: { label:'Instalada', note:'La refacción quedó colocada en la unidad.', step:5, cls:'badge-done' },
    cancelada: { label:'Cancelada', note:'La solicitud se canceló.', step:0, cls:'badge-rejected' },
    cerrada: { label:'Cerrada', note:'Caso finalizado.', step:5, cls:'badge-done' }
  })[status] || { label:status || 'Pendiente', note:'Seguimiento en curso.', step:1, cls:'badge-info' };
}
function buildPartsTimeline(status='pendiente') {
  const current = partsStatusMeta(status).step;
  const steps = [
    ['Solicitud', 'Alta'],
    ['Asignación', 'Responsable'],
    ['Compra', 'Proveedor'],
    ['Recepción', 'Evidencia'],
    ['Instalación', 'Cierre']
  ];
  return `<div class="parts-stepper">${steps.map((step, idx) => {
    const pos = idx + 1;
    const cls = current >= pos ? 'done' : (current + 1 === pos ? 'current' : '');
    return `<div class="parts-step ${cls}"><span>${pos}</span><strong>${step[0]}</strong><small>${step[1]}</small></div>`;
  }).join('')}</div>`;
}
function buildPartsTrace(item, isIndependent = false) {
  const events = [];
  if (item.createdAt || item.created_at) events.push({ label:'Solicitud levantada', date:item.createdAt || item.created_at, kind:'Alta' });
  const status = item.refaccionStatus || item.status || 'pendiente';
  const meta = partsStatusMeta(status);
  if (status && !['pendiente'].includes(status)) events.push({ label:meta.label, date:item.updatedAt || item.updated_at || item.createdAt || item.created_at, kind:'Estado' });
  const photos = isIndependent ? (item.evidence_photos || []) : (item.evidenciasRefaccion || []);
  if (Array.isArray(photos) && photos.length) events.push({ label:`${photos.length} foto${photos.length === 1 ? '' : 's'} cargada${photos.length === 1 ? '' : 's'}`, date:item.updatedAt || item.updated_at || item.createdAt || item.created_at, kind:'Evidencia' });
  const assigned = item.refaccionAsignada || item.refaccion_asignada;
  if (assigned) events.push({ label:`Asignada: ${assigned}`, date:item.updatedAt || item.updated_at || item.createdAt || item.created_at, kind:'Pieza' });
  return `<div class="parts-trace">${events.slice(0,4).map(evt => `<div class="parts-trace-row"><span>${escapeHtml(evt.kind)}</span><strong>${escapeHtml(evt.label)}</strong><small>${escapeHtml(fmtDate(evt.date))}</small></div>`).join('')}</div>`;
}
function normalizeText(value='') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function fleetSemaforo(unit) {
  const st = unit.manualStatus || unit.estatusOperativo || '';
  if (st === 'terminada' || st === 'sin actividad' || st === 'operando') return { key:'operando', label: 'Operando', cls: 'fleet-ok' };
  if (st === 'en proceso' || st === 'en_taller') return { key:'en_taller', label: 'En taller', cls: 'fleet-warn' };
  if (st === 'espera refacción' || st === 'detenida') return { key:'detenida', label: 'Detenida', cls: 'fleet-bad' };
  if (st === 'aceptada' || st === 'programada') return { key:'programada', label: 'Programada', cls: 'fleet-info' };
  return { key:'operando', label: 'Operando', cls: 'fleet-ok' };
}
function fleetStatusLuxury(unit) {
  const sem = fleetSemaforo(unit);
  if (sem.key === 'operando') return { emoji:'🟢', text:'Sin pendientes', chip:'good' };
  if (sem.key === 'programada') return { emoji:'🟠', text:'Espera programación', chip:'warn' };
  if (sem.key === 'en_taller') return { emoji:'🔴', text:'En taller', chip:'bad' };
  return { emoji:'🟠', text:'Espera refacción', chip:'warn' };
}
function fleetTagPoliza(unit) {
  return unit.polizaActiva ? { text:'Póliza activa', cls:'good' } : { text:'Sin póliza', cls:'neutral' };
}
function fleetTagCampania(unit) {
  return unit.campaignActiva ? { text:'Campaña activa', cls:'warn' } : { text:'Sin campaña', cls:'neutral' };
}
function countBy(items, getter) {
  const map = new Map();
  items.forEach(item => {
    const key = getter(item) || '—';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a,b) => b[1] - a[1]);
}
function fillSelect(select, options, placeholder = 'Selecciona') {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>` + options.map(o => `<option value="${escapeHtml(o.nombre)}">${escapeHtml(o.nombre)}</option>`).join('');
}

function resetSignature() {
  if (!ctx || !els.firmaCanvas) return;
  ctx.clearRect(0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
  state.hasSignature = false;
}
resetSignature();

function loadSignatureFromDataUrl(src) {
  if (!ctx || !els.firmaCanvas || !src) return;
  const img = new Image();
  img.onload = () => {
    resetSignature();
    ctx.drawImage(img, 0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
    state.hasSignature = true;
  };
  img.src = src;
}
function pointerPos(e) { const rect = els.firmaCanvas.getBoundingClientRect(); const point = e.touches ? e.touches[0] : e; return { x: (point.clientX - rect.left) * (els.firmaCanvas.width / rect.width), y: (point.clientY - rect.top) * (els.firmaCanvas.height / rect.height) }; }
function startDraw(e) { state.drawing = true; state.hasSignature = true; const { x, y } = pointerPos(e); ctx.beginPath(); ctx.moveTo(x, y); }
function moveDraw(e) { if (!state.drawing) return; e.preventDefault(); const { x, y } = pointerPos(e); ctx.lineTo(x, y); ctx.stroke(); }
function endDraw() { state.drawing = false; }
if (els.firmaCanvas) {
  ['mousedown','touchstart'].forEach(evt => els.firmaCanvas.addEventListener(evt, startDraw));
  ['mousemove','touchmove'].forEach(evt => els.firmaCanvas.addEventListener(evt, moveDraw, { passive: false }));
  ['mouseup','mouseleave','touchend'].forEach(evt => els.firmaCanvas.addEventListener(evt, endDraw));
}
els.clearSignatureBtn?.addEventListener('click', resetSignature);

async function fileToCompressedDataUrl(file, maxSide = 1600, quality = 0.78) {
  const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
  const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
  const cx = canvas.getContext('2d'); cx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function cancelarCita(id) {
  const reason = window.prompt('Motivo de cancelación:');
  if (reason === null) return;
  try {
    await api.cancelSchedule(id, { reason });
    notify('Cita cancelada.');
    await loadSchedules('');
    await loadNotifications();
  } catch (error) {
    notify(error.message, true);
  }
}

function resetScheduleManualForm(prefill = {}) {
  if (!els.scheduleManualForm) return;
  els.scheduleManualForm.reset();
  if (els.scheduleManualEmpresa) {
    const empresas = [...new Set((state.garantias || []).map(x => x.empresa).filter(Boolean))].sort();
    els.scheduleManualEmpresa.innerHTML = '<option value="">Selecciona empresa</option>' + empresas.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    els.scheduleManualEmpresa.value = prefill.empresa || '';
  }
  const units = (state.fleetUnits || []).filter(u => !els.scheduleManualEmpresa?.value || u.empresa === els.scheduleManualEmpresa.value);
  if (els.scheduleManualUnidad) {
    els.scheduleManualUnidad.innerHTML = '<option value="">Selecciona unidad</option>' + units.map(u => `<option value="${escapeHtml(u.numeroEconomico || '')}">${escapeHtml(u.numeroEconomico || '')} · ${escapeHtml(u.modelo || '')}</option>`).join('');
    els.scheduleManualUnidad.value = prefill.unidad || '';
  }
  if (els.scheduleManualTelefono) els.scheduleManualTelefono.value = prefill.telefono || '';
  if (els.scheduleManualFolio) els.scheduleManualFolio.value = prefill.folio || '';
  if (els.scheduleManualDatetime) els.scheduleManualDatetime.value = prefill.scheduledFor || '';
  if (els.scheduleManualContacto) els.scheduleManualContacto.value = prefill.contactoNombre || '';
  if (els.scheduleManualNotes) els.scheduleManualNotes.value = prefill.notes || '';
}

async function reprogramarCita(id) {
  const item = (state.schedules || []).find(s => s.id === id);
  const current = item?.confirmedFor || item?.scheduledFor || item?.proposedAt || '';
  const scheduledFor = window.prompt('Nueva fecha y hora (ejemplo: 2026-04-10 09:30)', current ? String(current).slice(0,16).replace('T',' ') : '');
  if (!scheduledFor) return;
  const reason = window.prompt('Motivo de reprogramación:') || '';
  try {
    await api.rescheduleSchedule(id, { scheduledFor, reason });
    notify('Cita reprogramada.');
    await loadSchedules('');
    await loadNotifications();
  } catch (error) {
    notify(error.message, true);
  }
}

function drawPreviews(container, items, target = 'evidence') {
  if (!container) return;
  container.innerHTML = '';
  items.forEach((src, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'preview-item';
    const img = document.createElement('img');
    img.src = src;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'preview-remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      if (target === 'ref') state.currentRefEvidence.splice(index, 1);
      else state.currentEvidence.splice(index, 1);
      drawPreviews(container, target === 'ref' ? state.currentRefEvidence : state.currentEvidence, target);
    });
    wrap.appendChild(img);
    wrap.appendChild(remove);
    container.appendChild(wrap);
  });
}

els.evidencias?.addEventListener('change', async e => { const incoming = await Promise.all([...e.target.files].map(file => fileToCompressedDataUrl(file))); state.currentEvidence = [...state.currentEvidence, ...incoming]; drawPreviews(els.previewEvidencias, state.currentEvidence, 'evidence'); e.target.value=''; });
els.evidenciasRefaccion?.addEventListener('change', async e => { const incoming = await Promise.all([...e.target.files].map(file => fileToCompressedDataUrl(file))); state.currentRefEvidence = [...state.currentRefEvidence, ...incoming]; drawPreviews(els.previewRefaccion, state.currentRefEvidence, 'ref'); e.target.value=''; });
els.solicitaRefaccion?.addEventListener('change', () => els.refaccionFields?.classList.toggle('hidden', !els.solicitaRefaccion.checked));

function resetReportForm() {
  els.reportForm?.reset();
  state.currentEvidence = []; state.currentRefEvidence = [];
  drawPreviews(els.previewEvidencias, [], 'evidence'); drawPreviews(els.previewRefaccion, [], 'ref');
  els.refaccionFields?.classList.add('hidden');
  const radio = document.querySelector('input[name="tipoIncidente"][value="daño"]');
  if (radio) radio.checked = true;
  if (isRole('operador') && state.user?.empresa && els.empresa) els.empresa.value = state.user.empresa;
  if (isRole('operador') && els.contactoNombre) els.contactoNombre.value = state.user?.nombre || '';
  if (isRole('operador') && els.telefono) els.telefono.value = state.user?.telefono || '';
  resetSignature();

function loadSignatureFromDataUrl(src) {
  if (!ctx || !els.firmaCanvas || !src) return;
  const img = new Image();
  img.onload = () => {
    resetSignature();
    ctx.drawImage(img, 0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
    state.hasSignature = true;
  };
  img.src = src;
}
}
function resetUserForm() {
  state.editingUserId = '';
  els.userForm?.reset();
  if (els.userId) els.userId.value = '';
  if (els.userSubmitBtn) els.userSubmitBtn.textContent = 'Crear usuario';
  if (els.userPassword) { els.userPassword.required = true; els.userPassword.placeholder = ''; }
  els.userCancelEditBtn?.classList.add('hidden');
}
function resetCompanyForm() {
  state.editingCompanyId = '';
  els.companyForm?.reset();
  if (els.companyId) els.companyId.value = '';
  if (els.companySubmitBtn) els.companySubmitBtn.textContent = 'Guardar empresa';
  els.companyCancelEditBtn?.classList.add('hidden');
}
function toggleFleetForm(show = false) {
  els.fleetFormBox?.classList.toggle('hidden', !show);
  els.fleetCancelBtn?.classList.toggle('hidden', !show);
  if (els.fleetNewBtn) els.fleetNewBtn.textContent = show ? (state.editingFleetUnitId ? 'Editando unidad' : 'Nueva unidad') : 'Nueva unidad';
}
function resetFleetForm() {
  state.fleetDirty = false;
  state.editingFleetUnitId = '';
  ['fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota'].forEach(id => { if (els[id]) els[id].value = ''; });
  if (els.fleetPolizaActiva) els.fleetPolizaActiva.checked = false;
  if (els.fleetCampaignActiva) els.fleetCampaignActiva.checked = false;
  if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = 'Guardar unidad';
  toggleFleetForm(false);
  if (els.fleetEmpresa && !['supervisor','supervisor_flotas'].includes(state.user?.role)) els.fleetEmpresa.value = ''; 
}
function beginFleetEdit(unit) {
  state.editingFleetUnitId = unit.id;
  if (els.fleetEmpresa) els.fleetEmpresa.value = unit.empresa || '';
  if (els.fleetNumeroEconomico) els.fleetNumeroEconomico.value = unit.numeroEconomico || '';
  if (els.fleetNumeroObra) els.fleetNumeroObra.value = unit.numeroObra || '';
  if (els.fleetMarca) els.fleetMarca.value = unit.marca || '';
  if (els.fleetModelo) els.fleetModelo.value = unit.modelo || '';
  if (els.fleetAnio) els.fleetAnio.value = unit.anio || '';
  if (els.fleetKilometraje) els.fleetKilometraje.value = unit.kilometraje || '';
  if (els.fleetNombreFlota) els.fleetNombreFlota.value = unit.nombreFlota || '';
  if (els.fleetPolizaActiva) els.fleetPolizaActiva.checked = !!unit.polizaActiva;
  if (els.fleetCampaignActiva) els.fleetCampaignActiva.checked = !!unit.campaignActiva;
  if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = 'Guardar cambios';
  toggleFleetForm(true);
  els.fleetNumeroEconomico?.focus();
}

function reportPayload() {
  return {
    numeroObra: els.numeroObra?.value.trim(), modelo: els.modelo?.value.trim(), numeroEconomico: els.numeroEconomico?.value.trim(), empresa: els.empresa?.value.trim(), kilometraje: els.kilometraje?.value.trim(),
    contactoNombre: els.contactoNombre?.value.trim(), telefono: els.telefono?.value.trim(), tipoIncidente: selectedRadio('tipoIncidente'), descripcionFallo: els.descripcionFallo?.value.trim(), solicitaRefaccion: els.solicitaRefaccion?.checked,
    detalleRefaccion: els.detalleRefaccion?.value.trim(), evidencias: state.currentEvidence, evidenciasRefaccion: state.currentRefEvidence, firma: state.hasSignature ? els.firmaCanvas.toDataURL('image/jpeg', 0.95) : (state.editingGarantiaId ? state.editingFirmaOriginal : ''),
  };
}

function roleCopy(role) {
  return {
    admin: { title:'Cabina administrativa', summary:'Vista ejecutiva: decide rápido con KPIs y acciones clave.', panels:[['Operación viva','Entradas, validación y avance en una lectura.'],['Comercial','Detecta oportunidad por unidad y reincidencia.'],['Gobierno','Usuarios, empresas y accesos bajo control.']], boardKicker:'ADMIN', listTitle:'Bandeja general del sistema', legend:'KPIs, control y trazabilidad en una sola vista.' },
    operador: { title:'Portal de operador', summary:'Reportas fallas, subes evidencia y ves el estatus sin depender de llamadas.', panels:[['Levantar incidencia','Captura la falla con datos, fotos, refacción y firma.'],['Seguimiento','Consulta si fue aceptada, rechazada o quedó pendiente.'],['Sin cruces','Solo ves tus reportes. No puedes decidir ni alterar revisiones.']], boardKicker:'OPERADOR', listTitle:'Mis reportes de garantía', legend:'Aquí ves solo tus reportes y su estatus actual.' },
    operativo: { title:'Mesa de validación operativa', summary:'Revisas reportes, decides si proceden y mueves el trabajo hasta terminar.', panels:[['Decisión','Acepta, rechaza o marca pendiente de revisión.'],['Flujo','Mueve el trabajo a en proceso, espera refacción o terminada.'],['Patrones','También ves unidades reincidentes para atacar la raíz.']], boardKicker:'OPERATIVO', listTitle:'Bandeja operativa', legend:'Aquí validas, autorizas y avanzas el trabajo.' },
    supervisor: { title:'Portal de supervisor', summary:'Consulta únicamente la información de tu empresa en modo corporativo de solo lectura.', panels:[['Visibilidad','Revisa empresas, unidades, evidencias y avances.'],['Lectura ejecutiva','Historial por unidad y top de fallas sin tocar procesos.'],['Sin edición','No cambias decisiones ni alteras procesos.']], boardKicker:'SUPERVISOR', listTitle:'Bandeja supervisada', legend:'Monitoreo integral con lectura operativa y comercial.' },
    supervisor_flotas: { title:'Centro de flotas Carlab', summary:'Supervisión de unidades, semáforo vivo, historial y lectura por empresa sin tocar usuarios ni validaciones.', panels:[['Semáforo vivo','Detecta qué unidad opera, cuál cayó al taller y cuál reincide.'],['Lectura por unidad','Historial de reportes, costos y último movimiento en una sola vista.'],['Control enfocado','Supervisa flotas sin entrar a módulos ajenos.']], boardKicker:'FLOTAS', listTitle:'Radar de unidades', legend:'Tablero ejecutivo para seguir flota, carga histórica y reincidencia por empresa.' },
  }[role];
}

function updateHeaderForRole() {
  const copy = roleCopy(state.user.role);
  if (els.pageTitle) els.pageTitle.textContent = copy.title;
  if (els.statusLegend) els.statusLegend.textContent = copy.legend;
  if (els.roleSummaryText) els.roleSummaryText.textContent = copy.summary;
  if (els.boardKicker) els.boardKicker.textContent = copy.boardKicker;
  if (els.listTitle) els.listTitle.textContent = copy.listTitle;
  if (els.currentUserName) els.currentUserName.textContent = state.user.nombre;
  if (els.currentUserEmail) els.currentUserEmail.textContent = state.user.email;
  if (els.currentRoleBadge) els.currentRoleBadge.textContent = roleName(state.user.role);
  if (els.welcomeText) els.welcomeText.textContent = `${roleName(state.user.role)} · Sesión activa`;
  if (els.avatarCircle) els.avatarCircle.textContent = state.user.nombre?.[0]?.toUpperCase() || 'C';
  if (els.roleBrief) els.roleBrief.innerHTML = copy.panels.map(([title, desc]) => `<article><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></article>`).join('');
}
function setActiveNav(activeBtn) {
  [els.navBoardBtn,els.navNewReportBtn,els.navAnalyticsBtn,els.navHistoryBtn,els.navScheduleBtn,els.navFleetBtn,els.navPartsBtn,els.navStockBtn,els.navCobranzaBtn,els.navUsersBtn,els.navRequestsBtn,els.navCompaniesBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
  if (activeBtn && !activeBtn.classList.contains('hidden')) activeBtn.classList.add('active');
}

function updateOperatorAppNav(panel) {
  const operatorMode = state.user?.role === 'operador';
  document.body.classList.toggle('operator-mode', !!operatorMode);
  els.operatorAppNav?.classList.toggle('hidden', !operatorMode);
  if (!operatorMode) {
    [els.opNavHomeBtn, els.opNavNewBtn, els.opNavScheduleBtn, els.opNavLogoutBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
    return;
  }
  [els.opNavHomeBtn, els.opNavNewBtn, els.opNavScheduleBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
  if (panel === 'board') els.opNavHomeBtn?.classList.add('active');
  if (panel === 'report') els.opNavNewBtn?.classList.add('active');
  if (panel === 'schedule') els.opNavScheduleBtn?.classList.add('active');
}
function switchPanel(panel) {
  if (state.user?.role === 'supervisor_flotas' && ['users','requests','companies','report','stock','cobranza'].includes(panel)) panel = 'fleet';
  if (!isRole('admin') && ['stock','cobranza'].includes(panel)) panel = state.user?.role === 'supervisor_flotas' ? 'fleet' : 'board';
  if (state.user?.role === 'supervisor' && ['users','requests','companies','fleet','parts','report','stock','cobranza'].includes(panel)) panel = 'board';
  state.activePanel = panel;
  document.getElementById('boardPanel')?.classList.toggle('hidden', panel !== 'board');
  els.reportFormPanel?.classList.toggle('hidden', panel !== 'report');
  els.usersPanel?.classList.toggle('hidden', panel !== 'users');
  els.requestsPanel?.classList.toggle('hidden', panel !== 'requests');
  els.companiesPanel?.classList.toggle('hidden', panel !== 'companies');
  els.analyticsPanel?.classList.toggle('hidden', panel !== 'analytics');
  els.historyPanel?.classList.toggle('hidden', panel !== 'history');
  els.schedulePanel?.classList.toggle('hidden', panel !== 'schedule');
  els.fleetPanel?.classList.toggle('hidden', panel !== 'fleet');
  els.partsPanel?.classList.toggle('hidden', panel !== 'parts');
  els.stockPanel?.classList.toggle('hidden', panel !== 'stock');
  els.cobranzaPanel?.classList.toggle('hidden', panel !== 'cobranza');
  document.body.dataset.panel = panel;
  const board = panel === 'board';
  els.filtersPanel?.classList.toggle('hidden', !board);
  els.executiveDeck?.classList.toggle('hidden', !board);
  if (panel === 'schedule') loadSchedules('');
  if (panel === 'fleet') loadFleet();
  if (panel === 'parts') loadPartsPending();
  if (panel === 'stock') loadStock();
  if (panel === 'cobranza') loadCobranza();
  updateOperatorAppNav(panel);
  setActiveNav(
    panel === 'report' ? els.navNewReportBtn :
    panel === 'users' ? els.navUsersBtn :
    panel === 'requests' ? els.navRequestsBtn :
    panel === 'companies' ? els.navCompaniesBtn :
    panel === 'analytics' ? els.navAnalyticsBtn :
    panel === 'history' ? els.navHistoryBtn :
    panel === 'schedule' ? els.navScheduleBtn :
    panel === 'fleet' ? els.navFleetBtn :
    panel === 'parts' ? els.navPartsBtn :
    panel === 'stock' ? els.navStockBtn :
    panel === 'cobranza' ? els.navCobranzaBtn :
    els.navBoardBtn
  );
  if (panel === 'report') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  els.loginView?.classList.add('hidden'); els.dashboardView?.classList.remove('hidden');
  document.body.classList.toggle('operator-mode', state.user?.role === 'operador');
  document.body.classList.toggle('executive-mode', state.user?.role !== 'operador');
  document.body.dataset.role = state.user?.role || ''; 
  els.navNewReportBtn?.classList.toggle('hidden', !isRole('operador','admin'));
  els.navUsersBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navRequestsBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navCompaniesBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navAnalyticsBtn?.classList.toggle('hidden', !isRole('admin','supervisor','supervisor_flotas','operativo'));
  els.navHistoryBtn?.classList.toggle('hidden', !isRole('admin','supervisor','supervisor_flotas','operativo'));
  els.navScheduleBtn?.classList.toggle('hidden', !isRole('admin','supervisor','supervisor_flotas','operativo','operador'));
  els.navFleetBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas','operativo'));
  els.navPartsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas'));
  els.navStockBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navCobranzaBtn?.classList.toggle('hidden', !isRole('admin'));
  document.querySelectorAll('[data-role-admin-only]').forEach(el => el.classList.toggle('hidden', !isRole('admin')));
  if (state.user?.role === 'supervisor') {
    els.navFleetBtn?.classList.add('hidden');
    els.navPartsBtn?.classList.add('hidden');
    els.navCobranzaBtn?.classList.add('hidden');
    els.navUsersBtn?.classList.add('hidden');
    els.navRequestsBtn?.classList.add('hidden');
    els.navCompaniesBtn?.classList.add('hidden');
  }
  if (state.user?.role === 'supervisor_flotas') {
    els.navUsersBtn?.classList.add('hidden');
    els.navRequestsBtn?.classList.add('hidden');
    els.navCompaniesBtn?.classList.add('hidden');
    els.navNewReportBtn?.classList.add('hidden');
    if (els.navStockBtn) { els.navStockBtn.classList.add('hidden'); els.navStockBtn.style.display = 'none'; }
    if (els.navCobranzaBtn) { els.navCobranzaBtn.classList.add('hidden'); els.navCobranzaBtn.style.display = 'none'; }
  }
  els.navPartsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas'));
  updateHeaderForRole(); switchPanel(state.user?.role === 'operador' ? 'report' : (state.user?.role === 'supervisor_flotas' ? 'fleet' : 'board'));
}
function showLogin() { els.dashboardView?.classList.add('hidden'); els.loginView?.classList.remove('hidden'); els.operatorAppNav?.classList.add('hidden'); document.body.classList.remove('executive-mode','operator-mode'); document.body.dataset.role=''; document.body.dataset.panel='login'; }

function filteredGarantias() {
  const search = els.searchInput?.value.trim().toLowerCase() || '';
  const validation = els.validationFilter?.value || 'todos';
  const operational = els.operationalFilter?.value || 'todos';
  return state.garantias.filter(item => {
    const blob = `${item.folio || ''} ${item.numeroObra} ${item.numeroEconomico} ${item.empresa} ${item.modelo} ${item.descripcionFallo} ${item.contactoNombre || ''} ${item.telefono || ''} ${item.kilometraje || ''}`.toLowerCase();
    return (!search || blob.includes(search)) && (validation === 'todos' || item.estatusValidacion === validation) && (operational === 'todos' || item.estatusOperativo === operational);
  });
}

function resetBoardFilters({ render = true } = {}) {
  if (els.searchInput) els.searchInput.value = '';
  if (els.validationFilter) els.validationFilter.value = 'todos';
  if (els.operationalFilter) els.operationalFilter.value = 'todos';
  if (render) renderGarantias();
}
function updateStats() {
  if (els.statTotal) els.statTotal.textContent = state.garantias.length;
  if (els.statNew) els.statNew.textContent = state.garantias.filter(g => g.estatusValidacion === 'nueva').length;
  if (els.statAccepted) els.statAccepted.textContent = state.garantias.filter(g => g.estatusValidacion === 'aceptada').length;
  if (els.statDone) els.statDone.textContent = state.garantias.filter(g => g.estatusOperativo === 'terminada').length;
}
function renderAnalytics() {
  const makeList = (arr, empty) => arr.length ? `<ul>${arr.slice(0,5).map(([name,count]) => `<li><span>${escapeHtml(name)}</span><strong>${count}</strong></li>`).join('')}</ul>` : empty;
  if (els.topCompanies) els.topCompanies.innerHTML = makeList(countBy(state.garantias, x => x.empresa), 'Sin datos todavía.');
  if (els.topModels) els.topModels.innerHTML = makeList(countBy(state.garantias, x => x.modelo), 'Sin datos todavía.');
  if (els.topIncidentTypes) els.topIncidentTypes.innerHTML = makeList(countBy(state.garantias, x => x.tipoIncidente), 'Sin datos todavía.');
  const repeated = countBy(state.garantias, x => x.numeroEconomico).filter(([,count]) => count > 1);
  if (els.repeatUnits) els.repeatUnits.innerHTML = repeated.length ? `<ul>${repeated.slice(0,6).map(([unit,count]) => `<li><span>Unidad ${escapeHtml(unit)}</span><strong>${count} reportes</strong></li>`).join('')}</ul>` : 'Sin reincidencias fuertes por ahora.';
}

function ensurePdfSpace(doc, y, needed = 20) { if (y + needed > 275) { doc.addPage(); return 18; } return y; }
async function getImageData(src) {
  if (!src) return null;
  if (src.startsWith('data:image/')) return src;
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}
async function addPdfImage(doc, imgSrc, x, y, w, h) {
  const data = await getImageData(imgSrc);
  if (!data) return;
  try { doc.addImage(data, 'PNG', x, y, w, h); } catch { try { doc.addImage(data, 'JPEG', x, y, w, h); } catch {} }
}
async function exportPdf(item) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const logo = await getImageData('/logo.jpg');
  let y = 20;
  const textLine = (text, gap = 7, x = 14) => { doc.text(String(text), x, y); y += gap; };

  doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F');
  if (logo) await addPdfImage(doc, logo, 14, 12, 42, 42);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(18); doc.text('REPORTE DE GARANTÍA', 62, 24);
  doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.text('CARLAB SERVICIOS INTEGRALES', 62, 31);
  doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text(`Folio: ${item.folio || '—'}`, 196, 20, { align: 'right' });
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 27, { align: 'right' });

  y = 50;
  doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, 44, 182, 38, 4, 4, 'F');
  doc.text(`Empresa: ${item.empresa || '—'}`, 18, 54);
  doc.text(`Unidad: ${item.numeroEconomico || '—'}`, 18, 62);
  doc.text(`Modelo: ${item.modelo || '—'}`, 18, 70);
  doc.text(`Obra: ${item.numeroObra || '—'}`, 105, 54);
  doc.text(`KM: ${item.kilometraje || '—'}`, 105, 62);
  doc.text(`Estatus: ${item.estatusValidacion || '—'} / ${item.estatusOperativo || '—'}`, 105, 70);

  y = 92;
  doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, 86, 182, 24, 4, 4, 'F');
  doc.text(`Nombre: ${item.contactoNombre || '—'}`, 18, 96);
  doc.text(`Teléfono: ${item.telefono || '—'}`, 105, 96);
  doc.text(`Reportó: ${item.reportadoPorNombre || '—'}`, 18, 104);
  doc.text(`Revisó: ${item.revisadoPorNombre || '—'}`, 105, 104);

  y = 122;
  doc.setFontSize(12); doc.setTextColor(20, 20, 20); textLine('Descripción de la falla', 8);
  doc.setFontSize(10); doc.setTextColor(55,55,55);
  let split = doc.splitTextToSize(item.descripcionFallo || '—', 178);
  doc.text(split, 14, y); y += split.length * 6 + 6;

  if (item.detalleRefaccion) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Detalle de refacción', 8);
    doc.setFontSize(10); doc.setTextColor(55,55,55); split = doc.splitTextToSize(item.detalleRefaccion, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }
  if (item.observacionesOperativo) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Observaciones del operativo', 8);
    doc.setFontSize(10); doc.setTextColor(55,55,55); split = doc.splitTextToSize(item.observacionesOperativo, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }

  const images = [ ...(item.evidencias || []), ...(item.evidenciasRefaccion || []) ];
  if (images.length) {
    y = ensurePdfSpace(doc, y, 52); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Evidencias fotográficas', 8);
    let x = 14; let rowHeight = 0;
    for (const src of images.slice(0, 6)) {
      if (x > 136) { x = 14; y += rowHeight + 8; rowHeight = 0; }
      y = ensurePdfSpace(doc, y, 48);
      doc.setDrawColor(255,255,255); doc.roundedRect(x, y, 56, 42, 3, 3, 'F');
      await addPdfImage(doc, src, x + 1, y + 1, 54, 40);
      x += 60; rowHeight = Math.max(rowHeight, 42);
    }
    y += rowHeight + 8;
  }
  if (item.firma) {
    y = ensurePdfSpace(doc, y, 42); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Firma', 8);
    doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, y, 90, 28, 3, 3, 'F'); await addPdfImage(doc, item.firma, 16, y + 2, 86, 24); y += 34;
  }
  if (item.estatusValidacion === 'rechazada' && item.observacionesOperativo) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(170, 35, 35); textLine('Motivo de rechazo', 8);
    doc.setFontSize(10); doc.setTextColor(80,80,80); split = doc.splitTextToSize(item.observacionesOperativo, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }

  doc.save(`${item.folio || 'garantia'}_${item.numeroEconomico}_${item.numeroObra}.pdf`);
}

async function showAudit(item) {
  try {
    const logs = await api.getAudit(item.id);
    const text = logs.length ? logs.map(l => `${fmtDate(l.created_at)} · ${l.user_nombre || 'Sistema'} · ${l.accion} · ${l.detalle || ''}`).join('\n\n') : 'Sin movimientos aún.';
    window.alert(text);
  } catch (error) { notify(error.message, true); }
}
function beginUserEdit(user) {
  state.editingUserId = user.id; els.userId.value = user.id; els.userNombre.value = user.nombre; els.userEmail.value = user.email; els.userRole.value = user.role; els.userEmpresa.value = user.empresa || ''; els.userTelefono.value = user.telefono || ''; els.userPassword.value = ''; els.userPassword.required = false; els.userPassword.placeholder = 'Déjala vacía para conservarla'; els.userSubmitBtn.textContent = 'Guardar cambios'; els.userCancelEditBtn.classList.remove('hidden');
}
function button(text, className, onClick) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = className; btn.textContent = text; btn.addEventListener('click', onClick); return btn; }

function renderUsers() {
  if (!els.usersList) return;
  const currentRole = els.userRole?.value || 'operador';
  if (els.userEmpresa) els.userEmpresa.disabled = !['operador','supervisor','supervisor_flotas'].includes(currentRole);
  els.usersList.innerHTML = '';
  state.users.forEach(user => {
    const row = document.createElement('div'); row.className = 'table-row';
    row.innerHTML = `
      <div><strong>${escapeHtml(user.nombre)}</strong><div class="small muted">${escapeHtml(user.email)}</div><div class="small muted">${escapeHtml(user.empresa || 'Sin empresa')}</div></div>
      <div>${roleName(user.role)}</div>
      <div>${escapeHtml(user.telefono || '—')}</div>
      <div><div>${fmtDate(user.createdAt)}</div><div class="action-row" style="margin-top:8px;"></div></div>`;
    const actions = row.querySelector('.action-row');
    actions.appendChild(button('Editar', 'btn btn-ghost', () => beginUserEdit(user)));
    if (user.role !== 'admin') actions.appendChild(button('Borrar', 'btn btn-ghost', async () => { if (!confirm(`¿Borrar a ${user.nombre}?`)) return; try { await api.deleteUser(user.id); notify('Usuario eliminado.'); await loadUsers(); } catch (error) { notify(error.message, true); } }));
    els.usersList.appendChild(row);
  });
}
function renderRequests() {
  if (!els.requestsList) return;
  els.requestsList.innerHTML = '';
  if (!state.registrationRequests.length) { els.requestsList.innerHTML = '<div class="empty-state"><strong>Sin solicitudes.</strong><span>Cuando un operador solicite acceso, aparecerá aquí.</span></div>'; return; }
  state.registrationRequests.forEach(item => {
    const row = document.createElement('div'); row.className = 'table-row';
    row.innerHTML = `
      <div><strong>${escapeHtml(item.nombre)}</strong><div class="small muted">${escapeHtml(item.email)}</div></div>
      <div>${escapeHtml(item.empresa)}</div>
      <div>${escapeHtml(item.telefono || '—')}<div class="small muted">Unidad ${escapeHtml(item.numeroEconomico || '—')}</div></div>
      <div><span class="badge ${item.status === 'pendiente' ? 'badge-review' : item.status === 'aprobada' ? 'badge-accepted' : 'badge-rejected'}">${escapeHtml(item.status)}</span><div class="small muted">${fmtDate(item.createdAt)}</div></div>
      <div class="action-row"></div>`;
    const actions = row.querySelector('.action-row');
    if (item.status === 'pendiente') {
      actions.appendChild(button('Aprobar', 'btn btn-primary', async () => { try { await api.updateRequest(item.id, { status: 'aprobada', motivo: '' }); notify('Solicitud aprobada.'); await loadRequests(); await loadUsers(); } catch (error) { notify(error.message, true); } }));
      actions.appendChild(button('Rechazar', 'btn btn-ghost', async () => { const motivo = prompt('Motivo del rechazo:') || 'No autorizado'; try { await api.updateRequest(item.id, { status: 'rechazada', motivo }); notify('Solicitud rechazada.'); await loadRequests(); } catch (error) { notify(error.message, true); } }));
    } else {
      actions.innerHTML = `<span class="small muted">${escapeHtml(item.motivo || 'Procesada')}</span>`;
    }
    els.requestsList.appendChild(row);
  });
}
function beginCompanyEdit(company) {
  state.editingCompanyId = company.id;
  els.companyId.value = company.id;
  els.companyNombre.value = company.nombre || '';
  els.companyContacto.value = company.contacto || '';
  els.companyTelefono.value = company.telefono || '';
  els.companyEmail.value = company.email || '';
  els.companyNotas.value = company.notas || '';
  els.companySubmitBtn.textContent = 'Guardar cambios';
  els.companyCancelEditBtn.classList.remove('hidden');
}

async function loadNotifications() {
  try {
    const data = await api.getNotifications();
    if (els.notifSummary) els.notifSummary.textContent = `${data.pendingSchedules || 0} agenda · ${data.todaySchedules || 0} hoy`;
    if (els.scheduleAlerts && state.activePanel === 'schedule') {
      const bits = [];
      if (data.pendingSchedules) bits.push(`<div class="alert-card warn">Tienes <strong>${data.pendingSchedules}</strong> propuestas pendientes por confirmar.</div>`);
      if (data.todaySchedules) bits.push(`<div class="alert-card info">Hay <strong>${data.todaySchedules}</strong> citas para hoy.</div>`);
      if (data.newReports) bits.push(`<div class="alert-card soft"><strong>${data.newReports}</strong> reportes nuevos esperando acción.</div>`);
      els.scheduleAlerts.innerHTML = bits.join('');
    }
  } catch {}
}

async function loadSchedules(_date = '') {
  if (!isRole('admin','operativo','supervisor','supervisor_flotas','operador')) return;
  state.schedules = await api.getSchedules('');
  const today = new Date().toISOString().slice(0,10);
  const existingDates = [...new Set(state.schedules.map(item => String((item.scheduledFor || item.proposedAt || item.requestedAt || '')).slice(0,10)).filter(Boolean))].sort();
  if (els.scheduleDateInput) {
    const current = els.scheduleDateInput.value;
    if (current && existingDates.includes(current)) {
      // keep selected
    } else {
      const preferred = existingDates.find(d => d >= today) || existingDates[0] || today;
      els.scheduleDateInput.value = preferred;
    }
  }
  resetScheduleManualForm();
  renderSchedules();
}

function renderSchedules() {
  if (!els.scheduleList) return;
  const selectedDate = els.scheduleDateInput?.value || new Date().toISOString().slice(0,10);
  if (els.scheduleDateInput && !els.scheduleDateInput.value) els.scheduleDateInput.value = selectedDate;

  const total = state.schedules.length;
  const proposed = state.schedules.filter(item => item.status === 'proposed').length;
  const confirmed = state.schedules.filter(item => item.status === 'confirmed').length;
  const waiting = state.schedules.filter(item => item.status === 'waiting_operator').length;
  const cancelled = state.schedules.filter(item => item.status === 'cancelled').length;

  const schedulesForDay = state.schedules.filter(item => {
    const raw = item.scheduledFor || item.proposedAt || item.requestedAt;
    if (!raw) return false;
    return String(raw).slice(0,10) === selectedDate;
  });

  if (els.scheduleCalendar) {
    const current = new Date(`${selectedDate}T00:00:00`);
    const year = current.getFullYear();
    const month = current.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startWeek = (first.getDay() + 6) % 7;
    const days = [];
    const groupedDates = [...new Set(state.schedules.map(item => {
      const raw = item.scheduledFor || item.proposedAt || item.requestedAt;
      return raw ? String(raw).slice(0,10) : '';
    }).filter(Boolean))].sort();
    for (let i = 0; i < startWeek; i++) days.push('<div class="calendar-cell empty"></div>');
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = new Date(year, month, d).toISOString().slice(0,10);
      const items = state.schedules.filter(item => {
        const raw = item.scheduledFor || item.proposedAt || item.requestedAt;
        return raw && String(raw).slice(0,10) === iso;
      });
      const count = items.length;
      const cls = iso === selectedDate ? 'calendar-cell active' : 'calendar-cell';
      const dot = items.some(x => x.status === 'confirmed') ? '<strong></strong>' : items.some(x => x.status === 'proposed') ? '<b></b>' : '<em>·</em>';
      days.push(`<button type="button" class="${cls}" data-date="${iso}"><span>${d}</span>${count ? `<small>${count}</small>${dot}` : '<em>·</em>'}</button>`);
    }
    const chips = groupedDates.length
      ? `<div class="schedule-date-chips">${groupedDates.map(iso => {
          const label = new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
          const active = iso === selectedDate ? 'active' : '';
          return `<button type="button" class="date-chip ${active}" data-date="${iso}"><span class="dot"></span>${label}</button>`;
        }).join('')}</div>`
      : '<div class="empty-state compact-empty"><strong>Sin fechas registradas.</strong><span>Cuando el operador proponga o se confirme una cita, aparecerá aquí.</span></div>';
    els.scheduleCalendar.innerHTML = `
      <div class="schedule-summary schedule-summary-pro">
        <div class="stat"><span>Total</span><strong>${total}</strong><small>Movimientos</small></div>
        <div class="stat"><span>Propuestas</span><strong>${proposed}</strong><small>Pendientes</small></div>
        <div class="stat"><span>Confirmadas</span><strong>${confirmed}</strong><small>Activas</small></div>
        <div class="stat"><span>Por responder</span><strong>${waiting}</strong><small>WhatsApp</small></div>
        <div class="stat"><span>Canceladas</span><strong>${cancelled}</strong><small>Histórico</small></div>
      </div>
      ${chips}
      <div class="calendar-head">${['L','M','M','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}</div>
      <div class="calendar-grid">${days.join('')}</div>
    `;
    els.scheduleCalendar.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', async () => {
      if (els.scheduleDateInput) els.scheduleDateInput.value = btn.dataset.date;
      renderSchedules();
    }));
  }

  els.scheduleList.innerHTML = '';
  if (!schedulesForDay.length) {
    els.scheduleList.innerHTML = '<div class="empty-state"><strong>Sin unidades programadas para esta fecha.</strong><span>Programa manualmente, confirma propuestas o reprograma desde aquí.</span></div>';
    return;
  }

  schedulesForDay.forEach(item => {
    const row = document.createElement('article');
    row.className = 'schedule-card schedule-card-pro';
    const whenText = item.originalText || fmtDate(item.confirmedFor || item.scheduledFor || item.proposedAt || item.requestedAt);
    row.innerHTML = `
      <div class="schedule-card-main">
        <div>
          <div class="topbar-kicker">${escapeHtml(item.status || 'programada')}</div>
          <strong>${escapeHtml(item.folio || 'MANUAL')} · Unidad ${escapeHtml(item.unidad || '—')}</strong>
          <div class="small muted">${escapeHtml(item.empresa || '—')} · ${escapeHtml(item.contactoNombre || '—')}</div>
        </div>
        <span class="badge ${item.status === 'confirmed' ? 'badge-accepted' : item.status === 'proposed' ? 'badge-review' : item.status === 'cancelled' ? 'badge-rejected' : 'badge-info'}">${escapeHtml(item.status)}</span>
      </div>
      <div class="schedule-card-meta schedule-card-meta-pro">
        <div><span class="label">Fecha / hora</span><strong>${escapeHtml(whenText)}</strong></div>
        <div><span class="label">Teléfono</span><strong>${escapeHtml(item.telefono || '—')}</strong></div>
        <div><span class="label">Notas</span><strong>${escapeHtml(item.notes || 'Sin notas')}</strong></div>
      </div>
      <div class="action-row schedule-actions-row"></div>`;
    const actions = row.querySelector('.action-row');
    if (isRole('admin','operativo') && item.status === 'proposed') {
      actions.appendChild(button('Confirmar', 'btn btn-primary', async () => {
        try {
          await api.confirmSchedule(item.id, { status:'confirmed', scheduledFor: item.scheduledFor || item.proposedAt, notes: item.notes || '' });
          notify('Cita confirmada.'); await loadSchedules(selectedDate); await loadNotifications();
        } catch (error) { notify(error.message, true); }
      }));
      actions.appendChild(button('Recomendar +1h', 'btn btn-secondary', async () => {
        const base = new Date(item.scheduledFor || item.proposedAt || item.requestedAt);
        const recommended = new Date(base.getTime() + 60*60*1000);
        try {
          await api.confirmSchedule(item.id, { status:'confirmed', scheduledFor: recommended.toISOString(), notes: `Horario recomendado por admin: ${recommended.toLocaleString('es-MX')}` });
          notify('Se confirmó con horario recomendado.'); await loadSchedules(selectedDate); await loadNotifications();
        } catch (error) { notify(error.message, true); }
      }));
    }
    if (isRole('admin','operativo') && item.status === 'waiting_operator') {
      actions.appendChild(button('Programar manual', 'btn btn-primary', async () => { await reprogramarCita(item.id); }));
    }
    if (isRole('admin','operativo','supervisor_flotas') && ['proposed','confirmed','waiting_operator'].includes(item.status)) {
      actions.appendChild(button('Reprogramar', 'btn btn-secondary', async () => { await reprogramarCita(item.id); }));
      actions.appendChild(button('Cancelar', 'btn btn-ghost', async () => { await cancelarCita(item.id); }));
    }
    els.scheduleList.appendChild(row);
  });
}




async function loadAdminUnitCosts(unitId) {
  if (!isRole('admin') || !unitId) return;
  try {
    state.unitCostsAdmin = await api.getFleetCosts(unitId);
  } catch (error) {
    state.unitCostsAdmin = [];
    notify(error.message, true);
  }
}

async function guardarCostoAdmin(costId, unitId) {
  try {
    const tipo = document.getElementById(`adminCostTipo_${costId}`)?.value || '';
    const concepto = document.getElementById(`adminCostConcepto_${costId}`)?.value || '';
    const monto = Number(document.getElementById(`adminCostMonto_${costId}`)?.value || 0);
    await api.updateFleetCost(costId, { tipo, concepto, monto });
    notify('Costo actualizado.');
    await loadAdminUnitCosts(unitId);
    renderFleetDetail();
  } catch (error) {
    notify(error.message, true);
  }
}

async function eliminarCostoAdmin(costId, unitId) {
  if (!window.confirm('¿Eliminar este costo?')) return;
  try {
    await api.deleteFleetCost(costId);
    notify('Costo eliminado.');
    await loadAdminUnitCosts(unitId);
    await loadFleet();
    renderFleetDetail();
  } catch (error) {
    notify(error.message, true);
  }
}


async function guardarSolicitudIndependiente(id) {
  try {
    const status = document.getElementById(`indReqStatus_${id}`)?.value || 'pendiente';
    const notes = document.getElementById(`indReqNotes_${id}`)?.value || '';
    await api.updateIndependentPartsRequest(id, { status, notes });
    notify('Solicitud actualizada.');
    await cargarSolicitudesIndependientes();
    if (state.activePanel === 'parts') renderPartsPending();
  } catch (error) {
    notify(error.message, true);
  }
}

async function cargarSolicitudesIndependientes() {
  if (!isRole('admin','supervisor_flotas')) return;
  try {
    state.independentPartsRequests = await api.getIndependentPartsRequests();
  } catch (error) {
    state.independentPartsRequests = [];
  }
}

function updatePartsRequestUnitOptions() {
  if (!els.partsRequestUnidad) return;
  const empresa = els.partsRequestEmpresa?.value || '';
  const units = (state.fleetUnits || []).filter(unit => !empresa || unit.empresa === empresa);
  const unique = [...new Set(units.map(unit => unit.numeroEconomico).filter(Boolean))].sort();
  const current = els.partsRequestUnidad.value;
  els.partsRequestUnidad.innerHTML = '<option value="">Sin unidad ligada</option>' + unique.map(unit => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join('');
  if (current && unique.includes(current)) els.partsRequestUnidad.value = current;
}
function openIndependentRequestModal(prefill = {}) {
  if (!els.partsRequestModal || !els.partsRequestForm) return;
  const empresas = [...new Set((state.companies || []).map(c => c.nombre).filter(Boolean))].sort();
  els.partsRequestEmpresa.innerHTML = empresas.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  els.partsRequestEmpresa.value = prefill.empresa || (isRole('supervisor_flotas') ? (state.user?.empresa || empresas[0] || '') : (empresas[0] || ''));
  updatePartsRequestUnitOptions();
  els.partsRequestUnidad.value = prefill.numeroEconomico || '';
  els.partsRequestSolicitud.value = prefill.solicitud || '';
  els.partsRequestPriority.value = prefill.priority || 'media';
  els.partsRequestNotes.value = prefill.notes || '';
  if (els.partsRequestOwnerHint) els.partsRequestOwnerHint.textContent = isRole('supervisor_flotas') ? 'Se crea ligada a tu empresa y visible para el dueño en tiempo real.' : 'Alta premium de solicitud independiente con trazabilidad y evidencia.';
  els.partsRequestModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  updateEditingState(true, 'parts');
  setTimeout(() => els.partsRequestSolicitud?.focus(), 20);
}
function closeIndependentRequestModal() {
  els.partsRequestModal?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  els.partsRequestForm?.reset();
  updateEditingState(false, '');
}
async function crearSolicitudIndependienteRefaccion() {
  openIndependentRequestModal();
}

async function loadPartsPending(force = false) {
  if (!isRole('admin','supervisor_flotas')) return;
  if (!force && (state.partsDirtyIds.size || shouldPauseLiveRefresh('parts'))) return;
  const now = Date.now();
  if (!force && state.partsPending.length && now - state.partsCacheAt < 30000) {
    renderPartsPending();
    return;
  }
  try {
    if (els.partsList) els.partsList.innerHTML = '<div class="parts-empty">Cargando refacciones pendientes…</div>';
    const data = await api.getPartsPending();
    state.partsPending = data || [];
    state.partsCacheAt = Date.now();
    renderPartsPending();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderPartsPending() {
  if (!els.partsList) return;
  const items = state.partsPending || [];
  const extras = (state.independentPartsRequests || []).filter(req => !['instalada','cerrada','cancelada'].includes(String(req.status || '').toLowerCase()));
  const unidades = [...new Set([...items.map(item => item.numeroEconomico), ...extras.map(item => item.numero_economico)].filter(Boolean))].length;
  const empresas = [...new Set([...items.map(item => item.empresa), ...extras.map(item => item.empresa)].filter(Boolean))].length;
  const fotos = items.reduce((sum, item) => sum + (Array.isArray(item.evidenciasRefaccion) ? item.evidenciasRefaccion.length : 0), 0) + extras.reduce((sum, item) => sum + (Array.isArray(item.evidence_photos) ? item.evidence_photos.length : 0), 0);

  if (els.partsSummary) {
    els.partsSummary.innerHTML = `
      <article class="parts-summary-card glass-card"><strong>Pendientes</strong><span>${items.length + extras.length}</span><small>Casos activos</small></article>
      <article class="parts-summary-card"><strong>Unidades</strong><span>${unidades}</span><small>Con movimiento en refacciones</small></article>
      <article class="parts-summary-card"><strong>Empresas</strong><span>${empresas}</span><small>Atendidas en esta vista</small></article>
      <article class="parts-summary-card"><strong>Fotos</strong><span>${fotos}</span><small>Evidencia visible para dueño</small></article>
      <article class="parts-summary-action-card">
        <div>
          <strong>Alta premium</strong>
          <p>Levanta una solicitud independiente con empresa, unidad, prioridad y notas.</p>
        </div>
        <button id="newIndependentPartBtn" class="btn btn-primary" type="button">Solicitar refacción</button>
      </article>
    `;
    document.getElementById('newIndependentPartBtn')?.addEventListener('click', crearSolicitudIndependienteRefaccion);
  }

  if (!items.length && !extras.length) {
    els.partsList.innerHTML = '<div class="parts-empty"><strong>No hay refacciones pendientes.</strong><div>Cuando una unidad quede a la espera de pieza o una refacción se marque pendiente, aparecerá aquí.</div></div>';
    return;
  }

  els.partsList.innerHTML = '';
  extras.forEach(req => {
    const photos = Array.isArray(req.evidence_photos) ? req.evidence_photos : [];
    const meta = partsStatusMeta(req.status || 'pendiente');
    const extra = document.createElement('article');
    extra.className = 'parts-card independent-parts-card pro-card';
    extra.innerHTML = `
      <div class="parts-card-head">
        <div>
          <div class="parts-kicker">${escapeHtml(req.empresa || '—')} · independiente</div>
          <h4>Solicitud estratégica</h4>
          <p class="parts-subcopy">${escapeHtml(req.solicitud || '')}</p>
        </div>
        <span class="badge ${meta.cls}">${escapeHtml(meta.label)}</span>
      </div>
      ${buildPartsTimeline(req.status || 'pendiente')}
      <div class="parts-premium-grid">
        <div class="parts-stack-card">
          <div class="parts-field-grid two-col">
            <div><span class="label">Unidad</span><strong>${escapeHtml(req.numero_economico || 'Sin unidad ligada')}</strong></div>
            <div><span class="label">Creada</span><strong>${escapeHtml(fmtDate(req.created_at))}</strong></div>
          </div>
          <div class="parts-trace-head"><strong>Trazabilidad</strong><small>${escapeHtml(meta.note)}</small></div>
          ${buildPartsTrace(req, true)}
        </div>
        <div class="parts-stack-card">
          <div class="parts-media-label">Evidencia de llegada / compra</div>
          ${buildImageGallery(photos, 'Todavía no hay fotos cargadas para esta solicitud.')}
        </div>
      </div>
      <div class="parts-edit-shell">
        <div class="parts-edit-header"><strong>Actualizar solicitud</strong><small>Sin recargas intrusivas mientras escribes.</small></div>
        <div class="independent-request-editor pro-editor">
          <label><span>Estatus</span><select id="indReqStatus_${req.id}">${['pendiente','pedida','asignada','recibida','instalada','cancelada','cerrada'].map(opt => `<option value="${opt}" ${req.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select></label>
          <label><span>Notas</span><input id="indReqNotes_${req.id}" value="${escapeHtml(req.notes || '')}" placeholder="Notas" /></label>
          ${isRole('admin') ? `<label><span>Fotos de llegada</span><input id="indReqPhotos_${req.id}" type="file" accept="image/*" multiple /></label>` : ''}
          <button class="btn btn-primary" type="button" data-save-ind="${req.id}">Guardar</button>
        </div>
      </div>
    `;
    els.partsList.appendChild(extra);

    [document.getElementById(`indReqStatus_${req.id}`), document.getElementById(`indReqNotes_${req.id}`), document.getElementById(`indReqPhotos_${req.id}`)].forEach(el => {
      el?.addEventListener('input', () => state.partsDirtyIds.add(`ind-${req.id}`));
      el?.addEventListener('change', () => state.partsDirtyIds.add(`ind-${req.id}`));
    });

    extra.querySelector(`[data-save-ind="${req.id}"]`)?.addEventListener('click', async () => {
      try {
        const fileInput = document.getElementById(`indReqPhotos_${req.id}`);
        const incoming = isRole('admin') ? await uploadPartsImages(fileInput) : [];
        await api.updateIndependentPartsRequest(req.id, {
          status: document.getElementById(`indReqStatus_${req.id}`)?.value || 'pendiente',
          notes: document.getElementById(`indReqNotes_${req.id}`)?.value || '',
          evidencePhotos: [...photos, ...incoming]
        });
        state.partsDirtyIds.delete(`ind-${req.id}`);
        notify('Solicitud de refacción actualizada.');
        await cargarSolicitudesIndependientes();
        renderPartsPending();
      } catch (error) {
        notify(error.message, true);
      }
    });
  });

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'parts-card pro-card spaced';
    const photos = Array.isArray(item.evidenciasRefaccion) ? item.evidenciasRefaccion : [];
    const meta = partsStatusMeta(item.refaccionStatus || 'pendiente');
    const adminEditor = isRole('admin') ? `
      <div class="parts-edit-shell">
        <div class="parts-edit-header"><strong>Control admin / operativo</strong><small>Documenta la pieza, el estado y la evidencia sin salir de la tarjeta.</small></div>
        <div class="parts-edit-box pro-editor">
          <label><span>Detalle</span><textarea id="partsDetail_${item.id}" rows="4" placeholder="Detalle de refacción">${escapeHtml(item.detalleRefaccion || '')}</textarea></label>
          <div class="parts-edit-grid">
            <label><span>Refacción asignada</span><input id="partsAssigned_${item.id}" placeholder="Refacción asignada" value="${escapeHtml(item.refaccionAsignada || '')}" /></label>
            <label><span>Estado</span><select id="partsStatus_${item.id}">
              <option value="pendiente" ${(item.refaccionStatus || 'pendiente') === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="asignada" ${item.refaccionStatus === 'asignada' ? 'selected' : ''}>Asignada</option>
              <option value="en_compra" ${item.refaccionStatus === 'en_compra' ? 'selected' : ''}>En compra</option>
              <option value="recibida" ${item.refaccionStatus === 'recibida' ? 'selected' : ''}>Recibida</option>
              <option value="instalada" ${item.refaccionStatus === 'instalada' ? 'selected' : ''}>Instalada</option>
            </select></label>
          </div>
          <label><span>Fotos de compra / llegada</span><input id="partsPhotos_${item.id}" type="file" accept="image/*" multiple /></label>
          <div class="parts-edit-actions"><button class="btn btn-primary" data-parts-save="${item.id}" type="button">Guardar actualización</button></div>
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="parts-card-head">
        <div>
          <div class="parts-kicker">${escapeHtml(item.empresa || '—')}</div>
          <h4>Unidad ${escapeHtml(item.numeroEconomico || '—')}</h4>
          <p class="parts-subcopy">${escapeHtml(item.detalleRefaccion || 'Refacción pendiente sin detalle específico')}</p>
        </div>
        <span class="badge ${meta.cls}">${escapeHtml(meta.label)}</span>
      </div>
      ${buildPartsTimeline(item.refaccionStatus || 'pendiente')}
      <div class="parts-premium-grid">
        <div class="parts-stack-card">
          <div class="parts-field-grid">
            <div><span class="label">Folio</span><strong>${escapeHtml(item.folio || '—')}</strong></div>
            <div><span class="label">Modelo</span><strong>${escapeHtml(item.modelo || '—')}</strong></div>
            <div><span class="label">Estado operativo</span><strong>${escapeHtml(item.estatusOperativo || 'sin iniciar')}</strong></div>
            <div><span class="label">Asignada</span><strong>${escapeHtml(item.refaccionAsignada || 'Sin asignar')}</strong></div>
          </div>
          <div class="parts-trace-head"><strong>Trazabilidad</strong><small>${escapeHtml(meta.note)}</small></div>
          ${buildPartsTrace(item, false)}
        </div>
        <div class="parts-stack-card">
          <div class="parts-media-label">Evidencia visible para dueño / supervisor</div>
          ${buildImageGallery(photos, 'Sin fotos de compra o llegada todavía.')}
        </div>
      </div>
      ${adminEditor}
    `;
    els.partsList.appendChild(card);

    if (isRole('admin')) {
      const inputs = [card.querySelector(`#partsDetail_${item.id}`), card.querySelector(`#partsAssigned_${item.id}`), card.querySelector(`#partsStatus_${item.id}`), card.querySelector(`#partsPhotos_${item.id}`)];
      inputs.forEach(el => {
        el?.addEventListener('input', () => state.partsDirtyIds.add(item.id));
        el?.addEventListener('change', () => state.partsDirtyIds.add(item.id));
      });

      card.querySelector(`[data-parts-save="${item.id}"]`)?.addEventListener('click', async () => {
        try {
          const incoming = await uploadPartsImages(document.getElementById(`partsPhotos_${item.id}`));
          await api.updateParts(item.id, {
            detalleRefaccion: document.getElementById(`partsDetail_${item.id}`)?.value || '',
            refaccionAsignada: document.getElementById(`partsAssigned_${item.id}`)?.value || '',
            refaccionStatus: document.getElementById(`partsStatus_${item.id}`)?.value || 'pendiente',
            evidenciasRefaccion: [...photos, ...incoming]
          });
          state.partsDirtyIds.delete(item.id);
          notify('Refacción actualizada.');
          await loadPartsPending(true);
          await loadGarantias();
          if (state.activePanel === 'fleet') await loadFleet();
        } catch (error) {
          notify(error.message, true);
        }
      });
    }
  });
}


function resetStockForm() {
  els.stockPartForm?.reset();
  if (els.stockPartId) els.stockPartId.value = '';
  if (els.stockSaveBtn) els.stockSaveBtn.textContent = 'Guardar refacción';
  if (els.stockActual) els.stockActual.disabled = false;
}

function stockStatus(part) {
  if (Number(part.stockActual || 0) <= 0) return { text:'Sin stock', cls:'badge-rejected' };
  if (Number(part.stockActual || 0) <= Number(part.stockMinimo || 0)) return { text:'Stock bajo', cls:'badge-review' };
  return { text:'Disponible', cls:'badge-accepted' };
}

async function loadStock(force = false) {
  if (!isRole('admin')) return;
  try {
    const data = await api.getStock();
    state.stockParts = data.parts || [];
    state.stockMovements = data.movements || [];
    renderStock();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderStock() {
  if (els.stockSummary) {
    const total = state.stockParts.length;
    const bajas = state.stockParts.filter(p => Number(p.stockActual || 0) <= Number(p.stockMinimo || 0)).length;
    const valor = state.stockParts.reduce((sum,p) => sum + (Number(p.stockActual || 0) * Number(p.costoUnitario || 0)), 0);
    els.stockSummary.innerHTML = `
      <article class="parts-summary-card glass-card"><strong>Catálogo</strong><span>${total}</span><small>Refacciones registradas</small></article>
      <article class="parts-summary-card"><strong>Stock bajo</strong><span>${bajas}</span><small>Requieren atención</small></article>
      <article class="parts-summary-card"><strong>Valor inventario</strong><span>${money(valor)}</span><small>Costo actual</small></article>
      <article class="parts-summary-card"><strong>Movimientos</strong><span>${state.stockMovements.length}</span><small>Trazabilidad reciente</small></article>`;
  }
  if (els.stockMovements) {
    els.stockMovements.innerHTML = state.stockMovements.length ? state.stockMovements.map(m => `
      <div class="table-row rich-row">
        <div><strong>${escapeHtml(m.partName || 'Refacción')}</strong><div class="small muted">${escapeHtml(m.tipo)} · ${escapeHtml(m.unidad || m.empresa || 'mostrador')}</div></div>
        <div>${Number(m.cantidad || 0)}</div>
        <div>${escapeHtml(fmtDate(m.createdAt))}</div>
      </div>`).join('') : '<div class="muted">Sin movimientos todavía.</div>';
  }
  if (els.stockList) {
    els.stockList.innerHTML = state.stockParts.length ? state.stockParts.map(part => {
      const st = stockStatus(part);
      return `
      <article class="owner-card stock-card">
        <div class="owner-card-head"><strong>${escapeHtml(part.nombre)}</strong><span class="badge ${st.cls}">${st.text}</span></div>
        <div class="parts-field-grid two-col">
          <div><span class="label">SKU</span><strong>${escapeHtml(part.sku || '—')}</strong></div>
          <div><span class="label">Proveedor</span><strong>${escapeHtml(part.proveedor || '—')}</strong></div>
          <div><span class="label">Stock</span><strong>${Number(part.stockActual || 0)}</strong></div>
          <div><span class="label">Mínimo</span><strong>${Number(part.stockMinimo || 0)}</strong></div>
          <div><span class="label">Costo</span><strong>${money(part.costoUnitario || 0)}</strong></div>
          <div><span class="label">Venta</span><strong>${money(part.precioVenta || 0)}</strong></div>
        </div>
        <div class="stock-card-actions">
          <button class="btn btn-secondary" type="button" data-stock-edit="${part.id}">Editar</button>
          <button class="btn btn-primary" type="button" data-stock-in="${part.id}">Entrada</button>
          <button class="btn btn-secondary" type="button" data-stock-unit="${part.id}">Poner a camión</button>
          <button class="btn btn-ghost" type="button" data-stock-sale="${part.id}">Venta</button>
          <button class="btn btn-ghost" type="button" data-stock-delete="${part.id}">Eliminar</button>
        </div>
        <div class="small muted">${escapeHtml(part.ubicacion || 'Sin ubicación')} · ${escapeHtml(part.notas || 'Sin notas')}</div>
      </article>`;
    }).join('') : '<div class="empty-state"><strong>Sin refacciones en stock.</strong><span>Da de alta las piezas que quieres controlar en inventario.</span></div>';

    els.stockList.querySelectorAll('[data-stock-edit]').forEach(btn => btn.addEventListener('click', () => {
      const part = state.stockParts.find(p => p.id === btn.dataset.stockEdit);
      if (!part) return;
      els.stockPartId.value = part.id;
      els.stockNombre.value = part.nombre || '';
      els.stockSku.value = part.sku || '';
      els.stockProveedor.value = part.proveedor || '';
      els.stockActual.value = Number(part.stockActual || 0);
      els.stockActual.disabled = true;
      els.stockMinimo.value = Number(part.stockMinimo || 0);
      els.stockCosto.value = Number(part.costoUnitario || 0);
      els.stockPrecio.value = Number(part.precioVenta || 0);
      els.stockUbicacion.value = part.ubicacion || '';
      els.stockNotas.value = part.notas || '';
      els.stockSaveBtn.textContent = 'Actualizar refacción';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    const askMovement = async (id, tipo) => {
      const cantidad = window.prompt(tipo === 'entrada' ? 'Cantidad de entrada:' : 'Cantidad:');
      if (!cantidad) return;
      const notas = window.prompt('Notas del movimiento:') || '';
      try {
        await api.createStockMovement(id, { tipo, cantidad, unidad:'', empresa:'', garantiaFolio:'', notas });
        notify('Movimiento registrado.');
        await loadStock(true);
      } catch (error) { notify(error.message, true); }
    };
    els.stockList.querySelectorAll('[data-stock-in]').forEach(btn => btn.addEventListener('click', () => askMovement(btn.dataset.stockIn, 'entrada')));
    els.stockList.querySelectorAll('[data-stock-unit]').forEach(btn => btn.addEventListener('click', () => openStockAssignModal(btn.dataset.stockUnit)));
    els.stockList.querySelectorAll('[data-stock-sale]').forEach(btn => btn.addEventListener('click', () => launchDirectSaleWithPart(btn.dataset.stockSale)));
    els.stockList.querySelectorAll('[data-stock-delete]').forEach(btn => btn.addEventListener('click', async () => { if (!confirm('¿Eliminar esta refacción?')) return; try { await api.deleteStockPart(btn.dataset.stockDelete); notify('Refacción eliminada.'); await loadStock(true); } catch (error) { notify(error.message, true); } }));
  }
}


function openStockAssignModal(partId) {
  const part = state.stockParts.find(item => String(item.id) === String(partId));
  if (!part || !els.stockAssignModal) return;
  state.selectedStockPartId = part.id;
  if (els.stockAssignPartName) els.stockAssignPartName.value = part.nombre || '';
  if (els.stockAssignPartMeta) els.stockAssignPartMeta.textContent = `Disponible: ${Number(part.stockActual || 0)} · Venta ${money(part.precioVenta || 0)} · Costo ${money(part.costoUnitario || 0)}`;
  if (els.stockAssignQty) els.stockAssignQty.value = '1';
  if (els.stockAssignUnit) els.stockAssignUnit.value = '';
  if (els.stockAssignCompany) els.stockAssignCompany.value = '';
  if (els.stockAssignFolio) els.stockAssignFolio.value = '';
  if (els.stockAssignNotes) els.stockAssignNotes.value = '';
  els.stockAssignModal.classList.remove('hidden');
}
function closeStockAssignModal() { els.stockAssignModal?.classList.add('hidden'); state.selectedStockPartId = ''; }

function resetDirectSaleForm() {
  els.directSaleForm?.reset();
  if (els.directSaleQty) els.directSaleQty.value = '1';
  if (els.directSalePrice) els.directSalePrice.value = '0';
  if (els.directSalePaymentStatus) els.directSalePaymentStatus.value = 'pendiente';
  state.directSaleDraftPartId = '';
  state.directSaleItems = [];
  renderDirectSaleItems();
  syncDirectSalePartDefaults();
}


function syncDirectSalePartDefaults(forcePartDefaults = false) {
  if (!els.directSaleStockPart) return;
  const selectedId = String(state.directSaleDraftPartId || els.directSaleStockPart.value || '');
  if (selectedId) els.directSaleStockPart.value = selectedId;
  const part = state.stockParts.find(p => String(p.id) === String(els.directSaleStockPart?.value || ''));
  if (part) {
    const price = Number(part.precioVenta || part.costoUnitario || 0);
    if (els.directSalePrice && (forcePartDefaults || !Number(els.directSalePrice.value || 0) || state.directSaleDraftPartId)) els.directSalePrice.value = price ? price.toFixed(2) : '0';
    if (els.directSaleConcept && (forcePartDefaults || !els.directSaleConcept.value || state.directSaleDraftPartId)) els.directSaleConcept.value = part.nombre || 'Venta directa';
    if (forcePartDefaults && els.directSaleType) els.directSaleType.value = 'refaccion';
  }
  updateDirectSalePreview();
}

function currentDirectSaleDraftItem() {
  const type = els.directSaleType?.value || 'refaccion';
  const stockPartId = String(els.directSaleStockPart?.value || '');
  const part = state.stockParts.find(item => String(item.id) === stockPartId);
  const qty = Math.max(1, Number(els.directSaleQty?.value || 1));
  const unitPrice = Math.max(0, Number(els.directSalePrice?.value || part?.precioVenta || part?.costoUnitario || 0));
  const concept = String(els.directSaleConcept?.value || '').trim() || part?.nombre || '';
  if (!concept) return null;
  return { stockPartId, description: concept, qty, unitPrice, type };
}

function renderDirectSaleItems() {
  if (!els.directSaleItemsList) return;
  if (!state.directSaleItems.length) {
    els.directSaleItemsList.innerHTML = '<div class="muted">Aún no hay conceptos agregados.</div>';
    return;
  }
  els.directSaleItemsList.innerHTML = state.directSaleItems.map((item, idx) => `
    <div class="direct-sale-item-row">
      <div><strong>${escapeHtml(item.description || 'Concepto')}</strong><div class="small muted">${escapeHtml(item.type || 'refaccion')} · ${item.qty} x ${money(item.unitPrice || 0)}</div></div>
      <div class="stack-inline"><strong>${money((Number(item.qty || 0) * Number(item.unitPrice || 0)))}</strong><button class="btn btn-ghost" type="button" data-direct-sale-remove="${idx}">Quitar</button></div>
    </div>`).join('');
  els.directSaleItemsList.querySelectorAll('[data-direct-sale-remove]').forEach(btn => btn.addEventListener('click', () => {
    state.directSaleItems.splice(Number(btn.dataset.directSaleRemove), 1);
    renderDirectSaleItems();
    updateDirectSalePreview();
  }));
}

function pushCurrentDirectSaleItem() {
  const item = currentDirectSaleDraftItem();
  if (!item) throw new Error('Captura el concepto del producto o servicio para agregarlo.');
  state.directSaleItems.push(item);
  if (els.directSaleConcept) els.directSaleConcept.value = '';
  if (els.directSaleQty) els.directSaleQty.value = '1';
  if (els.directSalePrice) els.directSalePrice.value = '0';
  state.directSaleDraftPartId = '';
  if (els.directSaleStockPart) els.directSaleStockPart.value = '';
  renderDirectSaleItems();
  updateDirectSalePreview();
}

function currentDirectSalePayload(includeDraft = true) {
  const items = [...state.directSaleItems];
  if (includeDraft) {
    const draft = currentDirectSaleDraftItem();
    const looksDuplicated = draft && items.some(item =>
      String(item.stockPartId || '') === String(draft.stockPartId || '') &&
      String(item.description || '') === String(draft.description || '') &&
      Number(item.qty || 0) === Number(draft.qty || 0) &&
      Number(item.unitPrice || 0) === Number(draft.unitPrice || 0)
    );
    if (draft && !looksDuplicated) items.push(draft);
  }
  return {
    customerName: String(els.directSaleCustomer?.value || '').trim() || 'Mostrador',
    customerPhone: String(els.directSalePhone?.value || '').trim(),
    companyName: String(els.directSaleCompany?.value || '').trim(),
    unitNumber: String(els.directSaleUnit?.value || '').trim(),
    paymentMethod: String(els.directSaleMethod?.value || '').trim(),
    paymentStatus: String(els.directSalePaymentStatus?.value || 'pendiente'),
    notes: String(els.directSaleNotes?.value || '').trim(),
    items
  };
}

function updateDirectSalePreview() {
  const payload = currentDirectSalePayload(true);
  const total = Number((payload.items || []).reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitPrice || 0)), 0).toFixed(2));
  if (els.directSaleTotal) els.directSaleTotal.textContent = money(total);
  return total;
}

async function exportDirectSalePdf(saleLike) {
  const sale = saleLike?.items ? saleLike : state.directSales.find(item => item.id === saleLike) || null;
  if (!sale) { notify('Primero registra o selecciona una venta.', true); return; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const logo = await getImageData('/logo.jpg');
    const pageBottom = 278;
    const drawHeader = async () => {
      doc.setFillColor(255,255,255); doc.rect(0,0,210,297,'F');
      if (logo) await addPdfImage(doc, logo, 14, 12, 42, 42);
      doc.setTextColor(30,30,30);
      doc.setFontSize(18); doc.text('REPORTE DE VENTA DIRECTA', 62, 24);
      doc.setFontSize(10); doc.setTextColor(100,100,100); doc.text('CARLAB SERVICIOS INTEGRALES', 62, 31);
      doc.setFontSize(10); doc.setTextColor(120,120,120); doc.text(`Folio: ${sale.folio || '—'}`, 196, 20, { align:'right' });
      doc.text(`Fecha: ${fmtDate(sale.createdAt || new Date())}`, 196, 27, { align:'right' });
      doc.setFontSize(11); doc.setTextColor(40,40,40);
      doc.roundedRect(14, 44, 182, 38, 4, 4);
      doc.text(`Cliente: ${sale.customerName || 'Mostrador'}`, 18, 55);
      doc.text(`Teléfono: ${sale.customerPhone || '—'}`, 18, 63);
      doc.text(`Empresa: ${sale.companyName || 'Mostrador'}`, 105, 55);
      doc.text(`Unidad: ${sale.unitNumber || '—'}`, 105, 63);
      doc.text(`Pago: ${sale.paymentMethod || '—'}`, 18, 71);
      doc.text(`Estatus: ${String(sale.paymentStatus || 'pendiente').replaceAll('_',' ')}`, 105, 71);
      let y = 94;
      doc.setFontSize(12); doc.setTextColor(20,20,20); doc.text('Conceptos', 14, y); y += 8;
      doc.setFillColor(245, 247, 250); doc.roundedRect(14, y-5, 182, 10, 3, 3, 'F');
      doc.setFontSize(9); doc.text('Descripción', 18, y+1); doc.text('Cant.', 132, y+1); doc.text('P. unitario', 150, y+1); doc.text('Total', 183, y+1, { align:'right' });
      return y + 10;
    };

    let y = await drawHeader();
    doc.setFontSize(10); doc.setTextColor(55,55,55);
    for (const item of (sale.items || [])) {
      const lines = doc.splitTextToSize(item.description || 'Concepto', 108);
      const rowH = Math.max(8, lines.length * 5 + 2);
      if (y + rowH + 40 > pageBottom) {
        doc.addPage();
        y = await drawHeader();
        doc.setFontSize(10); doc.setTextColor(55,55,55);
      }
      doc.roundedRect(14, y-5, 182, rowH, 3, 3);
      doc.text(lines, 18, y);
      doc.text(String(item.qty || 0), 134, y);
      doc.text(money(item.unitPrice || 0), 160, y);
      doc.text(money(item.total || (Number(item.qty||0)*Number(item.unitPrice||0))), 183, y, { align:'right' });
      y += rowH + 4;
    }

    if (y + 45 > pageBottom) { doc.addPage(); y = 34; }
    doc.roundedRect(118, y + 4, 78, 28, 4, 4);
    doc.text(`Subtotal: ${money(sale.subtotal || sale.total || 0)}`, 122, y + 12);
    doc.text(`Conceptos: ${Number((sale.items || []).length)}`, 122, y + 19);
    doc.text(`Total: ${money(sale.total || sale.subtotal || 0)}`, 122, y + 26);
    if (sale.notes) {
      y += 40;
      const notes = doc.splitTextToSize(sale.notes, 178);
      if (y + (notes.length * 5) > pageBottom) { doc.addPage(); y = 24; }
      doc.setFontSize(12); doc.text('Observaciones', 14, y); y += 8;
      doc.roundedRect(14, y - 5, 182, (notes.length * 5) + 8, 3, 3);
      doc.setFontSize(10); doc.text(notes, 14, y);
    }
    doc.save(`${sale.folio || 'venta'}_${(sale.customerName || 'mostrador').replace(/\s+/g,'_')}.pdf`);
  } catch (error) {
    notify('No se pudo generar el PDF de venta.', true);
  }
}

function quoteStatusBadge(status) {
  return ({ borrador:'badge-info', enviada:'badge-review', pendiente_autorizacion:'badge-review', autorizada:'badge-accepted', rechazada:'badge-rejected', cancelada:'badge-rejected' })[status] || 'badge-info';
}
function quotePaymentBadge(status) {
  return ({ pendiente_pago:'badge-review', anticipo_recibido:'badge-info', pago_parcial:'badge-progress', pagada:'badge-done', cancelada:'badge-rejected' })[status] || 'badge-info';
}
function salePaymentBadge(status) {
  return ({ pendiente:'badge-review', pagado_parcial:'badge-progress', pagada:'badge-done', cancelada:'badge-rejected' })[status] || 'badge-info';
}

async function loadCobranza(force = false) {
  if (!isRole('admin')) return;
  try {
    const [overview, quotes, sales] = await Promise.all([
      api.getCobranzaOverview(),
      api.getCobranzaQuotes(),
      api.getDirectSales(),
      (!state.stockParts.length || force) ? loadStock(true) : Promise.resolve()
    ]);
    state.cobranzaOverview = overview;
    state.cobranzaQuotes = quotes || [];
    state.directSales = sales || [];
    if (!state.selectedQuoteId && state.cobranzaQuotes[0]) state.selectedQuoteId = state.cobranzaQuotes[0].id;
    if (state.selectedQuoteId && !state.cobranzaQuotes.find(q => q.id === state.selectedQuoteId)) state.selectedQuoteId = state.cobranzaQuotes[0]?.id || '';
    renderCobranza();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderCobranza() {
  const overview = state.cobranzaOverview || { quotes:{}, directSales:{}, stock:{} };
  if (els.cobranzaSummary) {
    els.cobranzaSummary.innerHTML = `
      <article class="parts-summary-card glass-card"><strong>Cobros</strong><span>${Number(overview.quotes?.total || 0)}</span><small>Reportes llevados a propuesta</small></article>
      <article class="parts-summary-card"><strong>Por autorizar</strong><span>${Number(overview.quotes?.pendingAuthorization || 0)}</span><small>Esperando visto bueno del cliente</small></article>
      <article class="parts-summary-card"><strong>Por cobrar</strong><span>${money(overview.quotes?.amountOpen || 0)}</span><small>Saldo abierto</small></article>
      <article class="parts-summary-card"><strong>Ventas directas</strong><span>${Number(overview.directSales?.total || 0)}</span><small>${money(overview.directSales?.amount || 0)}</small></article>
      <article class="parts-summary-card"><strong>Terminados</strong><span>${Number(overview.finishedReports || 0)}</span><small>Listos para preparar cobro</small></article>
      <article class="parts-summary-card"><strong>Valor stock</strong><span>${money(overview.stock?.value || 0)}</span><small>${Number(overview.stock?.catalog || 0)} piezas activas</small></article>`;
  }
  if (els.cobranzaQuotesList) {
    els.cobranzaQuotesList.innerHTML = state.cobranzaQuotes.length ? state.cobranzaQuotes.map(q => `
      <article class="cobranza-quote-card ${q.id === state.selectedQuoteId ? 'active' : ''}">
        <button type="button" class="cobranza-quote-row ${q.id === state.selectedQuoteId ? 'active' : ''}" data-quote-open="${q.id}">
          <div><strong>${escapeHtml(q.folio || 'COB-—')}</strong><div class="small muted">${escapeHtml(q.companyName || 'Sin empresa')} · unidad ${escapeHtml(q.unitNumber || '—')}</div></div>
          <div class="cobranza-row-side"><span class="badge ${quoteStatusBadge(q.status)}">${escapeHtml(q.status.replaceAll('_',' '))}</span><strong>${money(q.total || 0)}</strong></div>
        </button>
        <div class="cobranza-quote-expand ${q.id === state.selectedQuoteId ? '' : 'hidden'}">
          <div class="small muted">Cliente: ${escapeHtml(q.clientName || 'Sin contacto')} · Tel: ${escapeHtml(q.clientPhone || '—')}</div>
          <div class="small muted">Pago: ${escapeHtml((q.paymentStatus || 'pendiente_pago').replaceAll('_',' '))} · Actualizado: ${escapeHtml(fmtDate(q.updatedAt || q.createdAt))}</div>
        </div>
      </article>`).join('') : '<div class="muted">Todavía no hay cobros preparados. Usa “Preparar cobro” desde un reporte terminado.</div>';
    els.cobranzaQuotesList.querySelectorAll('[data-quote-open]').forEach(btn => btn.addEventListener('click', () => {
      state.selectedQuoteId = state.selectedQuoteId === btn.dataset.quoteOpen ? '' : btn.dataset.quoteOpen;
      renderCobranza();
    }));
  }
  renderQuoteDetail();
  fillSelect(els.directSaleStockPart, state.stockParts.map(part => ({ id: part.id, nombre: `${part.nombre} · ${part.sku || 'sin SKU'} · stock ${part.stockActual}` })), 'Selecciona refacción de stock');
  syncDirectSalePartDefaults();
  renderDirectSaleItems();
  if (els.directSalesList) {
    els.directSalesList.innerHTML = state.directSales.length ? state.directSales.map(sale => `
      <div class="table-row rich-row sale-row">
        <div><strong>${escapeHtml(sale.folio)}</strong><div class="small muted">${escapeHtml(sale.customerName || 'Mostrador')} · ${escapeHtml(sale.companyName || 'mostrador')}</div></div>
        <div><span class="badge ${salePaymentBadge(sale.paymentStatus)}">${escapeHtml((sale.paymentStatus || 'pendiente').replaceAll('_',' '))}</span><div class="small muted">${escapeHtml(sale.paymentMethod || 'sin método')}</div></div>
        <div><strong>${money(sale.total || 0)}</strong><div class="small muted">${fmtDate(sale.createdAt)}</div></div>
        <div class="stack-inline"><button class="btn btn-ghost" type="button" data-sale-pdf="${sale.id}">PDF</button></div>
      </div>`).join('') : '<div class="muted">Sin ventas directas registradas todavía.</div>';
    els.directSalesList.querySelectorAll('[data-sale-pdf]').forEach(btn => btn.addEventListener('click', () => exportDirectSalePdf(btn.dataset.salePdf)));
  }
}


function selectedQuote() { return state.cobranzaQuotes.find(q => q.id === state.selectedQuoteId) || null; }
function cloneQuoteItems(items = []) {
  return (items || []).map(item => ({
    id: item.id || '',
    type: item.type || 'extra',
    description: item.description || '',
    qty: Number(item.qty || 0),
    unitPrice: Number(item.unitPrice || item.unit_price || 0),
    total: Number(item.total || 0),
    stockPartId: item.stockPartId || item.stock_part_id || ''
  }));
}
function ensureQuoteDraft(quote) {
  if (!quote) return null;
  if (!state.quoteDrafts[quote.id]) {
    state.quoteDrafts[quote.id] = {
      companyName: quote.companyName || '',
      unitNumber: quote.unitNumber || '',
      clientName: quote.clientName || '',
      clientPhone: quote.clientPhone || '',
      status: quote.status || 'borrador',
      paymentStatus: quote.paymentStatus || 'pendiente_pago',
      discount: Number(quote.discount || 0),
      iva: Number(quote.iva || 0),
      anticipo: Number(quote.anticipo || 0),
      paymentMethod: quote.paymentMethod || '',
      paymentReference: quote.paymentReference || '',
      dueAt: quote.dueAt ? String(quote.dueAt).slice(0,10) : '',
      notes: quote.notes || '',
      items: cloneQuoteItems(quote.items?.length ? quote.items : [{ type:'mano_obra', description:'', qty:1, unitPrice:0, stockPartId:'' }])
    };
  }
  return state.quoteDrafts[quote.id];
}
function computeQuoteDraftTotals(draft) {
  const subtotal = Number((draft.items || []).reduce((sum, item) => sum + ((Number(item.qty || 0) * Number(item.unitPrice || 0)) || 0), 0).toFixed(2));
  const discount = Math.max(0, Number(draft.discount || 0));
  const base = Math.max(0, subtotal - discount);
  const ivaPercent = Math.max(0, Number(draft.iva || 0));
  const ivaAmount = Number((base * (ivaPercent / 100)).toFixed(2));
  const total = Number((base + ivaAmount).toFixed(2));
  const anticipo = Math.max(0, Number(draft.anticipo || 0));
  const saldo = Number(Math.max(0, total - anticipo).toFixed(2));
  return { subtotal, total, saldo, ivaAmount, discount, anticipo };
}
function syncQuoteDraftFromDom(quoteId) {
  const quote = state.cobranzaQuotes.find(q => q.id === quoteId);
  const draft = ensureQuoteDraft(quote);
  if (!draft) return null;
  draft.companyName = document.getElementById('quoteCompanyName')?.value || '';
  draft.unitNumber = document.getElementById('quoteUnitNumber')?.value || '';
  draft.clientName = document.getElementById('quoteClientName')?.value || '';
  draft.clientPhone = document.getElementById('quoteClientPhone')?.value || '';
  draft.status = document.getElementById('quoteStatus')?.value || 'borrador';
  draft.paymentStatus = document.getElementById('quotePaymentStatus')?.value || 'pendiente_pago';
  draft.discount = Number(document.getElementById('quoteDiscount')?.value || 0);
  draft.iva = Number(document.getElementById('quoteIva')?.value || 0);
  draft.anticipo = Number(document.getElementById('quoteAnticipo')?.value || 0);
  draft.paymentMethod = document.getElementById('quotePaymentMethod')?.value || '';
  draft.paymentReference = document.getElementById('quotePaymentReference')?.value || '';
  draft.dueAt = document.getElementById('quoteDueAt')?.value || '';
  draft.notes = document.getElementById('quoteNotes')?.value || '';
  draft.items = [...document.querySelectorAll('#quoteItemsTbody tr')].map((row, index) => ({
    id: row.dataset.quoteItemId || '',
    type: row.querySelector(`[data-quote-type="${index}"]`)?.value || 'extra',
    description: row.querySelector(`[data-quote-description="${index}"]`)?.value || '',
    qty: Number(row.querySelector(`[data-quote-qty="${index}"]`)?.value || 0),
    unitPrice: Number(row.querySelector(`[data-quote-price="${index}"]`)?.value || 0),
    stockPartId: row.querySelector(`[data-quote-stock="${index}"]`)?.value || ''
  }));
  draft.items.forEach(item => { item.total = Number(((Number(item.qty || 0) * Number(item.unitPrice || 0)) || 0).toFixed(2)); });
  return draft;
}
function updateQuoteTotalsPreview(quoteId) {
  const draft = syncQuoteDraftFromDom(quoteId);
  if (!draft) return;
  const totals = computeQuoteDraftTotals(draft);
  document.querySelectorAll('#quoteItemsTbody tr').forEach((row, index) => {
    const item = draft.items[index];
    const totalEl = row.querySelector('[data-quote-row-total]');
    if (totalEl) totalEl.textContent = money(item?.total || 0);
  });
  const s = document.getElementById('quoteSubtotalPreview'); if (s) s.textContent = money(totals.subtotal);
  const t = document.getElementById('quoteTotalPreview'); if (t) t.textContent = money(totals.total);
  const sd = document.getElementById('quoteSaldoPreview'); if (sd) sd.textContent = money(totals.saldo);
}

function renderQuoteDetail() {
  if (!els.cobranzaQuoteDetail) return;
  const quote = selectedQuote();
  if (!quote) {
    els.cobranzaQuoteDetail.innerHTML = '<div class="muted">Selecciona una cobranza para editar conceptos, estatus y PDF comercial.</div>';
    return;
  }
  const draft = ensureQuoteDraft(quote) || {
    items: [{ type:'mano_obra', description:'', qty:1, unitPrice:0, stockPartId:'' }],
    companyName: quote.companyName || quote.empresa || '',
    unitNumber: quote.unitNumber || quote.numeroEconomico || '',
    clientName: quote.clientName || quote.contactoNombre || '',
    clientPhone: quote.clientPhone || quote.telefono || '',
    status: quote.status || 'borrador',
    paymentStatus: quote.paymentStatus || 'pendiente_pago',
    discount: Number(quote.discount || 0),
    iva: Number(quote.iva || 0),
    anticipo: Number(quote.anticipo || 0),
    paymentMethod: quote.paymentMethod || '',
    paymentReference: quote.paymentReference || '',
    dueAt: quote.dueAt || '',
    notes: quote.notes || ''
  };
  const totals = computeQuoteDraftTotals(draft);
  const stockOptions = ['<option value="">Sin ligar a stock</option>', ...state.stockParts.map(part => `<option value="${part.id}">${escapeHtml(part.nombre)} · ${escapeHtml(part.sku || 'sin SKU')} · ${Number(part.stockActual || 0)} pzas</option>`)].join('');
  const itemsRows = ((draft.items && draft.items.length) ? draft.items : [{ type:'mano_obra', description:'', qty:1, unitPrice:0, stockPartId:'' }]).map((item, index) => `
    <tr data-quote-item-id="${escapeHtml(item.id || '')}">
      <td><select data-quote-type="${index}"><option value="mano_obra" ${item.type === 'mano_obra' ? 'selected' : ''}>Mano de obra</option><option value="refaccion" ${item.type === 'refaccion' ? 'selected' : ''}>Refacción</option><option value="extra" ${item.type === 'extra' ? 'selected' : ''}>Extra</option></select></td>
      <td><input data-quote-description="${index}" value="${escapeHtml(item.description || '')}" placeholder="Concepto" /></td>
      <td><input data-quote-qty="${index}" type="number" min="0" step="0.01" value="${Number(item.qty || 0)}" /></td>
      <td><input data-quote-price="${index}" type="number" min="0" step="0.01" value="${Number(item.unitPrice || 0)}" /></td>
      <td><select data-quote-stock="${index}">${stockOptions}</select></td>
      <td><strong data-quote-row-total>${money(item.total || (Number(item.qty || 0) * Number(item.unitPrice || 0)))}</strong></td>
      <td><button type="button" class="btn btn-ghost" data-quote-remove="${index}">×</button></td>
    </tr>`).join('');
  els.cobranzaQuoteDetail.innerHTML = `
    <div class="quote-shell">
      <div class="quote-headline">
        <div>
          <div class="topbar-kicker">${escapeHtml(quote.reportFolio || quote.folio)}</div>
          <h4>${escapeHtml(draft.companyName || 'Sin empresa')} · unidad ${escapeHtml(draft.unitNumber || '—')}</h4>
          <p class="muted">${escapeHtml(quote.reportDescription || 'Documento comercial basado en el reporte terminado.')}</p>
        </div>
        <div class="badge-stack"><span class="badge ${quoteStatusBadge(quote.status)}">${escapeHtml(quote.status.replaceAll('_',' '))}</span><span class="badge ${quotePaymentBadge(quote.paymentStatus)}">${escapeHtml(quote.paymentStatus.replaceAll('_',' '))}</span></div>
      </div>
      <div class="quote-meta-grid">
        <label><span>Empresa</span><input id="quoteCompanyName" value="${escapeHtml(draft.companyName || '')}" /></label>
        <label><span>Unidad</span><input id="quoteUnitNumber" value="${escapeHtml(draft.unitNumber || '')}" /></label>
        <label><span>Cliente</span><input id="quoteClientName" value="${escapeHtml(draft.clientName || '')}" /></label>
        <label><span>Teléfono</span><input id="quoteClientPhone" value="${escapeHtml(draft.clientPhone || '')}" /></label>
        <label><span>Estatus comercial</span><select id="quoteStatus"><option value="borrador">Borrador</option><option value="enviada">Enviada</option><option value="pendiente_autorizacion">Pendiente autorización</option><option value="autorizada">Autorizada</option><option value="rechazada">Rechazada</option><option value="cancelada">Cancelada</option></select></label>
        <label><span>Estatus de pago</span><select id="quotePaymentStatus"><option value="pendiente_pago">Pendiente pago</option><option value="anticipo_recibido">Anticipo recibido</option><option value="pago_parcial">Pago parcial</option><option value="pagada">Pagada</option><option value="cancelada">Cancelada</option></select></label>
        <label><span>Descuento</span><input id="quoteDiscount" type="number" min="0" step="0.01" value="${Number(draft.discount || 0)}" /></label>
        <label><span>IVA</span><input id="quoteIva" type="number" min="0" step="0.01" value="${Number(draft.iva || 0)}" /></label>
        <label><span>Anticipo</span><input id="quoteAnticipo" type="number" min="0" step="0.01" value="${Number(draft.anticipo || 0)}" /></label>
        <label><span>Método de pago</span><input id="quotePaymentMethod" value="${escapeHtml(draft.paymentMethod || '')}" placeholder="Transferencia / efectivo" /></label>
        <label><span>Referencia</span><input id="quotePaymentReference" value="${escapeHtml(draft.paymentReference || '')}" placeholder="Folio bancario o nota" /></label>
        <label><span>Vigencia</span><input id="quoteDueAt" type="date" value="${draft.dueAt || ''}" /></label>
      </div>
      <label class="quote-notes"><span>Notas comerciales</span><textarea id="quoteNotes" rows="3">${escapeHtml(draft.notes || '')}</textarea></label>
      <div class="quote-items-head"><strong>Conceptos del cobro</strong><button id="quoteAddItemBtn" class="btn btn-secondary" type="button">Agregar concepto</button></div>
      <div class="quote-table-wrap"><table class="quote-items-table"><thead><tr><th>Tipo</th><th>Descripción</th><th>Cant.</th><th>P. unitario</th><th>Stock</th><th>Total</th><th></th></tr></thead><tbody id="quoteItemsTbody">${itemsRows}</tbody></table></div>
      <div class="quote-totals-strip"><article><span>Subtotal</span><strong id="quoteSubtotalPreview">${money(totals.subtotal || 0)}</strong></article><article><span>Total</span><strong id="quoteTotalPreview">${money(totals.total || 0)}</strong></article><article><span>Saldo</span><strong id="quoteSaldoPreview">${money(totals.saldo || 0)}</strong></article></div>
      <div class="stock-form-actions"><button id="quoteDeleteBtn" class="btn btn-ghost" type="button">Eliminar cobranza</button><button id="quotePdfBtn" class="btn btn-ghost" type="button">PDF comercial</button><button id="quoteSaveBtn" class="btn btn-primary" type="button">Guardar cobranza</button></div>
    </div>`;
  document.getElementById('quoteStatus').value = draft.status || 'borrador';
  document.getElementById('quotePaymentStatus').value = draft.paymentStatus || 'pendiente_pago';
  draft.items?.forEach((item, index) => {
    const select = document.querySelector(`[data-quote-stock="${index}"]`);
    if (select) select.value = item.stockPartId || '';
  });
  document.querySelectorAll('[data-quote-remove]').forEach(btn => btn.addEventListener('click', () => {
    draft.items.splice(Number(btn.dataset.quoteRemove), 1);
    renderQuoteDetail();
  }));
  document.getElementById('quoteAddItemBtn')?.addEventListener('click', () => {
    syncQuoteDraftFromDom(quote.id);
    draft.items.push({ type:'extra', description:'', qty:1, unitPrice:0, stockPartId:'' });
    renderQuoteDetail();
  });
  document.querySelectorAll('#quoteCompanyName,#quoteUnitNumber,#quoteClientName,#quoteClientPhone,#quoteStatus,#quotePaymentStatus,#quoteDiscount,#quoteIva,#quoteAnticipo,#quotePaymentMethod,#quotePaymentReference,#quoteDueAt,#quoteNotes,#quoteItemsTbody input,#quoteItemsTbody select').forEach(el => {
    el.addEventListener('input', () => updateQuoteTotalsPreview(quote.id));
    el.addEventListener('change', () => updateQuoteTotalsPreview(quote.id));
  });
  updateQuoteTotalsPreview(quote.id);
  document.getElementById('quotePdfBtn')?.addEventListener('click', () => exportCommercialPdf(quote));
  document.getElementById('quoteDeleteBtn')?.addEventListener('click', async () => { if (!confirm(`¿Eliminar ${quote.folio || 'esta cobranza'}?`)) return; try { await api.deleteQuote(quote.id); delete state.quoteDrafts[quote.id]; state.selectedQuoteId = ''; notify('Cobranza eliminada.'); await loadCobranza(true); } catch (error) { notify(error.message, true); } });
  document.getElementById('quoteSaveBtn')?.addEventListener('click', saveSelectedQuote);
}

function quoteItemsFromDom() {
  const rows = [...document.querySelectorAll('#quoteItemsTbody tr')];
  return rows.map((row, index) => ({
    type: document.querySelector(`[data-quote-type="${index}"]`)?.value || 'extra',
    description: document.querySelector(`[data-quote-description="${index}"]`)?.value || '',
    qty: Number(document.querySelector(`[data-quote-qty="${index}"]`)?.value || 0),
    unitPrice: Number(document.querySelector(`[data-quote-price="${index}"]`)?.value || 0),
    stockPartId: document.querySelector(`[data-quote-stock="${index}"]`)?.value || '',
  })).filter(item => item.description.trim() && item.qty > 0);
}

async function saveSelectedQuote() {
  const quote = selectedQuote();
  if (!quote) return;
  try {
    const draft = syncQuoteDraftFromDom(quote.id);
    const items = (draft.items || []).filter(item => item.description.trim() && Number(item.qty || 0) > 0).map(item => ({
      ...item,
      total: Number(((Number(item.qty || 0) * Number(item.unitPrice || 0)) || 0).toFixed(2))
    }));
    if (!items.length) throw new Error('Agrega al menos un concepto válido.');
    const payload = {
      companyName: draft.companyName || '',
      unitNumber: draft.unitNumber || '',
      clientName: draft.clientName || '',
      clientPhone: draft.clientPhone || '',
      status: draft.status || 'borrador',
      paymentStatus: draft.paymentStatus || 'pendiente_pago',
      discount: draft.discount || 0,
      iva: draft.iva || 0,
      anticipo: draft.anticipo || 0,
      paymentMethod: draft.paymentMethod || '',
      paymentReference: draft.paymentReference || '',
      dueAt: draft.dueAt || null,
      notes: draft.notes || ''
    };
    await api.replaceQuoteItems(quote.id, { items, discount: payload.discount, iva: payload.iva, anticipo: payload.anticipo });
    await api.updateQuote(quote.id, payload);
    delete state.quoteDrafts[quote.id];
    notify('Cobranza guardada.');
    await loadCobranza(true);
  } catch (error) {
    notify(error.message, true);
  }
}

async function openQuoteFromReport(reportId) {
  try {
    const quote = await api.createQuoteFromReport(reportId);
    state.selectedQuoteId = quote?.id || state.selectedQuoteId;
    await loadCobranza(true);
    switchPanel('cobranza');
  } catch (error) {
    notify(error.message, true);
  }
}

function launchDirectSaleWithPart(partId) {
  state.directSaleDraftPartId = partId || '';
  switchPanel('cobranza');
  setTimeout(() => {
    syncDirectSalePartDefaults();
    els.directSaleCustomer?.focus();
  }, 80);
}

async function exportCommercialPdf(quote) {
  try {
    const report = state.garantias.find(item => item.id === quote.garantiaId) || null;
    const draft = state.quoteDrafts[quote.id] || ensureQuoteDraft(quote) || quote;
    const items = (draft.items || quote.items || []).map(item => ({ ...item, total: Number(((Number(item.qty || 0) * Number(item.unitPrice || 0)) || item.total || 0).toFixed(2)) }));
    const totals = computeQuoteDraftTotals({ items, discount: Number(draft.discount || 0), iva: Number(draft.iva || 0), anticipo: Number(draft.anticipo || 0) });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const logo = await getImageData('/logo.jpg');
    let y = 20;
    const textLine = (text, gap = 7, x = 14) => { doc.text(String(text), x, y); y += gap; };

    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F');
    if (logo) await addPdfImage(doc, logo, 14, 12, 42, 42);
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(18); doc.text('REPORTE DE GARANTÍA / COBRO', 62, 24);
    doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.text('CARLAB SERVICIOS INTEGRALES', 62, 31);
    doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text(`Folio: ${quote.reportFolio || report?.folio || '—'}`, 196, 20, { align: 'right' });
    doc.text(`Cobranza: ${quote.folio || '—'}`, 196, 27, { align: 'right' });

    const item = report || {};
    y = 50;
    doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    doc.roundedRect(14, 44, 182, 38, 4, 4);
    doc.text(`Empresa: ${draft.companyName || item.empresa || '—'}`, 18, 54);
    doc.text(`Unidad: ${draft.unitNumber || item.numeroEconomico || '—'}`, 18, 62);
    doc.text(`Modelo: ${item.modelo || '—'}`, 18, 70);
    doc.text(`Obra: ${item.numeroObra || '—'}`, 105, 54);
    doc.text(`KM: ${item.kilometraje || '—'}`, 105, 62);
    doc.text(`Estatus: ${(item.estatusValidacion || '—')} / ${(item.estatusOperativo || '—')}`, 105, 70);

    y = 92;
    doc.roundedRect(14, 86, 182, 24, 4, 4);
    doc.text(`Nombre: ${draft.clientName || item.contactoNombre || '—'}`, 18, 96);
    doc.text(`Teléfono: ${draft.clientPhone || item.telefono || '—'}`, 105, 96);
    doc.text(`Reportó: ${item.reportadoPorNombre || '—'}`, 18, 104);
    doc.text(`Revisó: ${item.revisadoPorNombre || '—'}`, 105, 104);

    y = 122;
    doc.setFontSize(12); doc.setTextColor(20, 20, 20); textLine('Descripción de la falla', 8);
    doc.setFontSize(10); doc.setTextColor(55,55,55);
    let split = doc.splitTextToSize(item.descripcionFallo || quote.reportDescription || '—', 178);
    doc.text(split, 14, y); y += split.length * 6 + 6;

    const images = [ ...(item.evidencias || []), ...(item.evidenciasRefaccion || []) ];
    if (images.length) {
      y = ensurePdfSpace(doc, y, 52); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Evidencias fotográficas', 8);
      let x = 14; let rowHeight = 0;
      for (const src of images.slice(0, 6)) {
        if (x > 136) { x = 14; y += rowHeight + 8; rowHeight = 0; }
        y = ensurePdfSpace(doc, y, 48);
        doc.roundedRect(x, y, 56, 42, 3, 3);
        await addPdfImage(doc, src, x + 1, y + 1, 54, 40);
        x += 60; rowHeight = Math.max(rowHeight, 42);
      }
      y += rowHeight + 8;
    }
    if (item.firma) {
      y = ensurePdfSpace(doc, y, 42); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Firma', 8);
      doc.roundedRect(14, y, 90, 28, 3, 3); await addPdfImage(doc, item.firma, 16, y + 2, 86, 24); y += 34;
    }

    y = ensurePdfSpace(doc, y, 60);
    doc.setFontSize(13); doc.setTextColor(20,20,20); textLine('Propuesta económica', 9);
    doc.setFontSize(10); doc.setTextColor(55,55,55);
    for (const row of items) {
      const line = `${row.type.replace('_',' ')} · ${row.description} · ${Number(row.qty || 0)} x ${money(row.unitPrice || 0)} = ${money(row.total || 0)}`;
      split = doc.splitTextToSize(line, 178);
      y = ensurePdfSpace(doc, y, split.length * 6 + 8);
      doc.text(split, 14, y); y += split.length * 6 + 6;
    }
    y += 4;
    doc.setFont('helvetica','bold');
    doc.text(`Subtotal: ${money(totals.subtotal || 0)}`, 14, y); y += 7;
    doc.text(`Descuento: ${money(totals.discount || 0)} · IVA ${Number(draft.iva || 0)}%`, 14, y); y += 7;
    doc.text(`Total: ${money(totals.total || 0)} · Anticipo: ${money(totals.anticipo || 0)} · Saldo: ${money(totals.saldo || 0)}`, 14, y); y += 10;
    doc.setFont('helvetica','normal');
    split = doc.splitTextToSize(draft.notes || 'Documento enviado para autorización y pago.', 178);
    doc.text(split, 14, y); y += split.length * 6 + 6;
    doc.text(`Estatus comercial: ${(draft.status || quote.status || 'borrador').replaceAll('_',' ')} · Pago: ${(draft.paymentStatus || quote.paymentStatus || 'pendiente_pago').replaceAll('_',' ')}`, 14, y);

    doc.save(`${quote.folio || 'cobro'}_${draft.unitNumber || item.numeroEconomico || 'unidad'}.pdf`);
  } catch (error) {
    notify('No se pudo generar el PDF comercial.', true);
  }
}

async function loadFleet() {
  try {
    const canManageFleet = isRole('admin','operativo');
    els.fleetSaveBtn?.classList.toggle('hidden', !canManageFleet);
    document.querySelectorAll('.fleet-form-only').forEach(el => el.classList.toggle('hidden', !canManageFleet));
    if (!canManageFleet) toggleFleetForm(false);
    if (['supervisor','supervisor_flotas'].includes(state.user?.role) && els.fleetEmpresa) {
      els.fleetEmpresa.value = state.user.empresa || '';
      els.fleetEmpresa.disabled = true;
    } else if (els.fleetEmpresa) {
      els.fleetEmpresa.disabled = false;
    }
    const [summary, units, schedules] = await Promise.all([api.getFleetSummary(), api.getFleetUnits(), api.getSchedules('')]);
    state.fleetSummary = summary || state.fleetSummary;
    state.fleetUnits = units || [];
    state.schedules = schedules || state.schedules;
    if (state.selectedFleetUnit?.unit?.id) {
      const still = state.fleetUnits.find(u => u.id === state.selectedFleetUnit.unit.id);
      if (still) state.selectedFleetUnit = await api.getFleetUnit(still.id);
    }
    renderFleet();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderFleet() {
  if (els.fleetUnitsList) els.fleetUnitsList.innerHTML = '';
  const fleetQuery = normalizeText(els.fleetSearchInput?.value || '');
  const fleetStatus = els.fleetStatusFilter?.value || 'todos';
  const visibleUnits = state.fleetUnits.filter(unit => {
    const sem = fleetSemaforo(unit);
    const hayTexto = !fleetQuery || normalizeText([unit.numeroEconomico, unit.empresa, unit.marca, unit.modelo, unit.numeroObra, unit.nombreFlota].join(' ')).includes(fleetQuery);
    const hayEstado = fleetStatus === 'todos' || sem.key === fleetStatus;
    return hayTexto && hayEstado;
  });

  renderFleetOwnerDeck();

  if (!visibleUnits.length && els.fleetUnitsList) {
    els.fleetUnitsList.innerHTML = '<div class="empty-state"><strong>Sin coincidencias.</strong><span>Ajusta búsqueda o estado para encontrar la unidad correcta.</span></div>';
  }

  visibleUnits.forEach(unit => {
    const status = fleetStatusLuxury(unit);
    const poliza = fleetTagPoliza(unit);
    const camp = fleetTagCampania(unit);
    const selected = state.selectedFleetUnit?.unit?.id === unit.id;
    const row = document.createElement('article');
    row.className = `fleet-line-item ${selected ? 'selected' : ''}`;
    row.innerHTML = `
      <div class="fleet-line-num">${escapeHtml(unit.numeroEconomico || '—')}</div>
      <div class="fleet-line-emoji">${status.emoji}</div>
      <div class="fleet-line-main">
        <strong>${escapeHtml(status.text)}</strong>
        <div class="fleet-line-sub">${escapeHtml(unit.empresa || '—')}${unit.modelo ? ' · ' + escapeHtml(unit.modelo) : ''}${unit.marca ? ' · ' + escapeHtml(unit.marca) : ''}</div>
      </div>
      <div class="fleet-line-tags">
        <span class="fleet-chip ${poliza.cls}">${poliza.text}</span>
        <span class="fleet-chip ${camp.cls}">${camp.text}</span>
      </div>
      <div class="fleet-line-status">${unit.lastReportAt ? fmtDate(unit.lastReportAt) : 'Sin movimiento'}</div>
    `;
    row.addEventListener('click', async () => {
      try {
        if (state.selectedFleetUnit?.unit?.id === unit.id) {
          state.selectedFleetUnit = null;
          renderFleet();
          renderFleetDetail();
          return;
        }
        state.selectedFleetUnit = await api.getFleetUnit(unit.id);
        if (isRole('admin')) await loadAdminUnitCosts(unit.id);
        renderFleet();
        renderFleetDetail();
      } catch (error) { notify(error.message, true); }
    });
    els.fleetUnitsList?.appendChild(row);
  });
  renderFleetDetail();
}

function renderFleetDetail() {
  if (!els.fleetDetail) return;
  const data = state.selectedFleetUnit;
  if (!data?.unit) {
    els.fleetDetail.innerHTML = '<div class="muted">Selecciona una unidad para ver historial, reportes, agenda, refacciones y costos.</div>';
    return;
  }
  const u = data.unit;
  const sem = fleetSemaforo(u);
  const reportsArr = data.reports || [];
  const costsArr = data.costs || [];
  const unitSchedules = (state.schedules || []).filter(item => item.unidad === u.numeroEconomico && item.empresa === u.empresa).slice(0,4);
  const unitParts = (state.partsPending || []).filter(item => item.numeroEconomico === u.numeroEconomico && item.empresa === u.empresa);
  const allImages = reportsArr.flatMap(r => [...(r.evidencias || []), ...(r.evidenciasRefaccion || [])]).filter(Boolean);
  const reports = reportsArr.map(r => `
    <div class="table-row rich-row">
      <div><strong>${escapeHtml(r.folio || 'GAR-—')}</strong><div class="small muted">${escapeHtml(r.descripcionFallo || 'Sin descripción')}</div></div>
      <div><span class="badge ${badgeClassValidation(r.estatusValidacion || 'nueva')}">${escapeHtml(r.estatusValidacion || '—')}</span></div>
      <div><span class="badge ${badgeClassOperational(r.estatusOperativo || 'sin iniciar')}">${escapeHtml(r.estatusOperativo || '—')}</span></div>
    </div>
  `).join('') || '<div class="muted">Sin reportes ligados.</div>';
  const costs = costsArr.map(c => `
    <div class="table-row rich-row">
      <div><strong>${escapeHtml(c.tipo)}</strong><div class="small muted">${escapeHtml(c.concepto || 'Sin concepto')}</div></div>
      <div>${money(c.monto)}</div>
      <div>${escapeHtml(c.createdByNombre || '—')}</div>
    </div>
  `).join('') || '<div class="muted">Sin costos capturados.</div>';
  const parts = unitParts.map(item => `
    <div class="owner-list-row static parts-inline-row">
      <span>${escapeHtml(item.detalleRefaccion || 'Refacción pendiente')}</span>
      <small>${escapeHtml(item.refaccionAsignada || 'Sin asignar')}</small>
      <strong>${escapeHtml(item.refaccionStatus || 'pendiente')}</strong>
    </div>
    ${buildImageGallery(item.evidenciasRefaccion || [], 'Sin foto cargada todavía.')}
  `).join('') || '<div class="muted">Esta unidad no tiene refacciones pendientes abiertas.</div>';
  const agenda = unitSchedules.map(item => `<div class="owner-list-row static"><span>${escapeHtml(item.status || 'programada')}</span><small>${escapeHtml(item.originalText || '')}</small><strong>${escapeHtml(fmtDate(item.scheduledFor || item.proposedAt || item.requestedAt))}</strong></div>`).join('') || '<div class="muted">Sin agenda próxima para esta unidad.</div>';
  const adminCostsEditor = isRole('admin') ? `
    <div class="admin-cost-editor-list">
      ${(state.unitCostsAdmin || []).map(c => `
        <div class="admin-cost-editor-row">
          <select id="adminCostTipo_${c.id}">
            <option value="refaccion" ${c.tipo === 'refaccion' ? 'selected' : ''}>Refacción</option>
            <option value="mano_obra" ${c.tipo === 'mano_obra' ? 'selected' : ''}>Mano de obra</option>
          </select>
          <input id="adminCostConcepto_${c.id}" value="${escapeHtml(c.concepto || '')}" placeholder="Concepto" />
          <input id="adminCostMonto_${c.id}" type="number" step="0.01" min="0" value="${Number(c.monto || 0).toFixed(2)}" placeholder="Monto" />
          <button class="btn btn-secondary" type="button" onclick="guardarCostoAdmin('${c.id}','${u.id}')">Guardar</button>
          <button class="btn btn-ghost" type="button" onclick="eliminarCostoAdmin('${c.id}','${u.id}')">Eliminar</button>
        </div>
      `).join('')}
    </div>
  ` : '';
  const costForm = isRole('admin') ? `
    <div class="fleet-cost-form">
      <h4>Registrar costo</h4>
      <div class="stack-inline">
        <select id="fleetCostTipo"><option value="refaccion">Refacción</option><option value="mano_obra">Mano de obra</option></select>
        <input id="fleetCostConcepto" placeholder="Concepto" />
        <input id="fleetCostMonto" type="number" step="0.01" placeholder="Monto" />
        <button id="fleetCostSaveBtn" class="btn btn-primary" type="button">Guardar costo</button>
      </div>
    </div>
  ` : '';
  const statusControl = isRole('admin') ? `
    <div class="fleet-status-admin">
      <label>Estado manual de unidad</label>
      <div class="stack-inline">
        <select id="fleetManualStatus">
          <option value="operando">Operando</option>
          <option value="en_taller">En taller</option>
          <option value="detenida">Detenida</option>
          <option value="programada">Programada</option>
        </select>
        <button id="fleetApplyStatusBtn" class="btn btn-secondary" type="button">Aplicar</button>
      </div>
    </div>
  ` : '';
  const timelineEvents = [
    ...reportsArr.map(r => ({ title:r.folio || 'GAR-—', text:r.descripcionFallo || 'Reporte levantado', date:r.createdAt, tag:r.estatusOperativo || 'sin iniciar' })),
    ...unitSchedules.map(s => ({ title:'Cita programada', text:s.confirmedFor ? `Agenda ${fmtDate(s.confirmedFor)}` : 'Solicitud de agenda', date:s.updatedAt || s.createdAt, tag:s.status || 'pendiente' })),
    ...unitParts.map(p => ({ title:'Refacción abierta', text:p.detalleRefaccion || 'Pendiente de pieza', date:p.refaccionUpdatedAt || p.updatedAt || p.createdAt, tag:p.refaccionStatus || 'pendiente' }))
  ].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0,7);
  const timeline = timelineEvents.map(evt => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(evt.title)}</strong><p>${escapeHtml(evt.text)}</p><small>${fmtDate(evt.date)} · ${escapeHtml(evt.tag || 'movimiento')}</small></div></div>`).join('') || '<div class="muted">Sin movimientos recientes.</div>';
  els.fleetDetail.innerHTML = `
    <div class="panel-head fleet-detail-head">
      <div><div class="topbar-kicker">EXPEDIENTE DE UNIDAD</div><h3>${escapeHtml(u.numeroEconomico)} · ${escapeHtml(u.empresa)}</h3><p class="muted">Vista premium para dueño: patrimonio, agenda, refacciones y evidencia visual en una sola ficha.</p></div>
      <div class="stack-inline">${isRole('admin') ? '<button id="fleetEditInlineBtn" class="btn btn-ghost" type="button">Editar</button><button id="fleetDeleteInlineBtn" class="btn btn-ghost" type="button">Eliminar</button>' : ''}<span class="fleet-dot ${sem.cls}">${sem.label}</span></div>
    </div>
    <div class="fleet-detail-summary">
      <article><span>Costo total</span><strong>${money(u.costoTotal)}</strong></article>
      <article><span>Refacciones</span><strong>${money(u.costoRefacciones)}</strong></article>
      <article><span>Mano de obra</span><strong>${money(u.costoManoObra)}</strong></article>
      <article><span>Reportes</span><strong>${reportsArr.length}</strong></article>
      <article><span>Agenda</span><strong>${unitSchedules.length}</strong></article>
      <article><span>Fotos</span><strong>${allImages.length}</strong></article>
    </div>
    <div class="fleet-hero">
      <div class="fleet-hero-main">
        <div class="mini-grid fleet-meta-grid">
          <div><span class="label">Marca</span><strong>${escapeHtml(u.marca || '—')}</strong></div>
          <div><span class="label">Modelo</span><strong>${escapeHtml(u.modelo || '—')}</strong></div>
          <div><span class="label">Año</span><strong>${escapeHtml(u.anio || '—')}</strong></div>
          <div><span class="label">KM</span><strong>${escapeHtml(u.kilometraje || '—')}</strong></div>
          <div><span class="label">Póliza</span><strong>${u.polizaActiva ? 'Póliza activa' : 'Sin póliza'}</strong></div>
          <div><span class="label">Campaña</span><strong>${u.campaignActiva ? 'Campaña activa' : 'Sin campaña'}</strong></div>
          <div><span class="label">Empresa</span><strong>${escapeHtml(u.empresa || '—')}</strong></div>
          <div><span class="label">Obra</span><strong>${escapeHtml(u.numeroObra || '—')}</strong></div>
        </div>
        ${statusControl}
        ${costForm}
      </div>
      <aside class="fleet-timeline-box"><div class="topbar-kicker">MOVIMIENTO RECIENTE</div>${timeline}</aside>
    </div>
    <div class="fleet-owner-insights detail-grid">
      <article class="owner-card"><div class="owner-card-head"><strong>Refacciones abiertas</strong><span class="badge badge-info">Con evidencia</span></div><div class="owner-list">${parts}</div></article>
      <article class="owner-card"><div class="owner-card-head"><strong>Agenda de la unidad</strong><span class="badge badge-info">Próximas entradas</span></div><div class="owner-list">${agenda}</div></article>
    </div>
    <div class="owner-card owner-gallery-card"><div class="owner-card-head"><strong>Galería de evidencia</strong><span class="badge badge-info">Fotos ampliables</span></div>${buildImageGallery(allImages, 'No hay evidencia cargada todavía para esta unidad.')}</div>
    <div class="fleet-columns">
      <section><div class="topbar-kicker">REPORTES</div><div class="table-list compact-list">${reports}</div></section>
      <section><div class="topbar-kicker">COSTOS</div><div class="table-list compact-list">${costs}</div>${adminCostsEditor}</section>
    </div>
  `;
  if (isRole('admin')) {
    document.getElementById('fleetManualStatus').value = ({ operando:'operando', 'en_taller':'en_taller', detenida:'detenida', programada:'programada' })[sem.key || 'operando'] || 'operando';
    document.getElementById('fleetApplyStatusBtn')?.addEventListener('click', async () => {
      try {
        await api.updateFleetStatus(u.id, { status: document.getElementById('fleetManualStatus').value });
        state.selectedFleetUnit = await api.getFleetUnit(u.id);
        await loadFleet();
        notify('Estado de unidad actualizado.');
      } catch (error) { notify(error.message, true); }
    });
    document.getElementById('fleetEditInlineBtn')?.addEventListener('click', () => beginFleetEdit(u));
    document.getElementById('fleetDeleteInlineBtn')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar unidad ${u.numeroEconomico}?`)) return;
      try {
        await api.deleteFleetUnit(u.id);
        state.selectedFleetUnit = null;
        resetFleetForm();
        await loadFleet();
        notify('Unidad eliminada.');
      } catch (error) { notify(error.message, true); }
    });
    document.getElementById('fleetCostSaveBtn')?.addEventListener('click', async () => {
      try {
        await api.createFleetCost(u.id, {
          tipo: document.getElementById('fleetCostTipo').value,
          concepto: document.getElementById('fleetCostConcepto').value.trim(),
          monto: document.getElementById('fleetCostMonto').value
        });
        notify('Costo guardado.');
        state.selectedFleetUnit = await api.getFleetUnit(u.id);
        await loadAdminUnitCosts(u.id);
        renderFleetDetail();
        const summary = await api.getFleetSummary(); state.fleetSummary = summary; renderFleet();
      } catch (error) { notify(error.message, true); }
    });
  }
}

function money(v) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:2 }).format(n);
}


async function editarReporteAdmin(item) {
  try {
    resetReportForm();
    state.editingGarantiaId = item.id;
    state.editingFirmaOriginal = item.firma || '';
    if (els.numeroObra) els.numeroObra.value = item.numeroObra || '';
    if (els.modelo) els.modelo.value = item.modelo || '';
    if (els.numeroEconomico) els.numeroEconomico.value = item.numeroEconomico || '';
    if (els.empresa) els.empresa.value = item.empresa || '';
    if (els.kilometraje) els.kilometraje.value = item.kilometraje || '';
    if (els.contactoNombre) els.contactoNombre.value = item.contactoNombre || '';
    if (els.telefono) els.telefono.value = item.telefono || '';
    const radio = document.querySelector(`input[name="tipoIncidente"][value="${item.tipoIncidente || 'daño'}"]`);
    if (radio) radio.checked = true;
    if (els.descripcionFallo) els.descripcionFallo.value = item.descripcionFallo || '';
    if (els.solicitaRefaccion) els.solicitaRefaccion.checked = !!item.solicitaRefaccion;
    els.refaccionFields?.classList.toggle('hidden', !els.solicitaRefaccion?.checked);
    if (els.detalleRefaccion) els.detalleRefaccion.value = item.detalleRefaccion || '';
    state.currentEvidence = Array.isArray(item.evidencias) ? [...item.evidencias] : [];
    state.currentRefEvidence = Array.isArray(item.evidenciasRefaccion) ? [...item.evidenciasRefaccion] : [];
    drawPreviews(els.previewEvidencias, state.currentEvidence, 'evidence');
    drawPreviews(els.previewRefaccion, state.currentRefEvidence, 'ref');
    if (item.firma) loadSignatureFromDataUrl(item.firma);
    const submitBtn = els.reportForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Guardar cambios';
    const title = els.reportFormPanel?.querySelector('.panel-head h3');
    if (title) title.textContent = `Editar reporte ${item.folio || ''}`.trim();
    const kicker = els.reportFormPanel?.querySelector('.panel-head .topbar-kicker');
    if (kicker) kicker.textContent = 'ADMINISTRACIÓN';
    const badge = els.reportFormPanel?.querySelector('.panel-head .badge');
    if (badge) badge.textContent = 'Edición total';
    switchPanel('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    notify(error.message, true);
  }
}

function computeExecutiveMetrics() {
  const items = Array.isArray(state.garantias) ? state.garantias : [];
  const total = items.length;
  const nuevas = items.filter(i => i.estatusValidacion === 'nueva').length;
  const revision = items.filter(i => i.estatusValidacion === 'pendiente de revisión').length;
  const aceptadas = items.filter(i => i.estatusValidacion === 'aceptada').length;
  const rechazadas = items.filter(i => i.estatusValidacion === 'rechazada').length;
  const proceso = items.filter(i => i.estatusOperativo === 'en proceso').length;
  const espera = items.filter(i => i.estatusOperativo === 'espera refacción').length;
  const terminadas = items.filter(i => i.estatusOperativo === 'terminada').length;
  const empresas = new Set(items.map(i => i.empresa).filter(Boolean)).size;
  const unidades = new Set(items.map(i => i.numeroEconomico).filter(Boolean)).size;
  const reincidentesMap = new Map();
  items.forEach(i => {
    const key = String(i.numeroEconomico || '').trim();
    if (!key) return;
    reincidentesMap.set(key, (reincidentesMap.get(key) || 0) + 1);
  });
  const reincidentes = [...reincidentesMap.values()].filter(v => v > 1).length;
  return { total, nuevas, revision, aceptadas, rechazadas, proceso, espera, terminadas, empresas, unidades, reincidentes };
}

function renderExecutiveDeck() {
  if (!els.executiveDeckGrid) return;
  const m = computeExecutiveMetrics();
  const role = state.user?.role || '';
  const cards = [
    { kicker:'Pulso general', value:m.total, text:`${m.empresas} empresas activas · ${m.unidades} unidades con historial`, chip:`${m.nuevas} nuevas`, cls:'focus-card', actions:[['Ver reportes', () => { resetBoardFilters(); switchPanel('board'); }], role !== 'operador' ? ['Agenda', async () => { await loadSchedules(''); switchPanel('schedule'); }] : null].filter(Boolean) },
    { kicker:'Validación', value:m.aceptadas, text:`${m.revision} en revisión · ${m.rechazadas} rechazadas`, chip:'Bandeja viva', actions:[['Filtrar aceptadas', () => { if (els.validationFilter) els.validationFilter.value='aceptada'; renderGarantias(); }], ['Pendientes', () => { if (els.validationFilter) els.validationFilter.value='pendiente de revisión'; renderGarantias(); }]] },
    { kicker:'Ejecución', value:m.proceso + m.espera, text:`${m.proceso} en proceso · ${m.espera} esperando refacción · ${m.terminadas} terminadas`, chip:'Operación', actions:[['En proceso', () => { if (els.operationalFilter) els.operationalFilter.value='en proceso'; renderGarantias(); }], ['Terminadas', () => { if (els.operationalFilter) els.operationalFilter.value='terminada'; renderGarantias(); }]] },
    { kicker:'Reincidencia', value:m.reincidentes, text:'Unidades con más de una incidencia registrada. Excelente punto para control y venta.', chip:'Lectura comercial', actions:[ isRole('admin','operativo','supervisor','supervisor_flotas') ? ['Historial', () => switchPanel('history')] : null, isRole('admin','operativo','supervisor_flotas') ? ['Flotas', async () => { await loadFleet(); switchPanel('fleet'); }] : null].filter(Boolean) }
  ];
  if (role === 'operador') {
    cards[1] = { kicker:'Seguimiento', value:m.aceptadas, text:`${m.revision} reportes siguen en análisis y ${m.terminadas} ya quedaron listos.`, chip:'Mi avance', actions:[['Nuevo reporte', () => { resetReportForm(); switchPanel('report'); }], ['Mi agenda', async () => { await loadSchedules(''); switchPanel('schedule'); }]] };
    cards[3] = { kicker:'Refacciones', value:m.espera, text:'Tus reportes que requieren pieza quedan visibles para seguimiento.', chip:'Trazabilidad', actions:[['Ver reportes', () => { resetBoardFilters(); switchPanel('board'); }]] };
  }
  els.executiveDeckGrid.innerHTML = cards.map(card => `
    <article class="executive-card ${card.cls || ''}">
      <div class="executive-kicker">${escapeHtml(card.kicker)}</div>
      <strong>${escapeHtml(String(card.value))}</strong>
      <p>${escapeHtml(card.text)}</p>
      <div class="executive-meta">
        <span class="executive-chip">${escapeHtml(card.chip)}</span>
      </div>
      <div class="executive-actions"></div>
    </article>
  `).join('');
  [...els.executiveDeckGrid.querySelectorAll('.executive-card')].forEach((cardEl, idx) => {
    const actionsWrap = cardEl.querySelector('.executive-actions');
    (cards[idx].actions || []).forEach(([label, fn]) => actionsWrap.appendChild(button(label, idx === 0 ? 'btn btn-secondary' : 'btn btn-ghost', fn)));
  });
  if (els.liveRefreshBadge) {
    const now = new Date();
    els.liveRefreshBadge.textContent = `Última lectura ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
}

function renderGarantias() {
  updateStats(); renderAnalytics(); renderExecutiveDeck();
  const items = filteredGarantias();
  if (els.garantiasList) els.garantiasList.innerHTML = '';
  els.emptyState?.classList.toggle('hidden', items.length > 0);
  items.forEach(item => {
    const node = els.garantiaCardTemplate.content.cloneNode(true);
    node.querySelector('.title').textContent = `${item.folio || 'GAR-—'} · Unidad ${item.numeroEconomico} · Obra ${item.numeroObra}`;
    node.querySelector('.meta').textContent = `${item.empresa} · ${item.modelo} · Reportó ${item.reportadoPorNombre || '—'} · ${fmtDate(item.createdAt)}`;
    node.querySelector('.description').textContent = item.descripcionFallo;
    const validationBadge = node.querySelector('.validation-badge'); validationBadge.textContent = item.estatusValidacion; validationBadge.classList.add(badgeClassValidation(item.estatusValidacion));
    const operationalBadge = node.querySelector('.operational-badge'); operationalBadge.textContent = item.estatusOperativo; operationalBadge.classList.add(badgeClassOperational(item.estatusOperativo));
    const miniGrid = node.querySelector('.mini-grid');
    [ ['Incidencia', item.tipoIncidente], ['Solicita refacción', item.solicitaRefaccion ? 'Sí' : 'No'], ['KM', item.kilometraje || '—'], ['Contacto', item.contactoNombre || '—'], ['Teléfono', item.telefono || '—'], ['Revisó', item.revisadoPorNombre || 'Pendiente'], ['Último cambio', fmtDate(item.updatedAt)], ['Obs. operativo', item.observacionesOperativo || '—'], ['Motivo decisión', item.motivoDecision || '—'] ].forEach(([label, value]) => {
      const div = document.createElement('div'); div.innerHTML = `<strong>${escapeHtml(label)}</strong>${escapeHtml(String(value || '—'))}`; miniGrid.appendChild(div);
    });
    const strip = node.querySelector('.evidence-strip'); [...(item.evidencias || []), ...(item.evidenciasRefaccion || [])].slice(0,6).forEach(src => { const img = document.createElement('img'); img.src = src; strip.appendChild(img); }); if (item.firma) { const img = document.createElement('img'); img.src = item.firma; strip.appendChild(img); }
    const area = node.querySelector('.action-area'); const baseRow = document.createElement('div'); baseRow.className = 'action-row'; baseRow.appendChild(button('PDF', 'btn btn-ghost', () => exportPdf(item))); if (isRole('admin','operativo','supervisor')) baseRow.appendChild(button('Historial', 'btn btn-ghost', () => showAudit(item))); if (isRole('admin') && item.estatusOperativo === 'terminada') baseRow.appendChild(button('Preparar cobro', 'btn btn-primary', async () => { await openQuoteFromReport(item.id); })); if (isRole('admin')) baseRow.appendChild(button('Editar', 'btn btn-secondary', async () => { await editarReporteAdmin(item); })); if (isRole('admin')) baseRow.appendChild(button('Eliminar', 'btn btn-ghost', async () => { if (!confirm(`¿Eliminar la orden ${item.numeroObra} de la unidad ${item.numeroEconomico}?`)) return; try { await api.deleteGarantia(item.id); notify('Orden eliminada.'); await loadGarantias(); } catch (error) { notify(error.message, true); } })); area.appendChild(baseRow);
    if (isRole('operativo','admin')) {
      const reviewBox = document.createElement('div'); reviewBox.innerHTML = `
        <label>Decisión operativa</label>
        <div class="action-row">
          <select class="reviewStatus"><option value="pendiente de revisión">Pendiente de revisión</option><option value="aceptada">Aceptada</option><option value="rechazada">Rechazada</option></select>
          <input class="reviewReason" placeholder="Motivo o comentario" />
          <button class="btn btn-primary reviewBtn" type="button">Guardar decisión</button>
        </div>`;
      reviewBox.querySelector('.reviewStatus').value = item.estatusValidacion === 'nueva' ? 'pendiente de revisión' : item.estatusValidacion;
      reviewBox.querySelector('.reviewReason').value = item.estatusValidacion === 'rechazada' ? item.motivoDecision : item.observacionesOperativo;
      [reviewBox.querySelector('.reviewStatus'), reviewBox.querySelector('.reviewReason')].forEach(el => {
        el?.addEventListener('input', () => state.boardDirtyIds.add(item.id));
        el?.addEventListener('change', () => state.boardDirtyIds.add(item.id));
      });
      reviewBox.querySelector('.reviewBtn').addEventListener('click', async () => {
        try {
          const status = reviewBox.querySelector('.reviewStatus').value; const text = reviewBox.querySelector('.reviewReason').value.trim();
          await api.reviewGarantia(item.id, { estatusValidacion: status, observacionesOperativo: status !== 'rechazada' ? text : '', motivoDecision: status === 'rechazada' ? text : '' });
          state.boardDirtyIds.delete(item.id);
          notify('Decisión guardada.'); await loadGarantias();
        } catch (error) { notify(error.message, true); }
      });
      area.appendChild(reviewBox);
      if (item.estatusValidacion === 'aceptada') {
        const scheduleRow = document.createElement('div'); scheduleRow.className = 'action-row';
        if (isRole('admin','operativo','supervisor_flotas')) scheduleRow.appendChild(button('Solicitar servicio', 'btn btn-primary', async () => { try { await api.requestSchedule(item.id); notify('Solicitud enviada por WhatsApp.'); await loadSchedules(); switchPanel('schedule'); } catch (error) { notify(error.message, true); } }));
        if (isRole('operador')) scheduleRow.appendChild(button('Ver mi agenda', 'btn btn-secondary', async () => { await loadSchedules(); switchPanel('schedule'); }));
        if (scheduleRow.children.length) area.appendChild(scheduleRow);
        const operationalBox = document.createElement('div'); operationalBox.innerHTML = `
          <label>Flujo del trabajo</label>
          <div class="action-row">
            <select class="opStatus"><option value="sin iniciar">Sin iniciar</option><option value="en proceso">En proceso</option><option value="espera refacción">Espera refacción</option><option value="terminada">Terminada</option></select>
            <input class="opNotes" placeholder="Observación operativa" value="${escapeHtml(item.observacionesOperativo || '')}" />
            <button class="btn btn-secondary opBtn" type="button">Actualizar trabajo</button>
          </div>`;
        operationalBox.querySelector('.opStatus').value = item.estatusOperativo;
        [operationalBox.querySelector('.opStatus'), operationalBox.querySelector('.opNotes')].forEach(el => {
          el?.addEventListener('input', () => state.boardDirtyIds.add(item.id));
          el?.addEventListener('change', () => state.boardDirtyIds.add(item.id));
        });
        operationalBox.querySelector('.opBtn').addEventListener('click', async () => {
          try { await api.updateOperational(item.id, { estatusOperativo: operationalBox.querySelector('.opStatus').value, observacionesOperativo: operationalBox.querySelector('.opNotes').value.trim() }); state.boardDirtyIds.delete(item.id); notify('Flujo actualizado.'); await loadGarantias(); }
          catch (error) { notify(error.message, true); }
        });
        area.appendChild(operationalBox);
      }
    }
    els.garantiasList?.appendChild(node);
  });
}


function renderCompanies() {
  if (els.companiesList) els.companiesList.innerHTML = '';
  const all = Array.isArray(state.companies) ? state.companies : [];
  const activeCompanies = all.filter(item => item.activo !== false);

  if (els.companiesList) {
    all.forEach(item => {
      const row = document.createElement('div');
      row.className = 'table-row';
      row.innerHTML = `<div><strong>${escapeHtml(item.nombre)}</strong><div class="small muted">${escapeHtml(item.contacto || 'Sin contacto')} · ${escapeHtml(item.telefono || 'Sin teléfono')}</div><div class="small muted">${escapeHtml(item.email || 'Sin correo')}</div></div><div>${item.activo ? 'Activa' : 'Inactiva'}</div><div>${escapeHtml(item.notas || '—')}</div><div class="action-row"></div>`;
      const actions = row.querySelector('.action-row');
      if (isRole('admin')) {
        actions.appendChild(button('Editar', 'btn btn-secondary', () => beginCompanyEdit(item)));
        actions.appendChild(button(item.activo ? 'Desactivar' : 'Activar', 'btn btn-ghost', async () => {
          try {
            if (item.activo) {
              if (!confirm(`¿Desactivar ${item.nombre}?`)) return;
              await api.deactivateCompany(item.id);
              notify('Empresa desactivada.');
            } else {
              await api.updateCompany(item.id, { ...item, activo: true });
              notify('Empresa activada.');
            }
            await loadCompanies();
          } catch (error) { notify(error.message, true); }
        }));
        actions.appendChild(button('Eliminar', 'btn btn-ghost', async () => {
          if (!confirm(`¿Eliminar ${item.nombre}? Solo funciona si no tiene historial.`)) return;
          try { await api.deleteCompany(item.id); notify('Empresa eliminada.'); await loadCompanies(); }
          catch (error) { notify(error.message, true); }
        }));
      }
      els.companiesList.appendChild(row);
    });
  }

  fillSelect(els.empresa, activeCompanies, 'Selecciona empresa');
  fillSelect(els.regEmpresa, activeCompanies, 'Selecciona empresa');
  fillSelect(els.userEmpresa, activeCompanies, 'Sin empresa');

  // conservar selección del operador si ya tiene empresa
  if (isRole('operador') && state.user?.empresa && els.empresa && !els.empresa.value) {
    els.empresa.value = state.user.empresa;
  }
}


async function loadGarantias() { state.garantias = await api.getGarantias(); renderGarantias(); await loadNotifications(); }
async function loadUsers() { if (!isRole('admin')) return; state.users = await api.getUsers(); renderUsers(); }
async function loadCompanies() { state.companies = isRole('admin') ? await api.getCompanies() : await api.getPublicCompanies(); renderCompanies(); }
async function loadRequests() { if (!isRole('admin')) return; state.registrationRequests = await api.getRequests(); renderRequests(); }

function paintUnitHistory(history) {
  const q = normalizeText(els.unitHistorySearchInput?.value || '');
  const filtered = !q ? history : history.filter(item => normalizeText([item.numeroObra, item.modelo, item.empresa, item.tipoIncidente, item.descripcionFallo].join(' ')).includes(q));
  els.unitHistoryResult.innerHTML = filtered.length ? filtered.map(item => `<div class="table-row"><div><strong>Obra ${escapeHtml(item.numeroObra)}</strong><div class="small muted">${escapeHtml(item.modelo)} · ${escapeHtml(item.empresa)}</div><div class="small muted">${escapeHtml(item.descripcionFallo || '')}</div></div><div>${escapeHtml(item.tipoIncidente)}</div><div><span class="badge ${badgeClassValidation(item.estatusValidacion)}">${escapeHtml(item.estatusValidacion)}</span></div><div>${fmtDate(item.createdAt)}</div></div>`).join('') : '<div class="empty-state"><strong>Sin historial.</strong><span>No hay coincidencias para esa unidad.</span></div>';
}

async function renderUnitHistory() {
  const numero = els.unitHistoryInput?.value.trim();
  if (!numero) return notify('Escribe un número económico.');
  try {
    state.unitHistoryRows = await api.getUnitHistory(numero);
    paintUnitHistory(state.unitHistoryRows);
  } catch (error) { notify(error.message, true); }
}

els.tabLoginBtn?.addEventListener('click', () => {
  document.getElementById('loginPane')?.classList.remove('hidden');
  document.getElementById('registerPane')?.classList.add('hidden');
  els.tabLoginBtn.className = 'btn btn-primary'; if (els.tabRegisterBtn) els.tabRegisterBtn.className = 'btn btn-ghost';
});
els.tabRegisterBtn?.addEventListener('click', () => {
  document.getElementById('loginPane')?.classList.add('hidden');
  document.getElementById('registerPane')?.classList.remove('hidden');
  els.tabLoginBtn.className = 'btn btn-ghost'; els.tabRegisterBtn.className = 'btn btn-primary';
});

els.loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); els.loginError?.classList.add('hidden');
  try {
    const data = await api.login(els.loginEmail.value.trim(), els.loginPassword.value);
    state.token = data.token; localStorage.setItem('carlabToken', state.token); state.user = data.user; showDashboard();
    await loadCompanies(); await loadGarantias(); await loadUsers(); await loadRequests(); await loadSchedules(''); await loadNotifications(); await loadFleet(); resetReportForm(); resetCompanyForm(); resetFleetForm(); notify(`Bienvenido, ${state.user.nombre}.`);
  } catch (error) { if (els.loginError) { els.loginError.textContent = error.message; els.loginError.classList.remove('hidden'); } else notify(error.message,true); }
});

els.registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); els.registerMessage?.classList.add('hidden');
  try {
    const data = await api.registerOperator({ nombre: els.regNombre.value.trim(), email: els.regEmail.value.trim(), telefono: els.regTelefono.value.trim(), empresa: els.regEmpresa.value.trim(), numeroEconomico: els.regNumeroEconomico.value.trim(), password: els.regPassword.value });
    if (els.registerMessage) { els.registerMessage.textContent = data.message; els.registerMessage.classList.remove('hidden'); }
    els.registerForm.reset();
  } catch (error) { if (els.registerMessage) { els.registerMessage.textContent = error.message; els.registerMessage.classList.remove('hidden'); } else notify(error.message,true); }
});



function openImageLightbox(src, caption = 'Evidencia ampliada') {
  if (!src || !els.imageLightbox || !els.imageLightboxImg) return;
  els.imageLightboxImg.src = src;
  if (els.imageLightboxCaption) els.imageLightboxCaption.textContent = caption;
  els.imageLightbox.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}

function closeImageLightbox() {
  els.imageLightbox?.classList.add('hidden');
  if (els.imageLightboxImg) els.imageLightboxImg.src = '';
  if (els.imageLightboxCaption) els.imageLightboxCaption.textContent = '';
  document.body.classList.remove('lightbox-open');
}

function buildImageGallery(items = [], emptyText = 'Sin evidencia visual.') {
  if (!items.length) return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  return `<div class="media-gallery">${items.map((src, index) => `<button class="media-thumb" type="button" onclick='openImageLightbox(${JSON.stringify(src)}, ${JSON.stringify('Evidencia ')} + ${index + 1})'><img src="${src}" alt="Evidencia ${index + 1}" /></button>`).join('')}</div>`;
}

els.imageLightboxClose?.addEventListener('click', closeImageLightbox);
els.imageLightbox?.addEventListener('click', (e) => { if (e.target === els.imageLightbox) closeImageLightbox(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!els.partsRequestModal?.classList.contains('hidden')) closeIndependentRequestModal();
    if (!els.imageLightbox?.classList.contains('hidden')) closeImageLightbox();
  }
});
els.partsRequestClose?.addEventListener('click', closeIndependentRequestModal);
els.partsRequestCancel?.addEventListener('click', closeIndependentRequestModal);
els.partsRequestEmpresa?.addEventListener('change', updatePartsRequestUnitOptions);
els.partsRequestForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      empresa: els.partsRequestEmpresa?.value || '',
      numeroEconomico: els.partsRequestUnidad?.value || '',
      solicitud: els.partsRequestSolicitud?.value.trim(),
      priority: els.partsRequestPriority?.value || 'media',
      notes: [`Prioridad: ${els.partsRequestPriority?.value || 'media'}`, els.partsRequestNotes?.value.trim()].filter(Boolean).join(' · ')
    };
    if (!payload.empresa || !payload.solicitud) return notify('Completa empresa y refacción.', true);
    await api.createIndependentPartsRequest(payload);
    notify('Solicitud de refacción creada.');
    closeIndependentRequestModal();
    await cargarSolicitudesIndependientes();
    if (state.activePanel === 'parts') renderPartsPending();
  } catch (error) {
    notify(error.message, true);
  }
});

function fleetOwnerMetrics() {
  const units = state.fleetUnits || [];
  const pendingParts = (state.partsPending || []).filter(item => !state.user?.empresa || item.empresa === state.user.empresa);
  const unitCounts = {};
  units.forEach(unit => {
    const key = unit.numeroEconomico || '—';
    unitCounts[key] = (unitCounts[key] || 0) + 1;
  });
  const reincidentes = units.filter(unit => Number(unit.reportesCount || 0) > 1 || Number(unit.reportsCount || 0) > 1).length || [...new Set((state.garantias || []).filter(g => !state.user?.empresa || g.empresa === state.user.empresa).map(g => g.numeroEconomico).filter(Boolean))].length;
  const totalCost = units.reduce((sum, unit) => sum + Number(unit.costoTotal || 0), 0);
  const upcoming = (state.schedules || []).filter(s => (!state.user?.empresa || s.empresa === state.user.empresa) && ['confirmed','waiting_operator','proposed'].includes(String(s.status || '').toLowerCase())).length;
  return {
    total: units.length,
    detenidas: Number(state.fleetSummary?.detenidas || 0),
    enTaller: Number(state.fleetSummary?.enTaller || 0),
    pendingParts: pendingParts.length,
    reincidentes,
    upcoming,
    totalCost,
  };
}

function renderFleetOwnerDeck() {
  if (!els.fleetOwnerDeck) return;
  const m = fleetOwnerMetrics();
  const risky = [...(state.fleetUnits || [])]
    .sort((a,b) => (Number(b.costoTotal||0) + (b.lastReportAt ? 1 : 0)) - (Number(a.costoTotal||0) + (a.lastReportAt ? 1 : 0)))
    .slice(0,4);
  const nextUnits = (state.schedules || [])
    .filter(s => (!state.user?.empresa || s.empresa === state.user.empresa) && s.scheduledFor)
    .sort((a,b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
    .slice(0,3);
  els.fleetOwnerDeck.innerHTML = `
    <section class="fleet-owner-hero">
      <div class="fleet-owner-copy">
        <div class="topbar-kicker">MÓDULO DUEÑO</div>
        <h3>Control patrimonial de flota</h3>
        <p>Unidades, reincidencia, evidencia de refacciones y agenda en una sola lectura ejecutiva.</p>
      </div>
      <div class="fleet-owner-kpis">
        <article><span>Unidades</span><strong>${m.total}</strong></article>
        <article><span>Detenidas</span><strong>${m.detenidas}</strong></article>
        <article><span>En taller</span><strong>${m.enTaller}</strong></article>
        <article><span>Espera refacción</span><strong>${m.pendingParts}</strong></article>
        <article><span>Agenda viva</span><strong>${m.upcoming}</strong></article>
        <article><span>Costo histórico</span><strong>${money(m.totalCost)}</strong></article>
      </div>
    </section>
    <section class="fleet-owner-insights">
      <article class="owner-card">
        <div class="owner-card-head"><strong>Unidades que más te cuestan</strong><span class="badge badge-info">Lectura comercial</span></div>
        <div class="owner-list">${risky.length ? risky.map(unit => `<button type="button" class="owner-list-row" onclick="focusFleetUnit(${JSON.stringify(unit.id)})"><span>${escapeHtml(unit.numeroEconomico || '—')}</span><small>${escapeHtml(unit.empresa || '—')}</small><strong>${money(unit.costoTotal || 0)}</strong></button>`).join('') : '<div class="muted">Sin costos acumulados todavía.</div>'}</div>
      </article>
      <article class="owner-card">
        <div class="owner-card-head"><strong>Agenda inmediata</strong><span class="badge badge-info">Ingresos</span></div>
        <div class="owner-list">${nextUnits.length ? nextUnits.map(item => `<div class="owner-list-row static"><span>${escapeHtml(item.unidad || '—')}</span><small>${escapeHtml(item.empresa || '—')}</small><strong>${escapeHtml(fmtDate(item.scheduledFor || item.proposedAt))}</strong></div>`).join('') : '<div class="muted">Sin citas próximas registradas.</div>'}</div>
      </article>
    </section>`;
}

async function focusFleetUnit(id) {
  if (!id) return;
  try {
    state.selectedFleetUnit = await api.getFleetUnit(id);
    if (isRole('admin')) await loadAdminUnitCosts(id);
    switchPanel('fleet');
    renderFleet();
    renderFleetDetail();
    document.getElementById('fleetDetail')?.scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (error) {
    notify(error.message, true);
  }
}

async function uploadPartsImages(input) {
  const files = [...(input?.files || [])];
  if (!files.length) return [];
  const urls = await Promise.all(files.map(file => fileToCompressedDataUrl(file, 1600, 0.8)));
  input.value = '';
  return urls;
}

function logoutSession() {
  localStorage.removeItem('carlabToken');
  state.token = '';
  state.user = null;
  state.selectedFleetUnit = null;
  if (els.operatorAppNav) {
    els.operatorAppNav.classList.add('hidden');
    els.operatorAppNav.style.display = 'none';
    requestAnimationFrame(() => { if (els.operatorAppNav) els.operatorAppNav.style.display = ''; });
  }
  updateOperatorAppNav('');
  showLogin();
}

els.logoutBtn?.addEventListener('click', logoutSession);
els.globalRefreshBtn?.addEventListener('click', async () => { await Promise.allSettled([loadGarantias(), loadSchedules(''), loadNotifications(), loadFleet(), loadPartsPending(true), isRole('admin') ? loadStock(true) : Promise.resolve(), isRole('admin') ? loadCobranza(true) : Promise.resolve()]); renderExecutiveDeck(); notify('Datos actualizados.'); });
els.opNavHomeBtn?.addEventListener('click', () => switchPanel('board'));
els.opNavNewBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.opNavScheduleBtn?.addEventListener('click', async () => { await loadSchedules(''); switchPanel('schedule'); });
els.opNavLogoutBtn?.addEventListener('click', logoutSession);
els.imageLightboxClose?.addEventListener('click', closeImageLightbox);
els.imageLightbox?.addEventListener('click', (e) => { if (e.target === els.imageLightbox) closeImageLightbox(); });
els.navBoardBtn?.addEventListener('click', () => switchPanel('board'));
els.navNewReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.navAnalyticsBtn?.addEventListener('click', () => switchPanel('analytics'));
els.navHistoryBtn?.addEventListener('click', () => switchPanel('history'));
els.navScheduleBtn?.addEventListener('click', async () => { await loadSchedules(''); switchPanel('schedule'); });
els.navFleetBtn?.addEventListener('click', async () => { await loadFleet(); switchPanel('fleet'); });
els.navPartsBtn?.addEventListener('click', async () => { await cargarSolicitudesIndependientes(); await loadPartsPending(true); switchPanel('parts'); });
els.navStockBtn?.addEventListener('click', async () => { await loadStock(true); switchPanel('stock'); });
els.navCobranzaBtn?.addEventListener('click', async () => { await loadCobranza(true); switchPanel('cobranza'); });
els.stockRefreshBtn?.addEventListener('click', async () => { await loadStock(true); switchPanel('stock'); });
els.cobranzaRefreshBtn?.addEventListener('click', async () => { await loadCobranza(true); switchPanel('cobranza'); });
els.stockCancelBtn?.addEventListener('click', resetStockForm);

els.stockPartForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      nombre: els.stockNombre?.value || '',
      sku: els.stockSku?.value || '',
      proveedor: els.stockProveedor?.value || '',
      stockActual: els.stockActual?.value || 0,
      stockMinimo: els.stockMinimo?.value || 0,
      costoUnitario: els.stockCosto?.value || 0,
      precioVenta: els.stockPrecio?.value || 0,
      ubicacion: els.stockUbicacion?.value || '',
      notas: els.stockNotas?.value || ''
    };
    if (els.stockPartId?.value) await api.updateStockPart(els.stockPartId.value, payload);
    else await api.createStockPart(payload);
    notify('Refacción guardada en stock.');
    resetStockForm();
    await loadStock(true);
  } catch (error) { notify(error.message, true); }
});
els.stockAssignClose?.addEventListener('click', closeStockAssignModal);
els.stockAssignCancel?.addEventListener('click', closeStockAssignModal);
els.stockAssignForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createStockMovement(state.selectedStockPartId, { tipo:'salida_unidad', cantidad:Number(els.stockAssignQty?.value || 0), unidad:els.stockAssignUnit?.value || '', empresa:els.stockAssignCompany?.value || '', garantiaFolio:els.stockAssignFolio?.value || '', notas:els.stockAssignNotes?.value || '' });
    notify('Salida a camión registrada.');
    closeStockAssignModal();
    await loadStock(true);
  } catch (error) { notify(error.message, true); }
});
els.directSaleStockPart?.addEventListener('change', () => { state.directSaleDraftPartId = els.directSaleStockPart.value || ''; syncDirectSalePartDefaults(true); });
['directSaleQty','directSalePrice','directSaleConcept','directSaleType'].forEach(id => document.getElementById(id)?.addEventListener('input', updateDirectSalePreview));
document.getElementById('directSaleType')?.addEventListener('change', updateDirectSalePreview);
els.directSaleAddConceptBtn?.addEventListener('click', () => { try { pushCurrentDirectSaleItem(); } catch (error) { notify(error.message, true); } });
els.directSaleResetBtn?.addEventListener('click', resetDirectSaleForm);
els.directSalePdfBtn?.addEventListener('click', () => exportDirectSalePdf({ folio:'VTA-BORRADOR', customerName:String(els.directSaleCustomer?.value || '').trim() || 'Mostrador', customerPhone:String(els.directSalePhone?.value || '').trim(), companyName:String(els.directSaleCompany?.value || '').trim(), unitNumber:String(els.directSaleUnit?.value || '').trim(), paymentMethod:String(els.directSaleMethod?.value || '').trim(), paymentStatus:String(els.directSalePaymentStatus?.value || 'pendiente'), notes:String(els.directSaleNotes?.value || '').trim(), subtotal:updateDirectSalePreview(), total:updateDirectSalePreview(), createdAt:new Date().toISOString(), items: currentDirectSalePayload(true).items.map(item => ({ ...item, total: Number((item.qty * item.unitPrice).toFixed(2)) })) }));
els.directSaleForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = currentDirectSalePayload(true);
    if (!payload.items.length) throw new Error('Captura al menos un concepto de la venta.');
    const sale = await api.createDirectSale(payload);
    notify('Venta directa registrada.');
    resetDirectSaleForm();
    await Promise.all([loadCobranza(true), loadStock(true)]);
    if (sale?.id || sale?.folio) exportDirectSalePdf(sale);
  } catch (error) { notify(error.message, true); }
});
els.navUsersBtn?.addEventListener('click', async () => { switchPanel('users'); await loadUsers(); });
els.navRequestsBtn?.addEventListener('click', async () => { switchPanel('requests'); await loadRequests(); });
els.navCompaniesBtn?.addEventListener('click', async () => { switchPanel('companies'); await loadCompanies(); });
els.cancelReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('board'); });
els.userCancelEditBtn?.addEventListener('click', resetUserForm);
els.companyCancelEditBtn?.addEventListener('click', resetCompanyForm);
els.fleetNewBtn?.addEventListener('click', () => { if (!isRole('admin','operativo')) return; state.editingFleetUnitId = ''; toggleFleetForm(true); if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = 'Guardar unidad'; });
els.fleetCancelBtn?.addEventListener('click', resetFleetForm);
els.userRole?.addEventListener('change', () => {
  const role = els.userRole.value;
  const needsEmpresa = ['operador','supervisor','supervisor_flotas'].includes(role);
  if (els.userEmpresa) { els.userEmpresa.disabled = !needsEmpresa; if (!needsEmpresa) els.userEmpresa.value = ''; }
});
els.unitHistoryBtn?.addEventListener('click', renderUnitHistory);
els.unitHistorySearchInput?.addEventListener('input', () => paintUnitHistory(state.unitHistoryRows || []));
els.scheduleRefreshBtn?.addEventListener('click', async () => { await loadSchedules(''); switchPanel('schedule'); });
els.scheduleManualCancelBtn?.addEventListener('click', () => resetScheduleManualForm());
els.scheduleManualEmpresa?.addEventListener('change', () => {
  const company = els.scheduleManualEmpresa?.value || '';
  const units = (state.fleetUnits || []).filter(u => !company || u.empresa === company);
  if (els.scheduleManualUnidad) {
    els.scheduleManualUnidad.innerHTML = '<option value="">Selecciona unidad</option>' + units.map(u => `<option value="${escapeHtml(u.numeroEconomico || '')}">${escapeHtml(u.numeroEconomico || '')} · ${escapeHtml(u.modelo || '')}</option>`).join('');
    els.scheduleManualUnidad.value = '';
  }
});
els.scheduleManualUnidad?.addEventListener('change', () => {
  const selectedUnit = (state.fleetUnits || []).find(u => String(u.numeroEconomico || '') === String(els.scheduleManualUnidad?.value || ''));
  if (selectedUnit && els.scheduleManualEmpresa && !els.scheduleManualEmpresa.value) els.scheduleManualEmpresa.value = selectedUnit.empresa || '';
});
els.scheduleManualForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      empresa: String(els.scheduleManualEmpresa?.value || '').trim(),
      unidad: String(els.scheduleManualUnidad?.value || '').trim(),
      telefono: String(els.scheduleManualTelefono?.value || '').trim(),
      folio: String(els.scheduleManualFolio?.value || '').trim(),
      contactoNombre: String(els.scheduleManualContacto?.value || '').trim(),
      scheduledFor: els.scheduleManualDatetime?.value ? new Date(els.scheduleManualDatetime.value).toISOString() : '',
      notes: String(els.scheduleManualNotes?.value || '').trim(),
    };
    await api.createManualSchedule(payload);
    notify('Ingreso manual programado.');
    resetScheduleManualForm();
    await loadSchedules('');
    switchPanel('schedule');
  } catch (error) {
    notify(error.message, true);
  }
});

els.fleetRefreshBtn?.addEventListener('click', async () => { await loadFleet(); switchPanel('fleet'); });
els.partsRefreshBtn?.addEventListener('click', async () => { await loadPartsPending(true); switchPanel('parts'); });
els.fleetSearchInput?.addEventListener('input', renderFleet);
els.fleetStatusFilter?.addEventListener('change', renderFleet);
['fleetEmpresa','fleetNombreFlota','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetPolizaActiva','fleetCampaignActiva'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('input', () => state.fleetDirty = true);
  el?.addEventListener('change', () => state.fleetDirty = true);
});
els.fleetSaveBtn?.addEventListener('click', async () => {
  try {
    const payload = {
      empresa: els.fleetEmpresa?.value.trim(),
      nombreFlota: els.fleetNombreFlota?.value.trim(),
      numeroEconomico: els.fleetNumeroEconomico?.value.trim(),
      numeroObra: els.fleetNumeroObra?.value.trim(),
      marca: els.fleetMarca?.value.trim(),
      modelo: els.fleetModelo?.value.trim(),
      anio: els.fleetAnio?.value.trim(),
      kilometraje: els.fleetKilometraje?.value.trim(),
      polizaActiva: !!els.fleetPolizaActiva?.checked,
      campaignActiva: !!els.fleetCampaignActiva?.checked
    };
    if (state.editingFleetUnitId) { await api.updateFleetUnit(state.editingFleetUnitId, payload); notify('Unidad actualizada.'); }
    else { await api.createFleetUnit(payload); notify('Unidad de flota guardada.'); }
    state.fleetDirty = false;
    resetFleetForm();
    await loadFleet();
  } catch (error) { notify(error.message, true); }
});


els.reportForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (state.editingGarantiaId) {
      await api.updateGarantia(state.editingGarantiaId, reportPayload());
      notify('Reporte actualizado.');
    } else {
      await api.createGarantia(reportPayload());
      notify('Reporte enviado. Ya cayó al sistema.');
    }
    resetReportForm();
    switchPanel('board');
    await loadGarantias();
  } catch (error) { notify(error.message, true); }
});

els.userForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const role = els.userRole.value;
    const payload = { nombre: els.userNombre.value.trim(), email: els.userEmail.value.trim(), role, empresa: ['operador','supervisor','supervisor_flotas'].includes(role) ? els.userEmpresa.value.trim() : '', telefono: els.userTelefono.value.trim(), password: els.userPassword.value };
    if (state.editingUserId) { await api.updateUser(state.editingUserId, payload); notify('Usuario actualizado.'); }
    else { await api.createUser(payload); notify('Usuario creado.'); }
    resetUserForm(); await loadUsers();
  } catch (error) { notify(error.message, true); }
});

els.companyForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { nombre: els.companyNombre.value.trim(), contacto: els.companyContacto.value.trim(), telefono: els.companyTelefono.value.trim(), email: els.companyEmail.value.trim(), notas: els.companyNotas.value.trim(), activo: true };
  try {
    if (state.editingCompanyId) { await api.updateCompany(state.editingCompanyId, payload); notify('Empresa actualizada.'); }
    else { await api.createCompany(payload); notify('Empresa guardada.'); }
    resetCompanyForm();
    await loadCompanies();
  }
  catch (error) { notify(error.message, true); }
});

['input','change'].forEach(evt => { els.searchInput?.addEventListener(evt, renderGarantias); els.validationFilter?.addEventListener(evt, renderGarantias); els.operationalFilter?.addEventListener(evt, renderGarantias); });

(async function init() {
  try { state.companies = await api.getPublicCompanies(); renderCompanies(); } catch {}
  if (!state.token) return showLogin();
  try {
    const data = await api.me(); state.user = data.user; showDashboard();
    await Promise.allSettled([loadCompanies(), loadGarantias(), loadNotifications()]);
    if (isRole('admin')) await Promise.allSettled([loadUsers(), loadRequests()]);
    if (isRole('admin','operativo','supervisor','supervisor_flotas','operador')) await Promise.allSettled([loadSchedules('')]);
    if (isRole('admin','operativo','supervisor_flotas')) await Promise.allSettled([loadFleet()]);
    if (isRole('admin','supervisor_flotas')) await Promise.allSettled([cargarSolicitudesIndependientes(), loadPartsPending(true)]);
    resetReportForm(); resetCompanyForm(); resetFleetForm();
  } catch {
    localStorage.removeItem('carlabToken'); state.token = ''; showLogin();
  }
})();


setInterval(async () => {
  if (!state.token || !state.user) return;
  try {
    if (!shouldPauseLiveRefresh()) await loadNotifications();
    if (state.activePanel === 'schedule' && !shouldPauseLiveRefresh('schedule')) await Promise.allSettled([loadSchedules('')]);
    if (state.activePanel === 'fleet' && !shouldPauseLiveRefresh('fleet')) await Promise.allSettled([loadFleet()]);
    renderExecutiveDeck();
  } catch {}
}, 15000);
window.guardarCostoAdmin = guardarCostoAdmin;
window.eliminarCostoAdmin = eliminarCostoAdmin;
window.openImageLightbox = openImageLightbox;
window.focusFleetUnit = focusFleetUnit;
