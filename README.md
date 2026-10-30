# Asista — Sistema de Asistencia Biométrica (SENA)

**Asista** (antes "Huellero" / "Huellero SENA") es un sistema de control de asistencia por huella dactilar para el SENA. Los aprendices marcan su ingreso en un lector **DigitalPersona U.are.U 4500** dentro del aula y la asistencia queda disponible en tiempo real para instructores y administradores.

> El nombre interno `huellero` se mantiene en carpetas (`huellero/`) y en el identificador de la app de escritorio (`appId`). El nombre comercial del producto es **Asista**.

---

## Arquitectura

El sistema tiene 3 componentes desacoplados:

| Componente | Descripción |
| :--- | :--- |
| **`huellero/`** | App de escritorio (Electron + Vue 3) que se ejecuta en el computador del aula, conectado físicamente al lector DigitalPersona U.are.U 4500. Hace la captura y comparación biométrica en el cliente usando `koffi` (FFI) y las DLLs nativas de DigitalPersona. |
| **`backend/`** | API REST y servidor de tiempo real (Node.js + Express + Socket.IO). Persistencia centralizada en la nube con **MongoDB Atlas**. |
| **`frontend/`** | Panel web (Vue 3 + Quasar + Vite) para administradores e instructores: gestión de fichas, aprendices, reportes, dispositivos y monitoreo en vivo. |

```mermaid
flowchart LR
    Lector[Lector DigitalPersona U.are.U 4500] -->|USB| Huellero
    subgraph Huellero[huellero/ — Escritorio]
        Captura[Captura y comparación local]
        Offline[Cola offline / sincronización]
    end
    subgraph Backend[backend/ — API]
        API[REST + Socket.IO]
        Mongo[(MongoDB Atlas)]
    end
    subgraph Frontend[frontend/ — Panel web]
        Panel[Admin / instructores / reportes]
    end
    Lector --> Captura
    Huellero <-->|REST + WebSockets| Backend
    Frontend <-->|REST + WebSockets| Backend
    API --> Mongo
```

El hardware biométrico y sus DLLs viven únicamente en `huellero/`, de modo que el backend y el frontend no dependen de drivers de Windows.

---

## Funciones principales

- Captura y comparación biométrica local (identificación 1:N) contra las plantillas de la ficha activa.
- Modo sin conexión: las asistencias se guardan localmente y se sincronizan automáticamente cuando vuelve la conexión (idempotente por `uuid`).
- Una asistencia por aprendiz, por ficha y por día, calculada en hora de Colombia (`America/Bogota`).
- Enrolamiento de huellas (con detección de huella duplicada y de dedo repetido).
- Registro y aprobación de equipos (dispositivos) por parte del administrador.
- Activación y cierre de clase por el instructor, con descarga de plantillas de la ficha.
- Consentimiento de tratamiento de datos personales (Habeas Data, Ley 1581 de 2012).
- Gestión de fichas, instructores, aprendices, excusas y días festivos.
- Reportes y seguimiento de inasistencias en el panel web.
- Roles: Administrador, Instructor (líder / de apoyo) y portal del aprendiz.
- Acceso de instructores: se crean con una contraseña inicial igual a su número de documento, escrito solo con números (sin puntos ni espacios); pueden cambiarla desde su Perfil. El número de documento debe registrarse sin puntos ni espacios y tener al menos 6 caracteres para poder generar la contraseña inicial.

---

## Requisitos y puesta en marcha para desarrollo

### Requisitos

- **Node.js 22** (los Dockerfiles usan `node:22-bookworm-slim` / `node:22-alpine`; no hay `.nvmrc` ni campo `engines`).
- npm.
- Para la app de escritorio: Windows 10/11 (64 bits) y lector U.are.U 4500. El driver, el SDK y el VC++ se instalan manualmente en desarrollo (ver [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)).
- En una PC nueva, `setup_huellas.bat` (raíz) instala las dependencias de `backend`, `frontend` y `huellero` y verifica los componentes nativos (DLLs biométricas y koffi FFI).

### Comandos (tomados de cada `package.json`)

**Raíz (monorepo, workspaces `backend` + `frontend`):**

```bash
npm run dev            # backend + frontend en paralelo (concurrently)
npm run dev:backend    # solo backend  (node --watch index.js)
npm run dev:frontend   # solo frontend (vite)
npm run build:frontend # compila el frontend
npm run build:prod     # compila frontend y copia dist a backend/public/
```

