# Auditoria CARLAB CLOUD

Fecha: 2026-07-09  
Modo: solo lectura, sin guardar, borrar ni modificar datos.

## Alcance revisado

Se reviso la sesion autenticada con rol visible `admin`, la navegacion por modulos, reglas de permisos en frontend, estados visuales, responsive escritorio/movil, generacion de PDF por botones visibles y codigo cargado (`app.min.js`, `style.min.css`, HTML).

Limitacion: no se probaron credenciales de otros roles ni endpoints backend con tokens separados. La matriz de permisos para roles no-admin se infiere del codigo frontend y de la visibilidad esperada; debe confirmarse en servidor.

## 1. Inventario de funciones actuales

- Autenticacion y registro: login interno, solicitud de acceso para operadores, aprobacion/rechazo por admin.
- Reportes: centro de mando, KPIs, filtros de validacion/operacion, tarjetas de garantia, ficha, PDF, historial/auditoria, aceptacion/rechazo, flujo operativo, solicitud de servicio, preparacion de cobro.
- Nuevo reporte: captura de obra, modelo, unidad, empresa, kilometraje, contacto, tipo de incidencia, descripcion, evidencias, camara, refaccion y firma.
- Analitica: top empresas, modelos, tipos de incidencia y unidades reincidentes.
- Historial por unidad: consulta por numero economico y busqueda dentro del historial.
- Agenda: calendario, chips de fechas, altas manuales, confirmacion/cancelacion/reprogramacion segun rol.
- Flotas: semaforo, KPIs, prioridad, unidades, filtros, ficha de unidad, alta individual, alta por lote y eliminacion por lote con previsualizacion.
- Servicios: reporte por periodo, empresa, unidad, estatus, tabla, PDF detallado y CSV.
- Refacciones: solicitudes ligadas a reportes, evidencias, estado de pieza, asignacion y actualizacion.
- Stock: catalogo, existencias, minimo, costo, precio, movimientos, entradas, salida a camion, venta y eliminacion.
- Cobranza: cotizaciones desde reportes terminados, estados de autorizacion/pago, conceptos, IVA/descuento/anticipo, PDF comercial, ventas directas y PDF de venta.
- Campanas: campanas por empresa, unidades, estados, evidencias, edicion/eliminacion admin y vista de unidad.
- Administracion: usuarios, solicitudes y empresas.

## Permisos observados/inferidos

- `admin`: ve y opera todos los modulos, incluidos usuarios, empresas, stock, cobranza y eliminaciones.
- `operador`: portal de reporte, seguimiento y agenda; segun texto del sistema no deberia decidir ni alterar revisiones.
- `operativo`: validacion, flujo operativo, agenda, flotas, servicios y campanas; puede gestionar flotas y actividades autorizadas.
- `supervisor`: lectura ejecutiva de empresa, reportes/analitica/historial/agenda; sin edicion.
- `supervisor_flotas`: flotas, historial, agenda, servicios, refacciones y campanas enfocadas a empresa; sin usuarios, empresas, stock ni cobranza.

## 2. Errores encontrados

| Severidad | Hallazgo | Evidencia |
|---|---|---|
| Critica | Controles destructivos amplios para admin sin protecciones fuertes visibles. | Hay borrar/eliminar en usuarios, empresas, reportes, flotas, stock, cobranza y campanas; varias acciones dependen de `confirm()`. |
| Critica | Permisos backend no verificados. | El frontend oculta o muestra modulos por rol, pero la auditoria no pudo confirmar enforcement de API por rol. Si el backend no valida, cualquier token con endpoint conocido podria operar fuera de UI. |
| Alta | Campo de contrasena de usuario es `type="text"`. | En Usuarios, `userPassword` se muestra como texto visible. |
| Alta | Validacion debil de correo/telefono. | En solicitudes se observan correos con formato dudoso y telefonos inconsistentes; los campos aceptan texto libre. |
| Alta | Agenda abre/queda en fecha futura/cancelada y mezcla estados en ingles. | Vista mostro `03/10/2026` activo y `CANCELLED`, aunque la auditoria fue el 2026-07-09. |
| Alta | Refacciones pendientes sin responsable y sin evidencia suficiente. | 18 pendientes, varias desde abril/junio, muchas con “Sin asignar” y “Sin fotos cargadas”. |
| Alta | Stock no refleja la carga real de refacciones pendientes. | Stock muestra 1 refaccion activa y 1 movimiento, mientras refacciones muestra 18 casos activos. |
| Alta | Cobranza tiene autorizadas con pago pendiente y sin contacto. | 31 cobros, `$38,094.40` por cobrar; tarjetas muestran “Cliente: Sin contacto”. |
| Media | Duplicidad/inconsistencia de catalogos. | Ejemplos visibles: `Reportes AUS` vs `Reportes aus`, `Volvo` y variantes de Volvo/Culiacan, modelos `Irizari6`, `i5 Eficcient`. |
| Media | PDF no fue confirmado por evento de descarga. | Clic en PDF detallado de Servicios y PDF comercial de Cobranza no genero errores de consola, pero el navegador integrado no reporto descarga en 10s. |
| Media | Menu admin en movil consume demasiada altura. | En vista movil, toda la navegacion aparece antes del contenido; no hay menu compacto. |
| Baja | Titulo/version incongruente. | Pagina dice `CARLAB CLOUD V3 | Cobranza 2`, URL/proyecto `carlab-cloud-v2`. |
| Baja | Textos y casing mezclados. | `CANCELLED`, `nueva / sin iniciar`, nombres con acentos faltantes o typos. |

