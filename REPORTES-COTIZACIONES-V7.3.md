# CARLAB · Cotizaciones por unidad · V7.3

Nuevo módulo de Cotizaciones para el administrador y los operadores del sistema de reportes, fallas y garantías.

## Administrador

1. Abre **Cotizaciones** en el menú principal.
2. Pulsa **Subir cotización** o abre la ficha de un autobús.
3. Selecciona la unidad y uno de sus reportes.
4. Carga el PDF y pulsa **Publicar cotización**.

Se admite un PDF de hasta 10 MB por versión. Si la unidad todavía no tiene reportes, primero registra el reporte. Las unidades que ya tienen un reporte también aparecen aunque aún no se hayan incorporado a Flotas.

## Operador

La empresa de su cuenta se selecciona automáticamente. Solo ve sus unidades y cotizaciones. Abre la ficha, selecciona el reporte y revisa el PDF. Puede ampliarlo, cambiar de página, abrirlo o descargar el original.

Elige **Aceptar cotización** o **Rechazar cotización**, añade un comentario opcional y confirma. Se guardan la respuesta, la persona y la fecha. El administrador puede consultar esa respuesta en la misma ficha.

## Colores de los autobuses

| Color | Significado |
| --- | --- |
| Gris | La unidad no tiene cotización en PDF. |
| Azul | Existe una cotización pendiente de respuesta. |
| Verde | Todas las cotizaciones vigentes de la unidad están aceptadas. |
| Rojo | Existe una cotización rechazada y ninguna pendiente de respuesta. |

Cuando una unidad tiene varios reportes, cada cotización conserva su propio estado. El autobús prioriza las pendientes, después las rechazadas y finalmente las aceptadas. Los reportes sin PDF no cuentan como cotizaciones.

Ambos portales consultan el mismo estado. El tablero se actualiza automáticamente cada 15 segundos mientras está visible y también cuenta con el botón **Actualizar**.

## Correcciones e historial

El administrador puede subir una nueva versión desde la misma ficha. La nueva versión queda azul y requiere una nueva respuesta. Las versiones anteriores conservan el PDF y su respuesta; se pueden descargar desde el historial. Una respuesta confirmada no se sobrescribe: para modificar el alcance, publica una nueva versión.

## Instalación

Descomprime **CARLAB-V7.3-COTIZACIONES.zip** y sube su contenido a la raíz del repositorio, conservando las carpetas y reemplazando los archivos correspondientes. Espera el despliegue de Render y recarga el sitio. No subas el ZIP como un único archivo.

El paquete incluye la versión anterior completa, incluida la corrección de empresa asignada V7.2. No exige volver a registrar usuarios, empresas o unidades.

Se crea automáticamente una tabla adicional en PostgreSQL cuando se abre el módulo por primera vez. Los PDF se guardan en esa base de datos, para conservarlos durante los despliegues. Los datos existentes de reportes, flotas, costos y cobranza no se reescriben. Este módulo no altera los estados de cobranza ni autoriza automáticamente trabajos en otros módulos. Los archivos del portal de aire acondicionado permanecen iguales.

Este paquete no está desplegado automáticamente en producción.

## Verificación

Se probó el flujo de carga, descarga del original, aceptación, rechazo, nuevas versiones y actualización compartida en Chrome y WebKit (motor de Safari), incluyendo tamaños de teléfono. Se verificaron permisos por rol y empresa, protección de versiones reemplazadas, conservación de los registros existentes y cotizaciones de varios reportes en una unidad. Las pruebas utilizan datos y un PDF ficticios, sin consultar ni modificar la base de producción.

El visor de PDF usa PDF.js 6.4.299, distribuido localmente con sus licencias en `public/vendor/pdfjs`. No se envían los documentos a servicios externos para visualizarlos.
