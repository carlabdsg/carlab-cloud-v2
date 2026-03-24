const state = {
  token: localStorage.getItem('carlabToken') || '',
  user: null,
  garantias: [],
  users: [],
  companies: [],
  registrationRequests: [],
  currentEvidence: [],
  currentRefEvidence: [],
  drawing: false,
  hasSignature: false,
  activePanel: 'board',
  editingGarantiaId: '',
  editingUserId: '',
  editingCompanyId: '',
};

const api = {
  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.error || data?.message || 'Algo salió mal.');
    return data;
  },
  login(email, password) { return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); },
  me() { return this.request('/api/auth/me'); },
  getPublicCompanies() { return this.request('/api/public/companies'); },
  registerOperator(payload) { return this.request('/api/public/register-operator', { method: 'POST', body: JSON.stringify(payload) }); },
  getGarantias() { return this.request('/api/garantias'); },
  createGarantia(payload) { return this.request('/api/garantias', { method: 'POST', body: JSON.stringify(payload) }); },
  updateGarantia(id, payload) { return this.request(`/api/garantias/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); },
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
};

const els = {};
[
  'authView','appShell','tabLoginBtn','tabRegisterBtn','loginPane','registerPane','loginEmail','loginPassword','loginError','regNombre','regEmail','regTelefono','regEmpresa','regNumeroEconomico','regPassword','registerMessage',
  'currentUserName','currentUserEmail','avatarCircle','currentRoleBadge','roleTitle','roleSummaryText','pageTitle','statusLegend','boardKicker','searchInput','logoutBtn','quickCreateBtn',
  'navBoardBtn','navNewReportBtn','navAnalyticsBtn','navHistoryBtn','navUsersBtn','navRequestsBtn','navCompaniesBtn',
  'panelBoard','panelReport','panelAnalytics','panelHistory','panelUsers','panelRequests','panelCompanies',
  'statTotal','statNew','statAccepted','statDone','listTitle','validationFilter','operationalFilter','garantiasList','emptyState','topCompanies','topModels','topIncidentTypes','repeatUnits',
  'analyticsCompanies','analyticsModels','analyticsIncidents','analyticsRepeats',
  'reportForm','numeroObra','modelo','numeroEconomico','empresa','kilometraje','contactoNombre','telefono','descripcionFallo','solicitaRefaccion','refaccionFields','detalleRefaccion','evidencias','evidenciasRefaccion','previewEvidencias','previewRefaccion','firmaCanvas','clearSignatureBtn','cancelReportBtn',
  'unitHistoryInput','unitHistoryBtn','unitHistoryResult',
  'userForm','userId','userNombre','userEmail','userRole','userEmpresa','userTelefono','userPassword','userSubmitBtn','userCancelEditBtn','usersList',
  'requestsList',
  'companyForm','companyId','companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas','companySubmitBtn','companyCancelEditBtn','companiesList',
  'detailModal','detailTitle','detailSubtitle','detailBody','closeModalBtn','reportPdfBtn','workshopPdfBtn','actionModal','actionModalTitle','actionStatusSelect','actionNotes','actionConfirmBtn','actionCancelBtn','quickFilterBar','toast'
].forEach(id => { els[id] = document.getElementById(id); });

const signatureCtx = els.firmaCanvas?.getContext('2d');
if (signatureCtx) {
  signatureCtx.lineWidth = 2.2;
  signatureCtx.lineCap = 'round';
  signatureCtx.strokeStyle = '#111827';
}

function notify(message, isError = false) {
  if (!els.toast) return alert(message);
  els.toast.textContent = message;
  els.toast.style.background = isError ? 'rgba(127, 29, 29, .96)' : 'rgba(17,24,39,.92)';
  els.toast.classList.remove('hidden');
  clearTimeout(notify._t);
  notify._t = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}
function fmtDate(value) { return value ? new Date(value).toLocaleString('es-MX') : '—'; }
function roleName(role) { return ({ admin:'Admin', operador:'Operador', operativo:'Operativo', supervisor:'Supervisor' })[role] || role || '—'; }
function isRole(...roles) { return !!state.user && roles.includes(state.user.role); }
function selectedRadio(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function esc(text='') { return String(text).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
function initials(text='') { return String(text).split(' ').filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase() || '').join('') || 'C'; }
function countBy(items, getter) {
  const m = new Map();
  items.forEach(item => {
    const key = getter(item) || '—';
    m.set(key, (m.get(key) || 0) + 1);
  });
  return [...m.entries()].sort((a,b) => b[1] - a[1]);
}
function fillSelect(select, items, placeholder = 'Selecciona') {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` + items.map(item => `<option value="${esc(item.nombre)}">${esc(item.nombre)}</option>`).join('');
  if (current) select.value = current;
}
function fillDatalist(el, values) {
  if (!el) return;
  el.innerHTML = [...new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean))].sort().slice(0, 200).map(v => `<option value="${esc(v)}"></option>`).join('');
}
function setActiveNav(panel) {
  state.activePanel = panel;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  const panelMap = {
    board: [els.panelBoard, els.navBoardBtn],
    report: [els.panelReport, els.navNewReportBtn],
    analytics: [els.panelAnalytics, els.navAnalyticsBtn],
    history: [els.panelHistory, els.navHistoryBtn],
    users: [els.panelUsers, els.navUsersBtn],
    requests: [els.panelRequests, els.navRequestsBtn],
    companies: [els.panelCompanies, els.navCompaniesBtn],
  };
  panelMap[panel]?.[0]?.classList.remove('hidden');
  panelMap[panel]?.[1]?.classList.add('active');
}
function roleCopy(role) {
  return {
    admin: { title:'Cabina administrativa', summary:'Control total, lectura comercial y capacidad de actuación sobre toda la operación.', kicker:'ADMIN', page:'Bandeja general del sistema', legend:'Portal corporativo con control, solicitudes y lectura comercial.' },
    operativo: { title:'Centro operativo', summary:'Valida, mueve estatus y sostiene el flujo de garantías en vivo.', kicker:'OPERATIVO', page:'Bandeja operativa', legend:'Toma decisiones, mueve estatus y libera cuellos de botella.' },
    supervisor: { title:'Vista supervisora', summary:'Lectura limpia para revisión, seguimiento y control visual del taller.', kicker:'SUPERVISOR', page:'Vista de supervisión', legend:'Todo visible, sin saturación ni ruido.' },
    operador: { title:'Portal del operador', summary:'Levantas reportes con evidencia y sigues su estatus sin depender de llamadas.', kicker:'OPERADOR', page:'Mis reportes', legend:'Captura clara, evidencia y seguimiento.' },
  }[role] || { title:'Cabina', summary:'Operación visible.', kicker:'CARLAB', page:'Centro de mando', legend:'Todo lo importante a la vista.' };
}
function syncRoleUI() {
  if (!state.user) return;
  const copy = roleCopy(state.user.role);
  els.currentUserName.textContent = state.user.nombre || 'Usuario';
  els.currentUserEmail.textContent = state.user.email || '—';
  els.avatarCircle.textContent = initials(state.user.nombre || state.user.email);
  els.currentRoleBadge.textContent = roleName(state.user.role);
  els.roleTitle.textContent = copy.title;
  els.roleSummaryText.textContent = copy.summary;
  els.boardKicker.textContent = copy.kicker;
  els.pageTitle.textContent = copy.page;
  els.statusLegend.textContent = copy.legend;
  document.querySelectorAll('.admin-only, .admin-only-panel').forEach(el => el.classList.toggle('hidden', !isRole('admin')));
}
function showAuth() {
  els.authView.classList.remove('hidden');
  els.appShell.classList.add('hidden');
}
function showApp() {
  els.authView.classList.add('hidden');
  els.appShell.classList.remove('hidden');
  syncRoleUI();
}
function resetSignature() {
  if (!signatureCtx || !els.firmaCanvas) return;
  signatureCtx.clearRect(0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
  signatureCtx.fillStyle = '#fff';
  signatureCtx.fillRect(0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
  state.hasSignature = false;
}
function pointerPos(e) {
  const rect = els.firmaCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return { x: (point.clientX - rect.left) * (els.firmaCanvas.width / rect.width), y: (point.clientY - rect.top) * (els.firmaCanvas.height / rect.height) };
}
function startDraw(e) { state.drawing = true; state.hasSignature = true; const {x,y} = pointerPos(e); signatureCtx.beginPath(); signatureCtx.moveTo(x,y); }
function moveDraw(e) { if (!state.drawing) return; e.preventDefault(); const {x,y} = pointerPos(e); signatureCtx.lineTo(x,y); signatureCtx.stroke(); }
function endDraw() { state.drawing = false; }
['mousedown','touchstart'].forEach(evt => els.firmaCanvas?.addEventListener(evt, startDraw));
['mousemove','touchmove'].forEach(evt => els.firmaCanvas?.addEventListener(evt, moveDraw, { passive: false }));
['mouseup','mouseleave','touchend'].forEach(evt => els.firmaCanvas?.addEventListener(evt, endDraw));
els.clearSignatureBtn?.addEventListener('click', resetSignature);
resetSignature();

async function fileToCompressedDataUrl(file, maxSide = 1600, quality = 0.8) {
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
  const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const cx = canvas.getContext('2d');
  cx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
function drawPreviews(container, items) {
  if (!container) return;
  container.innerHTML = items.map(src => `<img src="${src}" alt="evidencia" />`).join('');
}

els.evidencias?.addEventListener('change', async e => {
  const incoming = await Promise.all([...e.target.files].map(fileToCompressedDataUrl));
  state.currentEvidence = [...state.currentEvidence, ...incoming];
  drawPreviews(els.previewEvidencias, state.currentEvidence);
  e.target.value = '';
});
els.evidenciasRefaccion?.addEventListener('change', async e => {
  const incoming = await Promise.all([...e.target.files].map(fileToCompressedDataUrl));
  state.currentRefEvidence = [...state.currentRefEvidence, ...incoming];
  drawPreviews(els.previewRefaccion, state.currentRefEvidence);
  e.target.value = '';
});
els.solicitaRefaccion?.addEventListener('change', () => els.refaccionFields.classList.toggle('hidden', !els.solicitaRefaccion.checked));

function reportPayload() {
  return {
    numeroObra: els.numeroObra.value.trim(),
    modelo: els.modelo.value.trim(),
    numeroEconomico: els.numeroEconomico.value.trim(),
    empresa: els.empresa.value.trim(),
    kilometraje: els.kilometraje.value.trim(),
    contactoNombre: els.contactoNombre.value.trim(),
    telefono: els.telefono.value.trim(),
    tipoIncidente: selectedRadio('tipoIncidente'),
    descripcionFallo: els.descripcionFallo.value.trim(),
    solicitaRefaccion: els.solicitaRefaccion.checked,
    detalleRefaccion: els.detalleRefaccion.value.trim(),
    evidencias: state.currentEvidence,
    evidenciasRefaccion: state.currentRefEvidence,
    firma: state.hasSignature ? els.firmaCanvas.toDataURL('image/png', .9) : '',
  };
}
function resetReportForm() {
  state.editingGarantiaId = '';
  els.reportForm?.reset();
  state.currentEvidence = [];
  state.currentRefEvidence = [];
  drawPreviews(els.previewEvidencias, []);
  drawPreviews(els.previewRefaccion, []);
  els.refaccionFields?.classList.add('hidden');
  const first = document.querySelector('input[name="tipoIncidente"][value="daño"]');
  if (first) first.checked = true;
  if (isRole('operador') && state.user?.empresa) els.empresa.value = state.user.empresa;
  if (isRole('operador')) {
    els.contactoNombre.value = state.user?.nombre || '';
    els.telefono.value = state.user?.telefono || '';
  }
  resetSignature();
}
function resetUserForm() {
  state.editingUserId = '';
  els.userForm.reset();
  els.userId.value = '';
  els.userSubmitBtn.textContent = 'Crear usuario';
  els.userPassword.required = true;
  els.userPassword.placeholder = '';
  els.userCancelEditBtn.classList.add('hidden');
}
function resetCompanyForm() {
  state.editingCompanyId = '';
  els.companyForm.reset();
  els.companyId.value = '';
  els.companySubmitBtn.textContent = 'Guardar empresa';
  els.companyCancelEditBtn.classList.add('hidden');
}
function beginUserEdit(user) {
  state.editingUserId = user.id;
  els.userId.value = user.id;
  els.userNombre.value = user.nombre || '';
  els.userEmail.value = user.email || '';
  els.userRole.value = user.role || 'operador';
  els.userEmpresa.value = user.empresa || '';
  els.userTelefono.value = user.telefono || '';
  els.userPassword.required = false;
  els.userPassword.placeholder = 'Déjala vacía para conservarla';
  els.userPassword.value = '';
  els.userSubmitBtn.textContent = 'Actualizar usuario';
  els.userCancelEditBtn.classList.remove('hidden');
  setActiveNav('users');
}
function beginCompanyEdit(company) {
  state.editingCompanyId = company.id;
  els.companyId.value = company.id;
  els.companyNombre.value = company.nombre || '';
  els.companyContacto.value = company.contacto || '';
  els.companyTelefono.value = company.telefono || '';
  els.companyEmail.value = company.email || '';
  els.companyNotas.value = company.notas || '';
  els.companySubmitBtn.textContent = 'Actualizar empresa';
  els.companyCancelEditBtn.classList.remove('hidden');
  setActiveNav('companies');
}
function beginGarantiaEdit(item) {
  state.editingGarantiaId = item.id;
  els.numeroObra.value = item.numeroObra || '';
  els.modelo.value = item.modelo || '';
  els.numeroEconomico.value = item.numeroEconomico || '';
  els.empresa.value = item.empresa || '';
  els.kilometraje.value = item.kilometraje || '';
  els.contactoNombre.value = item.contactoNombre || '';
  els.telefono.value = item.telefono || '';
  els.descripcionFallo.value = item.descripcionFallo || '';
  els.detalleRefaccion.value = item.detalleRefaccion || '';
  const radio = document.querySelector(`input[name="tipoIncidente"][value="${item.tipoIncidente}"]`);
  if (radio) radio.checked = true;
  els.solicitaRefaccion.checked = !!item.solicitaRefaccion;
  els.refaccionFields.classList.toggle('hidden', !item.solicitaRefaccion);
  state.currentEvidence = [...(item.evidencias || [])];
  state.currentRefEvidence = [...(item.evidenciasRefaccion || [])];
  drawPreviews(els.previewEvidencias, state.currentEvidence);
  drawPreviews(els.previewRefaccion, state.currentRefEvidence);
  resetSignature();
  if (item.firma) {
    const img = new Image();
    img.onload = () => { signatureCtx.drawImage(img, 0, 0, els.firmaCanvas.width, els.firmaCanvas.height); state.hasSignature = true; };
    img.src = item.firma;
  }
  setActiveNav('report');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filteredGarantias() {
  const q = els.searchInput.value.trim().toLowerCase();
  return state.garantias.filter(item => {
    const byValidation = !els.validationFilter.value || item.estatusValidacion === els.validationFilter.value;
    const byOperational = !els.operationalFilter.value || item.estatusOperativo === els.operationalFilter.value;
    const searchable = [item.folio, item.numeroEconomico, item.numeroObra, item.empresa, item.modelo, item.contactoNombre, item.descripcionFallo].join(' ').toLowerCase();
    const byQuery = !q || searchable.includes(q);
    const onlyMine = state.user?.role === 'operador' ? item.reportadoPorEmail === state.user.email : true;
    return byValidation && byOperational && byQuery && onlyMine;
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateStats() {
  const items = filteredGarantias();
  els.statTotal.textContent = items.length;
  els.statNew.textContent = items.filter(x => ['nueva','pendiente de revisión'].includes(x.estatusValidacion)).length;
  els.statAccepted.textContent = items.filter(x => x.estatusValidacion === 'aceptada').length;
  els.statDone.textContent = items.filter(x => x.estatusOperativo === 'terminada').length;
}
function renderMiniList(target, pairs, emptyText) {
  target.innerHTML = pairs.length ? pairs.slice(0, 6).map(([name, value]) => `<li><span>${esc(name)}</span><strong>${value}</strong></li>`).join('') : `<li><em>${emptyText}</em></li>`;
}
function renderAnalytics() {
  const source = filteredGarantias();
  renderMiniList(els.topCompanies, countBy(source, x => x.empresa), 'Sin datos todavía.');
  renderMiniList(els.topModels, countBy(source, x => x.modelo), 'Sin datos todavía.');
  renderMiniList(els.topIncidentTypes, countBy(source, x => x.tipoIncidente), 'Sin datos todavía.');
  renderMiniList(els.repeatUnits, countBy(source, x => x.numeroEconomico).filter(([,n]) => n > 1), 'Cuando una unidad repita fallas, aparecerá aquí.');
  renderMiniList(els.analyticsCompanies, countBy(source, x => x.empresa), 'Sin datos todavía.');
  renderMiniList(els.analyticsModels, countBy(source, x => x.modelo), 'Sin datos todavía.');
  renderMiniList(els.analyticsIncidents, countBy(source, x => x.tipoIncidente), 'Sin datos todavía.');
  renderMiniList(els.analyticsRepeats, countBy(source, x => x.numeroEconomico).filter(([,n]) => n > 1), 'Sin unidades reincidentes todavía.');
}
function renderQuickFilters() {
  if (!els.quickFilterBar) return;
  const val = els.validationFilter.value;
  const op = els.operationalFilter.value;
  const chips = [
    { type:'validation', value:'', label:'Todo' },
    { type:'validation', value:'nueva', label:'Nueva' },
    { type:'validation', value:'pendiente de revisión', label:'Pendiente' },
    { type:'validation', value:'aceptada', label:'Aceptada' },
    { type:'operational', value:'en proceso', label:'En proceso' },
    { type:'operational', value:'espera refacción', label:'Espera refacción' },
    { type:'operational', value:'terminada', label:'Terminada' },
  ];
  els.quickFilterBar.innerHTML = chips.map(ch => {
    const active = ch.type === 'validation' ? val === ch.value && !op : op === ch.value;
    return `<button class="quick-chip ${active ? 'active' : ''}" data-chip-type="${ch.type}" data-chip-value="${esc(ch.value)}" type="button">${esc(ch.label)}</button>`;
  }).join('');
}
function refreshAutocompleteSources() {
  fillDatalist(document.getElementById('numeroObraSuggestions'), state.garantias.map(x => x.numeroObra));
  fillDatalist(document.getElementById('modeloSuggestions'), state.garantias.map(x => x.modelo));
  fillDatalist(document.getElementById('numeroEconomicoSuggestions'), state.garantias.map(x => x.numeroEconomico));
}
function miniData(label, value) { return `<div class="mini-data"><strong>${esc(label)}</strong><span>${esc(value || '—')}</span></div>`; }
function ticketActions(item) {
  const actions = [`<button class="btn btn-secondary" data-action="detail" data-id="${item.id}">Ver detalle</button>`, `<button class="btn btn-ghost" data-action="pdf" data-id="${item.id}">PDF</button>`, `<button class="btn btn-ghost" data-action="pdf-taller" data-id="${item.id}">PDF taller</button>`];
  if (state.user?.role !== 'supervisor') actions.push(`<button class="btn btn-ghost" data-action="edit" data-id="${item.id}">Editar</button>`);
  if (isRole('admin','operativo') && ['nueva','pendiente de revisión'].includes(item.estatusValidacion)) actions.push(`<button class="btn btn-ghost" data-action="review" data-id="${item.id}">Validar</button>`);
  if (isRole('admin','operativo') && item.estatusValidacion === 'aceptada') actions.push(`<button class="btn btn-ghost" data-action="operational" data-id="${item.id}">Mover operativo</button>`);
  if (isRole('admin')) actions.push(`<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">Eliminar</button>`);
  return actions.join('');
}
function renderGarantias() {
  updateStats();
  renderAnalytics();
  renderQuickFilters();
  refreshAutocompleteSources();
  const items = filteredGarantias();
  els.garantiasList.innerHTML = '';
  els.emptyState.classList.toggle('hidden', items.length > 0);
  items.forEach(item => {
    const frag = els.garantiasList.ownerDocument.importNode(document.getElementById('garantiaCardTemplate').content, true);
    frag.querySelector('.title').textContent = `${item.folio || 'GAR-—'} · Unidad ${item.numeroEconomico} · Obra ${item.numeroObra}`;
    frag.querySelector('.meta').textContent = `${item.empresa || '—'} · ${item.modelo || '—'} · Reportó ${item.reportadoPorNombre || '—'} · ${fmtDate(item.createdAt)}`;
    frag.querySelector('.description').textContent = item.descripcionFallo || 'Sin descripción';
    const vb = frag.querySelector('.validation-badge');
    vb.textContent = item.estatusValidacion;
    vb.classList.add(badgeValidation(item.estatusValidacion));
    const ob = frag.querySelector('.operational-badge');
    ob.textContent = item.estatusOperativo;
    ob.classList.add(badgeOperational(item.estatusOperativo));
    frag.querySelector('.mini-grid').innerHTML = [
      miniData('Incidencia', item.tipoIncidente),
      miniData('KM', item.kilometraje),
      miniData('Solicita refacción', item.solicitaRefaccion ? 'Sí' : 'No'),
      miniData('Contacto', item.contactoNombre || item.telefono || '—'),
    ].join('');
    frag.querySelector('.ticket-actions').innerHTML = ticketActions(item);
    els.garantiasList.appendChild(frag);
  });
}
function badgeValidation(status) { return ({ 'nueva':'badge-new','pendiente de revisión':'badge-review','aceptada':'badge-accepted','rechazada':'badge-rejected' })[status] || 'badge-info'; }
function badgeOperational(status) { return ({ 'sin iniciar':'badge-info','en proceso':'badge-progress','espera refacción':'badge-waiting','terminada':'badge-done' })[status] || 'badge-info'; }

function renderUsers() {
  els.usersList.innerHTML = state.users.length ? '' : `<div class="empty-state"><div><h4>Sin usuarios todavía.</h4><p>Cuando des de alta usuarios aparecerán aquí.</p></div></div>`;
  state.users.forEach(user => {
    const row = document.createElement('article');
    row.className = 'data-row';
    row.innerHTML = `
      <div class="data-head">
        <div>
          <h4>${esc(user.nombre)}</h4>
          <p class="muted small">${esc(user.email)}</p>
        </div>
        <div class="row-actions">
          <button class="btn btn-secondary" data-user-action="edit" data-id="${user.id}">Editar</button>
          ${user.role !== 'admin' ? `<button class="btn btn-ghost" data-user-action="delete" data-id="${user.id}">Borrar</button>` : ''}
        </div>
      </div>
      <div class="data-meta">
        <div><strong>Rol</strong><span>${esc(roleName(user.role))}</span></div>
        <div><strong>Empresa</strong><span>${esc(user.empresa || 'Sin empresa')}</span></div>
        <div><strong>Teléfono</strong><span>${esc(user.telefono || '—')}</span></div>
        <div><strong>Activo</strong><span>${user.activo ? 'Sí' : 'No'}</span></div>
        <div><strong>Alta</strong><span>${fmtDate(user.createdAt)}</span></div>
      </div>`;
    els.usersList.appendChild(row);
  });
}
function renderCompanies() {
  els.companiesList.innerHTML = state.companies.length ? '' : `<div class="empty-state"><div><h4>Sin empresas todavía.</h4><p>Agrega empresas para controlar registros y reportes.</p></div></div>`;
  state.companies.forEach(company => {
    const row = document.createElement('article');
    row.className = 'data-row';
    row.innerHTML = `
      <div class="data-head">
        <div>
          <h4>${esc(company.nombre)}</h4>
          <p class="muted small">${esc(company.email || 'Sin correo')}</p>
        </div>
        <div class="row-actions">
          <button class="btn btn-secondary" data-company-action="edit" data-id="${company.id}">Editar</button>
          <button class="btn btn-ghost" data-company-action="toggle" data-id="${company.id}">${company.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-ghost" data-company-action="delete" data-id="${company.id}">Eliminar</button>
        </div>
      </div>
      <div class="data-meta">
        <div><strong>Contacto</strong><span>${esc(company.contacto || '—')}</span></div>
        <div><strong>Teléfono</strong><span>${esc(company.telefono || '—')}</span></div>
        <div><strong>Correo</strong><span>${esc(company.email || '—')}</span></div>
        <div><strong>Estado</strong><span>${company.activo ? 'Activa' : 'Inactiva'}</span></div>
        <div><strong>Notas</strong><span>${esc(company.notas || '—')}</span></div>
      </div>`;
    els.companiesList.appendChild(row);
  });
  fillSelect(els.empresa, state.companies.filter(x => x.activo), 'Selecciona empresa');
  fillSelect(els.userEmpresa, state.companies.filter(x => x.activo), 'Sin empresa');
  fillSelect(els.regEmpresa, state.companies.filter(x => x.activo), 'Selecciona empresa');
}
function renderRequests() {
  els.requestsList.innerHTML = state.registrationRequests.length ? '' : `<div class="empty-state"><div><h4>Sin solicitudes pendientes.</h4><p>Cuando entren nuevas solicitudes aparecerán aquí.</p></div></div>`;
  state.registrationRequests.forEach(item => {
    const card = document.createElement('article');
    card.className = 'ticket-card';
    card.innerHTML = `
      <div class="ticket-head">
        <div>
          <h4>${esc(item.nombre)}</h4>
          <p class="meta">${esc(item.email)} · ${esc(item.telefono || 'Sin teléfono')} · ${esc(item.empresa || 'Sin empresa')}</p>
        </div>
        <span class="badge ${item.status === 'pendiente' ? 'badge-review' : item.status === 'aprobada' ? 'badge-accepted' : 'badge-rejected'}">${esc(item.status)}</span>
      </div>
      <div class="mini-grid">
        ${miniData('Número económico', item.numeroEconomico)}
        ${miniData('Creada', fmtDate(item.createdAt))}
        ${miniData('Revisada', fmtDate(item.reviewedAt))}
        ${miniData('Motivo', item.motivo || '—')}
      </div>
      ${item.status === 'pendiente' ? `<div class="ticket-actions"><button class="btn btn-primary" data-request-action="approve" data-id="${item.id}">Aprobar</button><button class="btn btn-ghost" data-request-action="reject" data-id="${item.id}">Rechazar</button></div>` : ''}
    `;
    els.requestsList.appendChild(card);
  });
}

async function openDetail(item) {
  state.currentDetailId = item.id;
  els.detailTitle.textContent = `${item.folio || 'GAR-—'} · Unidad ${item.numeroEconomico}`;
  els.detailSubtitle.textContent = `${item.empresa || '—'} · ${item.modelo || '—'} · ${fmtDate(item.createdAt)}`;
  let auditHtml = '<li>No disponible.</li>';
  try {
    const audit = await api.getAudit(item.id);
    const entries = Array.isArray(audit) ? audit : audit?.logs || [];
    auditHtml = entries.length ? entries.map(log => `<li><strong>${esc(log.accion || 'Movimiento')}</strong><br><span class="muted small">${fmtDate(log.createdAt || log.created_at)}</span><br>${esc(log.detalle || '—')}</li>`).join('') : '<li>Sin movimientos todavía.</li>';
  } catch {}
  els.detailBody.innerHTML = `
    <div class="modal-grid">
      <div class="surface soft nested stack-gap">
        <div><p class="section-label">Datos base</p><h4>Resumen técnico</h4></div>
        <div class="data-meta">
          <div><strong>Obra</strong><span>${esc(item.numeroObra)}</span></div>
          <div><strong>Modelo</strong><span>${esc(item.modelo)}</span></div>
          <div><strong>Unidad</strong><span>${esc(item.numeroEconomico)}</span></div>
          <div><strong>Empresa</strong><span>${esc(item.empresa)}</span></div>
          <div><strong>KM</strong><span>${esc(item.kilometraje || '—')}</span></div>
        </div>
        <div class="data-meta">
          <div><strong>Incidencia</strong><span>${esc(item.tipoIncidente)}</span></div>
          <div><strong>Validación</strong><span>${esc(item.estatusValidacion)}</span></div>
          <div><strong>Operativo</strong><span>${esc(item.estatusOperativo)}</span></div>
          <div><strong>Contacto</strong><span>${esc(item.contactoNombre || '—')}</span></div>
          <div><strong>Teléfono</strong><span>${esc(item.telefono || '—')}</span></div>
        </div>
        <div><strong>Descripción</strong><p>${esc(item.descripcionFallo || 'Sin descripción')}</p></div>
        <div><strong>Refacción</strong><p>${item.solicitaRefaccion ? esc(item.detalleRefaccion || 'Solicitada sin detalle') : 'No solicita refacción'}</p></div>
      </div>
      <div class="surface soft nested stack-gap">
        <div><p class="section-label">Trazabilidad</p><h4>Historial y evidencia</h4></div>
        <ul class="audit-list">${auditHtml}</ul>
      </div>
    </div>
    ${(item.evidencias?.length || item.evidenciasRefaccion?.length || item.firma) ? `
      <div class="surface soft nested stack-gap">
        <div><p class="section-label">Multimedia</p><h4>Evidencias</h4></div>
        ${item.evidencias?.length ? `<div><strong>Generales</strong><div class="preview-grid">${item.evidencias.map(src => `<img src="${src}" alt="evidencia" />`).join('')}</div></div>` : ''}
        ${item.evidenciasRefaccion?.length ? `<div><strong>Refacción</strong><div class="preview-grid">${item.evidenciasRefaccion.map(src => `<img src="${src}" alt="evidencia refacción" />`).join('')}</div></div>` : ''}
        ${item.firma ? `<div><strong>Firma</strong><div class="preview-grid"><img src="${item.firma}" alt="firma" /></div></div>` : ''}
      </div>
    ` : ''}
  `;
  els.detailModal.showModal();
}

function pdfStyles() {
  return `
    <style>
      body{font-family:Inter,Arial,sans-serif;color:#111827;padding:28px;line-height:1.45}
      .head{display:flex;justify-content:space-between;gap:12px;align-items:start;border-bottom:2px solid #111827;padding-bottom:14px;margin-bottom:18px}
      .brand{font-size:22px;font-weight:800;letter-spacing:.08em}.sub{color:#5f6b7a;font-size:12px;text-transform:uppercase;letter-spacing:.14em}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
      .box{border:1px solid #cdd5df;border-radius:14px;padding:12px}.box strong{display:block;font-size:11px;text-transform:uppercase;color:#647283;margin-bottom:5px}
      .title{font-size:18px;font-weight:800;margin:10px 0 8px}.desc{border:1px solid #d8dee6;border-radius:14px;padding:14px;background:#f8fafc}
      .imggrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.imggrid img{width:100%;height:180px;object-fit:cover;border:1px solid #d8dee6;border-radius:12px}
      .badge{display:inline-block;padding:7px 10px;border-radius:999px;border:1px solid #cdd5df;background:#f4f6f8;font-weight:700;font-size:12px;margin-right:8px}
      h3{margin:22px 0 10px}.muted{color:#5f6b7a}.audit{padding-left:18px}.signature{max-width:320px;border:1px solid #d8dee6;border-radius:12px}
      @media print { body{padding:0} .noprint{display:none} }
    </style>`;
}
function buildPdfHtml(item, mode = 'full') {
  const compact = mode === 'taller';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(item.folio || 'Reporte')}</title>${pdfStyles()}</head><body>
    <div class="head">
      <div><div class="brand">CARLAB</div><div class="sub">Reporte ${compact ? 'taller' : 'completo'} · Garantías</div></div>
      <div style="text-align:right"><div><strong>${esc(item.folio || 'GAR-—')}</strong></div><div class="muted">${esc(item.empresa || '—')}</div><div class="muted">${fmtDate(item.createdAt)}</div></div>
    </div>
    <div class="title">Unidad ${esc(item.numeroEconomico || '—')} · Obra ${esc(item.numeroObra || '—')}</div>
    <div><span class="badge">${esc(item.estatusValidacion || 'nueva')}</span><span class="badge">${esc(item.estatusOperativo || 'sin iniciar')}</span></div>
    <div class="grid">
      <div class="box"><strong>Modelo</strong>${esc(item.modelo || '—')}</div>
      <div class="box"><strong>Empresa</strong>${esc(item.empresa || '—')}</div>
      <div class="box"><strong>Contacto</strong>${esc(item.contactoNombre || '—')}</div>
      <div class="box"><strong>Teléfono</strong>${esc(item.telefono || '—')}</div>
      <div class="box"><strong>Kilometraje</strong>${esc(item.kilometraje || '—')}</div>
      <div class="box"><strong>Tipo de incidencia</strong>${esc(item.tipoIncidente || '—')}</div>
    </div>
    <h3>Descripción del fallo</h3>
    <div class="desc">${esc(item.descripcionFallo || 'Sin descripción').replace(/\n/g, '<br>')}</div>
    <h3>Refacción</h3>
    <div class="desc">${item.solicitaRefaccion ? esc(item.detalleRefaccion || 'Solicitada sin detalle').replace(/\n/g, '<br>') : 'No solicita refacción'}</div>
    ${compact ? '' : `
      <h3>Trazabilidad</h3>
      <div class="grid">
        <div class="box"><strong>Reportó</strong>${esc(item.reportadoPorNombre || item.reportadoPorEmail || '—')}</div>
        <div class="box"><strong>Revisó</strong>${esc(item.revisadoPorNombre || '—')}</div>
        <div class="box"><strong>Motivo decisión</strong>${esc(item.motivoDecision || '—')}</div>
        <div class="box"><strong>Observaciones operativo</strong>${esc(item.observacionesOperativo || '—')}</div>
      </div>`}
    ${item.evidencias?.length ? `<h3>Evidencias generales</h3><div class="imggrid">${item.evidencias.map(src => `<img src="${src}" />`).join('')}</div>` : ''}
    ${item.evidenciasRefaccion?.length && !compact ? `<h3>Evidencias de refacción</h3><div class="imggrid">${item.evidenciasRefaccion.map(src => `<img src="${src}" />`).join('')}</div>` : ''}
    ${item.firma && !compact ? `<h3>Firma</h3><img class="signature" src="${item.firma}" />` : ''}
    <script>window.onload=()=>setTimeout(()=>window.print(),180)</script>
  </body></html>`;
}
function exportReportPdf(item, mode = 'full') {
  const win = window.open('', '_blank', 'width=1100,height=900');
  if (!win) return notify('Tu navegador bloqueó la ventana del PDF.', true);
  win.document.open();
  win.document.write(buildPdfHtml(item, mode));
  win.document.close();
}
async function openActionModal(kind, item) {
  state.currentAction = { kind, itemId: item.id };
  els.actionNotes.value = kind === 'review' ? (item.motivoDecision || '') : (item.observacionesOperativo || '');
  const options = kind === 'review'
    ? ['pendiente de revisión', 'aceptada', 'rechazada']
    : ['sin iniciar', 'en proceso', 'espera refacción', 'terminada'];
  els.actionModalTitle.textContent = kind === 'review' ? `Validar ${item.folio || item.numeroEconomico}` : `Mover operativo ${item.folio || item.numeroEconomico}`;
  els.actionStatusSelect.innerHTML = options.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  els.actionStatusSelect.value = kind === 'review'
    ? (item.estatusValidacion === 'nueva' ? 'aceptada' : item.estatusValidacion)
    : (item.estatusOperativo || 'en proceso');
  els.actionModal.showModal();
}
async function commitActionModal() {
  if (!state.currentAction) return;
  const item = state.garantias.find(x => x.id === state.currentAction.itemId);
  if (!item) return;
  const status = els.actionStatusSelect.value;
  const notes = els.actionNotes.value.trim();
  if (state.currentAction.kind === 'review') {
    await api.reviewGarantia(item.id, { estatusValidacion: status, motivoDecision: notes });
    notify('Validación actualizada.');
  } else {
    await api.updateOperational(item.id, { estatusOperativo: status, observacionesOperativo: notes });
    notify('Estatus operativo actualizado.');
  }
  els.actionModal.close();
  state.currentAction = null;
  await loadGarantias();
}
async function promptReview(item) {
  return openActionModal('review', item);
}
async function promptOperational(item) {
  return openActionModal('operational', item);
}

async function renderUnitHistory() {
  const numero = els.unitHistoryInput.value.trim();
  if (!numero) return notify('Escribe un número económico.', true);
  els.unitHistoryResult.classList.remove('empty');
  els.unitHistoryResult.innerHTML = 'Cargando historial...';
  try {
    const data = await api.getUnitHistory(numero);
    const rows = Array.isArray(data) ? data : data?.items || data?.historial || [];
    if (!rows.length) {
      els.unitHistoryResult.classList.add('empty');
      els.unitHistoryResult.textContent = 'Sin historial. No hay reportes para esa unidad.';
      return;
    }
    els.unitHistoryResult.innerHTML = rows.map(item => `
      <article class="timeline-item">
        <h4>${esc(item.folio || 'GAR-—')} · ${esc(item.estatusValidacion || 'nueva')} · ${esc(item.estatusOperativo || 'sin iniciar')}</h4>
        <p class="muted small">${fmtDate(item.createdAt || item.created_at)}</p>
        <p>${esc(item.descripcionFallo || 'Sin descripción')}</p>
        <p class="muted small">${esc(item.modelo || '—')} · ${esc(item.empresa || '—')} · Obra ${esc(item.numeroObra || item.numero_obra || '—')}</p>
      </article>
    `).join('');
  } catch (error) {
    els.unitHistoryResult.classList.add('empty');
    els.unitHistoryResult.textContent = error.message;
  }
}

async function loadCompanies(publicOnly = false) {
  const data = publicOnly ? await api.getPublicCompanies() : await api.getCompanies();
  state.companies = Array.isArray(data) ? data : data?.items || [];
  renderCompanies();
}
async function loadUsers() {
  if (!isRole('admin')) return;
  const data = await api.getUsers();
  state.users = Array.isArray(data) ? data : data?.items || [];
  renderUsers();
}
async function loadRequests() {
  if (!isRole('admin')) return;
  const data = await api.getRequests();
  state.registrationRequests = Array.isArray(data) ? data : data?.items || [];
  renderRequests();
}
async function loadGarantias() {
  const data = await api.getGarantias();
  state.garantias = Array.isArray(data) ? data : data?.items || [];
  renderGarantias();
}

async function hydrateApp() {
  showApp();
  setActiveNav('board');
  resetReportForm();
  resetUserForm();
  resetCompanyForm();
  await Promise.all([
    loadCompanies(isRole('admin') ? false : true),
    loadGarantias(),
    isRole('admin') ? loadUsers() : Promise.resolve(),
    isRole('admin') ? loadRequests() : Promise.resolve(),
  ]);
}

els.garantiasList?.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const item = state.garantias.find(x => x.id === btn.dataset.id);
  if (!item) return;
  try {
    if (btn.dataset.action === 'detail') return openDetail(item);
    if (btn.dataset.action === 'pdf') return exportReportPdf(item, 'full');
    if (btn.dataset.action === 'pdf-taller') return exportReportPdf(item, 'taller');
    if (btn.dataset.action === 'edit') return beginGarantiaEdit(item);
    if (btn.dataset.action === 'review') return promptReview(item);
    if (btn.dataset.action === 'operational') return promptOperational(item);
    if (btn.dataset.action === 'delete') {
      if (!confirm(`¿Eliminar ${item.folio || item.numeroEconomico}?`)) return;
      await api.deleteGarantia(item.id);
      notify('Garantía eliminada.');
      await loadGarantias();
    }
  } catch (error) {
    notify(error.message, true);
  }
});
els.usersList?.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-user-action]');
  if (!btn) return;
  const item = state.users.find(x => x.id === btn.dataset.id);
  if (!item) return;
  if (btn.dataset.userAction === 'edit') return beginUserEdit(item);
  if (btn.dataset.userAction === 'delete') {
    if (!confirm(`¿Borrar a ${item.nombre}?`)) return;
    try { await api.deleteUser(item.id); notify('Usuario eliminado.'); await loadUsers(); } catch (error) { notify(error.message, true); }
  }
});
els.companiesList?.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-company-action]');
  if (!btn) return;
  const item = state.companies.find(x => x.id === btn.dataset.id);
  if (!item) return;
  try {
    if (btn.dataset.companyAction === 'edit') return beginCompanyEdit(item);
    if (btn.dataset.companyAction === 'toggle') {
      if (item.activo) { if (!confirm(`¿Desactivar ${item.nombre}?`)) return; await api.deactivateCompany(item.id); }
      else await api.updateCompany(item.id, { ...item, activo: true });
      notify('Empresa actualizada.');
      await loadCompanies(false);
    }
    if (btn.dataset.companyAction === 'delete') {
      if (!confirm(`¿Eliminar ${item.nombre}? Solo funciona si no tiene historial.`)) return;
      await api.deleteCompany(item.id);
      notify('Empresa eliminada.');
      await loadCompanies(false);
    }
  } catch (error) { notify(error.message, true); }
});
els.requestsList?.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-request-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.requestAction === 'approve') {
      await api.updateRequest(id, { status: 'aprobada' });
      notify('Solicitud aprobada.');
    }
    if (btn.dataset.requestAction === 'reject') {
      const motivo = prompt('Motivo de rechazo') || '';
      await api.updateRequest(id, { status: 'rechazada', motivo });
      notify('Solicitud rechazada.');
    }
    await loadRequests();
    await loadUsers();
  } catch (error) { notify(error.message, true); }
});

els.tabLoginBtn?.addEventListener('click', () => {
  els.tabLoginBtn.classList.add('active');
  els.tabRegisterBtn.classList.remove('active');
  els.loginPane.classList.remove('hidden');
  els.registerPane.classList.add('hidden');
});
els.tabRegisterBtn?.addEventListener('click', () => {
  els.tabRegisterBtn.classList.add('active');
  els.tabLoginBtn.classList.remove('active');
  els.registerPane.classList.remove('hidden');
  els.loginPane.classList.add('hidden');
});
els.logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('carlabToken');
  state.token = '';
  state.user = null;
  showAuth();
});
els.quickCreateBtn?.addEventListener('click', () => { resetReportForm(); setActiveNav('report'); });

els.loginPane?.addEventListener('submit', async e => {
  e.preventDefault();
  els.loginError.classList.add('hidden');
  try {
    const data = await api.login(els.loginEmail.value.trim(), els.loginPassword.value);
    state.token = data.token;
    localStorage.setItem('carlabToken', state.token);
    state.user = data.user;
    await hydrateApp();
    notify(`Bienvenido, ${state.user.nombre}.`);
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.classList.remove('hidden');
  }
});

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', async () => {
  const map = {
    navBoardBtn: 'board', navNewReportBtn: 'report', navAnalyticsBtn: 'analytics', navHistoryBtn: 'history', navUsersBtn: 'users', navRequestsBtn: 'requests', navCompaniesBtn: 'companies'
  };
  const panel = map[btn.id];
  if (!panel) return;
  setActiveNav(panel);
  if (panel === 'users') await loadUsers();
  if (panel === 'requests') await loadRequests();
  if (panel === 'companies') await loadCompanies(false);
}));

els.validationFilter?.addEventListener('change', renderGarantias);
els.operationalFilter?.addEventListener('change', renderGarantias);
els.searchInput?.addEventListener('input', renderGarantias);
els.unitHistoryBtn?.addEventListener('click', renderUnitHistory);
els.unitHistoryInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); renderUnitHistory(); } });
els.cancelReportBtn?.addEventListener('click', () => { resetReportForm(); setActiveNav('board'); });
els.userCancelEditBtn?.addEventListener('click', resetUserForm);
els.companyCancelEditBtn?.addEventListener('click', resetCompanyForm);
els.closeModalBtn?.addEventListener('click', () => els.detailModal.close());
els.reportPdfBtn?.addEventListener('click', () => { const item = state.garantias.find(x => x.id === state.currentDetailId); if (item) exportReportPdf(item, 'full'); });
els.workshopPdfBtn?.addEventListener('click', () => { const item = state.garantias.find(x => x.id === state.currentDetailId); if (item) exportReportPdf(item, 'taller'); });
els.actionCancelBtn?.addEventListener('click', () => { state.currentAction = null; els.actionModal.close(); });
els.actionConfirmBtn?.addEventListener('click', async () => { try { await commitActionModal(); } catch (error) { notify(error.message, true); } });
els.quickFilterBar?.addEventListener('click', e => { const btn = e.target.closest('button[data-chip-type]'); if (!btn) return; const type = btn.dataset.chipType; const value = btn.dataset.chipValue || ''; if (type === 'validation') { els.validationFilter.value = value; if (value) els.operationalFilter.value = ''; } if (type === 'operational') { els.operationalFilter.value = value; if (value) els.validationFilter.value = ''; } renderGarantias(); });

els.registerPane?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await api.registerOperator({
      nombre: els.regNombre.value.trim(),
      email: els.regEmail.value.trim(),
      telefono: els.regTelefono.value.trim(),
      empresa: els.regEmpresa.value.trim(),
      numeroEconomico: els.regNumeroEconomico.value.trim(),
      password: els.regPassword.value,
    });
    els.registerMessage.textContent = data.message || 'Solicitud enviada.';
    els.registerMessage.classList.remove('hidden');
    els.registerPane.reset();
  } catch (error) {
    els.registerMessage.textContent = error.message;
    els.registerMessage.classList.remove('hidden');
  }
});

els.reportForm?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    if (state.editingGarantiaId) {
      await api.updateGarantia(state.editingGarantiaId, reportPayload());
      notify('Reporte actualizado.');
    } else {
      await api.createGarantia(reportPayload());
      notify('Reporte enviado.');
    }
    resetReportForm();
    setActiveNav('board');
    await loadGarantias();
  } catch (error) { notify(error.message, true); }
});
els.userForm?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = {
      nombre: els.userNombre.value.trim(),
      email: els.userEmail.value.trim(),
      role: els.userRole.value,
      empresa: els.userEmpresa.value.trim(),
      telefono: els.userTelefono.value.trim(),
      password: els.userPassword.value,
    };
    if (state.editingUserId) {
      if (!payload.password) delete payload.password;
      await api.updateUser(state.editingUserId, payload);
      notify('Usuario actualizado.');
    } else {
      await api.createUser(payload);
      notify('Usuario creado.');
    }
    resetUserForm();
    await loadUsers();
  } catch (error) { notify(error.message, true); }
});
els.companyForm?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = {
      nombre: els.companyNombre.value.trim(),
      contacto: els.companyContacto.value.trim(),
      telefono: els.companyTelefono.value.trim(),
      email: els.companyEmail.value.trim(),
      notas: els.companyNotas.value.trim(),
    };
    if (state.editingCompanyId) {
      await api.updateCompany(state.editingCompanyId, payload);
      notify('Empresa actualizada.');
    } else {
      await api.createCompany(payload);
      notify('Empresa guardada.');
    }
    resetCompanyForm();
    await loadCompanies(false);
  } catch (error) { notify(error.message, true); }
});

(async function boot() {
  try {
    await loadCompanies(true);
  } catch {}
  if (!state.token) return showAuth();
  try {
    const me = await api.me();
    state.user = me.user || me;
    await hydrateApp();
  } catch {
    localStorage.removeItem('carlabToken');
    state.token = '';
    showAuth();
  }
})();
