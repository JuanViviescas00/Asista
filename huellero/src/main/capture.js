// Fase 5 — Captura real de huella DigitalPersona (dpfpdd.dll)
// Reemplaza el stub. Captura SÍNCRONA (dpfpdd_capture), bloqueante.
//
// Flujo por captura: dpfpdd_query_devices -> dpfpdd_open -> dpfpdd_capture -> dpfpdd_close.
// dpfpdd_init() se ejecuta UNA SOLA VEZ (idempotente) en inicializarCaptura().
//
// Devuelve la imagen en formato PNG base64 (grayscale), que es lo que
// fingerprint.js/verify.js esperan (imageBase64). Cualquier error lanza Error con mensaje claro.

import koffi from 'koffi'
import { PNG } from 'pngjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dllFolder = path.resolve(__dirname, '../../dll')

// Mismo patrón de dllFolder/PATH que fingerprint.js
process.env.PATH = `${dllFolder};${process.env.PATH}`

// ---------------------------------------------------------------------------
// Constantes (dpfpdd.h oficial — docs/sdk-reference/dpfpdd.h)
// ---------------------------------------------------------------------------
const DPFPDD_SUCCESS = 0

const _DP_FACILITY = 0x05ba
const DPERROR = (err) => (err | (_DP_FACILITY << 16))

const DPFPDD_E_FAILURE = DPERROR(0x0b)
const DPFPDD_E_NO_DATA = DPERROR(0x0c)
const DPFPDD_E_MORE_DATA = DPERROR(0x0d)
const DPFPDD_E_INVALID_PARAMETER = DPERROR(0x14)
const DPFPDD_E_INVALID_DEVICE = DPERROR(0x15)
const DPFPDD_E_DEVICE_BUSY = DPERROR(0x1e)
const DPFPDD_E_DEVICE_FAILURE = DPERROR(0x1f)

// DPFPDD_IMAGE_FMT
const DPFPDD_IMG_FMT_PIXEL_BUFFER = 0

// DPFPDD_IMAGE_PROC
const DPFPDD_IMG_PROC_DEFAULT = 0

// DPFPDD_QUALITY
const DPFPDD_QUALITY_GOOD = 0
const DPFPDD_QUALITY_TIMED_OUT = 1
const DPFPDD_QUALITY_CANCELED = 1 << 1
const DPFPDD_QUALITY_NO_FINGER = 1 << 2
const DPFPDD_QUALITY_FAKE_FINGER = 1 << 3
const DPFPDD_QUALITY_FINGER_TOO_LEFT = 1 << 4
const DPFPDD_QUALITY_FINGER_TOO_RIGHT = 1 << 5
const DPFPDD_QUALITY_FINGER_TOO_HIGH = 1 << 6
const DPFPDD_QUALITY_FINGER_TOO_LOW = 1 << 7
const DPFPDD_QUALITY_FINGER_OFF_CENTER = 1 << 8
const DPFPDD_QUALITY_SCAN_SKEWED = 1 << 9
const DPFPDD_QUALITY_SCAN_TOO_SHORT = 1 << 10
const DPFPDD_QUALITY_SCAN_TOO_LONG = 1 << 11
const DPFPDD_QUALITY_SCAN_TOO_SLOW = 1 << 12
const DPFPDD_QUALITY_SCAN_TOO_FAST = 1 << 13
const DPFPDD_QUALITY_SCAN_WRONG_DIRECTION = 1 << 14
const DPFPDD_QUALITY_READER_DIRTY = 1 << 15

// Resolución por defecto si no se puede leer la del lector (los 4500 reportan 700)
const DPI_FALLBACK = 500

// Tamaño máximo del buffer de imagen (sobra con creces para un sensor de área a 8bpp)
const MAX_IMAGE_SIZE = 2 * 1024 * 1024

// Timeout por defecto de la captura síncrona (ms)
const TIMEOUT_CAPTURA_MS = 10000

