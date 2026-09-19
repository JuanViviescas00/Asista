# CONTEXTO_HUELLERO.md

> **Fuente principal de contexto** para continuar el desarrollo de la aplicación/servicio local del huellero.
>
> Léelo completo **antes** de modificar código relacionado con el huellero.
>
> Leyenda de estados usada en todo el documento:
> - `[DECIDIDO]` — decisión confirmada con el usuario.
> - `[IMPLEMENTADO]` — ya hecho y verificado en el código.
> - `[PARCIAL]` — implementado en parte (esqueleto/lectura listos, falta lógica o persistencia).
> - `[PENDIENTE]` — diseñado o necesario, pero todavía NO implementado.

---

# Contexto del proyecto

Sistema integral para la **toma y gestión de asistencias mediante lector de huellas digitales DigitalPersona U.are.U 4500** para el SENA.

Compuesto por tres piezas conceptuales:

1. **Backend central** — API de negocio (Node.js + Express + MongoDB Atlas).
2. **Dashboard web** — interfaz de usuarios (Vue 3 + Vite) para Estudiante, Profesor (Instructor), Profesor Líder (Instructor Líder) y Administrador.
3. **Aplicación local del huellero** — servicio que se ejecuta en el PC donde está conectado físicamente el lector DigitalPersona (en proceso de separación).

# Arquitectura actual

El proyecto ya existía y estaba avanzado antes de comenzar esta separación. **NO se debe rehacer desde cero.**

Estructura actual del repositorio:

```text
HuelleroActualizado/
├── backend/                  # API Node.js + Express + MongoDB Atlas
│   ├── dll/                  # 8 DLLs nativas DigitalPersona
│   ├── models/               # Admin, Asistencia, Clase, DiaFestivo, Dispositivo, Estudiante, Excusa, Ficha, Instructor
│   ├── routes/               # admin, asistencias, auth, clases, diasFestivos, dispositivos, enrolamiento, estudiantes, excusas, fichas, instructores
│   ├── services/             # fingerprint.js (motor biométrico koffi + dpfj.dll), socketService.js (hub Socket.io)
│   ├── index.js              # arranque, conexión MongoDB, nodemailer
│   └── package.json
├── frontend/                 # Vue 3 + Vite (dashboards web)
│   ├── public/scripts/       # Web SDK DigitalPersona (fingerprint.sdk.min.js, websdk.client.bundle.min.js, es6-shim.js)
│   └── src/components/       # PanelInstructor.vue (huellero embebido aquí), App.vue, etc.
├── huellero/                 # Aplicación local Electron (ver "Estado actual")
├── server/                   # Carpeta residual (solo contiene dll/dpfj.dll y dll/dpfr6.dll, sin código)
├── setup_servicios_huella.bat# Instala DpHost/DPAgent en el PC del lector
├── setup_huellas.bat         # npm install + verificación de koffi/pngjs
└── GUIA_INSTALACION.md
```

Funcionalidades que **ya existen** en el backend/frontend:

- Autenticación (login por correo/documento, recuperación de contraseña).
- Gestión de estudiantes, instructores, fichas, excusas, días festivos.
- Asistencias (registro, inhabilitación/reactivación de jornada, reportes, exportación Excel).
- Roles: Administrador, Instructor, Instructor Líder (campo `esLider`), Estudiante.
- Funcionalidad de huella mezclada con el resto (captura en navegador vía Web SDK + motor de minucias en el backend).

# Objetivo de la separación

Separar **progresivamente** la funcionalidad del lector de huellas para convertirla en una **aplicación/servicio local independiente**, que posteriormente será **empaquetada como `.exe`**.

La aplicación local estará instalada en los computadores que tengan **físicamente conectado** el lector DigitalPersona.

Reglas del proceso:

- Reutilizar código existente (no empezar el huellero desde cero).
- Cambios pequeños y progresivos, sin romper el sistema actual.
- El backend deja de depender de las DLLs de DigitalPersona al terminar la migración.

# Responsabilidades

## Dashboard web

- **Estudiante**: consulta su resumen de asistencias, inasistencias y excusas.
- **Profesor (Instructor)**: consulta sus fichas, inicia clase, activa toma de asistencia (biométrica o manual).
- **Profesor Líder (Instructor Líder)**: además de lo del profesor, crea estudiantes, desactiva estudiantes/profesores, consulta estudiantes, descarga reportes, y dispara el **enrolamiento** de huellas.
- **Administrador**: crea profesores/estudiantes, administra fichas, asigna líderes, gestiona roles, administra la asociación dispositivo ↔ ficha.

## Backend central

- Lógica de negocio.
- Autenticación / autorización.
- Usuarios, fichas, asistencias, reportes.
- **Comunicación con dispositivos** (registro, asociación, comandos en tiempo real).
- Persistencia en MongoDB.

## Aplicación local del huellero

- Comunicación con el lector DigitalPersona.
- Captura de huellas.
- Enrolamiento.
- Verificación / identificación de estudiantes.
- Almacenamiento local de asistencias pendientes.
- Comunicación con el backend.
- Funcionamiento offline.
- Sincronización de pendientes.

**NO** debe encargarse de: crear profesores/estudiantes, gestionar roles, crear fichas, reportes administrativos ni administración general del sistema.

# Relación dispositivo ↔ ficha

`[DECIDIDO]` — decisión definitiva.

- **1 dispositivo puede tener muchas fichas asociadas.**
- **1 ficha solo puede estar asociada a 1 dispositivo a la vez.**
- **No existe** asociación de una ficha con varios dispositivos simultáneamente.
- El backend puede resolver directamente: `fichaId → deviceId` (una sola consulta, sin ambigüedad).

Ejemplo:

```text
PC Aula 03
├── Ficha 3139319
├── Ficha 232133
└── Ficha 123123
```

**Identidad y autenticación del dispositivo:**

- `deviceId`: UUID único (identidad).
- `token`: secreto de autenticación (demuestra quién es).
- En el backend se guarda **solo el hash** del token, nunca en texto plano.
- El token se puede revocar/rotar sin tocar la identidad del equipo.

**La dirección MAC fue descartada** como identidad y como mecanismo de autenticación (es suplantable, no es un secreto y es ambigua por múltiples adaptadores de red). `[DECIDIDO]`

`[PENDIENTE]` — La asociación dispositivo ↔ fichas se administrará desde el dashboard del Administrador (sección "Dispositivos/Huelleros"). No está implementada.

`[DECIDIDO]` — Al asociar una ficha ya asociada a otro dispositivo (`PUT /dispositivos/:id/fichas`), el backend debe **reasignarla automáticamente** (moverla, quitándola del dispositivo anterior), no rechazar la operación.

# Clases activas

`[DECIDIDO]` — decisiones confirmadas:

- Un instructor solo puede tener **una ficha activa** a la vez.
- Un dispositivo solo puede tener **una ficha activa** a la vez.
- La **ficha** es lo que identifica el grupo/clase (no hay otra identificación de clase).
- El instructor tiene un botón **"Iniciar clase"**.
- El instructor tiene un botón **"Finalizar clase"** (desactivación manual; no hay cron ni duración automática).
- El estado de la clase activa **debe persistirse en el backend/BD**.
- WebSocket se usa para **entregar comandos en tiempo real**.

**Insight clave `[DECIDIDO]`:** el estado vive en la BD; el WebSocket solo *entrega* el mensaje. Si el dispositivo estaba offline al activar, la clase queda activa en BD y, cuando el dispositivo se reconecte, el backend le reenvía el comando pendiente (la reconexión no rompe nada).

`[IMPLEMENTADO]` — Modelo `Clase` (`deviceId`, `fichaId`, `instructorId`, `estado`, `iniciadaAt`, `finalizadaAt`) y endpoint `POST /api/clases/activar`, que crea/reactiva la clase y envía `ACTIVATE` por WebSocket al `deviceId` conectado.
`[IMPLEMENTADO]` — Reenvío del `ACTIVATE` pendiente al reconectar: al recibir un `HELLO` válido, si existe una clase `Activa` en BD para ese `deviceId`, el backend reenvía `ACTIVATE` al socket recién conectado.
`[IMPLEMENTADO]` (2026-09-08) — `POST /api/clases/finalizar` (`DEACTIVATE`): busca la clase `Activa`, la pasa a `Finalizada` y emite `DEACTIVATE` al `deviceId` (resuelto desde el documento, no del body).
`[IMPLEMENTADO]` (2026-09-08) — Invariante "una clase activa por dispositivo": `activar()` usa `findOneAndUpdate` atómico (upsert) + índice parcial único sobre `{deviceId, estado:'Activa'}`, con manejo del `E11000`.
`[IMPLEMENTADO]` (2026-09-08) — Autenticación de `activar`/`finalizar`: `autenticarJWT` en ambas rutas + validación de identidad (`req.usuario.id` === `instructorId` del body) → 403 si no coincide.
`[IMPLEMENTADO]` (2026-09-08) — `GET /api/clases/estado` (restaurar estado al recargar el dashboard): `Clase.findOne({ instructorId: req.usuario.id, estado: 'Activa' }).populate('fichaId')`, protegido con `autenticarJWT`.
`[IMPLEMENTADO]` (2026-09-08) — Eventos hacia el dashboard: `CLASS_ACTIVATED`/`CLASS_DEACTIVATED` (sala `ficha_<fichaId>`) al activar/finalizar, y `ATTENDANCE_REGISTERED` al guardar una asistencia real en `procesarAsistencia` (cubre sync online y offline).
`[PENDIENTE]` — Acks `ACTIVATED`/`DEACTIVATED`.

# Activación remota

`[DECIDIDO]` — flujo:

```text
Instructor
→ Dashboard web
→ Backend
→ resolución fichaId → deviceId
→ WebSocket
→ aplicación local del dispositivo
→ huellero habilitado
→ estudiante coloca huella
→ asistencia
```

El PC del huellero **no necesita IP pública**: la conexión la inicia la aplicación local hacia el backend.

**Mensajes definidos `[DECIDIDO]` (payloads), `[IMPLEMENTADO]` ACTIVATE y DEACTIVATE:**

```text
Backend → Huellero:
  ACTIVATE   { type: "ACTIVATE",   fichaId, instructorId }
  DEACTIVATE { type: "DEACTIVATE", fichaId, instructorId }
```

`[IMPLEMENTADO]` (2026-09-08) — `POST /api/clases/activar` ya **no** recibe `deviceId` en el body: recibe `{ fichaId, instructorId }` y resuelve internamente el `deviceId` desde `Ficha.dispositivoId` (asociación dispositivo↔ficha implementada en el backend).

# Enrolamiento

