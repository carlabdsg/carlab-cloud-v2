# CARLAB CLOUD — Hotfix de rendimiento para demo

Fecha: 9 de julio de 2026
Rama: `perf/demo-agenda-flotas-2026-07-09`

## Diagnóstico confirmado

### Flotas

1. Al abrir el módulo se solicitan simultáneamente:
   - `/api/fleet/summary`
   - `/api/fleet/units`
   - `/api/fleet/analytics`
2. El endpoint de analítica ejecuta tres consultas adicionales y repite varias veces el mismo CTE de agregación.
3. El pool PostgreSQL usa cuatro conexiones por defecto, por lo que la propia pantalla puede ocupar o competir por casi todo el pool.
4. Las relaciones entre empresa/unidad usan normalización dinámica con `translate`, `regexp_replace` y `lower`; esto dificulta el uso de los índices simples existentes.
5. Al abrir una unidad se realizan solicitudes separadas para ficha, reportes, campañas, agenda, refacciones y costos, aunque ya existe un endpoint consolidado `/api/fleet/units/:id/details`.
6. El navegador desactiva caché para todas las peticiones con `cache: no-store` y cabeceras equivalentes.

### Agenda

1. La agenda descarga hasta 300 registros aunque normalmente solo se muestra un día y un mes.
2. Para construir el calendario, se filtra todo el arreglo nuevamente por cada día del mes.
3. Después de confirmar, reprogramar o cancelar se vuelve a descargar y renderizar la agenda completa.
4. Los estados internos (`waiting_operator`, `proposed`, `confirmed`, `cancelled`) se muestran directamente al usuario.
5. No existe un estado de carga visible ni actualización optimista; la interfaz parece detenida durante la red.

## Hotfix P0 — antes de la presentación

### Backend

- Crear `/api/fleet/dashboard` que devuelva unidades, resumen y analítica básica con una sola consulta base.
- Calcular resumen y tarjetas desde el mismo conjunto de resultados, eliminando `/summary` y `/analytics` durante la carga inicial.
- Reutilizar `/api/fleet/units/:id/details` para abrir una unidad y eliminar las cinco solicitudes progresivas.
- Evitar ejecutar `backfillFleetUnitIdForGarantiasByIdentity` durante lecturas; mantenerlo únicamente en altas, edición o migración.
- Añadir índices funcionales para las identidades normalizadas o migrar consultas a `fleet_unit_id`.
- Añadir índices compuestos para agenda por estado y fecha.
- Subir `PG_POOL_MAX` a 8 en Render solo si el plan de PostgreSQL permite esas conexiones; el arreglo principal sigue siendo reducir consultas.
- Incorporar medición `Server-Timing` y registro de consultas lentas por encima de 500 ms.

### Frontend Flotas

- Mostrar inmediatamente la última flota almacenada en memoria/localStorage y refrescar en segundo plano.
- Usar un solo endpoint para la carga inicial.
- Abrir la ficha con datos de la tarjeta y skeleton; completar con el endpoint consolidado.
- No bloquear la pantalla esperando analítica.
- Debounce de 180 ms en búsqueda.
- Render por `DocumentFragment` y actualización parcial de tarjetas.
- Conservar los semáforos actuales; no modificar su identidad visual.

### Frontend Agenda

- Solicitar únicamente el rango visible del mes y los pendientes activos.
- Preagrupar registros por fecha en un `Map` antes de renderizar el calendario.
- Traducir estados:
  - `waiting_operator` → Por responder
  - `proposed` → Propuesta recibida
  - `confirmed` → Confirmada
  - `cancelled` → Cancelada
- Añadir botones rápidos: Hoy, Mañana, Próximos 7 días y Pendientes.
- Añadir skeleton, mensaje de sincronización y actualización optimista.
- Ordenar cada día por hora y destacar la próxima cita.
- Ocultar por defecto canceladas históricas.

## Cambios P1 — después de la demo

- Columnas persistentes `empresa_key` y `unidad_key`, o índices funcionales idénticos a la función de normalización.
- Paginación/virtualización para flotas grandes.
- Cache HTTP privada de 10–20 segundos con ETag para endpoints de lectura.
- Invalidación de caché por mutaciones.
- Pruebas de carga con datos similares al cliente.
- Separar inicialización/migraciones de base de datos del arranque web.

## Criterios de aceptación

- Primera visualización de Flotas con feedback visual: menos de 300 ms.
- Datos utilizables de Flotas: objetivo menor a 1.5 s en conexión normal.
- Apertura de ficha: feedback inmediato y datos completos objetivo menor a 1 s.
- Agenda visible con feedback inmediato y datos objetivo menor a 1 s.
- Ninguna regresión en permisos, semáforos, campañas, PDF o WhatsApp.
- Rollback inmediato disponible mediante la rama `main` actual.

## Orden de lanzamiento

1. Implementar en esta rama.
2. Probar login y permisos de admin, operativo y supervisor de flotas.
3. Probar Flotas con búsqueda, filtros y detalle.
4. Probar Agenda: alta manual, confirmar, reprogramar y cancelar.
5. Verificar PDF y WhatsApp sin cambios.
6. Integrar mediante Pull Request.
7. Desplegar y ejecutar smoke test en Render.
