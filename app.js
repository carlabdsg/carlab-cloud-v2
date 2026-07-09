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
  fleetAnalytics: null,
  fleetOwnerLiveTimer: null,
  selectedFleetUnit: null,
  editingFleetUnitId: '',
  unitHistoryRows: [],
  partsPending: [],
  partsCacheAt: 0,
  partsDirtyIds: new Set(),
  fleetDirty: false,
  fleetEntryMode: 'single',
  fleetBulkDeletePreview: [],
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
  campaigns: [],
  selectedCampaign: null,
  selectedCampaignId: '',
  campaignUnitEvidence: [],
  garantiaFullCache: {},
  servicesReport: { summary: {}, reports: [] },
  authorizedActivitiesEditingId: '',
  authorizedActivitiesByReport: {},
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
  getGarantia(id) { return this.request(`/api/garantias/${id}`); },
  getServicesReport(params = {}) { const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined && v !== null && String(v) !== '')); return this.request(`/api/services-report${qs.toString() ? `?${qs}` : ''}`); },
  getAuthorizedActivities(id) { return this.request(`/api/garantias/${id}/authorized-activities`); },
  createAuthorizedActivity(id, payload) { return this.request(`/api/garantias/${id}/authorized-activities`, { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateAuthorizedActivity(id, payload) { return this.request(`/api/authorized-activities/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteAuthorizedActivity(id) { return this.request(`/api/authorized-activities/${id}`, { method: 'DELETE' }); },
  saveAuthorizedActivitiesBulk(id, activities) { return this.request(`/api/garantias/${id}/authorized-activities`, { method: 'PUT', body: JSON.stringify({ activities: Array.isArray(activities) ? activities : [] }) }); },
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
  remindSupervisorWhatsApp(id) { return this.request(`/api/garantias/${id}/remind-supervisor`, { method: 'POST' }); },
  confirmSchedule(id, payload) { return this.request(`/api/schedules/${id}/confirm`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  cancelSchedule(id, payload) { return this.request(`/api/schedules/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  rescheduleSchedule(id, payload) { return this.request(`/api/schedules/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getPartsPending() { return this.request('/api/parts/pending'); },
  getPartPendingDetail(id) { return this.request(`/api/parts/pending/${id}`); },
  updateParts(id, payload) { return this.request(`/api/garantias/${id}/parts`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getIndependentPartsRequests() { return this.request('/api/parts/requests'); },
  createIndependentPartsRequest(payload) { return this.request('/api/parts/requests', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateIndependentPartsRequest(id, payload) { return this.request(`/api/parts/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getNotifications() { return this.request('/api/notifications'); },

  getFleetSummary() { return this.request('/api/fleet/summary'); },
  getFleetUnits() { return this.request('/api/fleet/units'); },
  getFleetAnalytics() { return this.request('/api/fleet/analytics'); },
  getFleetUnit(id) { return this.request(`/api/fleet/units/${id}`); },
  getFleetUnitDetails(id) { return this.request(`/api/fleet/units/${id}/details`); },
  getFleetUnitReports(id) { return this.request(`/api/fleet/units/${id}/reports`); },
  getFleetUnitCampaigns(id) { return this.request(`/api/fleet/units/${id}/campaigns`); },
  getFleetUnitSchedules(id) { return this.request(`/api/fleet/units/${id}/schedules`); },
  getFleetUnitParts(id) { return this.request(`/api/fleet/units/${id}/parts`); },
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
  getCampaigns() { return this.request('/api/campaigns'); },
  createCampaign(payload) { return this.request('/api/campaigns', { method:'POST', body: JSON.stringify(payload || {}) }); },
  updateCampaign(id, payload) { return this.request(`/api/campaigns/${id}`, { method:'PATCH', body: JSON.stringify(payload || {}) }); },
  getCampaignUnits(id) { return this.request(`/api/campaigns/${id}/units`); },
  createCampaignUnit(id, payload) { return this.request(`/api/campaigns/${id}/units`, { method:'POST', body: JSON.stringify(payload || {}) }); },
  updateCampaignUnit(id, payload) { return this.request(`/api/campaigns/units/${id}`, { method:'PATCH', body: JSON.stringify(payload || {}) }); },
  deleteCampaign(id) { return this.request(`/api/campaigns/${id}`, { method:'DELETE' }); },
  deleteCampaignUnit(id) { return this.request(`/api/campaigns/units/${id}`, { method:'DELETE' }); },
  getDirectSales() { return this.request('/api/cobranza/direct-sales'); },
  createDirectSale(payload) { return this.request('/api/cobranza/direct-sales', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateDirectSale(id, payload) { return this.request(`/api/cobranza/direct-sales/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },

};

const els = {};
function bind() {
  [
    'loginView','dashboardView','loginForm','loginEmail','loginPassword','loginError','registerForm','registerMessage','regNombre','regEmail','regTelefono','regEmpresa','regNumeroEconomico','regPassword',
    'tabLoginBtn','tabRegisterBtn','welcomeText','currentUserName','currentUserEmail','currentRoleBadge','avatarCircle','pageTitle','roleSummaryText','roleBrief','logoutBtn',
    'navBoardBtn','navNewReportBtn','navServicesBtn','navAnalyticsBtn','navHistoryBtn','navScheduleBtn','navFleetBtn','navPartsBtn','navStockBtn','navCobranzaBtn','navUsersBtn','navRequestsBtn','navCompaniesBtn','reportFormPanel','usersPanel','requestsPanel','companiesPanel','analyticsPanel','historyPanel','schedulePanel','filtersPanel','stockPanel','cobranzaPanel','servicesPanel','servicesPeriod','servicesStartDate','servicesEndDate','servicesEmpresa','servicesUnidad','servicesEstatus','servicesConsultBtn','servicesPdfBtn','servicesDetailPdfBtn','servicesCsvBtn','servicesJsonBtn','servicesPackageBtn','servicesSummary','servicesTable','authorizedActivitiesModal','authorizedActivitiesClose','authorizedActivitiesSummary','authorizedActivitiesList','authorizedActivitiesAddBtn','authorizedActivitiesCancelBtn','authorizedActivitiesSaveBtn',
    'reportForm','numeroObra','modelo','numeroEconomico','empresa','kilometraje','contactoNombre','telefono','descripcionFallo','solicitaRefaccion','refaccionFields','detalleRefaccion',
    'evidencias','evidenciasCamara','evidenciasRefaccion','evidenciasRefaccionCamara','previewEvidencias','previewRefaccion','firmaCanvas','clearSignatureBtn','cancelReportBtn','searchInput','validationFilter','operationalFilter',
    'garantiasList','garantiaCardTemplate','statTotal','statNew','statAccepted','statDone','listTitle','boardKicker','statusLegend','userForm','userId','userNombre','userEmail',
    'userRole','userEmpresa','userTelefono','userPassword','userSubmitBtn','userCancelEditBtn','usersList','emptyState','toast','requestsList','companiesList','companyForm','companyId','companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas','companySubmitBtn','companyCancelEditBtn',
    'executiveDeck','executiveDeckGrid','liveRefreshBadge','topCompanies','topModels','topIncidentTypes','repeatUnits','unitHistoryInput','unitHistorySearchInput','unitHistoryBtn','unitHistoryResult','scheduleDateInput','scheduleRefreshBtn','scheduleList','scheduleCalendar','scheduleAlerts','partsPanel','partsRefreshBtn','partsSummary','partsList','globalRefreshBtn','notifSummary','operatorAppNav','opNavHomeBtn','opNavNewBtn','opNavScheduleBtn','opNavLogoutBtn','fleetOwnerDeck','imageLightbox','imageLightboxImg','imageLightboxClose',
    'navFleetBtn','fleetPanel','fleetBulkDeleteBox','fleetBulkDeleteEmpresa','fleetBulkDeleteNumeros','fleetBulkDeleteSummary','fleetBulkDeletePreview','fleetBulkDeletePreviewBtn','fleetBulkDeleteConfirmBtn','fleetEmpresa','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota','fleetPolizaActiva','fleetCampaignActiva','fleetSaveBtn','fleetRefreshBtn','fleetUnitsGrid','fleetUnitsList','fleetDetail','fleetTotal','fleetOperando','fleetTaller','fleetDetenidas','fleetProgramadas','fleetNewBtn','fleetCancelBtn','fleetFormBox','fleetSearchInput','fleetStatusFilter','navCampaignsBtn','campaignsPanel','campaignsRefreshBtn','campaignSummary','campaignGroupId','campaignName','campaignEmpresa','campaignNotes','campaignSaveBtn','campaignClearBtn','campaignGroupsList','campaignDetail','campaignDetailTitle','campaignDetailBadge','campaignUnitId','campaignUnitEmpresa','campaignUnitNumero','campaignUnitStatus','campaignUnitNotes','campaignUnitEvidence','campaignEvidencePreview','campaignUnitSaveBtn','campaignUnitClearBtn','campaignUnitsGrid',
    'partsRequestModal','partsRequestClose','partsRequestCancel','partsRequestForm','partsRequestEmpresa','partsRequestUnidad','partsRequestSolicitud','partsRequestPriority','partsRequestNotes','partsRequestOwnerHint','imageLightboxCaption','reportDetailModal','reportDetailClose','reportDetailContent','stockRefreshBtn','stockSummary','stockList','stockMovements','stockPartForm','stockPartId','stockNombre','stockSku','stockProveedor','stockActual','stockMinimo','stockCosto','stockPrecio','stockUbicacion','stockNotas','stockSaveBtn','stockCancelBtn','scheduleManualForm','scheduleManualEmpresa','scheduleManualUnidad','scheduleManualTelefono','scheduleManualFolio','scheduleManualDatetime','scheduleManualContacto','scheduleManualNotes','scheduleManualCancelBtn','cobranzaRefreshBtn','cobranzaSummary','cobranzaQuotesList','cobranzaQuoteDetail','directSaleForm','directSaleCustomer','directSalePhone','directSaleCompany','directSaleUnit','directSaleType','directSaleConcept','directSaleStockPart','directSaleQty','directSalePrice','directSaleMethod','directSalePaymentStatus','directSaleNotes','directSaleAddConceptBtn','directSaleItemsList','directSaleResetBtn','directSalePdfBtn','directSaleTotal','directSalesList','stockAssignModal','stockAssignClose','stockAssignCancel','stockAssignForm','stockAssignPartName','stockAssignPartMeta','stockAssignQty','stockAssignUnit','stockAssignCompany','stockAssignFolio','stockAssignNotes',
    'commandSidePanel','recentActivityList','upcomingAgendaList','statusDonut','statusDonutTotal','statusDonutLegend'
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

async function getGarantiaFull(id) {
  const garantiaId = String(id || '').trim();
  if (!garantiaId) throw new Error('ID de garantía requerido para cargar el reporte completo.');
  if (state.garantiaFullCache[garantiaId]) return state.garantiaFullCache[garantiaId];
  const full = await api.getGarantia(garantiaId);
  if (!full || !full.id) throw new Error(`No se pudo cargar el reporte completo (${garantiaId}).`);
  const normalizeEvidence = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (_error) {
        return [];
      }
    }
    return [];
  };
  const activities = await api.getAuthorizedActivities(garantiaId).catch(() => []);
  const normalized = {
    ...full,
    evidencias: normalizeEvidence(full.evidencias),
    evidenciasRefaccion: normalizeEvidence(full.evidenciasRefaccion),
    firma: typeof full.firma === 'string' ? full.firma : '',
    authorizedActivities: activities,
    authorizedActivitiesCount: activities.length,
  };
  state.garantiaFullCache[garantiaId] = normalized;
  return normalized;
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
function normalizeIdentityKey(value='') {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function fleetSemaforo(unit) {
  const auto = normalizeText(unit.statusAuto || '');
  if (unit.campaignActiva) return { key:'campania', label:'Campaña activa', cls:'fleet-campaign-active' };
  if (auto === 'critical') return { key:'critical', label:'Crítico', cls:'fleet-bad' };
  if (auto === 'warning') return { key:'warning', label:'Con atención', cls:'fleet-warn' };
  return { key:'ok', label:'Operativa', cls:'fleet-ok' };
}
function fleetBusAsset(unit) {
  return normalizeText(unit.marca || '').includes('volvo') ? '/assets/buses/bus-volvo.svg' : '/assets/buses/bus-irizar.svg';
}
function fleetStatusLuxury(unit) {
  const sem = fleetSemaforo(unit);
  if (sem.key === 'campania') return { text:'Campaña activa', chip:'warn', visual:'status-blue' };
  if (sem.key === 'ok') return { text:'🟢 Operando', chip:'good', visual:'status-green' };
  if (sem.key === 'warning') return { text:'🟠 En proceso', chip:'warn', visual:'status-amber' };
  return { text:'🔴 Refacción pendiente', chip:'bad', visual:'status-red' };
}
function fleetTagPoliza(unit) {
  return unit.polizaActiva ? { text:'Póliza activa', cls:'good' } : { text:'Sin póliza', cls:'neutral' };
}
function fleetTagCampania(unit) {
  return unit.campaignActiva ? { text:'Campaña activa', cls:'warn' } : { text:'Sin campaña', cls:'neutral' };
}
function fleetHumanStatusByAuto(statusAuto = 'ok') {
  if (statusAuto === 'critical') return '🔴 Refacción pendiente';
  if (statusAuto === 'warning') return '🟠 En proceso';
  return '🟢 Operando';
}
function normalizeFleetStatus(unit) {
  const sem = fleetSemaforo(unit);
  const raw = `${unit?.estado || ''} ${unit?.status || ''} ${unit?.estatus || ''} ${unit?.statusAuto || ''} ${sem.label || ''}`.toLowerCase();
  if (raw.includes('refacción') || raw.includes('refaccion') || raw.includes('detenida') || raw.includes('detenido') || raw.includes('pendiente') || sem.key === 'critical') {
    return { label: 'Refacción pendiente', priority: 'Crítica', color: 'red', busColor: 'red', visual: 'status-red', dot: '🔴' };
  }
  if (raw.includes('proceso') || sem.key === 'warning') {
    return { label: 'En proceso', priority: 'En proceso', color: 'orange', busColor: 'orange', visual: 'status-amber', dot: '🟠' };
  }
  if (sem.key === 'campania') return { label: 'Campaña activa', priority: 'Campaña', color: 'blue', busColor: 'blue', visual: 'status-blue', dot: '🔵' };
  return { label: 'Operando', priority: 'Operando', color: 'green', busColor: 'green', visual: 'status-green', dot: '🟢' };
}
function formatLastMovement(date) {
  if (!date) return 'Sin movimiento';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Sin movimiento';
  if (parsed.getFullYear() <= 1970) return 'Sin movimiento';
  const today = new Date();
  const sameDay = parsed.getFullYear() === today.getFullYear() && parsed.getMonth() === today.getMonth() && parsed.getDate() === today.getDate();
  if (sameDay) return 'Último movimiento: hoy';
  return `Último movimiento: ${parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`;
}
function fleetInactiveTimeMeta(unit = {}) {
  const reference = unit.lastOpenReportAt || unit.lastReportAt || unit.lastRefaccionAt || unit.lastMovementAt || null;
  const parsed = reference ? new Date(reference) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 1970;
  const ms = valid ? Math.max(0, Date.now() - parsed.getTime()) : Number.MAX_SAFE_INTEGER;
  return { ms, text: formatLastMovement(reference) };
}
function formatElapsedClock(_ms = 0) {
  return 'Sin movimiento';
}
function liveAttentionText(sinceIso, statusAuto = 'warning') {
  if (statusAuto === 'critical') return 'Crítica';
  if (statusAuto === 'warning') return 'En proceso';
  return formatLastMovement(sinceIso);
}
function mountFleetOwnerLiveTimer() {
  if (state.fleetOwnerLiveTimer) clearInterval(state.fleetOwnerLiveTimer);
  state.fleetOwnerLiveTimer = null;
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
  const selectedEmpresaKey = normalizeIdentityKey(els.scheduleManualEmpresa?.value || '');
  const units = (state.fleetUnits || []).filter(u => !selectedEmpresaKey || normalizeIdentityKey(u.empresa) === selectedEmpresaKey);
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

async function appendEvidenceFromInput(inputEl, targetKey, previewEl, previewType) {
  if (!inputEl?.files?.length) return;
  const incoming = await Promise.all([...inputEl.files].map(file => fileToCompressedDataUrl(file)));
  state[targetKey] = [...state[targetKey], ...incoming.filter(Boolean)];
  drawPreviews(previewEl, state[targetKey], previewType);
  inputEl.value = '';
}
els.evidencias?.addEventListener('change', async e => { await appendEvidenceFromInput(e.target, 'currentEvidence', els.previewEvidencias, 'evidence'); });
els.evidenciasCamara?.addEventListener('change', async e => { await appendEvidenceFromInput(e.target, 'currentEvidence', els.previewEvidencias, 'evidence'); });
els.evidenciasRefaccion?.addEventListener('change', async e => { await appendEvidenceFromInput(e.target, 'currentRefEvidence', els.previewRefaccion, 'ref'); });
els.evidenciasRefaccionCamara?.addEventListener('change', async e => { await appendEvidenceFromInput(e.target, 'currentRefEvidence', els.previewRefaccion, 'ref'); });
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
function setFleetEntryMode(mode = 'single') {
  state.fleetEntryMode = mode === 'batch' ? 'batch' : 'single';
  const isBatch = state.fleetEntryMode === 'batch';
  document.getElementById('fleetIndividualForm')?.classList.toggle('hidden', isBatch);
  document.getElementById('fleetBatchForm')?.classList.toggle('hidden', !isBatch);
  document.getElementById('fleetIndividualForm')?.setAttribute('aria-hidden', String(isBatch));
  document.getElementById('fleetBatchForm')?.setAttribute('aria-hidden', String(!isBatch));
  document.querySelectorAll('#fleetPanel [data-fleet-entry-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fleetEntryMode === state.fleetEntryMode);
  });
  if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = state.editingFleetUnitId ? 'Guardar cambios' : 'Guardar unidad';
}
function toggleFleetForm(show = false) {
  els.fleetFormBox?.classList.toggle('hidden', !show);
  els.fleetFormBox?.setAttribute('aria-hidden', String(!show));
  els.fleetCancelBtn?.classList.toggle('hidden', !show);
  if (els.fleetNewBtn) els.fleetNewBtn.textContent = show ? (state.editingFleetUnitId ? 'Editando unidad' : '+ Nueva unidad') : '+ Nueva unidad';
  if (show) setFleetEntryMode(state.editingFleetUnitId ? 'single' : (state.fleetEntryMode || 'single'));
}
function clearFleetBatchForm() {
  ['fleetBatchEmpresa','fleetBatchNombreFlota','fleetBatchMarca','fleetBatchModelo','fleetBatchAnio','fleetBatchNumeroObra','fleetBatchKilometraje','fleetBatchNumeros'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const poliza = document.getElementById('fleetBatchPolizaActiva');
  const camp = document.getElementById('fleetBatchCampaignActiva');
  if (poliza) poliza.checked = false;
  if (camp) camp.checked = false;
  const summary = document.getElementById('fleetBatchSummary');
  if (summary) summary.textContent = '';
}
function resetFleetForm() {
  state.fleetDirty = false;
  state.editingFleetUnitId = '';
  state.fleetEntryMode = 'single';
  ['fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota'].forEach(id => { if (els[id]) els[id].value = ''; });
  if (els.fleetPolizaActiva) els.fleetPolizaActiva.checked = false;
  if (els.fleetCampaignActiva) els.fleetCampaignActiva.checked = false;
  clearFleetBatchForm();
  setFleetEntryMode('single');
  if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = 'Guardar unidad';
  toggleFleetForm(false);
  if (els.fleetEmpresa && !['supervisor','supervisor_flotas'].includes(state.user?.role)) els.fleetEmpresa.value = '';
}
function beginFleetEdit(unit) {
  state.editingFleetUnitId = unit.id;
  state.fleetEntryMode = 'single';
  setFleetEntryMode('single');
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
function parseFleetBatchUnits(text = '') {
  const units = [];
  const push = (value) => {
    const clean = String(value || '').trim().replace(/\s+/g, ' ');
    if (clean && !units.some(item => normalizeIdentityKey(item) === normalizeIdentityKey(clean))) units.push(clean);
  };
  String(text || '').split(/[\n,]+/).map(part => part.trim()).filter(Boolean).forEach(part => {
    const range = part.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ\s]*?)(\d+)\s*-\s*([A-Za-zÁÉÍÓÚÑáéíóúñ\s]*?)(\d+)$/);
    if (range) {
      const prefixA = String(range[1] || '').trimEnd();
      const prefixB = String(range[3] || '').trimEnd();
      if (normalizeText(prefixA) === normalizeText(prefixB)) {
        const start = Number(range[2]);
        const end = Number(range[4]);
        const width = Math.max(range[2].length, range[4].length);
        const step = start <= end ? 1 : -1;
        if (Math.abs(end - start) <= 500) {
          for (let n = start; step > 0 ? n <= end : n >= end; n += step) push(`${prefixA}${String(n).padStart(width, '0')}`);
          return;
        }
      }
    }
    push(part);
  });
  return units;
}
async function saveFleetBatch() {
  const empresa = String(document.getElementById('fleetBatchEmpresa')?.value || '').trim();
  const numeros = parseFleetBatchUnits(document.getElementById('fleetBatchNumeros')?.value || '');
  const summary = document.getElementById('fleetBatchSummary');
  if (!empresa) throw new Error('Captura la empresa para registrar el lote.');
  if (!numeros.length) throw new Error('Captura al menos un número económico para el lote.');
  const companyKey = normalizeIdentityKey(empresa);
  const duplicates = [];
  const toCreate = numeros.filter(num => {
    const exists = (state.fleetUnits || []).some(unit => normalizeIdentityKey(unit.numeroEconomico) === normalizeIdentityKey(num) && normalizeIdentityKey(unit.empresa) === companyKey);
    if (exists) duplicates.push(num);
    return !exists;
  });
  let created = 0;
  let failed = 0;
  for (const numeroEconomico of toCreate) {
    const payload = {
      empresa,
      nombreFlota: String(document.getElementById('fleetBatchNombreFlota')?.value || '').trim(),
      numeroEconomico,
      numeroObra: String(document.getElementById('fleetBatchNumeroObra')?.value || '').trim(),
      marca: String(document.getElementById('fleetBatchMarca')?.value || '').trim(),
      modelo: String(document.getElementById('fleetBatchModelo')?.value || '').trim(),
      anio: String(document.getElementById('fleetBatchAnio')?.value || '').trim(),
      kilometraje: String(document.getElementById('fleetBatchKilometraje')?.value || '').trim(),
      polizaActiva: !!document.getElementById('fleetBatchPolizaActiva')?.checked,
      campaignActiva: !!document.getElementById('fleetBatchCampaignActiva')?.checked,
    };
    try { await api.createFleetUnit(payload); created += 1; }
    catch (_error) { failed += 1; }
  }
  const msg = `Se crearon ${created} unidades. Se omitieron ${duplicates.length} duplicadas${failed ? ` y fallaron ${failed}` : ''}.`;
  if (summary) summary.textContent = msg;
  notify(msg, failed > 0);
  state.fleetDirty = false;
  if (created > 0) {
    resetFleetForm();
    await loadFleet();
  }
}

function resetFleetBulkDeletePreview(message = '') {
  state.fleetBulkDeletePreview = [];
  if (els.fleetBulkDeletePreview) els.fleetBulkDeletePreview.innerHTML = '';
  if (els.fleetBulkDeleteConfirmBtn) els.fleetBulkDeleteConfirmBtn.classList.add('hidden');
  if (els.fleetBulkDeleteSummary) els.fleetBulkDeleteSummary.textContent = message;
}

function previewFleetBulkDelete() {
  if (!isRole('admin')) return;
  const empresa = String(els.fleetBulkDeleteEmpresa?.value || '').trim();
  const numeros = parseFleetBatchUnits(els.fleetBulkDeleteNumeros?.value || '');
  if (!empresa) throw new Error('Captura la empresa para previsualizar la eliminación.');
  if (!numeros.length) throw new Error('Captura al menos un número económico para previsualizar.');
  const companyKey = normalizeIdentityKey(empresa);
  const requestedKeys = new Set(numeros.map(num => normalizeIdentityKey(num)));
  const matches = (state.fleetUnits || []).filter(unit =>
    normalizeIdentityKey(unit.empresa) === companyKey &&
    requestedKeys.has(normalizeIdentityKey(unit.numeroEconomico))
  );
  state.fleetBulkDeletePreview = matches;
  const missing = numeros.filter(num => !matches.some(unit => normalizeIdentityKey(unit.numeroEconomico) === normalizeIdentityKey(num)));
  if (els.fleetBulkDeletePreview) {
    els.fleetBulkDeletePreview.innerHTML = matches.length ? `
      <div class="table-list compact-list fleet-bulk-delete-table">
        ${matches.map(unit => `
          <div class="table-row rich-row">
            <div><strong>${escapeHtml(unit.empresa || '—')}</strong><div class="small muted">Empresa</div></div>
            <div><strong>${escapeHtml(unit.numeroEconomico || '—')}</strong><div class="small muted">Número económico</div></div>
            <div>${escapeHtml(unit.marca || '—')}</div>
            <div>${escapeHtml(unit.modelo || '—')}</div>
            <div>${escapeHtml(unit.nombreFlota || '—')}</div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-state"><strong>Sin unidades para eliminar.</strong><span>Verifica empresa y números económicos.</span></div>';
  }
  const msg = `Previsualización lista: ${matches.length} unidades encontradas. No encontradas ${missing.length}.`;
  if (els.fleetBulkDeleteSummary) els.fleetBulkDeleteSummary.textContent = msg;
  els.fleetBulkDeleteConfirmBtn?.classList.toggle('hidden', !matches.length);
}

async function confirmFleetBulkDelete() {
  if (!isRole('admin')) return;
  const preview = state.fleetBulkDeletePreview || [];
  if (!preview.length) throw new Error('Primero previsualiza las unidades que deseas eliminar.');
  const confirmation = window.prompt('Escribe ELIMINAR LOTE para confirmar la eliminación.');
  if (confirmation !== 'ELIMINAR LOTE') {
    notify('Confirmación cancelada. No se eliminó ninguna unidad.', true);
    return;
  }
  let deleted = 0;
  let failed = 0;
  for (const unit of preview) {
    try {
      await api.deleteFleetUnit(unit.id);
      deleted += 1;
    } catch (_error) {
      failed += 1;
    }
  }
  const msg = `Eliminadas ${deleted} unidades. Fallidas ${failed}.`;
  notify(msg, failed > 0);
  if (els.fleetBulkDeleteSummary) els.fleetBulkDeleteSummary.textContent = msg;
  resetFleetBulkDeletePreview(msg);
  if (deleted > 0) await loadFleet();
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
  [els.navBoardBtn,els.navNewReportBtn,els.navAnalyticsBtn,els.navHistoryBtn,els.navScheduleBtn,els.navFleetBtn,els.navPartsBtn,els.navStockBtn,els.navCobranzaBtn,els.navCampaignsBtn,els.navUsersBtn,els.navRequestsBtn,els.navCompaniesBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
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
  if (panel !== 'fleet') {
    document.body.classList.remove('fleet-detail-modal-open');
    document.getElementById('fleetDetailModalRoot')?.classList.add('hidden');
    if (state.fleetOwnerLiveTimer) {
      clearInterval(state.fleetOwnerLiveTimer);
      state.fleetOwnerLiveTimer = null;
    }
  }
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
  els.campaignsPanel?.classList.toggle('hidden', panel !== 'campaigns');
  els.servicesPanel?.classList.toggle('hidden', panel !== 'services');
  document.body.dataset.panel = panel;
  const board = panel === 'board';
  els.filtersPanel?.classList.toggle('hidden', !board);
  els.executiveDeck?.classList.toggle('hidden', !board);
  els.commandSidePanel?.classList.toggle('hidden', !board);
  if (panel === 'schedule') loadSchedules('');
  if (panel === 'fleet') loadFleet();
  if (panel === 'parts') loadPartsPending();
  if (panel === 'stock') loadStock();
  if (panel === 'cobranza') loadCobranza();
  if (panel === 'campaigns') loadCampaigns();
  if (panel === 'services') { configureServicesCompanyFilter(); loadServicesReport(); }
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
    panel === 'services' ? els.navServicesBtn :
    panel === 'parts' ? els.navPartsBtn :
    panel === 'stock' ? els.navStockBtn :
    panel === 'cobranza' ? els.navCobranzaBtn :
    panel === 'campaigns' ? els.navCampaignsBtn :
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
  els.navServicesBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas','operativo'));
  els.navPartsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas'));
  els.navStockBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navCobranzaBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navCampaignsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas','operativo'));
  document.querySelectorAll('[data-role-admin-only]').forEach(el => el.classList.toggle('hidden', !isRole('admin')));
  if (state.user?.role === 'supervisor') {
    els.navFleetBtn?.classList.add('hidden');
    els.navPartsBtn?.classList.add('hidden');
    els.navCobranzaBtn?.classList.add('hidden');
    els.navUsersBtn?.classList.add('hidden');
    els.navRequestsBtn?.classList.add('hidden');
    els.navCompaniesBtn?.classList.add('hidden');
    els.navCampaignsBtn?.classList.add('hidden');
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
  configureServicesCompanyFilter(); updateHeaderForRole(); switchPanel(state.user?.role === 'operador' ? 'report' : (state.user?.role === 'supervisor_flotas' ? 'fleet' : 'board'));
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
async function renderPdfEvidenceGallery(doc, images = [], startY = 18, title = 'Evidencias fotográficas') {
  if (!images.length) return startY;
  let y = ensurePdfSpace(doc, startY, 52);
  const drawHeading = (text) => {
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(String(text), 14, y);
    y += 8;
  };
  drawHeading(title);
  let x = 14;
  let rowHeight = 0;
  for (const src of images) {
    if (x > 136) {
      x = 14;
      y += rowHeight + 8;
      rowHeight = 0;
    }
    if (y + 48 > 275) {
      doc.addPage();
      y = 18;
      x = 14;
      rowHeight = 0;
      drawHeading('Evidencias fotográficas (continuación)');
    }
    doc.setDrawColor(255, 255, 255);
    doc.roundedRect(x, y, 56, 42, 3, 3, 'F');
    await addPdfImage(doc, src, x + 1, y + 1, 54, 40);
    x += 60;
    rowHeight = Math.max(rowHeight, 42);
  }
  return y + rowHeight + 8;
}
async function exportPdf(reportOrId) {
  const inputIsObject = reportOrId && typeof reportOrId === 'object';
  const garantiaId = String(inputIsObject ? (reportOrId.id || '') : (reportOrId || '')).trim();
  if (!garantiaId) {
    notify('No se pudo exportar: falta el ID del reporte.', true);
    return;
  }
  let safeItem = {};
  try {
    safeItem = await getGarantiaFull(garantiaId);
  } catch (error) {
    notify(error.message || 'No se pudo cargar el reporte completo para exportar.', true);
    return;
  }
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
  doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text(`Folio: ${safeItem.folio || '—'}`, 196, 20, { align: 'right' });
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 27, { align: 'right' });

  y = 50;
  doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, 44, 182, 38, 4, 4, 'F');
  doc.text(`Empresa: ${safeItem.empresa || '—'}`, 18, 54);
  doc.text(`Unidad: ${safeItem.numeroEconomico || '—'}`, 18, 62);
  doc.text(`Modelo: ${safeItem.modelo || '—'}`, 18, 70);
  doc.text(`Obra: ${safeItem.numeroObra || '—'}`, 105, 54);
  doc.text(`KM: ${safeItem.kilometraje || '—'}`, 105, 62);
  doc.text(`Estatus: ${safeItem.estatusValidacion || '—'} / ${safeItem.estatusOperativo || '—'}`, 105, 70);

  y = 92;
  doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, 86, 182, 24, 4, 4, 'F');
  doc.text(`Nombre: ${safeItem.contactoNombre || '—'}`, 18, 96);
  doc.text(`Teléfono: ${safeItem.telefono || '—'}`, 105, 96);
  doc.text(`Reportó: ${safeItem.reportadoPorNombre || '—'}`, 18, 104);
  doc.text(`Revisó: ${safeItem.revisadoPorNombre || '—'}`, 105, 104);

  y = 122;
  doc.setFontSize(12); doc.setTextColor(20, 20, 20); textLine('Descripción de la falla', 8);
  doc.setFontSize(10); doc.setTextColor(55,55,55);
  let split = doc.splitTextToSize(safeItem.descripcionFallo || '—', 178);
  doc.text(split, 14, y); y += split.length * 6 + 6;

  if (safeItem.detalleRefaccion) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Detalle de refacción', 8);
    doc.setFontSize(10); doc.setTextColor(55,55,55); split = doc.splitTextToSize(safeItem.detalleRefaccion, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }
  if (safeItem.observacionesOperativo) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Observaciones del operativo', 8);
    doc.setFontSize(10); doc.setTextColor(55,55,55); split = doc.splitTextToSize(safeItem.observacionesOperativo, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }

  const images = [ ...(safeItem.evidencias || []), ...(safeItem.evidenciasRefaccion || []) ];
  if (images.length) {
    y = await renderPdfEvidenceGallery(doc, images, y, 'Evidencias fotográficas');
  }
  if (safeItem.firma) {
    y = ensurePdfSpace(doc, y, 42); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Firma', 8);
    doc.setFillColor(255,255,255); doc.setDrawColor(255,255,255); doc.roundedRect(14, y, 90, 28, 3, 3, 'F'); await addPdfImage(doc, safeItem.firma, 16, y + 2, 86, 24); y += 34;
  }
  if (safeItem.estatusValidacion === 'rechazada' && safeItem.observacionesOperativo) {
    y = ensurePdfSpace(doc, y, 24); doc.setFontSize(12); doc.setTextColor(170, 35, 35); textLine('Motivo de rechazo', 8);
    doc.setFontSize(10); doc.setTextColor(80,80,80); split = doc.splitTextToSize(safeItem.observacionesOperativo, 178); doc.text(split, 14, y); y += split.length * 6 + 6;
  }

  y = ensurePdfSpace(doc, y, 30); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Actividades autorizadas', 8);
  doc.setFontSize(9); doc.setTextColor(55,55,55);
  if ((safeItem.authorizedActivities || []).length) {
    (safeItem.authorizedActivities || []).forEach((a, idx) => { y = ensurePdfSpace(doc, y, 18); const line = `${idx + 1}. ${a.description || '—'} | ${activityTypeLabel(a.type)} | ${a.responsible || 'Sin responsable'} | ${activityPriorityLabel(a.priority)} | ${activityStatusLabel(a.status)} | ${Number(a.estimatedHours || 0)} h${a.notes ? ' | ' + a.notes : ''}`; const lines = doc.splitTextToSize(line, 178); doc.text(lines, 14, y); y += lines.length * 5 + 2; });
  } else {
    doc.text('Sin actividades autorizadas registradas.', 14, y); y += 7;
  }

  doc.save(`${safeItem.folio || 'garantia'}_${safeItem.numeroEconomico || 'unidad'}_${safeItem.numeroObra || 'obra'}.pdf`);
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
  state.schedules = await api.request(`/api/schedules${state.user?.role === 'supervisor_flotas' ? '?futureOnly=1' : ''}`);
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
  const fotos = items.reduce((sum, item) => sum + Number(item.evidenciasCount || 0), 0) + extras.reduce((sum, item) => sum + (Array.isArray(item.evidence_photos) ? item.evidence_photos.length : 0), 0);

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
          ${(item.evidenciasPreview || []).length ? `<div class="media-gallery media-gallery-compact">${(item.evidenciasPreview || []).map((src, idx) => `<button class="media-thumb" type="button" onclick='openImageLightbox(${JSON.stringify(src)}, ${JSON.stringify(`Refacción ${idx + 1}`)})'><img src="${src}" alt="Refacción ${idx + 1}" /></button>`).join('')}</div>` : '<div class="muted">Sin fotos cargadas aún.</div>'}
          <div class="small muted">${Number(item.evidenciasCount || 0)} foto(s) registradas en total.</div>
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
          const existing = await api.getPartPendingDetail(item.id).catch(() => ({ evidenciasRefaccion: photos }));
          const currentPhotos = Array.isArray(existing.evidenciasRefaccion) ? existing.evidenciasRefaccion : photos;
          await api.updateParts(item.id, {
            detalleRefaccion: document.getElementById(`partsDetail_${item.id}`)?.value || '',
            refaccionAsignada: document.getElementById(`partsAssigned_${item.id}`)?.value || '',
            refaccionStatus: document.getElementById(`partsStatus_${item.id}`)?.value || 'pendiente',
            evidenciasRefaccion: [...currentPhotos, ...incoming]
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
    let report = null;
    if (quote.garantiaId) {
      try {
        report = await getGarantiaFull(quote.garantiaId);
      } catch (_error) {
        report = state.garantias.find(item => item.id === quote.garantiaId) || null;
      }
    }
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
      y = await renderPdfEvidenceGallery(doc, images, y, 'Evidencias fotográficas');
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
    document.getElementById('fleetBatchSaveBtn')?.classList.toggle('hidden', !canManageFleet);
    document.querySelectorAll('#fleetPanel .fleet-manage-only').forEach(el => el.classList.toggle('hidden', !canManageFleet));
    document.querySelectorAll('#fleetPanel .fleet-admin-only').forEach(el => el.classList.toggle('hidden', !isRole('admin')));
    document.querySelectorAll('#fleetPanel .fleet-admin-only').forEach(el => el.setAttribute('aria-hidden', String(!isRole('admin'))));
    if (!canManageFleet) toggleFleetForm(false);
    if (['supervisor','supervisor_flotas'].includes(state.user?.role) && els.fleetEmpresa) {
      els.fleetEmpresa.value = state.user.empresa || '';
      els.fleetEmpresa.disabled = true;
    } else if (els.fleetEmpresa) {
      els.fleetEmpresa.disabled = false;
    }
    const previousUnits = Array.isArray(state.fleetUnits) ? state.fleetUnits : [];
    const previousSelected = state.selectedFleetUnit;
    const [summaryRes, unitsRes, analyticsRes] = await Promise.allSettled([api.getFleetSummary(), api.getFleetUnits(), api.getFleetAnalytics()]);
    if (summaryRes.status === 'fulfilled') state.fleetSummary = summaryRes.value || state.fleetSummary;
    let preservingFleet = false;
    if (unitsRes.status === 'fulfilled') {
      const nextUnits = Array.isArray(unitsRes.value) ? unitsRes.value : [];
      if (nextUnits.length || !previousUnits.length) {
        state.fleetUnits = nextUnits;
      } else {
        preservingFleet = true;
        state.fleetUnits = previousUnits;
      }
    } else {
      preservingFleet = true;
      state.fleetUnits = previousUnits;
    }
    if (analyticsRes.status === 'fulfilled') state.fleetAnalytics = analyticsRes.value || state.fleetAnalytics;
    if (preservingFleet && previousUnits.length) notify('Conservando última flota cargada. Reintentando conexión.');
    if (unitsRes.status !== 'fulfilled' && !previousUnits.length) throw unitsRes.reason || new Error('No se pudieron cargar unidades de flota.');
    if (state.selectedFleetUnit?.unit?.id) {
      const still = state.fleetUnits.find(u => u.id === state.selectedFleetUnit.unit.id);
      if (still) {
        try {
          const base = await api.getFleetUnit(still.id);
          state.selectedFleetUnit = {
            ...(base || {}),
            reports: previousSelected?.reports || [],
            costs: previousSelected?.costs || [],
            campaigns: previousSelected?.campaigns || [],
            schedules: previousSelected?.schedules || [],
            parts: previousSelected?.parts || [],
            loading: { reports:true, costs:true, campaigns:true, schedules:true, parts:true }
          };
          startFleetUnitProgressiveLoad(still.id);
        } catch {
          state.selectedFleetUnit = previousSelected;
          notify('Conservando última ficha de unidad. Reintentando conexión.');
        }
      }
    }
    renderFleet();
  } catch (error) {
    notify(error.message, true);
  }
}

async function loadFleetUnitReports(unitId) {
  try {
    const rows = await api.getFleetUnitReports(unitId);
    if (state.selectedFleetUnit?.unit?.id !== unitId) return;
    state.selectedFleetUnit.reports = rows || [];
  } catch {
    // Conserva reportes previos ante fallas temporales de red/DB.
  } finally {
    if (state.selectedFleetUnit?.unit?.id === unitId) state.selectedFleetUnit.loading.reports = false;
    renderFleetDetail();
  }
}
async function loadFleetUnitCampaigns(unitId) {
  try {
    const rows = await api.getFleetUnitCampaigns(unitId);
    if (state.selectedFleetUnit?.unit?.id !== unitId) return;
    state.selectedFleetUnit.campaigns = rows || [];
  } catch {
    // Conserva campañas previas ante fallas temporales de red/DB.
  } finally {
    if (state.selectedFleetUnit?.unit?.id === unitId) state.selectedFleetUnit.loading.campaigns = false;
    renderFleetDetail();
  }
}
async function loadFleetUnitSchedules(unitId) {
  try {
    const rows = await api.getFleetUnitSchedules(unitId);
    if (state.selectedFleetUnit?.unit?.id !== unitId) return;
    state.selectedFleetUnit.schedules = rows || [];
  } catch {
    // Conserva agenda previa ante fallas temporales de red/DB.
  } finally {
    if (state.selectedFleetUnit?.unit?.id === unitId) state.selectedFleetUnit.loading.schedules = false;
    renderFleetDetail();
  }
}
async function loadFleetUnitParts(unitId) {
  try {
    const rows = await api.getFleetUnitParts(unitId);
    if (state.selectedFleetUnit?.unit?.id !== unitId) return;
    state.selectedFleetUnit.parts = rows || [];
  } catch {
    // Conserva refacciones previas ante fallas temporales de red/DB.
  } finally {
    if (state.selectedFleetUnit?.unit?.id === unitId) state.selectedFleetUnit.loading.parts = false;
    renderFleetDetail();
  }
}
async function loadFleetUnitCosts(unitId) {
  try {
    const rows = isRole('admin') ? await api.getFleetCosts(unitId) : (state.selectedFleetUnit?.costs || []);
    if (state.selectedFleetUnit?.unit?.id !== unitId) return;
    state.selectedFleetUnit.costs = (rows || []).map(c => ({ ...c, fleetUnitId: c.fleetUnitId || c.fleet_unit_id, createdByNombre: c.createdByNombre || c.created_by_nombre || '' }));
  } catch {
    // Conserva costos previos ante fallas temporales de red/DB.
  } finally {
    if (state.selectedFleetUnit?.unit?.id === unitId) state.selectedFleetUnit.loading.costs = false;
    renderFleetDetail();
  }
}
function startFleetUnitProgressiveLoad(unitId) {
  loadFleetUnitReports(unitId);
  loadFleetUnitCampaigns(unitId);
  loadFleetUnitSchedules(unitId);
  loadFleetUnitParts(unitId);
  loadFleetUnitCosts(unitId);
}

function renderFleet() {
  if (els.fleetUnitsList) els.fleetUnitsList.innerHTML = '';
  const fleetQuery = normalizeText(els.fleetSearchInput?.value || '');
  const fleetStatus = els.fleetStatusFilter?.value || 'todos';
  const priorityRank = (unit) => {
    const sem = fleetSemaforo(unit).key;
    if (sem === 'critical') return 3;
    if (sem === 'warning') return 2;
    if (sem === 'campania') return 1;
    return 0;
  };
  const visibleUnits = state.fleetUnits.filter(unit => {
    const sem = fleetSemaforo(unit);
    const hayTexto = !fleetQuery || normalizeText([unit.numeroEconomico, unit.empresa, unit.marca, unit.modelo, unit.numeroObra, unit.nombreFlota].join(' ')).includes(fleetQuery);
    const hayEstado = fleetStatus === 'todos' || sem.key === fleetStatus || (fleetStatus === 'ok' && sem.key === 'campania') || (fleetStatus === 'poliza' && !!unit.polizaActiva);
    return hayTexto && hayEstado;
  }).sort((a, b) => {
    const p = priorityRank(b) - priorityRank(a);
    if (p !== 0) return p;
    return Number(b.costoTotal || 0) - Number(a.costoTotal || 0);
  });

  renderFleetOwnerDeck();

  if (!visibleUnits.length && els.fleetUnitsList) {
    els.fleetUnitsList.innerHTML = '<div class="empty-state"><strong>Sin coincidencias.</strong><span>Ajusta búsqueda o estado para encontrar la unidad correcta.</span></div>';
  }

  visibleUnits.forEach(unit => {
    const normalized = normalizeFleetStatus(unit);
    const status = { visual: normalized.visual };
    const movementText = formatLastMovement(unit.lastMovementAt || unit.lastReportAt || unit.lastOpenReportAt || unit.lastRefaccionAt);
    const selected = state.selectedFleetUnit?.unit?.id === unit.id;
    const row = document.createElement('article');
    row.className = `fleet-line-item fleet-unit-card ${selected ? 'selected' : ''}`;
    row.innerHTML = `
      <div class="cardUnidad ${status.visual}">
        <div class="fleet-unit-top">
          <span class="status-badge ${normalized.color}">${escapeHtml(normalized.priority)}</span>
          <span class="fleet-unit-policy">${unit.polizaActiva ? 'Póliza' : ''}${unit.campaignActiva ? (unit.polizaActiva ? ' · Campaña' : 'Campaña') : ''}</span>
        </div>
        <div class="fleet-unit-number">${escapeHtml(unit.numeroEconomico || '—')}</div>
        <div class="fleet-unit-meta">${escapeHtml(unit.empresa || '—')} · ${escapeHtml(unit.modelo || 'Sin modelo')} · ${escapeHtml(unit.marca || 'Sin marca')}</div>
        <div class="fleet-bus-wrap busHeroRow">
          <div class="busHeroVisual">
            <div class="busHeroSilhouette" style="--bus-mask:url('${fleetBusAsset(unit)}')" aria-hidden="true"></div>
            <div class="busHeroGlow"></div>
          </div>
        </div>
        <div class="fleet-unit-stats">
          <div><span class="fleet-stat-label">Reportes</span><strong class="fleet-stat-value">${Number(unit.openReportsCount || unit.reportesCount || 0)}</strong></div>
          <div><span class="fleet-stat-label">Costo acumulado</span><strong class="fleet-stat-value">${money(unit.costoTotal || 0)}</strong></div>
        </div>
        <div class="fleet-card-footer">
          <span class="status-badge ${normalized.color}">${normalized.dot} ${escapeHtml(normalized.label)}</span>
          <span class="last-movement">${escapeHtml(movementText)}</span>
        </div>
      </div>
    `;
    row.addEventListener('click', async () => {
      try {
        if (state.selectedFleetUnit?.unit?.id === unit.id) {
          state.selectedFleetUnit = null;
          document.body.classList.remove('fleet-detail-modal-open');
          renderFleet();
          renderFleetDetail();
          return;
        }
        await openFleetUnitDetail(unit.id);
      } catch (error) { notify(error.message, true); }
    });
    els.fleetUnitsList?.appendChild(row);
  });
  mountFleetOwnerLiveTimer();
  renderFleetDetail();
}


function ensureFleetDetailModalRoot() {
  let root = document.getElementById('fleetDetailModalRoot');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'fleetDetailModalRoot';
  root.className = 'fleet-detail-modal-root hidden';
  root.innerHTML = `
    <div class="fleet-detail-modal-overlay" data-close="1"></div>
    <div class="fleet-detail-modal-shell" role="dialog" aria-modal="true" aria-label="Detalle de unidad">
      <div class="fleet-detail-modal-content" id="fleetDetailModalContent"></div>
    </div>`;
  root.addEventListener('click', (e) => {
    if (e.target?.dataset?.close === '1') closeFleetDetailModal();
  });
  document.body.appendChild(root);
  return root;
}

function closeFleetDetailModal() {
  state.selectedFleetUnit = null;
  document.body.classList.remove('fleet-detail-modal-open');
  const root = document.getElementById('fleetDetailModalRoot');
  root?.classList.add('hidden');
  const content = document.getElementById('fleetDetailModalContent');
  if (content) content.innerHTML = '';
  renderFleet();
  renderFleetDetail();
}

function collectFleetUnitEvidence(data = {}) {
  const reports = Array.isArray(data.reports) ? data.reports : [];
  const parts = Array.isArray(data.parts) ? data.parts : [];
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const asArray = (value) => Array.isArray(value) ? value : [];
  const merged = [
    ...reports.flatMap((r) => [...asArray(r.evidencias), ...asArray(r.evidenciasRefaccion)]),
    ...parts.flatMap((p) => asArray(p.evidenciasRefaccion)),
    ...campaigns.flatMap((c) => asArray(c.evidencia)),
  ].map((src) => String(src || '').trim()).filter(Boolean);
  return [...new Set(merged)];
}

function renderFleetDetail() {
  if (!els.fleetDetail) return;
  const modalRoot = ensureFleetDetailModalRoot();
  const modalContent = document.getElementById('fleetDetailModalContent');
  const data = state.selectedFleetUnit;
  if (!data?.unit) {
    document.body.classList.remove('fleet-detail-modal-open');
    modalRoot?.classList.add('hidden');
    if (modalContent) modalContent.innerHTML = '';
    els.fleetDetail.innerHTML = '<div class="muted">Selecciona una unidad para ver historial, reportes, agenda, refacciones y costos.</div>';
    return;
  }
  document.body.classList.add('fleet-detail-modal-open');
  modalRoot?.classList.remove('hidden');
  const u = data.unit;
  const sem = fleetSemaforo(u);
  const reportsArr = data.reports || [];
  const costsArr = data.costs || [];
  const unitSchedules = (data.schedules || []).slice(0, 8);
  const unitParts = data.parts || [];
  const campaignArr = data.campaigns || [];
  const loading = data.loading || {};
  const allImages = collectFleetUnitEvidence({ reports: reportsArr, parts: unitParts, campaigns: campaignArr });
  const reports = loading.reports ? '<div class="muted">Cargando reportes recientes…</div>' : reportsArr.map(r => `
    <div class="table-row rich-row">
      <div>
        <strong>${escapeHtml(r.folio || 'GAR-—')}</strong>
        <div class="small muted">${escapeHtml(r.descripcionFallo || 'Sin descripción')}</div>
        <div class="small muted">${escapeHtml(fmtDate(r.createdAt || r.updatedAt))}</div>
      </div>
      <div><span class="badge ${badgeClassValidation(r.estatusValidacion || 'nueva')}">${escapeHtml(r.estatusValidacion || '—')}</span></div>
      <div><span class="badge ${badgeClassOperational(r.estatusOperativo || 'sin iniciar')}">${escapeHtml(r.estatusOperativo || '—')}</span></div>
    </div>
  `).join('') || '<div class="muted">Sin reportes ligados.</div>';
  const costs = loading.costs ? '<div class="muted">Cargando costos…</div>' : costsArr.map(c => `
    <div class="table-row rich-row">
      <div><strong>${escapeHtml(c.tipo)}</strong><div class="small muted">${escapeHtml(c.concepto || 'Sin concepto')}</div></div>
      <div>${money(c.monto)}</div>
      <div>${escapeHtml(c.createdByNombre || '—')}</div>
    </div>
  `).join('') || '<div class="muted">Sin costos capturados.</div>';
  const parts = loading.parts ? '<div class="muted">Cargando refacciones…</div>' : unitParts.map(item => `
    <div class="owner-list-row static parts-inline-row">
      <span>${escapeHtml(item.detalleRefaccion || 'Refacción pendiente')}</span>
      <small>${escapeHtml(item.refaccionAsignada || 'Sin asignar')}</small>
      <strong>${escapeHtml(item.refaccionStatus || 'pendiente')}</strong>
    </div>
    ${buildImageGallery(item.evidenciasRefaccion || [], 'Sin foto cargada todavía.')}
  `).join('') || '<div class="muted">Esta unidad no tiene refacciones pendientes abiertas.</div>';
  const agenda = loading.schedules ? '<div class="muted">Cargando agenda…</div>' : unitSchedules.map(item => `<div class="owner-list-row static"><span>${escapeHtml(item.status || 'programada')}</span><small>${escapeHtml(item.originalText || '')}</small><strong>${escapeHtml(fmtDate(item.scheduledFor || item.proposedAt || item.requestedAt))}</strong></div>`).join('') || '<div class="muted">Sin agenda próxima para esta unidad.</div>';
  const campaigns = loading.campaigns ? '<div class="muted">Cargando campañas…</div>' : campaignArr.map(c => `<div class="owner-list-row static"><span>${escapeHtml(c.nombre || 'Campaña')}</span><small>${escapeHtml((c.status || 'sin_programar').replaceAll('_',' '))}</small><strong>${escapeHtml(fmtDate(c.updatedAt))}</strong></div>`).join('') || '<div class="muted">Sin campañas ligadas.</div>';
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
  const detailLoading = '';
  const detailHtml = `
    <div class="panel-head fleet-detail-head">
      <div><div class="topbar-kicker">EXPEDIENTE DE UNIDAD</div><h3>${escapeHtml(u.numeroEconomico)} · ${escapeHtml(u.empresa)}</h3><p class="muted">Vista premium para dueño: patrimonio, agenda, refacciones y evidencia visual en una sola ficha.</p></div>
      <div class="stack-inline">${isRole('admin') ? '<button id="fleetEditInlineBtn" class="btn btn-ghost" type="button">Editar</button><button id="fleetDeleteInlineBtn" class="btn btn-ghost" type="button">Eliminar</button>' : ''}<button id="fleetCloseDetailBtn" class="btn btn-ghost" type="button">Cerrar</button><span class="fleet-dot ${sem.cls}">${sem.label}</span></div>
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
      <aside class="fleet-timeline-box"><div class="topbar-kicker">MOVIMIENTO RECIENTE</div><div class="detail-scroll-box">${timeline}</div></aside>
    </div>
    ${detailLoading}
    <div class="fleet-owner-insights detail-grid">
      <article class="owner-card"><div class="owner-card-head"><strong>Refacciones abiertas</strong><span class="badge badge-info">Con evidencia</span></div><div class="owner-list detail-scroll-box">${parts}</div></article>
      <article class="owner-card"><div class="owner-card-head"><strong>Agenda de la unidad</strong><span class="badge badge-info">Próximas entradas</span></div><div class="owner-list detail-scroll-box">${agenda}</div></article>
      <article class="owner-card"><div class="owner-card-head"><strong>Campañas</strong><span class="badge badge-info">Seguimiento</span></div><div class="owner-list detail-scroll-box">${campaigns}</div></article>
    </div>
    <div class="owner-card owner-gallery-card"><div class="owner-card-head"><strong>Galería de evidencia</strong><span class="badge badge-info">Fotos ampliables</span></div>${buildImageGallery(allImages, 'No hay evidencia cargada todavía para esta unidad.')}</div>
    <div class="fleet-columns">
      <section><div class="topbar-kicker">REPORTES</div><div class="table-list compact-list detail-scroll-box">${reports}</div></section>
      <section><div class="topbar-kicker">COSTOS</div><div class="table-list compact-list detail-scroll-box">${costs}</div>${adminCostsEditor}</section>
    </div>
  `;
  if (modalContent) modalContent.innerHTML = detailHtml;
  els.fleetDetail.innerHTML = '<div class="muted">Detalle abierto en ventana flotante premium.</div>';
  document.getElementById('fleetCloseDetailBtn')?.addEventListener('click', () => {
    closeFleetDetailModal();
  });
  if (isRole('admin')) {
    document.getElementById('fleetManualStatus').value = ({ operando:'operando', 'en_taller':'en_taller', detenida:'detenida', programada:'programada' })[sem.key || 'operando'] || 'operando';
    document.getElementById('fleetApplyStatusBtn')?.addEventListener('click', async () => {
      try {
        await api.updateFleetStatus(u.id, { status: document.getElementById('fleetManualStatus').value });
        const base = await api.getFleetUnit(u.id);
        state.selectedFleetUnit = { ...(base || {}), reports: [], costs: [], campaigns: [], schedules: [], parts: [], loading: { reports:true, costs:true, campaigns:true, schedules:true, parts:true } };
        startFleetUnitProgressiveLoad(u.id);
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
        const base = await api.getFleetUnit(u.id);
        state.selectedFleetUnit = { ...(base || {}), reports: [], costs: [], campaigns: [], schedules: [], parts: [], loading: { reports:true, costs:true, campaigns:true, schedules:true, parts:true } };
        startFleetUnitProgressiveLoad(u.id);
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



function campaignStatusLabel(status='sin_programar') { return ({ sin_programar:'Sin programar', programada:'Programada', realizada:'Realizada' })[status] || status; }
function campaignStatusClass(status='sin_programar') { return status === 'realizada' ? 'green' : status === 'programada' ? 'amber' : status === 'campania_activa' ? 'blue' : 'red'; }
function campaignBusColor(status='sin_programar') { return status === 'realizada' ? '#22c55e' : status === 'programada' ? '#f59e0b' : status === 'campania_activa' ? '#2563eb' : '#ef4444'; }
function campaignBusMarkup(unit={}) { const c = campaignBusColor(unit.status || 'sin_programar'); const asset = fleetBusAsset(unit); return `<div class="campaignBusVisual"><div class="busHeroSilhouette campaignBusSilhouette" style="--bus-mask:url('${asset}');--campaign-bus-color:${c}" aria-hidden="true"></div><div class="busHeroGlow campaignBusGlow"></div></div>`; }

function renderCampaignEvidencePreview() {
  if (!els.campaignEvidencePreview) return;
  els.campaignEvidencePreview.innerHTML = (state.campaignUnitEvidence || []).map(img => `<figure class="evidence-thumb"><img src="${img}" /><button type="button" class="btn btn-ghost" data-campaign-evidence-remove="${img}">Quitar</button></figure>`).join('');
  els.campaignEvidencePreview.querySelectorAll('[data-campaign-evidence-remove]').forEach(btn => btn.addEventListener('click', () => {
    state.campaignUnitEvidence = state.campaignUnitEvidence.filter(v => v !== btn.dataset.campaignEvidenceRemove);
    renderCampaignEvidencePreview();
  }));
}
function resetCampaignForm() { if (els.campaignGroupId) els.campaignGroupId.value=''; if (els.campaignName) els.campaignName.value=''; if (els.campaignNotes) els.campaignNotes.value=''; if (els.campaignSaveBtn) els.campaignSaveBtn.textContent='Guardar campaña'; }
function resetCampaignUnitForm() { if (els.campaignUnitId) els.campaignUnitId.value=''; if (els.campaignUnitStatus) els.campaignUnitStatus.value='sin_programar'; if (els.campaignUnitNotes) els.campaignUnitNotes.value=''; if (els.campaignUnitEvidence) els.campaignUnitEvidence.value=''; state.campaignUnitEvidence=[]; renderCampaignEvidencePreview(); }
function refreshCampaignUnitOptions() {
  const company = els.campaignUnitEmpresa?.value || els.campaignEmpresa?.value || state.selectedCampaign?.group?.empresa || '';
  if (els.campaignUnitEmpresa && company) els.campaignUnitEmpresa.value = company;
  const units = state.fleetUnits.filter(u => normalizeText(u.empresa) === normalizeText(company));
  if (els.campaignUnitNumero) els.campaignUnitNumero.innerHTML = units.map(u => `<option value="${escapeHtml(u.numeroEconomico)}">${escapeHtml(u.numeroEconomico)} · ${escapeHtml(u.marca || '')} ${escapeHtml(u.modelo || '')}</option>`).join('');
}
async function loadCampaigns(openId='') {
  try {
    state.campaigns = await api.getCampaigns();
    if (!state.fleetUnits.length && isRole('admin','operativo','supervisor_flotas')) {
      try { state.fleetUnits = await api.getFleetUnits(); } catch {}
    }
    renderCampaigns();
    const target = openId || state.selectedCampaignId || state.campaigns[0]?.id;
    if (target) await openCampaign(target);
  } catch (error) {
    state.campaigns = [];
    state.selectedCampaign = null;
    state.selectedCampaignId = '';
    renderCampaigns();
    if (els.campaignDetail) els.campaignDetail.classList.add('hidden');
    notify('Campañas temporalmente no disponibles.', true);
  }
}
function renderCampaigns() {
  if (els.campaignSummary) {
    const total = state.campaigns.length;
    const sin = state.campaigns.reduce((s,c)=>s+Number(c.sinProgramar||0),0);
    const prog = state.campaigns.reduce((s,c)=>s+Number(c.programadas||0),0);
    const real = state.campaigns.reduce((s,c)=>s+Number(c.realizadas||0),0);
    els.campaignSummary.innerHTML = `<article class="campaign-mini-stat"><span>Campañas</span><strong>${total}</strong></article><article class="campaign-mini-stat"><span>Sin programar</span><strong>${sin}</strong></article><article class="campaign-mini-stat"><span>Programadas</span><strong>${prog}</strong></article><article class="campaign-mini-stat"><span>Realizadas</span><strong>${real}</strong></article>`;
  }
  if (els.campaignGroupsList) {
    els.campaignGroupsList.innerHTML = state.campaigns.map(c => `<article class="campaign-group-card ${state.selectedCampaignId===c.id?'active':''}" data-campaign-open="${c.id}"><div class="topbar-kicker">${escapeHtml(c.empresa || '')}</div><h4>${escapeHtml(c.nombre || '')}</h4><div class="campaign-meta-strip"><div><span>Unidades</span><strong>${Number(c.unidades||0)}</strong></div><div><span>R/O/V</span><strong>${Number(c.sinProgramar||0)} · ${Number(c.programadas||0)} · ${Number(c.realizadas||0)}</strong></div></div></article>`).join('') || '<div class="muted">Sin campañas registradas.</div>';
    els.campaignGroupsList.querySelectorAll('[data-campaign-open]').forEach(btn => btn.addEventListener('click', async ()=>{ await openCampaign(btn.dataset.campaignOpen); }));
  }
  if (els.campaignEmpresa) els.campaignEmpresa.innerHTML = (state.companies || []).map(c => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`).join('');
  if (els.campaignUnitEmpresa) els.campaignUnitEmpresa.innerHTML = (state.companies || []).map(c => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`).join('');
  refreshCampaignUnitOptions();
}
async function openCampaign(id) {
  if (!id) return;
  try {
    state.selectedCampaignId = id;
    state.selectedCampaign = await api.getCampaignUnits(id);
    renderCampaigns();
    renderCampaignDetail();
  } catch (error) { notify(error.message, true); }
}
function renderCampaignDetail() {
  if (!els.campaignDetail) return;
  const data = state.selectedCampaign;
  if (!data?.group) { els.campaignDetail.classList.add('hidden'); return; }
  els.campaignDetail.classList.remove('hidden');
  els.campaignDetail.classList.toggle('campaign-detail-supervisor', isRole('supervisor_flotas'));
  if (els.campaignDetailTitle) els.campaignDetailTitle.textContent = `${data.group.nombre} · ${data.group.empresa}`;
  if (els.campaignDetailBadge) els.campaignDetailBadge.textContent = `${(data.units||[]).length} unidades`;
  if (els.campaignUnitEmpresa) els.campaignUnitEmpresa.value = data.group.empresa || '';
  refreshCampaignUnitOptions();
  const units = data.units || [];
  if (els.campaignUnitsGrid) {
    const adminControls = isRole('admin') ? `<div class="stack-inline campaign-admin-actions"><button class="btn btn-secondary" type="button" data-campaign-group-edit="${data.group.id}">Editar campaña</button><button class="btn btn-ghost" type="button" data-campaign-group-delete="${data.group.id}">Eliminar campaña</button></div>` : '';
    const gridClass = `campaign-card-grid campaign-card-grid-scroll${isRole('supervisor_flotas') ? ' campaign-card-grid-full' : ''}`;
    els.campaignUnitsGrid.innerHTML = `${adminControls}<div class="${gridClass}">${units.map(u => `<article class="fleet-lux-card campaign-unit-card"><div class="fleet-lux-head"><div><div class="fleet-lux-number">${escapeHtml(u.numeroEconomico)}</div><div class="fleet-lux-sub">${escapeHtml(data.group.empresa)} · ${escapeHtml(u.modelo || '')} · ${escapeHtml(u.marca || '')}</div></div><div class="stack-inline"><span class="chip ${u.polizaActiva ? 'good' : 'neutral'}">${u.polizaActiva ? 'Póliza activa' : 'Sin póliza'}</span><span class="chip good">${escapeHtml(data.group.nombre || 'Campaña')}</span></div></div><div class="busHeroRow"><div class="busHeroVisual campaignBusHeroVisual ${u.status === 'campania_activa' || u.campaignActiva ? 'blue' : campaignStatusClass(u.status)}">${campaignBusMarkup({ ...u, status: (u.status === 'realizada' || u.status === 'programada' || u.status === 'sin_programar') ? u.status : ((u.campaignActiva || u.status === 'campania_activa') ? 'campania_activa' : 'sin_programar') })}<div class="busHeroStatus">${u.campaignActiva || u.status === 'campania_activa' ? 'Campaña activa' : campaignStatusLabel(u.status)}</div></div><div class="busHeroMeta"><div class="mini-grid"><div><span class="label">Obra</span><strong>${escapeHtml(u.numeroObra || '—')}</strong></div><div><span class="label">Reportes</span><strong>${Number(u.reportesCount||0)}</strong></div><div><span class="label">Último movimiento</span><strong>${escapeHtml(u.lastReportAt ? fmtDate(u.lastReportAt) : 'Sin movimiento')}</strong></div><div><span class="label">Campaña</span><strong>${escapeHtml(data.group.nombre || '—')}</strong></div></div>${u.notas ? `<div class="owner-list-row static"><span>Notas</span><small>${escapeHtml(u.notas)}</small></div>` : '<div class="muted">Sin notas</div>'}${(u.evidencia||[]).length ? `<div class="detail-scroll-box">${buildImageGallery(u.evidencia, '')}</div>` : '<div class="muted">Sin evidencia cargada.</div>'}</div></div><div class="stack-inline">${isRole('admin') ? `<button class="btn btn-secondary" type="button" data-campaign-edit="${u.id}">Editar</button><button class="btn btn-ghost" type="button" data-campaign-delete="${u.id}">Eliminar</button>` : ''}${u.fleetUnitId ? `<button class="btn btn-ghost" type="button" data-campaign-fleet="${u.fleetUnitId}">Ver unidad</button>` : ''}</div></article>`).join('')}</div>`;
    els.campaignUnitsGrid.querySelectorAll('[data-campaign-group-edit]').forEach(btn => btn.addEventListener('click', ()=>{ if (els.campaignGroupId) els.campaignGroupId.value = data.group.id; if (els.campaignName) els.campaignName.value = data.group.nombre || ''; if (els.campaignEmpresa) els.campaignEmpresa.value = data.group.empresa || ''; if (els.campaignNotes) els.campaignNotes.value = data.group.notas || ''; if (els.campaignSaveBtn) els.campaignSaveBtn.textContent = 'Actualizar campaña'; window.scrollTo({top:0,behavior:'smooth'}); }));
    els.campaignUnitsGrid.querySelectorAll('[data-campaign-group-delete]').forEach(btn => btn.addEventListener('click', async ()=>{ if (!confirm('¿Eliminar campaña completa?')) return; try { await api.deleteCampaign(btn.dataset.campaignGroupDelete); notify('Campaña eliminada.'); resetCampaignForm(); resetCampaignUnitForm(); state.selectedCampaignId=''; state.selectedCampaignData=null; await loadCampaigns(); await loadFleet(); } catch (error) { notify(error.message, true); } }));
    els.campaignUnitsGrid.querySelectorAll('[data-campaign-fleet]').forEach(btn => btn.addEventListener('click', async ()=>{ await focusFleetUnit(btn.dataset.campaignFleet); switchPanel('fleet'); }));
    els.campaignUnitsGrid.querySelectorAll('[data-campaign-edit]').forEach(btn => btn.addEventListener('click', ()=>{ const item = units.find(x=>x.id===btn.dataset.campaignEdit); if (!item) return; if (els.campaignUnitId) els.campaignUnitId.value=item.id; if (els.campaignUnitEmpresa) els.campaignUnitEmpresa.value=item.empresa; refreshCampaignUnitOptions(); if (els.campaignUnitNumero) els.campaignUnitNumero.value=item.numeroEconomico; if (els.campaignUnitStatus) els.campaignUnitStatus.value=item.status; if (els.campaignUnitNotes) els.campaignUnitNotes.value=item.notas||''; state.campaignUnitEvidence=[...(item.evidencia||[])]; renderCampaignEvidencePreview(); window.scrollTo({top:0,behavior:'smooth'}); }));
    els.campaignUnitsGrid.querySelectorAll('[data-campaign-delete]').forEach(btn => btn.addEventListener('click', async ()=>{ if (!confirm('¿Eliminar unidad de la campaña?')) return; try { await api.deleteCampaignUnit(btn.dataset.campaignDelete); notify('Unidad eliminada de campaña.'); await openCampaign(state.selectedCampaignId); await loadFleet(); } catch (error) { notify(error.message, true); } }));
  }
}
async function editarReporteAdmin(item) {
  try {
    const full = await getGarantiaFull(item.id);
    resetReportForm();
    state.editingGarantiaId = full.id;
    state.editingFirmaOriginal = full.firma || '';
    if (els.numeroObra) els.numeroObra.value = full.numeroObra || '';
    if (els.modelo) els.modelo.value = full.modelo || '';
    if (els.numeroEconomico) els.numeroEconomico.value = full.numeroEconomico || '';
    if (els.empresa) els.empresa.value = full.empresa || '';
    if (els.kilometraje) els.kilometraje.value = full.kilometraje || '';
    if (els.contactoNombre) els.contactoNombre.value = full.contactoNombre || '';
    if (els.telefono) els.telefono.value = full.telefono || '';
    const radio = document.querySelector(`input[name="tipoIncidente"][value="${full.tipoIncidente || 'daño'}"]`);
    if (radio) radio.checked = true;
    if (els.descripcionFallo) els.descripcionFallo.value = full.descripcionFallo || '';
    if (els.solicitaRefaccion) els.solicitaRefaccion.checked = !!full.solicitaRefaccion;
    els.refaccionFields?.classList.toggle('hidden', !els.solicitaRefaccion?.checked);
    if (els.detalleRefaccion) els.detalleRefaccion.value = full.detalleRefaccion || '';
    state.currentEvidence = Array.isArray(full.evidencias) ? [...full.evidencias] : [];
    state.currentRefEvidence = Array.isArray(full.evidenciasRefaccion) ? [...full.evidenciasRefaccion] : [];
    drawPreviews(els.previewEvidencias, state.currentEvidence, 'evidence');
    drawPreviews(els.previewRefaccion, state.currentRefEvidence, 'ref');
    if (full.firma) loadSignatureFromDataUrl(full.firma);
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
  const sinIniciar = items.filter(i => i.estatusOperativo === 'sin iniciar').length;
  const empresas = new Set(items.map(i => i.empresa).filter(Boolean)).size;
  const unidades = new Set(items.map(i => i.numeroEconomico).filter(Boolean)).size;
  const reincidentesMap = new Map();
  items.forEach(i => {
    const key = String(i.numeroEconomico || '').trim();
    if (!key) return;
    reincidentesMap.set(key, (reincidentesMap.get(key) || 0) + 1);
  });
  const reincidentes = [...reincidentesMap.values()].filter(v => v > 1).length;
  return { total, nuevas, revision, aceptadas, rechazadas, proceso, espera, terminadas, sinIniciar, empresas, unidades, reincidentes };
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return `Hace ${Math.floor(hrs / 24)} d`;
}

function renderCommandSidePanels() {
  if (!els.commandSidePanel) return;
  const items = Array.isArray(state.garantias) ? state.garantias : [];

  if (els.recentActivityList) {
    const sorted = [...items]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 5);
    els.recentActivityList.innerHTML = sorted.length ? sorted.map(i => {
      const tone = i.estatusOperativo === 'terminada' ? 'green' : i.estatusOperativo === 'en proceso' ? 'blue' : i.estatusValidacion === 'aceptada' ? 'green' : 'purple';
      const label = i.estatusOperativo === 'terminada' ? 'Reporte terminado' : i.estatusValidacion === 'aceptada' ? 'Reporte aceptado' : i.estatusOperativo === 'en proceso' ? 'Unidad en proceso' : 'Reporte actualizado';
      return `<div class="activity-row">
        <span class="activity-dot tone-${tone}"></span>
        <div class="activity-row-body">
          <strong>${escapeHtml(label)}</strong>
          <span class="muted small">${escapeHtml(i.folio || 'GAR-—')} · Unidad ${escapeHtml(String(i.numeroEconomico || '—'))}</span>
        </div>
        <span class="activity-time muted small">${timeAgo(i.updatedAt || i.createdAt)}</span>
      </div>`;
    }).join('') : '<div class="muted small">Sin actividad reciente.</div>';
  }

  if (els.upcomingAgendaList) {
    const now = Date.now();
    const upcoming = [...(state.schedules || [])]
      .filter(s => s.status !== 'cancelled')
      .map(s => ({ ...s, _d: new Date(s.scheduledFor || s.proposedAt || s.requestedAt || 0) }))
      .filter(s => !isNaN(s._d) && s._d.getTime() >= now - 3600000)
      .sort((a, b) => a._d - b._d)
      .slice(0, 3);
    els.upcomingAgendaList.innerHTML = upcoming.length ? upcoming.map(s => {
      const day = s._d.toLocaleDateString('es-MX', { day: '2-digit' });
      const mon = s._d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase();
      const hh = s._d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const statusLabel = ({ proposed: 'Propuesta', confirmed: 'Confirmada', waiting_operator: 'Esperando operador' })[s.status] || 'Programada';
      return `<div class="agenda-row">
        <div class="agenda-date"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(mon)}</span></div>
        <div class="agenda-row-body">
          <strong>Unidad ${escapeHtml(String(s.numeroEconomico || '—'))}</strong>
          <span class="muted small">${escapeHtml(s.empresa || '—')} · ${escapeHtml(hh)}</span>
        </div>
        <span class="badge badge-info">${escapeHtml(statusLabel)}</span>
      </div>`;
    }).join('') : '<div class="muted small">Sin ingresos programados.</div>';
  }

  if (els.statusDonut) {
    const m = computeExecutiveMetrics();
    const segs = [
      { label: 'En proceso', value: m.proceso, color: 'var(--blue)' },
      { label: 'Espera refacción', value: m.espera, color: 'var(--orange)' },
      { label: 'Terminadas', value: m.terminadas, color: 'var(--green)' },
      { label: 'Sin iniciar', value: m.sinIniciar || 0, color: 'var(--purple)' }
    ];
    const total = segs.reduce((s, x) => s + x.value, 0) || 1;
    let acc = 0;
    const stops = segs.map(s => {
      const start = (acc / total) * 360; acc += s.value; const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    }).join(', ');
    els.statusDonut.style.background = `conic-gradient(${stops})`;
    if (els.statusDonutTotal) els.statusDonutTotal.textContent = m.total;
    if (els.statusDonutLegend) {
      els.statusDonutLegend.innerHTML = segs.map(s => `<div class="donut-legend-row"><span class="donut-dot" style="background:${s.color}"></span><span>${escapeHtml(s.label)}</span><strong>${s.value}</strong></div>`).join('');
    }
  }
}

function renderExecutiveDeck() {
  if (!els.executiveDeckGrid) return;
  const m = computeExecutiveMetrics();
  const role = state.user?.role || '';
  const EXEC_ICONS = {
    pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
  };
  const pct = (num, den) => den ? Math.max(0, Math.min(100, Math.round((num / den) * 100))) : 0;
  const cards = [
    { kicker:'Pulso general', value:m.total, text:`${m.empresas} empresas activas · ${m.unidades} unidades con historial`, chip:`${m.nuevas} nuevas`, cls:'focus-card', tone:'purple', icon:'pulse', pct: pct(m.total - m.nuevas, m.total), actions:[['Ver reportes', () => { resetBoardFilters(); switchPanel('board'); }], role !== 'operador' ? ['Agenda', async () => { await loadSchedules(''); switchPanel('schedule'); }] : null].filter(Boolean) },
    { kicker:'Validación', value:m.aceptadas, text:`${m.revision} en revisión · ${m.rechazadas} rechazadas`, chip:'Bandeja viva', tone:'green', icon:'check', pct: pct(m.aceptadas, m.aceptadas + m.revision + m.rechazadas), actions:[['Filtrar aceptadas', () => { if (els.validationFilter) els.validationFilter.value='aceptada'; renderGarantias(); }], ['Pendientes', () => { if (els.validationFilter) els.validationFilter.value='pendiente de revisión'; renderGarantias(); }]] },
    { kicker:'Ejecución', value:m.proceso + m.espera, text:`${m.proceso} en proceso · ${m.espera} esperando refacción · ${m.terminadas} terminadas`, chip:'Operación', tone:'orange', icon:'tool', pct: pct(m.terminadas, m.proceso + m.espera + m.terminadas), actions:[['En proceso', () => { if (els.operationalFilter) els.operationalFilter.value='en proceso'; renderGarantias(); }], ['Terminadas', () => { if (els.operationalFilter) els.operationalFilter.value='terminada'; renderGarantias(); }]] },
    { kicker:'Reincidencia', value:m.reincidentes, text:'Unidades con más de una incidencia registrada. Excelente punto para control y venta.', chip:'Lectura comercial', tone:'blue', icon:'repeat', pct: pct(m.reincidentes, m.unidades), actions:[ isRole('admin','operativo','supervisor','supervisor_flotas') ? ['Historial', () => switchPanel('history')] : null, isRole('admin','operativo','supervisor_flotas') ? ['Flotas', async () => { await loadFleet(); switchPanel('fleet'); }] : null].filter(Boolean) }
  ];
  if (role === 'operador') {
    cards[1] = { kicker:'Seguimiento', value:m.aceptadas, text:`${m.revision} reportes siguen en análisis y ${m.terminadas} ya quedaron listos.`, chip:'Mi avance', tone:'green', icon:'check', pct: pct(m.aceptadas, m.aceptadas + m.revision), actions:[['Nuevo reporte', () => { resetReportForm(); switchPanel('report'); }], ['Mi agenda', async () => { await loadSchedules(''); switchPanel('schedule'); }]] };
    cards[3] = { kicker:'Refacciones', value:m.espera, text:'Tus reportes que requieren pieza quedan visibles para seguimiento.', chip:'Trazabilidad', tone:'blue', icon:'repeat', pct: pct(m.espera, m.total), actions:[['Ver reportes', () => { resetBoardFilters(); switchPanel('board'); }]] };
  }
  els.executiveDeckGrid.innerHTML = cards.map(card => `
    <article class="executive-card exec-tone-${card.tone || 'purple'} ${card.cls || ''}">
      <div class="executive-card-head">
        <div class="executive-icon">${EXEC_ICONS[card.icon] || EXEC_ICONS.pulse}</div>
        <div class="executive-kicker">${escapeHtml(card.kicker)}</div>
      </div>
      <strong>${escapeHtml(String(card.value))}</strong>
      <p>${escapeHtml(card.text)}</p>
      <div class="executive-progress-track"><div class="executive-progress-bar" style="width:${card.pct || 0}%"></div></div>
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
  updateStats(); renderAnalytics(); renderExecutiveDeck(); renderCommandSidePanels();
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
    const strip = node.querySelector('.evidence-strip');
    [...(item.evidencias || []), ...(item.evidenciasRefaccion || [])].forEach((src, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'evidence-thumb';
      btn.innerHTML = `<img src="${src}" alt="Evidencia ${idx + 1}" />`;
      btn.addEventListener('click', () => openImageLightbox(src, `Evidencia ${idx + 1}`));
      strip.appendChild(btn);
    });
    if (item.firma) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'evidence-thumb signature-thumb';
      btn.innerHTML = `<img src="${item.firma}" alt="Firma" />`;
      btn.addEventListener('click', () => openImageLightbox(item.firma, 'Firma del operador'));
      strip.appendChild(btn);
    }
    const area = node.querySelector('.action-area'); const baseRow = document.createElement('div'); baseRow.className = 'action-row'; baseRow.appendChild(button('Ver ficha', 'btn btn-secondary', () => openReportDetailModal(item))); baseRow.appendChild(button('PDF', 'btn btn-ghost', () => exportPdf(item))); if (isRole('admin','operativo')) baseRow.appendChild(button('Asignar actividades autorizadas', 'btn btn-secondary', () => openAuthorizedActivitiesModal(item.id))); if (isRole('admin','operativo','supervisor')) baseRow.appendChild(button('Historial', 'btn btn-ghost', () => showAudit(item))); if (isRole('admin') && item.estatusOperativo === 'terminada') baseRow.appendChild(button('Preparar cobro', 'btn btn-primary', async () => { await openQuoteFromReport(item.id); })); if (isRole('admin')) baseRow.appendChild(button('Editar', 'btn btn-secondary', async () => { await editarReporteAdmin(item); })); if (isRole('admin')) baseRow.appendChild(button('Eliminar', 'btn btn-ghost', async () => { if (!confirm(`¿Eliminar la orden ${item.numeroObra} de la unidad ${item.numeroEconomico}?`)) return; try { await api.deleteGarantia(item.id); notify('Orden eliminada.'); await loadGarantias(); } catch (error) { notify(error.message, true); } })); area.appendChild(baseRow);
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
  configureServicesCompanyFilter(activeCompanies);

  // conservar selección del operador si ya tiene empresa
  if (isRole('operador') && state.user?.empresa && els.empresa && !els.empresa.value) {
    els.empresa.value = state.user.empresa;
  }
}


function todayIso() { return new Date().toISOString().slice(0,10); }
function setServicesDefaultDates() {
  const now = new Date(); const end = new Date(now); const start = new Date(now);
  const p = els.servicesPeriod?.value || 'week';
  if (p === 'day') {} else if (p === 'month') start.setDate(start.getDate() - 30); else start.setDate(start.getDate() - 7);
  if (els.servicesStartDate && !els.servicesStartDate.value) els.servicesStartDate.value = start.toISOString().slice(0,10);
  if (els.servicesEndDate && !els.servicesEndDate.value) els.servicesEndDate.value = end.toISOString().slice(0,10);
}
function activityTypeLabel(value = '') { return ({ mano_obra:'Mano de obra', refaccion:'Refacción', pintura:'Pintura', ajuste:'Ajuste', diagnostico:'Diagnóstico', otro:'Otro' })[String(value || '').replace(/\s+/g,'_')] || 'Otro'; }
function activityStatusLabel(value = '') { return ({ pendiente:'Pendiente', en_proceso:'En proceso', realizada:'Realizada', cancelada:'Cancelada' })[String(value || '').replace(/\s+/g,'_')] || 'Pendiente'; }
function activityPriorityLabel(value = '') { return ({ normal:'Normal', alta:'Alta', urgente:'Urgente' })[String(value || '').toLowerCase()] || 'Normal'; }
function activityBadgeClass(value = '') { return ({ pendiente:'badge-role', en_proceso:'badge-info', realizada:'badge-success', cancelada:'badge-rejected' })[String(value || '').replace(/\s+/g,'_')] || 'badge-info'; }
function renderAuthorizedActivitiesSection(items = [], garantiaId = '') {
  const safeId = escapeHtml(garantiaId || '');
  const cards = items.map(a => `<article class="owner-card"><div class="owner-card-head"><strong>${escapeHtml(a.description)}</strong><span class="badge ${activityBadgeClass(a.status)}">${activityStatusLabel(a.status)}</span></div><div class="small muted">${activityTypeLabel(a.type)} · ${escapeHtml(a.responsible || 'Sin responsable')} · Prioridad ${activityPriorityLabel(a.priority)} · ${Number(a.estimatedHours || 0)} h</div>${a.notes ? `<div class="small muted">${escapeHtml(a.notes)}</div>` : ''}</article>`).join('');
  return `<div class="owner-card" data-authorized-activities-container="${safeId}"><div class="owner-card-head"><strong>Actividades autorizadas</strong><span class="badge badge-info" data-authorized-activities-count="${safeId}">${items.length}</span></div>${items.length ? `<div class="cards">${cards}</div>` : '<div class="muted">Sin actividades autorizadas registradas.</div>'}</div>`;
}

function configureServicesCompanyFilter(companies = null) {
  if (!els.servicesEmpresa) return;
  if (isRole('supervisor_flotas')) {
    const empresa = state.user?.empresa || '';
    els.servicesEmpresa.innerHTML = '';
    const option = document.createElement('option');
    option.value = empresa;
    option.textContent = empresa || 'Sin empresa asignada';
    els.servicesEmpresa.appendChild(option);
    els.servicesEmpresa.value = empresa;
    els.servicesEmpresa.disabled = true;
    els.servicesEmpresa.classList.add('locked-field');
    return;
  }
  els.servicesEmpresa.disabled = false;
  els.servicesEmpresa.classList.remove('locked-field');
  const activeCompanies = (companies || state.companies || []).filter(c => c.activo !== false);
  fillSelect(els.servicesEmpresa, activeCompanies, 'Todas');
}

function getServicesFilters() { return { startDate: els.servicesStartDate?.value || '', endDate: els.servicesEndDate?.value || '', empresa: isRole('supervisor_flotas') ? (state.user?.empresa || '') : (els.servicesEmpresa?.value || ''), numeroEconomico: els.servicesUnidad?.value || '', estatusOperativo: els.servicesEstatus?.value || '' }; }
function renderServicesReport() {
  const s = state.servicesReport.summary || {}, rows = state.servicesReport.reports || [];
  const cards = [['Total de reportes',s.totalReportes],['Unidades atendidas',s.unidadesAtendidas],['Terminados',s.terminados],['En proceso',s.enProceso],['Espera refacción',s.esperaRefaccion],['Refacciones solicitadas',s.reportesConRefaccionSolicitada],['Actividades autorizadas',s.actividadesAutorizadas],['Actividades urgentes',s.actividadesUrgentes],['Horas estimadas',s.estimatedHoursTotal],['Reincidencias',s.unidadesReincidentes]];
  if (els.servicesSummary) els.servicesSummary.innerHTML = cards.map(([k,v]) => `<article class="analytic-card"><strong>${escapeHtml(k)}</strong><div class="stat"><strong>${Number(v||0)}</strong></div></article>`).join('');
  if (els.servicesTable) els.servicesTable.innerHTML = rows.length ? rows.map(r => `<div class="table-row"><div><strong>${escapeHtml(r.folio || '—')}</strong><div class="small muted">${escapeHtml(fmtDate(r.createdAt))}</div><div class="small muted">${escapeHtml((r.descripcionFallo || '').slice(0, 110))}</div></div><div>${escapeHtml(r.empresa || '—')}</div><div>${escapeHtml(r.numeroEconomico || '—')}<div class="small muted">${escapeHtml(r.modelo || '—')}</div></div><div>${escapeHtml(r.tipoIncidente || '—')}</div><div>${escapeHtml(r.estatusValidacion || '—')} / ${escapeHtml(r.estatusOperativo || '—')}</div><div>${r.solicitaRefaccion ? 'Sí' : 'No'}</div><div>${Number(r.authorizedActivitiesCount || 0)}</div><div>${escapeHtml(fmtDate(r.closedAt))}</div></div>`).join('') : '<div class="empty-state"><strong>Sin reportes.</strong><span>Ajusta filtros y consulta nuevamente.</span></div>';
}
async function loadServicesReport() {
  if (!isRole('admin','operativo','supervisor_flotas')) return;
  configureServicesCompanyFilter();
  if (isRole('supervisor_flotas') && !String(state.user?.empresa || '').trim()) {
    notify('Tu usuario no tiene empresa asignada.', true);
    return;
  }
  setServicesDefaultDates();
  state.servicesReport = await api.getServicesReport(getServicesFilters()); renderServicesReport();
}
function downloadBlob(content, name, type) { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function exportServicesCsv() { const rows = state.servicesReport.reports || []; const headers=['Folio','Fecha','Empresa','Unidad','Modelo','Tipo incidencia','Descripción','Estatus validación','Estatus operativo','Refacción solicitada','Detalle refacción','Actividades autorizadas','Fecha cierre','Observaciones operativas']; const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`; const csv='\ufeff'+[headers.map(esc).join(','),...rows.map(r=>[r.folio,fmtDate(r.createdAt),r.empresa,r.numeroEconomico,r.modelo,r.tipoIncidente,r.descripcionFallo,r.estatusValidacion,r.estatusOperativo,r.solicitaRefaccion?'Sí':'No',r.detalleRefaccion,r.authorizedActivitiesCount||0,fmtDate(r.closedAt),r.observacionesOperativo].map(esc).join(','))].join('\n'); downloadBlob(csv, `servicios-carlab-${todayIso()}.csv`, 'text/csv;charset=utf-8'); }
function exportServicesJson() { const payload = { filters: getServicesFilters(), summary: state.servicesReport.summary || {}, reports: state.servicesReport.reports || [], generatedAt: new Date().toISOString(), generatedBy: state.user ? { id: state.user.id, nombre: state.user.nombre, email: state.user.email, role: state.user.role } : null }; downloadBlob(JSON.stringify(payload, null, 2), `servicios-carlab-${todayIso()}.json`, 'application/json;charset=utf-8'); }
function topServiceUnits(rows = []) { const map = new Map(); rows.forEach(r => { const key = `${r.empresa || '—'} · ${r.numeroEconomico || '—'}`; map.set(key, (map.get(key) || 0) + 1); }); return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5); }
async function addCarlabPdfHeader(doc, title, subtitle, meta = {}) { doc.setFillColor(22,22,26); doc.rect(0,0,210,34,'F'); doc.setFillColor(226,42,116); doc.rect(0,32,210,2,'F'); const logo = await getImageData('/logo.jpg'); if (logo) await addPdfImage(doc, logo, 12, 7, 22, 22); doc.setTextColor(255,255,255); doc.setFontSize(16); doc.text(title, 40, 15); doc.setFontSize(9); doc.text(subtitle, 40, 22); doc.setFontSize(8); doc.text(`Generado: ${meta.generatedAt || new Date().toLocaleString('es-MX')}`, 198, 12, { align:'right' }); doc.text(`Periodo: ${meta.period || '—'}`, 198, 18, { align:'right' }); doc.text(`Empresa: ${meta.empresa || 'Todas'}`, 198, 24, { align:'right' }); doc.text(`Usuario: ${meta.user || '—'}`, 198, 30, { align:'right' }); doc.setTextColor(35,35,35); return 44; }
function addCarlabPdfFooter(doc) { const pages = doc.internal.getNumberOfPages(); for (let i=1; i<=pages; i++) { doc.setPage(i); doc.setDrawColor(226,42,116); doc.line(14,286,196,286); doc.setFontSize(8); doc.setTextColor(110,110,110); doc.text('CARLAB Cloud · Reporte generado automáticamente',14,291); doc.text(`${i} / ${pages} · ${new Date().toLocaleString('es-MX')}`,196,291,{align:'right'}); } }
function addWrappedText(doc, text, x, y, width, lineHeight = 5) { const lines = doc.splitTextToSize(String(text || '—'), width); doc.text(lines, x, y); return y + (lines.length * lineHeight); }
function addPdfKpiCards(doc, summary = {}, y = 44) { const cards=[['Reportes',summary.totalReportes],['Unidades',summary.unidadesAtendidas],['Terminados',summary.terminados],['En proceso',summary.enProceso],['Espera ref.',summary.esperaRefaccion],['Refacciones',summary.reportesConRefaccionSolicitada],['Actividades',summary.actividadesAutorizadas],['Reincidencias',summary.unidadesReincidentes]]; cards.forEach((c,i)=>{ const x=14+(i%4)*46; const yy=y+Math.floor(i/4)*22; doc.setFillColor(248,248,250); doc.roundedRect(x,yy,42,17,3,3,'F'); doc.setTextColor(226,42,116); doc.setFontSize(13); doc.text(String(Number(c[1]||0)),x+4,yy+8); doc.setTextColor(70,70,70); doc.setFontSize(7); doc.text(c[0],x+4,yy+14); }); return y+48; }
function addPdfStatusBadge(doc, text, x, y, color = [120,120,120]) { doc.setFillColor(...color); doc.roundedRect(x,y-4,34,7,2,2,'F'); doc.setTextColor(255,255,255); doc.setFontSize(7); doc.text(String(text), x+17, y+1, { align:'center' }); doc.setTextColor(35,35,35); }
function truncatePdfLines(doc, text, width, maxLines = 2) {
  const lines = doc.splitTextToSize(String(text || '—'), width);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[out.length - 1] = String(out[out.length - 1]).replace(/\s+$/, '').replace(/[.…]+$/, '') + '…';
  return out;
}

async function addServicesPdfPage(doc, meta, subtitle = 'Resumen operativo de flota') {
  return addCarlabPdfHeader(doc, 'Reporte de servicios', subtitle, meta);
}

async function drawServicesTable(doc, rows = [], options = {}) {
  const meta = options.meta || {};
  const pageBottom = 276;
  const descWidth = 176;
  const baseRowHeight = 10;
  const lineHeight = 4;
  const padding = 4;
  const cols = [16, 38, 62, 88, 112, 150, 163, 176];
  const widths = [20, 21, 24, 22, 36, 12, 10, 18];
  let y = options.y || 44;

  const drawHeader = () => {
    doc.setFillColor(32, 32, 36);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    ['Folio','Fecha','Empresa','Unidad','Estatus','Ref.','Act.','Cierre'].forEach((h, i) => doc.text(h, cols[i], y + 5));
    y += 8;
    doc.setTextColor(45,45,45);
  };

  drawHeader();
  rows.forEach((r, idx) => {
    doc.setFontSize(7.5);
    const descLines = r.descripcionFallo ? truncatePdfLines(doc, `Descripción: ${r.descripcionFallo}`, descWidth, 2) : [];
    const rowHeight = baseRowHeight + (descLines.length ? (descLines.length * lineHeight + padding) : padding);
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = 44;
      drawHeader();
    }
    doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 248, idx % 2 ? 255 : 250);
    doc.rect(14, y, 182, rowHeight, 'F');
    const top = y + 5;
    const values = [
      r.folio || '—',
      String(fmtDate(r.createdAt)).slice(0, 10),
      r.empresa || '—',
      r.numeroEconomico || '—',
      r.estatusOperativo || '—',
      r.solicitaRefaccion ? 'Sí' : 'No',
      String(r.authorizedActivitiesCount || 0),
      String(fmtDate(r.closedAt)).slice(0, 10),
    ];
    values.forEach((value, i) => {
      const txt = truncatePdfLines(doc, value, widths[i], 1)[0] || '—';
      doc.text(txt, cols[i], top);
    });
    if (descLines.length) {
      doc.setTextColor(95,95,95);
      doc.text(descLines, 16, y + baseRowHeight + 3);
      doc.setTextColor(45,45,45);
    }
    y += rowHeight;
  });
  return y;
}

async function drawServicesDetailedBlocks(doc, rows = [], options = {}) {
  const meta = options.meta || {};
  let y = options.y || await addServicesPdfPage(doc, meta, 'Detalle de reportes');
  const pageBottom = 276;
  for (const r of rows) {
    doc.setFontSize(8);
    const descLines = doc.splitTextToSize(`Descripción: ${r.descripcionFallo || '—'}`, 174);
    const actsText = (r.authorizedActivities || r.authorizedActivitiesPreview || []).map(a => `${a.description} (${activityTypeLabel(a.type)}, ${activityStatusLabel(a.status)}, ${activityPriorityLabel(a.priority)}, ${Number(a.estimatedHours || 0)} h${a.responsible ? `, ${a.responsible}` : ''}${a.notes ? `, ${a.notes}` : ''})`).join('; ') || 'Sin actividades autorizadas registradas.';
    const actLines = doc.splitTextToSize(`Actividades: ${actsText}`, 174);
    const obsLines = r.observacionesOperativo ? doc.splitTextToSize(`Observaciones: ${r.observacionesOperativo}`, 174) : [];
    const blockHeight = 20 + (descLines.length + actLines.length + obsLines.length) * 4.2 + 10;
    if (y + blockHeight > pageBottom) {
      doc.addPage();
      y = await addServicesPdfPage(doc, meta, 'Detalle de reportes');
    }
    doc.setFillColor(248,248,250);
    doc.roundedRect(14, y, 182, blockHeight, 3, 3, 'F');
    doc.setTextColor(35,35,35);
    doc.setFontSize(10);
    doc.text(`${r.folio || '—'} · ${r.empresa || '—'} · Unidad ${r.numeroEconomico || '—'}`, 18, y + 7);
    doc.setFontSize(8);
    let yy = y + 13;
    yy = addWrappedText(doc, `Modelo: ${r.modelo || '—'} | Estatus: ${r.estatusValidacion || '—'} / ${r.estatusOperativo || '—'} | Refacción: ${r.solicitaRefaccion ? 'Sí' : 'No'} | Cierre: ${fmtDate(r.closedAt)}`, 18, yy, 174, 4.2) + 1;
    doc.text(descLines, 18, yy); yy += descLines.length * 4.2 + 2;
    doc.text(actLines, 18, yy); yy += actLines.length * 4.2 + 2;
    if (obsLines.length) doc.text(obsLines, 18, yy);
    y += blockHeight + 5;
  }
  return y;
}

async function exportServicesPdf(mode = 'executive') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const rows = state.servicesReport.reports || [];
  const s = state.servicesReport.summary || {};
  const meta = {
    generatedAt: new Date().toLocaleString('es-MX'),
    period: `${els.servicesStartDate?.value || '—'} a ${els.servicesEndDate?.value || '—'}`,
    empresa: els.servicesEmpresa?.value || (state.user?.role === 'supervisor_flotas' ? state.user?.empresa : 'Todas') || 'Todas',
    user: state.user?.nombre || state.user?.email || '—',
  };
  let y = await addServicesPdfPage(doc, meta);
  y = addPdfKpiCards(doc, s, y);
  doc.setFontSize(10); doc.setTextColor(35,35,35);
  y = ensurePdfSpace(doc, y, 22); doc.text('Semáforo operativo', 14, y);
  addPdfStatusBadge(doc, `Verde ${s.terminados || 0}`, 52, y, [46,160,90]);
  addPdfStatusBadge(doc, `Amarillo ${(s.pendientesSinIniciar || 0) + (s.enProceso || 0)}`, 90, y, [226,170,40]);
  addPdfStatusBadge(doc, `Rojo ${(s.esperaRefaccion || 0) + (s.unidadesReincidentes || 0)}`, 136, y, [200,70,70]);
  y += 12;
  y = ensurePdfSpace(doc, y, 28); doc.setFontSize(12); doc.text('Lectura ejecutiva', 14, y); y += 7;
  doc.setFontSize(9);
  y = addWrappedText(doc, `Durante el periodo seleccionado se registraron ${s.totalReportes || 0} reportes en ${s.unidadesAtendidas || 0} unidades. La operación muestra ${s.terminados || 0} servicios terminados, ${s.enProceso || 0} en proceso y ${s.esperaRefaccion || 0} en espera de refacción. Se detectaron ${s.unidadesReincidentes || 0} unidades reincidentes y ${s.actividadesAutorizadas || 0} actividades autorizadas.`, 14, y, 182) + 6;
  y = ensurePdfSpace(doc, y, 28); doc.setFontSize(12); doc.text('Top unidades con más reportes', 14, y); y += 7;
  doc.setFontSize(9); topServiceUnits(rows).forEach(([unit, count]) => { doc.text(`${unit}: ${count}`, 18, y); y += 5; }); y += 4;
  const highlighted = rows.filter(r => r.authorizedActivitiesCount > 0).slice(0, 5);
  if (highlighted.length) {
    y = ensurePdfSpace(doc, y, 28); doc.setFontSize(12); doc.text('Actividades autorizadas destacadas', 14, y); y += 7;
    doc.setFontSize(9); highlighted.forEach(r => { doc.text(`${r.folio || '—'} · ${r.numeroEconomico || '—'} · ${r.authorizedActivitiesCount} actividad(es)`, 18, y); y += 5; }); y += 4;
  }
  y = await drawServicesTable(doc, rows, { y: ensurePdfSpace(doc, y, 20), meta });
  if (mode === 'detail') {
    doc.addPage();
    await drawServicesDetailedBlocks(doc, rows, { meta });
  }
  addCarlabPdfFooter(doc);
  doc.save(`servicios-carlab-${todayIso()}.pdf`);
}
function updateAuthorizedActivitiesSummary() { const rows=[...els.authorizedActivitiesList.querySelectorAll('.authorized-activity-row')].map(readActivityRow).filter(a=>a.description); const c=(fn)=>rows.filter(fn).length; const cards=[['Total',rows.length],['Pendientes',c(a=>a.status==='pendiente')],['En proceso',c(a=>a.status==='en_proceso')],['Realizadas',c(a=>a.status==='realizada')],['Urgentes',c(a=>a.priority==='urgente')],['Horas',rows.reduce((s,a)=>s+Number(a.estimatedHours||0),0)]]; if(els.authorizedActivitiesSummary) els.authorizedActivitiesSummary.innerHTML=cards.map(([k,v])=>`<article class="analytic-card"><strong>${k}</strong><div class="stat"><strong>${v}</strong></div></article>`).join(''); }
function readActivityRow(row) { return { id: row.dataset.id || '', description: row.querySelector('.aa-description')?.value.trim() || '', type: row.querySelector('.aa-type')?.value || 'otro', responsible: row.querySelector('.aa-responsible')?.value.trim() || '', priority: row.querySelector('.aa-priority')?.value || 'normal', estimatedHours: Number((row.querySelector('.aa-estimated-hours') || row.querySelector('.aa-hours'))?.value || 0), status: row.querySelector('.aa-status')?.value || 'pendiente', notes: row.querySelector('.aa-notes')?.value.trim() || '' }; }
function activityEditorRow(a = {}) { const wrap=document.createElement('div'); wrap.className='owner-card authorized-activity-row'; wrap.dataset.id=a.id||''; wrap.innerHTML=`<div class="schedule-manual-grid"><label class="span-2"><span>Descripción</span><input class="aa-description" value="${escapeHtml(a.description||'')}" /></label><label><span>Tipo</span><select class="aa-type"><option value="mano_obra">Mano de obra</option><option value="refaccion">Refacción</option><option value="pintura">Pintura</option><option value="ajuste">Ajuste</option><option value="diagnostico">Diagnóstico</option><option value="otro">Otro</option></select></label><label><span>Responsable</span><input class="aa-responsible" value="${escapeHtml(a.responsible||'')}" placeholder="Sin responsable" /></label><label><span>Prioridad</span><select class="aa-priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><label><span>Horas estimadas</span><input class="aa-hours aa-estimated-hours" type="number" min="0" step="0.25" value="${Number(a.estimatedHours||0)}" /></label><label><span>Estatus</span><select class="aa-status"><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></label><label class="span-2"><span>Observaciones</span><textarea class="aa-notes" rows="2">${escapeHtml(a.notes||'')}</textarea></label><button class="btn btn-ghost aa-delete" type="button">Eliminar</button></div>`; wrap.querySelector('.aa-type').value=a.type||'otro'; wrap.querySelector('.aa-status').value=a.status||'pendiente'; wrap.querySelector('.aa-priority').value=a.priority||'normal'; wrap.querySelector('.aa-delete').onclick=()=>{wrap.remove(); updateAuthorizedActivitiesSummary();}; wrap.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('input', updateAuthorizedActivitiesSummary)); return wrap; }
function addAuthorizedActivityRow(preset = {}) { els.authorizedActivitiesList?.appendChild(activityEditorRow(preset)); updateAuthorizedActivitiesSummary(); }
async function openAuthorizedActivitiesModal(garantiaId) { state.authorizedActivitiesEditingId=garantiaId; try { const items=await api.getAuthorizedActivities(garantiaId); els.authorizedActivitiesList.innerHTML=''; items.forEach(a=>els.authorizedActivitiesList.appendChild(activityEditorRow(a))); if(!items.length) addAuthorizedActivityRow(); updateAuthorizedActivitiesSummary(); els.authorizedActivitiesModal?.classList.remove('hidden'); document.body.classList.add('modal-open'); } catch(error) { notify(error.message || 'No se pudieron cargar las actividades autorizadas.', true); } }
function closeAuthorizedActivitiesModal(){ els.authorizedActivitiesModal?.classList.add('hidden'); if(els.authorizedActivitiesList) els.authorizedActivitiesList.innerHTML=''; if (els.reportDetailModal?.classList.contains('hidden')) document.body.classList.remove('modal-open'); }
function isActivityRowEmpty(activity = {}) {
  return !activity.description && !activity.responsible && !activity.notes && Number(activity.estimatedHours || 0) === 0 && (activity.type || 'otro') === 'otro' && (activity.status || 'pendiente') === 'pendiente' && (activity.priority || 'normal') === 'normal';
}

async function refreshOpenReportDetailAfterActivitiesSave(garantiaId, activities = []) {
  const id = String(garantiaId || '').trim();
  if (!id) return;
  try {
    const freshGarantia = await api.getGarantia(id);
    freshGarantia.authorizedActivities = activities;
    freshGarantia.authorizedActivitiesCount = activities.length;
    state.garantiaFullCache[id] = freshGarantia;
  } catch (error) {
    console.warn('[authorizedActivities] no se pudo refrescar garantía completa:', error?.message || error);
  }

  const container = [...document.querySelectorAll('[data-authorized-activities-container]')]
    .find(el => el.dataset.authorizedActivitiesContainer === id) ||
    document.querySelector('[data-authorized-activities-container]');
  if (container) container.outerHTML = renderAuthorizedActivitiesSection(activities, id);

  const badge = [...document.querySelectorAll('[data-authorized-activities-count]')]
    .find(el => el.dataset.authorizedActivitiesCount === id) ||
    document.querySelector('[data-authorized-activities-count]');
  if (badge) badge.textContent = String(activities.length);
}

async function saveAuthorizedActivities() {
  const garantiaId = state.authorizedActivitiesEditingId;
  if (!garantiaId) {
    notify('No hay reporte seleccionado para guardar actividades.', true);
    return;
  }

  const rows = [...(els.authorizedActivitiesList?.querySelectorAll('.authorized-activity-row') || [])];
  const activities = rows.map(readActivityRow).filter(a =>
    a.description ||
    a.responsible ||
    a.notes ||
    Number(a.estimatedHours || 0) > 0
  );

  const invalid = activities.find(a => !a.description);
  if (invalid) {
    notify('Toda actividad capturada necesita descripción.', true);
    return;
  }

  const saveBtn = els.authorizedActivitiesSaveBtn;
  const oldText = saveBtn?.textContent || 'Guardar';

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    console.log('[authorizedActivities] saving', garantiaId, activities);
    await api.saveAuthorizedActivitiesBulk(garantiaId, activities);

    const verifiedActivities = await api.getAuthorizedActivities(garantiaId);
    console.log('[authorizedActivities] verified', verifiedActivities);

    if (!state.authorizedActivitiesByReport) state.authorizedActivitiesByReport = {};
    state.authorizedActivitiesByReport[garantiaId] = verifiedActivities;

    if (state.garantiaFullCache) delete state.garantiaFullCache[garantiaId];

    await loadGarantias();
    await refreshOpenReportDetailAfterActivitiesSave(garantiaId, verifiedActivities);

    if (state.activePanel === 'services' && typeof loadServicesReport === 'function') {
      await loadServicesReport();
    }

    closeAuthorizedActivitiesModal();
    notify(`Actividades autorizadas guardadas: ${verifiedActivities.length}.`);
  } catch (error) {
    console.error('[authorizedActivities] save failed:', error);
    notify(error.message || 'No se pudieron guardar las actividades autorizadas.', true);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = oldText;
    }
  }
}


async function loadGarantias() { state.garantias = await api.getGarantias(); renderGarantias(); await loadNotifications(); }
async function loadUsers() { if (!isRole('admin')) return; state.users = await api.getUsers(); renderUsers(); }
async function loadCompanies() { state.companies = isRole('admin') ? await api.getCompanies() : await api.getPublicCompanies(); renderCompanies(); }
async function loadRequests() { if (!isRole('admin')) return; state.registrationRequests = await api.getRequests(); renderRequests(); }

function paintUnitHistory(history) {
  const q = normalizeText(els.unitHistorySearchInput?.value || '');
  const filtered = !q ? history : history.filter(item => normalizeText([item.numeroObra, item.modelo, item.empresa, item.tipoIncidente, item.descripcionFallo].join(' ')).includes(q));
  els.unitHistoryResult.innerHTML = filtered.length ? filtered.map(item => `<div class="table-row"><div><strong>Obra ${escapeHtml(item.numeroObra)}</strong><div class="small muted">${escapeHtml(item.modelo)} · ${escapeHtml(item.empresa)}</div><div class="small muted">${escapeHtml(item.descripcionFallo || '')}</div>${(item.authorizedActivities || []).length ? `<div class="small muted"><strong>${(item.authorizedActivities || []).length} actividades autorizadas:</strong> ${(item.authorizedActivities || []).slice(0,3).map(a => escapeHtml(a.description)).join(', ')}${(item.authorizedActivities || []).length > 3 ? ' · Ver detalle en ficha' : ''}</div>` : ''}</div><div>${escapeHtml(item.tipoIncidente)}</div><div><span class="badge ${badgeClassValidation(item.estatusValidacion)}">${escapeHtml(item.estatusValidacion)}</span></div><div>${fmtDate(item.createdAt)}</div></div>`).join('') : '<div class="empty-state"><strong>Sin historial.</strong><span>No hay coincidencias para esa unidad.</span></div>';
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
    await loadCompanies();
    await loadGarantias();
    await loadNotifications();
    if (isRole('admin')) {
      await loadUsers();
      await loadRequests();
    }
    resetReportForm(); resetCompanyForm(); resetFleetForm(); notify(`Bienvenido, ${state.user.nombre}.`);
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

async function openReportDetailModal(item) {
  if (!item || !els.reportDetailModal || !els.reportDetailContent) return;
  let full = null;
  try {
    full = await getGarantiaFull(item.id);
  } catch (error) {
    notify(error.message || 'No se pudo abrir la ficha completa.', true);
    return;
  }
  const gallery = [
    ...(full.evidencias || []).map((src, idx) => ({ src, caption: `Evidencia general ${idx + 1}` })),
    ...(full.evidenciasRefaccion || []).map((src, idx) => ({ src, caption: `Evidencia refacción ${idx + 1}` })),
    ...(full.firma ? [{ src: full.firma, caption: 'Firma del operador' }] : [])
  ];
  els.reportDetailContent.innerHTML = `
    <div class="parts-request-head report-detail-head-sticky">
      <div class="topbar-kicker">FICHA COMPLETA</div>
      <h3>${escapeHtml(full.folio || 'GAR-—')} · Unidad ${escapeHtml(full.numeroEconomico || '—')}</h3>
      <p>Reporte integral con estatus, trazabilidad, evidencia y datos operativos/comerciales.</p>
    </div>
    <div class="report-detail-scroll">
    <div class="fleet-detail-summary report-detail-summary">
      <article><span>Empresa</span><strong>${escapeHtml(full.empresa || '—')}</strong></article>
      <article><span>Obra</span><strong>${escapeHtml(full.numeroObra || '—')}</strong></article>
      <article><span>Modelo</span><strong>${escapeHtml(full.modelo || '—')}</strong></article>
      <article><span>Incidencia</span><strong>${escapeHtml(full.tipoIncidente || '—')}</strong></article>
      <article><span>Validación</span><strong>${escapeHtml(full.estatusValidacion || '—')}</strong></article>
      <article><span>Operativo</span><strong>${escapeHtml(full.estatusOperativo || '—')}</strong></article>
    </div>
    <div class="mini-grid report-detail-grid">
      <div><strong>Reportó</strong>${escapeHtml(full.reportadoPorNombre || '—')}</div>
      <div><strong>Revisó</strong>${escapeHtml(full.revisadoPorNombre || 'Pendiente')}</div>
      <div><strong>Contacto</strong>${escapeHtml(full.contactoNombre || '—')}</div>
      <div><strong>Teléfono</strong>${escapeHtml(full.telefono || '—')}</div>
      <div><strong>Kilometraje</strong>${escapeHtml(full.kilometraje || '—')}</div>
      <div><strong>Fecha alta</strong>${escapeHtml(fmtDate(full.createdAt))}</div>
      <div><strong>Último cambio</strong>${escapeHtml(fmtDate(full.updatedAt))}</div>
      <div><strong>Solicita refacción</strong>${full.solicitaRefaccion ? 'Sí' : 'No'}</div>
    </div>
    <div class="owner-card">
      <div class="owner-card-head"><strong>Falla reportada</strong><span class="badge badge-info">Descripción</span></div>
      <p class="description">${escapeHtml(full.descripcionFallo || 'Sin descripción')}</p>
      ${full.detalleRefaccion ? `<p class="small muted"><strong>Detalle refacción:</strong> ${escapeHtml(full.detalleRefaccion)}</p>` : ''}
      ${full.observacionesOperativo ? `<p class="small muted"><strong>Observación operativa:</strong> ${escapeHtml(full.observacionesOperativo)}</p>` : ''}
      ${full.motivoDecision ? `<p class="small muted"><strong>Motivo decisión:</strong> ${escapeHtml(full.motivoDecision)}</p>` : ''}
    </div>
    ${renderAuthorizedActivitiesSection(full.authorizedActivities || [], full.id)}
    <div class="owner-card owner-gallery-card">
      <div class="owner-card-head"><strong>Evidencia visual</strong><span class="badge badge-info">${gallery.length} archivo${gallery.length === 1 ? '' : 's'}</span></div>
      ${gallery.length ? `<div class="media-gallery">${gallery.map((entry, idx) => `<button type="button" class="media-thumb" onclick='openImageLightbox(${JSON.stringify(entry.src)}, ${JSON.stringify(entry.caption || `Evidencia ${idx + 1}`)})'><img src="${entry.src}" alt="Evidencia ${idx + 1}" /></button>`).join('')}</div>` : '<div class="muted">Sin evidencia cargada.</div>'}
    </div>
    </div>
    <div class="parts-request-actions report-detail-actions-sticky">
      <button id="reportDetailPdfBtn" class="btn btn-secondary" type="button">Exportar PDF</button>
      ${isRole('admin','operativo') ? '<button id="reportDetailActivitiesBtn" class="btn btn-secondary" type="button">Asignar actividades autorizadas</button>' : ''}
      ${isRole('admin') ? '<button id="reportDetailRemindBtn" class="btn btn-secondary" type="button">Recordatorio por WhatsApp</button>' : ''}
      <button id="reportDetailCloseBtn" class="btn btn-ghost" type="button">Cerrar</button>
    </div>
  `;
  document.getElementById('reportDetailPdfBtn')?.addEventListener('click', () => exportPdf(full));
  document.getElementById('reportDetailActivitiesBtn')?.addEventListener('click', () => openAuthorizedActivitiesModal(full.id));
  document.getElementById('reportDetailRemindBtn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (!btn) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      await api.remindSupervisorWhatsApp(full.id);
      notify('Recordatorio enviado al supervisor de flota.');
    } catch (error) {
      const raw = String(error?.message || '');
      const msg = raw.includes('No hay supervisor de flota ligado a esta empresa')
        ? 'No hay supervisor de flota ligado a esta empresa.'
        : raw.includes('El supervisor de flota no tiene teléfono registrado')
          ? 'El supervisor de flota no tiene número registrado.'
          : raw.includes('No está configurada la plantilla de WhatsApp para supervisor')
            ? 'No está configurada la plantilla de WhatsApp para supervisor.'
            : 'No se pudo enviar el WhatsApp. Intenta nuevamente.';
      notify(msg, true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
  document.getElementById('reportDetailCloseBtn')?.addEventListener('click', closeReportDetailModal);
  els.reportDetailModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeReportDetailModal() {
  els.reportDetailModal?.classList.add('hidden');
  if (els.reportDetailContent) els.reportDetailContent.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function buildImageGallery(items = [], emptyText = 'Sin evidencia visual.') {
  if (!items.length) return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  return `<div class="media-gallery">${items.map((src, index) => `<button class="media-thumb" type="button" onclick='openImageLightbox(${JSON.stringify(src)}, ${JSON.stringify('Evidencia ')} + ${index + 1})'><img src="${src}" alt="Evidencia ${index + 1}" /></button>`).join('')}</div>`;
}

els.imageLightboxClose?.addEventListener('click', closeImageLightbox);
els.imageLightbox?.addEventListener('click', (e) => { if (e.target === els.imageLightbox) closeImageLightbox(); });
els.reportDetailClose?.addEventListener('click', closeReportDetailModal);
els.reportDetailModal?.addEventListener('click', (e) => { if (e.target === els.reportDetailModal) closeReportDetailModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!els.partsRequestModal?.classList.contains('hidden')) closeIndependentRequestModal();
    if (!els.reportDetailModal?.classList.contains('hidden')) closeReportDetailModal();
    if (!els.imageLightbox?.classList.contains('hidden')) closeImageLightbox();
    if (document.body.classList.contains('fleet-detail-modal-open')) {
      closeFleetDetailModal();
    }
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
  const analytics = state.fleetAnalytics || {};
  const units = state.fleetUnits || [];
  const totalCost = units.reduce((sum, unit) => sum + Number(unit.costoTotal || 0), 0);
  return {
    total: Number(analytics.totalUnits || units.length || 0),
    critical: Number(analytics.criticalUnits || 0),
    warning: Number(analytics.warningUnits || 0),
    ok: Number(analytics.okUnits || 0),
    openReports: Number(analytics.openReports || 0),
    criticalOpenReports: Number(analytics.criticalOpenReports || 0),
    reincidentes: Number(analytics.unitsWithRecurrence || 0),
    avgOpenReportsPerUnit: Number(analytics.avgOpenReportsPerUnit || 0),
    totalCost,
    topProblemUnits: Array.isArray(analytics.topProblemUnits) ? analytics.topProblemUnits : [],
    recentTrend: Array.isArray(analytics.recentTrend) ? analytics.recentTrend : [],
  };
}

function animateFleetOwnerNumbers(root) {
  if (!root) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count || 0);
    const currency = el.dataset.currency === '1';
    const suffix = el.dataset.suffix || '';
    const start = 0;
    const duration = 600;
    const startAt = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = start + (end - start) * eased;
      const out = currency ? money(value) : `${Math.round(value)}${suffix}`;
      el.textContent = out;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function renderFleetOwnerDeck() {
  if (!els.fleetOwnerDeck) return;
  const ownerModeEnabled = isRole('admin', 'supervisor_flotas');
  if (!ownerModeEnabled) {
    els.fleetOwnerDeck.innerHTML = '';
    return;
  }
  const m = fleetOwnerMetrics();
  const units = state.fleetUnits || [];
  const critical = units.filter(u => normalizeFleetStatus(u).color === 'red').length;
  const warning = units.filter(u => normalizeFleetStatus(u).color === 'orange').length;
  const ok = Math.max(0, units.length - critical - warning);
  const attentionUnits = [...units]
    .filter(unit => ['red', 'orange'].includes(normalizeFleetStatus(unit).color))
    .map(unit => ({ ...unit, statusView: normalizeFleetStatus(unit), stale: fleetInactiveTimeMeta(unit) }))
    .sort((a, b) => {
      const pa = a.statusView.color === 'red' ? 0 : 1;
      const pb = b.statusView.color === 'red' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return Number(b.stale?.ms || 0) - Number(a.stale?.ms || 0);
    })
    .slice(0, 8);
  const total = Math.max(1, units.length || 1);
  const pct = (value) => Math.round((Number(value || 0) / total) * 100);
  els.fleetOwnerDeck.innerHTML = `
    <section class="fleet-kpis">
      <article class="fleet-kpi-card"><div class="fleet-kpi-icon">🚌</div><span class="fleet-kpi-label">Total unidades</span><strong class="fleet-kpi-value" data-count="${units.length}">${units.length}</strong><small class="fleet-kpi-note">Parque activo</small></article>
      <article class="fleet-kpi-card is-green"><div class="fleet-kpi-icon">●</div><span class="fleet-kpi-label">Operando</span><strong class="fleet-kpi-value" data-count="${ok}">${ok}</strong><small class="fleet-kpi-note">${pct(ok)}% del total</small></article>
      <article class="fleet-kpi-card is-red"><div class="fleet-kpi-icon">●</div><span class="fleet-kpi-label">Detenidas</span><strong class="fleet-kpi-value" data-count="${critical}">${critical}</strong><small class="fleet-kpi-note">Prioridad alta</small></article>
      <article class="fleet-kpi-card is-orange"><div class="fleet-kpi-icon">●</div><span class="fleet-kpi-label">En proceso</span><strong class="fleet-kpi-value" data-count="${warning}">${warning}</strong><small class="fleet-kpi-note">Seguimiento</small></article>
      <article class="fleet-kpi-card"><div class="fleet-kpi-icon">↗</div><span class="fleet-kpi-label">Reportes abiertos</span><strong class="fleet-kpi-value" data-count="${m.openReports}">${m.openReports}</strong><small class="fleet-kpi-note">Backlog activo</small></article>
      <article class="fleet-kpi-card is-red"><div class="fleet-kpi-icon">⚙</div><span class="fleet-kpi-label">Refacciones pendientes</span><strong class="fleet-kpi-value" data-count="${m.criticalOpenReports}">${m.criticalOpenReports}</strong><small class="fleet-kpi-note">Revisar hoy</small></article>
    </section>
    <section class="fleet-dashboard-row">
      <article class="fleet-panel">
        <div class="owner-card-head"><strong class="fleet-panel-title">Atención prioritaria</strong><span class="badge badge-info">${attentionUnits.length}</span></div>
        <div class="priority-list">${attentionUnits.length ? attentionUnits.map(unit => {
          const motivo = unit.statusView.color === 'red' ? 'Refacción pendiente' : 'Servicio en proceso';
          const detalle = unit.descripcionFallo || unit.detalleRefaccion || unit.modelo || 'Seguimiento operativo';
          const action = unit.statusView.color === 'red' ? 'Abrir ficha' : 'Revisar unidad';
          return `<button type="button" class="priority-row" data-fleet-priority-id="${escapeHtml(unit.id)}"><span class="priority-unit">${escapeHtml(unit.numeroEconomico || '—')}</span><span class="priority-problem">${escapeHtml(motivo)} – ${escapeHtml(String(detalle).slice(0, 80))}</span><span class="status-badge ${unit.statusView.color}">${escapeHtml(unit.statusView.priority)}</span><span class="priority-action">${escapeHtml(action)}</span></button>`;
        }).join('') : '<div class="muted">Sin unidades que requieran acción inmediata.</div>'}</div>
      </article>
      <article class="fleet-panel fleet-summary-panel">
        <div class="owner-card-head"><strong class="fleet-panel-title">Resumen de flota</strong></div>
        <div class="fleet-distribution"><span class="green" style="width:${pct(ok)}%"></span><span class="orange" style="width:${pct(warning)}%"></span><span class="red" style="width:${pct(critical)}%"></span></div>
        <div class="fleet-summary-mini"><div><strong>${ok}</strong><span>Operando</span></div><div><strong>${warning}</strong><span>En proceso</span></div><div><strong>${critical}</strong><span>Detenidas</span></div></div>
      </article>
    </section>`;
  els.fleetOwnerDeck.querySelectorAll('[data-fleet-priority-id]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openFleetUnitDetail(btn.dataset.fleetPriorityId);
    });
  });
  animateFleetOwnerNumbers(els.fleetOwnerDeck);
  mountFleetOwnerLiveTimer();
}

async function openFleetUnitDetail(id) {
  if (!id) return;
  try {
    const base = await api.getFleetUnit(id);
    state.selectedFleetUnit = { ...(base || {}), reports: [], costs: [], campaigns: [], schedules: [], parts: [], loading: { reports:true, costs:true, campaigns:true, schedules:true, parts:true } };
    if (isRole('admin')) await loadAdminUnitCosts(id);
    switchPanel('fleet');
    renderFleet();
    renderFleetDetail();
    startFleetUnitProgressiveLoad(id);
    document.body.classList.add('fleet-detail-modal-open');
  } catch (error) {
    notify(error.message, true);
  }
}
async function focusFleetUnit(id) {
  return openFleetUnitDetail(id);
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
  if (state.fleetOwnerLiveTimer) {
    clearInterval(state.fleetOwnerLiveTimer);
    state.fleetOwnerLiveTimer = null;
  }
  if (els.operatorAppNav) {
    els.operatorAppNav.classList.add('hidden');
    els.operatorAppNav.style.display = 'none';
    requestAnimationFrame(() => { if (els.operatorAppNav) els.operatorAppNav.style.display = ''; });
  }
  updateOperatorAppNav('');
  showLogin();
}

els.logoutBtn?.addEventListener('click', logoutSession);
els.globalRefreshBtn?.addEventListener('click', async () => {
  await loadGarantias();
  await loadNotifications();
  if (state.activePanel === 'schedule') await loadSchedules('');
  if (state.activePanel === 'fleet') await loadFleet();
  if (state.activePanel === 'parts') await loadPartsPending(true);
  if (state.activePanel === 'stock' && isRole('admin')) await loadStock(true);
  if (state.activePanel === 'cobranza' && isRole('admin')) await loadCobranza(true);
  if (state.activePanel === 'campaigns') await loadCampaigns(state.selectedCampaignId);
  renderExecutiveDeck();
  notify('Datos actualizados.');
});
els.opNavHomeBtn?.addEventListener('click', () => switchPanel('board'));
els.opNavNewBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.opNavScheduleBtn?.addEventListener('click', async () => { switchPanel('schedule'); });
els.opNavLogoutBtn?.addEventListener('click', logoutSession);
els.imageLightboxClose?.addEventListener('click', closeImageLightbox);
els.imageLightbox?.addEventListener('click', (e) => { if (e.target === els.imageLightbox) closeImageLightbox(); });
els.navBoardBtn?.addEventListener('click', () => switchPanel('board'));
els.navNewReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.navAnalyticsBtn?.addEventListener('click', () => switchPanel('analytics'));
els.navHistoryBtn?.addEventListener('click', () => switchPanel('history'));
els.navScheduleBtn?.addEventListener('click', async () => { switchPanel('schedule'); });
els.navFleetBtn?.addEventListener('click', async () => { switchPanel('fleet'); });
els.navServicesBtn?.addEventListener('click', async () => { switchPanel('services'); });
els.navPartsBtn?.addEventListener('click', async () => { await cargarSolicitudesIndependientes(); await loadPartsPending(true); switchPanel('parts'); });
els.navStockBtn?.addEventListener('click', async () => { switchPanel('stock'); });
els.navCobranzaBtn?.addEventListener('click', async () => { switchPanel('cobranza'); });
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
els.fleetNewBtn?.addEventListener('click', () => { if (!isRole('admin','operativo')) return; state.editingFleetUnitId = ''; setFleetEntryMode('single'); toggleFleetForm(true); if (els.fleetSaveBtn) els.fleetSaveBtn.textContent = 'Guardar unidad'; els.fleetEmpresa?.focus(); });
document.querySelectorAll('#fleetPanel [data-fleet-entry-mode]').forEach(btn => btn.addEventListener('click', () => setFleetEntryMode(btn.dataset.fleetEntryMode || 'single')));
document.getElementById('fleetBatchSaveBtn')?.addEventListener('click', async () => { try { await saveFleetBatch(); } catch (error) { notify(error.message, true); } });
els.fleetBulkDeletePreviewBtn?.addEventListener('click', () => { try { previewFleetBulkDelete(); } catch (error) { notify(error.message, true); } });
els.fleetBulkDeleteConfirmBtn?.addEventListener('click', async () => { try { await confirmFleetBulkDelete(); } catch (error) { notify(error.message, true); } });
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
  const companyKey = normalizeIdentityKey(company);
  const units = (state.fleetUnits || []).filter(u => !companyKey || normalizeIdentityKey(u.empresa) === companyKey);
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
els.fleetStatusFilter?.addEventListener('change', () => { document.querySelectorAll('#fleetPanel [data-fleet-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.fleetFilter === (els.fleetStatusFilter?.value || 'todos'))); renderFleet(); });
document.querySelectorAll('#fleetPanel [data-fleet-filter]').forEach(btn => btn.addEventListener('click', () => { if (els.fleetStatusFilter) els.fleetStatusFilter.value = btn.dataset.fleetFilter || 'todos'; document.querySelectorAll('#fleetPanel [data-fleet-filter]').forEach(item => item.classList.toggle('active', item === btn)); renderFleet(); }));
['fleetEmpresa','fleetNombreFlota','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetPolizaActiva','fleetCampaignActiva','fleetBatchEmpresa','fleetBatchNombreFlota','fleetBatchMarca','fleetBatchModelo','fleetBatchAnio','fleetBatchNumeroObra','fleetBatchKilometraje','fleetBatchPolizaActiva','fleetBatchCampaignActiva','fleetBatchNumeros'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('input', () => state.fleetDirty = true);
  el?.addEventListener('change', () => state.fleetDirty = true);
});
['fleetBulkDeleteEmpresa','fleetBulkDeleteNumeros'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('input', () => resetFleetBulkDeletePreview());
  el?.addEventListener('change', () => resetFleetBulkDeletePreview());
});
els.fleetSaveBtn?.addEventListener('click', async () => {
  try {
    if (!state.editingFleetUnitId && state.fleetEntryMode === 'batch') { await saveFleetBatch(); return; }
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
    await Promise.allSettled([loadSchedules('')]);
    renderCommandSidePanels();
    if (isRole('admin')) await Promise.allSettled([loadUsers(), loadRequests()]);
    resetReportForm(); resetCompanyForm(); resetFleetForm();
  } catch {
    localStorage.removeItem('carlabToken'); state.token = ''; showLogin();
  }
})();


setInterval(async () => {
  if (!state.token || !state.user) return;
  if (state.activePanel === 'fleet') return; // el usuario está viendo flotas: no interrumpir hasta que navegue o interactúe
  try {
    if (!shouldPauseLiveRefresh()) await loadNotifications();
    if (state.activePanel === 'schedule' && !shouldPauseLiveRefresh('schedule')) await Promise.allSettled([loadSchedules('')]);
    renderExecutiveDeck();
    renderCommandSidePanels();
  } catch {}
}, 15000);
window.guardarCostoAdmin = guardarCostoAdmin;
window.eliminarCostoAdmin = eliminarCostoAdmin;
window.openImageLightbox = openImageLightbox;
window.focusFleetUnit = focusFleetUnit;

els.navCampaignsBtn?.addEventListener('click', async () => { switchPanel('campaigns'); });
els.campaignsRefreshBtn?.addEventListener('click', async () => { await loadCampaigns(state.selectedCampaignId); });
els.campaignEmpresa?.addEventListener('change', () => { if (els.campaignUnitEmpresa && !els.campaignUnitEmpresa.value) els.campaignUnitEmpresa.value = els.campaignEmpresa.value; refreshCampaignUnitOptions(); });
els.campaignUnitEmpresa?.addEventListener('change', refreshCampaignUnitOptions);
els.campaignClearBtn?.addEventListener('click', resetCampaignForm);
els.campaignUnitClearBtn?.addEventListener('click', resetCampaignUnitForm);
els.campaignSaveBtn?.addEventListener('click', async () => { try { const payload = { nombre: els.campaignName?.value.trim(), empresa: els.campaignEmpresa?.value || '', notas: els.campaignNotes?.value.trim() || '' }; if (els.campaignGroupId?.value) await api.updateCampaign(els.campaignGroupId.value, payload); else await api.createCampaign(payload); notify('Campaña guardada.'); resetCampaignForm(); await loadCampaigns(); } catch (error) { notify(error.message, true); } });
els.campaignUnitEvidence?.addEventListener('change', async (e) => { const files=[...(e.target.files||[])]; for (const file of files) { const data=await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); state.campaignUnitEvidence.push(data); } renderCampaignEvidencePreview(); });
els.campaignUnitSaveBtn?.addEventListener('click', async () => { try { if (!state.selectedCampaignId) throw new Error('Selecciona una campaña.'); const payload = { empresa: els.campaignUnitEmpresa?.value || '', numeroEconomico: els.campaignUnitNumero?.value || '', status: els.campaignUnitStatus?.value || 'sin_programar', notas: els.campaignUnitNotes?.value.trim() || '', evidencia: state.campaignUnitEvidence || [] }; if (els.campaignUnitId?.value) await api.updateCampaignUnit(els.campaignUnitId.value, payload); else await api.createCampaignUnit(state.selectedCampaignId, payload); notify('Unidad guardada en campaña.'); resetCampaignUnitForm(); await openCampaign(state.selectedCampaignId); await loadFleet(); } catch (error) { notify(error.message, true); } });

els.servicesConsultBtn?.addEventListener('click', loadServicesReport);
els.servicesCsvBtn?.addEventListener('click', exportServicesCsv);
els.servicesDetailPdfBtn?.addEventListener('click', () => exportServicesPdf('detail'));
els.servicesPeriod?.addEventListener('change', () => { if(els.servicesStartDate) els.servicesStartDate.value=''; if(els.servicesEndDate) els.servicesEndDate.value=''; setServicesDefaultDates(); });
els.authorizedActivitiesAddBtn?.addEventListener('click', () => addAuthorizedActivityRow());
document.querySelectorAll('.aa-quick').forEach(btn => btn.addEventListener('click', () => addAuthorizedActivityRow({ type: btn.dataset.type || 'otro' })));
document.querySelectorAll('.aa-template').forEach(btn => btn.addEventListener('click', () => addAuthorizedActivityRow({ description: btn.dataset.template || '', type: btn.dataset.template === 'Pintura' ? 'pintura' : (btn.dataset.template || '').includes('Diagnóstico') ? 'diagnostico' : (btn.dataset.template || '').includes('refacción') ? 'refaccion' : 'mano_obra' })));
els.authorizedActivitiesClose?.addEventListener('click', closeAuthorizedActivitiesModal);
els.authorizedActivitiesCancelBtn?.addEventListener('click', closeAuthorizedActivitiesModal);
els.authorizedActivitiesSaveBtn?.addEventListener('click', async (event) => { event.preventDefault(); await saveAuthorizedActivities(); });