`[DECIDIDO]` — **Cambio de rumbo (25/08/2026), revisión de la decisión original:** el enrolamiento se hace **desde la aplicación local** (modo docente), no desde el dashboard web como se había decidido antes. Motivo: **agilidad del flujo** y **no depender del ciclo completo `ENROLL_START/ENROLL_COMPLETE` por WebSocket** mientras esa parte aún no está lista. Solo un instructor con `esLider === true` ve la opción **[Registrar huella]** y puede enrolar estudiantes de la ficha donde es líder (`Ficha.instructorLiderId = su _id`).

```text
Líder (esLider)
→ modo docente de la app local
→ ficha del líder + lista de sus estudiantes (acotada a esa ficha)
→ verifica que NO haya clase activa en el dispositivo (estado local vía store.js)
→ captura en el lector DigitalPersona (capture.js, Fase 5 — PENDIENTE)
→ template (motor local fingerprint.js)
→ POST /api/enrolamiento/guardar { estudianteId, fichaId, dedo, template }
→ Backend (chequeo de duplicados) → MongoDB
```

Los mensajes `ENROLL_START/ENROLL_*` por WebSocket definidos más abajo quedan **superados** por este flujo local + REST `guardar`.

> Revisión de modelo (25/08/2026): `Ficha.instructorLiderId` no tiene índice único ni validación en la BD, por lo que un instructor **podría** quedar como líder de varias fichas a la vez — inconsistente con la regla real: un instructor puede ser instructor **común** de varias fichas, pero **Líder de una sola** a la vez.
>
> `[DECIDIDO]` — Revisión de la decisión original: se valida a **nivel de aplicación** (no con un índice de Mongo) que un instructor no sea Líder de más de una ficha.
>
> `[IMPLEMENTADO]` — Validación a nivel de aplicación (sin índice de Mongo). Ubicaciones:
> - `instructorController.importarInstructores()` — valida antes de asignar `instructorLiderId` en la importación.
> - `fichaController.createFicha()` — valida antes de crear la ficha.
> - `fichaController.updateFicha()` — valida antes de actualizar, excluyendo la ficha actual (`_id: { $ne: req.params.id }`).
> En los tres casos rechaza con `409` ("Este instructor ya es líder de la ficha {codigoFicha}. Un instructor solo puede ser líder de una ficha a la vez.") si el instructor ya es líder de otra ficha.

**Mensajes definidos `[DECIDIDO]` (payloads), `[PENDIENTE]` de implementar:**

```text
Backend → Huellero:
  ENROLL_START  { type: "ENROLL_START", estudianteId, fichaId, nombres, apellidos, dedo }
  ENROLL_CANCEL { type: "ENROLL_CANCEL", estudianteId }

Huellero → Backend:
  ENROLL_READY     { type: "ENROLL_READY", estudianteId }
  ENROLL_PROGRESS  { type: "ENROLL_PROGRESS", estudianteId, capturas }   (opcional)
  ENROLL_COMPLETE  { type: "ENROLL_COMPLETE", estudianteId, fichaId, template, dedo }
  ENROLL_ERROR     { type: "ENROLL_ERROR", estudianteId, error }
```

**Reglas confirmadas `[DECIDIDO]`:**

1. Si el dispositivo tiene una clase activa, se **rechaza** el enrolamiento ("Finalice la clase actual en ese dispositivo antes de enrolar").
2. Si el dispositivo está **desconectado**, NO se encola el enrolamiento; error inmediato ("El dispositivo no está disponible").
3. El dashboard debe mostrar el **estado de conexión** del dispositivo (derivado de las conexiones WebSocket vivas).
4. El enrolamiento ocurre **físicamente en el PC que tiene el lector**.
5. El backend almacena finalmente el template en MongoDB.

`[IMPLEMENTADO]` (2026-09-07) — Bucle de captura de múltiples muestras para enrolamiento implementado en `engine.enrolarEstudiante()` (loop `capturarHuella()` + `addCapture()` hasta que el motor confirma `ready:true`).

# Huellas y templates

- Actualmente las huellas/templates se almacenan en **MongoDB** (campos `huellaEnrolada`, `huellaTemplate`, `fechaEnrolamiento`, `dedoEnrolado` en el modelo `Estudiante`).
- `[DECIDIDO]` — La intención futura es que el **procesamiento biométrico y el acceso al lector vivan en la aplicación local** (Opción A: enrolamiento en la app huellero).
- `[DECIDIDO]` — El backend central **no debe depender de `dpfj.dll`** una vez terminada la migración (el backend va a la nube, donde esas DLLs no existirán).
- `[PENDIENTE]` — Añadir el campo `metodo: 'HUELLA' | 'MANUAL'` al modelo `Asistencia` para auditoría.

> **[DECIDIDO/ACLARACIÓN] (2026-09-07) — Estado real del flujo Web SDK del navegador** (`PanelInstructor.vue`, `KioscoAsistencia.vue`, rutas `/estudiantes/enroll-*`, `/estudiantes/verify`):
>
> - El código de este flujo **SIGUE PRESENTE** en el repositorio (no fue eliminado) y sigue siendo técnicamente alcanzable.
> - Sin embargo, confirmado con el equipo: **NO se usa en producción real hoy**. No hay instructores usándolo activamente con estudiantes reales.
> - Por lo tanto, es **código presente pero inactivo en la práctica** — no código muerto en sentido estricto (podría reactivarse), pero tampoco la vía de producción actual.
>
> **Nota técnica relacionada:** este flujo usa el mismo hardware físico (U.are.U 4500, 700 DPI nativo confirmado vía `dpfpdd_get_device_capabilities`) que el huellero, y llama a la misma función `pngToFmd()` con el default `dpi=500` sin pasar el valor real. Si en algún momento se decide reactivar este flujo del navegador, debe evaluarse si el Web SDK (`Fingerprint.WebApi`) entrega las imágenes ya normalizadas a 500 DPI internamente (en cuyo caso el default actual sería correcto) o si arrastra el mismo mismatch de DPI que se corrigió para el huellero (en cuyo caso habría que pasar el DPI real ahí también). Esto **NO se investigó todavía** — queda como `[PENDIENTE]` si el flujo llega a reactivarse en el futuro.

`[RESUELTO 2026-09-11]` — Limpieza adicional de PanelInstructor.vue: se removieron el botón "Iniciar/Detener Biometría" (junto a Tomar Asistencia) y la pestaña completa "Enrolar Huellas" (con su tabla, modal, y la llamada initFingerprintSDK() en onMounted) — ambos dependían del Web SDK del navegador (Fingerprint.WebApi), ya confirmado inactivo en producción. El enrolamiento real ocurre en EnrolarHuellaModal.vue (huellero Electron). Endpoints backend identificados como huérfanos tras esto (no tocados, solo reportados): /estudiantes/enroll-start, enroll-capture, enroll-complete, enroll-cancel, verify, fingerprint-status — distintos de POST /api/enrolamiento/guardar (el real, usado por el huellero). Las funciones JS del flujo viejo (initFingerprintSDK, iniciarCapturaSDK, etc.) se dejaron como código de referencia, sin borrar. La tabla manual de "Tomar Asistencia" (respaldo si el huellero falla) queda intacta.

# Estado actual

## Fase 1 — Aislamiento del motor biométrico `[IMPLEMENTADO]`

- `backend/services/fingerprint.js` fue copiado a `huellero/src/fingerprint.js`.
- La copia es **byte-idéntica** (hash SHA256 coincide).
- El original **NO fue modificado**.

> **Re-sincronización (2026-08-26):** el backend original recibió una corrección crítica de seguridad: el umbral de aceptación de huellas (`MATCH_THRESHOLD`) se subió de `~50%` (`0x3FFFFFFF`) a un valor cercano al `100%` (`21474`, FAR 1/100.000, configurable vía `BIOMETRIC_MATCH_THRESHOLD`). `huellero/src/fingerprint.js` fue re-sincronizado desde `backend/services/fingerprint.js` y **ambos archivos vuelven a ser byte-idénticos**. Nota: durante el merge se perdió la declaración `let MAX_FMD_SIZE = 26 + 4 + (255 * 6) + 2`; fue restaurada para evitar un `ReferenceError` y que ambos archivos coincidan.

> **Corrección de mismatch de DPI (2026-09-07):** se corrigió la inconsistencia de resolución entre captura y extracción de características. `pngToFmd()` hardcodeaba `500` DPI; ahora la resolución es **parametrizable** — `pngToFmd(pngBase64, dpi = 500)`, `addCapture(sessionId, imageBase64, dpi = 500)` y `verifyFingerprint(imageBase64, enrolledStudents, dpi = 500)` — manteniendo `500` como default para no romper los callers existentes del backend (flujo Web SDK, que no pasan valor explícito). El lector **U.are.U 4500 real solo soporta `700` DPI nativo** (confirmado vía `dpfpdd_get_device_capabilities` → `resolution_cnt = 1`, `resolutions = [700]`; `500` NO está disponible). Por eso `huellero/src/main/capture.js` captura a `700` y ahora `capturarHuella()` devuelve `{ imagen, dpi }`, propagando el `700` a través de `engine.capturarYVerificar()` → `verify.js` → `verifyFingerprint()`. La corrección se hizo **antes** de tener enrolamientos reales en producción (fase de pruebas), por lo que **no requiere migración de datos**. Tras el cambio, `backend/services/fingerprint.js` y `huellero/src/fingerprint.js` vuelven a ser **byte-idénticos**.

**Configuración biométrica — estado del umbral**

`[IMPLEMENTADO]` Estado actual del umbral de coincidencia:

- `MATCH_THRESHOLD` en `fingerprint.js` usa: `Number(process.env.BIOMETRIC_MATCH_THRESHOLD) || 21474`.
- Hoy `BIOMETRIC_MATCH_THRESHOLD` **NO está definida** ni en `backend/.env` ni en ningún config del huellero. Ambos procesos (backend y huellero) caen al mismo fallback (`21474`), por lo que **no hay divergencia actual**.
- Mecanismo de configuración asimétrico a tener en cuenta:
  - **Backend:** se ajustaría agregando la variable en `backend/.env` (vía dotenv).
  - **Huellero:** no tiene `.env` ni dotenv en el proceso main de Electron; para cambiarlo hoy habría que setear la variable a nivel del sistema operativo de cada PC individual — no hay mecanismo de configuración centralizado para esto en el huellero.
- Riesgo si se cambia en el futuro: si alguien ajusta `BIOMETRIC_MATCH_THRESHOLD` en el backend (vía `.env`) pero no lo replica correctamente en cada PC con huellero, ambos lados quedarían verificando huellas con umbrales distintos sin ningún error visible (falla silenciosa).

