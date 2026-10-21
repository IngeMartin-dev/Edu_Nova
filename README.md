# EduNova

Plataforma de gestión académica: estudiantes, materias, notas por período, boletines, consolidados,
acudientes, directores de grupo, notificaciones y autenticación de dos factores.

- **Backend:** Node.js + Express (JavaScript) · **Base de datos:** MySQL 8 (`edu_nova`)
- **PDF (boletines y consolidados):** Python + Playwright
- **Frontend:** React 18 (Vite, JavaScript) con tema morado propio (servido por el mismo Express)

## Estructura

```
backend/    Express + MySQL (API, PDF con Python/Playwright, sirve el frontend desde backend/public)
frontend/   React 18 + Vite en JavaScript (.jsx), una página por módulo en src/pages
branding/   Logo, símbolo, versión monocromática y favicon
```

## Estado del proyecto

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | API Express + MySQL: login, JWT, 2FA, usuarios, estudiantes, materias, profesores, padres, directores de grupo, períodos, notas, año escolar, promociones, notificaciones, logo | ✅ |
| 2 | Boletines y consolidados en PDF (Python + Playwright), recuperaciones y planes de estudio, chat con archivos, firmas, boletines para acudientes, exportación de datos | ✅ |
| 3 | Frontend React rediseñado en morado, servido por Express + .zip final | ✅ |

## Despliegue gratis (GitHub Pages + tu PC + TiDB Cloud)

Ver [DEPLOY.md](DEPLOY.md). En Windows, `scripts/windows/instalar.ps1` deja el backend listo (Node, `.venv`, Chromium y `.env`).

## Requisitos

- Node.js 18 o superior
- MySQL 8 corriendo en `localhost:3306`
- Python 3.9+ (solo para generar los PDF)

## Instalación

```bash
cd backend
npm install
cp .env.example .env        # edita DB_PASSWORD y genera JWT_SECRET (ver abajo)
npm run db:init             # crea la base edu_nova, tablas, roles, períodos y 51 materias
npm run db:demo             # (opcional) 44 estudiantes y acudientes de ejemplo
npm run build:front         # compila el frontend y lo copia a backend/public (el .zip ya lo trae)
npm start                   # app completa en http://localhost:8080
```

Abre http://localhost:8080 e ingresa con `admin` / `EduNova2026*`. Para desarrollo del frontend con recarga en vivo: `cd frontend && npm start` (puerto 4200, apunta a la API en 8080).

