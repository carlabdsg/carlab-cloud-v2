/* Independent navigation entry: no replacements of legacy functions or handlers. */
(() => {
  const mount = () => {
    const nav = document.querySelector('.nav-stack .nav-group');
    if (!nav || document.getElementById('hcAdminEntry')) return;
    const a = document.createElement('a');
    a.id = 'hcAdminEntry'; a.className = 'nav-btn hidden'; a.href = '/hispacold.html';
    a.textContent = 'Aire acondicionado'; a.style.textDecoration = 'none';
    nav.appendChild(a);
    const sync = () => {
      const role = document.body.dataset.role;
      a.classList.toggle('hidden', !['admin', 'supervisor'].includes(role));
      a.href = role === 'supervisor' ? '/ac-supervisor.html' : '/hispacold.html';
    };
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-role'] });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
