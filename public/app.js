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
  editingUserId: '',
  editingCompanyId: '',
  editingGarantiaId: '',
};

const api = {
  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers });
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
  getUnitHistory(numeroEconomico) { return this.request(`/api/history/unit/${encodeURIComponent(numeroEconomico)}`); }
};

const els = {};
function bind() {
  [
    'loginView','dashboardView','loginForm','loginEmail','loginPassword','loginError','registerForm','registerMessage','regNombre','regEmail','regTelefono','regEmpresa','regNumeroEconomico','regPassword',
    'tabLoginBtn','tabRegisterBtn','welcomeText','currentUserName','currentUserEmail','currentRoleBadge','avatarCircle','pageTitle','roleSummaryText','roleBrief','logoutBtn',
    'navBoardBtn','navNewReportBtn','navAnalyticsBtn','navHistoryBtn','navUsersBtn','navRequestsBtn','navCompaniesBtn','reportFormPanel','usersPanel','requestsPanel','companiesPanel','analyticsPanel','historyPanel','filtersPanel',
    'reportForm','numeroObra','modelo','numeroEconomico','empresa','kilometraje','contactoNombre','telefono','descripcionFallo','solicitaRefaccion','refaccionFields','detalleRefaccion',
    'evidencias','evidenciasRefaccion','previewEvidencias','previewRefaccion','firmaCanvas','clearSignatureBtn','cancelReportBtn','searchInput','validationFilter','operationalFilter',
    'garantiasList','garantiaCardTemplate','statTotal','statNew','statAccepted','statDone','listTitle','boardKicker','statusLegend','userForm','userId','userNombre','userEmail',
    'userRole','userEmpresa','userTelefono','userPassword','userSubmitBtn','userCancelEditBtn','usersList','emptyState','toast','requestsList','companiesList','companyForm','companyId','companyNombre','companyContacto','companyTelefono','companyEmail','companyNotas','companySubmitBtn','companyCancelEditBtn',
    'topCompanies','topModels','topIncidentTypes','repeatUnits','unitHistoryInput','unitHistoryBtn','unitHistoryResult'
  ].forEach(id => els[id] = document.getElementById(id));
}
bind();

const ctx = els.firmaCanvas?.getContext('2d');
if (ctx) {
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111';
}

function roleName(role) { return ({ admin: 'Admin', operador: 'Operador', operativo: 'Operativo', supervisor: 'Supervisor' })[role] || role; }
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
function drawPreviews(container, items) { if (!container) return; container.innerHTML = ''; items.forEach(src => { const img = document.createElement('img'); img.src = src; container.appendChild(img); }); }

els.evidencias?.addEventListener('change', async e => {
  const incoming = await Promise.all([...e.target.files].map(file => fileToCompressedDataUrl(file)));
  state.currentEvidence = [...state.currentEvidence, ...incoming];
  drawPreviews(els.previewEvidencias, state.currentEvidence);
  e.target.value = '';
});
els.evidenciasRefaccion?.addEventListener('change', async e => {
  const incoming = await Promise.all([...e.target.files].map(file => fileToCompressedDataUrl(file)));
  state.currentRefEvidence = [...state.currentRefEvidence, ...incoming];
  drawPreviews(els.previewRefaccion, state.currentRefEvidence);
  e.target.value = '';
});
els.solicitaRefaccion?.addEventListener('change', () => els.refaccionFields?.classList.toggle('hidden', !els.solicitaRefaccion.checked));

