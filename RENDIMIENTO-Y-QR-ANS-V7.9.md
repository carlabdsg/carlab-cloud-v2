# CARLAB V7.9 · Rendimiento y QR único de ANS

Actualización sobre V7.8.1. Conserva los datos, cuentas, reportes, órdenes, fotografías, firmas y códigos existentes. No requiere volver a registrar unidades ni cambiar variables de Render.

## Cargar a GitHub

1. Descomprime `CARLAB-V7.9-RENDIMIENTO-QR-ANS-FACIL.zip`.
2. Abre **la raíz** de `carlabdsg/carlab-cloud-v2` en GitHub: donde aparece `server.js`.
3. En **Add file → Upload files**, arrastra juntos los archivos y carpetas que vienen dentro del ZIP. Mantén las carpetas `public`, `modules` y `tests`; no arrastres una carpeta contenedora adicional.
4. Confirma todos los archivos en un solo cambio, con el mensaje `V7.9 Rendimiento y QR único ANS`.
5. Espera a que el despliegue de Render termine. Después recarga la aplicación para recibir los archivos actualizados.

Este ZIP contiene únicamente los archivos de la actualización y está por debajo del límite de 100 archivos. No se sube el ZIP cerrado ni se borran las carpetas actuales. No incluye datos de producción, credenciales ni dependencias para reinstalar manualmente. Todavía no se ha publicado en GitHub ni desplegado en Render desde esta entrega.

## QR de ANS

- Los QR de AC ya pegados en las unidades de la empresa **ANS** ofrecen **Reporte general: carrocería, daños y garantías** y **Aire acondicionado**, sin pedir una cuenta.
- Las nuevas etiquetas de AC de ANS llevan la leyenda **REPORTES**.
- Si la misma empresa ANS y el mismo económico existen en ambos módulos, descargar la etiqueta desde Reportes o desde AC utiliza **el mismo código y la misma dirección**. Se reutiliza el token actual de AC.
- Las etiquetas de AC anteriores siguen funcionando. No hace falta reemplazarlas para tener las dos opciones. Los antiguos códigos generales también se conservan con su configuración previa.
- Si la unidad solo está en AC, el reporte general se recibe con empresa y económico fijos y queda sin vínculo a una unidad general. No se crea otra unidad ni un usuario automáticamente. Administración puede revisar el reporte en Reportes y registrar después la unidad en Flotas generales; el registro vincula los reportes pendientes de esa misma empresa y económico.
- El acceso con cuenta conserva los permisos: el operador entra a los reportes de su empresa; administración y supervisión AC conservan el acceso a su expediente autorizado.
- La habilitación nueva de doble reporte en los QR de AC es **exclusiva de ANS**. Las otras empresas de AC siguen con reporte de AC. Los ajustes existentes de QR sencillos/dobles de las flotas generales se conservan.
- Archivar una unidad o reemplazar deliberadamente su QR sigue invalidando el acceso correspondiente. La actualización no reemplaza tokens.

## Rendimiento

- Las herramientas para descargar PDF y generar QR se cargan cuando se usan, una sola vez por página. Una descarga fallida permite reintentar.
- El inicio de Reportes ya no consulta usuarios, solicitudes de acceso ni la agenda completa antes de abrir esos apartados.
- El formulario consulta solo los datos básicos de las unidades de la empresa seleccionada, sin calcular todas las estadísticas de flota.
- Las notificaciones evitan consultas simultáneas repetidas. Se suspende la actualización periódica del sistema general cuando la pestaña está oculta o el dispositivo no tiene conexión.
- El inicio de AC pide contadores de solicitudes y reportes, sin descargar sus expedientes completos.
- Las listas de órdenes y solicitudes de AC dejan de leer o transferir imágenes que no muestran. Al abrir la ficha se obtiene la evidencia completa.
- Los datos de unidades para capturar órdenes de AC se consultan al abrir la captura o el historial.
- Dos índices adicionales apoyan las búsquedas por marca, empresa, unidad y fecha. Se crean automáticamente la primera vez que se inicializa AC; no eliminan ni reemplazan registros.
- El archivo principal de la aplicación se entrega minificado, con sus fuentes legibles conservadas.

## Medición reproducible

Prueba local aislada con 14 unidades generales, 8 reportes, 20 órdenes AC y 20 solicitudes AC. Cada orden incluye cuatro imágenes y cada solicitud dos imágenes de aproximadamente 94 KB. Se comparó la misma información antes y después; no se usó la base de producción.

| Medida | Antes | Después aproximado |
|---|---:|---:|
| JavaScript al entrar a Reportes | 852 KB | 327 KB |
| Solicitudes de datos al entrar como administrador de Reportes | 9 | 4 |
| Solicitudes de datos en la pantalla de acceso | 1 | 0 |
| JavaScript al entrar como administrador AC | 860 KB | 354 KB |
| Datos devueltos por la base para el inicio de administrador AC | 5.03 MB | 10 KB |
| Datos devueltos por la base al listar 20 órdenes AC | 10.03 MB | 10 KB |
| Respuesta de la lista de 20 solicitudes AC | 5.02 MB | 9.6 KB |

Estas cifras miden descargas y lecturas evitadas; no son una promesa de porcentaje de velocidad en Render. El tiempo real también depende de conexión, equipo, volumen de datos y disponibilidad de PostgreSQL. Una base de Render que esté en recuperación necesita completar esa recuperación; esta actualización reduce la carga de la aplicación.

## Validación

Se verificaron permisos por empresa y marca, ambos reportes por QR ANS, recepción pendiente de vincular, ausencia de altas automáticas, reenvíos sin duplicados, reemplazo de QR, unidades archivadas, consultas ligeras con evidencias completas en el detalle, carga segura por lotes, formularios de operador y de órdenes AC, PDF mensuales/semanales, y navegación en computadora y móvil. Se probaron Chromium y WebKit (motor de Safari).

Las pruebas y el perfil reproducible se incluyen en `tests`. Las pruebas usan bases locales temporales; no necesitan ni deben apuntar a producción. Los PDF, imágenes y mediciones generados durante la revisión quedan fuera del ZIP de actualización.