Generar `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### PDF de boletines y consolidados

```bash
pip install -r backend/python/requirements.txt
playwright install chromium
```

El administrador puede verificar el estado en `GET /api/system/pdf-status`. Si Python no se llama
`python3`/`python` en tu sistema, define `PYTHON_BIN` en `.env` (por ejemplo `PYTHON_BIN=py` en Windows).
Los PDF generados se guardan en `backend/storage/` (ignorado por Git).

Reiniciar la base desde cero: `npm run db:reset` (⚠ borra todo).

### Cuentas iniciales

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Administrador | `admin` | `EduNova2026*` |
| Profesor | `profesor` | `EduNova2026*` |
| Acudientes demo | `acudiente1` … `acudiente44` | `Demo2026*` |

Cámbialas al instalar en producción (variables `ADMIN_PASSWORD` / `TEACHER_PASSWORD` antes de `db:init`).

## Autenticación de dos factores (2FA)

El usuario activa 2FA en **Configuración**. En cada inicio de sesión se envía un código de 6 dígitos
al correo (vence en 10 minutos, un solo uso). Sin SMTP, en desarrollo el código **se imprime en la
consola del servidor**. Para enviar correos reales (ejemplo con Gmail):

1. En la cuenta de Google activa la **verificación en dos pasos** (https://myaccount.google.com/security).
2. Crea una **contraseña de aplicación** en https://myaccount.google.com/apppasswords (16 letras; es distinta a tu clave normal).
3. En `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_cuenta@gmail.com
SMTP_PASS=la_contraseña_de_aplicación_sin_espacios
MAIL_FROM="EduNova <tu_cuenta@gmail.com>"
```

4. Reinicia el backend y prueba: `npm run mail:test -- tucorreo@gmail.com`.

Otros proveedores gratis con SMTP: Brevo (smtp-relay.brevo.com:587) y Resend (smtp.resend.com:465 con `SMTP_SECURE=true`).
En producción el SMTP es obligatorio (si no, el login con 2FA falla).

## Notificaciones push (Firebase Cloud Messaging)

Opcional y gratis. Llegan aunque la pestaña esté cerrada (chat, apertura/cierre de períodos).

1. Crea un proyecto en https://console.firebase.google.com.
2. **Cuenta de servicio:** Configuración del proyecto → Cuentas de servicio → *Generar nueva clave privada*.
   Guarda el JSON como `backend/firebase-service-account.json` (ya está ignorado por Git; **nunca lo subas**).
3. **App web:** Configuración del proyecto → Tus apps → `</>` Web → registra la app y copia los valores
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. **Clave VAPID:** Configuración → Cloud Messaging → *Certificados push web* → Generar par de claves.
5. En `backend/.env`:

```
FIREBASE_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_FILE=firebase-service-account.json
FIREBASE_WEB_API_KEY=...
FIREBASE_WEB_AUTH_DOMAIN=...
FIREBASE_WEB_PROJECT_ID=...
FIREBASE_WEB_STORAGE_BUCKET=...
FIREBASE_WEB_MESSAGING_SENDER_ID=...
FIREBASE_WEB_APP_ID=...
FIREBASE_WEB_VAPID_KEY=...
```

6. Reinicia el backend (si falta, `npm install firebase-admin`), inicia sesión y **acepta el permiso** de notificaciones.
   Prueba con `POST /api/notifications/push-test` (con tu sesión iniciada) o enviando un mensaje de chat a otro usuario.

No necesitas recompilar el frontend: toma la configuración pública del backend. El push exige `https://` o `localhost`.

## Asistente de IA (planes de estudio)

Funciona con cualquier proveedor compatible con la API de OpenAI. Claves **gratis y sin tarjeta**:

| Proveedor | Dónde obtener la clave | `AI_URL` |
|-----------|------------------------|----------|
| **Google AI Studio (Gemini)** — recomendado para planes largos | https://aistudio.google.com/apikey | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| **Groq** — muy rápido | https://console.groq.com/keys | `https://api.groq.com/openai/v1/chat/completions` |
| **OpenRouter** — muchos modelos `:free` | https://openrouter.ai/keys | `https://openrouter.ai/api/v1/chat/completions` |
| **Cerebras** | https://cloud.cerebras.ai | `https://api.cerebras.ai/v1/chat/completions` |

```
AI_API_KEY=tu_clave
AI_URL=<la URL de la tabla>
AI_MODEL=<nombre del modelo, cópialo de la consola del proveedor>
AI_MAX_TOKENS=8000      # con Groq gratis: 4000
```

Los límites y nombres de modelos cambian seguido: comprueba la configuración con `npm run ai:test`.
Las claves solo viven en `backend/.env`; el navegador nunca las ve (el backend hace de intermediario).

## Seguridad

Las contraseñas están en `.env` (ignorado por Git). Contraseñas con bcrypt, JWT con refresh tokens
rotativos, bloqueo tras 5 intentos fallidos (15 min), límite de peticiones, cabeceras con Helmet,
CORS restringido y validación del tipo real de las imágenes subidas.

## Módulos de la API

`/api/auth` · `/api/users` · `/api/students` · `/api/subjects` · `/api/teachers` · `/api/parents` ·
`/api/homeroom-assignments` · `/api/periods` · `/api/grades` (notas, recuperaciones, planes de estudio) ·
`/api/grade-columns` · `/api/school-year` · `/api/promociones` · `/api/boletines` · `/api/consolidado` ·
`/api/chats` · `/api/notifications` · `/api/messages` · `/api/feedback` · `/api/export` · `/api/ai` ·
`/api/reportcards` · `/api/signatures`

El asistente de IA queda desactivado (responde 503 con un mensaje claro) mientras no se definan
`AI_API_KEY`, `AI_URL` y `AI_MODEL`.

## Pruebas

```bash
cd backend && npm test
```

## Marca

Los logos están en `branding/` (se regeneran con `python3 branding/build_logos.py`) y se sirven en `/img/*`.