# CARLAB · Ajuste V5.1 · Biblioteca técnica exclusiva para administrador

Actualización sobre Flotas AC V5. Fecha: 21 de octubre de 2026.

## Cambio

- La biblioteca técnica desaparece del menú de Supervisor AC, tanto Hispacold como Eberspächer.
- El servidor rechaza la descarga directa de manuales por supervisores, incluidos los de su propia marca.
- El catálogo del portal externo conserva las etiquetas necesarias para órdenes y reportes, pero no entrega manuales ni catálogos técnicos.
- El administrador conserva su biblioteca y la descarga de manuales.
- Flotas, solicitudes, órdenes, refacciones y notificaciones conservan sus permisos actuales.

## Instalación

1. Descomprime `CARLAB-AC-V5.1-BIBLIOTECA-SOLO-ADMIN.zip`.
2. Carga el contenido de su carpeta `carlab-cloud-v2` en la raíz del repositorio existente, reemplazando los archivos incluidos y conservando las rutas `modules/`, `public/` y `tests/`.
3. Guarda el commit y espera a que Render despliegue esa versión.
4. Recarga las pestañas abiertas de Carlab. En Safari: Opción + Comando + R.

Es un ajuste sobre V5, no un repositorio completo. No requiere cambios en la base de datos, configuración ni importación de manuales.

## Validación

30 pruebas de operaciones y flotas aprobadas. Verificado en navegador: biblioteca ausente del supervisor, navegación directa bloqueada, descarga externa rechazada (403), descarga administrativa permitida (200), biblioteca visible para admin y flotas/órdenes disponibles.

El ZIP está preparado para cargar a GitHub; no se ha desplegado desde este chat.
