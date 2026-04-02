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
  inventoryParts: [],
  inventoryKardex: [],
  editingGarantiaId: '',
  editingFirmaOriginal: '',
  boardDirtyIds: new Set(),
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
  requestSchedule(id) { return this.request(`/api/garantias/${id}/request-schedule`, { method: 'POST' }); },
  confirmSchedule(id, payload) { return this.request(`/api/schedules/${id}/confirm`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  cancelSchedule(id, payload) { return this.request(`/api/schedules/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  rescheduleSchedule(id, payload) { return this.request(`/api/schedules/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getPartsPending() { return this.request('/api/parts/pending'); },
  updateParts(id, payload) { return this.request(`/api/garantias/${id}/parts`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getIndependentPartsRequests() { return this.request('/api/parts/requests'); },
  createIndependentPartsRequest(payload) { return this.request('/api/parts/requests', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateIndependentPartsRequest(id, payload) { return this.request(`/api/parts/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  getInventoryParts() { return this.request('/api/inventory/parts'); },
  createInventoryPart(payload) { return this.request('/api/inventory/parts', { method: 'POST', body: JSON.stringify(payload || {}) }); },
  updateInventoryPart(id, payload) { return this.request(`/api/inventory/parts/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }); },
  receiveInventoryPart(id, payload) { return this.request(`/api/inventory/parts/${id}/entry`, { method: 'POST', body: JSON.stringify(payload || {}) }); },
  installInventoryPart(id, payload) { return this.request(`/api/inventory/parts/${id}/install`, { method: 'POST', body: JSON.stringify(payload || {}) }); },
  getInventoryKardex() { return this.request('/api/inventory/kardex'); },
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
    'navFleetBtn','fleetPanel','fleetEmpresa','fleetNumeroEconomico','fleetNumeroObra','fleetMarca','fleetModelo','fleetAnio','fleetKilometraje','fleetNombreFlota','fleetPolizaActiva','fleetCampaignActiva','fleetSaveBtn','fleetRefreshBtn','fleetUnitsList','fleetDetail','fleetTotal','fleetOperando','fleetTaller','fleetDetenidas','fleetProgramadas','fleetNewBtn','fleetCancelBtn','fleetFormBox','fleetSearchInput','fleetStatusFilter','fleetOpsHub'
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
  if (state.user?.role === 'supervisor_flotas' && ['users','requests','companies','report'].includes(panel)) panel = 'fleet';
  if (state.user?.role === 'supervisor' && ['users','requests','companies','fleet','parts','report'].includes(panel)) panel = 'board';
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
  els.navPartsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas','operativo'));
  if (state.user?.role === 'supervisor') {
    els.navFleetBtn?.classList.add('hidden');
    els.navPartsBtn?.classList.add('hidden');
    els.navUsersBtn?.classList.add('hidden');
    els.navRequestsBtn?.classList.add('hidden');
    els.navCompaniesBtn?.classList.add('hidden');
  }
  if (state.user?.role === 'supervisor_flotas') {
    els.navUsersBtn?.classList.add('hidden');
    els.navRequestsBtn?.classList.add('hidden');
    els.navCompaniesBtn?.classList.add('hidden');
    els.navNewReportBtn?.classList.add('hidden');
  }
  els.navPartsBtn?.classList.toggle('hidden', !isRole('admin','supervisor_flotas'));
  updateHeaderForRole(); switchPanel(state.user?.role === 'operador' ? 'report' : state.user?.role === 'supervisor_flotas' ? 'fleet' : 'board');
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
          if (String(error.message || '').includes('ocupado')) notify(error.message, true);
          else notify(error.message, true);
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



async function loadInventoryParts() {
  if (!isRole('admin','supervisor_flotas')) return;
  try { state.inventoryParts = await api.getInventoryParts(); } catch { state.inventoryParts = []; }
}
async function loadInventoryKardex() {
  if (!isRole('admin','supervisor_flotas')) return;
  try { state.inventoryKardex = await api.getInventoryKardex(); } catch { state.inventoryKardex = []; }
}
async function crearRefaccionInventario() {
  try {
    const nombre = window.prompt('Nombre de la refacción:');
    if (!nombre) return;
    const numeroParte = window.prompt('Número de parte (opcional):') || '';
    const marca = window.prompt('Marca (opcional):') || '';
    const categoria = window.prompt('Categoría (opcional):') || '';
    const proveedor = window.prompt('Proveedor (opcional):') || '';
    const stockActual = Number(window.prompt('Stock inicial:', '0') || 0);
    const stockMinimo = Number(window.prompt('Stock mínimo:', '0') || 0);
    const costoCompra = Number(window.prompt('Costo compra unitario:', '0') || 0);
    const precioVenta = Number(window.prompt('Precio venta manual:', '0') || 0);
    const fotoUrl = window.prompt('Imagen opcional de la refacción (URL/base64):') || '';
    const notas = window.prompt('Notas (opcional):') || '';
    await api.createInventoryPart({ nombre, numeroParte, marca, categoria, proveedor, stockActual, stockMinimo, costoCompra, precioVenta, fotoUrl, notas });
    notify('Refacción agregada al inventario.');
    await Promise.all([loadInventoryParts(), loadInventoryKardex()]);
    renderPartsPending();
  } catch (error) { notify(error.message, true); }
}
async function editarRefaccionInventario(item) {
  try {
    const nombre = window.prompt('Nombre:', item.nombre || '');
    if (!nombre) return;
    const numeroParte = window.prompt('Número de parte:', item.numeroParte || '') || '';
    const marca = window.prompt('Marca:', item.marca || '') || '';
    const categoria = window.prompt('Categoría:', item.categoria || '') || '';
    const proveedor = window.prompt('Proveedor:', item.proveedor || '') || '';
    const stockMinimo = Number(window.prompt('Stock mínimo:', String(item.stockMinimo || 0)) || 0);
    const costoCompra = Number(window.prompt('Costo compra:', String(item.costoCompra || 0)) || 0);
    const precioVenta = Number(window.prompt('Precio venta manual:', String(item.precioVenta || 0)) || 0);
    const fotoUrl = window.prompt('Imagen (URL/base64):', item.fotoUrl || '') || '';
    const notas = window.prompt('Notas:', item.notas || '') || '';
    await api.updateInventoryPart(item.id, { nombre, numeroParte, marca, categoria, proveedor, stockMinimo, costoCompra, precioVenta, fotoUrl, notas, activo: true });
    notify('Refacción actualizada.');
    await Promise.all([loadInventoryParts(), loadInventoryKardex()]);
    renderPartsPending();
  } catch (error) { notify(error.message, true); }
}
async function registrarEntradaInventario(item) {
  try {
    const cantidad = Number(window.prompt('Cantidad recibida:', '1') || 0);
    if (!cantidad) return;
    const costoUnitario = Number(window.prompt('Costo compra unitario:', String(item.costoCompra || 0)) || 0);
    const proveedor = window.prompt('Proveedor:', item.proveedor || '') || '';
    const fotoUrl = window.prompt('Imagen opcional de esta entrada (URL/base64):', item.fotoUrl || '') || '';
    const notas = window.prompt('Notas (opcional):', '') || '';
    await api.receiveInventoryPart(item.id, { cantidad, costoUnitario, proveedor, fotoUrl, notas });
    notify('Entrada registrada.');
    await Promise.all([loadInventoryParts(), loadInventoryKardex()]);
    renderPartsPending();
  } catch (error) { notify(error.message, true); }
}
async function instalarDesdeInventario(item) {
  try {
    const empresa = window.prompt('Empresa a la que se instalará:');
    if (!empresa) return;
    const numeroEconomico = window.prompt('Número económico de unidad:');
    if (!numeroEconomico) return;
    const garantiaId = window.prompt('ID del reporte ligado (opcional):') || '';
    const cantidad = Number(window.prompt('Cantidad a instalar:', '1') || 0);
    if (!cantidad) return;
    const costoCompra = Number(window.prompt('Costo compra unitario:', String(item.costoCompra || 0)) || 0);
    const precioVenta = Number(window.prompt('Precio venta manual:', String(item.precioVenta || 0)) || 0);
    const instaladoPor = window.prompt('Instalado por:', state.user?.nombre || '') || '';
    const notas = window.prompt('Notas (opcional):', '') || '';
    await api.installInventoryPart(item.id, { empresa, numeroEconomico, garantiaId, cantidad, costoCompra, precioVenta, instaladoPor, notas });
    notify('Refacción instalada y ligada a unidad.');
    await Promise.all([loadInventoryParts(), loadInventoryKardex(), loadPartsPending(true), loadFleet()]);
    if (state.selectedFleetUnit?.unit?.empresa === empresa && state.selectedFleetUnit?.unit?.numeroEconomico === numeroEconomico) {
      state.selectedFleetUnit = await api.getFleetUnit(state.selectedFleetUnit.unit.id);
      renderFleetDetail();
    }
    renderPartsPending();
  } catch (error) { notify(error.message, true); }
}
function renderFleetOpsHub(visibleUnits) {
  if (!els.fleetOpsHub) return;
  if (state.user?.role !== 'supervisor_flotas') {
    els.fleetOpsHub.innerHTML = '';
    els.fleetOpsHub.classList.add('hidden');
    return;
  }
  els.fleetOpsHub.classList.remove('hidden');
  const all = Array.isArray(state.fleetUnits) ? state.fleetUnits : [];
  const counts = { operando: 0, programada: 0, detenida: 0, en_taller: 0 };
  all.forEach(unit => {
    const sem = fleetSemaforo(unit);
    if (counts[sem.key] !== undefined) counts[sem.key] += 1;
  });
  const total = all.length || 0;
  const dominant = Object.entries(counts).sort((a,b) => b[1]-a[1])[0] || ['operando',0];
  const dominantMap = {
    operando: { label: 'Flota estable', cls: 'ok', tone: 'green' },
    programada: { label: 'Carga por programar', cls: 'warn', tone: 'orange' },
    detenida: { label: 'Pendientes críticos', cls: 'alert', tone: 'amber' },
    en_taller: { label: 'Unidades en taller', cls: 'danger', tone: 'red' }
  };
  const dominantInfo = dominantMap[dominant[0]];
  const activeFilter = els.fleetStatusFilter?.value || 'todos';
  const bar = key => {
    if (!total) return 0;
    const pct = Math.round((counts[key] / total) * 100);
    return Math.max(6, pct);
  };
  els.fleetOpsHub.innerHTML = `
    <section class="ops-orbit-card ops-${dominantInfo.tone}">
      <div class="ops-orbit-main">
        <div class="ops-kicker">CENTRO DE OPERACIONES</div>
        <h3>Supervisor de flotas</h3>
        <p>Una cabina visual para leer presión operativa, unidades detenidas y piezas instaladas en tiempo real.</p>
        <div class="ops-dominant-pill ${dominantInfo.cls}">
          <span class="ops-dot"></span>
          <strong>${dominantInfo.label}</strong>
          <small>${dominant[1]} de ${total} unidades</small>
        </div>
      </div>
      <div class="ops-radar-wrap">
        <div class="ops-radar-track">
          <span class="seg seg-green" style="width:${bar('operando')}%"></span>
          <span class="seg seg-orange" style="width:${bar('programada')}%"></span>
          <span class="seg seg-amber" style="width:${bar('detenida')}%"></span>
          <span class="seg seg-red" style="width:${bar('en_taller')}%"></span>
        </div>
        <div class="ops-pills-grid">
          <button type="button" class="ops-pill ${activeFilter === 'todos' ? 'active' : ''}" data-ops-filter="todos"><span>Total</span><strong>${total}</strong></button>
          <button type="button" class="ops-pill green ${activeFilter === 'operando' ? 'active' : ''}" data-ops-filter="operando"><span>🟢 Sin pendiente</span><strong>${counts.operando}</strong></button>
          <button type="button" class="ops-pill orange ${activeFilter === 'programada' ? 'active' : ''}" data-ops-filter="programada"><span>🟠 Programar</span><strong>${counts.programada}</strong></button>
          <button type="button" class="ops-pill amber ${activeFilter === 'detenida' ? 'active' : ''}" data-ops-filter="detenida"><span>🟠 Refacción / detenida</span><strong>${counts.detenida}</strong></button>
          <button type="button" class="ops-pill red ${activeFilter === 'en_taller' ? 'active' : ''}" data-ops-filter="en_taller"><span>🔴 Taller</span><strong>${counts.en_taller}</strong></button>
        </div>
      </div>
    </section>
  `;
  els.fleetOpsHub.querySelectorAll('[data-ops-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (els.fleetStatusFilter) {
        els.fleetStatusFilter.value = btn.dataset.opsFilter || 'todos';
        renderFleet();
      }
    });
  });
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

async function crearSolicitudIndependienteRefaccion() {
  try {
    const empresa = window.prompt('Empresa:');
    if (!empresa) return;
    const numeroEconomico = window.prompt('Número económico (opcional):') || '';
    const solicitud = window.prompt('Refacción solicitada:');
    if (!solicitud) return;
    const notes = window.prompt('Notas (opcional):') || '';
    await api.createIndependentPartsRequest({ empresa, numeroEconomico, solicitud, notes });
    notify('Solicitud de refacción creada.');
    await cargarSolicitudesIndependientes();
    if (state.activePanel === 'parts') renderPartsPending();
  } catch (error) {
    notify(error.message, true);
  }
}

async function loadPartsPending(force = false) {
  if (!isRole('admin','supervisor_flotas')) return;
  if (!force && state.partsDirtyIds.size) return;
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
  const pendingItems = state.partsPending || [];
  const openRequests = (state.independentPartsRequests || []).filter(req => !['instalada','cerrada','cancelada'].includes(String(req.status || '').toLowerCase()));
  const inventory = state.inventoryParts || [];
  const kardex = state.inventoryKardex || [];

  const lowStock = inventory.filter(p => Number(p.stockActual || 0) <= Number(p.stockMinimo || 0)).length;
  const photos = inventory.filter(p => p.fotoUrl).length;

  if (els.partsSummary) {
    els.partsSummary.innerHTML = `
      <article class="parts-summary-card"><strong>Pendientes</strong><span>${pendingItems.length}</span></article>
      <article class="parts-summary-card"><strong>Inventario</strong><span>${inventory.length}</span></article>
      <article class="parts-summary-card"><strong>Kardex</strong><span>${kardex.length}</span></article>
      <article class="parts-summary-card"><strong>Stock bajo</strong><span>${lowStock}</span></article>
      <article class="parts-summary-card"><strong>Con foto</strong><span>${photos}</span></article>
    `;
    if (isRole('admin','supervisor_flotas')) {
      const actions = document.createElement('div');
      actions.className = 'parts-actions-row';
      actions.innerHTML = `${isRole('admin') ? `<button id="newInventoryPartBtn" class="btn btn-secondary" type="button">Nueva refacción</button>` : ``}<button id="newIndependentPartBtn" class="btn btn-primary" type="button">Solicitar refacción</button>`;
      els.partsSummary.appendChild(actions);
      document.getElementById('newIndependentPartBtn')?.addEventListener('click', crearSolicitudIndependienteRefaccion);
      document.getElementById('newInventoryPartBtn')?.addEventListener('click', crearRefaccionInventario);
    }
  }

  const inventoryCards = inventory.slice(0, 30).map(part => `
    <article class="inventory-card">
      <div class="inventory-thumb">${part.fotoUrl ? `<img src="${escapeHtml(part.fotoUrl)}" alt="${escapeHtml(part.nombre)}" />` : `<div class="inventory-thumb-empty">Sin foto</div>`}</div>
      <div class="inventory-copy">
        <strong>${escapeHtml(part.nombre || '')}</strong>
        <span>${escapeHtml(part.numeroParte || 'Sin número de parte')}</span>
        <span>${escapeHtml(part.marca || 'Sin marca')} · ${escapeHtml(part.categoria || 'Sin categoría')}</span>
        <span>Proveedor: ${escapeHtml(part.proveedor || '—')}</span>
        <span>Stock: ${Number(part.stockActual || 0)} / mínimo ${Number(part.stockMinimo || 0)}</span>
        <span>Compra: ${money(Number(part.costoCompra || 0))} · Venta: ${money(Number(part.precioVenta || 0))}</span>
      </div>
      <div class="inventory-actions">
        ${isRole('admin') ? `<button class="btn btn-secondary" type="button" data-inv-edit="${part.id}">Editar</button><button class="btn btn-secondary" type="button" data-inv-entry="${part.id}">Entrada</button>` : ``}
        ${isRole('admin','supervisor_flotas') ? `<button class="btn btn-primary" type="button" data-inv-install="${part.id}">Instalar</button>` : ``}
      </div>
    </article>
  `).join('') || '<div class="parts-empty small">Sin inventario capturado.</div>';

  const pendingCards = pendingItems.map(item => {
    const statusLabel = ({
      pendiente:'Pendiente',
      asignada:'Asignada',
      en_compra:'En compra',
      recibida:'Recibida',
      instalada:'Instalada'
    })[item.refaccionStatus || 'pendiente'] || 'Pendiente';
    return `
      <article class="parts-card mission-card">
        <div class="parts-card-head">
          <div>
            <div class="parts-kicker">${escapeHtml(item.empresa || '—')}</div>
            <h4>Unidad ${escapeHtml(item.numeroEconomico || '—')}</h4>
          </div>
          <span class="badge badge-waiting">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="parts-piece">${escapeHtml(item.detalleRefaccion || 'Refacción pendiente sin detalle específico')}</div>
        <div class="parts-meta">
          <div><strong>Folio</strong>${escapeHtml(item.folio || '—')}</div>
          <div><strong>Modelo</strong>${escapeHtml(item.modelo || '—')}</div>
          <div><strong>Estado operativo</strong>${escapeHtml(item.estatusOperativo || 'sin iniciar')}</div>
          <div><strong>Asignada</strong>${escapeHtml(item.refaccionAsignada || 'Sin asignar')}</div>
        </div>
      </article>
    `;
  }).join('') || '<div class="parts-empty small">Sin pendientes.</div>';

  const requestCards = openRequests.map(req => `
    <article class="parts-card independent-parts-card">
      <div class="parts-card-head">
        <div>
          <div class="parts-kicker">${escapeHtml(req.empresa || '—')}</div>
          <h4>Solicitud independiente</h4>
        </div>
        <span class="badge badge-waiting">${escapeHtml(req.status || 'pendiente')}</span>
      </div>
      <div class="parts-piece">${escapeHtml(req.solicitud || '')}</div>
      <div class="parts-meta">
        <div><strong>Unidad</strong>${escapeHtml(req.numero_economico || 'Sin unidad ligada')}</div>
        <div><strong>Creada</strong>${escapeHtml(fmtDate(req.created_at))}</div>
      </div>
      <div class="independent-request-editor">
        <select id="indReqStatus_${req.id}">
          ${['pendiente','pedida','asignada','recibida','instalada','cancelada','cerrada'].map(opt => `<option value="${opt}" ${req.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>
        <input id="indReqNotes_${req.id}" value="${escapeHtml(req.notes || '')}" placeholder="Notas" />
        <button class="btn btn-primary" type="button" onclick="guardarSolicitudIndependiente('${req.id}')">Guardar</button>
      </div>
    </article>
  `).join('') || '<div class="parts-empty small">Sin solicitudes abiertas.</div>';

  const kardexRows = kardex.slice(0, 40).map(row => `
    <div class="parts-history-row">
      <strong>${escapeHtml(row.nombre || 'Refacción')}</strong>
      <span>${escapeHtml(row.tipo || '')} · Cantidad: ${Number(row.cantidad || 0)}</span>
      <span>${escapeHtml(row.empresa || '')}${row.numeroEconomico ? ' · Unidad ' + escapeHtml(row.numeroEconomico) : ''}</span>
      <span>Stock: ${Number(row.stockResultante || 0)} · Compra: ${money(Number(row.costoCompra || 0))}${Number(row.precioVenta || 0) ? ' · Venta: ' + money(Number(row.precioVenta || 0)) : ''}</span>
    </div>
  `).join('') || '<div class="parts-empty small">Sin movimientos todavía.</div>';

  els.partsList.innerHTML = `
    <section class="parts-command-grid">
      <article class="parts-stage-card">
        <div class="parts-stage-head">
          <div><div class="parts-kicker">PENDIENTES</div><h4>Misiones abiertas</h4></div>
          <span class="parts-stage-badge">${pendingItems.length}</span>
        </div>
        <div class="parts-stage-body parts-card-column">${pendingCards}</div>
      </article>

      <article class="parts-stage-card">
        <div class="parts-stage-head">
          <div><div class="parts-kicker">SOLICITUDES</div><h4>Solicitudes manuales</h4></div>
          <span class="parts-stage-badge">${openRequests.length}</span>
        </div>
        <div class="parts-stage-body parts-card-column">${requestCards}</div>
      </article>
    </section>

    <section class="parts-stage-card inventory-stage">
      <div class="parts-stage-head">
        <div><div class="parts-kicker">INVENTARIO</div><h4>Stock visual de refacciones</h4></div>
        <span class="parts-stage-badge">${inventory.length}</span>
      </div>
      <div class="inventory-grid">${inventoryCards}</div>
    </section>

    <section class="parts-history-grid parts-history-wrap">
      <article class="parts-history-card">
        <div class="parts-kicker">KARDEX</div>
        <h4>Entradas y salidas</h4>
        <div class="parts-history-list">${kardexRows}</div>
      </article>
      <article class="parts-history-card">
        <div class="parts-kicker">RUTA DE USO</div>
        <h4>Qué sucede aquí</h4>
        <div class="parts-journey">
          <div class="journey-step"><strong>1</strong><span>Se detecta una refacción pendiente desde reporte o solicitud manual.</span></div>
          <div class="journey-step"><strong>2</strong><span>Admin la recibe en inventario con foto, proveedor, costo y cantidad.</span></div>
          <div class="journey-step"><strong>3</strong><span>Se instala a una unidad con precio de venta manual y queda en kardex.</span></div>
          <div class="journey-step"><strong>4</strong><span>Supervisor de flotas ve la refacción instalada con imagen real en el expediente.</span></div>
        </div>
      </article>
    </section>
  `;

  els.partsList.querySelectorAll('[data-inv-edit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = (state.inventoryParts || []).find(p => p.id === btn.dataset.invEdit);
      if (item) await editarRefaccionInventario(item);
    });
  });
  els.partsList.querySelectorAll('[data-inv-entry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = (state.inventoryParts || []).find(p => p.id === btn.dataset.invEntry);
      if (item) await registrarEntradaInventario(item);
    });
  });
  els.partsList.querySelectorAll('[data-inv-install]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = (state.inventoryParts || []).find(p => p.id === btn.dataset.invInstall);
      if (item) await instalarDesdeInventario(item);
    });
  });
}


