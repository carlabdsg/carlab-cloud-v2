# CARLAB AC V6 · Captura guiada de órdenes

Actualización sobre CARLAB AC V5.2. Reorganiza la captura de las órdenes actuales (formulario 3) y mantiene el formato técnico del expediente y del PDF.

## Recorrido de captura

1. Crear orden: seleccionar fabricante, tipo de servicio y atención normal o express, como hasta ahora.
2. Recepción: identificar la unidad y registrar el motivo. Las opciones frecuentes facilitan la captura. En express se muestra el tipo de evento y la ubicación; contacto y tiempos se despliegan aparte.
3. Diagnóstico: registrar hallazgos y revisar componentes. El mantenimiento preventivo y la reparación mayor conservan su lista obligatoria. Los otros servicios permiten desplegarla cuando corresponda.
4. Intervención: describir el trabajo y abrir, según se necesiten, mediciones, refacciones o trabajos adicionales. Las fotografías pueden tomarse con la cámara o seleccionarse del dispositivo.
5. Entrega: registrar pruebas y condición de entrega. «Revisar y cerrar» abre un resumen técnico; «Confirmar cierre de orden» completa la orden cuando cumple los requisitos.

La pantalla de captura tiene cuatro etapas: Recepción, Diagnóstico, Intervención y Entrega. Se puede avanzar, retroceder o seleccionar una etapa directamente. «Guardar avance» funciona desde cualquiera de ellas. El borrador local conserva la etapa para retomarla; después de guardar en Carlab se mantiene la etapa abierta. Los pendientes de cierre llevan directamente al campo correspondiente.

Plegar un apartado o cambiar de etapa conserva sus datos. Las refacciones y mediciones ya capturadas vuelven a mostrarse al editar. Las ayudas son instrucciones de captura: no registran trabajos como realizados ni asignan resultados de inspección automáticamente.

## Instalación desde el ZIP

1. Descomprimir el archivo.
2. Abrir la carpeta `carlab-cloud-v2` incluida en el ZIP.
3. Subir su contenido a la raíz del repositorio existente, conservando las carpetas `public` y `tests`. No crear otra carpeta `carlab-cloud-v2` dentro del repositorio.
4. Confirmar los cambios en GitHub y esperar a que termine el despliegue habitual de Render.
5. Recargar el módulo de aire acondicionado. Si continúa apareciendo la captura anterior, hacer una recarga completa del navegador.

Archivos de aplicación: `public/hispacold.js`, `public/hispacold.html` y el nuevo `public/hispacold-guided.css`. Se incluyen este documento y la prueba de navegador como referencia para mantenimiento. No se requieren nuevas dependencias de producción ni cambios de base de datos.

## Alcance preservado

- Selección Hispacold / Eberspächer, revisión, mantenimiento preventivo, reparación menor, reparación mayor y atención normal / express.
- Campos técnicos, fotografías, firmas, refacciones, autorizaciones y condiciones de cierre existentes.
- Órdenes anteriores al formulario 3 conservan su editor original.
- Flotas AC, calendario, accesos de supervisores, biblioteca, notificaciones y almacén conservan su funcionamiento.
- El generador del PDF, la presentación del expediente y las reglas de cierre se mantienen sin cambios.

## Pruebas

Pruebas locales con base de datos temporal, sin usar registros de producción:

- 15 pruebas automatizadas de reglas del formulario 3 aprobadas.
- Prueba de navegador: ambos fabricantes y los cuatro servicios; normal / express; navegación guiada; enlaces a campos pendientes; recuperación de borrador y etapa sin conexión; conservación de refacciones, mediciones y fotografías; cámara de escritorio y liberación de cámara; guardado y cierre explícito; descarga del PDF técnico; editor anterior y vista móvil.
- En móvil se utiliza emulación de iPhone en Chrome y carga de archivo para verificar el acceso a la cámara del dispositivo. La cámara física y Safari deben verificarse en el dispositivo durante la prueba de aceptación.

Para repetir la prueba de navegador se requiere el entorno de pruebas existente (`tests/harness.cjs`, PGlite), Playwright y Chrome. Ejecutar `node tests/ac-guided.browser.cjs`; `PLAYWRIGHT_MODULE` permite indicar una instalación existente de Playwright y `QA_OUTPUT` una carpeta de evidencias. Estas dependencias son exclusivamente de pruebas.

## Prueba de aceptación sugerida

Crear una reparación menor express, guardar desde Recepción, completar la intervención con una foto y revisar la entrega. Probar después un mantenimiento preventivo para comprobar el plan y su lista de revisión. Confirmar en ambos casos el reporte técnico descargado.