`[PENDIENTE]` Mejora futura sugerida:

- Leer `BIOMETRIC_MATCH_THRESHOLD` desde `config.json` en el huellero (mismo mecanismo ya usado para `deviceId`/`token`/`backendUrl`/`wsUrl` en la Fase 3), en vez de depender de una variable de entorno del sistema operativo. Esto permitiría configurar el umbral de forma consistente y versionada junto con el resto de la configuración del dispositivo, sin tocar el registro del SO en cada PC.

- `backend/dll/` fue copiado completo a `huellero/dll/` (las **8 DLLs**).
- `huellero/package.json` usa:
  - `koffi` `^2.9.0`
  - `pngjs` `^7.0.0`
  - `"type": "module"`
- Se creó `huellero/src/verify.js` como adaptador.
- El adaptador transforma los registros locales al formato que espera el motor original: `{ _id, nombres, apellidos, huellaTemplate }`.

**Sobre `fingerprint.js`:**

- **No depende** de modelos, rutas ni servicios del backend (es autocontenido).
- Sus dependencias son: `koffi` (FFI), `pngjs` (decodificar PNG), Node built-ins (`path`, `url`) y las DLLs.
- El bootstrap de carga de DLL (resolución de `../dll`, PATH, `searchPaths`, bindings) se copió tal cual y **se deja divergir** (no se extrajo a un módulo compartido, decisión tomada porque el backend dejará de usar `dpfj.dll`).
- `verifyFingerprint` es la única función acoplada a la forma de los documentos Mongoose; por eso se creó el adaptador en el huellero **sin tocar el motor**.

## Fase 2 — Esqueleto de la aplicación Electron `[IMPLEMENTADO]`

`huellero/` pasó de ser solo dos archivos JS a una aplicación **Electron + electron-vite + Vue 3**:

- **Proceso principal** (`src/main/`):
  - `index.js` — arranque de Electron, `BrowserWindow`, registro de manejadores IPC (`huellero:getStatus`, `huellero:capture`, `huellero:login`, `huellero:logout`, `huellero:getFichaLider`, `huellero:getEstudiantesFicha`, `huellero:enrolar`).
  - `engine.js` — orquestador: `init()`, `getStatus()`, `capturarYVerificar()`, `loginDocente()`, `logoutDocente()`, `getFichaLider()`, `getEstudiantesFicha()`, `enrolarEstudiante()`, `guardarTemplate()`.
  - `config.js` — lee `config.json` (`deviceId`, `token`, `backendUrl`, `wsUrl`).
  - `capture.js` — captura DigitalPersona real (Fase 5). `store.js` — persistencia local `data/*.json`. `sync.js` — sincronización idempotente (Fase 10). `scheduler.js` — disparo 00:00 + polling. `ws-client.js` — socket.io singleton (HELLO, ACTIVATE/DEACTIVATE, reconexión).
- **Preload** (`src/preload/index.js`): expone `window.huellero` vía `contextBridge` (`getStatus`, `capturarYVerificar`, `loginDocente`, `logoutDocente`, `getFichaLider`, `getEstudiantesFicha`, `enrolarEstudiante`, `onStatus`).
- **Renderer** (`src/renderer/src/`):
  - `App.vue` — cambia entre vistas `kiosko`, `login` y `docente`.
  - `KioskoView.vue` — pantalla principal del lector (estado online/clase activa, botón "Leer huella").
  - `DocenteLogin.vue` — formulario de acceso docente.
  - `DocenteView.vue` — panel del docente; botón "Registrar huella" visible solo si `esLider`.
  - `EnrolarHuellaModal.vue` — modal de enrolamiento (ficha del líder + buscador de estudiantes + dedo + captura).
- `electron.vite.config.js` — copia las DLLs de `huellero/dll/` a `out/dll/` al compilar; fija el renderer en el puerto **5180** (`strictPort: true`) para no competir con el dashboard web (`frontend/`, puerto 5173) cuando ambos dev servers corren en paralelo.

## Fase 5 — Captura DigitalPersona `[IMPLEMENTADO]`

Captura real funcionando contra el lector físico **U.are.U 4500** mediante `huellero/dll/dpfpdd.dll` (FFI con koffi), verificado con hardware real:

- **Bindings declarados** con las firmas exactas del `dpfpdd.h` oficial (`__stdcall`): `dpfpdd_init`, `dpfpdd_query_devices`, `dpfpdd_open`, `dpfpdd_get_device_capabilities`, `dpfpdd_capture` (síncrona), `dpfpdd_close`.
- **Flujo por captura**: `query_devices` → `open` → `get_device_capabilities` (resolución) → `capture` → `close` (en `finally`). `dpfpdd_init()` se ejecuta **una sola vez** (idempotente, `inicializarCaptura()`).
- **Formato de salida**: `dpfpdd_capture` devuelve pixel buffer en escala de grises (8 bpp); `capturarHuella()` lo convierte a **PNG base64** (con `pngjs`) y devuelve `{ imagen, dpi }`.
- **Corrección de mismatch de DPI**: el 4500 solo soporta **700 DPI nativo** (confirmado vía `dpfpdd_get_device_capabilities` → `resolutions = [700]`); se parametrizó `pngToFmd()`/`addCapture()`/`verifyFingerprint()` con `dpi = 500` por defecto, y `capture.js` pasa `700`. Aplicado **antes** de tener enrolamientos reales → sin migración de datos.
- **Timeout de 10s** (`dpfpdd_capture` síncrono): al expirar sin dedo lanza `DPFPDD_QUALITY_TIMED_OUT` traducido ("Tiempo de espera agotado…"), sin colgarse.
- **Bloqueo síncrono vs WebSocket**: verificado que el bloqueo de 10s **no rompe** el socket (el `pingTimeout` del backend es 20s > 10s); no se prioriza `dpfpdd_capture_async` por ahora (queda como mejora futura opcional).
- **Herramientas**: `socket.io-client` instalado (faltaba), build de electron-vite limpio; headers oficiales del SDK (`dpfpdd.h`, `dpfj.h`) versionados en `docs/sdk-reference/`.

## Acceso docente (login) `[IMPLEMENTADO]`

- `engine.loginDocente(correo, password)` hace `fetch POST /api/auth/login` al backend.
- Valida que la respuesta sea `usuario.rol === 'Instructor'` (rechaza otros roles con error).
- Guarda en memoria: `{ id, correo, nombre, rol, esLider, rolDetallado }`.
- Sin conexión devuelve error ("Sin conexión: no se puede validar el acceso docente").
- En el kiosko se abre con `Ctrl+Shift+L` o con el botón ⚙.

## Enrolamiento (modal docente) `[IMPLEMENTADO]`

- Solo visible si `esLider === true` (`DocenteView.vue`).
- `engine.getFichaLider()` → `GET /api/fichas/mis-fichas/:instructorId` (filtra `esLider`), y `engine.getEstudiantesFicha(fichaId)` → `GET /api/estudiantes?fichaId=`.
- `engine.enrolarEstudiante()` rechaza si hay clase activa en el dispositivo (estado local de `store.js`), luego ejecuta el loop de enrolamiento: `startSession()` → `capturarHuella()` + `addCapture()` repetido hasta que el motor confirma `ready:true` → `completeEnrollment()` (template) → `POST /api/enrolamiento/guardar` (chequeo de duplicados en backend).

> **[IMPLEMENTADO] (2026-09-07) — Loop de enrolamiento verificado de punta a punta con hardware real:** login docente (con fix de autenticación JWT en `getFichaLider`) → obtención de ficha del líder → selección de estudiante → múltiples capturas reales (`dpfpdd_capture`) hasta que el motor confirma `ready:true` → generación del template (`completeEnrollment`) → guardado exitoso vía `POST /api/enrolamiento/guardar`. Confirmado en MongoDB: `huellaEnrolada:true`, `huellaTemplate` poblado, `dedoEnrolado` y `fechaEnrolamiento` correctos.

> **Bug de autenticación corregido (2026-09-07):** `getFichaLider()` no enviaba el header `Authorization` (el token del login se descartaba en `loginDocente()`), por lo que `GET /api/fichas/mis-fichas/:id` (protegido con `autenticarJWT`) respondía 401 y el modal mostraba "No se pudo obtener la ficha del líder". Corregido: `loginDocente()` ahora guarda el `token`, `getFichaLider()` lo envía como `Bearer`, y un 401 dispara auto-logout + aviso temporal en el kiosko (`KioskoView.vue`), sin afectar el logout manual.

## Identidad del dispositivo (Fase 3) `[IMPLEMENTADO]`

- `backend/models/Dispositivo.js` — `deviceId` (unique), `tokenHash`, `nombre`, `activo`, `createdAt`. El token **nunca** se guarda en claro; solo su hash.
- `POST /api/dispositivos/registrar` (`backend/controllers/dispositivoController.js`) — genera `deviceId` (`crypto.randomUUID()`) + `token` (`crypto.randomBytes(32)`) y guarda el hash (`bcryptjs.hash`). Devuelve `{ deviceId, token }` **una sola vez** en texto plano.
- Regla de dependencias: se usa **`bcryptjs` (JS puro)**, nunca `bcrypt` (binding nativo). `[DECIDIDO]`
- `huellero/src/main/config.js`:
  - `saveConfig()` ahora **persiste** en `config.json` (`writeFileSync`).
  - `registrarDispositivoSiNoExiste()` hace `POST /registrar` si no hay identidad y guarda el resultado.
  - `iniciarRegistroDispositivo(cb)` + `intentarRegistro()`: **reintento cada 60 s** si falla; se detiene solo al tener éxito y notifica (`cb`) al proceso principal.

`[IMPLEMENTADO 2026-09-10]` — Identidad de dispositivo atada al hardware: se descubrió que copiar la carpeta `huellero/` completa (con `config.json`) a otro PC hacía que ese PC heredara la identidad del dispositivo original, ya que nada ataba `deviceId`/`token` al hardware físico. Fix: nuevo campo `Dispositivo.hardwareFingerprintHash` (SHA-256 del MachineGuid de Windows, leído vía `reg query` con Node puro, sin binding nativo). El huellero envía el fingerprint en el registro inicial y en cada `HELLO` (calculado en runtime, nunca persistido en `config.json`). El backend adopta el fingerprint si es `null` (bootstrap para dispositivos ya registrados), acepta si coincide, y rechaza + desconecta si no coincide (log "posible copia de identidad"). Botón "Resetear identidad de hardware" en `PanelDispositivos.vue` para reinstalaciones legítimas de Windows. Verificado con 2 pruebas reales: adopción del dispositivo existente, y rechazo real simulando un fingerprint distinto. Pendiente futuro anotado (no implementado): rotación de token junto con el reset, para cerrar la ventana de carrera donde alguien con el `config.json` viejo podría re-vincularse antes que el dispositivo legítimo tras un reset.

