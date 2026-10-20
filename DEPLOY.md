# Despliegue gratis: GitHub Pages + Oracle Cloud + TiDB Cloud

```
GitHub Pages (frontend) → https://TU-SUBDOMINIO.duckdns.org (Caddy + API en Oracle) → TiDB Cloud (MySQL)
```

Oracle Cloud *Always Free* da un servidor Linux real (2 OCPU Arm y 12 GB de RAM) que no se duerme y puede
generar los PDF de boletines y consolidados con Python + Chromium. Pide tarjeta solo para verificar tu identidad.

## 1. TiDB Cloud (base de datos)
1. Crea un cluster **Starter** en https://tidbcloud.com → **Connect**. Guarda host, usuario (con prefijo, p. ej. `abc123.root`), contraseña y puerto **4000**.
2. Desde tu computador, en `backend/`, crea un `.env` con esos datos y `DB_SSL=true` (parte de `.env.example`) y ejecuta una sola vez:
   ```
   npm install
   npm run db:init
   ```
   Para llevar tus datos locales: `mysqldump -u root -p --no-tablespaces --single-transaction edu_nova > backup.sql` e impórtalo con el cliente `mysql` que TiDB muestra en *Connect*.

## 2. Servidor en Oracle Cloud
1. Crea la cuenta en https://www.oracle.com/cloud/free/. Elige bien la **región principal**: no se puede cambiar y las máquinas gratis solo se crean ahí.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04** (o 24.04)
   - Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPU / 12 GB** (el máximo gratis para toda la cuenta)
   - Descarga la llave SSH privada y deja la IP pública asignada.
   - Si sale *"Out of host capacity"*, prueba otro *Availability domain* o reintenta más tarde.
3. **Abrir puertos 80 y 443** (hacen falta los dos pasos):
   - En la consola: **Networking → Virtual Cloud Networks → tu VCN → Security Lists → Add Ingress Rules**: origen `0.0.0.0/0`, TCP, puertos `80` y `443`.
   - Dentro del servidor (las imágenes de Oracle traen un firewall adicional):
     ```bash
     sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
     sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
     ```
4. Conéctate: `ssh -i tu_llave.key ubuntu@IP_PUBLICA`
5. Instala Docker:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && exit      # vuelve a entrar por SSH
   ```

## 3. Dominio gratis con HTTPS (DuckDNS)
GitHub Pages es HTTPS, así que la API también debe serlo.
1. Entra a https://www.duckdns.org, crea un subdominio (p. ej. `edunova`) y apúntalo a la **IP pública** del servidor.
2. Caddy obtiene y renueva el certificado solo; solo necesitas poner el dominio en el `.env`.

## 4. Desplegar la API
En el servidor:
```bash
git clone https://github.com/IngeMartin-dev/Edu_Nova.git
cd Edu_Nova/deploy/oracle
cp .env.example .env
nano .env            # DOMAIN, datos de TiDB, JWT_SECRET (openssl rand -hex 48), ALLOWED_ORIGINS
docker compose up -d --build
```
La primera vez tarda varios minutos (descarga Chromium). Luego prueba:
- `https://TU-SUBDOMINIO.duckdns.org/api/health` → `{"status":"UP",...}`
- `docker compose logs -f api` para ver los logs.

Para actualizar tras un cambio: `git pull && docker compose up -d --build`.

## 5. GitHub Pages (frontend)
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** → `VITE_API_URL` = `https://TU-SUBDOMINIO.duckdns.org` (sin `/` final).
3. Haz push a `main` (o ejecuta el workflow *Deploy frontend to GitHub Pages* desde **Actions**). Se publica en `https://ingemartin-dev.github.io/Edu_Nova/`.

## Dónde se guardan los archivos
Los boletines, consolidados, promociones, firmas, archivos del chat y fotos se guardan en volúmenes de Docker del servidor **y** se respaldan en TiDB (tabla `stored_files`, se crea sola). Si recreas el servidor, al arrancar se restauran desde la base. Límite del respaldo: 5 MB por archivo. Para desactivarlo: `FILE_VAULT=false`.

## Cosas a tener en cuenta
- **Instancias inactivas:** Oracle puede reclamar máquinas *Always Free* que considere inactivas (en 7 días, CPU, red y memoria por debajo del 20 %). Una app escolar con poco uso podría caer ahí. Revisa que tu instancia siga encendida y consulta en la documentación de Oracle si conviene pasar la cuenta a *Pay As You Go* (no se cobra mientras te mantengas dentro de lo gratis).
- **Seguridad:** cambia las contraseñas de `admin` y `profesor` (`EduNova2026*` está en el repositorio público) y no subas nunca el `.env`.
- **2FA por correo:** sin `SMTP_*` el código se imprime en los logs del servidor.