**`backend/`:**

```bash
npm run dev    # node --watch index.js
npm start      # node index.js
```

**`frontend/`:**

```bash
npm run dev      # vite
npm run build    # vite build
npm run preview  # vite preview
```

**`huellero/`** (no es workspace; se instala aparte):

```bash
npm install
npm run dev         # electron-vite dev
npm run build       # electron-vite build
npm run dist        # genera el instalador (ver más abajo)
```

> `huellero/` no forma parte de los workspaces de la raíz, así que sus dependencias se instalan con `npm install` dentro de `huellero/`.

### Variables de entorno (`.env`)

El sistema desacopla credenciales, conexiones y configuraciones sensibles del código fuente mediante archivos `.env`. Existen tres archivos de configuración según el componente:

* **`backend/.env`** (o `.env` en la raíz si se ejecuta con Docker Compose): Configura la API REST, base de datos MongoDB Atlas, seguridad JWT, correos SMTP, automatización y reportería.
* **`rpa/.env`**: Configuración independiente del robot de automatización con Playwright para Sofia Plus.
* **`huellero/`**: La app de escritorio lee sus variables desde el entorno o desde su almacenamiento local (`config.json` en `%APPDATA%\huellero`).

> [!CAUTION]
> Los archivos `.env` contienen secretos de autenticación y claves maestras de cifrado. **NUNCA deben subirse a Git ni compartirse públicamente**. Utiliza siempre los archivos de plantilla [`.env.example`](./.env.example) y [`backend/.env.example`](./backend/.env.example).

---

#### 1. Base de Datos y Servidor HTTP (`backend/`)

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `MONGODB_URI` | `string` | **Sí** | Cadena de conexión URI oficial de **MongoDB Atlas** o contenedor local (ej: `mongodb+srv://usuario:pass@cluster.mongodb.net/huellero?retryWrites=true&w=majority`). Si falla la conexión a Atlas en local, el backend intenta un fallback automático a `mongodb://localhost:27017/huellero`. |
| `PORT` | `number` (`3000`) | No | Puerto de escucha HTTP del servidor Express. En Render, Coolify o Heroku, la plataforma inyecta este valor dinámicamente. |
| `TZ` | `string` (`America/Bogota`) | No | Zona horaria oficial del sistema. Garantiza que el cálculo de fechas, horas de entrada/salida y cortes de inasistencias operen con la hora legal colombiana sin desfases UTC. |
| `CORS_ORIGIN` | `string` (`*`) | No | Control de orígenes permitidos para peticiones HTTP de navegadores. Acepta `*` para desarrollo libre, o un dominio específico (ej: `https://asista.onrender.com`). Alias admitidos: `CORS_ORIGINS`, `ALLOWED_ORIGINS` y `ORIGENES_PERMITIDOS`. |
| `CORS_ORIGINS` | `string` (`""`) | No | Lista blanca de orígenes adicionales separados por coma (ej: `https://asista.onrender.com,http://localhost:5173`). El backend también admite automáticamente cualquier subdominio `https://*.onrender.com`. |
| `RENDER_EXTERNAL_URL` | `string` | No | Inyectada automáticamente por Render (ej: `https://asista.onrender.com`). Si está presente, el backend la autoriza automáticamente en CORS. |

---

#### 2. Seguridad, Autenticación y Cifrado

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `JWT_SECRET` | `string` (min 32 car.) | **Sí** (en prod) | Clave criptográfica secreta para la firma y verificación de tokens de sesión JWT (algoritmo HS256). En producción (`NODE_ENV=production`), el servidor aborta el arranque si no está definida o si tiene menos de 32 caracteres. En desarrollo local genera una clave temporal aleatoria si falta. |
| `JWT_EXPIRES_IN` | `string` (`8h`) | No | Tiempo de vigencia de la sesión web antes de requerir un nuevo inicio de sesión (ej: `8h`, `1d`). |
| `SOFIA_ENCRYPTION_KEY` | `string` (min 32 car.) | No | Clave maestra para el **cifrado simétrico AES-256-GCM** de las contraseñas de Sofia Plus de los instructores. Si no se define, reutiliza el valor de `JWT_SECRET`. **Advertencia:** Si esta clave cambia en producción, las contraseñas de Sofia Plus guardadas previamente en la base de datos no podrán descifrarse. |