`[IMPLEMENTADO 2026-09-10]` — Flujo de aprobación de dispositivos: los dispositivos nuevos ya no se activan automáticamente al registrarse (antes: `activo:true` por defecto, sin supervisión). Ahora se registran con `activo:false` y `aprobadoEn:null`, capturando también `hostname` (`os.hostname()`) junto al `hardwareFingerprint` ya existente. El `HELLO` ya rechazaba conexiones con `activo:false` (mecanismo reutilizado, sin cambios); se le agregó un sistema completo de razones de rechazo explícitas (evento `HELLO_RECHAZADO` con `code`+`message`: `MISSING_FIELDS`, `DEVICE_NOT_FOUND`, `PENDING_APPROVAL`, `DEVICE_DISABLED`, `INVALID_TOKEN`, `HARDWARE_MISMATCH`, `INTERNAL_ERROR`) que el kiosko muestra en texto claro en vez del genérico "Sin conexión". Nuevos endpoints `PUT /api/dispositivos/:id/aprobar` y `DELETE /api/dispositivos/:id` (Admin only). `PanelDispositivos.vue` muestra 3 secciones separadas: "⏳ Pendientes de aprobación" (con botones Aprobar/Rechazar), lista normal de dispositivos activos (sin cambios), y "Deshabilitados" (`activo:false` pero fue aprobado antes — hoy vacía, sin botón de deshabilitar implementado todavía).

Bug encontrado y corregido en el camino: al re-registrarse como dispositivo NUEVO (`deviceId` distinto), el estado local `claseActiva` en `data/estado.json` no se limpiaba, arrastrando información de una clase que pertenecía a la identidad anterior. Fix: `store.setClaseActiva(null)` se dispara específicamente en el callback de registro genuinamente nuevo (`yaRegistrado:false`), sin tocar `pendientes.json` ni `plantillas.json` (no dependen de `deviceId`). Verificado con hardware real: registro nuevo → sin clase fantasma → píldora de aprobación correcta → aprobación → conexión normal → rechazo → borrado de BD → restauración del dispositivo original sin problemas.

`[RESUELTO 2026-09-10]` — Bug crítico de reconexión: cuando el backend rechaza el HELLO (socket.disconnect(true), usado en TODOS los motivos de rechazo: PENDING_APPROVAL, INVALID_TOKEN, HARDWARE_MISMATCH, etc.), el cliente recibe la razón "io server disconnect" de socket.io, que por diseño de la librería NO dispara reconexión automática (confirmado en la documentación oficial de socket.io-client y el código fuente instalado). Esto dejaba al huellero "muerto" hasta reiniciar la app manualmente, incluso después de que un dispositivo pendiente fuera aprobado por el Admin. Fix: ws-client.js distingue explícitamente esta razón y programa reconexión manual (socket.connect()) con backoff exponencial (2s→60s) para casos recuperables (PENDING_APPROVAL, etc.), y un intervalo fijo de 10 minutos para HARDWARE_MISMATCH (posible clonación de identidad, no se resuelve solo, evita spam al backend). Verificado con hardware real: dispositivo pendiente → aprobado desde Admin → reconecta solo en ~2s sin reiniciar la app.

`[RESUELTO 2026-09-10]` — huellero/config.json (contiene deviceId+token en texto plano) estaba trackeado en git, mismo patrón de exposición que backend/.env. Sacado del tracking (git rm --cached) y agregado a .gitignore. Riesgo residual mitigado por el fingerprint de hardware (implementado hoy): aunque el token quedó expuesto en el historial de git, no permite clonar la identidad del dispositivo a otra máquina (HARDWARE_MISMATCH lo rechazaría). Token NO rotado por decisión consciente, dado el riesgo residual bajo.

`[PREVENTIVO 2026-09-10]` — Cambio no confirmado con certeza (no reproducible a demanda): se observó un "Failed to fetch" aislado en el primer intento de login (frontend web), sin repetirse en intentos posteriores ni con reinicios del backend. Hipótesis: resolución de "localhost" a IPv6 (::1) antes que IPv4 en Windows/Node. Mitigación preventiva aplicada: DEFAULTS de huellero/config.js y el config.json actual usan "127.0.0.1" en vez de "localhost" para backendUrl/wsUrl. No se tocó el backend (escucha en todas las interfaces por diseño, necesario para el dashboard). Sin confirmación de que esto resuelva el síntoma original, dado que no es reproducible.

`[IMPLEMENTADO 2026-09-10]` — Mensaje de error amigable en el login del frontend: distingue fallos de red genéricos ("Failed to fetch") de errores reales de credenciales del backend, mostrando "No se pudo conectar con el servidor..." en el primer caso en vez del error técnico crudo.

## Arranque no bloqueante `[IMPLEMENTADO]`

- `main/index.js`: `createWindow()` y `broadcastStatus()` se ejecutan **antes** de `await engine.init()`; el registro del dispositivo corre en background y no retrasa la aparición de la ventana.
- `engine.init()` ya no espera el registro: `iniciarRegistroDispositivo` es fire-and-forget, y al éxito re-ejecuta `ws.connect(getConfig())` y emite estado.
- `engine.getStatus()` incluye `dispositivoRegistrado`; `KioskoView.vue` muestra "Equipo no identificado. Reintentando conexión…" cuando es `false` (estado neutro, distinto de "Sin conexión").

## Autenticación del WebSocket HELLO (Fase 6, parcial) `[IMPLEMENTADO]`

- `backend/services/socketService.js`: el `HELLO` ahora exige `{ deviceId, token }`; busca el `Dispositivo`, valida `activo`, y compara con `bcryptjs.compare(token, tokenHash)`. Rechaza (desconecta + `console.log` para auditoría) si faltan campos, no existe, está inactivo o el token no coincide.
- `huellero/src/main/ws-client.js`: emite `HELLO { deviceId, token }` y solo conecta si hay ambos.

## Pendiente `[PENDIENTE]`

- `ws-client.js` (Fase 6): HELLO autenticado, reconexión backoff 2s→60s, escucha `ACTIVATE` y `DEACTIVATE`; el backend ya envía ambos. Faltan solo los **acks** (`ACTIVATED`/`DEACTIVATED`). `[PARCIAL]`
- `npm audit` (huellero/): **13 vulnerabilidades** — 1 crítica, 10 altas, 2 moderadas — en dependencias de build/empaquetado (`tar` crítica vía electron-builder; `vite`/`esbuild`/`electron`/`extract-zip` altas). `[PENDIENTE]` — sin prisa pero sin olvidarlo; la corrección requiere `npm audit fix --force` con cambios breaking (electron@44, electron-builder@26).

Consecuencia: captura, enrolamiento, identificación y sincronización ya funcionan de punta a punta (verificado con hardware real).

# Estructura actual de huellero

```text
huellero/
├── package.json             # electron, electron-vite, vue, koffi, pngjs; "type": "module"
├── electron.vite.config.js  # copia las DLLs a out/dll al compilar
├── dll/                     # 8 DLLs nativas DigitalPersona
└── src/
    ├── fingerprint.js       # motor copiado (byte-idéntico al backend)
    ├── verify.js            # adaptador: registros locales → formato del motor
    ├── main/                # proceso principal Electron
    │   ├── index.js         # arranque, ventana, IPC
    │   ├── engine.js        # orquestador (estado, login, captura + verificación)
    │   ├── config.js        # config.json (deviceId, token, backendUrl, wsUrl) — persistencia + reintento
    │   ├── capture.js       # captura DigitalPersona real (Fase 5, implementada)
    │   ├── store.js         # persistencia data/*.json (Fase 4)
    │   ├── sync.js          # sincronización idempotente de pendientes (Fase 10)
    │   ├── scheduler.js     # disparo 00:00 + polling 5min + reconexión/nuevo pendiente
    │   └── ws-client.js     # socket.io singleton (HELLO, ACTIVATE/DEACTIVATE, reconexión 2s→60s)
    ├── preload/
    │   └── index.js         # contextBridge → window.huellero
    └── renderer/
        ├── index.html
        └── src/
            ├── main.js
            ├── App.vue
            ├── style.css
            └── views/
                ├── KioskoView.vue
                ├── DocenteLogin.vue
                ├── DocenteView.vue
                └── EnrolarHuellaModal.vue
```

# Almacenamiento local

`[IMPLEMENTADO]` (mínimo) — `huellero/src/main/store.js` persiste en disco (`data/` al lado de `config.json`):

- `init()` crea los 3 archivos si no existen y los carga a memoria.
- `setClaseActiva()`, `guardarPendiente()` y `marcarSincronizadas()` escriben en memoria **y** en disco.
- La clase activa **sobrevive el reinicio** (se lee de `estado.json` al arrancar).

Arquitectura de archivos:

```text
data/
├── plantillas.json    # plantillas de las fichas atendidas (solo lo necesario)
├── pendientes.json    # asistencias que aún no pudieron sincronizarse
└── estado.json        # estado local necesario (ficha activa, etc.)
```

- `plantillas.json`: contiene únicamente lo necesario para las fichas que atiende el dispositivo (nunca toda la BD central).
- `pendientes.json`: cola de asistencias no sincronizadas.
- `estado.json`: estado local necesario para operar.

# Funcionamiento offline

`[DECIDIDO]`:

- La aplicación local puede registrar asistencias **sin conexión** al servidor.
- Las asistencias pendientes se guardan **localmente**.
- Cada asistencia debe tener un **UUID único** para permitir sincronización **idempotente**.
- El backend debe **evitar duplicados**.
- Al recuperar la conexión puede realizarse la sincronización.

**Importante `[DECIDIDO]`:**

- La pérdida de conexión **NO** significa que una nueva clase pueda activarse automáticamente.
- La activación de una clase **siempre** depende de una orden válida del backend.
- El almacenamiento/caché offline sirve para **continuar operaciones que ya fueron autorizadas/activadas** y para almacenar asistencias pendientes.
- Si el profesor no puede usar el huellero, puede **registrar asistencia manualmente** desde su dashboard (`metodo: "MANUAL"` vs `"HUELLA"`).

# Sincronización

`[DECIDIDO]` — Regla definitiva:

- A las **12:00 AM** debe ejecutarse **obligatoriamente** un intento de sincronización hacia el servidor.
- Si el servidor está caído o no hay conexión:
  - Las asistencias **permanecen pendientes**.
  - El servicio **continúa comprobando periódicamente** la conexión.
  - Cuando se recupere la conexión, **sincroniza las pendientes**.
  - Debe **evitar duplicados** mediante UUID/idempotencia.
