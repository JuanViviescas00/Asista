# ==========================================
# Etapa 1: Compilar el Frontend (Vue 3 / Vite)
# ==========================================
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

# Instalar dependencias del frontend
COPY frontend/package*.json ./
RUN npm install

# Copiar el código del frontend y compilar
COPY frontend/ ./
RUN npm run build

# ==========================================
# Etapa 2: Servidor Backend (Node.js + Estáticos)
# ==========================================
FROM node:22-bookworm-slim

WORKDIR /app

# Instalar dependencias del backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copiar código del backend
COPY backend/ ./

# Copiar el frontend compilado en la Etapa 1 hacia backend/public
COPY --from=frontend-builder /app/frontend/dist ./public

# Crear directorio para la base de datos SQLite
RUN mkdir -p /app/data

# Render asigna dinámicamente la variable PORT (por defecto 10000)
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
