(function () {
  const today = () => new Date().toISOString().slice(0, 10);
  const emailOk = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
  const phoneDigits = (value = '') => String(value || '').replace(/\D/g, '');
  const phoneOk = (value = '') => {
    const digits = phoneDigits(value);
    return !digits || digits.length === 10 || (digits.startsWith('52') && digits.length === 12) || (digits.startsWith('521') && digits.length === 13);
  };
  const statusLabels = {
    proposed: 'Propuesta',
    confirmed: 'Confirmada',
    waiting_operator: 'Esperando operador',
    cancelled: 'Cancelada',
    canceled: 'Cancelada',
    completed: 'Completada',
  };

  function toast(message, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return window.alert(message);
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(el.dataset.auditTimer);
    el.dataset.auditTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setMobileMenu(open) {
    document.body.classList.toggle('mobile-menu-open', !!open);
    document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', String(!!open));
  }

  function translateScheduleStatuses() {
    document.querySelectorAll('#scheduleList .topbar-kicker, #scheduleList .badge').forEach((el) => {
      const key = String(el.textContent || '').trim().toLowerCase();
      if (statusLabels[key]) el.textContent = statusLabels[key];
    });
  }

  function validateUserSubmit(event) {
    const form = event.target;
    if (form?.id !== 'userForm') return;
    const email = document.getElementById('userEmail')?.value || '';
    const telefono = document.getElementById('userTelefono')?.value || '';
    const password = document.getElementById('userPassword')?.value || '';
    const editing = !!document.getElementById('userId')?.value;
    let message = '';
    if (!emailOk(email)) message = 'Captura un correo válido para el usuario.';
    else if (!phoneOk(telefono)) message = 'Captura un teléfono válido: 10 dígitos MX o formato 52/521.';
    else if (!editing && password.length < 8) message = 'La contraseña debe tener al menos 8 caracteres.';
    else if (editing && password && password.length < 8) message = 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toast(message, true);
  }

  function validateCompanySubmit(event) {
    const form = event.target;
    if (form?.id !== 'companyForm') return;
    const email = document.getElementById('companyEmail')?.value || '';
    const telefono = document.getElementById('companyTelefono')?.value || '';
    let message = '';
    if (email && !emailOk(email)) message = 'Captura un correo válido para la empresa.';
    else if (!phoneOk(telefono)) message = 'Captura un teléfono válido: 10 dígitos MX o formato 52/521.';
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toast(message, true);
  }

  function patchPdfNotice() {
    const api = window.jspdf?.jsPDF?.API;
    if (!api || api.__carlabPdfNotice) return;
    const originalSave = api.save;
    api.save = function saveWithNotice(filename, ...args) {
      const result = originalSave.call(this, filename, ...args);
      toast(`PDF generado: ${filename || 'archivo.pdf'}`);
      return result;
    };
    api.__carlabPdfNotice = true;
  }

  function bootAuditFixes() {
    const dashboard = document.getElementById('dashboardView');
    if (dashboard && !document.getElementById('mobileMenuBtn')) {
      dashboard.insertAdjacentHTML('afterbegin', '<button id="mobileMenuBtn" class="mobile-menu-btn" type="button" aria-expanded="false">Menú</button>');
    }
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => setMobileMenu(!document.body.classList.contains('mobile-menu-open')));
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setMobileMenu(false)));
    document.addEventListener('submit', validateUserSubmit, true);
    document.addEventListener('submit', validateCompanySubmit, true);
    document.getElementById('userPassword')?.setAttribute('minlength', '8');
    document.getElementById('userPassword')?.setAttribute('autocomplete', 'new-password');
    document.getElementById('scheduleDateInput')?.setAttribute('value', today());
    document.getElementById('navScheduleBtn')?.addEventListener('click', () => {
      setTimeout(() => {
        const input = document.getElementById('scheduleDateInput');
        if (input && !input.value) input.value = today();
        translateScheduleStatuses();
      }, 250);
    });
    const scheduleList = document.getElementById('scheduleList');
    if (scheduleList) new MutationObserver(translateScheduleStatuses).observe(scheduleList, { childList: true, subtree: true });
    translateScheduleStatuses();
    patchPdfNotice();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAuditFixes);
  else bootAuditFixes();
})();
