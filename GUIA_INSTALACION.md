# 🚀 Guía de Instalación de Asista (lector de huellas DigitalPersona U.are.U 4500)

Esta guía explica cómo instalar y poner en marcha **Asista**, la aplicación de escritorio que registra la asistencia con huella, en un computador con Windows.

- **Parte A:** para quien solo va a usar la app (instalador).
- **Parte B:** para quien va a desarrollar o desplegar el sistema.

---

## 🅰️ PARTE A — Instalación para usuarios

### Requisitos

1. **Equipo:** Windows 10 u 11 (64 bits).
2. **Lector:** DigitalPersona U.are.U 4500 (USB).
3. **Internet** para activar el equipo la primera vez (después la app también funciona sin conexión y sincroniza cuando vuelve).

> No necesitas instalar Node.js, ni drivers, ni el SDK por separado: **el instalador de Asista se encarga de todo.**

### Paso 1. Ejecutar el instalador

1. Ejecuta `Asista-Setup-1.0.0.exe` y acepta el permiso de administrador.
2. **Aviso de Windows SmartScreen:** el instalador todavía no está firmado digitalmente, así que Windows puede mostrar *"Windows protegió su PC"*. Es normal. Pulsa **"Más información"** y luego **"Ejecutar de todas formas"**.
3. Sigue el asistente hasta el final. Además de la app, el instalador instala automáticamente (solo si aún no están en el equipo):
   - Microsoft Visual C++ Redistributable (x64)
   - Driver del lector **U.are.U 4500 Driver 4.1.0.217**
   - **SDK U.are.U 3.2.0.89** (DigitalPersona)
4. Si el instalador pide reiniciar, reinicia el equipo antes de continuar.

### Paso 2. Conectar el lector

Conecta el lector a un puerto USB directo del equipo (evita extensiones o hubs si puedes).

Para verificar que Windows lo reconoce: `Win + X` → **Administrador de dispositivos**. Debe aparecer el lector de DigitalPersona sin triángulo amarillo (normalmente dentro de *Authentication Devices* / *Dispositivos de autenticación*).

### Paso 3. Abrir Asista y activar el equipo

1. Abre **Asista** desde el acceso directo del escritorio o del menú Inicio.
2. La primera vez, el equipo se **registra automáticamente** en el sistema y queda pendiente de aprobación.
3. Un administrador debe entrar al **panel web de administración → Dispositivos** y **permitir** ese equipo.
4. Cuando el equipo esté aprobado, la app queda lista para tomar asistencia. Esta activación se hace una sola vez.

### Paso 4. Uso diario

1. El instructor inicia sesión en la app y activa la clase de su ficha.
2. Cada aprendiz coloca el dedo en el lector:
   - Si es su primera vez en el día, la app muestra **"Asistencia registrada"**.
   - Si ya registró asistencia ese día en la misma ficha, muestra **"Ya registraste tu asistencia"** (sin importar cuánto tiempo haya pasado).
3. Sin internet la app sigue funcionando: guarda las asistencias en el equipo y las **sincroniza automáticamente** cuando vuelve la conexión.

### Dónde guarda sus datos

Asista guarda su configuración local (activación del equipo y caché de huellas y asistencias pendientes) en:

```text
%APPDATA%\huellero
```

(escríbelo en la barra del Explorador de archivos). No borres esa carpeta si hay asistencias sin sincronizar.

### Solución de problemas

| Síntoma | Qué revisar |
| :--- | :--- |
| *"No se detectó ningún lector"* | Reconecta el lector en otro puerto USB; verifica que aparezca en el Administrador de dispositivos; reinicia la app. |
| El lector no aparece en el Administrador de dispositivos | Cambia de puerto o de cable; comprueba en *Configuración → Aplicaciones* que esté instalado **U.are.U 4500 Driver**. |
| La app se cierra al leer la huella | Comprueba en *Configuración → Aplicaciones* que esté instalado **U.are.U SDK 3.2.0.89**. Si en su lugar solo hay otro SDK de DigitalPersona (por ejemplo *One Touch for Windows SDK*), instala el que trae Asista. |
| El equipo queda "pendiente" y no toma asistencia | Falta la aprobación del administrador en el panel web → Dispositivos. |
| Windows muestra aviso de SmartScreen | Normal: *"Más información"* → *"Ejecutar de todas formas"*. |

