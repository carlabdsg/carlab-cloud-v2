# CARLAB · Reportes y flotas · V7

Actualización del sistema general de fallas, garantías y flotas. El módulo de aire acondicionado conserva su implementación y las mejoras acumuladas de V6.11.

## Qué cambia

- Interfaz general renovada, menú lateral y navegación adaptable a teléfono.
- Bandeja de reportes con indicadores de revisión, seguimiento y cierre, búsqueda y filtros por empresa y estado.
- Fichas de reportes con pestañas Resumen, Evidencias y Seguimiento. Conservan validación, observaciones, avance, actividades autorizadas, historial, PDF, edición, eliminación y preparación de cobro según los permisos existentes.
- Captura guiada en tres pasos: unidad/contacto, incidencia/evidencia, revisión/firma. Puede completar datos desde una unidad registrada. Mantiene cámara, galería, refacciones, firma y los campos existentes.
- Flotas agrupadas por empresa y nombre de flota, tarjetas con autobús y estados visuales. Ficha con Unidad, Reportes, Servicios y piezas, Costos y Evidencias.
- Descarga de etiquetas QR para todas las unidades de una empresa/flota o una selección, en un único PDF. También se puede descargar una etiqueta desde la ficha individual.

## Descargar las etiquetas

1. Entra en **Flotas** y selecciona la empresa. Si tiene varias flotas, selecciona la deseada.
2. Pulsa **Etiquetas QR**.
3. Mantén todas las unidades seleccionadas o marca solo las necesarias.
4. Elige tamaño y pulsa **Descargar PDF**.

Formatos: compactas de 64 × 88 mm (9 por hoja A4), medianas de 88 × 121 mm (4 por hoja A4) e individuales de 106 × 146 mm. Imprimir al 100%, sin ajustar a la página. El diseño mantiene la identidad de las etiquetas AC, con el título **REPORTES**.

El QR solicita inicio de sesión. Administrador y operador pueden iniciar un reporte con los datos de la unidad; la consulta se ajusta a los permisos de cada cuenta. Supervisores y operadores solo pueden resolver etiquetas de su empresa. Descargar nuevamente conserva el mismo código. Si se elimina una unidad, su etiqueta deja de resolverla.

## Instalación en el repositorio existente

1. Descomprime el ZIP.
2. Sube su contenido a la raíz de `carlab-cloud-v2`, respetando las carpetas `public` y `modules` y reemplazando los archivos incluidos.
3. Conserva las variables y la misma conexión `DATABASE_URL` de Render. El paquete no contiene ni reemplaza la base de datos.
4. Espera a que Render complete el despliegue de ese cambio y recarga el sitio.

No hace falta ejecutar un reinicio de datos ni importar unidades. La tabla nueva `report_unit_qr` se crea automáticamente al usar las etiquetas y guarda únicamente la relación entre el ID existente de una unidad y su código. No renumera reportes, recrea flotas ni modifica los registros históricos.

La actualización preserva el contenido original de las firmas al editar un reporte sin cambiar la firma. La acción explícita **Borrar firma** permite sustituirla. La captura impide envíos duplicados mientras guarda.

## Validación

- Backend general real ejecutado en una base PostgreSQL aislada: creación, consulta y edición; alcance por empresa; códigos estables; rechazo de lotes con unidades no autorizadas; conservación de IDs, folios, fotografías, firmas, costos e historial.
- Comparación de datos antes y después de generar etiquetas y reiniciar la inicialización: sin cambios en las tablas existentes.
- Chrome y WebKit/Safari: escritorio y teléfono; revisión y avance de reportes; edición y captura guiada; empresa/flota; ficha por pestañas; descarga QR; navegación en agenda, servicios, refacciones, inventario, cobranza, campañas, usuarios e historial.
- PDF compacto: revisión visual de dos hojas y lectura de los 11 códigos de prueba renderizados a tamaño de impresión.
- Regresión de QR y reportes AC: pruebas aprobadas; los 44 archivos de módulos y recursos AC incluidos en la versión anterior permanecen idénticos.

El ZIP está preparado para cargarlo a GitHub. No se ha desplegado este rediseño en producción.