- El cron de las 12:00 AM **no es el único** mecanismo de sincronización.

`[DECIDIDO]` — Backoff de reintentos de sync: polling fijo de 5 min para el backlog offline (no tiempo real). La reconexión del WebSocket usa backoff exponencial 2s→60s (independiente del sync). `[IMPLEMENTADO]`

# Comunicación

`[DECIDIDO]` — Arquitectura prevista:

- **REST**: acciones de negocio y consultas.
- **WebSocket**: comunicación en tiempo real Backend ↔ Huellero, y Backend ↔ Dashboard.

## REST (`[IMPLEMENTADO]` parcial)

```text
POST /api/clases/activar            [IMPLEMENTADO] { fichaId, instructorId } (JWT + identidad; resuelve deviceId desde Ficha.dispositivoId)
POST /api/clases/finalizar          [IMPLEMENTADO] { fichaId, instructorId } (JWT + identidad)
GET  /api/clases/estado             [IMPLEMENTADO]  (restaurar estado al recargar el dashboard; JWT)
POST /api/dispositivos/registrar    [IMPLEMENTADO] { nombre? } → { deviceId, token } (hash bcryptjs; token solo en esta respuesta)
GET  /api/dispositivos              [IMPLEMENTADO] (listado admin, con fichas asociadas)
PUT  /api/dispositivos/:id/fichas   [IMPLEMENTADO] (admin: reemplaza el conjunto de fichas del dispositivo)
GET  /api/fichas/:id/plantillas     [IMPLEMENTADO] (plantillas de la ficha, para caché local; auth deviceId+token)
POST /api/asistencias/sync          [IMPLEMENTADO] { deviceId, token, asistencias:[{uuid,...}] } (idempotente por uuid)
POST /api/enrolamiento/guardar      [IMPLEMENTADO] { estudianteId, fichaId, dedo, template }
```

## WebSocket (`[IMPLEMENTADO]` parcial)

```text
Backend → Huellero:
  ACTIVATE [IMPLEMENTADO] / DEACTIVATE [IMPLEMENTADO]
  ENROLL_START / ENROLL_CANCEL       (superados: el enrolamiento es local + REST guardar)
  SYNC_ACK [PENDIENTE]

Huellero → Backend:
  HELLO (deviceId + token)            [IMPLEMENTADO] (autenticado: bcryptjs.compare contra tokenHash)
  ACTIVATED / DEACTIVATED             [PENDIENTE] (acks)
  ATTENDANCE_REGISTERED               (superado: el backend emite este evento al dashboard desde el sync REST; ver Backend → Dashboard)
  ENROLL_READY / ENROLL_PROGRESS / ENROLL_COMPLETE / ENROLL_ERROR   (superados)
  SYNC_PUSH                           [PENDIENTE] { pendientes: [...] }
  PING / PONG (heartbeat)             [IMPLEMENTADO] — nativo de socket.io (pingInterval 25s / pingTimeout 20s), sin PING/PONG manual

Backend → Dashboard:
  CLASS_ACTIVATED / CLASS_DEACTIVATED [IMPLEMENTADO] { fichaId, instructorId, iniciadaAt }
  ATTENDANCE_REGISTERED               [IMPLEMENTADO] { fichaId, estudianteId, nombres, apellidos, hora, estado }
  DEVICE_CONNECTED / DEVICE_DISCONNECTED [IMPLEMENTADO] { deviceId, fichas }
  ENROLL_STARTED / ENROLL_PROGRESS / ENROLL_COMPLETED / ENROLL_FAILED
  SYNC_COMPLETED                      [PENDIENTE] { procesados }
```

`[IMPLEMENTADO 2026-09-10]` — `DEVICE_CONNECTED`/`DEVICE_DISCONNECTED` implementados con snapshot inicial (`DEVICES_STATUS` para admins, `DEVICE_STATUS` para la ficha) y guard anti-fantasma en `disconnect` (evita eventos espurios en reconexiones rápidas). Nueva sala `admins` (`unirse_admin`, valida JWT + rol Administrador). `PanelDispositivos.vue` muestra badge "En línea"/"Desconectado" por dispositivo; `PanelInstructor.vue` muestra indicador "🟢/🔴 Lector del aula" junto al botón de iniciar clase. Verificado en vivo: apagar/prender el huellero actualiza ambos paneles en tiempo real sin recargar.

`[PENDIENTE]` — Mecanismo de autenticación del WebSocket del dashboard (actualmente el frontend no usa JWT; guarda `user_data` en `sessionStorage`).

# Empaquetado

- `[DECIDIDO]` — La aplicación local eventualmente será empaquetada como **`.exe`**.
- `[DECIDIDO]` — El empaquetado **NO se está haciendo todavía**. Primero debe funcionar correctamente como aplicación Node independiente.
- `[PENDIENTE]` — Resolver el empaquetado y las **rutas de las DLLs** (el bootstrap usa `path.resolve(__dirname, '../dll')`, que puede cambiar al empaquetar).
- `[IMPLEMENTADO]` — `electron.vite.config.js` copia las DLLs de `huellero/dll/` a `out/dll/` al compilar, y `package.json` (`build.extraResources`) las incluye como recurso para el `.exe`.

# Fases de desarrollo

| # | Fase | Estado |
|---|---|---|
| 1 | Aislar `fingerprint.js` | ✅ Implementada |
| 2 | Esqueleto Electron + UI (kiosko, login docente) | ✅ Implementada — verificación koffi/dpfj.dll confirmada con captura real |
| 3 | Configuración e identidad del dispositivo (deviceId + token) | ✅ Implementada — registro, persistencia en `config.json`, reintento |
| 4 | Almacenamiento local (`data/*.json`) | ✅ Implementada — `store.js` persiste en disco |
| 5 | Captura DigitalPersona | ✅ Implementada — captura real vía `dpfpdd.dll` (síncrona, timeout 10s), DPI parametrizado (700) |
| 6 | WebSocket (cliente huellero + hub backend) | `[PARCIAL]` — HELLO autenticado + ACTIVATE/DEACTIVATE + reconexión con backoff + reenvío de ACTIVATE pendiente; faltan los acks (ACTIVATED/DEACTIVATED) |
| 7 | Activación/desactivación remota | ✅ Implementada (2026-09-08) — `activar`/`finalizar` (DEACTIVATE) |
| 8 | Enrolamiento remoto | ✅ Implementada — enrolamiento **local** desde la app (supera el flujo remoto por WebSocket) |
| 9 | Registro de asistencias | ✅ Implementada (2026-09-08) — identificación + registro + sync, verificado con hardware real |
| 10 | Sincronización offline/online | ✅ Implementada — `sync.js` + `POST /api/asistencias/sync` + `scheduler.js` (00:00 + polling 5 min) |
| 11 | Pruebas de recuperación y duplicados | ✅ Implementada — ver `[VERIFICADO 2026-09-10]` abajo |
| 12 | Empaquetado `.exe` | ✅ Implementada (2026-09-10) — primer `.exe` NSIS con DLLs + driver embebidos |

`[VERIFICADO 2026-09-10]` — Las 5 pruebas formales de recuperación y duplicados se ejecutaron con hardware real y evidencia de logs verificada:

1. Pérdida de conexión durante marcación: identificación funciona con plantillas cacheadas sin backend; asistencia se guarda local (`pendientes.json`) sin error visible al usuario.
2. Recuperación automática al reconectar: sincroniza de inmediato al reconectar el WebSocket, sin intervención manual.
3a. Reenvío del mismo `uuid` (retry de red simulado): detectado como duplicado por el índice único de `uuid`, sin crear un segundo documento.
3b. Mismo estudiante/ficha/día con `uuid` distinto (fuera de la ventana de dedup local de 2 min): detectado como duplicado por el índice compuesto `{estudianteId, fichaId, fecha}`, confirmando "primer registro manda".
4. Reinicio completo de la app con pendientes sin sincronizar (backend caído): `pendientes.json` sobrevive el reinicio íntegro; sincroniza correctamente al reconectar.
5. Backend caído 10-12 minutos: polling periódico (cada 5 min) reintenta sin rendirse nunca, `pendientes.json` intacto durante toda la caída; recuperación automática total al restaurar el backend.

Bug menor encontrado y corregido en el camino: el boot (`engine.init()`) llamaba `syncPendientes()` directo en vez de pasar por `sincronizar()` de `scheduler.js`, por lo que si el backend estaba caído desde el arranque de la app, el polling automático no se activaba (solo lo hubiera activado una reconexión WS, un pendiente nuevo, o medianoche). Corregido: el boot ahora usa `sincronizar()`, unificando todos los disparadores por el mismo camino.

# Decisiones descartadas

`[DECIDIDO]` — Explícitamente descartado:

- No usar **MAC** como identidad/autenticación.
- No **rehacer el proyecto** desde cero.
- No mezclar la **administración del sistema** dentro de la aplicación local.
- No permitir **múltiples dispositivos asociados simultáneamente** a una misma ficha.
- No activar automáticamente una ficha solo porque el dispositivo esté **offline**.
- No depender **exclusivamente** del cron de las 12:00 AM para sincronizar.
- No empaquetar como `.exe` antes de probar la aplicación Node.
- No extraer el bootstrap de carga de DLL a un módulo compartido (por ahora se copia y diverge).

# Reglas para futuras modificaciones

Cualquier IA (o persona) que continúe trabajando en este proyecto debe:

1. Leer primero este archivo antes de modificar código relacionado con el huellero.
2. Revisar el código existente antes de crear implementaciones nuevas.
3. Reutilizar código existente cuando sea posible.
4. No eliminar funcionalidades existentes sin comprobar dependencias.
5. No modificar el backend original innecesariamente.
6. No asumir que una funcionalidad está implementada solo porque aparece en este documento.
7. Diferenciar entre `[DECIDIDO]`, `[IMPLEMENTADO]` y `[PENDIENTE]`.
8. Antes de hacer cambios grandes, explicar qué archivos modificará y por qué.
9. Hacer cambios pequeños y verificables.
10. No continuar automáticamente a una fase posterior si la fase actual falla.
11. No inventar endpoints, modelos o estructuras que no hayan sido confirmados.
12. Mantener este documento actualizado cuando cambien decisiones importantes.

# ROADMAP — Próximos pasos y pendientes

> Consolidado de **todo lo que falta** para completar la app del huellero, en un solo lugar.
> Estados verificados contra el código el **2026-09-08** (re-verificados para esta consolidación; no asumidos).

