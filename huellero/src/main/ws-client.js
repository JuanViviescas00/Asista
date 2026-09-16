// huellero/src/main/ws-client.js
//
// Cliente WebSocket del huellero hacia el backend central (socket.io).
//
// Responsabilidades:
//   1. Conectar/reconectar con el backend usando config ({ wsUrl/backendUrl, deviceId, token }).
//   2. Autenticarse enviando HELLO { deviceId, token } como primer mensaje tras cada conexión.
//   3. Despachar mensajes entrantes del backend (ACTIVATE / DEACTIVATE) a callbacks registrables.
//   4. Reconexión automática con backoff exponencial (2s inicial → tope 60s), sin tumbar el proceso.
//   5. Exponer un singleton (default export) con: connect, isConnected, onActivate,
//      onDeactivate, onConnectionChange, send.
//
// NOTA: usa socket.io-client (ya es dependencia del huellero); el backend es un servidor
// socket.io (backend/services/socketService.js), no WebSocket crudo.
//
// NO gestiona sincronización de asistencias pendientes: eso es sync.js.

import { io } from 'socket.io-client'
import { obtenerHardwareFingerprint } from './hardware-fingerprint.js'

// ---------------------------------------------------------------------------
// Estado del singleton
// ---------------------------------------------------------------------------
let socket = null
let connected = false
let currentConfig = null
let ultimoRechazo = null // { code, message, at } del último HELLO_RECHAZADO

const activateHandlers = []
const deactivateHandlers = []
const connectionChangeHandlers = []

// ---------------------------------------------------------------------------
// Reintento manual tras "io server disconnect"
// ---------------------------------------------------------------------------
// socket.io NO reconecta automáticamente cuando la desconexión la inicia el
// servidor (reason === "io server disconnect"). El backend hace
// socket.disconnect(true) al rechazar un HELLO (PENDING_APPROVAL,
// INVALID_TOKEN, HARDWARE_MISMATCH, ...), así que el socket queda inactivo
// (socket.active === false) y la app se queda "muerta" hasta un reinicio.
// Aquí programamos la reconexión manualmente (socket.connect()) con backoff.
const RECONEXION_DELAY_BASE = 2000
const RECONEXION_DELAY_MAX = 60000
// Para HARDWARE_MISMATCH (posible copia de identidad) el problema probablemente
// no se resuelve solo; reintentamos con un intervalo fijo mucho más largo para
// no saturar el backend con intentos inútiles.
const RECONEXION_HARDWARE_MISMATCH = 10 * 60 * 1000 // 10 minutos

let reintentoManualTimer = null
let reintentoManualDelay = RECONEXION_DELAY_BASE

function cancelarReintentoManual() {
  if (reintentoManualTimer) {
    clearTimeout(reintentoManualTimer)
    reintentoManualTimer = null
  }
}

function programarReintentoManual() {
  if (!socket || reintentoManualTimer) return
  const esHardwareMismatch = ultimoRechazo?.code === 'HARDWARE_MISMATCH'
  const delay = esHardwareMismatch ? RECONEXION_HARDWARE_MISMATCH : reintentoManualDelay
  log(`Reintentando conexión en ${delay}ms (motivo: ${ultimoRechazo?.code || 'server disconnect'})`)
  reintentoManualTimer = setTimeout(() => {
    reintentoManualTimer = null
    if (socket) socket.connect()
  }, delay)
  // El backoff exponencial solo crece para rechazos recuperables; para
  // HARDWARE_MISMATCH usamos el intervalo fijo definido arriba.
  if (!esHardwareMismatch) {
    reintentoManualDelay = Math.min(reintentoManualDelay * 2, RECONEXION_DELAY_MAX)
  }
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------
function log(...args) {
  console.log('[ws-client]', ...args)
}

function logError(...args) {
  console.error('[ws-client]', ...args)
}

// Actualiza el estado de conexión y notifica a los suscriptores (solo si cambió).
function setConnected(value) {
  if (connected === value) return
  connected = value
  connectionChangeHandlers.forEach((fn) => {
    try {
      fn(value)
    } catch (err) {
      logError('Error en onConnectionChange:', err.message)
    }
  })
}

// Normaliza un payload entrante. Por robustez acepta objetos o strings JSON;
// un JSON malformado jamás tumba el proceso (se devuelve {}).
function normalizarPayload(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch (err) {
      logError('Payload JSON malformado ignorado:', err.message)
      return {}
    }
  }
  return payload && typeof payload === 'object' ? payload : {}
}

