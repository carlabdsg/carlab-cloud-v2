# CARLAB · Flotas de aire acondicionado · V5

Actualización del 21 de octubre de 2026 para la V4 instalada en `carlabdsg/carlab-cloud-v2`.

## Instalar desde GitHub

1. Descomprime `CARLAB-FLOTAS-AC-V5-ACTUALIZACION.zip`.
2. Abre la carpeta `carlab-cloud-v2` del ZIP y carga **su contenido en la raíz del repositorio existente**, conservando las rutas `modules/`, `public/` y `tests/`. No subas el ZIP como archivo ni crees una segunda carpeta `carlab-cloud-v2` dentro del repositorio.
3. Confirma la sustitución de los archivos incluidos y guarda el commit. Esta entrega contiene únicamente la actualización sobre V4; no es un repositorio completo.
4. Espera a que Render termine el despliegue del commit. Si el despliegue automático está desactivado, inicia el despliegue del último commit desde Render.
5. Recarga Carlab. En Safari puedes usar Opción + Comando + R. Si el portal estaba abierto en otra pestaña, recárgala también.

No requiere variables de entorno, paquetes nuevos ni importar otra vez los manuales. Las tablas e índices de Flotas AC se crean automáticamente en la primera consulta del módulo. La actualización no modifica `server.js`, la agenda, las flotas generales ni las cantidades de Stock.

Esta entrega se probó localmente. No se ha desplegado en producción desde este chat.

## Dónde aparece

- **Administrador:** Aire acondicionado → **Flotas AC**, primera opción del menú de climatización.
- **Supervisor AC:** entra directamente al tablero **Flotas AC** al iniciar sesión. Se conserva su acceso a solicitudes, órdenes de su marca, refacciones y biblioteca.
- La marca del supervisor sigue seleccionándose al crear o editar su cuenta: **Hispacold** o **Eberspächer**.

## Comenzar a registrar una flota

1. En Flotas AC, pulsa **Empresas → Nueva empresa**. Registra el nombre de la empresa operadora, región, ciudad y contacto.
2. Usa el mismo nombre que aparece en las órdenes actuales. Se comparan sin distinguir mayúsculas y sin espacios al principio o al final para conectar el historial.
3. Pulsa **Registrar unidades**, selecciona empresa y marca del equipo de aire acondicionado y captura el número económico.
4. Puedes agregar base, nombre de flota, marca y modelo de autobús, modelo y serie del AC. En “Identificación y planificación” se encuentran año, kilometraje, número de obra, placas, garantía y próximo servicio inicial.
5. En “Evaluación del aire acondicionado” puedes registrar una condición comprobada, fecha y sustento. Sin evaluación ni orden cerrada previa, el registro comienza en gris.

Una empresa puede tener equipos de ambas marcas, pero cada unidad se registra con una sola marca AC. El número económico es único dentro de su empresa, aunque se intente cambiar la marca para duplicarlo.

**Registro por lote:** hasta 100 unidades con empresa, marca y datos compartidos. Escribe un número económico por línea, o sepáralos con comas. Se preservan los ceros iniciales. Las series AC y placas se dejan vacías en el lote para completarlas por unidad. Si una unidad es inválida o ya existe, se rechaza todo el lote; no se deja una carga parcial.

**Copiar desde Flotas existentes:** permite buscar y seleccionar un autobús del sistema actual. Copia empresa, número económico, marca, modelo, año, obra y kilometraje al formulario. Selecciona explícitamente la marca del AC antes de guardar. Si la empresa aún no está registrada en Flotas AC, créala primero. El registro original de Flotas permanece intacto y sus cambios posteriores no se sincronizan automáticamente con esta ficha.

## Qué puede ver y hacer el supervisor

- Consulta únicamente las unidades de su marca, incluso cuando una empresa tenga ambas marcas.
- Filtra por empresa, región, base, número económico, modelo o serie, semáforo y prioridad.
- Consulta el expediente con identificación del equipo, causas del semáforo, órdenes, solicitudes y bitácora.
- Solicita servicio o refacciones desde el autobús, con empresa, unidad y marca prellenadas y protegidas en ese formulario.
- Consulta y descarga las órdenes mediante las funciones existentes del portal.
- Exporta un CSV del resultado completo de los filtros, no solo de la página visible, sin importes internos.

