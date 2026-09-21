# 🎓 Sistema de Asistencia Biométrica SENA (DigitalPersona U.are.U 4500)

Sistema integral modular para el control, registro y reporte de asistencia de aprendices e instructores mediante biometría dactilar con hardware DigitalPersona U.are.U 4500, WebSockets en tiempo real y soporte para Modo Kiosco Autónomo de Aula.

Incluye una plataforma web responsiva (dashboard administrativo y panel de instructores), una API REST desacoplada y contenerizada (lista para despliegue en Docker/Linux), y una aplicación de escritorio local (Electron) que interactúa directamente con el lector biométrico y sus controladores nativos en Windows.

---

## 🏛️ Arquitectura del Sistema

El proyecto opera bajo un modelo de 3 capas claramente desacopladas:

```text
       ┌────────────────────────┐      ┌────────────────────────┐
       │   Frontend Web (Vue 3) │      │Kiosco Físico (Electron)│
       │    Dashboard / Admin   │      │   DigitalPersona 4500  │
       └───────────┬────────────┘      └───────────┬────────────┘
                   │                               │
        REST API / │                    REST API / │ WebSockets
        WebSockets │                    Sincroniz. │
                   ▼                               ▼
       ┌────────────────────────────────────────────────────────┐
       │              Backend API (Node.js 22)                  │
       │     - Autenticación JWT & Control de Roles             │
       │     - Servidor WebSockets en tiempo real               │
       │     - Cron jobs de auto-cierre y agregación diaria     │
       └───────────────┬────────────────────────┬───────────────┘
                       │                        │
                       ▼                        ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │  MongoDB Atlas (Cloud) │      │ SQLite Local (/data)   │
       │  Entidades, Usuarios,  │      │ Auditoría, respaldo y  │
       │  Plantillas Huella     │      │ reportes relacionales  │
       └────────────────────────┘      └────────────────────────┘
```

1. **`backend/` (API REST & WebSockets):** Servidor Node.js 22 + Express. Completamente agnóstico del sistema operativo (sin DLLs de Windows en el servidor). Maneja persistencia en MongoDB Atlas y SQLite relacional local, notificaciones SMTP (Gmail) y tareas cron automáticas.
2. **`frontend/` (Aplicación Web SPA):** Vue 3 + Vite. Panel administrativo, gestión de fichas, aprendices, reportes, justificaciones y monitoreo en vivo de clases.
3. **`huellero/` (Aplicación de Escritorio Kiosco):** Electron + Vue 3 + C++ FFI (koffi). Contiene los drivers nativos y DLLs de DigitalPersona para Windows. Realiza la captura y comparación biométrica en el cliente y sincroniza la asistencia con el Backend.

---

## 📁 Estructura del Proyecto

```text
HuelleroActualizado/
├── backend/                       # ⚙️ Servidor API Node.js 22 + Express + WebSockets
│   ├── controllers/               # 🎮 Controladores de lógica HTTP y base de datos
│   ├── middlewares/               # 🛡️ Validadores de datos y control de roles JWT
│   ├── models/                    # 📦 Modelos Mongoose (Aprendices, Instructores, Fichas, etc.)
│   ├── routes/                    # 🛣️ Enrutadores REST API (/api/...)
│   ├── services/                  # 🔧 Servicios (SQLite, Sockets, Tardanzas, Notificaciones)
│   ├── data/                      # 💾 Base de datos relacional SQLite persistente
│   ├── Dockerfile                 # 🐳 Imagen Docker de Producción (Node 22 Bookworm Slim)
│   ├── Dockerfile.dev             # 🐳 Imagen Docker de Desarrollo (Node 22 con recarga en vivo)
│   ├── .env.example               # 📋 Plantilla de variables de entorno
│   └── package.json
│
├── frontend/                      # 💻 Aplicación Web Reactiva (Vue 3 + Vite)
│   ├── src/
│   │   ├── components/            # 🖼️ Vistas (PanelInstructor, KioscoAsistencia, Reportes, Perfiles)
│   │   ├── services/              # 📡 Clientes de API REST y WebSockets en tiempo real
│   │   ├── utils/                 # 🧰 Validadores y formateadores de fechas/horas
│   │   └── App.vue                # 🚀 Enrutamiento principal y control de sesión
│   ├── nginx.conf                 # 🌐 Configuración Nginx (Reverse Proxy /api y WebSockets)
│   ├── Dockerfile                 # 🐳 Multi-stage build para Producción con Nginx Alpine
│   ├── Dockerfile.dev             # 🐳 Imagen Docker de Desarrollo (Vite Server 5173)
│   └── package.json
│
├── huellero/                      # 🖐️ Aplicación local Electron (Desktop Windows)
│   ├── src/main/                  # ⚙️ Captura de huella, motor biométrico, WebSocket, SQLite offline
│   ├── src/renderer/              # 🖼️ UI del kiosco de aula (Vue 3)
│   ├── dll/                       # 🔌 Librerías nativas DigitalPersona (dpfj.dll, dpfpdd.dll, etc.)
│   └── package.json
│
├── docs/                          # 📚 Documentación técnica del proyecto 
│   └── CONTEXTO_HUELLERO.md       # 📄 Contexto y roadmap del huellero biométrico
├── docker-compose.yml             # 🚀 Orquestador Docker para PRODUCCIÓN
├── docker-compose.dev.yml         # 🛠️ Orquestador Docker para DESARROLLO
├── package.json                   # ⚡ Monorepo scripts raíz
└── setup_huellas.bat              # 📦 Instalador y verificador integral de dependencias
```

