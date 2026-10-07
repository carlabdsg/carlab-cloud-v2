# Arquitectura Hispacold

Módulo aditivo de administrador. El código existente continúa usando sus rutas, scripts, roles y tablas.

- `index.js`: router `/api/hispacold`, comprobación de admin activo en `users`, validaciones, persistencia y bitácora.
- `catalog.js`: plantillas versionadas, checklist B2, códigos y referencias.
- `manuals.json`: catálogo de 34 fuentes con SHA-256. No contiene los PDF.
- `public/hispacold*`: interfaz independiente, estilos y entrada al menú basada en el `data-role` ya existente.
- Tablas propias: `hc_services`, `hc_events`, `hc_manuals`. Se inicializan idempotentemente con el primer acceso autorizado. No bloquean el inicio de los módulos anteriores si esta inicialización falla.
- Las únicas consultas a tablas existentes son de lectura: `users` y `fleet_units`.
- Archivos PDF en `hc_manuals.pdf` (BYTEA); alternativamente `private/hispacold-manuals/<id>.pdf` local, excluido por `.gitignore`. Nunca se sirven desde `public`.
- Guardado transaccional con bloqueo de fila, número secuencial y versión optimista. Los cambios de estado, actor, campos afectados y motivo se registran en `hc_events`.
- Fotos JPEG/PNG y firmas se almacenan en el JSON de la orden. El listado no transfiere evidencia; el detalle sí. Respalda las tablas `hc_*` con el resto de PostgreSQL.

## Integración mínima

En `server.js`, antes de `app.get('*', ...)`:

```js
// Additive admin module; its tables initialize only when an admin opens it.
require('./modules/hispacold').register(app, { pool, authRequired });
```

En `index.html` y `public/index.html`, antes de `</body>`:

```html
<script src="/hispacold-entry.js?v=1" defer></script>
```

No se cambian `app.js`, `app.min.js`, estilos antiguos, `agenda-runtime.js`, `package.json` ni `render.yaml`.

## Retirada

Retira las cinco líneas anteriores para ocultar/desconectar el módulo. Conserva las tablas `hc_*` para no perder expedientes. No modifica datos de reportes, agenda, stock o cobranza durante instalación ni uso.
