# Arquitectura de climatización

Módulo de climatización con operación administrativa y portal externo Supervisor AC. Conserva los flujos existentes y agrega rutas propias.

- `index.js`: router `/api/hispacold`, comprobación de admin activo en `users`, validaciones, persistencia y bitácora.
- `catalog.js`: plantillas versionadas, checklist B2, códigos y referencias.
- `manuals.json`: catálogo de 34 fuentes con SHA-256. No contiene los PDF.
- `public/hispacold*`: interfaz independiente, estilos y entrada al menú basada en el `data-role` ya existente.
- Tablas propias: `hc_services`, `hc_events`, `hc_manuals`. Se inicializan idempotentemente con el primer acceso autorizado. No bloquean el inicio de los módulos anteriores si esta inicialización falla.
- V1–V3 consultan `users` y `fleet_units`. V4 también crea/edita cuentas Supervisor AC y registra movimientos autorizados en las tablas existentes `stock_parts` y `stock_movements`.
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

En V1–V3 no se cambiaron los scripts principales. V4 agrega una redirección exclusiva para `supervisor_ac` al iniciar/recuperar sesión, amplía el CHECK del rol y bloquea sus llamadas a APIs generales. Los estilos anteriores, `agenda-runtime.js`, `package.json` y `render.yaml` se conservan.

## Retirada

Retira las cinco líneas anteriores para ocultar/desconectar el módulo. Conserva las tablas `hc_*` para no perder expedientes. La instalación conserva reportes, agenda y cobranza. En V4, las operaciones explícitas de Refacciones AC escriben en Stock; preserva también las tablas `ac_*` para conservar solicitudes y trazabilidad.

## Versión 2

- Tipo `express`, guías por síntoma y flujos de captura de 3 a 5 pasos.
- `GET /history?company=&unit=&offset=`: historial y agregados sin transmitir fotos o firmas en el listado.
- `GET /calendar?today=&from=&to=&bucket=&day=&offset=`: último seguimiento vigente por unidad. Los valores de fecha se calculan según el día local que envía la interfaz.
- Columna `hc_services.client_key` e índice único parcial `(created_by, client_key)`: creación idempotente por borrador y administrador. Una repetición devuelve `replayed: true`; la interfaz conserva la captura local y permite actualizar el folio ya existente.
- `hispacold-drafts.js`: borradores locales IndexedDB, nombres separados por administrador; sin sincronización entre dispositivos. Los datos del formulario se guardan aun cuando están incompletos. Fotos y firmas se incluyen.
- `hispacold-pdf.js` y `public/vendor/hc-*`: jsPDF y AutoTable empaquetados con licencias MIT. No se agrega dependencia de producción a npm ni se usa un servicio externo de PDF.
- Evidencia con `phase`, `component`, `checkId`; trabajos detectados en `findings`; `sourceOrderId` para nueva intervención vinculada. Los documentos anteriores admiten las propiedades nuevas ausentes.
- Las tablas y comprobaciones de permisos se mantienen separadas de los módulos anteriores.

## Versión 3 · dos marcas y captura adaptable

- `brand` (`hispacold`/`eberspaecher`), `attention` (`normal`/`express`) y `formVersion:3` para órdenes nuevas. El `type:express` histórico permanece compatible; V3 separa servicio de atención.
- `eberspaecher.js` y `eberspaecher-manuals.json` añaden plantilla AC-188DD/KL2 y tres fuentes. `catalog.forBrand()` conserva datos separados y `templateFor()` filtra el preventivo por intervalo. Los exports legacy se conservan.
- `GET /catalog` expone `brands`, `brandCatalogs` y los 37 manuales con disponibilidad; los PDF requieren autenticación y administrador activo.
- `PUT /manuals/:id/raw` admite PDF binario de hasta 90 MB, con hash original verificado. El importador usa esta ruta para evitar expansión Base64. La ruta JSON anterior sigue disponible.
- Columnas aditivas `deleted_at`, `deleted_by`, `delete_reason`. `DELETE /services/:id` acepta `{version,reason}` y `POST /services/:id/restore` acepta `{version}`. Ambas operaciones son transaccionales y auditadas. `GET /services?deleted=true` consulta papelera; GET detalle conserva acceso al historial eliminado. No se eliminan filas ni se reutilizan folios.
- Historial y calendario omiten registros en papelera. El calendario mantiene fechas independientes por empresa/unidad/marca. Los reintentos de creación no reviven órdenes eliminadas. Las copias existentes conservan su referencia aunque el origen pase a papelera.
- Formulario y reportes adaptables para nuevas órdenes; las órdenes anteriores conservan sus validaciones originales. No se admite convertir la versión de un registro para saltar controles de cierre.
- Cámara: captura nativa móvil mediante `capture=environment`, y `getUserMedia` en computadora con parada de pistas al cerrar/cancelar. La evidencia se convierte a JPEG y sigue en el payload protegido.

Guía de instalación y uso: `CLIMATIZACION-ACTUALIZACION-V3.md` en la raíz.

## Versión 4 · Supervisor AC, solicitudes, inventario y notificaciones

- `operations.js` monta `/api/ac`. Usa el JWT existente y consulta el usuario activo en cada llamada; solo permite `admin` y `supervisor_ac` con rol vigente. La marca externa se obtiene de `users.empresa` (`Hispacold`/`Eberspächer`) y nunca se toma del filtro del cliente.
- Las APIs `/orders`, `/requests`, `/units`, `/catalog`, `/manuals` y `/upcoming` limitan datos por marca. El externo no recibe costos/precios internos ni órdenes en papelera. Las operaciones administrativas tienen un guardián adicional de administrador.
- El rol se crea mediante `/api/ac/users` (bcrypt) desde Usuarios o Accesos Supervisor AC. Las APIs originales de usuarios mantienen sus roles existentes; el formulario intercepta únicamente Supervisor AC. No convierte cuentas de otros roles en este rol.
- `ac_requests` y `ac_request_events`: solicitudes SAC/RAC, versiones optimistas, bitácora y creación idempotente por usuario/clientKey. Crear orden bloquea la solicitud y genera el expediente una sola vez.
- `ac_part_profiles` añade compatibilidad/modelos/fotografía a un `stock_parts.id` real. No duplica cantidades. `ac_inventory_events` documenta movimientos AC y evita reintentos duplicados. Entregar una solicitud aprobada bloquea solicitud y pieza, comprueba existencia, escribe el movimiento y cambia el estado en una transacción. No hay reservas de Stock.
- `ac_notifications` tiene claves de evento únicas; `ac_notification_reads` conserva lectura por usuario. Los eventos de órdenes se crean en la misma transacción de guardado. Los recordatorios se generan idempotentemente al consultar y los resueltos se filtran.
- `ac-operations.js/css`: bandejas administrativas y externas, solicitudes, catálogo, cuentas y campana con refresco de 30 segundos. `ac-supervisor.html` ofrece el portal externo. `ac-main-entry.js` añade la selección de rol/marca al formulario existente de usuarios.
- `server.js` restringe los JWT del nuevo rol a `/api/ac/*` y `/api/auth/me`; no agrega Supervisor AC a permisos de Flotas, Stock, Cobranza o Garantías. Los scripts principales redirigen ese rol antes de montar el tablero existente.

Instalación y uso: `CLIMATIZACION-ACTUALIZACION-V4.md`.
