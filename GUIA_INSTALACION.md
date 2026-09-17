# 🚀 Guía de Instalación y Configuración del Sensor de Huella (DigitalPersona U.are.U 4500)

Esta guía explica los pasos necesarios para instalar los controladores de hardware y poner a funcionar el sistema de lectura de huella en **cualquier computadora nueva con Windows**.

---

## 🏛️ Arquitectura del Lector de Huellas

El hardware biométrico y sus librerías de enlace dinámico (`.dll`) operan **exclusivamente en la aplicación de escritorio (`huellero/`)**, manteniendo el backend y la plataforma web 100% libres de dependencias de drivers de Windows.

```text
       ┌──────────────────────────────┐
       │ Lector Físico U.are.U 4500   │
       └──────────────┬───────────────┘
                      │ Conexión USB
                      ▼
       ┌──────────────────────────────┐
       │ Driver RTE DigitalPersona    │ (Windows 10/11)
       └──────────────┬───────────────┘
                      │ FFI C++ (koffi)
                      ▼
       ┌──────────────────────────────┐
       │ Kiosco Electron (huellero/)  │ Contiene huellero/dll/ (dpfj.dll, dpfpdd.dll)
       └──────────────┬───────────────┘ Captura & Comparación local
                      │
                      │ Sincronización HTTP / WebSockets
                      ▼
       ┌──────────────────────────────┐
       │ Backend API (Docker / Nube)  │ Node.js 22 + MongoDB Atlas
       └──────────────────────────────┘
```

---

## 📋 Requisitos Previos

1. **Hardware:** Sensor biométrico **DigitalPersona U.are.U 4500 USB** (o compatible con SDK U.are.U).
2. **Sistema Operativo:** Windows 10 o Windows 11 (64-bit).
3. **Controladores del Fabricante:** Driver RTE (*Runtime Environment*) de DigitalPersona / Crossmatch / HID Global.
4. **Node.js:** Versión 22 o superior.

---

## 1. 🔌 Instalación de Controladores en la Computadora con el Lector

Para que Windows reconozca el sensor biométrico y la aplicación de escritorio pueda abrir el puerto USB:

### Pasos:
1. **Instalar el Driver RTE de DigitalPersona:**
   * Ejecuta el instalador oficial de controladores: `DigitalPersona U.are.U SDK Runtime (x64)`.
   * Sigue los pasos del asistente de instalación hasta finalizar.
2. **Conectar el Sensor USB:**
   * Conecta el lector U.are.U 4500 a un puerto USB 2.0 / 3.0 directo del equipo.
3. **Verificación en el Administrador de Dispositivos:**
   * Presiona `Win + X` y selecciona **Administrador de dispositivos**.
   * Debe aparecer la categoría:
     ```text
     Dispositivos biométricos
     └── DigitalPersona Fingerprint Reader (o U.are.U 4500 Fingerprint Reader)
     ```
   * Si aparece con un triángulo amarillo, reinstala el controlador o reconecta el sensor en otro puerto USB.

---

## 2. 🖐️ Puesta en Marcha del Kiosco de Escritorio (`huellero/`)

La carpeta `huellero/dll/` ya incluye las librerías nativas necesarias (`dpfj.dll`, `dpfpdd.dll`, etc.):

1. Abre una terminal de consola en la carpeta `huellero/`:
   ```powershell
   cd huellero
   npm install
   npm run dev
   ```
2. La interfaz del Kiosco se abrirá en pantalla completa o ventana de aula.
3. Al posicionar el dedo sobre el sensor, la luz roja del lector se activará y registrará la lectura biométrica automáticamente.

---

## 3. 🌐 Configuración del Servidor y Plataforma Web

Para iniciar el servidor y la interfaz web en la misma máquina o en red local:

* **Con Docker (Recomendado):**
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```
* **Con script automatizado:**
  * Ejecuta haciendo doble clic en **`setup_huellas.bat`** para instalar todas las dependencias del monorepo y verificar los componentes nativos.

---

## 🛠️ Resumen de Componentes

| Componente | Responsabilidad | Plataforma |
| :--- | :--- | :--- |
| **Driver DigitalPersona** | Comunicación USB con el sensor físico | Windows 10/11 |
| **`huellero/` (Electron)** | Captura, comparación biométrica y modo offline | Windows (Equipo del aula) |
| **`backend/` (Node.js 22)** | Base de datos Atlas, reglas de negocio, WebSocket | Docker / Linux / Windows / Nube |
| **`frontend/` (Vue 3)** | Dashboard del Administrador e Instructores | Cualquier navegador web |

