# CARLAB V7.10 — Supervisor por empresa

Actualización sobre CARLAB V7.9. Se ajusta el rol existente **Supervisor**; no hace falta crear otro tipo de usuario.

## Permisos

| Módulo | Acceso del supervisor |
| --- | --- |
| Reportes | Consultar reportes, evidencias, estado e historial de su empresa. |
| Flotas | Ver unidades, semáforo y expedientes de su empresa. |
| Aire acondicionado | Consultar flotas, reportes AC, órdenes, seguimiento, calendario e informes de su empresa, con ambas marcas si existen. Descargar reportes técnicos. |
| Cotizaciones | Ver los PDF de su empresa y aceptar o rechazar la versión pendiente. La respuesta registra usuario, fecha y comentario. |

No puede crear, editar ni eliminar reportes, unidades, órdenes, solicitudes, refacciones o usuarios; tampoco subir cotizaciones ni generar etiquetas QR desde este perfil. La biblioteca técnica continúa reservada a administración. Las restricciones se verifican en el servidor además de ocultarse los controles.

Las respuestas a cotizaciones conservan la protección existente contra versiones reemplazadas y respuestas contradictorias. Los perfiles Administrador, Operador, Operativo, Supervisor flotas y Supervisor AC conservan sus funciones.

## Asignar acceso

En Administración → Usuarios, elige **Supervisor** y asigna la empresa. Para consultar AC, el nombre de la empresa registrada en Flotas AC debe corresponder al de esa cuenta. Si aún no existe información de AC de esa empresa, verá listas vacías.

Cuando cambie el rol de una cuenta, vuelve a iniciar sesión. Las sesiones anteriores ya no conservan los permisos del rol anterior. Los cambios de empresa se comprueban con la cuenta vigente.

## Cargar a GitHub

1. Descomprime `CARLAB-V7.10-SUPERVISOR-FACIL.zip`.
2. Abre la raíz de `carlabdsg/carlab-cloud-v2`, donde está `server.js`. Usa **Add file → Upload files**.
3. Arrastra todo el contenido descomprimido, incluyendo las carpetas `public`, `modules` y `tests`, y confirma los cambios.
4. Espera a que Render finalice el despliegue. Después cierra sesión y entra con el usuario Supervisor.

Sube los archivos extraídos, no el ZIP ni una carpeta contenedora adicional. Este paquete incluye solamente los cambios sobre V7.9 y queda por debajo del límite de 100 archivos de GitHub. No se eliminan archivos existentes ni se reemplaza la base de datos. No hay migraciones destructivas ni cambios de datos de producción.

## Comprobaciones

- Alcance por empresa en reportes, unidades, AC, cotizaciones y PDF; denegación al consultar otra empresa.
- Empresa sin flota AC, cuenta sin empresa, cuenta desactivada y sesiones anteriores a un cambio de rol.
- Bloqueo de creación, edición, eliminación y solicitudes para Supervisor; aceptar/rechazar cotizaciones con auditoría.
- Navegación, fichas y PDF en escritorio y móvil con Chromium y WebKit.
- Compatibilidad con cotizaciones de administrador/operador, flotas AC, reportes AC, lecturas ligeras y QR de ANS.

El ZIP contiene el código listo para cargar; no realiza por sí mismo una publicación en GitHub o Render.
