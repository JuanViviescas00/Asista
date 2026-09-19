// ============================================================
// useSistemaEstado — monitorea en tiempo real el estado del
// backend (WebSocket/API) y del lector USB (huellero) para
// pintar el indicador ("ojito") del panel lateral.
//
// Colores del indicador:
//   verde   -> todo conectado correctamente
//   amarillo-> problema con el WebSocket / servidor
//   rojo    -> huellero (lector) desconectado
// ============================================================
import { reactive, computed, onMounted, onUnmounted } from 'vue'
import { socket } from '../services/index.js'

export function useSistemaEstado() {
  const estadoSistema = reactive({
    estadoWebSocket: 'Desconectado',
    estadoLectorUSB: 'Desconectado',
    colorEstado: 'rojo',
  })

  let statusInterval = null
  let fpSdkCheck = null

  async function verificarEstadoRealSistema() {
    // 1. Verificar conexión real con el servidor (socket.io principal de la app)
    estadoSistema.estadoWebSocket = socket.connected ? 'Conectado' : 'Desconectado'

    // 2. Verificar Lector USB Físico (huellero) vía SDK
    if (typeof Fingerprint !== 'undefined') {
      try {
        if (!fpSdkCheck) {
          fpSdkCheck = new Fingerprint.WebApi()
        }
        const readers = await fpSdkCheck.enumerateDevices()
        estadoSistema.estadoLectorUSB = readers && readers.length > 0 ? 'Conectado' : 'Desconectado'
      } catch (e) {
        estadoSistema.estadoLectorUSB = 'Desconectado'
      }
    } else {
      estadoSistema.estadoLectorUSB = 'Desconectado'
    }

    // 3. Color del indicador (ojito)
    if (estadoSistema.estadoWebSocket !== 'Conectado') {
      estadoSistema.colorEstado = 'amarillo' // problema con el WebSocket/servidor
    } else if (estadoSistema.estadoLectorUSB !== 'Conectado') {
      estadoSistema.colorEstado = 'rojo' // huellero desconectado
    } else {
      estadoSistema.colorEstado = 'verde' // conectado correctamente
    }
  }

  const textoEstado = computed(() => {
    if (estadoSistema.colorEstado === 'verde') return 'Conectado correctamente'
    if (estadoSistema.colorEstado === 'amarillo') return 'Problema con el WebSocket / servidor'
    return 'Huellero desconectado'
  })

  function colorEstadoClass(color) {
    if (color === 'verde') return 'ojo-verde'
    if (color === 'amarillo') return 'ojo-amarillo'
    return 'ojo-rojo'
  }

  onMounted(() => {
    verificarEstadoRealSistema()
    statusInterval = setInterval(verificarEstadoRealSistema, 3000)
  })

  onUnmounted(() => {
    if (statusInterval) clearInterval(statusInterval)
  })

  return { estadoSistema, textoEstado, colorEstadoClass }
}
