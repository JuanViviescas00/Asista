// huellero/src/main/scheduler.js
//
// Disparador de sincronización periódica de asistencias pendientes.
//
// Dos mecanismos:
//   1. Obligatorio a las 00:00 (hora local): una pasada de syncPendientes().
//   2. Polling periódico (5 min) mientras queden pendientes y el último intento
//      no haya logrado vaciar la cola. Se detiene solo cuando no hay pendientes.
//
// Además, dispara un intento inmediato:
//   - al reconectarse el WebSocket con pendientes (wsClient.onConnectionChange),
//   - al generarse un nuevo pendiente (notificarPendienteNuevo(), llamado desde engine.js).
//
// No acumula timers: usa setTimeout re-programado en base a la hora real, y un
// guard `syncing` evita sincronizaciones solapadas.

import { syncPendientes } from './sync.js'
import * as store from './store.js'
import wsClient from './ws-client.js'

const POLLING_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

let midnightTimer = null
let pollingTimer = null
let pollingActivo = false
let syncing = false
let iniciado = false

export async function sincronizar() {
  if (syncing) return
  syncing = true
  try {
    await syncPendientes()
    // Tras el intento, decidir según lo que quede en la cola local.
    if (store.getPendientes().length === 0) {
      detenerPolling()
    } else {
      iniciarPolling()
    }
  } catch (err) {
    console.error('[scheduler] Error inesperado en sincronización:', err.message)
    iniciarPolling()
  } finally {
    syncing = false
  }
}

function iniciarPolling() {
  if (pollingActivo) return
  pollingActivo = true
  console.log(`[scheduler] Polling iniciado (cada ${POLLING_INTERVAL_MS / 60000} min).`)
  programarTick()
}

function programarTick() {
  pollingTimer = setTimeout(async () => {
    await sincronizar()
    if (pollingActivo) programarTick()
  }, POLLING_INTERVAL_MS)
}

function detenerPolling() {
  if (!pollingActivo) return
  pollingActivo = false
  if (pollingTimer) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
  console.log('[scheduler] Polling detenido (sin pendientes).')
}

function programarMediaNoche() {
  const ahora = new Date()
  const siguiente = new Date(ahora)
  siguiente.setHours(24, 0, 0, 0)
  const ms = siguiente.getTime() - ahora.getTime()

  midnightTimer = setTimeout(() => {
    console.log('[scheduler] Medianoche: sincronización obligatoria.')
    sincronizar()
    programarMediaNoche()
  }, ms)

  console.log(`[scheduler] Próxima sincronización obligatoria en ~${Math.round(ms / 60000)} min.`)
}

/**
 * Inicia el scheduler (idempotente). Programar la medianoche y enganchar la
 * señal de reconexión para intentar sincronizar de inmediato si hay pendientes.
 */
export function iniciarScheduler() {
  if (iniciado) return
  iniciado = true

  programarMediaNoche()

  wsClient.onConnectionChange((conectado) => {
    if (conectado && store.getPendientes().length > 0) {
      console.log('[scheduler] Reconexión con pendientes: sincronizando de inmediato.')
      sincronizar()
    }
  })

  console.log('[scheduler] Scheduler iniciado.')
}

/**
 * Se llama cuando se guarda un nuevo pendiente localmente, para intentar
 * sincronizarlo pronto sin esperar al siguiente tick de polling.
 */
export function notificarPendienteNuevo() {
  sincronizar()
}
