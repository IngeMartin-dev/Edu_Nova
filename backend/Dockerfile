# API de EduNova (Node + Express) con generación de PDF (Python + Playwright + Chromium).
# Funciona en x86_64 y en ARM64 (Oracle Ampere A1).
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PYTHON_BIN=/opt/venv/bin/python \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python + Chromium (capa aparte para que se cachee entre despliegues)
COPY python/requirements.txt python/requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r python/requirements.txt \
 && /opt/venv/bin/playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* \
 && chmod -R a+rX /ms-playwright

# Dependencias de Node
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código
COPY . .

# Carpetas de archivos generados/subidos (se montan como volúmenes en docker-compose)
RUN mkdir -p /app/storage /app/uploads/profile-pictures && chown -R node:node /app/storage /app/uploads
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