**Avance reciente (2026-09-08):** el ciclo completo del huellero está implementado y verificado contra hardware real — enrolamiento, identificación, registro de asistencia, sincronización offline/online (`sync.js` + `scheduler.js` + `POST /api/asistencias/sync` idempotente) y gestión de clases activas (`activar`/`finalizar` con `DEACTIVATE`, invariante atómica con índice parcial único, y autenticación JWT + validación de identidad en ambos endpoints). La asociación dispositivo↔ficha también está completa (backend + UI `PanelDispositivos.vue`). Quedan pendientes (categorías 2, 5 y 6): acks del protocolo WS, `GET /api/clases/estado`, el índice único de asistencias, la migración del estado visual del instructor, `npm audit`, y el empaquetado `.exe`. El **2026-09-10** se corrigieron dos bugs de sincronización de estado: (1) la reconciliación de `HELLO` ahora siempre emite `ACTIVATE` o `DEACTIVATE` (limpiaba la "clase fantasma" local del huellero si el `DEACTIVATE` se perdió offline), y (2) `activar()` dejó de usar `String(ficha.dispositivoId)` (el ObjectId del Dispositivo) como `deviceId` y ahora resuelve `Dispositivo.findById(...).deviceId` (el UUID real), con 3 documentos históricos con `deviceId` incorrecto confirmados y el único `Activa` corregido manualmente. Ese mismo día también se cerraron: el feed en vivo `ATTENDANCE_REGISTERED` (verificado con hardware real), el índice único de asistencias `{estudianteId, fichaId, fecha}` (con limpieza previa de 6 grupos duplicados históricos y prueba `E11000`), y la config centralizada de `BIOMETRIC_MATCH_THRESHOLD` vía `config.json` + `setMatchThreshold()` (SHA256 idéntico entre backend y huellero).

## 1. Registro de asistencia real `[IMPLEMENTADO]`

El ciclo completo de toma de asistencia ya funciona de punta a punta y fue verificado con hardware real (Gabriel Arias identificado y asistencia registrada en Mongo):

- `GET /api/fichas/:id/plantillas` implementado (`backend/routes/fichas.js` + `fichaController.getPlantillasFicha`), protegido con auth `deviceId`+`token` (headers `x-device-id`/`x-device-token`).
- Descarga y cacheo local implementado: `store.guardarPlantillasFicha()` (`huellero/src/main/store.js`), disparado al recibir `ACTIVATE`, al reconectar (HELLO) y al capturar sin plantillas cacheadas (`engine.descargarPlantillas()` con reintento 60s + guard anti-concurrencia).
- `capturarYVerificar()` captura, identifica y guarda localmente (`uuid`, anti-duplicado 2 min, `metodo:'HUELLA'`); `sync.js`/`scheduler.js` suben vía `POST /api/asistencias/sync` (idempotente).

## 2. Robustez del ciclo de clases activas `[PARCIAL]`

- **DEACTIVATE / `POST /api/clases/finalizar`**: implementado (2026-09-08). `claseController.finalizar()` busca la clase `Activa` (por `fichaId`+`instructorId`), la pasa a `Finalizada` (`finalizadaAt`) y emite `DEACTIVATE` vía `socketService.emitirDesactivacion()` al `deviceId` resuelto desde el documento. `[IMPLEMENTADO]`
- **Invariante "una clase activa por dispositivo"**: implementada (2026-09-08). `claseController.activar()` usa `findOneAndUpdate` atómico (upsert) + índice parcial único en `Clase` (`{deviceId:1}`, `partialFilterExpression:{estado:'Activa'}`) + manejo del `E11000`. `[IMPLEMENTADO]`
- **Autenticación de `activar`/`finalizar`**: implementada (2026-09-08). Ambas rutas usan `autenticarJWT` y validan que `req.usuario.id === instructorId` del body (403 si no coincide); probado en vivo (401 sin token, 403 con instructorId de otro). `[RESUELTO]`
- **Estado visual del instructor**: `[IMPLEMENTADO]` (2026-09-08). `PanelInstructor.vue` migró del flujo viejo de socket: se eliminó el listener `estado_sesion` (causaba desincronización al sobrescribir con `false`), se reemplazó `docente:nueva_marcacion` por `ATTENDANCE_REGISTERED`, y se agregaron `CLASS_ACTIVATED`/`CLASS_DEACTIVATED` + restauración vía `GET /api/clases/estado` al montar. Verificado en navegador real: sincronización en vivo entre pestañas y restauración de estado al recargar.
- **Feed en vivo `ATTENDANCE_REGISTERED`** `[VERIFICADO 2026-09-10]`: confirmado con hardware real — al marcar asistencia con el huellero durante una clase activa, el bloque "Marcaciones Recientes en Tiempo Real" en `PanelInstructor.vue` muestra al estudiante instantáneamente (nombre + hora + estado), sin recargar la página. Ciclo completo confirmado: huella real → identificación → guardado local → sync → evento `ATTENDANCE_REGISTERED` → feed en vivo.
- **Ventana de carrera en el anti-duplicado de asistencias** `[RESUELTO 2026-09-10]`: se creó el índice único real `Asistencia.index({estudianteId:1, fichaId:1, fecha:1}, {unique:true})`. Antes de crearlo se encontraron y limpiaron 6 grupos de documentos duplicados históricos (7 documentos borrados en total, conservando en cada grupo el más antiguo): 5 pares de `Falta`/`Tardanza` de una corrida duplicada de generación de jornada (2026-08-04), y 3 marcaciones reales de huella del mismo estudiante (Gabriel Arias, 2026-09-08) de pruebas anteriores a este fix. Verificado con prueba real: un segundo insert con el mismo `estudianteId`+`fichaId`+`fecha` (uuid distinto) falla con `E11000` como se espera.
- **Acks `ACTIVATED`/`DEACTIVATED`** `[PENDIENTE, baja prioridad]` `[EVALUADO 2026-09-10]`: se decidió **NO implementar por ahora**. Su propósito original (confirmar que el comando llegó y se aplicó) quedó subsumido por la reconciliación completa de `HELLO` (implementada hoy): si un `ACTIVATE`/`DEACTIVATE` se pierde, el próximo `HELLO` reenvía el estado real desde la BD, sin necesidad de ack. Revisado el escenario de "falla silenciosa al procesar" (dispositivo conectado, error interno) y descartado como problema real: `store.setClaseActiva()` usa `writeFileSync` sin `try/catch`, así que un fallo de escritura lanza una excepción visible en la consola del huellero, no un fallo silencioso. Si se busca observabilidad real del estado del dispositivo en el futuro, el ítem de mayor valor es `DEVICE_CONNECTED`/`DEVICE_DISCONNECTED` (también pendiente, no implementado) — mostraría en el dashboard si el huellero está online, señal útil hoy inexistente, y los acks serían "aguas abajo" de esa mejora.
- `[IMPLEMENTADO 2026-09-10]` — Reconciliación completa en el handler de `HELLO` (`socketService.js`): antes solo emitía `ACTIVATE` si había una Clase activa para el `deviceId`, quedándose en silencio si no la había — dejando al huellero con estado local obsoleto (`data/estado.json`) si el `DEACTIVATE` se perdió mientras estaba desconectado. Ahora siempre reconcilia: `ACTIVATE` si hay `Activa`, `DEACTIVATE` (reutilizando `emitirDesactivacion`) si no la hay.

## 3. Sincronización offline/online (Fase 10) `[IMPLEMENTADO]`

- `huellero/src/main/sync.js`: sincroniza contra `POST /api/asistencias/sync`, idempotente por `uuid`, y elimina de la cola local solo lo confirmado (`guardada`/`duplicada`). `[IMPLEMENTADO]`
- `huellero/src/main/scheduler.js`: disparo obligatorio a las 00:00 + polling cada 5 min (mientras haya pendientes) + intento inmediato al reconectar/guardar nuevo pendiente. `[IMPLEMENTADO]`
- Mecanismo de reintentos (sync): **decidido** — polling fijo de 5 min para el backlog offline (no tiempo real). `[DECIDIDO]`
- Backoff de **reconexión WebSocket** (`huellero/src/main/ws-client.js`): exponencial 2s→60s (`reconnectionDelay`/`reconnectionDelayMax`), distinto del polling de sync. `[IMPLEMENTADO]`
- `POST /api/asistencias/sync`: implementado (auth `deviceId`+`token`, idempotente por `uuid`, resultados por ítem). `[IMPLEMENTADO]`
- **Fase 11 (pruebas de recuperación y duplicados)**: aún `[PENDIENTE]` — el código de sync e idempotencia está, pero no se han ejecutado pruebas formales de recuperación tras caída ni de duplicados masivos.

## 4. Administración: asociación dispositivo↔ficha `[IMPLEMENTADO]`

- **Backend `[IMPLEMENTADO]` (2026-09-08)**: `Ficha.dispositivoId` (`Ficha.js`), `GET /api/dispositivos` y `PUT /api/dispositivos/:id/fichas` (`dispositivoController.js` + `routes/dispositivos.js`, rol Admin). `asociarFichas()` trata el array recibido como el conjunto **completo** (reemplazo total: desasocia las fichas que ya no vienen). `POST /api/clases/activar` resuelve `deviceId` desde `fichaId`.

> `[CORREGIDO 2026-09-10]` — Bug crítico encontrado: `activar()` usaba `String(ficha.dispositivoId)` directamente como `deviceId`, pero ese campo es el **`_id` de MongoDB del documento `Dispositivo` (ObjectId)**, NO el UUID real (`Dispositivo.deviceId`). Esto causaba que las clases se crearan "Activa" en BD con un `deviceId` que nunca coincidía con el UUID real usado por el WebSocket (`dispositivosConectados`) — el `ACTIVATE` nunca llegaba al huellero correcto, y la reconciliación de `HELLO` tampoco las encontraba, dejando clases "fantasma" activas en BD indefinidamente. Fix: `activar()` ahora hace `Dispositivo.findById(ficha.dispositivoId)` y usa `dispositivo.deviceId` (UUID real). Se encontraron y confirmaron 3 documentos `Clase` históricos con este problema (2 ya `Finalizada`, sin impacto; 1 `Activa`, corregida manualmente a `Finalizada`). Verificado end-to-end con hardware real tras el fix (huellero mostró "Clase activa · Ficha 3139318" correctamente).

- **UI `[IMPLEMENTADO]` (2026-09-08)**: sección "Dispositivos" en el dashboard de Admin (`PanelDispositivos.vue` + `App.vue`), con listado, selector de fichas, indicador de movimiento ("⚠️ se moverá desde…") y guardado; verificado end-to-end.

