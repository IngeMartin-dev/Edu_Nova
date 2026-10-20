# Despliegue gratis: GitHub Pages + Koyeb + TiDB Cloud

```
GitHub Pages (frontend React) → Koyeb (API Express) → TiDB Cloud (MySQL)
```

## 1. TiDB Cloud (base de datos)
1. Crea un cluster **Starter** en https://tidbcloud.com y pulsa **Connect** (Connect with: *General* / mysql2). Guarda host, usuario (lleva prefijo, p. ej. `abc123.root`), contraseña y puerto **4000**.
2. Desde `backend/` crea el `.env` con esos datos y `DB_SSL=true`, y ejecuta una sola vez:
   ```
   npm install
   npm run db:init
   ```
   Para llevar tus datos locales: `mysqldump -u root -p --no-tablespaces --single-transaction edu_nova > backup.sql` e impórtalo con el cliente `mysql` que TiDB muestra en *Connect*.

## 2. Koyeb (API)
1. https://www.koyeb.com → **Create Web Service** → GitHub → este repo.
2. **Work directory**: `backend` · Build: buildpack Node · Run: `npm start` · Puerto: `8080` · Instancia: **Free**.
3. Variables de entorno (Settings → Environment, como *Secret* las sensibles):
   ```
   NODE_ENV=production
   PORT=8080
   DB_HOST=…  DB_PORT=4000  DB_USER=…  DB_PASSWORD=…  DB_NAME=edu_nova  DB_SSL=true
   JWT_SECRET=<64+ caracteres aleatorios>
   TRUST_PROXY=true
   ALLOWED_ORIGINS=https://ingemartin-dev.github.io
   ```
4. Prueba `https://TU-SERVICIO.koyeb.app/api/health` → `{"status":"UP",...}`.

## 3. GitHub Pages (frontend)
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** → crea `VITE_API_URL` = `https://TU-SERVICIO.koyeb.app` (sin `/` final).
3. Haz push a `main`: el workflow `.github/workflows/deploy-pages.yml` compila y publica en `https://ingemartin-dev.github.io/Edu_Nova/`.

## Dónde se guardan los archivos
Los boletines, consolidados, promociones, firmas, archivos del chat y fotos de perfil se **respaldan automáticamente en TiDB** (tabla `stored_files`, se crea sola al arrancar). Cada vez que el backend guarda un archivo en disco también lo copia a la base, y al iniciar restaura los que falten. Así sobreviven a los redeploys y reinicios de Koyeb.
- Límite: **5 MB por archivo** (los más grandes quedan solo en disco y se avisa en los logs).
- Para desactivarlo: `FILE_VAULT=false`.
- El plan Starter de TiDB da varios GB gratis; revisa su uso en el panel si generas muchos boletines.

## Limitaciones del plan gratis
- **Generar los PDF** de boletines y consolidados necesita Python + Chromium, que no caben en Koyeb free (512 MB). Los PDF ya generados se guardan y se descargan bien, pero generarlos nuevos requiere correr el backend en otro lugar con más memoria.
- El código 2FA se imprime en consola si no configuras `SMTP_*`.