---

#### 3. Administrador Inicial del Sistema (Seed)

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `ADMIN_EMAIL` | `string` (`senahuellero@gmail.com`) | No | Correo electrónico de la cuenta Administrador creada en el primer arranque si la base de datos está completamente vacía. Alias: `SEED_ADMIN_EMAIL`. |
| `ADMIN_PASSWORD` | `string` | No | Contraseña inicial en texto plano para el administrador creado por primera vez (se almacena hasheada con bcrypt). Si se deja vacía, el servidor genera una contraseña aleatoria de 12 bytes y la imprime **una sola vez** en los logs de consola. Alias: `SEED_ADMIN_PASSWORD`. |
| `SEED_ADMIN_NAME` | `string` (`Administrador`) | No | Nombre visible de la cuenta administrador inicial. |
| `SEED_ADMIN_TELEFONO` | `string` (`""`) | No | Teléfono de contacto de la cuenta administrador inicial. |

---

#### 4. Servicio de Notificaciones por Correo (SMTP / Nodemailer)

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `GMAIL_USER` | `string` | No | Dirección de correo de Gmail utilizada como emisor oficial para la recuperación de contraseñas y avisos (ej: `senahuellero@gmail.com`). |
| `GMAIL_PASS` | `string` (16 car.) | No | Contraseña de aplicación generada en la cuenta de Google (no la contraseña habitual del correo). Requiere autenticación de dos pasos activada en Google. |

---

#### 5. Automatización, Cron y Robot RPA (Sofia Plus)

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `ENABLE_SOFIA_SYNC` | `boolean` (`false`) | No | **Interruptor maestro del Cron semanal:** Activa (`true`) o desactiva (`false`) la tarea programada de los sábados para revisar fallas y preparar el reporte oficial a Sofia Plus. Se recomienda `false` para mantener el reporte bajo control manual del usuario y evitar consumo de recursos en cloud. |
| `CRON_SCHEDULE` | `string` (`0 0 * * *`) | No | Expresión cron para el procesamiento nocturno de verificación y consolidación de inasistencias (medianoche diaria). |
| `CRON_TIMEZONE` | `string` (`America/Bogota`) | No | Zona horaria aplicada a todos los cron jobs del servidor. |
| `CRON_SOFIA_SCHEDULE` | `string` (`0 0 * * 6`) | No | Programación cron semanal para la sincronización con Sofia Plus (por defecto todos los sábados a las 12:00 AM hora Colombia). |
| `ENABLE_RPA_ROBOT` | `boolean` (`true`) | No | Determina si el cron semanal debe invocar automáticamente el subproceso del robot Playwright (`true`) o únicamente preparar y encolar las inasistencias en base de datos (`false`). En Render se sugiere `false` para evitar saturación de memoria RAM. |
| `RPA_API_KEY` | `string` (hex 96 car.) | **Sí** (para RPA) | Clave secreta compartida para autorizar al Robot RPA contra los endpoints protegidos del backend (`/api/instructores/*-rpa`) mediante la cabecera `x-rpa-key`. Se valida con comparación criptográfica `crypto.timingSafeEqual` para prevenir ataques de temporización. |
| `RPA_DRY_RUN` | `boolean` (`true`) | No | **Modo seguro del Robot:** Si es `true`, el robot navega por Sofia Plus, selecciona la ficha, busca al aprendiz, digita los datos y toma una captura de pantalla de evidencia, pero **NO** hace clic en 'Registrar Novedad'. Si es `false`, confirma el registro definitivo en Sofia Plus. |
| `RPA_HEADLESS` | `boolean` (`true`) | No | Si es `true`, Chromium se ejecuta oculto en segundo plano sin ventana gráfica (ideal para servidores). Si es `false`, abre la ventana visible del navegador para ver la interacción en pantalla. Alias en submódulo: `HEADLESS`. |

---

#### 6. Ruta de Deserción y Reportes

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `CORREO_COORDINADOR` | `string` | No | Correo institucional de la Coordinación Académica para recibir alertas de aprendices en riesgo de deserción (3 o más fallas acumuladas). Puede sobreescribirse dinámicamente desde el panel web. |
| `CORREO_BIENESTAR` | `string` | No | Correo del área de Bienestar al Aprendiz para seguimiento psicosocial de inasistencias. |
| `RUTA_REPORTE_ENVIO_REAL` | `boolean` (`false`) | No | Si es `true`, envía correos reales a coordinación y bienestar al pulsar el botón 'Reportar'. Si es `false`, simula el envío y registra la trazabilidad en base de datos sin enviar correos reales. |

