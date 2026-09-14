import { getConfig } from './config.js'
import * as store from './store.js'

// Sincroniza las asistencias pendientes (guardadas localmente offline) con el
// backend vía POST /api/asistencias/sync. Idempendientes por uuid en el backend.
//
// NOTA: el disparador periódico (cron de las 12:00 AM / polling) se decide en otro
// archivo (scheduler.js); esta función solo hace UNA pasada.

export async function syncPendientes() {
  const pendientes = store.getPendientes()

  // 1. Sin pendientes: no se hace ninguna petición HTTP.
  if (!pendientes || pendientes.length === 0) {
    return { ok: true, procesados: 0 }
  }

  const { backendUrl, deviceId, token } = getConfig()
  if (!deviceId || !token) {
    console.error('[sync] Sin deviceId/token: no se puede sincronizar todavía.')
    return { ok: false, error: 'Dispositivo no registrado aún' }
  }

  // 2. POST al endpoint de sincronización (timeout 10s, mismo patrón que el resto).
  let res
  try {
    res = await fetch(`${backendUrl}/api/asistencias/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, token, asistencias: pendientes }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    // 3. Fallo de red/timeout: no se pierde nada, todos los pendientes quedan intactos.
    console.error('[sync] Error de red al sincronizar:', err.message)
    return { ok: false, error: 'Sin conexión: no se pudo sincronizar' }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    console.error(`[sync] Backend respondió ${res.status}:`, data?.error || res.statusText)
    return { ok: false, error: data?.error || `Error del backend (${res.status})` }
  }

  const data = await res.json().catch(() => null)
  if (!data || !data.ok || !Array.isArray(data.resultados)) {
    console.error('[sync] Respuesta inesperada del backend:', data)
    return { ok: false, error: 'Respuesta inesperada del backend' }
  }

  // 4. Recorrer resultados: 'guardada'/'duplicada' se quitan de la cola; 'error' queda.
  let guardadas = 0
  let duplicadas = 0
  let errores = 0
  const uuidsConfirmados = []

  for (const r of data.resultados) {
    if (r.estado === 'guardada') {
      guardadas++
      uuidsConfirmados.push(r.uuid)
    } else if (r.estado === 'duplicada') {
      duplicadas++
      uuidsConfirmados.push(r.uuid)
    } else {
      errores++
      console.warn(`[sync] Pendiente ${r.uuid} no sincronizado: ${r.error || r.estado}`)
    }
  }

  // Elimina de la cola local solo lo que el backend confirmó.
  try {
    store.marcarSincronizadas(uuidsConfirmados)
  } catch (err) {
    console.error('[sync] Error al limpiar pendientes sincronizados:', err.message)
  }

  const pendientesRestantes = store.getPendientes().length

  console.log(
    `[sync] ${guardadas} guardadas, ${duplicadas} duplicadas, ${errores} con error. Pendientes restantes: ${pendientesRestantes}`
  )

  // 5. Resumen.
  return { ok: true, guardadas, duplicadas, errores, pendientesRestantes }
}
