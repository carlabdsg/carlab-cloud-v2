# CARLAB V7.7 · Un QR, dos tipos de reporte

Actualización sobre V7.6. Conserva los datos y los QR actuales.

## Al escanear un QR de reportes

Aparece la empresa y el número económico del autobús, con dos tarjetas:

- **Reporte general:** abre el formulario actual de fallas y garantías.
- **Aire acondicionado:** abre el formulario de fallas de AC, con contacto, tipo de falla, condición del equipo, prioridad, descripción y fotografías opcionales desde cámara o galería.

Ambas opciones funcionan sin cuenta. La empresa y la unidad se toman del QR. El enlace **Cambiar tipo de reporte** permite regresar a la elección antes de enviar. **Tengo cuenta** conserva el acceso habitual al sistema.

No es necesario reimprimir las etiquetas de reportes existentes. Los nuevos PDF indican **Reporte general o aire acondicionado** y conservan los tamaños y la descarga por flota. Los QR exclusivos de AC siguen funcionando como antes.

## Cuando el autobús ya está registrado en AC

Si coinciden exactamente la empresa y el número económico con una única ficha activa de AC, el reporte se registra directamente con folio **IAC** y la marca de esa ficha. Se ignoran mayúsculas y espacios exteriores al comparar.

El reporte aparece en **Aire acondicionado → Reportes AC**, con estado **Nuevo**, distintivo **Visitante QR**, fotografías, contacto y notificación para el personal autorizado. Sigue disponible el proceso habitual de revisión y atención.

## Cuando falta vincular la unidad

El operador puede enviar la falla de inmediato. Recibe un folio **PAC**, con la indicación **Pendiente de vincular a AC**; no necesita crear cuenta ni registrar el autobús otra vez.

Administración recibe un aviso en la campanita y puede abrirlo directamente. También tiene el botón **Pendientes de vincular** en **Reportes AC**, con el número de casos pendientes.

Para completar un caso:

1. Abre **Aire acondicionado → Reportes AC → Pendientes de vincular**.
2. Pulsa **Revisar y vincular** en la tarjeta del autobús.
3. Revisa descripción, contacto y fotografías.
4. Busca y selecciona la ficha correcta de **Flotas AC**. El selector muestra empresa, número económico y marca.
5. Si todavía no existe, regístrala primero desde **Ir a Flotas AC**, eligiendo empresa y marca. Luego regresa a la bandeja; el reporte permanece guardado.
6. Confirma que corresponde al mismo autobús y pulsa **Vincular y abrir reporte AC**.

Se crea el expediente **IAC** conservando fotos, contacto, descripción, fecha de la falla y referencia al folio **PAC**. La vinculación queda en la bitácora. El aviso pendiente desaparece y se genera la notificación del reporte AC para la marca/empresa correspondiente.

El filtro **Vinculados** conserva el historial de recepción. También puedes buscar el folio PAC dentro de Reportes AC para encontrar su expediente. La confirmación original del visitante conserva su folio PAC; no debe reenviar la falla.

La bandeja de vinculación es exclusiva de administración. Los supervisores ven el reporte cuando ya tiene empresa y marca asignadas, conforme a sus permisos. Un número económico igual en otra empresa no provoca una asignación automática. Si las empresas tienen nombres distintos entre los dos módulos, los reportes se reciben pendientes para revisión; cada vinculación manual corresponde a ese reporte.

## Confirmación y conservación de datos

- Un reintento del mismo envío recupera su folio sin duplicar el reporte.
- Si falla la conexión después de enviar, conserva la página y pulsa **Verificar envío**.
- Se permiten hasta cuatro fotos. Se reducen antes de enviarlas.
- El visitante no accede a expedientes, otros reportes, órdenes ni cotizaciones.
- Un reporte recibido no crea una orden de trabajo automáticamente.
- El cambio agrega una tabla de recepción. No borra ni reemplaza registros de empresas, unidades, usuarios, reportes, órdenes o cotizaciones.
- La base de datos se prepara automáticamente. No requiere nuevas dependencias ni cambios de configuración.

## Subir a GitHub en una sola carga

**CARLAB-V7.7-QR-DOBLE-REPORTE-FACIL.zip contiene 26 archivos**, por debajo del límite de carga del navegador. Es una actualización para el sistema que ya tiene V7.6 instalada, no una instalación completa.

1. Descomprime el ZIP.
2. En GitHub abre la raíz de **carlabdsg/carlab-cloud-v2**, donde aparece `server.js`.
3. Selecciona **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta descomprimida: `server.js`, `index.html`, las carpetas `modules`, `public`, `tests` y este documento. Conserva los archivos dentro de sus carpetas.
5. Pulsa **Commit changes** y espera a que Render termine el despliegue.
6. Escanea un QR general que ya tengas impreso. Debe aparecer la elección de los dos tipos de reporte.

No subas el ZIP directamente ni borres las carpetas existentes. Los archivos incluidos reemplazan sus versiones correspondientes; el resto del sistema permanece en el repositorio.

## Comprobación

Pruebas con datos aislados: selección desde un QR existente, ambos formularios, fotos, pérdida de respuesta y reintento sin duplicar, folio PAC, campanita, vinculación administrativa, folio IAC, coincidencia de empresa/unidad, permisos por marca y empresa, persistencia y conservación de datos. Se revisaron vistas de celular y escritorio en Chrome y WebKit, los formularios públicos anteriores y las etiquetas PDF compactas, medianas e individuales.

Esta entrega es el paquete para cargar a GitHub. No instala cambios directamente en producción.
