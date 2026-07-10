(function () {
  const token = () => localStorage.getItem('carlabToken') || '';
  function decodeUser() {
    try {
      const part = token().split('.')[1];
      return JSON.parse(decodeURIComponent(atob(part.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c => '%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch { return null; }
  }
  function toast(message, isError) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }
  function lockCompany(select, empresa) {
    if (!select || !empresa) return;
    select.innerHTML = '';
    const option = document.createElement('option');
    option.value = empresa;
    option.textContent = empresa;
    option.selected = true;
    select.appendChild(option);
    select.value = empresa;
    select.disabled = true;
    select.setAttribute('aria-readonly', 'true');
  }
  async function loadOperatorUnits() {
    const user = decodeUser();
    if (!user || user.role !== 'operador') return;
    lockCompany(document.getElementById('empresa'), user.empresa);
    lockCompany(document.getElementById('scheduleManualEmpresa'), user.empresa);

    const unitSelect = document.getElementById('scheduleManualUnidad');
    if (!unitSelect) return;
    unitSelect.innerHTML = '<option value="">Cargando unidades…</option>';
    try {
      const response = await fetch('/api/operator/units', {
        headers: { Authorization: `Bearer ${token()}`, 'Cache-Control': 'no-store' },
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar unidades.');
      unitSelect.innerHTML = '<option value="">Selecciona unidad</option>' +
        data.map(u => `<option value="${String(u.numeroEconomico || '').replace(/"/g,'&quot;')}">${u.numeroEconomico || ''}${u.modelo ? ' · '+u.modelo : ''}</option>`).join('');
      if (!data.length) unitSelect.innerHTML = '<option value="">No hay unidades registradas para esta empresa</option>';
    } catch (error) {
      unitSelect.innerHTML = '<option value="">Error al cargar unidades</option>';
      toast(error.message, true);
    }
  }
  function apply() {
    const user = decodeUser();
    if (!user || user.role !== 'operador') return;
    lockCompany(document.getElementById('empresa'), user.empresa);
    lockCompany(document.getElementById('scheduleManualEmpresa'), user.empresa);
  }
  document.addEventListener('click', (event) => {
    if (event.target?.closest('#opNavScheduleBtn, #navScheduleBtn')) setTimeout(loadOperatorUnits, 50);
    if (event.target?.closest('#opNavNewBtn, #navNewReportBtn')) setTimeout(apply, 50);
  }, true);
  document.addEventListener('submit', (event) => {
    const user = decodeUser();
    if (!user || user.role !== 'operador') return;
    if (event.target?.id === 'reportForm') lockCompany(document.getElementById('empresa'), user.empresa);
    if (event.target?.id === 'scheduleManualForm') lockCompany(document.getElementById('scheduleManualEmpresa'), user.empresa);
  }, true);
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(() => { apply(); loadOperatorUnits(); }, 600);
})();