## 5. Calidad y mantenimiento (sin urgencia, no olvidar)

- **npm audit (`huellero/`)** `[EVALUADO 2026-09-10]`: diagnóstico completo realizado. `js-yaml` actualizado (patch seguro, sin `--force`): 14→13 vulnerabilidades. Restantes (1 crítica en `tar` vía electron-builder, 10 altas, 2 moderadas): todas requieren `--force` con saltos de versión mayor (electron 30→44, electron-builder 24→26, electron-vite 2→5, vite 5→8). Riesgo real evaluado como **bajo** en este despliegue: la crítica de `tar` solo es explotable con input no confiable (no aplica aquí), y las altas son mayormente build-time. Decisión: **NO aplicar `--force` ahora** — el salto de electron 30→44 arriesga innecesariamente el camino ya verificado con hardware real (`koffi` + bootstrap de DLLs). Reevaluar en la Fase 12 (empaquetado `.exe`), momento donde de todas formas habrá que tocar la configuración de build.
- **Migrar `dpfpdd_capture` (síncrona) → `dpfpdd_capture_async`**: opcional. El bloqueo de 10s se confirmó tolerable (no rompe el WS), pero sigue siendo mejora de UX. `[PENDIENTE]`
- **Contraseñas en texto plano de Admin/Instructor**: **mayormente resuelto** (verificado 2026-09-07, re-verificado 2026-09-08). El Admin por defecto se crea con bcrypt y hay auto-migración texto plano→bcrypt en `backend/index.js:81-97`; los controllers de Instructor hashean. Detalle de la auto-migración (`backend/index.js:92`): solo chequea `$2a$`/`$2b$` (no `$2y$`, que de todas formas es imposible con `bcryptjs`), y **solo migra al Admin por defecto en el arranque**; los Instructores se migran de forma perezosa en su propio login vía `verifyAndUpgradePassword` (`passwordService.js`). Matiz residual: el modelo `Instructor` (`backend/models/Instructor.js:11`) declara `password: { default: 'sena2026' }` en claro, latente solo si se usa el modelo fuera de los controllers (hoy nunca dispara: los dos puntos de creación siempre fijan password hasheado). `[RESUELTO con matiz]`
- **Campo `metodo: 'HUELLA' | 'MANUAL'`** en `Asistencia`: **agregado** (junto con `uuid` único sparse, al implementar `POST /api/asistencias/sync`). `[IMPLEMENTADO]`
- **Idempotencia de `Asistencia.uuid`** `[VERIFICADO 2026-09-08]`: garantizada por índice único real en MongoDB (`unique: true, sparse: true`, `Asistencia.js:13`) + catch del error `E11000` en el sync (`asistenciaController.js:165-168`), no solo por el `findOne` previo (que es únicamente una optimización). Única salvedad a vigilar: si algún entorno tuviera `autoIndex: false` o el índice no llegó a crearse en una colección preexistente, la garantía se perdería — no es el caso hoy, pero vale la pena confirmar el índice si se detectan asistencias duplicadas alguna vez en producción.
- **Autenticación del WebSocket del dashboard** `[IMPLEMENTADO 2026-09-10]`: `unirse_sala` ahora valida JWT (vía `verificarTokenJWT`, reutilizando el mismo `JWT_SECRET` de `autenticarJWT`) + autorización (Instructor asignado a la ficha vía `instructores`/`instructorLiderId`, o Administrador para cualquier ficha). El frontend pasa el token en el handshake del socket con reconexión tras login/logout (`frontend/src/services/socket.js` + `App.vue`). Verificado con 4 pruebas automatizadas reales contra el backend corriendo. Efecto colateral anotado: `KioscoAsistencia.vue` (flujo viejo, ya confirmado inactivo) también será rechazado al no enviar token — aceptable dado su estado actual.
- **Config centralizado de `BIOMETRIC_MATCH_THRESHOLD` en el huellero** `[IMPLEMENTADO 2026-09-10]`: `fingerprint.js` (backend y huellero, byte-idénticos, hash SHA256 confirmado) ahora expone `setMatchThreshold(value)`, sin cambiar ninguna firma existente. El huellero llama a este setter en `engine.init()` con el valor leído de `config.json` (campo `BIOMETRIC_MATCH_THRESHOLD`, default `21474` vía `DEFAULTS` en `config.js`). El backend no llama al setter, así que sigue leyendo su propio `process.env.BIOMETRIC_MATCH_THRESHOLD` del `.env` sin ningún cambio de comportamiento. Verificado con prueba real (valor `25000` aplicado y confirmado por log).
- **Flujo Web SDK del navegador** (si llega a reactivarse): verificar su propio mismatch de DPI (no investigado). `[PENDIENTE]`

## 6. Empaquetado final `[IMPLEMENTADO]`

- Fase 12 (`.exe`): no intentar hasta que todo lo anterior funcione como app Node/Electron independiente.

`[IMPLEMENTADO 2026-09-10]` — Primer instalador `.exe` generado exitosamente (electron-builder + NSIS, `oneClick:false` + `perMachine:true`). Incluye: las 8 DLLs de DigitalPersona vía `extraResources`, y los dos instaladores del driver U.are.U 4500 (HID Global v4.1.0.217, `setup-x64.msi`/`setup-x86.msi`) embebidos en `build/installer.nsh`, ejecutados silenciosamente (`msiexec /qn /norestart`) solo en instalación limpia y solo si el driver no está ya instalado (chequeo vía registro MSI, `SetRegView 64`).

Bug crítico encontrado y corregido en el camino: el bootstrap de carga de DLLs (anotado como riesgo desde la Fase 1) efectivamente fallaba en la app empaquetada — intentaba cargar desde dentro del `.asar` (imposible, `LoadLibrary` no puede leer ahí) y solo "funcionaba" en el PC de desarrollo por un fallback casual al SDK completo instalado. Fix: nueva entrada con `process.resourcesPath` (API de Electron, `undefined` en el backend, preserva byte-identidad confirmada por SHA256) antepuesta a los demás fallbacks en `fingerprint.js` y `capture.js`. Verificado con logs reales: la app instalada ahora carga `dpfj.dll`/`dpfpdd.dll` desde `resources/dll/`, no desde el fallback del SDK.

Pendiente real antes de producción (no verificado aún, requiere PC limpio real): confirmar que el instalador del driver embebido (`setup-x64.msi` vía `customInstall`) efectivamente instala el driver USB en un PC SIN el SDK/driver preexistente, y que el lector es enumerado por Windows correctamente después. Esta prueba no se pudo hacer hoy porque el único PC disponible ya tenía el driver instalado (lo cual habría sido enmascarado por el chequeo de "ya instalado").

`[VERIFICADO 2026-09-11]` — Confirmación irrefutable (no solo inferencia) de que el instalador Huellero SENA Setup 1.0.0.exe contiene correctamente empaquetados: las 8 DLLs de DigitalPersona (verificadas por tamaño exacto dentro del bloque 7z) y los dos drivers setup-x64.msi/setup-x86.msi (extraídos del bloque NSIS con 7-Zip completo v26.03, que sí decodifica el formato NSIS a diferencia del 7za standalone — hash SHA256 idéntico a los archivos originales en build/driver/). installer.nsh y la sección build.nsis de package.json confirmados intactos desde la Fase 12 original (sin cambios posteriores, git limpio).

Pendiente real (el único que queda de todo el proyecto): esta verificación confirma que los archivos correctos están empaquetados con la lógica correcta de instalación silenciosa, pero NO reemplaza probar el instalador en un PC/VM realmente limpio (sin el SDK/driver preinstalado) para confirmar que Windows detecta el lector USB correctamente después de la instalación silenciosa. Esta es la única prueba de todo el proyecto que sigue sin ejecutarse.

# Retroalimentación del profesor — 2026-09-14

`[RESUELTO 2026-09-14]` — Retroalimentación del profesor: líder de ficha no podía editar/inhabilitar/retirar sus propios estudiantes (`PUT /api/estudiantes/:id` era Admin-only sin excepción). Fix: `updateEstudiante` ahora verifica `ficha.instructorLiderId === req.usuario.id` para no-Admin, con lista blanca de campos editables (nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, genero, estado, motivo — excluye `fichaId` y todo lo biométrico, reservado a Admin/enrolamiento real). UI en `Estudiantes.vue` oculta las acciones para instructores que no son líderes de la ficha del estudiante en cuestión.

Hallazgo colateral importante: el botón "Editar" de la pestaña "Gestionar Estudiantes" en `PanelInstructor.vue` (visible desde antes de hoy) llamaba al MISMO endpoint y fallaba con 403 para cualquier instructor que lo usara — la UI lo mostraba como funcional sin serlo. Quedó arreglado como efecto colateral del fix de arriba (mismo endpoint), y además ahora solo se muestra si `fichaSeleccionada.esLider`.

Verificado con 4 pruebas reales: líder edita estudiante propio (éxito), líder rechazado en ficha ajena (403 + botones ocultos), Admin sin restricción, pestaña Gestionar Estudiantes funcional para el líder.

`[RESUELTO 2026-09-14]` — Retroalimentación del profesor: mensaje confuso de "no se pudo conectar a la base de datos" al iniciar sesión como docente en el huellero, que luego funcionaba igual sin cambiar nada. Diagnóstico en dos etapas:

1. **Causa raíz real del "falla una vez, funciona después"**: el login se intentaba mientras el backend aún arrancaba (MongoDB Atlas conectando, puerto 3000 sin escuchar todavía) → `ECONNREFUSED`. Fix: `loginDocente()` en `engine.js` ahora hace un reintento automático único tras 2.5s si el primer intento falla por red (no para 401/403 reales), con timeout de 7s por intento (peor caso ~16.5s). Mensaje final mejorado: "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo."

2. **Bug real encontrado en el camino** (introducido en el rediseño visual de hoy mismo, no preexistente): el mensaje de error del reintento NUNCA llegaba a mostrarse en la UI. `DocenteLogin.vue` usaba `await emit('login', ...)` asumiendo que devolvía el resultado del handler del padre — pero `emit()` en Vue 3 siempre devuelve `undefined` y no espera handlers async. Por eso siempre se veía el mensaje genérico de repuesto "No se pudo iniciar sesión", inmediatamente, sin importar la causa real. Fix: `DocenteLogin.vue` ahora recibe `onLogin` como prop-función y hace `await props.onLogin(...)` (llamada directa, sí devuelve el valor real), en vez de depender del retorno de `emit()`.

Verificado con reproducción real: reiniciar backend + login dentro de los primeros 2-4s → ahora entra sin mostrar error (reintento silencioso). Con backend apagado del todo → muestra el mensaje correcto tras ~16.5s. Con credenciales incorrectas → mensaje específico inmediato, sin retardo.