function despachar(handlers, payload, evento) {
  const data = normalizarPayload(payload)
  handlers.forEach((fn) => {
    try {
      fn(data)
    } catch (err) {
      logError(`Error en handler de ${evento}:`, err.message)
    }
  })
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Conecta (o reconecta) al backend.
 * @param {Object} config { deviceId, token, wsUrl, backendUrl }
 */
export function connect(config) {
  currentConfig = config || {}

  // Se crea un socket nuevo: limpia cualquier reintento manual pendiente y
  // reinicia el backoff.
  cancelarReintentoManual()
  reintentoManualDelay = RECONEXION_DELAY_BASE

  const { deviceId, token, wsUrl, backendUrl } = currentConfig

  if (!deviceId || !token) {
    logError('connect() ignorado: faltan deviceId/token.')
    setConnected(false)
    return
  }

  const url = wsUrl || (backendUrl ? backendUrl.replace(/\/+$/, '') : undefined)
  if (!url) {
    logError('connect() ignorado: falta wsUrl/backendUrl.')
    setConnected(false)
    return
  }

  // Evita sockets duplicados: desconecta el anterior antes de crear uno nuevo.
  if (socket) {
    socket.disconnect()
    socket = null
  }

  socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    // Backoff exponencial: 2s inicial, duplicando hasta un tope de 60s.
    reconnectionDelay: 2000,
    reconnectionDelayMax: 60000,
    randomizationFactor: 0.5,
  })

  socket.on('connect', () => {
    log(`Conectado a ${url}`)
    // Autenticación: primer mensaje tras (re)conectar. El fingerprint se calcula
    // en runtime (no se persiste en config.json) para no hacerlo copiable.
    socket.emit('HELLO', {
      deviceId: String(deviceId),
      token: String(token),
      hardwareFingerprint: obtenerHardwareFingerprint(),
    })
    setConnected(true)
  })

  socket.on('disconnect', (reason) => {
    log(`Desconectado (${reason})`)
    setConnected(false)
    // "io server disconnect" significa que el servidor cerró la conexión
    // (p.ej. HELLO rechazado). socket.io NO reintenta solo en este caso,
    // así que lo programamos manualmente.
    if (reason === 'io server disconnect') {
      programarReintentoManual()
    } else {
      // Para el resto de razones (transport close, ping timeout, ...) socket.io
      // reconecta automáticamente; solo limpiamos cualquier reintento manual
      // pendiente para no duplicar intentos.
      cancelarReintentoManual()
    }
  })

  socket.on('connect_error', (err) => {
    logError('Error de conexión:', err.message)
  })

  // El backend rechazó el HELLO (aprobación pendiente, token inválido, etc.).
  // Guardamos la razón para mostrarla en el kiosko en vez del genérico "Sin conexión".
  socket.on('HELLO_RECHAZADO', (data) => {
    ultimoRechazo = {
      code: data?.code || 'UNKNOWN',
      message: data?.message || 'Conexión rechazada por el servidor.',
      at: Date.now(),
    }
    log('HELLO rechazado:', ultimoRechazo.code, '-', ultimoRechazo.message)
    setConnected(false)
  })

  socket.on('ACTIVATE', (payload) => {
    ultimoRechazo = null // HELLO aceptado (la reconciliación siempre responde)
    reintentoManualDelay = RECONEXION_DELAY_BASE // reinicia backoff manual
    log('ACTIVATE recibido:', payload)
    despachar(activateHandlers, payload, 'onActivate')
  })

  socket.on('DEACTIVATE', (payload) => {
    ultimoRechazo = null // HELLO aceptado (la reconciliación siempre responde)
    reintentoManualDelay = RECONEXION_DELAY_BASE // reinicia backoff manual
    log('DEACTIVATE recibido:', payload)
    despachar(deactivateHandlers, payload, 'onDeactivate')
  })
}

