# CARLAB · Empresa asignada · V7.2

Corrige el campo Empresa vacío en la captura de reportes de usuarios que ya tienen una empresa registrada.

- La cuenta de operador muestra automáticamente su empresa, sin tener que seleccionarla.
- El selector de unidades carga únicamente la flota de esa empresa.
- El nombre se reconoce aunque existan diferencias de mayúsculas, espacios o acentos entre la cuenta y el catálogo.
- La empresa permanece seleccionada al cancelar, guardar, abrir un reporte nuevo y recargar la página.
- Si la empresa no aparece en el directorio de empresas activas o el directorio no responde, se conserva la asignación existente en la cuenta.
- Los administradores conservan la selección de empresas para registrar reportes.
- Se mantienen los colores, el acceso, los QR y los valores «Pendiente» de V7.1.

## Instalación

Descomprime `CARLAB-V7.2-EMPRESA-ASIGNADA.zip` y sube su contenido a la raíz del repositorio, conservando carpetas y reemplazando los archivos. Espera el despliegue de Render y recarga el sitio.

No es necesario volver a registrar usuarios, empresas ni unidades. No cambia la base de datos, el servidor ni los archivos del módulo de aire acondicionado. Incluye la versión anterior completa con esta corrección.

## Comprobaciones

Se reprodujo primero el campo vacío mediante un inicio de sesión de operador sin QR. La prueba posterior verifica empresa predeterminada, listado de unidades de esa empresa, cancelación, recarga, guardado y uso móvil en Chrome y WebKit (motor de Safari), además del caso de empresa ausente o directorio temporalmente no disponible.

Se verifica también el flujo existente de administrador, edición con evidencia y firma, QR, captura por empresa y navegación de los módulos generales.

Este paquete está preparado para GitHub; no se ha desplegado automáticamente en producción.