// ---------------------------------------------------------------------------
// Structs (dpfpdd.h oficial)
// ---------------------------------------------------------------------------
const DPFPDD_VER_INFO = koffi.struct('DPFPDD_VER_INFO', {
  major: 'int',
  minor: 'int',
  maintenance: 'int',
})

const DPFPDD_HW_DESCR = koffi.struct('DPFPDD_HW_DESCR', {
  vendor_name: koffi.array('char', 128),
  product_name: koffi.array('char', 128),
  serial_num: koffi.array('char', 128),
})

const DPFPDD_HW_ID = koffi.struct('DPFPDD_HW_ID', {
  vendor_id: 'uint16',
  product_id: 'uint16',
})

const DPFPDD_HW_VERSION = koffi.struct('DPFPDD_HW_VERSION', {
  hw_ver: DPFPDD_VER_INFO,
  fw_ver: DPFPDD_VER_INFO,
  bcd_rev: 'uint16',
})

const DPFPDD_DEV_INFO = koffi.struct('DPFPDD_DEV_INFO', {
  size: 'uint32',
  name: koffi.array('char', 1024),
  descr: DPFPDD_HW_DESCR,
  id: DPFPDD_HW_ID,
  ver: DPFPDD_HW_VERSION,
  modality: 'uint32',
  technology: 'uint32',
})

const DPFPDD_DEV_CAPS = koffi.struct('DPFPDD_DEV_CAPS', {
  size: 'uint32',
  can_capture_image: 'int',
  can_stream_image: 'int',
  can_extract_features: 'int',
  can_match: 'int',
  can_identify: 'int',
  has_fp_storage: 'int',
  indicator_type: 'uint32',
  has_pwr_mgmt: 'int',
  has_calibration: 'int',
  piv_compliant: 'int',
  resolution_cnt: 'uint32',
  resolutions: koffi.array('uint32', 16),
})

const DPFPDD_CAPTURE_PARAM = koffi.struct('DPFPDD_CAPTURE_PARAM', {
  size: 'uint32',
  image_fmt: 'uint32',
  image_proc: 'uint32',
  image_res: 'uint32',
})

const DPFPDD_IMAGE_INFO = koffi.struct('DPFPDD_IMAGE_INFO', {
  size: 'uint32',
  width: 'uint32',
  height: 'uint32',
  res: 'uint32',
  bpp: 'uint32',
})

const DPFPDD_CAPTURE_RESULT = koffi.struct('DPFPDD_CAPTURE_RESULT', {
  size: 'uint32',
  success: 'int',
  quality: 'uint32',
  score: 'uint32',
  info: DPFPDD_IMAGE_INFO,
})

const DPFPDD_DEV = koffi.opaque('DPFPDD_DEV')

// ---------------------------------------------------------------------------
// Estado de inicialización
// ---------------------------------------------------------------------------
let dpfpdd = null
let inicializado = false
let errorInicializacion = null

let dpfpdd_init, dpfpdd_query_devices, dpfpdd_open, dpfpdd_close
let dpfpdd_get_device_capabilities, dpfpdd_capture

function describirError(code) {
  switch (code) {
    case DPFPDD_SUCCESS: return 'éxito'
    case DPFPDD_E_FAILURE: return 'fallo general'
    case DPFPDD_E_NO_DATA: return 'no hay datos disponibles'
    case DPFPDD_E_MORE_DATA: return 'el buffer asignado es demasiado pequeño'
    case DPFPDD_E_INVALID_PARAMETER: return 'parámetro inválido'
    case DPFPDD_E_INVALID_DEVICE: return 'manejador de lector inválido'
    case DPFPDD_E_DEVICE_BUSY: return 'el lector está ocupado (otra operación en curso)'
    case DPFPDD_E_DEVICE_FAILURE: return 'fallo del lector'
    default: return `código de error desconocido (0x${(code >>> 0).toString(16)})`
  }
}