/**
 * ¿Hay una conexión activa en este momento?
 * @returns {boolean}
 */
export function isConnected() {
  return connected
}

/**
 * Último rechazo del HELLO, o null si la última conexión fue aceptada.
 * @returns {{ code: string, message: string, at: number } | null}
 */
export function getUltimoRechazo() {
  return ultimoRechazo
}

/**
 * Registra un callback para el mensaje ACTIVATE.
 * @param {(payload: { fichaId, instructorId, claseId? }) => void} fn
 * @returns {() => void} función para desuscribir
 */
export function onActivate(fn) {
  if (typeof fn === 'function') activateHandlers.push(fn)
  return () => {
    const i = activateHandlers.indexOf(fn)
    if (i >= 0) activateHandlers.splice(i, 1)
  }
}

/**
 * Registra un callback para el mensaje DEACTIVATE.
 * @param {(payload: { fichaId, claseId? }) => void} fn
 * @returns {() => void} función para desuscribir
 */
export function onDeactivate(fn) {
  if (typeof fn === 'function') deactivateHandlers.push(fn)
  return () => {
    const i = deactivateHandlers.indexOf(fn)
    if (i >= 0) deactivateHandlers.splice(i, 1)
  }
}

/**
 * Registra un callback que se invoca en cada cambio de estado de conexión.
 * @param {(conectado: boolean) => void} fn
 * @returns {() => void} función para desuscribir
 */
export function onConnectionChange(fn) {
  if (typeof fn === 'function') connectionChangeHandlers.push(fn)
  return () => {
    const i = connectionChangeHandlers.indexOf(fn)
    if (i >= 0) connectionChangeHandlers.splice(i, 1)
  }
}

/**
 * Envía un mensaje saliente al backend (para mensajes futuros: acks, etc.).
 * @param {string} type nombre del evento
 * @param {any} payload cuerpo del mensaje
 * @returns {boolean} true si se encoló, false si no hay conexión
 */
export function send(type, payload) {
  if (!socket || !connected) {
    logError(`send('${type}') ignorado: socket no conectado`)
    return false
  }
  socket.emit(type, payload)
  return true
}

// ---------------------------------------------------------------------------
// Singleton exportado por defecto
// ---------------------------------------------------------------------------
const wsClient = {
  connect,
  isConnected,
  getUltimoRechazo,
  onActivate,
  onDeactivate,
  onConnectionChange,
  send,
}

export default wsClient

/*
// ─── Ejemplo de uso ────────────────────────────────────────────────────────
import wsClient from './ws-client.js'

wsClient.onConnectionChange((conectado) => {
  console.log('Estado de conexión:', conectado ? 'online' : 'offline')
})

wsClient.onActivate(({ fichaId, instructorId, claseId }) => {
  console.log('Clase activada:', { fichaId, instructorId, claseId })
})

wsClient.onDeactivate(({ fichaId, claseId }) => {
  console.log('Clase desactivada:', { fichaId, claseId })
})

wsClient.connect({ deviceId: '...', token: '...', wsUrl: 'ws://localhost:3000' })

// mensaje saliente futuro:
wsClient.send('ACTIVATED', { fichaId: '...', claseId: '...' })

console.log('¿Conectado?', wsClient.isConnected())
// ───────────────────────────────────────────────────────────────────────────
*/