### Desinstalar

*Configuración → Aplicaciones → Asista → Desinstalar.* El driver y el SDK no se desinstalan solos; pueden quitarse desde la misma lista si ya no se necesitan.

---

## 🅱️ PARTE B — Para desarrolladores

### 🏛️ Arquitectura del lector de huellas

El hardware biométrico y sus librerías (`.dll`) operan **exclusivamente en la aplicación de escritorio (`huellero/`)**, manteniendo el backend y la plataforma web libres de dependencias de drivers de Windows.

```text
       ┌──────────────────────────────┐
       │ Lector Físico U.are.U 4500   │
       └──────────────┬───────────────┘
                      │ Conexión USB
                      ▼
       ┌──────────────────────────────┐
       │ Driver U.are.U 4500 (4.1.0.217)  │
       │ + SDK U.are.U 3.2.0.89           │ (Windows 10/11)
       └──────────────┬───────────────┘
                      │ FFI C++ (koffi)
                      ▼
       ┌──────────────────────────────┐
       │ Asista (Electron, huellero/) │ Contiene huellero/dll/ (dpfj.dll, dpfpdd.dll)
       └──────────────┬───────────────┘ Captura y comparación local
                      │
                      │ Sincronización HTTP / WebSockets
                      ▼
       ┌──────────────────────────────┐
       │ Backend API (Docker / Nube)  │ Node.js 22 + MongoDB Atlas
       └──────────────────────────────┘
```

### Requisitos para desarrollar

1. Windows 10/11 (64 bits), lector U.are.U 4500.
2. **Node.js 22** o superior.
3. Driver U.are.U 4500 4.1.0.217 y **SDK U.are.U 3.2.0.89** instalados (están en `huellero/build/driver/` y `huellero/build/sdk/`, o se instalan con el instalador de Asista).
4. Visual C++ Redistributable x64 (`huellero/build/vcredist/`).

### Ejecutar la app en modo desarrollo

```powershell
cd huellero
npm install
npm run dev
```

En modo dev los datos locales se guardan en `huellero/data/` (carpeta ignorada por Git). En la app instalada viven en `%APPDATA%\huellero`.

### Generar el instalador

```powershell
cd huellero
npm run dist
```

El instalador queda en `huellero/release-app/Asista-Setup-<versión>.exe`. Incluye el driver, el SDK y VC++ y los instala en silencio, con verificación de códigos de salida (`huellero/build/installer.nsh`).

### Servidor y plataforma web

- **Con Docker (recomendado):**
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```
- **Con script automatizado:** doble clic en **`setup_huellas.bat`** para instalar las dependencias del monorepo y verificar los componentes nativos.

### 🛠️ Resumen de componentes

| Componente | Responsabilidad | Plataforma |
| :--- | :--- | :--- |
| **Driver + SDK U.are.U** | Comunicación USB con el sensor físico | Windows 10/11 |
| **`huellero/` (Electron, Asista)** | Captura, comparación biométrica y modo offline | Windows (equipo del aula) |
| **`backend/` (Node.js 22)** | Base de datos Atlas, reglas de negocio, WebSocket | Docker / Linux / Windows / Nube |
| **`frontend/` (Vue 3)** | Panel del administrador e instructores | Cualquier navegador web |

### 📄 Licencia del SDK

El SDK de DigitalPersona/Crossmatch se usa bajo su EULA (ver `docs/EULA SDK.rtf`). Su uso en este proyecto es **interno** y el repositorio debe mantenerse **privado**; no redistribuir el instalador fuera de la institución sin autorización del fabricante.