function describirCalidad(code) {
  switch (code) {
    case DPFPDD_QUALITY_TIMED_OUT: return 'Tiempo de espera agotado: no se detectó ninguna huella'
    case DPFPDD_QUALITY_CANCELED: return 'La captura fue cancelada'
    case DPFPDD_QUALITY_NO_FINGER: return 'No se detectó un dedo en el lector'
    case DPFPDD_QUALITY_FAKE_FINGER: return 'Se detectó un dedo falso'
    case DPFPDD_QUALITY_FINGER_TOO_LEFT: return 'El dedo está demasiado a la izquierda'
    case DPFPDD_QUALITY_FINGER_TOO_RIGHT: return 'El dedo está demasiado a la derecha'
    case DPFPDD_QUALITY_FINGER_TOO_HIGH: return 'El dedo está demasiado arriba'
    case DPFPDD_QUALITY_FINGER_TOO_LOW: return 'El dedo está demasiado abajo'
    case DPFPDD_QUALITY_FINGER_OFF_CENTER: return 'El dedo no está centrado en el lector'
    case DPFPDD_QUALITY_SCAN_SKEWED: return 'La lectura está demasiado inclinada'
    case DPFPDD_QUALITY_SCAN_TOO_SHORT: return 'La lectura es demasiado corta'
    case DPFPDD_QUALITY_SCAN_TOO_LONG: return 'La lectura es demasiado larga'
    case DPFPDD_QUALITY_SCAN_TOO_SLOW: return 'El barrido fue demasiado lento'
    case DPFPDD_QUALITY_SCAN_TOO_FAST: return 'El barrido fue demasiado rápido'
    case DPFPDD_QUALITY_SCAN_WRONG_DIRECTION: return 'Dirección de barrido incorrecta'
    case DPFPDD_QUALITY_READER_DIRTY: return 'El lector necesita limpieza'
    default: return `Calidad de imagen insuficiente (código ${code})`
  }
}

function cargarBiblioteca() {
  const searchPaths = [
    path.join(dllFolder, 'dpfpdd.dll'),
    ...(process.resourcesPath ? [path.join(process.resourcesPath, 'dll', 'dpfpdd.dll')] : []),
    'C:/Program Files/DigitalPersona/U.are.U SDK/Windows/Lib/x64/dpfpdd.dll',
    'C:/Program Files/DigitalPersona/U.are.U SDK/Windows/Lib/win32/dpfpdd.dll',
  ]

  for (const p of searchPaths) {
    try {
      dpfpdd = koffi.load(p)
      console.log(`[capture] dpfpdd.dll cargada desde: ${p}`)
      return
    } catch (err) {
      console.log(`[capture] No se pudo cargar desde ${p}: ${err.message}`)
    }
  }

  throw new Error('No se pudo cargar dpfpdd.dll de ninguna ubicación. Verifica el driver/SDK de DigitalPersona y el Visual C++ Redistributable x64.')
}

function declararBindings() {
  dpfpdd_init = dpfpdd.func('__stdcall', 'dpfpdd_init', 'int', [])
  dpfpdd_query_devices = dpfpdd.func('__stdcall', 'dpfpdd_query_devices', 'int', [koffi.pointer('uint32'), koffi.pointer(DPFPDD_DEV_INFO)])
  dpfpdd_open = dpfpdd.func('__stdcall', 'dpfpdd_open', 'int', ['str', koffi.out(koffi.pointer(DPFPDD_DEV, 2))])
  dpfpdd_close = dpfpdd.func('__stdcall', 'dpfpdd_close', 'int', [koffi.pointer(DPFPDD_DEV)])
  dpfpdd_get_device_capabilities = dpfpdd.func('__stdcall', 'dpfpdd_get_device_capabilities', 'int', [koffi.pointer(DPFPDD_DEV), koffi.pointer(DPFPDD_DEV_CAPS)])
  dpfpdd_capture = dpfpdd.func('__stdcall', 'dpfpdd_capture', 'int', [
    koffi.pointer(DPFPDD_DEV),
    koffi.pointer(DPFPDD_CAPTURE_PARAM),
    'uint32',
    koffi.inout(koffi.pointer(DPFPDD_CAPTURE_RESULT)),
    koffi.pointer('uint32'),
    koffi.pointer('uint8'),
  ])
}

