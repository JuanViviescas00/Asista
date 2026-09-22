# Diagnóstico de Fallo Silencioso en Captura y Enrolamiento (Huellero DigitalPersona)

Este documento detalla la investigación técnica, el hallazgo del `try/catch` silencioso, las hipótesis sobre el fallo de captura en hardware nuevo y las instrucciones para obtener los registros completos.

---

## 1. Descripción del Problema Reportado

En un PC nuevo donde se confirmó mediante consola que las librerías nativas cargan exitosamente:
- `dpfj.dll cargada exitosamente`
- `dpfpdd.dll cargada exitosamente`
- `dpfpdd_init() OK — librería lista para capturar`

Al intentar capturar o enrolar una huella dactilar real en la aplicación:
1. **La luz del sensor óptico NO enciende.**
2. **No aparece ningún mensaje nuevo en la consola de PowerShell** (se interrumpe el flujo normal de logs).
3. **No se registran errores en la consola de DevTools de Electron (renderer).**
4. **La interfaz de usuario muestra de inmediato:** `"Enrolamiento cancelado por fallos consecutivos"`.

---

## 2. Código Encargado de la Captura Física

El flujo de captura física del hardware reside en [`huellero/src/main/capture.js`](../huellero/src/main/capture.js):

```javascript
export async function capturarHuella(timeoutMs = TIMEOUT_CAPTURA_MS) {
  if (!inicializarCaptura()) {
    throw new Error(errorInicializacion || 'No se pudo inicializar el lector de huellas')
  }

  // 1. Consulta lectores USB conectados vía dpfpdd_query_devices
  const dispositivos = obtenerDispositivos()
  if (dispositivos.length === 0) {
    throw new Error('No se detectó ningún lector de huellas conectado')
  }

  // 2. Abre el lector vía dpfpdd_open
  const devName = dispositivos[0].name
  const dev = abrirDispositivo(devName)
  devActual = dev

  try {
    // 3. Lee resolución nativa y llama a dpfpdd_capture.async
    const dpi = obtenerResolucion(dev)
    const { gray, width, height } = await capturarImagen(dev, timeoutMs, dpi)
    const imagen = grayscaleToPngBase64(gray, width, height)
    return { imagen, dpi }
  } finally {
    devActual = null
    cerrarDispositivo(dev)
  }
}
```

---

## 3. Localización del Conteo de "Fallos Consecutivos" y Catch Silencioso

El bucle de enrolamiento reside en [`huellero/src/main/engine.js`](../huellero/src/main/engine.js) dentro de la función `enrolarEstudiante()`.

### Código original con el fallo silencioso:
```javascript
let fallosConsecutivos = 0
const MAX_FALLOS_CONSECUTIVOS = 3

while (true) {
  // ...
  let captura
  try {
    captura = await capturarHuella()
  } catch (err) {
    // ⚠️ CATCH SILENCIOSO: No existía console.error ni console.log
    fallosConsecutivos++
    const motivo = err.message || 'No se pudo capturar la huella'
    notificarProgresoEnrolamiento({ 
      fase: 'captura_fallida', 
      actual, 
      total, 
      mensaje: `${motivo} — reintentando` 
    })

    if (fallosConsecutivos >= MAX_FALLOS_CONSECUTIVOS) {
      fingerprint.cancelSession(sessionId)
      notificarProgresoEnrolamiento({ 
        fase: 'cancelado', 
        actual, 
        total, 
        mensaje: 'Enrolamiento cancelado por fallos consecutivos' 
      })
      return { ok: false, error: `No se pudo capturar una huella válida: ${motivo}` }
    }
    continue // ⚠️ Reintenta de inmediato en milisegundos
  }
}
```

### Diagnóstico de la falla:
* Si `obtenerDispositivos()` devuelve `[]` o si `abrirDispositivo()` falla, `capturarHuella()` lanza una excepción de inmediato.
* El bloque `catch` atrapaba el error, incrementaba `fallosConsecutivos`, enviaba un evento IPC al renderer (`captura_fallida`) y hacía `continue`.
* Los 3 intentos ocurrían en **menos de 10 milisegundos**.
* Como no había ningún `console.error(err)`, la consola de PowerShell permanecía completamente muda.
* El renderer no recibía un error de JavaScript, sino un evento ordinario de cancelación, mostrando en pantalla: `"Enrolamiento cancelado por fallos consecutivos"`.

