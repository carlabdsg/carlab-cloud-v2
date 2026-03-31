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
};

const api = {
  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers: { ...headers, 'Cache-Control': 'no-store, no-cache, max-age=0', Pragma: 'no-cache' }, cache: 'no-store' });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.error || 'Algo salió mal.');
    return data;
  },
  login(email, password) { return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); },
  me() { return this.request('/api/auth/me'); },
  getPublicCompanies() { return this.request('/api/public/companies'); },
  registerOperator(payload) { return this.request('/api/public/register-operator', { method: 'POST', body: JSON.stringify(payload) }); },
  getGarantias() { return this.request('/api/garantias'); },
  createGarantia(payload) { return this.request('/api/garantias', { method: 'POST', body: JSON.stringify(payload) }); },
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
  requestSchedule(id) { return this.request(`/api/garantias/${id}/request-schedule`, { method: 'POST' }); },
  confirmSchedule(id, payload) { return this.request(`/api/schedules/${id}/confirm`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  cancelSchedule(id, payload) { return this.request(`/api/schedules/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  rescheduleSchedule(id, payload) { return this.request(`/api/schedules/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getPartsPending() { return this.request('/api/parts/pending'); },
  updatePart(id, payload) { return this.request(`/api/parts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  getNotifications() { return this.request('/api/notifications'); },

  getFleetSummary() { return this.request('/api/fleet/summary'); },
  getFleetUnits() { return this.request('/api/fleet/units'); },
  getFleetUnit(id) { return this.request(`/api/fleet/units/${id}`); },
  createFleetUnit(payload) { return this.request('/api/fleet/units', { method: 'POST', body: JSON.stringify(payload) }); },
  updateFleetUnit(id, payload) { return this.request(`/api/fleet/units/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  updateFleetStatus(id, payload) { return this.request(`/api/fleet/units/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  deleteFleetUnit(id) { return this.request(`/api/fleet/units/${id}`, { method: 'DELETE' }); },
  createFleetCost(id, payload) { return this.request(`/api/fleet/units/${id}/costs`, { method: 'POST', body: JSON.stringify(payload) }); },

};

const els = {};
function bind() {
  [
    'loginView','dashboardView','loginForm','loginEmail','loginPassword','loginError','registerForm','registerMessage','regNombre','regEmail','regTelefono','regEmpresa','regNumeroEconomico','regPassword',
    'tabLoginBtn','tabRegisterBtn','welcomeText','currentUserName','currentUserEmail','currentRoleBadge','avatarCircle','pageTitle','roleSummaryText','roleBrief','logoutBtn',
    'navBoardBtn','navNewReportBtn','navAnalyticsBtn','navHistoryBtn','navScheduleBtn','navFleetBtn','navPartsBtn','navUsersBtn','navRequestsBtn','navCompaniesBtn','reportFormPanel','usersPanel','requestsPanel','companiesPanel','analyticsPanel','historyPanel','schedulePanel','filtersPanel',
    'reportForm','numeroObra','modelo','numeroEconomico','empresa','kilometraje','contactoNombre','telefono','descripcionFallo','solicitaRefaccion','refaccionFields','detalleRefaccion',
    'evidencias','evidenciasRefaccion','previewEvidencias','previewRefaccion','firmaCanvas','clearSignatureBtn','cancelReportBtn','searchInput','validationFilter','operationalFilter',
    'garantiasList','garantiaCardTemplate','statTotal','statNew','statAccepted','statDone','listTitle','boardKicker','statusLegend','userForm','userId','userNombre','userEmail',
    'userRole','userEmpresa','userTelefono','userPassword','userSubmitBtn','userCancelEditBtn','usersList','emptyState','toast','requestsList','companiesList','companyForm','companyId','companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas','companySubmitBtn','companyCancelEditBtn',
    'topCompanies','topModels','topIncidentTypes','repeatUnits','unitHistoryInput','unitHistorySearchInput','unitHistoryBtn','unitHistoryResult','scheduleDateInput','scheduleRefreshBtn','scheduleList','scheduleCalendar','scheduleAlerts','partsPanel','partsRefreshBtn','partsSummary','partsList','globalRefreshBtn','notifSummary','operatorAppNav','opNavHomeBtn','opNavNewBtn','opNavScheduleBtn','opNavLogoutBtn',
    'navFleetBtn','fleetPanel','fleetEmpresa','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota','fleetPolizaActiva','fleetCampaignActiva','fleetSaveBtn','fleetRefreshBtn','fleetUnitsList','fleetDetail','fleetTotal','fleetOperando','fleetTaller','fleetDetenidas','fleetProgramadas','fleetNewBtn','fleetCancelBtn','fleetFormBox','fleetSearchInput','fleetStatusFilter'
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
function badgeClassValidation(status) { return ({ 'nueva':'badge-new','pendiente de revisión':'badge-review','aceptada':'badge-accepted','rechazada':'badge-rejected' })[status] || 'badge-info'; }
function badgeClassOperational(status) { return ({ 'sin iniciar':'badge-info','en proceso':'badge-progress','espera refacción':'badge-waiting','terminada':'badge-done' })[status] || 'badge-info'; }

function partStatusLabel(status) {
  return ({ pendiente:'Pendiente', asignada:'Asignada', en_compra:'En compra', recibida:'Recibida', instalada:'Instalada' })[status] || 'Pendiente';
}
function partStatusBadge(status) {
  return ({ pendiente:'badge-waiting', asignada:'badge-info', en_compra:'badge-review', recibida:'badge-progress', instalada:'badge-accepted' })[status] || 'badge-waiting';
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

async function reprogramarCita(id) {
  const scheduledFor = window.prompt('Nueva fecha y hora (ejemplo: 2026-04-10 09:30)');
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
    detalleRefaccion: els.detalleRefaccion?.value.trim(), evidencias: state.currentEvidence, evidenciasRefaccion: state.currentRefEvidence, firma: state.hasSignature ? els.firmaCanvas.toDataURL('image/jpeg', 0.95) : '',
  };
}

function roleCopy(role) {
  return {
    admin: { title:'Cabina administrativa', summary:'Control total. Apruebas accesos, administras usuarios, ves analítica y conviertes reincidencias en acción.', panels:[['Gestión total','Usuarios, empresas y solicitudes en una sola vista.'],['Lectura comercial','Detecta patrones por empresa, modelo y unidad.'],['Control operativo','Puedes actuar igual que un operativo cuando haga falta.']], boardKicker:'ADMIN', listTitle:'Bandeja general del sistema', legend:'Portal corporativo con control total, solicitudes y lectura comercial.' },
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
  document.body.classList.toggle('owner-portal', state.user?.role === 'supervisor_flotas');
}

function setActiveNav(activeBtn) {
  [els.navBoardBtn,els.navNewReportBtn,els.navAnalyticsBtn,els.navHistoryBtn,els.navScheduleBtn,els.navUsersBtn,els.navRequestsBtn,els.navCompaniesBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
  if (activeBtn && !activeBtn.classList.contains('hidden')) activeBtn.classList.add('active');
}

function updateOperatorAppNav(panel) {
  const operatorMode = state.user?.role === 'operador';
  document.body.classList.toggle('operator-mode', !!operatorMode);
  els.operatorAppNav?.classList.toggle('hidden', !operatorMode);
  if (!operatorMode) return;
  [els.opNavHomeBtn, els.opNavNewBtn, els.opNavScheduleBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
  if (panel === 'board') els.opNavHomeBtn?.classList.add('active');
  if (panel === 'report') els.opNavNewBtn?.classList.add('active');
  if (panel === 'schedule') els.opNavScheduleBtn?.classList.add('active');
}
function switchPanel(panel) {
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
  document.body.dataset.panel = panel;
  const board = panel === 'board';
  els.filtersPanel?.classList.toggle('hidden', !board);
  if (panel === 'schedule') loadSchedules('');
  if (panel === 'fleet') loadFleet();
  if (panel === 'parts') loadPartsPending();
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
  updateHeaderForRole(); switchPanel(state.user?.role === 'operador' ? 'report' : 'board');
}
function showLogin() { els.dashboardView?.classList.add('hidden'); els.loginView?.classList.remove('hidden'); document.body.classList.remove('executive-mode','operator-mode'); document.body.dataset.role=''; document.body.dataset.panel='login'; }

function filteredGarantias() {
  const search = els.searchInput?.value.trim().toLowerCase() || '';
  const validation = els.validationFilter?.value || 'todos';
  const operational = els.operationalFilter?.value || 'todos';
  return state.garantias.filter(item => {
    const blob = `${item.folio || ''} ${item.numeroObra} ${item.numeroEconomico} ${item.empresa} ${item.modelo} ${item.descripcionFallo} ${item.contactoNombre || ''} ${item.telefono || ''} ${item.kilometraje || ''}`.toLowerCase();
    return (!search || blob.includes(search)) && (validation === 'todos' || item.estatusValidacion === validation) && (operational === 'todos' || item.estatusOperativo === operational);
  });
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
      const count = state.schedules.filter(item => {
        const raw = item.scheduledFor || item.proposedAt || item.requestedAt;
        return raw && String(raw).slice(0,10) === iso;
      }).length;
      const cls = iso === selectedDate ? 'calendar-cell active' : 'calendar-cell';
      days.push(`<button type="button" class="${cls}" data-date="${iso}"><span>${d}</span>${count ? `<strong>${count}</strong>` : '<em>·</em>'}</button>`);
    }
    const chips = groupedDates.length
      ? `<div class="schedule-date-chips">${groupedDates.map(iso => {
          const label = new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
          const active = iso === selectedDate ? 'active' : '';
          return `<button type="button" class="date-chip ${active}" data-date="${iso}"><span class="dot"></span>${label}</button>`;
        }).join('')}</div>`
      : '<div class="empty-state compact-empty"><strong>Sin fechas registradas.</strong><span>Cuando el operador proponga o se confirme una cita, aparecerá aquí.</span></div>';
    els.scheduleCalendar.innerHTML = `
      <div class="schedule-summary">
        <div class="stat"><span>Total</span><strong>${total}</strong></div>
        <div class="stat"><span>Propuestas</span><strong>${proposed}</strong></div>
        <div class="stat"><span>Confirmadas</span><strong>${confirmed}</strong></div>
        <div class="stat"><span>Por responder</span><strong>${waiting}</strong></div>
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
    els.scheduleList.innerHTML = '<div class="empty-state"><strong>Sin unidades programadas para esta fecha.</strong><span>Las propuestas y citas aparecerán automáticamente aquí.</span></div>';
    return;
  }

  schedulesForDay.forEach(item => {
    const row = document.createElement('div');
    row.className = 'table-row schedule-row';
    const whenText = item.originalText || fmtDate(item.scheduledFor || item.proposedAt || item.requestedAt);
    row.innerHTML = `<div><strong>${escapeHtml(item.folio || '—')} · Unidad ${escapeHtml(item.unidad || '—')}</strong><div class="small muted">${escapeHtml(item.empresa || '—')} · ${escapeHtml(item.contactoNombre || '—')}</div></div><div><span class="badge ${item.status === 'confirmed' ? 'badge-accepted' : item.status === 'proposed' ? 'badge-review' : 'badge-info'}">${escapeHtml(item.status)}</span></div><div>${escapeHtml(whenText)}</div><div class="action-row"></div>`;
    const actions = row.querySelector('.action-row');
    if (isRole('admin','operativo') && item.status === 'proposed') {
      actions.appendChild(button('Confirmar', 'btn btn-primary', async () => {
        try {
          await api.confirmSchedule(item.id, { status:'confirmed', scheduledFor: item.scheduledFor || item.proposedAt, notes: item.notes || '' });
          notify('Cita confirmada.'); await loadSchedules(selectedDate); await loadNotifications();
        } catch (error) {
          notify(error.message, true);
        }
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
    if (isRole('admin','operativo','supervisor_flotas') && ['proposed','confirmed','waiting_operator'].includes(item.status)) {
      actions.appendChild(button('Reprogramar', 'btn btn-secondary', async () => { await reprogramarCita(item.id); }));
      actions.appendChild(button('Cancelar', 'btn btn-ghost', async () => { await cancelarCita(item.id); }));
    }
    els.scheduleList.appendChild(row);
  });
}



async function loadPartsPending() {
  if (!isRole('admin','supervisor_flotas')) return;
  try {
    state.partsPending = await api.getPartsPending();
    renderPartsPending();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderPartsPending() {
  if (!els.partsList) return;
  const items = state.partsPending || [];
  const total = items.length;
  const empresas = [...new Set(items.map(item => item.empresa).filter(Boolean))].length;
  const unidades = [...new Set(items.map(item => item.numeroEconomico).filter(Boolean))].length;
  const asignadas = items.filter(item => (item.refaccionStatus || 'pendiente') !== 'pendiente').length;
  if (els.partsSummary) {
    els.partsSummary.innerHTML = `
      <article class="analytic-card highlight-card"><strong>Pendientes</strong><div class="metric-line">${total}</div></article>
      <article class="analytic-card"><strong>Unidades</strong><div class="metric-line">${unidades}</div></article>
      <article class="analytic-card"><strong>Empresas</strong><div class="metric-line">${empresas}</div></article>
      <article class="analytic-card"><strong>Asignadas</strong><div class="metric-line">${asignadas}</div></article>
    `;
  }
  if (!items.length) {
    els.partsList.innerHTML = '<div class="parts-empty"><strong>No hay refacciones pendientes.</strong><div>Cuando una unidad quede en espera de pieza o se solicite refacción, aparecerá aquí.</div></div>';
    return;
  }
  els.partsList.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'parts-card';
    const currentStatus = item.refaccionStatus || 'pendiente';
    card.innerHTML = `
      <div class="parts-card-head">
        <div>
          <div class="kicker">${escapeHtml(item.empresa || '—')}</div>
          <h4>Unidad ${escapeHtml(item.numeroEconomico || '—')}</h4>
        </div>
        <span class="badge ${partStatusBadge(currentStatus)}">${partStatusLabel(currentStatus)}</span>
      </div>
      <div class="parts-piece">${escapeHtml(item.detalleRefaccion || 'Refacción pendiente sin detalle específico')}</div>
      <div class="parts-meta">
        <div><strong>Folio</strong>${escapeHtml(item.folio || '—')}</div>
        <div><strong>Estado operativo</strong>${escapeHtml(item.estatusOperativo || 'sin iniciar')}</div>
        <div><strong>Modelo</strong>${escapeHtml(item.modelo || '—')}</div>
        <div><strong>Asignada</strong>${escapeHtml(item.refaccionAsignada || 'Sin asignar')}</div>
      </div>
      ${isRole('admin') ? `
      <div class="parts-admin-box">
        <div class="parts-admin-grid">
          <div>
            <label>Refacción solicitada</label>
            <textarea class="parts-input js-part-detail" rows="2">${escapeHtml(item.detalleRefaccion || '')}</textarea>
          </div>
          <div>
            <label>Refacción asignada</label>
            <input class="parts-input js-part-assign" value="${escapeHtml(item.refaccionAsignada || '')}" placeholder="Ej. Juego de lunas lateral izquierda" />
          </div>
          <div>
            <label>Estatus</label>
            <select class="parts-input js-part-status">
              <option value="pendiente" ${currentStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="asignada" ${currentStatus === 'asignada' ? 'selected' : ''}>Asignada</option>
              <option value="en_compra" ${currentStatus === 'en_compra' ? 'selected' : ''}>En compra</option>
              <option value="recibida" ${currentStatus === 'recibida' ? 'selected' : ''}>Recibida</option>
              <option value="instalada" ${currentStatus === 'instalada' ? 'selected' : ''}>Instalada</option>
            </select>
          </div>
          <div class="parts-admin-actions">
            <button type="button" class="btn btn-primary js-part-save">Guardar</button>
          </div>
        </div>
      </div>` : ''}
    `;
    if (isRole('admin')) {
      card.querySelector('.js-part-save')?.addEventListener('click', async () => {
        try {
          await api.updatePart(item.id, {
            detalleRefaccion: card.querySelector('.js-part-detail')?.value || '',
            refaccionAsignada: card.querySelector('.js-part-assign')?.value || '',
            refaccionStatus: card.querySelector('.js-part-status')?.value || 'pendiente'
          });
          notify('Refacción actualizada.');
          await loadPartsPending();
          await loadNotifications();
        } catch (error) { notify(error.message, true); }
      });
    }
    els.partsList.appendChild(card);
  });
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
    const [summary, units] = await Promise.all([api.getFleetSummary(), api.getFleetUnits()]);
    state.fleetSummary = summary || state.fleetSummary;
    state.fleetUnits = units || [];
    renderFleet();
  } catch (error) {
    notify(error.message, true);
  }
}

function renderFleet() {
  if (els.fleetTotal) els.fleetTotal.textContent = state.fleetSummary.total || 0;
  if (els.fleetOperando) els.fleetOperando.textContent = state.fleetSummary.operando || 0;
  if (els.fleetTaller) els.fleetTaller.textContent = state.fleetSummary.enTaller || 0;
  if (els.fleetDetenidas) els.fleetDetenidas.textContent = state.fleetSummary.detenidas || 0;
  if (els.fleetProgramadas) els.fleetProgramadas.textContent = state.fleetSummary.programadas || 0;

  if (els.fleetUnitsList) els.fleetUnitsList.innerHTML = '';
  const fleetQuery = normalizeText(els.fleetSearchInput?.value || '');
  const fleetStatus = els.fleetStatusFilter?.value || 'todos';
  const visibleUnits = state.fleetUnits.filter(unit => {
    const sem = fleetSemaforo(unit);
    const hayTexto = !fleetQuery || normalizeText([unit.numeroEconomico, unit.empresa, unit.marca, unit.modelo, unit.numeroObra, unit.nombreFlota].join(' ')).includes(fleetQuery);
    const hayEstado = fleetStatus === 'todos' || sem.key === fleetStatus;
    return hayTexto && hayEstado;
  });
  if (!visibleUnits.length && els.fleetUnitsList) {
    els.fleetUnitsList.innerHTML = '<div class="empty-state"><strong>Sin coincidencias.</strong><span>Ajusta búsqueda o estado para encontrar la unidad correcta.</span></div>';
  }
  visibleUnits.forEach(unit => {
    const sem = fleetSemaforo(unit);
    const card = document.createElement('article');
    card.className = 'card fleet-card';
    card.innerHTML = `
      <div class="fleet-card-head">
        <div>
          <div class="fleet-card-kicker">${escapeHtml(unit.empresa || '—')}</div>
          <h4>${escapeHtml(unit.numeroEconomico)}</h4>
          <p class="meta">${escapeHtml(unit.marca || '—')}${unit.modelo ? ' · ' + escapeHtml(unit.modelo) : ''}${unit.anio ? ' · ' + escapeHtml(unit.anio) : ''}</p>
        </div>
        <span class="fleet-dot ${sem.cls}">${sem.label}</span>
      </div>
      <div class="fleet-card-strip">
        <div><span>Reportes</span><strong>${unit.reportesCount || 0}</strong></div>
        <div><span>Costo</span><strong>${money(unit.costoTotal || 0)}</strong></div>
        <div><span>Último movimiento</span><strong>${unit.lastReportAt ? fmtDate(unit.lastReportAt) : 'Sin movimiento'}</strong></div>
      </div>
      <div class="action-area fleet-card-actions"></div>
    `;
    const act = card.querySelector('.action-area');
    act.appendChild(button('Ver unidad', 'btn btn-secondary', async () => {
      try {
        state.selectedFleetUnit = await api.getFleetUnit(unit.id);
        renderFleetDetail();
      } catch (error) { notify(error.message, true); }
    }));
    if (isRole('admin')) {
      act.appendChild(button('Editar', 'btn btn-ghost', () => beginFleetEdit(unit)));
      act.appendChild(button('Eliminar', 'btn btn-ghost', async () => {
        if (!confirm(`¿Eliminar unidad ${unit.numeroEconomico}?`)) return;
        try {
          await api.deleteFleetUnit(unit.id);
          if (state.selectedFleetUnit?.unit?.id === unit.id) state.selectedFleetUnit = null;
          resetFleetForm();
          await loadFleet();
          notify('Unidad eliminada.');
        } catch (error) { notify(error.message, true); }
      }));
    }
    els.fleetUnitsList?.appendChild(card);
  });
  renderFleetDetail();
}

function renderFleetDetail() {
  if (!els.fleetDetail) return;
  const data = state.selectedFleetUnit;
  if (!data?.unit) {
    els.fleetDetail.innerHTML = '<div class="muted">Selecciona una unidad para ver historial, reportes y costos.</div>';
    return;
  }
  const u = data.unit;
  const sem = fleetSemaforo(u);
  const reports = (data.reports || []).map(r => `
    <div class="table-row">
      <div><strong>${escapeHtml(r.folio || 'GAR-—')}</strong><div class="small muted">${escapeHtml(r.descripcionFallo || 'Sin descripción')}</div></div>
      <div><span class="badge ${badgeClassValidation(r.estatusValidacion || 'nueva')}">${escapeHtml(r.estatusValidacion || '—')}</span></div>
      <div><span class="badge ${badgeClassOperational(r.estatusOperativo || 'sin iniciar')}">${escapeHtml(r.estatusOperativo || '—')}</span></div>
    </div>
  `).join('') || '<div class="muted">Sin reportes ligados.</div>';
  const costs = (data.costs || []).map(c => `
    <div class="table-row">
      <div><strong>${escapeHtml(c.tipo)}</strong><div class="small muted">${escapeHtml(c.concepto || 'Sin concepto')}</div></div>
      <div>${money(c.monto)}</div>
      <div>${escapeHtml(c.createdByNombre || '—')}</div>
    </div>
  `).join('') || '<div class="muted">Sin costos capturados.</div>';
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
  const timeline = (data.reports || []).slice(0,6).map(r => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(r.folio || 'GAR-—')}</strong><p>${escapeHtml(r.descripcionFallo || 'Sin descripción')}</p><small>${fmtDate(r.createdAt)} · ${escapeHtml(r.estatusOperativo || 'sin iniciar')}</small></div></div>`).join('') || '<div class="muted">Sin movimientos recientes.</div>';
  els.fleetDetail.innerHTML = `
    <div class="panel-head fleet-detail-head">
      <div><div class="topbar-kicker">EXPEDIENTE DE UNIDAD</div><h3>${escapeHtml(u.numeroEconomico)} · ${escapeHtml(u.empresa)}</h3><p class="muted">Lectura patrimonial, operativa y de costo en una sola vista.</p></div>
      <div class="stack-inline">${isRole('admin') ? '<button id="fleetEditInlineBtn" class="btn btn-ghost" type="button">Editar</button><button id="fleetDeleteInlineBtn" class="btn btn-ghost" type="button">Eliminar</button>' : ''}<span class="fleet-dot '+sem.cls+'">'+sem.label+'</span></div>
    </div>
    <div class="fleet-hero">
      <div class="fleet-hero-main">
        <div class="mini-grid fleet-meta-grid">
          <div><span class="label">Costo total</span><strong>${money(u.costoTotal)}</strong></div>
          <div><span class="label">Marca</span><strong>${escapeHtml(u.marca || '—')}</strong></div>
          <div><span class="label">Modelo</span><strong>${escapeHtml(u.modelo || '—')}</strong></div>
          <div><span class="label">Año</span><strong>${escapeHtml(u.anio || '—')}</strong></div>
          <div><span class="label">KM</span><strong>${escapeHtml(u.kilometraje || '—')}</strong></div>
          <div><span class="label">Póliza</span><strong>${u.polizaActiva ? 'Activa' : 'No'}</strong></div>
          <div><span class="label">Campaña</span><strong>${u.campaignActiva ? 'Sí' : 'No'}</strong></div>
          <div><span class="label">Refacciones</span><strong>${money(u.costoRefacciones)}</strong></div>
          <div><span class="label">Mano de obra</span><strong>${money(u.costoManoObra)}</strong></div>
        </div>
        ${statusControl}
        ${costForm}
      </div>
      <aside class="fleet-timeline-box"><div class="topbar-kicker">MOVIMIENTO RECIENTE</div>${timeline}</aside>
    </div>
    <div class="fleet-columns">
      <section><div class="topbar-kicker">REPORTES</div><div class="table-list compact-list">${reports}</div></section>
      <section><div class="topbar-kicker">COSTOS</div><div class="table-list compact-list">${costs}</div></section>
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

function renderGarantias() {
  updateStats(); renderAnalytics();
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
    const area = node.querySelector('.action-area'); const baseRow = document.createElement('div'); baseRow.className = 'action-row'; baseRow.appendChild(button('PDF', 'btn btn-ghost', () => exportPdf(item))); if (isRole('admin','operativo','supervisor')) baseRow.appendChild(button('Historial', 'btn btn-ghost', () => showAudit(item))); if (isRole('admin')) baseRow.appendChild(button('Eliminar', 'btn btn-ghost', async () => { if (!confirm(`¿Eliminar la orden ${item.numeroObra} de la unidad ${item.numeroEconomico}?`)) return; try { await api.deleteGarantia(item.id); notify('Orden eliminada.'); await loadGarantias(); } catch (error) { notify(error.message, true); } })); area.appendChild(baseRow);
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
      reviewBox.querySelector('.reviewBtn').addEventListener('click', async () => {
        try {
          const status = reviewBox.querySelector('.reviewStatus').value; const text = reviewBox.querySelector('.reviewReason').value.trim();
          await api.reviewGarantia(item.id, { estatusValidacion: status, observacionesOperativo: status !== 'rechazada' ? text : '', motivoDecision: status === 'rechazada' ? text : '' });
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
        operationalBox.querySelector('.opBtn').addEventListener('click', async () => {
          try { await api.updateOperational(item.id, { estatusOperativo: operationalBox.querySelector('.opStatus').value, observacionesOperativo: operationalBox.querySelector('.opNotes').value.trim() }); notify('Flujo actualizado.'); await loadGarantias(); }
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

els.logoutBtn?.addEventListener('click', () => { localStorage.removeItem('carlabToken'); state.token = ''; state.user = null; showLogin(); });
els.globalRefreshBtn?.addEventListener('click', async () => { await Promise.all([loadGarantias(), loadSchedules(''), loadNotifications(), loadFleet()]); notify('Datos actualizados.'); });
els.opNavHomeBtn?.addEventListener('click', () => switchPanel('board'));
els.opNavNewBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.opNavScheduleBtn?.addEventListener('click', async () => { await loadSchedules(''); switchPanel('schedule'); });
els.opNavLogoutBtn?.addEventListener('click', () => { localStorage.removeItem('carlabToken'); state.token = ''; state.user = null; showLogin(); });
els.navBoardBtn?.addEventListener('click', () => switchPanel('board'));
els.navNewReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.navAnalyticsBtn?.addEventListener('click', () => switchPanel('analytics'));
els.navHistoryBtn?.addEventListener('click', () => switchPanel('history'));
els.navScheduleBtn?.addEventListener('click', async () => { await loadSchedules(''); switchPanel('schedule'); });
els.navFleetBtn?.addEventListener('click', async () => { await loadFleet(); switchPanel('fleet'); });
els.navPartsBtn?.addEventListener('click', async () => { await loadPartsPending(); switchPanel('parts'); });
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

els.fleetRefreshBtn?.addEventListener('click', async () => { await loadFleet(); switchPanel('fleet'); });
els.partsRefreshBtn?.addEventListener('click', async () => { await loadPartsPending(); switchPanel('parts'); });
els.fleetSearchInput?.addEventListener('input', renderFleet);
els.fleetStatusFilter?.addEventListener('change', renderFleet);
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
    resetFleetForm();
    await loadFleet();
  } catch (error) { notify(error.message, true); }
});


els.reportForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api.createGarantia(reportPayload()); notify('Reporte enviado. Ya cayó al sistema.'); resetReportForm(); switchPanel('board'); await loadGarantias(); }
  catch (error) { notify(error.message, true); }
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
    if (isRole('admin','supervisor_flotas')) await Promise.allSettled([loadPartsPending()]);
    resetReportForm(); resetCompanyForm(); resetFleetForm();
  } catch {
    localStorage.removeItem('carlabToken'); state.token = ''; showLogin();
  }
})();


setInterval(async () => {
  if (!state.token || !state.user) return;
  try {
    await loadNotifications();
    if (['board','schedule'].includes(state.activePanel)) await Promise.allSettled([loadGarantias(), loadSchedules('')]);
    if (state.activePanel === 'fleet' && isRole('admin','operativo','supervisor_flotas')) await loadFleet();
    if (state.activePanel === 'parts' && isRole('admin','supervisor_flotas')) await loadPartsPending();
  } catch {}
}, 5000);