/**
 * Inicializa la librería dpfpdd UNA SOLA VEZ. Es idempotente:
 * - carga dpfpdd.dll y declara los bindings,
 * - llama dpfpdd_init().
 * No lanza excepciones: guarda el error para reportarlo en capturarHuella().
 * @returns {boolean} true si la librería quedó lista para capturar.
 */
export function inicializarCaptura() {
  if (inicializado) return true

  try {
    if (!dpfpdd) cargarBiblioteca()
    declararBindings()

    const rc = dpfpdd_init()
    if (rc !== DPFPDD_SUCCESS) {
      throw new Error(`dpfpdd_init() falló: ${describirError(rc)}`)
    }

    inicializado = true
    errorInicializacion = null
    console.log('[capture] dpfpdd_init() OK — librería lista para capturar.')
    return true
  } catch (err) {
    inicializado = false
    errorInicializacion = err.message
    console.error(`[capture] Error de inicialización: ${err.message}`)
    return false
  }
}

function obtenerDispositivos() {
  const countBuf = Buffer.alloc(4)

  const rc1 = dpfpdd_query_devices(countBuf, null)
  const count = countBuf.readUInt32LE(0)

  if (count === 0) {
    return []
  }

  if (rc1 !== DPFPDD_SUCCESS && rc1 !== DPFPDD_E_MORE_DATA) {
    throw new Error(`dpfpdd_query_devices() falló: ${describirError(rc1)}`)
  }

  const itemSize = koffi.sizeof(DPFPDD_DEV_INFO)
  const devBuf = Buffer.alloc(itemSize * count)
  for (let i = 0; i < count; i++) {
    devBuf.writeUInt32LE(itemSize, i * itemSize)
  }

  countBuf.writeUInt32LE(count, 0)
  const rc2 = dpfpdd_query_devices(countBuf, devBuf)
  if (rc2 !== DPFPDD_SUCCESS) {
    throw new Error(`dpfpdd_query_devices() (2ª llamada) falló: ${describirError(rc2)}`)
  }

  return koffi.decode(devBuf, DPFPDD_DEV_INFO, count)
}

function abrirDispositivo(devName) {
  const outDev = [null]
  const rc = dpfpdd_open(devName, outDev)
  if (rc !== DPFPDD_SUCCESS) {
    throw new Error(`dpfpdd_open() falló: ${describirError(rc)}`)
  }
  if (!outDev[0]) {
    throw new Error('dpfpdd_open() devolvió un manejador de lector nulo')
  }
  return outDev[0]
}

function cerrarDispositivo(dev) {
  if (!dev) return
  try {
    const rc = dpfpdd_close(dev)
    if (rc !== DPFPDD_SUCCESS) {
      console.warn(`[capture] dpfpdd_close() devolvió: ${describirError(rc)}`)
    }
  } catch (err) {
    console.warn(`[capture] Error al cerrar el lector: ${err.message}`)
  }
}

// Devuelve la resolución nativa del lector (resolutions[0]) o el fallback si no se puede leer.
function obtenerResolucion(dev) {
  try {
    const capBuf = Buffer.alloc(koffi.sizeof(DPFPDD_DEV_CAPS))
    capBuf.writeUInt32LE(koffi.sizeof(DPFPDD_DEV_CAPS), 0)

    const rc = dpfpdd_get_device_capabilities(dev, capBuf)
    if (rc !== DPFPDD_SUCCESS) {
      console.warn(`[capture] No se pudieron leer capacidades del lector (${describirError(rc)}). Usando resolución ${DPI_FALLBACK} DPI.`)
      return DPI_FALLBACK
    }

    const caps = koffi.decode(capBuf, DPFPDD_DEV_CAPS)
    const resoluciones = Array.from(caps.resolutions.slice(0, caps.resolution_cnt || 0))
    console.log(`[capture] Capacidades del lector: resoluciones=${JSON.stringify(resoluciones)}, can_capture_image=${caps.can_capture_image}`)

    if (resoluciones.length > 0) return resoluciones[0]
    return DPI_FALLBACK
  } catch (err) {
    console.warn(`[capture] Error leyendo capacidades (${err.message}). Usando resolución ${DPI_FALLBACK} DPI.`)
    return DPI_FALLBACK
  }
}

