# CARLAB CLOUD V2 | Fase 2

Versión sencilla y lista para internet del flujo de garantías con usuarios y roles.

## Qué trae
- Login
- Roles: admin, operador, operativo, supervisor
- Operador crea reportes con evidencias, refacción y firma
- Operativo acepta, rechaza o deja pendiente
- Operativo mueve el flujo a en proceso, espera refacción o terminada
- Supervisor solo ve
- Admin crea usuarios
- Historial básico por movimiento
- PDF por reporte
- PostgreSQL central para que abra donde abra se vea lo mismo

## Acceso inicial
Al primer deploy se crea este admin automático:
- Correo: `admin@carlab.local`
- Contraseña: `Admin123*`

Cámbialo creando tus usuarios reales desde el panel.

## Roles
### Operador
- crea reportes
- ve solo sus reportes

### Operativo
- ve todo
- acepta, rechaza o deja pendiente
- cambia estatus operativo

### Supervisor
- ve todo
- no modifica

### Admin
- ve todo
- crea usuarios
- puede revisar igual que operativo

## Variables de entorno
- `DATABASE_URL`
- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Correr local
```bash
npm install
cp .env.example .env
# edita .env si quieres
npm start
```

## Deploy en Render
1. Sube esta carpeta a GitHub.
2. En Render usa **New + → Blueprint**.
3. Selecciona el repo.
4. Espera a que cree app + PostgreSQL.
5. Entra con el admin inicial.

## Nota práctica
Esta fase 1 está hecha para ser fácil de levantar y operar.
No trae permisos rebuscados ni módulos extras. Solo lo necesario para que jale bien.


## Variables nuevas para agenda y WhatsApp
- TWILIO_TEMPLATE_PROGRAMAR_UNIDAD=HX...
- TWILIO_TEMPLATE_CONFIRMACION_CITA=HX... (opcional)
- Webhook entrante en Twilio: https://carlab-cloud-v2.onrender.com/webhook/whatsapp
- Status callback (opcional): https://carlab-cloud-v2.onrender.com/api/whatsapp/status
