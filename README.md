# CARLAB CLOUD V3.6

Versión estable con:
- Multi fotos en reportes
- WhatsApp Twilio en creación y cambios de estatus
- PDF limpio sin la raya gris
- Supervisor limitado por empresa

## Variables nuevas de entorno
- `DATABASE_URL`
- `NODE_ENV=production`
- `JWT_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER` ejemplo `whatsapp:+14155238886` o tu número aprobado
- `APP_BASE_URL` ejemplo `https://carlab-cloud-v2.onrender.com`

## WhatsApp
Envía mensajes automáticos cuando:
- se crea el reporte
- se marca pendiente de revisión
- se acepta
- se rechaza
- pasa a en proceso
- entra a espera refacción
- termina

## Deploy
Build Command: `npm install`
Start Command: `npm start`