---

#### 7. Hardware Biométrico y Kiosco de Aula (`huellero/`)

| Variable | Tipo / Defecto | Requerida | Especificación y Comportamiento |
| :--- | :---: | :---: | :--- |
| `BIOMETRIC_MATCH_THRESHOLD` | `number` (`21474`) | No | Umbral de coincidencia biométrica utilizado por el motor de comparación de DigitalPersona (FAR/FRR balanceado). |
| `HUELLERO_BACKEND_URL` | `string` (`http://localhost:3000`) | No | URL base del servidor backend a la que se conecta el kiosco de escritorio para validar dispositivos y sincronizar asistencias (en producción: `https://asista.onrender.com`). |
| `HUELLERO_WS_URL` | `string` (`ws://localhost:3000`) | No | URL del servidor WebSockets (Socket.IO) para la comunicación bidireccional en tiempo real con el aula (en producción: `wss://asista.onrender.com`). |

---

#### 8. Submódulo del Robot (`rpa/.env`)

Archivo de configuración independiente ubicado en `rpa/.env` para cuando el robot se ejecuta como worker o script CLI autónomo:

```ini
# rpa/.env
API_BASE_URL=https://asista.onrender.com
HEADLESS=true
RPA_DRY_RUN=true
RPA_API_KEY=d63f4abf1647c78b61a22316a56d76de1b34b003a43afc3a009faa24b9fa94e36480ebb44a52bcd9b8f18eae9e220757
```

---

## Instalación para usuarios

Para instalar la app de escritorio en un aula (instalador `.exe`, drivers, activación del equipo y uso diario), consulta la **Parte A** de [GUIA_INSTALACION.md](./GUIA_INSTALACION.md).

---

## Generar el instalador

```bash
cd huellero
npm run dist
```

Genera `huellero/release-app/Asista-Setup-<versión>.exe`. El instalador (NSIS, `huellero/build/installer.nsh`) incluye e instala en silencio, si aún no están presentes:

- Driver del lector U.are.U 4500.
- SDK U.are.U.
- Microsoft Visual C++ Redistributable (x64).

El instalador no está firmado digitalmente, por lo que Windows SmartScreen puede mostrar *"Windows protegió su PC"*: pulsa **"Más información"** → **"Ejecutar de todas formas"** (ver [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)).

El workflow `.github/workflows/release.yml` genera y publica el instalador en GitHub Releases: se dispara con tags que empiezan por `v` o manualmente (`workflow_dispatch`). **Advertencia:** mientras el repositorio sea público, ese release incluye el SDK de DigitalPersona; no subas tags ni lo ejecutes manualmente sin revisarlo antes.

---

## Dónde guarda datos la app

- En desarrollo: `huellero/data/` (carpeta ignorada por Git).
- En la app instalada: `%APPDATA%\huellero` (configuración y datos locales).

No borres esa carpeta si hay asistencias pendientes de sincronizar.

---

## Estados de la barra superior (Kiosko)

Textos y condiciones según `huellero/src/renderer/src/views/KioskoView.vue`:

| Estado | Texto | Condición |
| :--- | :--- | :--- |
| En línea | `En línea` | Conexión lista (`listo`). |
| Sin internet | `Sin internet. Las asistencias se guardan en este equipo y se enviarán al reconectar.` | Sin conexión a internet (`!navigator.onLine`). |
| Deshabilitado | `Este equipo fue deshabilitado por el administrador.` | Rechazo con código `DEVICE_DISABLED`. |
| Pendiente | `Equipo registrado. Esperando aprobación del administrador.` | Rechazo con código `PENDING_APPROVAL`. |
| Error servidor | `El servidor tuvo un problema al verificar este equipo (puede ser la base de datos). Reintentando…` | Rechazo con código `INTERNAL_ERROR`. |
| Rechazo genérico | Mensaje del rechazo. | Cualquier otro rechazo del servidor. |
| Reintentando | `Reintentando…` | Conectado pero aún no listo. |
| Sin conexión | `Sin conexión con el servidor. Reintentando… (puede tardar si estaba inactivo)` | Sin conexión al servidor. |