function resetReportForm() {
  state.editGaratiaId = '';
  els.reportForm?.reset();
  state.currentEvidence = []; state.currentRefEvidence = [];
  drawPreviews(els.previewEvidencias, []); drawPreviews(els.previewRefaccion, []);
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

function beginGarantiaEdit(item) {
  if (!item) return;

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
    img.onload = () => {
      ctx.drawImage(img, 0, 0, els.firmaCanvas.width, els.firmaCanvas.height);
      state.hasSignature = true;
    };
    img.src = item.firma;
  }

  switchPanel('report');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function reportPayload() {
  return {
    numeroObra: els.numeroObra?.value.trim(), modelo: els.modelo?.value.trim(), numeroEconomico: els.numeroEconomico?.value.trim(), empresa: els.empresa?.value.trim(), kilometraje: els.kilometraje?.value.trim(),
    contactoNombre: els.contactoNombre?.value.trim(), telefono: els.telefono?.value.trim(), tipoIncidente: selectedRadio('tipoIncidente'), descripcionFallo: els.descripcionFallo?.value.trim(), solicitaRefaccion: els.solicitaRefaccion?.checked,
    detalleRefaccion: els.detalleRefaccion?.value.trim(), evidencias: state.currentEvidence, evidenciasRefaccion: state.currentRefEvidence, firma: state.hasSignature ? els.firmaCanvas.toDataURL('image/png', .9) : '',
  };
}

function roleCopy(role) {
  return {
    admin: { title:'Cabina administrativa', summary:'Control total. Apruebas accesos, administras usuarios, ves analítica y conviertes reincidencias en acción.', panels:[['Gestión total','Usuarios, empresas y solicitudes en una sola vista.'],['Lectura comercial','Detecta patrones por empresa, modelo y unidad.'],['Control operativo','Puedes actuar igual que un operativo cuando haga falta.']], boardKicker:'ADMIN', listTitle:'Bandeja general del sistema', legend:'Portal corporativo con control total, solicitudes y lectura comercial.' },
    operador: { title:'Portal de operador', summary:'Reportas fallas, subes evidencia y ves el estatus sin depender de llamadas.', panels:[['Levantar incidencia','Captura la falla con datos, fotos, refacción y firma.'],['Seguimiento','Consulta si fue aceptada, rechazada o quedó pendiente.'],['Sin cruces','Solo ves tus reportes. No puedes decidir ni alterar revisiones.']], boardKicker:'OPERADOR', listTitle:'Mis reportes de garantía', legend:'Aquí ves solo tus reportes y su estatus actual.' },
    operativo: { title:'Mesa de validación operativa', summary:'Revisas reportes, decides si proceden y mueves el trabajo hasta terminar.', panels:[['Decisión','Acepta, rechaza o marca pendiente de revisión.'],['Flujo','Mueve el trabajo a en proceso, espera refacción o terminada.'],['Patrones','También ves unidades reincidentes para atacar la raíz.']], boardKicker:'OPERATIVO', listTitle:'Bandeja operativa', legend:'Aquí validas, autorizas y avanzas el trabajo.' },
    supervisor: { title:'Portal de supervisor', summary:'Consulta únicamente la información de tu empresa en modo corporativo de solo lectura.', panels:[['Visibilidad','Revisa empresas, unidades, evidencias y avances.'],['Lectura ejecutiva','Historial por unidad y top de fallas sin tocar procesos.'],['Sin edición','No cambias decisiones ni alteras procesos.']], boardKicker:'SUPERVISOR', listTitle:'Bandeja supervisada', legend:'Monitoreo integral con lectura operativa y comercial.' },
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
  [els.navBoardBtn,els.navNewReportBtn,els.navAnalyticsBtn,els.navHistoryBtn,els.navUsersBtn,els.navRequestsBtn,els.navCompaniesBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
  if (activeBtn && !activeBtn.classList.contains('hidden')) activeBtn.classList.add('active');
}
function switchPanel(panel) {
  state.activePanel = panel;
  els.reportFormPanel?.classList.toggle('hidden', panel !== 'report');
  els.usersPanel?.classList.toggle('hidden', panel !== 'users');
  els.requestsPanel?.classList.toggle('hidden', panel !== 'requests');
  els.companiesPanel?.classList.toggle('hidden', panel !== 'companies');
  els.analyticsPanel?.classList.toggle('hidden', panel !== 'analytics');
  els.historyPanel?.classList.toggle('hidden', panel !== 'history');
  const board = panel === 'board';
  els.filtersPanel?.classList.toggle('hidden', !board);
  setActiveNav(
    panel === 'report' ? els.navNewReportBtn :
    panel === 'users' ? els.navUsersBtn :
    panel === 'requests' ? els.navRequestsBtn :
    panel === 'companies' ? els.navCompaniesBtn :
    panel === 'analytics' ? els.navAnalyticsBtn :
    panel === 'history' ? els.navHistoryBtn :
    els.navBoardBtn
  );
}

function showDashboard() {
  els.loginView?.classList.add('hidden'); els.dashboardView?.classList.remove('hidden');
  els.navNewReportBtn?.classList.toggle('hidden', !isRole('operador','admin'));
  els.navUsersBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navRequestsBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navCompaniesBtn?.classList.toggle('hidden', !isRole('admin'));
  els.navAnalyticsBtn?.classList.toggle('hidden', !isRole('admin','supervisor','operativo'));
  els.navHistoryBtn?.classList.toggle('hidden', !isRole('admin','supervisor','operativo'));
  updateHeaderForRole(); switchPanel('board');
}
function showLogin() { els.dashboardView?.classList.add('hidden'); els.loginView?.classList.remove('hidden'); }

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
  try { doc.addImage(data, 'JPEG', x, y, w, h); } catch { try { doc.addImage(data, 'PNG', x, y, w, h); } catch {} }
}
async function exportPdf(item) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const logo = await getImageData('/logo.jpg');
  let y = 20;
  const textLine = (text, gap = 7, x = 14) => { doc.text(String(text), x, y); y += gap; };

  doc.setFillColor(250, 250, 252); doc.rect(0, 0, 210, 297, 'F');
  if (logo) await addPdfImage(doc, logo, 14, 12, 42, 42);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(18); doc.text('REPORTE DE GARANTÍA', 62, 24);
  doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.text('CARLAB SERVICIOS INTEGRALES', 62, 31);
  doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text(`Folio: ${item.folio || '—'}`, 196, 20, { align: 'right' });
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 27, { align: 'right' });

  y = 50;
  doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text(`Empresa: ${item.empresa || '—'}`, 18, 54);
  doc.text(`Unidad: ${item.numeroEconomico || '—'}`, 18, 62);
  doc.text(`Modelo: ${item.modelo || '—'}`, 18, 70);
  doc.text(`Obra: ${item.numeroObra || '—'}`, 105, 54);
  doc.text(`KM: ${item.kilometraje || '—'}`, 105, 62);
  doc.text(`Estatus: ${item.estatusValidacion || '—'} / ${item.estatusOperativo || '—'}`, 105, 70);

  y = 92;
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
      await addPdfImage(doc, src, x + 1, y + 1, 54, 40);
      x += 60; rowHeight = Math.max(rowHeight, 42);
    }
    y += rowHeight + 8;
  }
  if (item.firma) {
    y = ensurePdfSpace(doc, y, 42); doc.setFontSize(12); doc.setTextColor(20,20,20); textLine('Firma', 8);
    await addPdfImage(doc, item.firma, 16, y + 2, 86, 24); y += 34;
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

function renderCompanies() {
  if (!els.companiesList) return;
  els.companiesList.innerHTML = '';
  state.companies.forEach(item => {
    const row = document.createElement('div'); row.className = 'table-row';
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
  fillSelect(els.empresa, state.companies.filter(x => x.activo), 'Selecciona empresa');
  fillSelect(els.userEmpresa, state.companies.filter(x => x.activo), 'Sin empresa');
  fillSelect(els.regEmpresa, state.companies.filter(x => x.activo), 'Selecciona empresa');
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
    const area = node.querySelector('.action-area'); const baseRow = document.createElement('div'); baseRow.className = 'action-row'; if (isRole('admin')) baseRow.appendChild(button('Editar', 'btn btn-secondary', () => beginGarantiaEdit(item))); baseRow.appendChild(button('PDF', 'btn btn-ghost', () => exportPdf(item))); if (isRole('admin','operativo','supervisor')) baseRow.appendChild(button('Historial', 'btn btn-ghost', () => showAudit(item))); if (isRole('admin')) baseRow.appendChild(button('Eliminar', 'btn btn-ghost', async () => { if (!confirm(`¿Eliminar la orden ${item.numeroObra} de la unidad ${item.numeroEconomico}?`)) return; try { await api.deleteGarantia(item.id); notify('Orden eliminada.'); await loadGarantias(); } catch (error) { notify(error.message, true); } })); area.appendChild(baseRow);
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

async function loadGarantias() { state.garantias = await api.getGarantias(); renderGarantias(); }
async function loadUsers() { if (!isRole('admin')) return; state.users = await api.getUsers(); renderUsers(); }
async function loadCompanies() { state.companies = isRole('admin') ? await api.getCompanies() : await api.getPublicCompanies(); renderCompanies(); }
async function loadRequests() { if (!isRole('admin')) return; state.registrationRequests = await api.getRequests(); renderRequests(); }

async function renderUnitHistory() {
  const numero = els.unitHistoryInput?.value.trim();
  if (!numero) return notify('Escribe un número económico.');
  try {
    const history = await api.getUnitHistory(numero);
    els.unitHistoryResult.innerHTML = history.length ? history.map(item => `<div class="table-row"><div><strong>Obra ${escapeHtml(item.numeroObra)}</strong><div class="small muted">${escapeHtml(item.modelo)} · ${escapeHtml(item.empresa)}</div></div><div>${escapeHtml(item.tipoIncidente)}</div><div><span class="badge ${badgeClassValidation(item.estatusValidacion)}">${escapeHtml(item.estatusValidacion)}</span></div><div>${fmtDate(item.createdAt)}</div></div>`).join('') : '<div class="empty-state"><strong>Sin historial.</strong><span>No hay reportes para esa unidad.</span></div>';
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
    await loadCompanies(); await loadGarantias(); await loadUsers(); await loadRequests(); resetReportForm(); resetCompanyForm(); notify(`Bienvenido, ${state.user.nombre}.`);
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
els.navBoardBtn?.addEventListener('click', () => switchPanel('board'));
els.navNewReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('report'); });
els.navAnalyticsBtn?.addEventListener('click', () => switchPanel('analytics'));
els.navHistoryBtn?.addEventListener('click', () => switchPanel('history'));
els.navUsersBtn?.addEventListener('click', async () => { switchPanel('users'); await loadUsers(); });
els.navRequestsBtn?.addEventListener('click', async () => { switchPanel('requests'); await loadRequests(); });
els.navCompaniesBtn?.addEventListener('click', async () => { switchPanel('companies'); await loadCompanies(); });
els.cancelReportBtn?.addEventListener('click', () => { resetReportForm(); switchPanel('board'); });
els.userCancelEditBtn?.addEventListener('click', resetUserForm);
els.companyCancelEditBtn?.addEventListener('click', resetCompanyForm);
els.unitHistoryBtn?.addEventListener('click', renderUnitHistory);

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
    resetReportForm(); switchPanel('board'); await loadGarantias();
  }
  catch (error) { notify(error.message, true); }
});

els.userForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = { nombre: els.userNombre.value.trim(), email: els.userEmail.value.trim(), role: els.userRole.value, empresa: els.userEmpresa.value.trim(), telefono: els.userTelefono.value.trim(), password: els.userPassword.value };
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
    await loadCompanies(); await loadGarantias(); await loadUsers(); await loadRequests(); resetReportForm(); resetCompanyForm();
  } catch {
    localStorage.removeItem('carlabToken'); state.token = ''; showLogin();
  }
})();