## 3. Funciones faltantes

- Matriz de permisos visible y editable por rol, con prueba de acceso por modulo/accion.
- Soft delete, papelera y restauracion para usuarios, empresas, unidades, reportes, campanas, stock y cobranza.
- Bitacora global filtrable/exportable para acciones admin.
- Normalizador de empresas, unidades y modelos con deteccion de duplicados.
- SLA/aging para refacciones, agenda, cobranza y reportes en proceso.
- Vencimientos, comprobantes de pago, facturas y evidencia de cobranza.
- Reserva/compromiso de inventario contra refacciones solicitadas.
- Buscadores/filtros en usuarios, solicitudes, empresas, stock y cobranza.
- Confirmacion de descarga/estado de PDF dentro de la UI.
- Navegacion movil compacta para roles con muchos modulos.

## 4. Problemas de permisos

- La UI muestra controles admin extremadamente poderosos; se requiere confirmacion backend por accion, no solo visibilidad frontend.
- `operativo` puede gestionar flotas segun codigo; confirmar si debe poder crear/editar unidades o solo actualizar estado.
- `supervisor_flotas` puede ver refacciones/campanas/servicios; confirmar si las consultas estan filtradas por empresa en backend, no solo por UI.
- `supervisor` debe ser estrictamente lectura. Validar que no pueda invocar endpoints de escritura aunque manipule la UI.
- La creacion de usuarios permite elegir `Admin`; debe requerir privilegio fuerte, reautenticacion o flujo separado.

## 5. Mejoras prioritarias

1. Backend: validar rol/empresa en cada endpoint de escritura y lectura sensible.
2. Seguridad admin: soft delete, doble confirmacion para destructivos, bitacora obligatoria, restauracion.
3. Datos maestros: normalizar empresa/unidad/modelo, bloquear duplicados y limpiar variantes existentes.
4. Operacion: tablero SLA para refacciones, agenda y cobranza con responsables y fechas limite.
5. Inventario: enlazar stock con solicitudes de refaccion y movimientos a unidad/reporte.
6. Cobranza: completar contacto, fecha vencimiento, comprobantes, pagos parciales y estado facturado.
7. PDF: mostrar toast de “PDF generado/descargado” y registrar error visible si falla.
8. Movil: convertir sidebar admin en menu plegable o tabs horizontales compactas.

## 6. Clasificacion resumida

- Critica: permisos backend/destructivos.
- Alta: contrasena visible, validacion de identidad/contacto, agenda confusa, refacciones sin responsable, stock desconectado, cobranza pendiente sin contacto.
- Media: duplicados/inconsistencias, PDF sin confirmacion, movil con navegacion pesada.
- Baja: version/titulo y copy/casing.

## 7. Propuesta concreta de correcciones

- Implementar middleware de autorizacion por endpoint: `requireRole`, `requireCompanyScope`, `requireAdmin`, `requireReadOnly`.
- Crear tabla/coleccion `audit_log` global con actor, rol, accion, entidad, before/after, IP/UA y motivo.
- Reemplazar eliminaciones directas por `deletedAt`, `deletedBy`, `deleteReason`; agregar restauracion.
- Cambiar `userPassword` a `type=password`, agregar generador temporal y obligar cambio al primer login.
- Agregar validacion server-side de email, telefono E.164/MX, empresa requerida por rol y unicidad por email.
- Crear catalogos canonicos: empresas, unidades, modelos; aplicar fuzzy matching a variantes existentes antes de guardar.
- En agenda, default a “Hoy” y separar historico/canceladas de proximas entradas.
- En refacciones, exigir responsable, ETA, proveedor/compra/recepcion para avanzar estados.
- En stock, agregar reservas por reporte/refaccion y alertas cuando pendiente > disponible.
- En cobranza, bloquear “autorizada” sin contacto o metodo de pago definido, y agregar vencimiento/comprobante.
- En PDF, envolver `doc.save()` con manejo visible: exito, fallo y nombre de archivo generado.
- En movil, ocultar sidebar tras boton de menu y dejar contenido principal arriba.