---

## 4. Trazabilidad y Logging Incorporado

Se agregaron registros explícitos en todos los puntos críticos del flujo sin alterar la lógica de negocio ni los reintentos:

1. **[`capture.js`](../huellero/src/main/capture.js):**
   * Log del código de retorno y cantidad de dispositivos encontrados en `dpfpdd_query_devices()`.
   * Log al intentar abrir el dispositivo con `dpfpdd_open()` y reporte del código de error `rc` si falla.
   * Log del ciclo de vida de `dpfpdd_capture()` (inicio, código de retorno `rc`, `success`, `quality` y dimensiones).
2. **[`engine.js`](../huellero/src/main/engine.js):**
   * `console.error` en cada intento fallido con su número consecutivo `(intento fallido #X/3)` y el mensaje de error exacto.
   * `console.error` al llegar al límite de fallos consecutivos antes de cancelar la sesión.

### Validación de Sintaxis:
```powershell
node --check huellero/src/main/capture.js
node --check huellero/src/main/engine.js
# Validado: código de salida 0
```

---

## 5. Hipótesis Técnicas: ¿Por qué falla en un PC nuevo si `dpfpdd_init()` funciona?

`dpfpdd_init()` únicamente carga las librerías C en el espacio de memoria del proceso de Node/Electron; **no abre comunicación directa con el hardware USB**. Por tanto, `dpfpdd_init() OK` solo certifica que la DLL se cargó en RAM.

Las principales causas de que la captura física no inicie en un equipo nuevo son:

### Hipótesis A: `dpfpdd_query_devices` devuelve `count = 0` (Dispositivo no enumerado)
* **Causa:** En PCs nuevos, Windows Update suele asociar el lector con un controlador USB genérico o el driver de Windows Update no expone los endpoints que busca la DLL nativa `dpfpdd.dll`.
* **Efecto:** Para la DLL no hay ningún lector conectado (`count = 0`), por lo que lanza `"No se detectó ningún lector de huellas conectado"` antes de poder encender la luz.

### Hipótesis B: Bloqueo exclusivo por `DpHost` (`DPFPDD_E_DEVICE_BUSY`)
* **Causa:** Al instalar el paquete de DigitalPersona en un PC nuevo, se instala y habilita el servicio de Windows `DpHost` (*Servicio de autenticación de DigitalPersona*).
* **Efecto:** `DpHost` se apropia del lector en modo exclusivo para el inicio de sesión de Windows. Cuando la aplicación intenta llamar a `dpfpdd_open()`, la función retorna el error `0x05ba001e` (`DPFPDD_E_DEVICE_BUSY`), impidiendo la captura.

### Hipótesis C: Driver WBF vs. Driver RTE / SDK
* **Causa:** DigitalPersona dispone de drivers WBF (*Windows Biometric Framework*) y drivers RTE (*Run-Time Environment*).
* **Efecto:** Si está instalado el driver WBF, el sistema operativo desvía las peticiones a Windows Hello y bloquea las llamadas directas de bajo nivel de `dpfpdd.dll`.

### Hipótesis D: Suspensión de energía en puertos USB 3.0 / 3.2
* **Causa:** Controladores de ahorro de energía Intel/AMD desactivan temporalmente la alimentación del puerto USB para dispositivos de autenticación en reposo.

---

## 6. Instrucciones para Reproducir y Obtener el Log Completo

1. Abre una terminal de **PowerShell** en el proyecto y ve a la carpeta del huellero:
   ```powershell
   cd huellero
   npm run dev
   ```
2. En la aplicación del huellero:
   * Inicia sesión como instructor líder (`Ctrl + Shift + L` o botón de configuración).
   * Ingresa a la opción **Registrar huella**.
   * Selecciona un estudiante, selecciona un dedo y haz clic en **Iniciar captura**.
3. Observa la terminal de PowerShell. Con el nuevo logging verás exactamente:
   * Si el error ocurre en la detección: `[capture] dpfpdd_query_devices() -> rc1=... count=0`
   * Si el error ocurre al abrir: `[capture] dpfpdd_open(...) falló con código ...`
   * Si el error ocurre en el escaneo: `[capture] dpfpdd_capture() finalizó: rc=...`
4. Copia las líneas emitidas con prefijo `[capture]` y `[engine]` para aplicar el ajuste definitivo.
