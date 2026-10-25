# CARLAB AC V6.11 — Reportes de fallas e incidencias

Nuevo módulo **Reportes AC**, disponible para administrador, supervisor de marca y supervisor de flota. Los informes estadísticos semanales y mensuales ahora se identifican como **Informes**.

## Uso

1. Entra en **Reportes AC → Reportar falla**, o abre una unidad de Flotas y pulsa **Reportar falla**. El acceso por QR conserva la autenticación y abre la misma ficha de unidad.
2. Selecciona la unidad y la incidencia. Describe lo observado, indica la condición reportada y la prioridad. Fecha, ubicación, contacto y fotos están disponibles en la captura. Al iniciar desde la unidad, empresa y marca se completan automáticamente.
3. Se genera un folio **IAC-000001** y se notifica mediante la campana. No se crea una orden automáticamente.
4. Carlab puede revisar, asignar un responsable administrador, pedir información, programar atención, crear una orden o vincular una existente de la misma unidad, empresa y marca.
5. Cuando termina la orden, el reporte queda **Por confirmar**. El supervisor o administrador registra el resultado: **Confirmar solución** o **La falla continúa**. Si continúa, vuelve a revisión y conserva el vínculo histórico de la orden anterior; se puede crear otra orden para la nueva atención.

## Funciones

- Captura con categorías visuales: no enfría, enfriamiento insuficiente, sin ventilación, fuga, ruido/vibración, alarma y otra incidencia.
- Unidad elegida entre las flotas activas autorizadas; búsqueda por empresa o número económico.
- Fotografía desde cámara cuando el dispositivo/navegador ofrece captura, o carga de archivos. Hasta cuatro fotos por envío y ocho en total; JPEG/PNG/WebP se comprimen antes de guardar.
- Bandeja con Nuevos, Urgentes, En seguimiento y Por confirmar; búsqueda por folio, empresa, unidad o descripción; filtros por estado, marca y archivo.
- Aviso si ya existe una incidencia abierta de la misma categoría y unidad: añadir descripción/fotos al reporte existente o registrar otro evento con motivo.
- Señal de posibles reincidencias basada en otros reportes de la misma categoría y unidad registrados durante los últimos 90 días. La coincidencia no equivale a un diagnóstico técnico.
- Seguimiento con responsable, fecha de atención, comentarios, evidencias y bitácora. Se muestran las últimas 100 actualizaciones; los eventos anteriores permanecen almacenados.
- Conversión a orden en borrador con empresa, unidad, marca, descripción y fotografías. Se conserva el tipo de servicio; se puede elegir atención normal/express y periodicidad cuando es preventivo.
- Resolución sin orden: Carlab registra una conclusión y solicita confirmación. Descartar exige un motivo; reabrir también.
- PDF formal de cada reporte con identificación, descripción, conclusión cuando existe, bitácora y fotografías.
- Archivo y recuperación exclusivos del administrador, con motivo y control de versión. No eliminan la orden vinculada.
- Atención programada integrada al calendario. Los informes semanales/mensuales incluyen reportes registrados en el periodo y abiertos actuales, separados de las solicitudes de servicio/refacciones.

## Permisos y continuidad

- Supervisor de marca: únicamente reportes y unidades de su marca, en las empresas correspondientes.
- Supervisor de flota: únicamente los de su empresa, incluyendo las marcas que tenga registradas.
- Supervisores pueden reportar, aportar información/fotos y confirmar el resultado. No crean órdenes, asignan responsables, cambian la gestión de Carlab ni archivan reportes.
- La condición descrita por el usuario no reemplaza la evaluación técnica de la unidad. Los pendientes pueden generar alertas de atención.
- Cada incidencia usa un único registro en el canal de solicitudes, con metadatos propios. No aparece duplicada en la bandeja normal de solicitudes ni en los conteos de solicitudes de los informes.
- Biblioteca técnica, inventario AC, órdenes existentes, QR e historial mantienen sus permisos y funcionamiento.

## Instalar en GitHub / Render

1. Descomprime `CARLAB-AC-V6.11-REPORTES-INCIDENCIAS.zip`.
2. Sube **el contenido de la carpeta `carlab-cloud-v2`** a la raíz de tu repositorio. Conserva las carpetas `public`, `modules` y `tests`; reemplaza los archivos coincidentes. No subas el ZIP como único archivo ni crees una carpeta adicional dentro del repositorio.
3. Conserva los archivos del proyecto que no vienen en esta actualización.
4. Espera a que Render termine el despliegue del commit que contiene estos archivos y recarga el sitio. Debe aparecer **Reportes AC** en la navegación.

Es una actualización acumulada para instalaciones AC V6.1 o posteriores. Incluye las mejoras hasta V6.10. No requiere nuevas dependencias de producción. La tabla adicional `ac_incidents` y sus índices se crean automáticamente al inicializar el módulo AC, sin borrar registros existentes. Mantén la configuración actual de Render y su base de datos.

**Preparado y probado localmente; no publicado automáticamente en GitHub ni Render.**

## Validación local

- Suite existente y nueva: 116 comprobaciones, sin fallos.
- Pruebas adicionales del flujo de reincidencia, nueva orden, confirmación tras reapertura, duplicados y control de versiones.
- Chrome y WebKit (motor de Safari): administrador y supervisor, escritorio y teléfono emulado.
- Captura desde la ficha, fotografías, comentarios, confirmación, filtros, PDF y controles restringidos por perfil.
- Duplicados, solicitud de información, conversión a preventivo con periodicidad y archivo/recuperación desde la interfaz.
- Revisión visual del PDF y de las vistas en escritorio y móvil.

Pruebas nuevas: `tests/ac-incidents.test.cjs` y `tests/ac-incidents.browser.cjs`. Utilizan una base temporal y no acceden a producción. La prueba de navegador acepta `PLAYWRIGHT_MODULE`, `BROWSER_ENGINE` y `QA_OUTPUT`. La apertura física de la cámara depende de permisos y del navegador del dispositivo; se verificaron la opción de captura y el procesamiento de fotografías con archivos de prueba.
