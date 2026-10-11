# CARLAB Cloud · Climatización V3

Actualización del módulo de aire acondicionado existente: captura simplificada, Hispacold y Eberspächer, cámara y papelera recuperable.

## Cargar a GitHub

1. Descomprime `CARLAB-CLIMATIZACION-V3-ACTUALIZACION.zip`.
2. Abre la carpeta `carlab-cloud-v2` y sube **su contenido a la raíz del repositorio**, conservando `modules/`, `public/` y `tests/`. Reemplaza los archivos coincidentes del módulo. No crees una segunda carpeta `carlab-cloud-v2` dentro del repositorio.
3. Confirma los cambios y espera el despliegue de Render. Si el despliegue automático está desactivado, usa **Manual Deploy → Deploy latest commit**.
4. Recarga Carlab Cloud, inicia sesión como administrador y entra a **Aire acondicionado**. Cierra o recarga las pestañas anteriores del módulo.

El ZIP es incremental para una instalación donde el módulo Hispacold ya funciona. No incluye ni reemplaza `server.js`, `index.html`, `public/index.html`, `app.js`, `app.min.js`, Agenda, Stock, Cobranza, `package.json` ni `render.yaml`. No requiere nuevas dependencias de producción. Las tablas del módulo se actualizan de forma aditiva al primer acceso autorizado.

## Nueva orden

**Marca → servicio → tipo de atención**, en una sola pantalla:

- Marca del aire acondicionado: Hispacold o Eberspächer. Es independiente de la marca del autobús.
- Servicio: revisión y diagnóstico, mantenimiento preventivo, reparación menor o reparación mayor.
- Atención: normal o express. Express admite urgencia, evento extraordinario y asistencia en ruta.

La nueva orden utiliza una hoja con tres bloques: **¿Qué pasó? / ¿Qué hicimos? / ¿Cómo quedó?**. Para guardar la apertura se necesitan empresa, unidad, fecha y motivo. La fecha y el responsable aparecen precargados y se pueden editar.

**Guardar avance** conserva la orden en Carlab; **Completar orden** valida trabajo, prueba final, responsable y resultado. Revisión y reparación mayor requieren diagnóstico. Las reparaciones mayores conservan autorización y referencia técnica. Los trabajos sencillos no exigen resolver un checklist completo de mantenimiento.

Los apartados adicionales se despliegan cuando hacen falta: revisiones, diagnóstico, mediciones/circuito, refacciones, autorizaciones, próxima visita y firmas. Intervenir el circuito conserva sus requisitos técnicos. Un hallazgo o trabajo pendiente impide entregar como Operativo: usa Con observaciones o No operativo y documenta las recomendaciones.

Las órdenes anteriores conservan su formato, resultados, folios y validaciones originales; las nuevas usan V3. Desde una orden anterior se puede abrir un nuevo servicio copiando solo datos de identificación compatibles. Al cambiar a otra unidad de Flotas se limpian los datos del equipo anterior.

## Fotos y cámara

- **Tomar foto** abre la captura del dispositivo en móviles compatibles; en computadora solicita la cámara del navegador.
- **Elegir fotos** mantiene la carga desde galería o archivos.
- Hasta ocho fotografías por orden, comprimidas para guardar y consultar con rapidez. Se conservan etapa, componente, descripción y asociación a un punto de revisión.
- La cámara de computadora requiere HTTPS (Render lo proporciona) y autorización del navegador. Si no está disponible, puede usarse Elegir fotos. Cerrar la ventana de captura detiene la cámara.
- Se acepta JPEG, PNG y WebP. Si el dispositivo entrega un archivo HEIC que el navegador no convierte, expórtalo como JPEG.

## Eliminar y recuperar

Abre la orden, despliega **Más opciones → Eliminar orden**, registra el motivo y confirma. La orden pasa a **Papelera** y deja de aparecer en las órdenes normales, el expediente y los próximos servicios.

Desde Papelera, abre la orden y pulsa **Recuperar orden**. Se conserva contenido, folio y estado anterior. La eliminación y restauración quedan en la bitácora con administrador, motivo, fecha y versión. No hay borrado irreversible ni caducidad automática.

Dos administradores no pueden sobrescribir cambios silenciosamente: una versión desactualizada pide recargar. Un borrador local no puede revivir una orden eliminada.

## Biblioteca Eberspächer

El catálogo incorpora tres documentos de `Escritorio/VOLVO`, con referencias verificadas:

- `ilide.info-manual-ac-188dd-1-pr_3750c01509323902f8aa56426381e166.pdf`
- `Diagramas_AC188DD_mejorados_y_ampliados.pdf`
- `1.Fault Codes_1594267429_1643845004.pdf`

Después de desplegar, entra a **Biblioteca técnica → Importar manuales** y selecciona esos tres originales. No debes volver a importar los documentos Hispacold que ya están guardados. El importador identifica el contenido por SHA-256 y admite el diagrama de aproximadamente 71 MB mediante carga binaria. Espera a que aparezca Guardados antes de salir.

Los originales se almacenan en la biblioteca privada con acceso de administrador; **no van dentro de este ZIP ni deben subirse al repositorio público**. El catálogo reúne 34 documentos Hispacold y tres Eberspächer. El archivo de fallas contiene varias marcas: el módulo usa únicamente su sección KL2.

Las plantillas Eberspächer corresponden al AC-188DD/KL2 documentado. Su plan distingue semanal, mensual, trimestral, semestral y anual. Cada periodicidad muestra solo sus actividades aplicables; no marca revisiones realizadas automáticamente. No asigna cargas de refrigerante, presiones ni límites universales. Si se reduce un plan con resultados o fotos ya asociados a puntos que quedarían fuera, la interfaz conserva el plan anterior para proteger esa captura.

## Otras mejoras

- Tarjetas de órdenes con marca, unidad, atención, estado y pendiente; filtros por marca y servicio.
- Resumen del historial al seleccionar unidad y reutilización explícita de los datos del equipo de la misma marca.
- Próximos servicios separados por empresa, unidad y marca; una marca no sustituye el seguimiento de la otra.
- PDF compacto para una intervención sencilla, con anexos técnicos cuando existen datos. Se omiten listas opcionales sin utilizar.
- Borrador automático local por administrador; funciona durante una pérdida de conexión con la página ya abierta. No sincroniza entre dispositivos ni reemplaza Guardar avance. Al recuperar conexión, puede guardarse en Carlab.

## Validación y alcance de entrega

Se validó con PostgreSQL embebido y navegador: permisos, compatibilidad con órdenes anteriores, cierre sencillo y técnico, dos marcas, periodicidades, creación sin duplicados, eliminación/restauración, auditoría, circuito, historial, calendario, PDF y manuales grandes. Pruebas de navegador incluyen cámara simulada, carga de galería, borrador sin conexión, recuperación, captura móvil y ausencia de desbordamiento horizontal. La cámara física en tu teléfono debe verificarse al usar el sitio con su permiso de navegador.

Esta entrega no ha sido desplegada en producción desde la conversación. El ZIP está preparado para cargarlo a GitHub.
