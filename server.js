// CARLAB SERVER FIXED (RENDER READY)

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'carlab-dev-secret';

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// HEALTH CHECK (CLAVE PARA RENDER)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// TEST
app.get('/api/test', (_req, res) => {
  res.json({ ok: true, mensaje: 'CARLAB OK' });
});

// FRONTEND
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START SERVER
app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto', PORT);
});
