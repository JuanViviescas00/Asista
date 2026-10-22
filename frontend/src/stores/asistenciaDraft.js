import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEY_COLA_OFFLINE = 'asista_cola_offline_asistencias'
const PREFIX_DRAFT_LEGACY = 'asista_draft_'

// Al arrancar la app se eliminan las claves de borradores legacy (el sistema de
// borradores ya no se usa). Se conserva intacta la clave de la cola offline.
function limpiarBorradoresLegacy() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const claves = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(PREFIX_DRAFT_LEGACY)) claves.push(key)
    }
    for (const key of claves) window.localStorage.removeItem(key)
  } catch (e) {
    console.warn('[DraftStore] Error al limpiar borradores legacy:', e)
  }
}
limpiarBorradoresLegacy()

export const useAsistenciaDraftStore = defineStore('asistenciaDraft', () => {
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const colaOffline = ref(cargarColaOffline())
  const sincronizando = ref(false)

  // Escuchar eventos de conectividad del navegador
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      isOnline.value = true
    })
    window.addEventListener('offline', () => {
      isOnline.value = false
    })
  }

  function cargarColaOffline() {
    try {
      const data = localStorage.getItem(KEY_COLA_OFFLINE)
      return data ? JSON.parse(data) : []
    } catch (e) {
      console.warn('[DraftStore] Error al leer cola offline:', e)
      return []
    }
  }

  function persistirColaOffline() {
    try {
      localStorage.setItem(KEY_COLA_OFFLINE, JSON.stringify(colaOffline.value))
    } catch (e) {
      console.error('[DraftStore] Error al guardar cola offline:', e)
    }
  }

  function claveItem(item) {
    return `${String(item.estudianteId)}|${String(item.fichaId)}|${item.fecha}`
  }

  /**
   * Elimina de la cola offline cualquier item con la misma clave (aprendiz + ficha + fecha).
   */
  function quitarDeColaOffline(estudianteId, fichaId, fecha) {
    if (!estudianteId || !fichaId || !fecha) return
    const clave = `${String(estudianteId)}|${String(fichaId)}|${fecha}`
    let cambiado = false
    for (const lote of colaOffline.value) {
      const antes = lote.items.length
      lote.items = lote.items.filter(it => claveItem(it) !== clave)
      if (lote.items.length !== antes) cambiado = true
    }
    colaOffline.value = colaOffline.value.filter(lote => lote.items.length > 0)
    if (cambiado) persistirColaOffline()
  }

  /**
   * Encola un lote de asistencias que no pudieron enviarse por caída de internet.
   * Reemplaza cualquier item previo con la misma clave (aprendiz + ficha + fecha).
   */
  function encolarOffline(loteAsistencias) {
    if (!Array.isArray(loteAsistencias) || loteAsistencias.length === 0) return
    const claves = new Set(loteAsistencias.map(claveItem))
    for (const lote of colaOffline.value) {
      lote.items = lote.items.filter(it => !claves.has(claveItem(it)))
    }
    colaOffline.value = colaOffline.value.filter(lote => lote.items.length > 0)
    colaOffline.value.push({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      items: loteAsistencias
    })
    persistirColaOffline()
  }

  /**
   * Intenta sincronizar los lotes pendientes con el backend cuando hay internet.
   */
  async function sincronizarColaOffline(apiService) {
    if (!isOnline.value || sincronizando.value || colaOffline.value.length === 0) {
      return { totalSincronizados: 0, pendientesRestantes: colaOffline.value.length }
    }

    sincronizando.value = true
    let procesadosExitosos = 0
    const nuevaCola = []

    for (const lote of colaOffline.value) {
      let loteCompletado = true
      for (let i = 0; i < lote.items.length; i++) {
        const item = lote.items[i]
        try {
          await apiService.asistencias.create(item)
          procesadosExitosos++
        } catch (err) {
          if (err.status === 409) {
            continue
          }
          console.error('[DraftStore] Error al sincronizar asistencia offline:', err)
          loteCompletado = false
          lote.items = lote.items.slice(i)
          break
        }
      }
      if (!loteCompletado) {
        nuevaCola.push(lote)
      }
    }

    colaOffline.value = nuevaCola
    persistirColaOffline()
    sincronizando.value = false

    return {
      totalSincronizados: procesadosExitosos,
      pendientesRestantes: colaOffline.value.length
    }
  }

  const pendientesOfflineCount = computed(() => {
    return colaOffline.value.reduce((acc, lote) => acc + (lote.items?.length || 0), 0)
  })

  return {
    isOnline,
    sincronizando,
    colaOffline,
    pendientesOfflineCount,
    quitarDeColaOffline,
    encolarOffline,
    sincronizarColaOffline
  }
})
