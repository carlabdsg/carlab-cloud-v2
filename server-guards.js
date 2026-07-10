const fs = require('fs');
const path = require('path');
const express = require('express');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidMxPhone(value) {
  const digits = phoneDigits(value);
  return digits.length === 10 || (digits.startsWith('52') && digits.length === 12) || (digits.startsWith('521') && digits.length === 13);
}

function fail(res, message) {
  return res.status(400).json({ error: message });
}

function validatePublicOperator(req, res, next) {
  const { email, telefono, password } = req.body || {};
  if (!isValidEmail(email)) return fail(res, 'Correo inválido.');
  if (!isValidMxPhone(telefono)) return fail(res, 'Teléfono inválido. Usa 10 dígitos MX o formato 52/521.');
  if (String(password || '').length < 8) return fail(res, 'La contraseña debe tener al menos 8 caracteres.');
  return next();
}

function validateCompany(req, res, next) {
  const { email, telefono } = req.body || {};
  if (email && !isValidEmail(email)) return fail(res, 'Correo de empresa inválido.');
  if (telefono && !isValidMxPhone(telefono)) return fail(res, 'Teléfono de empresa inválido. Usa 10 dígitos MX o formato 52/521.');
  return next();
}

function validateUser(req, res, next) {
  const { email, telefono, password } = req.body || {};
  const isPatch = req.method === 'PATCH';
  if (email && !isValidEmail(email)) return fail(res, 'Correo de usuario inválido.');
  if (telefono && !isValidMxPhone(telefono)) return fail(res, 'Teléfono de usuario inválido. Usa 10 dígitos MX o formato 52/521.');
  if ((!isPatch || password) && String(password || '').length < 8) return fail(res, 'La contraseña debe tener al menos 8 caracteres.');
  return next();
}

const routeGuards = {
  'POST /api/public/register-operator': validatePublicOperator,
  'POST /api/companies': validateCompany,
  'PATCH /api/companies/:id': validateCompany,
  'POST /api/users': validateUser,
  'PATCH /api/users/:id': validateUser,
};

function injectAuditFixes(html) {
  let output = String(html || '');
  if (!output.includes('/audit-fixes.css')) {
    output = output.replace(
      '<link rel="stylesheet" href="/style.min.css" />',
      '<link rel="stylesheet" href="/style.min.css" />\n  <link rel="stylesheet" href="/audit-fixes.css" />'
    );
  }
  output = output.replace(
    '<input id="regPassword" type="password" required />',
    '<input id="regPassword" type="password" autocomplete="new-password" minlength="8" required />'
  );
  output = output.replace(
    '<section id="dashboardView" class="hidden shell">',
    '<section id="dashboardView" class="hidden shell">\n      <button id="mobileMenuBtn" class="mobile-menu-btn" type="button" aria-expanded="false">Menú</button>'
  );
  output = output.replace(
    '<input id="userPassword" type="text" required />',
    '<input id="userPassword" type="password" autocomplete="new-password" minlength="8" required />'
  );
  if (!output.includes('/audit-fixes.js')) {
    output = output.replace(
      '<script src="/app.min.js"></script>',
      '<script src="/app.min.js"></script>\n  <script src="/audit-fixes.js"></script>'
    );
  }
  return output;
}

function auditHtmlMiddleware(req, res, next) {
  if (req.method !== 'GET' || !['/', '/index.html'].includes(req.path)) return next();
  const filePath = path.join(process.cwd(), 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (error, html) => {
    if (error) return next(error);
    res.type('html').send(injectAuditFixes(html));
  });
}

function wrapStaticInjection() {
  const originalUse = express.application.use;
  let injected = false;
  express.application.use = function guardedUse(...args) {
    const includesStatic = args.some((arg) => arg && arg.name === 'serveStatic');
    if (!injected && includesStatic) {
      injected = true;
      originalUse.call(this, auditHtmlMiddleware);
    }
    return originalUse.call(this, ...args);
  };
}

function wrapRoute(methodName) {
  const original = express.application[methodName];
  express.application[methodName] = function guardedRoute(path, ...handlers) {
    const guard = routeGuards[`${methodName.toUpperCase()} ${path}`];
    if (!guard || handlers.includes(guard)) return original.call(this, path, ...handlers);
    const insertAt = Math.max(0, handlers.length - 1);
    const guardedHandlers = [...handlers.slice(0, insertAt), guard, ...handlers.slice(insertAt)];
    return original.call(this, path, ...guardedHandlers);
  };
}

wrapRoute('post');
wrapRoute('patch');
wrapStaticInjection();
