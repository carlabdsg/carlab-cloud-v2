// SERVER CARLAB LIMPIO
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// HEALTH CHECK (CLAVE PARA RENDER)
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// TEST
app.get('/api/test', (req, res) => {
  res.json({ mensaje: 'CARLAB funcionando' });
});

// FRONTEND
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START
app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto', PORT);
});
