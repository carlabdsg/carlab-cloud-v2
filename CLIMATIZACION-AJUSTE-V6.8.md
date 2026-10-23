# CARLAB AC V6.8 — Formularios de órdenes con el nuevo estilo visual

Actualización acumulada para la instalación de AC V6.1 o posterior. Incluye las mejoras previas, incluido el portal visual de admin y la eliminación recuperable de solicitudes de servicio de V6.7.

## Qué cambia

- **Nueva orden:** selección de marca y servicio en tarjetas, atención normal o express y botón de cierre visible. En teléfono, la acción para empezar permanece accesible mientras se recorre el formulario.
- **Captura guiada:** cuatro etapas con el estilo visual del portal: Recepción, Diagnóstico, Intervención y Entrega. En computadora la guía está al costado; en pantallas más pequeñas se presenta arriba.
- **Contexto visible:** marca del equipo, tipo de atención y unidad que se está atendiendo. La barra indica la etapa actual, no un porcentaje de servicio realizado.
- **Campos y revisiones:** tarjetas, espacios y etiquetas más claros; los datos adicionales continúan en apartados desplegables. La lista de revisión conserva las actividades correspondientes al servicio y periodo seleccionado.
- **Refacciones y mediciones en celular:** las filas se presentan como tarjetas con etiquetas, cantidad, precio y condiciones de prueba. Se mantienen las sugerencias del catálogo oficial y los conceptos manuales.
- **Evidencia fotográfica:** apartado visual para tomar fotos o elegir archivos, conservando las opciones de cámara y la clasificación de la evidencia.
- **Guardado y cierre:** acciones de anterior, guardar avance y continuar visibles por encima de la navegación móvil. El cierre mantiene la revisión técnica y la confirmación final.

El rediseño se aplica al formulario guiado actual. Las órdenes antiguas conservan su editor compatible. Los campos, reglas de cierre, listas por periodo, guardado local, evidencia, datos registrados y formato del PDF técnico conservan su funcionamiento. No requiere cambios nuevos en la base de datos ni dependencias de producción.

## Instalar

1. Descomprime `CARLAB-AC-V6.8-FORMULARIOS-VISUALES.zip`.
2. Sube **el contenido** de la carpeta `carlab-cloud-v2` a la raíz del repositorio, reemplazando los archivos coincidentes y conservando las carpetas. No borres archivos del proyecto que no vienen en esta actualización.
3. Espera el despliegue habitual de Render y recarga el navegador. El formulario usa la nueva hoja `public/ac-order-form.css`.

El ZIP es una actualización de la instalación existente, no el repositorio completo desde cero. Fue preparado y probado localmente; no se ha subido ni desplegado automáticamente.

## Comprobaciones realizadas

- Captura en computadora y teléfono emulado para Hispacold y Eberspächer, los cuatro servicios y atención normal/express.
- Guardado, recuperación de borradores sin conexión, conservación de etapa y datos al navegar, campos desplegables, refacciones, lecturas y fotografías.
- Cámara de escritorio, selector de cámara móvil, liberación de cámara al terminar y descarga de PDF técnico.
- Enlaces desde pendientes de cierre hasta el campo correspondiente, revisión y confirmación de cierre, y compatibilidad del editor anterior.
- Diez periodicidades entre ambas marcas: actividades y páginas de referencia, protección de revisiones ya capturadas, cierre mensual de cuatro puntos para Hispacold, recuperación y compatibilidad con planes anteriores.
- Catálogo oficial, cantidades sugeridas, referencias por chasis, prevención de duplicados, precios, guardado de procedencia y separación del inventario.
- Revisión visual y de distribución en 320, 390, 768 y 1440 píxeles: campos accesibles, contraste de la acción principal y barra de guardado por encima del menú móvil.

Pruebas de navegador: `tests/ac-guided.browser.cjs`, `tests/ac-periodic.browser.cjs`, `tests/ac-official-parts.browser.cjs` y `tests/ac-order-form.browser.cjs`. Usan datos temporales de `tests/harness.cjs` y aceptan `PLAYWRIGHT_MODULE` y `QA_OUTPUT`. No utilizan la base de producción.