`[CORREGIDO 2026-09-14]` — El fix anterior del mismo día (reintento de 2.5s en `loginDocente`) resultó insuficiente en la práctica: el usuario seguía viendo el error de conexión de forma repetida. Investigación más profunda reveló que la causa real observada no era el tiempo de arranque del backend (medido en ~2-3s en condiciones normales, hasta ~30s en peor caso si MongoDB Atlas falla y hace fallback a Mongo local) — era que `node --watch` reinicia el backend completo en cada guardado de archivo durante el desarrollo activo, generando ráfagas de desconexión/reconexión del WebSocket que el usuario interpretaba como fallos de conexión.

Fix robusto aplicado (reemplaza la dependencia de "adivinar un timeout"): el botón "Entrar" del login docente ahora se deshabilita mientras `status.online` sea `false` (el mismo estado de conectividad que ya rastrea y muestra el kiosko), mostrando "Conectando al servidor…" con un indicador visual (ícono wifi/wifi-off + texto). Se habilita automáticamente en cuanto el WebSocket conecta — sin importar si eso toma 2 segundos o 30. El retry de `loginDocente()` se mantiene como defensa en profundidad, ya no como primera línea.

Verificado con reproducción real: login docente bloqueado al arrancar con "Conectando al servidor…", habilitado automáticamente al conectar el WebSocket, sin intervención manual.

Nota de proceso agregada: para pruebas de desarrollo, usar `npm run start` (sin `--watch`) en el backend evita reinicios espurios por cada guardado de archivo que ensucian los logs de WebSocket del huellero.

`[RESUELTO 2026-09-14]` — Se revierte la decisión documentada previamente de "líder de una sola ficha a la vez" (petición explícita del profesor). Eliminadas las 3 validaciones 409 que lo bloqueaban (`createFicha`, `updateFicha`, `importarInstructores` en `fichaController.js` e `instructorController.js`). El frontend (`Fichas.vue`) ya tenía el mensaje informativo correcto de antes ("Se permite ser líder de múltiples fichas"), solo el backend bloqueaba. `Instructor.esLider` (booleano desnormalizado) confirmado correcto para múltiples fichas en lectura (`getInstructores` calcula "líder de al menos una"). Verificado con prueba real: instructor asignado como líder de una segunda ficha, guardado exitoso sin error.

En el mismo día se corrigió: `getFichaLider()` fue renombrado a `getFichasLider()` (`engine.js`) y ahora devuelve **todas** las fichas líder (`filter()` en vez de `find()`, con forma `{ ok: true, fichas: [...] }`), junto con el canal IPC `huellero:getFichasLider` (`main/index.js`) y `window.huellero.getFichasLider()` (`preload/index.js`). `EnrolarHuellaModal.vue` ya consume ese array y muestra un catálogo de selección de ficha cuando el líder tiene más de una (`fichasDisponibles` / `elegirFicha`). **Pendiente de commit** (cambios aún en working tree, no commiteados).

Nota residual (no en alcance): `Instructor.esLider` puede quedar obsoleto en `true` si un instructor deja de liderar todas sus fichas, ya que nada lo resetea explícitamente a `false` — mitigado hoy porque `getInstructores()` usa `inst.esLider || esLiderEnFicha` (el cálculo en vivo manda). No se corrige hoy, queda anotado.

# Pendientes — 2026-09-14

Consolidado honesto de lo que falta, verificado contra `git log` y `git status` de hoy. Nada iniciado salvo indicación contraria.

- **Tardanza escalonada (5 min / 1h / 2h / 6h de falla)** — retroalimentación del profesor. **NO iniciado.** Hoy solo existe la tolerancia única de 15 min que produce un único estado "Tardanza".
- **Máximo 2 huellas (dedos) por persona** — retroalimentación del profesor. **[IMPLEMENTADO Y VERIFICADO 2026-09-14]** — Soporte para hasta 2 huellas (dedos) por estudiante, vía Opción B (campos duplicados: `huellaTemplate2`, `dedoEnrolado2`, `fechaEnrolamiento2`), decidida sobre Opción A (array) dado que no había datos reales que migrar pero el requisito es un tope fijo de 2 (no extensible a N).
  - **Backend**: modelo actualizado; `verifyFingerprint` y `checkDuplicateFingerprint` (backend y huellero, byte-idénticos, SHA256 confirmado) iteran ambos templates; `getPlantillasFicha` emite ambos; `enrolamientoController`/`estudianteController` manejan lógica de slot (auto-asignar vacío, reemplazo explícito con confirmación, 409 si ambos llenos sin slot elegido). Verificado con 4 pruebas curl (slot1, slot2, 409, reemplazo).
  - **Huellero**: `engine.js` (`guardarTemplate`/`enrolarEstudiante`) pasa el slot al backend. `EnrolarHuellaModal.vue` rediseñado con 2 filas de slot visual ("Huella 1"/"Huella 2"), auto-selección de slot vacío, botón "Reemplazar" con confirmación, badge de lista mostrando conteo ("Sin huella"/"1/2 · dedo"/"2/2 · dedo1 + dedo2").
  - **Verificado** de punta a punta con hardware real: enrolar 2 dedos distintos en un mismo estudiante, tercer intento bloqueado con 409 hasta elegir reemplazo, y confirmado que ambos dedos marcan asistencia correctamente en el kiosko para ese mismo estudiante.
  - **[COMPLETADO 2026-09-14] — Fase 3 (frontend web)**: badges de conteo en `ConsultaEstudiante.vue` y `PanelEstudiante.vue` (0 / "1/2 · dedo" / "2/2 · dedo1 + dedo2"), export en `PanelInstructor.vue` actualizado a conteo de huellas, `services/api.js` acepta `slot` opcional en `enrollComplete`.
  - **Aclaración importante**: el modal de enrolamiento SDK del navegador en `PanelInstructor.vue` (`abrirModalEnrolamiento`/`iniciarEnrolamientoReal`) sigue siendo código de referencia sin UI activa — consistente con la decisión ya tomada hoy mismo de decomisionar el enrolamiento del navegador (se removió la pestaña "Enrolar Huellas" y su modal), dejando el enrolamiento real exclusivamente en la app del huellero (`EnrolarHuellaModal.vue`). Se actualizó ese código de referencia con la lógica de slot por consistencia, sin revivir su UI, para no reintroducir un segundo camino de enrolamiento. `KioscoAsistencia.vue` confirmado sin cambios necesarios (solo hace verificación vía `/estudiantes/verify`, que ya compara ambos templates automáticamente en el backend).
  - Con esto, el punto #8 completo (Fases 1-3) queda **IMPLEMENTADO Y VERIFICADO**.
- **Catálogo de selección de ficha para enrolamiento (huellero)** — **IMPLEMENTADO en working tree pero sin commitear** (`EnrolarHuellaModal.vue` + `getFichasLider()` en `engine.js`/`main/index.js`/`preload/index.js`). Pendiente de hacer commit.
- **Rotación de `MONGODB_URI` y `GMAIL_PASS`** — pendiente de coordinar con el otro colaborador. (`backend/.env` ya fuera del tracking desde 2026-09-10, commit `bcb0376`.)
- **Prueba del instalador `.exe` en un PC/VM realmente limpio** — sin hacerse. Es la única prueba de todo el proyecto que sigue sin ejecutarse (confirmada 2026-09-11).
- **Nota residual `Instructor.esLider`** — puede quedar obsoleto en `true` si un instructor deja de liderar todas sus fichas (nada lo resetea a `false`); mitigado por el cálculo en vivo de `getInstructores()`. Sin prioridad urgente, no corregido.

# Merge con origin/main — 2026-09-17

`[DECIDIDO]` — Merge de `origin/main` cerrado (commit `c783708`). Decisiones de arquitectura resultantes:

- **Biometría centralizada en `huellero/` (Electron).** El backend **ya no** tiene `backend/services/fingerprint.js`, ni las DLLs de DigitalPersona (`backend/dll/`), ni las rutas HTTP de enrolamiento/verificación (`/estudiantes/enroll-start`, `enroll-capture`, `enroll-complete`, `enroll-cancel`, `verify`, `fingerprint-status`). Motivo: Iván dockerizó backend y frontend, y las DLLs nativas de Windows (koffi + dpfj.dll) no corren en un contenedor Linux.
- **Eliminado el flujo de enrolamiento y verificación de huella vía navegador web** (Web SDK de DigitalPersona, `Fingerprint.WebApi`). Ya estaba decomisionado desde 2026-09-11 pero se había dejado como código de referencia; ahora se borró del todo porque el backend que lo sostenía ya no existe.
- **El enrolamiento real de huellas sigue ocurriendo únicamente vía `huellero/src`** (`EnrolarHuellaModal.vue` + `fingerprint.js` del huellero), que ya soporta 2 huellas por estudiante.
- **Conservada la lógica de 2 huellas** (`huellaTemplate`/`huellaTemplate2`) en `enrolamientoController.js`, que `main` no tenía.
- **`useSistemaEstado.js`**: el indicador `estadoWebSocket` ahora usa `socket.connected` en vez de un endpoint de `fingerprint-status` que ya no existe.

**Pendiente de baja prioridad (no resuelto):** `estadoLectorUSB` en el mismo composable `useSistemaEstado.js` sigue dependiendo de `Fingerprint.WebApi` (también decomisionado), por lo que el "ojito" del panel puede mostrar "Huellero desconectado" de forma incorrecta. Cosmético, no bloqueante.

[MERGE 2026-09-16] — Se incorporó de main: fix de rutas de config.json y data/ para que la app INSTALADA use %APPDATA% en vez de process.cwd() (que en Program Files no es escribible sin admin). Confirmado que nuestro fix de 127.0.0.1 (DEFAULTS) sigue intacto. También se agregaron 4 DLLs adicionales de DigitalPersona (dpfpapi.dll, dpfpdd5000.dll, dpfpdd7k.dll, nex_sdk.dll) — soporte para otros modelos de lector (U.are.U 5100, Nomad 30, NEX), confirmado con metadatos del binario que son aditivas y no interfieren con el flujo del U.are.U 4500 (cero referencias en código, dpfj.dll/dpfpdd.dll permanecen byte-idénticos).

Gap pendiente encontrado: la migración automática de config.json a %APPDATA% no cubre la carpeta data/ (plantillas.json, pendientes.json) — si un PC tenía huellas cacheadas localmente antes de actualizar a una versión instalada con este fix, esos datos quedarían en la ubicación vieja sin migrar. Pendiente de decidir si vale la pena agregar migración también para data/.
