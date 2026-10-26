# CARLAB V7.5 · Reportes por QR sin cuenta

Actualización para el sistema de **Reportes y flotas**, sobre la versión V7.4 que ya está funcionando.

## Así funciona

1. El operador escanea el QR de reportes de la unidad con la cámara de su teléfono.
2. Se abre un formulario sin pedir registro ni contraseña. La empresa y el número económico aparecen automáticamente y no se pueden cambiar.
3. Escribe su nombre, teléfono y descripción de la falla. Puede elegir el tipo de incidencia, agregar kilometraje y adjuntar hasta cuatro fotografías desde la cámara o su galería.
4. Confirma los datos y pulsa **Enviar reporte**.
5. Recibe un folio de confirmación. En administración aparece como **Por revisar**, con el nombre declarado y la identificación **Visitante QR**.

El visitante puede enviar el reporte, pero no consultar expedientes, otros reportes, cotizaciones ni el portal de administración. Su nombre y teléfono son datos declarados; no equivalen a una cuenta verificada.

## Los QR actuales siguen funcionando

No necesitas reemplazar las etiquetas de reportes ya impresas. Sus enlaces abren el nuevo formulario. Las etiquetas descargadas a partir de esta versión incluyen el texto **Reporta sin crear una cuenta**.

Quien tenga una cuenta puede pulsar **Tengo cuenta** para continuar por el acceso habitual, con sus mismos permisos.

Esta mejora corresponde a los QR del sistema general de reportes. El módulo de aire acondicionado y sus etiquetas conservan su funcionamiento.

## Confirmación y fotografías

- Las fotografías se reducen antes de enviarse para facilitar la carga desde el teléfono.
- El formulario requiere conexión a internet. Si se pierde la respuesta al enviar, conserva la página y pulsa **Verificar envío**: se consulta el mismo envío para evitar duplicarlo.
- Una vez confirmado, el folio permanece disponible al recargar esa misma pestaña. Guarda el folio para solicitar seguimiento con CARLAB.
- **Registrar otro reporte** inicia un formulario nuevo para esa unidad.
- Los envíos están limitados a 10 por unidad en una hora y 30 en un día para reducir duplicados y uso indebido. Un formulario abierto vence después de 12 horas; vuelve a escanear si indica que venció.
- El registro no autoriza trabajos: sigue el proceso de revisión habitual de administración.

## Cómo subirlo a GitHub

Este ZIP contiene **14 archivos** y permite realizar una sola carga.

1. Descomprime `CARLAB-V7.5-QR-SIN-CUENTA-FACIL.zip`.
2. Abre la página principal de `carlabdsg/carlab-cloud-v2`, fuera de cualquier carpeta.
3. Pulsa **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta descomprimida: `server.js`, `index.html`, las carpetas `modules`, `public`, `tests` y este documento. Conserva las carpetas y sus archivos dentro.
5. Pulsa **Commit changes** y espera a que Render complete el despliegue.
6. Escanea una etiqueta existente desde una pestaña sin sesión. Comprueba el formulario, envía una prueba identificada como tal y revisa su folio en **Administración → Reportes**.

No subas el archivo ZIP directamente ni borres las carpetas existentes. Es una actualización, no una instalación desde cero; requiere V7.4 instalada. No necesita modificar variables de entorno ni instalar nuevas dependencias.

Se conservan usuarios, empresas, unidades, reportes, fotografías, firmas y cotizaciones existentes. La actualización agrega una tabla para confirmar los envíos por QR y evitar duplicados; no vacía ni reemplaza los registros actuales.

## Validación realizada

Pruebas con datos aislados de producción: envío sin cuenta, fotografías, recuperación tras pérdida de respuesta, permisos por empresa, rechazo de formularios alterados, límites de envío y conservación de datos. Revisión del formulario en Chrome y WebKit, en tamaños móvil y escritorio, y regresión del flujo habitual de reportes y etiquetas QR.