Indicadores adicionales de la barra:

| Indicador | Texto | Condición |
| :--- | :--- | :--- |
| Clase activa | `Ficha <código>` | Hay una clase activa. |
| Lector no detectado | `Lector de huellas no detectado. Revisa que esté conectado por USB.` | Lector en estado `no-detectado`. |
| Error de lector | `Error al iniciar el lector de huellas (driver o SDK). Reinstala Asista o revisa el driver.` | Lector en estado `error`. |
| Pendientes | `N asistencias pendientes por sincronizar` | Hay asistencias sin sincronizar. |
| Sin identidad | `Equipo no identificado. Reintentando…` | El dispositivo aún no está registrado. |

---

## Despliegue

El repositorio incluye tres configuraciones de despliegue:

- **Producción (Docker Compose):** `docker-compose.yml` levanta `backend` (puerto 3001, construye `backend/Dockerfile`) y `frontend` (Nginx, puerto 80, construye `frontend/Dockerfile`). El backend lee variables desde `./backend/.env`.
  ```bash
  docker compose up -d
  ```

- **Servicio único (Render):** el `Dockerfile` de la raíz es multi-stage: compila el frontend y sirve el `dist` desde el propio backend como SPA. Es el usado para el despliegue en Render.com.
  ```bash
  docker build -t asista .
  ```

- **Desarrollo (Docker Compose):** `docker-compose.dev.yml` monta volúmenes en vivo (backend en 3001 con `Dockerfile.dev`, frontend en 5173 con `Dockerfile.dev`).
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```

Para despliegue local sin Docker, usa los comandos de desarrollo de cada paquete (ver sección de requisitos).

---

## Estructura del repositorio

```text
HuelleroActualizado/
├── backend/               # API REST + WebSockets (Node.js + Express + Socket.IO)
│   ├── controllers/       # Lógica de los endpoints
│   ├── models/            # Modelos Mongoose
│   ├── routes/            # Enrutadores REST (/api/...)
│   ├── services/          # Socket.IO, cron, correo, cifrado, seguridad
│   ├── middlewares/       # Autenticación JWT, validación, rate limiting
│   └── Dockerfile(.dev)
├── frontend/              # Panel web (Vue 3 + Quasar + Vite)
│   ├── src/               # views, components, services, router, ...
│   ├── nginx.conf         # Reverse proxy /api y /socket.io
│   └── Dockerfile(.dev)
├── huellero/              # App de escritorio (Electron + Vue 3 + koffi)
│   ├── src/main/          # Captura, motor biométrico, WebSocket, offline
│   ├── src/renderer/      # UI del kiosco
│   ├── dll/               # DLLs nativas DigitalPersona
│   └── build/             # Instalador NSIS, driver, SDK, VC++, icono
├── docs/                  # Documentación técnica y del proyecto
├── scripts/               # copy-dist.js (build de producción)
├── Dockerfile             # Despliegue single-service (Render)
├── docker-compose.yml     # Producción (backend + frontend)
├── docker-compose.dev.yml # Desarrollo
└── package.json           # Scripts del monorepo (workspaces backend/frontend)
```

---

## Documentación adicional

- [GUIA_INSTALACION.md](./GUIA_INSTALACION.md) — instalación de hardware/drivers y de la app para usuarios y desarrolladores.
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — registro de incidencias y correcciones.
- [DESIGN.md](./DESIGN.md) — especificación de diseño e identidad visual.
- [CONSOLIDADO_CAMBIOS_Y_BUGS.md](./CONSOLIDADO_CAMBIOS_Y_BUGS.md) — consolidado técnico de arquitectura, cambios y bugs.
- [docs/PRD.md](./docs/PRD.md) — documento de requisitos del producto.
- [docs/SETUP.md](./docs/SETUP.md) — instalación de Asista en una PC nueva (modo desarrollo).
- [docs/EULA SDK.rtf](./docs/EULA%20SDK.rtf) — licencia del SDK de DigitalPersona.

---

## Licencia y uso

- El SDK de DigitalPersona se usa bajo su EULA (ver `docs/EULA SDK.rtf`).
- Uso **interno** del SENA.
- El repositorio debe mantenerse **privado**.
- No redistribuir el instalador ni el SDK fuera de la institución sin autorización.
