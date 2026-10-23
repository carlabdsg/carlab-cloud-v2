# CARLAB AC V6.10 — Cierre de fichas sin resaltado sobre la flota

Corrige el contorno azul que Safari podía dibujar sobre toda la vista de Flotas AC después de cerrar el expediente de una unidad.

## Qué cambia

- Al cerrar una ficha con **X**, **Cerrar** o **Escape**, el foco regresa a la tarjeta del autobús consultado.
- El contenedor de la página deja de recibir el contorno del navegador. Los botones y campos conservan sus indicadores para navegar con teclado.
- Registrar unidades y gestionar empresas también devuelven el foco al botón que abrió su ventana.
- Se mantiene la posición de lectura al cerrar una ficha. La corrección se aplica tanto a administración como al portal del supervisor.

La causa se reprodujo con WebKit: tras cerrar el diálogo, el foco regresaba al elemento que contiene toda la página, y el navegador le asignaba un contorno azul automático. El cambio limita el foco a los controles correspondientes y evita ese contorno en el contenedor.

## Instalar

1. Descomprime `CARLAB-AC-V6.10-CORRECCION-FICHAS.zip`.
2. Sube **el contenido** de la carpeta `carlab-cloud-v2` a la raíz de tu repositorio, reemplazando los archivos coincidentes y conservando la estructura. No borres archivos del proyecto que no vienen en esta actualización.
3. Espera a que termine el despliegue de Render y recarga el sitio. Las referencias de los archivos modificados se actualizaron para cargar esta versión.

Actualización acumulada para AC V6.1 o posterior. Incluye la corrección V6.9 para reincorporar unidades eliminadas y las mejoras anteriores. No requiere cambios en la base de datos ni nuevas dependencias de producción. Preparada localmente; no se ha publicado automáticamente.

## Validación

- Flota de 22 unidades en WebKit, motor de Safari, y Chrome.
- Administración y supervisor, en escritorio y teléfono emulado.
- Aperturas y cierres repetidos con X, Cerrar y Escape; retorno a la tarjeta y conservación del desplazamiento.
- Navegación con teclado e indicadores de foco en controles.
- Registro de unidades y gestión de empresas.
- Regresión del flujo de eliminar y reincorporar unidades, incluyendo lotes, historial y QR.

Prueba nueva: `tests/ac-fleet-dialog.browser.cjs`. Usa datos temporales y acepta `PLAYWRIGHT_MODULE`, `BROWSER_ENGINE` (por defecto `chromium`; también `webkit`) y `QA_OUTPUT`. No accede a producción.
