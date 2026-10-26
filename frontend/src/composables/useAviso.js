import { reactive } from 'vue'

// Estado global (singleton) de las notificaciones flotantes.
const estado = reactive({
  abierto: false,
  mensaje: '',
  tipo: 'info', // success | error | warning | info
})

let timer = null

/**
 * Muestra un aviso flotante no bloqueante. Se oculta solo a los 4 s
 * (6 s si es de tipo 'error').
 */
export function mostrarAviso(mensaje, tipo = 'info') {
  if (timer) clearTimeout(timer)
  estado.mensaje = mensaje || ''
  estado.tipo = tipo || 'info'
  estado.abierto = true
  const duracion = tipo === 'error' ? 6000 : 4000
  timer = setTimeout(() => {
    estado.abierto = false
  }, duracion)
}

export function cerrarAviso() {
  if (timer) clearTimeout(timer)
  estado.abierto = false
}

export function useAvisoState() {
  return estado
}
