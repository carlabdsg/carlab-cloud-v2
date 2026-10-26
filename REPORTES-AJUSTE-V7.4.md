# CARLAB V7.4 · Búsqueda de reportes y filtros de cotizaciones

Actualización pequeña para la versión V7.3 que ya está funcionando.

## Cambios

- En **Operador → Reportes** aparece una caja **Buscar reportes por unidad**. Filtra al escribir por número económico, con letras o números, sin distinguir mayúsculas. El botón **Limpiar** vuelve a mostrar la lista. La búsqueda se aplica a los reportes cargados y conserva los permisos existentes.
- En **Cotizaciones**, los estados **Sin cotización**, **Cotizada · pendiente**, **Aceptada** y **Rechazada** son botones que filtran las fichas al pulsarlos.
- El botón **Todas** quita el filtro de estado. Cada botón muestra la cantidad de unidades correspondiente a la empresa y búsqueda seleccionadas.
- El filtro activo queda resaltado y se mantiene sincronizado con el selector **Estado**. Funciona en el portal del administrador y del operador.

## Cómo subirlo a GitHub

Este ZIP contiene **7 archivos**, por lo que se puede subir en una sola carga.

1. Descomprime `CARLAB-V7.4-AJUSTE-FACIL.zip`.
2. Abre la página principal de `carlabdsg/carlab-cloud-v2`, fuera de cualquier carpeta.
3. Pulsa **Add file → Upload files**.
4. Abre la carpeta descomprimida y arrastra todo su contenido: `index.html`, la carpeta `public` y este documento. Mantén la carpeta `public` con sus archivos dentro.
5. Pulsa **Commit changes**, espera el despliegue de Render y recarga Carlab Cloud.

El paquete reemplaza únicamente los archivos de interfaz necesarios. No borres carpetas ni vuelvas a cargar los archivos del visor PDF. Requiere que V7.3 ya esté instalada; no es una instalación desde cero.

Los registros, PDF, respuestas, usuarios, empresas y unidades existentes se conservan. El servidor y el portal de aire acondicionado no cambian.
