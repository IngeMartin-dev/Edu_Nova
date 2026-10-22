# Despliegue gratis: GitHub Pages + Vercel + Supabase

```
GitHub Pages (frontend)  →  Vercel (API Express + PDF con Chromium)  →  Supabase (PostgreSQL + Storage de PDF/firmas/fotos/chat)
```

Sin tarjeta de crédito. Nada del backend vive en tu PC.

> **Seguridad primero.** Si pegaste la `SUPABASE_SECRET_KEY` (o la contraseña de TiDB) en un chat o en un archivo, considérala comprometida:
> Supabase → *Settings → API Keys* → genera una nueva y bórrala de donde la hayas escrito. La clave secreta **solo** va como variable de entorno en Vercel; nunca en el repo.

## 1. Supabase
1. Proyecto **EduNova** → botón **Connect** → copia dos cadenas del **Pooler** (reemplaza `[YOUR-PASSWORD]` por la contraseña de la base, *Settings → Database*):
   - **Session pooler** (puerto **5432**): para crear las tablas desde tu PC (funciona por IPv4).
   - **Transaction pooler** (puerto **6543**): para Vercel.
2. *Settings → API Keys*: toma `SUPABASE_URL` (`https://xxxx.supabase.co`) y la **Secret key** (nueva).
3. *Storage*: el bucket `edunova` (privado) se crea solo la primera vez que se guarda un archivo. Puedes crearlo tú (privado) si prefieres.

## 2. Crear las tablas (una sola vez, desde tu PC)
```bash
cd backend
npm install
DATABASE_URL="postgresql://postgres.REF:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres" DB_SSL=true npm run db:init
# opcional: datos de ejemplo
DATABASE_URL="..." DB_SSL=true npm run db:demo
```
(En PowerShell: `$env:DATABASE_URL="..."; $env:DB_SSL="true"; npm run db:init`.)
Crea 26 tablas con **RLS activado** (la API pública de Supabase queda cerrada; solo el backend entra) y el usuario `admin` / `EduNova2026*` — cámbiala al entrar.

## 3. Vercel (backend)
1. https://vercel.com → **Add New → Project** → importa `IngeMartin-dev/Edu_Nova`.
2. **Root Directory: `backend`**. Framework: *Other*. No pongas Build Command.
3. **Environment Variables**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Transaction pooler (puerto 6543) |
| `DB_SSL` | `true` |
| `JWT_SECRET` | texto aleatorio de 32+ caracteres (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `ALLOWED_ORIGINS` | `https://ingemartin-dev.github.io` (sin `/` final) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | la clave secreta **nueva** |
| `SUPABASE_BUCKET` | `edunova` |
| `CRON_SECRET` | texto aleatorio largo (protege `/api/cron/daily`) |

4. **Deploy**. Prueba `https://TU-PROYECTO.vercel.app/api/health` → `{"status":"UP"…}` y, entrando como admin, `/api/system/pdf-status`.

## 4. GitHub Pages (frontend)
1. Repo → *Settings → Secrets and variables → Actions → Variables* → crea `VITE_API_URL` = `https://TU-PROYECTO.vercel.app` (sin `/` final).
2. *Settings → Pages → Source: GitHub Actions*. Cada push a `frontend/**` publica en `https://ingemartin-dev.github.io/Edu_Nova/` (o ejecuta el workflow a mano).

## Límites que conviene conocer (plan Hobby de Vercel)
- **Términos:** Hobby es para uso personal / no comercial. Revisa los términos de Vercel si el colegio lo usará de forma institucional.
- **Adjuntos del chat:** máximo **4 MB** (Vercel limita el cuerpo de la petición a 4.5 MB). Se ajusta con `CHAT_MAX_MB`.
- **Generación masiva de boletines:** corre en segundo plano en la misma función (máx. 300 s). Lotes muy grandes: genera por salón. El avance se guarda en la tabla `generation_jobs`.
- **Tareas programadas:** Hobby solo permite cron **diario** (`/api/cron/daily`, 08:00 UTC). Abrir/cerrar períodos automáticos y los avisos se revisan además con el uso normal de la API.
- **Límite de intentos de login/peticiones:** se cuenta por instancia (no es global).
- **Primer PDF tras un rato sin uso:** tarda unos segundos extra (arranque de Chromium).
- **Fuentes:** Chromium serverless trae pocas fuentes; si el boletín (Times New Roman) se ve distinto, avísame y se incrusta una fuente.
- Supabase gratis pausa el proyecto tras 1 semana sin actividad; se reactiva desde el panel.

## Desarrollo local
```bash
cd backend && cp .env.example .env     # pon DATABASE_URL (Postgres local o Supabase) y JWT_SECRET
npm install && npm run db:init && npm start      # http://localhost:8080
cd ../frontend && npm install && npm start       # http://localhost:4200
```
Sin `SUPABASE_*` los archivos van a `backend/storage/`. Para los PDF necesitas Chrome/Edge instalado (o `CHROME_PATH`).