El supervisor no registra empresas ni unidades, no cambia evaluaciones, no archiva unidades y no crea, edita, elimina ni cierra órdenes. La región es un filtro de consulta; el permiso de acceso se determina por la marca asignada a su cuenta. Los permisos también se verifican en el servidor, incluidos los identificadores de expedientes y las exportaciones.

## Semáforo y datos dinámicos

Las tarjetas usan las mismas figuras de autobús Volvo e Irizar del sistema. Cada color lleva texto y una causa concreta:

| Color | Interpretación |
| --- | --- |
| Verde | Evaluación operativa vigente y ningún pendiente de seguimiento registrado. |
| Amarillo | Órdenes abiertas, solicitudes pendientes, operación con observaciones, mantenimiento vencido/próximo o reparaciones recurrentes. |
| Rojo | Última evaluación no operativa, orden en espera de refacción o solicitud urgente todavía sin orden activa. La tarjeta indica cuál es la causa; rojo no significa siempre que el autobús esté detenido. |
| Gris | No existe evaluación o su vigencia de seguimiento terminó, sin otra alerta de mayor prioridad. |

- La referencia de condición proviene de la evaluación manual o de la orden cerrada más reciente por fecha de servicio. Si ambas tienen la misma fecha, se usa la registrada más recientemente.
- Una condición “no operativo” se conserva como alerta hasta que exista una evaluación posterior que la sustituya.
- La vigencia predeterminada de evaluación es **90 días**, ajustable por unidad de 1 a 365 días. Es una política de seguimiento de Carlab y **no sustituye los intervalos técnicos del fabricante**.
- Un mantenimiento para hoy o dentro de los siguientes 7 días genera seguimiento. Una fecha anterior genera atraso con días transcurridos.
- El “próximo servicio inicial” se usa mientras no exista una orden de mantenimiento cerrada que establezca la programación. Después se usa la última programación de las órdenes, con las mismas reglas del calendario actual.
- Dos o más reparaciones menores/mayores cerradas en los últimos 90 días activan una alerta de recurrencia para revisar el historial; no constituye por sí sola un diagnóstico de falla repetida.
- Las solicitudes convertidas a una orden activa dejan de contarse como solicitudes de servicio pendientes, para evitar duplicar el mismo trabajo. Cuando se cierra la orden, la solicitud aparece atendida.
- El porcentaje “AC operativo verificado” cuenta las unidades verdes respecto de las registradas bajo los filtros generales. Representa información documentada, no telemetría en tiempo real.
- El tablero consulta cambios cada **30 segundos** cuando está visible. Pausa la actualización mientras se captura un formulario o está abierto un expediente para no interrumpir la lectura o la captura. El botón Actualizar permite refrescar manualmente.
- Las evaluaciones manuales que registran AC no operativo generan un aviso en la campanita de la marca correspondiente.

## Administración y trazabilidad

- Editar ficha permite actualizar datos técnicos, base, vigencia de evaluación y condición comprobada. Los cambios conservan una bitácora con autor y fecha.
- Empresa, número económico y marca son la identidad del expediente y no se cambian desde la edición. También se conserva el nombre de la empresa después de su alta para mantener la relación con las órdenes históricas.
- Desmarcar “Unidad activa en Flotas AC” archiva la unidad en este módulo y la oculta al supervisor. El administrador puede consultar “Archivados” y reactivarla. Las órdenes históricas conservan sus reglas de consulta por marca y no se borran.
- Los controles de versión impiden que dos capturas simultáneas se sobrescriban sin advertencia.
- El expediente muestra las últimas 30 órdenes, las últimas 30 solicitudes y los últimos 30 cambios de ficha; los indicadores consideran todo el historial pertinente. La consulta general de órdenes conserva los registros anteriores.
- Las flotas existentes no se incorporan automáticamente: el administrador debe confirmar la marca del AC de cada unidad. El historial se conecta al registrar una unidad con empresa, económico y marca coincidentes.

## Verificación realizada

- 57 pruebas de regresión del módulo anterior y 14 pruebas nuevas de Flotas AC, sin fallos.
- Navegador: alta de empresas, registro por lote, copia desde Flotas, evaluación, filtros, expediente, solicitud prellenada, exportación, campanita, actualización automática y archivo.
- Aislamiento entre marcas dentro de una misma empresa y después de reasignar o desactivar un supervisor.
- Revisión visual en escritorio y celular, sin desbordamiento horizontal.
