# CARLAB V7.8.1 · Corrección del registro por lote

Actualización sobre V7.8 para el sistema general de reportes y flotas. El ZIP contiene 11 archivos y puede cargarse a GitHub en una sola operación.

## Cargar la actualización

1. Descomprime **CARLAB-V7.8.1-LOTES-SEGUROS-FACIL.zip**.
2. Abre la **raíz** de `carlabdsg/carlab-cloud-v2` en GitHub; no entres a `public` ni a `vendor`.
3. Selecciona **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta descomprimida, incluidas las carpetas `modules`, `public` y `tests`. Conserva su estructura.
5. Confirma con **Commit changes** y espera a que Render termine el despliegue.
6. Recarga CARLAB. En **Flotas → Nueva unidad → Registro por lote**, el formulario debe indicar “Hasta 500 unidades por lote” y el avance debe mostrarse al guardar.

Sube los archivos descomprimidos, no el ZIP. No borres las carpetas anteriores. Este paquete contiene solo los cambios y requiere tener instalada V7.8. No requiere nuevas dependencias, variables de entorno ni operaciones manuales sobre la base de datos.

## Cómo registrar y reintentar un lote

- Completa empresa y los datos comunes. Captura hasta 500 económicos, uno por línea, separados por comas o mediante rangos como `B100-B126`.
- El sistema procesa bloques de hasta 50 unidades y muestra el avance.
- Las unidades que ya existen en esa empresa se omiten: conservan su flota, modelo, obra, kilometraje, indicadores e identificador. Si necesitas modificar una unidad existente, utiliza su edición individual.
- Si se interrumpe una conexión, la carga se detiene. Los bloques confirmados se retiran del cuadro; las unidades pendientes o cuyo resultado no se pudo confirmar permanecen allí.
- Espera a que vuelva la conexión y pulsa **Guardar lote** otra vez. Si un bloque se guardó pero se perdió la respuesta, se reconocerán sus unidades como existentes y no se duplicarán ni se sobrescribirán.
- Conserva abierta la pantalla mientras resuelves una interrupción. El navegador advierte antes de salir con un lote pendiente; la lista del formulario no es un borrador guardado en el servidor.
- Al terminar, el formulario muestra cuántas unidades son nuevas y cuántas ya existían. Los datos comunes permanecen para facilitar otro lote.

## Qué se corrigió

Antes se enviaba una petición por cada unidad, se continuaba después de los errores y un resultado parcial podía borrar la lista pendiente del formulario. Ahora cada bloque se confirma completo mediante una transacción, se impide el doble envío y se detiene el proceso ante el primer fallo.

El registro por lote usa una operación de creación que nunca actualiza unidades existentes. La vinculación de reportes antiguos sin unidad se realiza una vez por bloque, manteniendo sus fotos, firma y contenido. No se eliminan unidades, reportes, usuarios, cotizaciones ni códigos QR.

El inicio de sesión, la consulta de sesión, empresas y el registro de unidades ahora responden ante errores de base de datos, evitando solicitudes pendientes por rechazos sin controlar. Los errores de recuperación conocidos se devuelven como indisponibilidad temporal con indicación de reintentar. Las lecturas no realizan los tres intentos inmediatos cuando la base está en recuperación. Una interrupción temporal tampoco borra la sesión guardada.

La carga de flotas evita consultas simultáneas duplicadas y los conteos utilizan el identificador del reporte, sin necesitar la fila completa con sus evidencias. El módulo de AC y la selección de QR sencillo/doble conservan su funcionamiento.

## Sobre el incidente de Render

El registro recibido indica que la base estaba rechazando conexiones por encontrarse en recuperación. Que el error apareciera al cargar un lote no demuestra por sí solo qué provocó la recuperación. Para determinarlo hacen falta los eventos y métricas de la base correspondientes a ese momento.

La consulta de salud realizada el 29 de octubre de 2026 a las 10:58, hora de Mazatlán, respondió correctamente y confirmó conexión con la base. La consulta fue de lectura; esta entrega no reinició, restauró ni modificó producción.

Esta actualización mejora el comportamiento de CARLAB durante una interrupción; no sustituye la recuperación de PostgreSQL. Si el aviso vuelve a aparecer después de desplegarla, revisa **la base de datos de Render**, sus eventos y uso de memoria/almacenamiento, además del estado del servicio web. No es necesario borrar o restaurar datos para instalar este cambio.

## Validación

Pruebas con datos aislados:

- Bloque de 50 unidades, límites y permisos.
- Omisión de duplicados, incluso con diferencias de mayúsculas y formato.
- Conservación de unidades existentes y reportes históricos con evidencias y firma.
- Fallo dentro del bloque: reversión completa.
- Confirmación perdida después de guardar: reintento sin duplicados ni cambios a datos existentes.
- Fallo al obtener conexión e indisponibilidad en acceso, empresas, reportes y consultas de flota.
- Regreso a operación después del fallo.
- Chrome y WebKit, en escritorio y celular: avance, doble pulsación, lote de 120 con interrupción después de 50, recuperación de las 70 pendientes y conservación de sesión.
- Regresión de reportes, QR sin cuenta, QR doble y configuración de QR por flota.

Los archivos están preparados para carga manual. No se han publicado automáticamente en GitHub ni en Render.
