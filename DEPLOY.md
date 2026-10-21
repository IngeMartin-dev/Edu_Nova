# Despliegue gratis: GitHub Pages + tu PC + TiDB Cloud

```
GitHub Pages (frontend) → Tailscale Funnel (URL pública HTTPS) → tu PC (API + PDF) → TiDB Cloud (datos)
```

Todo gratis y sin tarjeta. Tu PC es el servidor: debe estar **encendido y con internet** mientras se use EduNova.
Genera los PDF de boletines y consolidados (Python + Chromium) y los datos viven en TiDB, no en tu PC.

## 1. TiDB Cloud (base de datos)
1. Crea un cluster **Starter** en https://tidbcloud.com → **Connect**. Guarda host, usuario (con prefijo, p. ej. `abc123.root`), contraseña y puerto **4000**. Si compartiste la contraseña en algún lado, genera una nueva ahí mismo.
2. No uses la base `sys` (es interna de TiDB): EduNova crea la suya, `edu_nova`.

## 2. Instalar en tu PC (Windows)
Instala antes **Node.js 18+** (https://nodejs.org) y **Python 3.9+** (https://www.python.org, marcando *Add python.exe to PATH*). Luego, **fuera de OneDrive**:

```powershell
cd C:\
git clone https://github.com/IngeMartin-dev/Edu_Nova.git EduNova
cd EduNova
powershell -ExecutionPolicy Bypass -File scripts\windows\instalar.ps1
```

El script instala las dependencias, crea `backend\.venv`, descarga Chromium y crea `backend\.env` con `JWT_SECRET`, puerto 4000, SSL y CORS ya puestos. Se abre el `.env`: completa **solo** estas líneas con tus datos de TiDB:

```
DB_HOST=gateway01.xxxx.prod.aws.tidbcloud.com
DB_USER=abc123.root
DB_PASSWORD=tu_contraseña
DB_NAME=edu_nova
```

Crea las tablas (una sola vez) y prueba:

```powershell
cd backend
npm run db:init
npm start
```
Abre http://localhost:8080/api/health → `{"status":"UP",...}`. Con sesión de administrador, `/api/system/pdf-status` debe mostrar `dependencias: true`.

## 3. Hacerlo público con Tailscale Funnel
1. Instala Tailscale (https://tailscale.com/download) y entra con tu cuenta.
2. En https://login.tailscale.com/admin/dns activa **MagicDNS** y **HTTPS Certificates**.
3. Con el servidor corriendo:
   ```powershell
   tailscale funnel --bg 8080
   ```
   Imprime tu URL pública (`https://tu-pc.tu-red.ts.net`). Pruébala con el celular **con datos móviles**: `TU-URL/api/health`.
4. No cambies el nombre del PC ni de la red de Tailscale: la URL depende de ellos.

## 4. Que arranque solo
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\autoarranque.ps1
```
La API arranca al iniciar sesión en Windows y se reinicia si se cae (log en `backend\server.log`). Además, en Configuración → Sistema → Inicio/apagado, pon que el PC **nunca se suspenda** (al menos enchufado). `tailscale funnel --bg` se conserva tras reiniciar.

## 5. Frontend en GitHub Pages
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** → `VITE_API_URL` = tu URL de Funnel (sin `/` final).
3. En **Actions**, ejecuta *Deploy frontend to GitHub Pages*. Quedará en `https://ingemartin-dev.github.io/Edu_Nova/`.

## Mantenimiento
- **Actualizar:** `git pull`, luego reiniciar la API (`Stop-ScheduledTask "EduNova API"; Start-ScheduledTask "EduNova API"`). Si cambió `frontend/`, el push ya vuelve a publicar Pages.
- **Archivos:** boletines, consolidados, firmas, chat y fotos se guardan en `backend\storage` y `backend\uploads` **y** se respaldan en TiDB (tabla `stored_files`). Si cambias de PC se restauran solos al arrancar. Límite: 5 MB por archivo. Se desactiva con `FILE_VAULT=false`.
- **Seguridad:** cambia las contraseñas de `admin` y `profesor` (`EduNova2026*` está en el repo público) y nunca subas `backend\.env`.

## Límites
- Si el PC se apaga, se suspende o pierde internet, EduNova deja de responder.
- Funnel está en beta y tiene límites de ancho de banda que Tailscale no publica.
- Sin `SMTP_*`, el código de 2FA se imprime en `server.log`.
