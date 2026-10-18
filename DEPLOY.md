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

## Limitaciones del plan gratis
- **PDF de boletines/consolidados**: necesitan Python + Chromium, que no caben en Koyeb free (512 MB). Esas funciones fallarán hasta moverlas a otro servicio o generarlas en el navegador.
- **Archivos subidos** (fotos, chat, firmas) y PDF generados se guardan en disco y **se pierden en cada redeploy**; migrarlos a un almacenamiento externo (p. ej. Cloudflare R2) es el siguiente paso.
- El código 2FA se imprime en consola si no configuras `SMTP_*`.
