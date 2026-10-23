# CARLAB AC V6.7 — Admin visual y eliminación de solicitudes

Actualización acumulada sobre el módulo AC V6.1 y posteriores. Incluye las mejoras V6.2–V6.6: QR, reportes por periodo, almacén AC independiente, recambios oficiales, etiquetas frontales y los dos perfiles de supervisor.

## Cargar a GitHub

1. Descomprime `CARLAB-AC-V6.7-ADMIN-Y-SOLICITUDES.zip`.
2. Sube **el contenido** de `carlab-cloud-v2` a la raíz de tu repositorio: reemplaza los archivos coincidentes y agrega los nuevos, conservando sus carpetas. No subas una segunda carpeta `carlab-cloud-v2` dentro del proyecto ni borres los archivos que no vienen en el ZIP.
3. Espera el despliegue habitual de Render y recarga el navegador.

No requiere dependencias nuevas ni SQL manual. El módulo agrega automáticamente tres campos de eliminación a las solicitudes existentes, sin borrar registros. El ZIP es una actualización para la instalación actual, no un repositorio completo desde cero. La entrega fue validada localmente; no se ha subido ni desplegado automáticamente.

## Nuevo portal de administrador

Admin abre en **Inicio**, con el mismo estilo del portal supervisor: indicadores, prioridades, próximos siete días y tarjetas de empresas con semáforo. Los números se calculan con la información registrada; no son telemetría del autobús.

- **Inicio:** cada indicador abre el listado correspondiente. Incluye acceso directo a Nueva orden y Solicitudes.
- **Flotas:** elige una empresa para consultar sus autobuses. **Administrar unidades** abre el control completo; **Registrar unidades** y **Gestionar empresas** permanecen disponibles. Los filtros, registros eliminados y exportación están en **Buscar y filtrar unidades**.
- **Órdenes:** conserva el llenado guiado, servicio express, borradores del dispositivo, evidencias, sugerencias de refacciones y reporte técnico. Los filtros se despliegan cuando los necesitas.
- **Solicitudes:** tarjetas de avance, orden vinculada y gestión del seguimiento, separadas en Activas y Eliminadas.
- **Refacciones y Reportes:** mantienen el inventario exclusivo de AC y los reportes por empresa, marca y periodo.
- **Más opciones:** Calendario, Refacciones, Reportes, Expedientes, Biblioteca técnica, Diagnóstico, Supervisores AC, Notificaciones y Papelera de órdenes.

En teléfono, cinco accesos permanecen abajo: Inicio, Flotas, Órdenes, Solicitudes y Más opciones. Las acciones de guardado de órdenes quedan por encima de esta barra. La campanita sigue disponible arriba. En computadora, Refacciones y Reportes también aparecen en el menú lateral.

Para crear o editar supervisores: **Admin → Aire acondicionado → Más opciones → Supervisores AC**. Los permisos y asignaciones por empresa o marca conservan su funcionamiento. La biblioteca sigue siendo exclusiva del administrador.

## Eliminar una solicitud de servicio

**Solicitudes → Activas → Eliminar solicitud.** El botón aparece directamente en la tarjeta y también al abrir **Gestionar solicitud**.

1. Escribe el motivo.
2. Confirma **Eliminar solicitud**.
3. Para recuperarla: **Solicitudes → Eliminadas → Recuperar**.

La eliminación es recuperable y exclusiva de admin. La solicitud desaparece de pendientes, listados de supervisores, notificaciones, historial visible de la unidad y reportes operativos. Su creación, seguimiento, motivo, administrador y recuperación quedan en la bitácora. Las solicitudes de refacciones conservan su flujo actual y no se eliminan desde este botón.

**La orden vinculada no se elimina ni se cancela.** Conserva su estado, trabajos, evidencias, reporte y seguimiento. El inventario tampoco cambia. Si esa orden sigue pendiente, continúa apareciendo como pendiente por sí misma. Al recuperar una solicitud, conserva su estado y la relación con la misma orden; no se crea una segunda orden.

Los reportes reflejan el estado actual de los registros al generarlos; no reconstruyen un corte histórico. La bitácora de la solicitud conserva las eliminaciones y recuperaciones.

## Validación

Pruebas locales con base de datos temporal y datos de demostración, sin modificar producción:

- 49 pruebas de regresión de servidor: operaciones, inventario, flotas, reportes, calendario, QR y aislamiento de supervisores.
- 5 pruebas adicionales de eliminación: permisos, motivo, versiones, exclusión de pendientes/notificaciones/reportes, recuperación y conservación exacta de órdenes e inventario.
- Navegador en computadora y teléfono emulado: inicio de admin, empresas, flotas, herramientas, creación de órdenes, conservación de borradores al navegar y eliminación/recuperación de solicitudes.
- Regresión visual de supervisores, QR y PDF técnico, catálogo oficial, sugerencias de recambios y captura móvil.

Los tests nuevos son `tests/ac-admin.test.cjs` y `tests/ac-admin.browser.cjs`. Usan el entorno existente de `tests/harness.cjs`. El navegador de prueba admite `PLAYWRIGHT_MODULE` y `QA_OUTPUT`. No se agregaron dependencias de pruebas a producción.
