// ============================================================
// useSistemaEstado — monitorea en tiempo real la conexión con
// el servidor (backend) vía WebSocket para pintar el indicador
// ("ojito") del panel lateral.
//
// Colores del indicador:
//   verde    -> conectado al servidor
//   amarillo -> sin conexión o reconectando al servidor
//
// NOTA: desde el navegador NO es posible conocer el estado del
// lector físico (vive en la app de escritorio del kiosco), por lo
// que este composable ya no intenta detectarlo.
// ============================================================
import { reactive, computed, onMounted, onUnmounted } from 'vue'
import { socket } from '../services/index.js'

export function useSistemaEstado() {
  const estadoSistema = reactive({
    colorEstado: socket.connected ? 'verde' : 'amarillo',
  })

  function actualizar() {
    estadoSistema.colorEstado = socket.connected ? 'verde' : 'amarillo'
  }

  const textoEstado = computed(() => {
    if (estadoSistema.colorEstado === 'verde') return 'Conectado al servidor'
    return 'Sin conexión con el servidor'
  })

  function colorEstadoClass(color) {
    return color === 'verde' ? 'ojo-verde' : 'ojo-amarillo'
  }

  onMounted(() => {
    socket.on('connect', actualizar)
    socket.on('disconnect', actualizar)
    socket.on('connect_error', actualizar)
    actualizar()
  })

  onUnmounted(() => {
    socket.off('connect', actualizar)
    socket.off('disconnect', actualizar)
    socket.off('connect_error', actualizar)
  })

  return { estadoSistema, textoEstado, colorEstadoClass }
}
