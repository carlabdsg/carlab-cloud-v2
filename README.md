# CARLAB CLOUD REBUILD 1

Reconstrucción sobre la base estable de rescate, enfocada en mantener lo que ya funciona y elevar la experiencia visual y operativa para Render.

## Qué trae en esta iteración
- Cabina administrativa y operativa más limpia
- Centro de mando con métricas vivas
- Vista de reportes con lectura más ejecutiva
- Flotas y refacciones integradas a la misma línea visual
- Auto refresco inteligente para tablero, agenda, flotas y refacciones
- Misma base funcional de auth, roles, garantías, agenda y WhatsApp

## Roles
- Admin: control total
- Operativo: validación y flujo operativo
- Supervisor: consulta corporativa
- Supervisor de flotas: enfoque en unidades, historial y refacciones
- Operador: captura directa y seguimiento

## Acceso inicial
Al primer deploy se crea este admin automático:
- Correo: `admin@carlab.local`
- Contraseña: `Admin123*`

## Variables de entorno
- `DATABASE_URL`
- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- Variables de Twilio/WhatsApp si ya las usas en producción

## Correr local
```bash
npm install
npm start
```

## Deploy en Render
1. Sube esta carpeta al repo.
2. Haz deploy con `render.yaml` o usa Blueprint.
3. Verifica variables de entorno y conexión PostgreSQL.
4. Entra con el admin inicial y revisa cabinas por rol.

## Línea de construcción
Esta versión ya va orientada a reconstrucción precisa: mejor lectura visual, mejor centro de mando y base lista para seguir con flotas, refacciones y permisos finos sin volver a la versión azul vieja.
