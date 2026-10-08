# CARLAB Cloud · Hispacold 2

Actualización del módulo de aire acondicionado ya instalado. Conserva las órdenes, folios y PDF importados de la primera versión.

## Instalar en GitHub y Render

1. Descomprime `CARLAB-HISPACOLD-V2-ACTUALIZACION.zip`.
2. En el repositorio donde ya instalaste Hispacold, sube **el contenido** de la carpeta `carlab-cloud-v2` a la raíz, conservando las subcarpetas. Reemplaza los archivos del módulo con los del ZIP.
3. Confirma los cambios y espera el despliegue automático de Render; si no está habilitado, selecciona **Manual Deploy → Deploy latest commit**.
4. Recarga Carlab Cloud e ingresa a **Aire acondicionado** como administrador. Si mantienes una pestaña antigua abierta, recárgala después del despliegue.

No borres archivos existentes. Este ZIP es incremental: no reemplaza `server.js`, los `index.html` principales, `app.js`, Agenda, Stock, Cobranza, `package.json` ni `render.yaml`. Usa la integración que ya instalaste con el primer ZIP. No necesitas volver a importar tus manuales ni reinstalar dependencias de producción.

La actualización añade un campo interno para reconocer reintentos de guardado y un índice a las tablas propias del módulo, sin borrar registros. No modifica tablas de las otras áreas.

## Cinco formatos, pasos adaptados

- **Servicio express:** evento → atención → entrega. Para urgencias, eventos extraordinarios y asistencia en ruta; tres puntos de validación y campos opcionales de tiempos, mediciones y circuito.
- **Reparación menor:** recepción → intervención → entrega.
- **Revisión:** recepción → inspección → diagnóstico → entrega.
- **Preventivo:** recepción → revisión → mantenimiento → entrega.
- **Reparación mayor:** recepción → revisión → mediciones → reparación → entrega.

El avance muestra pasos con datos completos y puntos revisados. En Entrega se indica qué falta para cerrar. Los apartados opcionales se despliegan cuando hacen falta; si se intervino el circuito se solicitan sus datos técnicos. Guardar una orden con estado Borrador permite continuar después.

## Las diez mejoras

1. **Borrador automático recuperable.** Se guarda en este dispositivo y navegador, separado por administrador, incluso durante una pérdida de conexión con la página abierta. Se recupera desde la pantalla de Órdenes después de volver a entrar. El botón **Guardar orden** confirma el guardado en Carlab. Borrar datos del navegador elimina borradores locales; las órdenes ya guardadas en Carlab se conservan. El borrador local no se sincroniza entre equipos.
2. **Expediente por unidad.** Historial por empresa y económico, intervenciones, importes completados, últimos conceptos de refacción/material, síntomas seleccionados repetidos y próxima fecha vigente. También aparece un resumen al elegir una unidad en el formulario.
3. **Checklist ágil.** Avance, filtros de pendientes/hallazgos, observaciones y fotografía directamente desde el punto revisado. No se marcan inspecciones automáticamente.
4. **Evidencia por etapa.** Antes, durante y después, componente y vínculo al punto de revisión. Las fotos de la versión anterior permanecen como Sin clasificar hasta que las clasifiques.
5. **PDF CARLAB descargable.** Primera página ejecutiva, expediente técnico, evidencias organizadas, firmas, fuentes y bitácora. Folio, versión y numeración en cada página. Las secciones sin información se omiten. El PDF se genera en el navegador, sin enviar datos a un servicio externo.
6. **Próximos servicios.** Calendario, vencidos, próximos siete días y mes. Solo considera órdenes completadas: un preventivo nuevo sustituye la fecha anterior; un express sin nueva fecha no elimina un mantenimiento pendiente. Un preventivo completado sin nueva fecha retira la fecha vieja. Una orden completada de otro tipo con fecha explícita puede establecer el siguiente seguimiento de esa unidad. No crea ni modifica citas de Agenda.
7. **Diagnóstico por síntoma.** Puntos iniciales de revisión y su referencia para no enfría, enfría poco, cortes, ruido, congelamiento, agua, ventilación y antivaho. No establece cargas, presiones ni límites universales.
8. **Manuales en contexto.** El botón de cada punto o guía abre su documento en la página indicada. Se reutiliza la biblioteca privada existente.
9. **Detectado / autorizado / realizado.** Trabajos adicionales con decisión, persona que autoriza y notas. Los no autorizados o pendientes se reflejan en la entrega. Para cerrar con trabajos pendientes, usa Con observaciones o No operativo y documenta las recomendaciones.
10. **Siguiente servicio desde una orden anterior.** Reutiliza identidad de la unidad, equipo y referencia de plan. No copia mediciones, diagnóstico, checklist resuelto, fotos, firmas, importes ni decisiones. Puedes elegir un tipo de servicio distinto.

## Conservación y compatibilidad

- Los servicios y manuales de V1 permanecen disponibles. Las nuevas propiedades son opcionales para expedientes anteriores.
- Los estados completados/cancelados conservan la reapertura con motivo y la bitácora.
- Se mantiene el control de versiones para evitar que dos sesiones sobrescriban una orden silenciosamente.
- Los reintentos de una creación identifican el mismo borrador para evitar folios duplicados por pérdida de respuesta.
- Las órdenes guardadas en Carlab y manuales siguen en PostgreSQL. Mantén el respaldo habitual de esa base.
- La captura móvil se probó con un ancho de 390 px; los campos numéricos y de fecha usan controles del dispositivo.

## Validación

Pruebas locales de API y PostgreSQL embebido: cinco formatos, cierre, reapertura, permisos, idempotencia, calendario, historia, evidencias, autorización, fechas y migración aditiva sobre una tabla V1. Pruebas de navegador: express completo, borrador sin conexión y recuperación tras recarga, fotos, firmas, PDF, nueva orden sin arrastrar resultados, enlaces a manuales, expediente y captura móvil.

No se ha desplegado esta actualización en producción desde la conversación; el ZIP está listo para que lo cargues a GitHub.
