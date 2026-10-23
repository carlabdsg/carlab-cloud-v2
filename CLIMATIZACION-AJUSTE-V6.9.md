# CARLAB AC V6.9 — Reincorporar unidades eliminadas

Corrige el bloqueo al volver a registrar una unidad eliminada de Flotas AC. Es una actualización acumulada para la instalación de AC V6.1 o posterior, con las mejoras anteriores de portales, formularios, refacciones y reportes.

## Cómo funciona

1. En Flotas AC, pulsa **Registrar unidades**.
2. Selecciona la **misma empresa y marca de AC** y captura el **mismo número económico**.
3. Al guardar, la unidad eliminada vuelve a la flota activa. Si es una sola unidad, se abre su expediente.

El sistema recupera el registro original: conserva sus órdenes, datos técnicos, evaluación, programación, historial y código QR. Los campos vacíos o valores iniciales del formulario de alta no borran esa información. Para modificar los datos de la unidad reincorporada, usa **Editar ficha / evaluación**.

- Funciona también por lote y al copiar los datos desde Flotas existentes, que utiliza el mismo registro de unidades.
- Un lote puede incluir unidades nuevas y eliminadas. La confirmación distingue cuántas se registraron y cuántas se reincorporaron.
- Si una unidad ya está activa, se indica que debe editarse su ficha. Si se selecciona una marca distinta de la guardada, se muestra la marca correcta para recuperar el expediente.
- Los números económicos se comparan sin distinguir mayúsculas y sin espacios al principio o al final. Se conserva el número original.
- Un lote con errores no deja altas ni reincorporaciones parciales.
- La reincorporación queda registrada en el historial. La opción **Restaurar unidad** desde el filtro de eliminadas sigue disponible.
- Después de registrar, se muestran las unidades activas de la empresa y marca seleccionadas.

La causa era el alta de un registro nuevo cuando el anterior permanecía archivado para conservar el historial. Se mantiene una sola identidad por empresa y número económico. Los supervisores conservan sus permisos de consulta; solo administración registra o reincorpora unidades.

## Instalar

1. Descomprime `CARLAB-AC-V6.9-REINCORPORAR-UNIDADES.zip`.
2. Sube **el contenido** de la carpeta `carlab-cloud-v2` a la raíz del repositorio, reemplazando los archivos coincidentes y conservando la estructura de carpetas. No borres los archivos del proyecto que no vienen en esta actualización.
3. Espera a que Render termine el despliegue habitual y recarga el sitio.

No requiere cambios adicionales de esquema ni nuevas dependencias de producción. El ZIP actualiza la instalación existente; no es un repositorio completo desde cero. Preparado y probado localmente, sin subirlo ni desplegarlo automáticamente.

## Validación

- Reproducción del bloqueo original al registrar una unidad eliminada.
- Reincorporación de Hispacold y Eberspächer, sin duplicados y con el mismo ID, QR e historial de órdenes.
- Conservación de serie, placas, modelo, evaluación, vigencia y próxima fecha de servicio.
- Permisos por marca, separación de empresas, versiones anteriores y registros de auditoría.
- Lotes mixtos, errores sin cambios parciales y ciclos repetidos de eliminación y reincorporación.
- Flujo de navegador en computadora y teléfono emulado, mensajes de marca incorrecta y regreso desde eliminadas a la flota activa.
- Regresión de flotas, eliminación/restauración y códigos QR. El módulo original de Flotas conserva sus datos.

Pruebas nuevas: `tests/ac-fleet-reentry.test.cjs` y `tests/ac-fleet-reentry.browser.cjs`. Usan datos temporales mediante `tests/harness.cjs`, sin acceder a producción. La prueba de navegador acepta `PLAYWRIGHT_MODULE` y `QA_OUTPUT`.
