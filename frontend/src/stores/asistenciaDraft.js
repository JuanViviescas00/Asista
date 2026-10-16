import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const PREFIX_DRAFT = 'asista_draft_'
const KEY_COLA_OFFLINE = 'asista_cola_offline_asistencias'

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

  function generarClave(fichaId, fecha) {
    return `${PREFIX_DRAFT}${fichaId}_${fecha}`
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

  /**
   * Guarda un borrador local de la asistencia de una ficha y fecha específica.
   */
  function guardarBorrador(fichaId, fecha, registros) {
    if (!fichaId || !fecha || !registros) return
    const key = generarClave(fichaId, fecha)
    try {
      const payload = {
        fichaId,
        fecha,
        registros,
        updatedAt: Date.now()
      }
      localStorage.setItem(key, JSON.stringify(payload))
    } catch (e) {
      console.warn('[DraftStore] No se pudo guardar borrador local:', e)
    }
  }

  /**
   * Obtiene el borrador guardado para una ficha y fecha, si existe.
   */
  function obtenerBorrador(fichaId, fecha) {
    if (!fichaId || !fecha) return null
    const key = generarClave(fichaId, fecha)
    try {
      const data = localStorage.getItem(key)
      if (!data) return null
      return JSON.parse(data)
    } catch (e) {
      console.warn('[DraftStore] Error al recuperar borrador:', e)
      return null
    }
  }

  /**
   * Elimina el borrador una vez guardado exitosamente en el backend.
   */
  function limpiarBorrador(fichaId, fecha) {
    if (!fichaId || !fecha) return
    const key = generarClave(fichaId, fecha)
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.warn('[DraftStore] Error al limpiar borrador:', e)
    }
  }

  /**
   * Encola un lote de asistencias que no pudieron enviarse por caída de internet.
   */
  function encolarOffline(loteAsistencias) {
    if (!Array.isArray(loteAsistencias) || loteAsistencias.length === 0) return
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
      for (const item of lote.items) {
        try {
          await apiService.asistencias.create(item)
          procesadosExitosos++
        } catch (err) {
          console.error('[DraftStore] Error al sincronizar asistencia offline:', err)
          loteCompletado = false
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
    guardarBorrador,
    obtenerBorrador,
    limpiarBorrador,
    encolarOffline,
    sincronizarColaOffline
  }
})
