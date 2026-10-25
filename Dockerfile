# ==============================================================================
# ASISTA - SISTEMA DE CONTROL DE ASISTENCIA BIOMÉTRICA (SENA)
# Dockerfile Multi-Etapa de Producción (Monolito: Express sirve API + SPA)
# ==============================================================================

# ------------------------------------------------------------------------------
# ETAPA 1: Compilación de la Interfaz Web (Vue 3 + Vite + Quasar)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

# Instalación reproducible a partir del lockfile
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# ETAPA 2: Dependencias de producción del backend (compila módulos nativos)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS backend-deps

WORKDIR /app

# Toolchain solo para compilar better-sqlite3 si no hay binario precompilado.
# Se queda en esta etapa: NO llega a la imagen final.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ------------------------------------------------------------------------------
# ETAPA 3: Imagen final mínima, sin compiladores y con usuario sin privilegios
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

# Puerto configurable: en build (--build-arg PORT=4650) o en runtime (variable PORT)
ARG PORT=3000
ENV NODE_ENV=production \
    PORT=${PORT} \
    TZ=America/Bogota

WORKDIR /app

COPY --from=backend-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/ ./
COPY --from=frontend-builder --chown=node:node /app/frontend/dist ./public

# Directorio persistente para las bases SQLite (montado como volumen).
# Es lo único escribible por la aplicación.
RUN mkdir -p /app/data/docentes && chown -R node:node /app/data

# Nunca ejecutar Node como root dentro del contenedor
USER node

EXPOSE ${PORT}

# Healthcheck con Node (sin depender de curl en la imagen)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
