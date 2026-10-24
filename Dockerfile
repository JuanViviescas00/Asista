# ==============================================================================
# ASISTA - SISTEMA DE CONTROL DE ASISTENCIA BIOMÉTRICA (SENA)
# Dockerfile Multi-Etapa de Producción Optimizado para Coolify, VPS y Nube
# ==============================================================================

# ------------------------------------------------------------------------------
# ETAPA 1: Compilación de la Interfaz Web (Vue 3 + Vite + Quasar)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

# Copiar manifiestos de paquetes e instalar dependencias
COPY frontend/package*.json ./
RUN npm install

# Copiar código fuente y generar bundle estático de producción
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# ETAPA 2: Servidor Backend de Producción (Node.js Express + Socket.IO)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Instalar curl para el healthcheck de Coolify / Docker
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de producción del backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copiar código del backend
COPY backend/ ./

# Inyectar el frontend compilado en la carpeta de estáticos del backend
COPY --from=frontend-builder /app/frontend/dist ./public


# Configuración de entorno
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=America/Bogota

# Puerto expuesto por defecto (detectado automáticamente por Coolify)
EXPOSE 3000

# Healthcheck para monitorización de estado en Coolify / Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Comando de inicio del servidor en producción
CMD ["node", "index.js"]