---

## ⚙️ Configuración Inicial (`backend/.env`)

Antes de iniciar el backend o los contenedores Docker, crea el archivo `backend/.env` (puedes basarte en `backend/.env.example`):

```env
# Servidor
PORT=3000

# Base de Datos MongoDB Atlas
MONGODB_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# Seguridad JWT
JWT_SECRET=tu_clave_secreta_jwt_2026
JWT_EXPIRES_IN=8h

# Notificaciones por Correo (Gmail SMTP con Contraseña de Aplicación)
GMAIL_USER=tu_correo@gmail.com
GMAIL_PASS=tu_contraseña_de_aplicacion_16_caracteres
```

---

## 🐳 Despliegue con Docker

El proyecto cuenta con dos configuraciones Docker Compose optimizadas y aisladas:

### 1. Entorno de Producción
En producción, el frontend se compila a estáticos optimizados servidos por **Nginx** en el puerto `80`, el cual actúa además como **Reverse Proxy** redirigiendo `/api/` y `/socket.io/` al backend en el puerto `3000`.

```bash
# Iniciar contenedores en segundo plano
docker compose up -d

# Ver logs en tiempo real
docker compose logs -f

# Detener contenedores
docker compose down
```

* **Frontend Web:** `http://localhost` (puerto 80)
* **Backend API directo:** `http://localhost:3001`

---

### 2. Entorno de Desarrollo
En desarrollo, se montan volúmenes en vivo para sincronización instantánea de código (Hot Reload en Vite y `node --watch` en Backend):

```bash
# Iniciar entorno de desarrollo
docker compose -f docker-compose.dev.yml up -d

# Ver logs en tiempo real
docker compose -f docker-compose.dev.yml logs -f

# Detener entorno de desarrollo
docker compose -f docker-compose.dev.yml down
```

* **Frontend Vite Dev:** `http://localhost:5173`
* **Backend API Dev:** `http://localhost:3001`

---

## 💻 Ejecución Local (Sin Docker)

Si prefieres ejecutar el proyecto directamente en tu máquina:

### Requisitos:
* **Node.js 22 o superior** (requerido por `better-sqlite3@13.0.3`)
* **npm 10+**

### Comandos desde la raíz del proyecto:
```bash
# Instalar dependencias en todos los paquetes
npm run install:all

# Iniciar Backend y Frontend en paralelo (Desarrollo local)
npm run dev

# Iniciar solo el Frontend Web (http://localhost:5173)
npm run dev:frontend

# Iniciar solo el Backend API (http://localhost:3001)
npm run dev:backend

# Compilar Frontend para producción
npm run build:frontend
```

---

## 🖐️ Aplicación de Escritorio - Kiosco Biométrico (`huellero/`)

La aplicación del lector biométrico corre exclusivamente en el computador donde esté conectado físicamente el dispositivo **DigitalPersona U.are.U 4500** (Windows).

### Pasos para iniciar el Kiosco:
1. Instalar drivers de DigitalPersona siguiendo [`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md).
2. Abrir terminal en la carpeta `huellero/`:
   ```bash
   cd huellero
   npm install
   npm run dev
   ```
*La ventana de Electron abrirá en modo Kiosco / Panel de Registro con soporte offline y sincronización automática hacia el Backend.*

---

## 🚧 Estado y Próximos Pasos

Resumen de alto nivel de las tareas en seguimiento (detalle completo en [`docs/CONTEXTO_HUELLERO.md`](./docs/CONTEXTO_HUELLERO.md)):

- **Acks del protocolo WebSocket** (`ACTIVATED`/`DEACTIVATED`): diseñados, pendientes de validación en campo.
- **Feed en vivo** (`ATTENDANCE_REGISTERED`): implementado y probado en backend/frontend; validar con múltiples marcaciones concurrentes.
- **Índice único de asistencias:** en MongoDB `(estudianteId, fichaId, fecha)` para prevención estricta de duplicados en concurrencia.
- **Empaquetado `.exe` del Huellero:** generación de instalador autónomo portable para Windows.
- **Auditoría de dependencias en huellero:** actualización de dependencias de build de Electron.

---

## 📖 Documentación Adicional
- 🛠️ [Guía de Instalación de Hardware y Drivers](./GUIA_INSTALACION.md)
- 📋 [Contexto y Arquitectura del Huellero](./docs/CONTEXTO_HUELLERO.md)