function capturarImagen(dev, timeoutMs, dpi) {
  const captureParam = {
    size: koffi.sizeof(DPFPDD_CAPTURE_PARAM),
    image_fmt: DPFPDD_IMG_FMT_PIXEL_BUFFER,
    image_proc: DPFPDD_IMG_PROC_DEFAULT,
    image_res: dpi,
  }

  const captureResult = {
    size: koffi.sizeof(DPFPDD_CAPTURE_RESULT),
    info: { size: koffi.sizeof(DPFPDD_IMAGE_INFO) },
  }

  const sizeBuf = Buffer.alloc(4)
  sizeBuf.writeUInt32LE(MAX_IMAGE_SIZE, 0) // [in] tamaño del buffer imageBuf asignado
  const imageBuf = Buffer.alloc(MAX_IMAGE_SIZE)

  const rc = dpfpdd_capture(dev, captureParam, timeoutMs, captureResult, sizeBuf, imageBuf)
  if (rc !== DPFPDD_SUCCESS) {
    throw new Error(`dpfpdd_capture() falló: ${describirError(rc)}`)
  }

  const { success, quality, score, info } = captureResult

  if (success !== 1) {
    throw new Error(describirCalidad(quality))
  }

  if (info.bpp !== 8) {
    throw new Error(`Formato de imagen inesperado: bpp=${info.bpp} (solo se soporta 8 bits por píxel en escala de grises)`)
  }

  const numPixels = info.width * info.height
  const imageSize = sizeBuf.readUInt32LE(0)
  if (imageSize < numPixels) {
    throw new Error(`Tamaño de imagen insuficiente: se esperaban ${numPixels} bytes, se recibieron ${imageSize}`)
  }

  console.log(`[capture] Huella capturada: ${info.width}x${info.height} @ ${info.res} dpi, bpp=${info.bpp}, score=${score}`)

  return { gray: imageBuf.subarray(0, numPixels), width: info.width, height: info.height }
}

function grayscaleToPngBase64(gray, width, height) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    const g = gray[i]
    const o = i * 4
    png.data[o] = g
    png.data[o + 1] = g
    png.data[o + 2] = g
    png.data[o + 3] = 255
  }
  return PNG.sync.write(png).toString('base64')
}

/**
 * Captura una huella del lector DigitalPersona (síncrona, bloqueante).
 *
 * @param {number} [timeoutMs] Tiempo máximo de espera en ms (por defecto 10s).
 * @returns {Promise<{ imagen: string, dpi: number }>} Imagen PNG base64 (escala de grises)
 *          y la resolución real (DPI) a la que se capturó.
 * @throws {Error} Con mensaje claro si falla la inicialización, no hay lector,
 *                 el lector está ocupado, expira el tiempo o la calidad es mala.
 */
export async function capturarHuella(timeoutMs = TIMEOUT_CAPTURA_MS) {
  if (!inicializarCaptura()) {
    throw new Error(errorInicializacion || 'No se pudo inicializar el lector de huellas')
  }

  const dispositivos = obtenerDispositivos()
  if (dispositivos.length === 0) {
    throw new Error('No se detectó ningún lector de huellas conectado')
  }

  const devName = dispositivos[0].name
  const dev = abrirDispositivo(devName)

  try {
    const dpi = obtenerResolucion(dev)
    const { gray, width, height } = capturarImagen(dev, timeoutMs, dpi)
    const imagen = grayscaleToPngBase64(gray, width, height)
    return { imagen, dpi }
  } finally {
    cerrarDispositivo(dev)
  }
}
