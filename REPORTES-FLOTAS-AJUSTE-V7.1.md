# CARLAB · Ajuste V7.1

Actualización del acceso principal y del sistema general de reportes y flotas.

## Cambios

- Identidad visual en azul noche, blanco y rosa: navegación, botones, filtros, fichas y formularios.
- Acceso rediseñado con campos y textos de alto contraste, versión para teléfono, opción de mostrar/ocultar contraseña y compatibilidad con el autocompletado del navegador. Conserva inicio de sesión y solicitud de acceso.
- Captura en orden: empresa → unidad de esa empresa → datos y contacto. Antes de elegir empresa no se muestran unidades; al cambiar de empresa se limpia la unidad anterior, obra, modelo y kilometraje.
- Seleccionar una unidad completa su número económico, obra, modelo y kilometraje. El operador conserva su empresa asignada.
- Si obra o modelo están vacíos o contienen solo espacios, el reporte guarda «Pendiente». Los datos conocidos se conservan. Esto no modifica las fichas de flota ni rellena registros históricos de forma masiva.
- La opción secundaria «Capturar unidad no registrada» mantiene la captura de unidades que todavía no aparecen en el catálogo. Las ediciones de reportes históricos conservan su unidad aunque ya no esté en la flota.
- Se informa cuando no hay unidades o falla la consulta, con opción para volver a cargarlas.

## Instalación

1. Descomprime `CARLAB-V7.1-ACCESO-Y-CAPTURA.zip`.
2. Sube su contenido a la raíz del repositorio, conservando las carpetas y reemplazando los archivos incluidos. No subas solamente el ZIP.
3. Conserva la conexión y las variables actuales de Render.
4. Cuando termine el despliegue de esta actualización, recarga la página.

El paquete incluye V7 completo y este ajuste. Las referencias de los recursos visuales cambian a V7.1 para solicitar la nueva versión al navegador. No requiere importar, borrar ni reiniciar datos. El servidor y los archivos del módulo AC son idénticos a V7.

## Validación

- Chrome y WebKit (motor de Safari), escritorio y teléfono: acceso, solicitud de acceso, contraseña visible/oculta, selección por empresa, limpieza al cambiar empresa, captura, QR, edición, fichas y permisos existentes.
- Reporte real guardado en una base aislada con obra/modelo «Pendiente», vinculado a la unidad correcta; ficha original de la flota conservada sin cambios.
- Edición con folio, fotografías y firma original conservados; generación del PDF de etiquetas y navegación de los módulos existentes verificadas.
- Prueba de conservación de datos y alcance de QR aprobada. Comparación del paquete con V7 para comprobar que los recursos AC y el servidor no cambiaron.
- Revisión visual del acceso en escritorio, tableta y teléfono, incluidos 320 px de ancho.

Preparado para cargar a GitHub. Este paquete no se ha desplegado automáticamente en producción.
