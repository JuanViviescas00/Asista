import { reactive } from 'vue'

// Estado global (singleton) compartido entre ModalConfirmacion.vue y todos
// los llamadores. No depende de ninguna instancia de componente.
const estado = reactive({
  abierto: false,
  titulo: '',
  mensaje: '',
  textoConfirmar: 'Confirmar',
  textoCancelar: 'Cancelar',
  peligro: false,
})

let resolverActual = null

/**
 * Abre el modal de confirmación y devuelve una Promise<boolean>.
 * Se resuelve en true si el usuario confirma y en false si cancela
 * (botón cancelar, clic fuera o tecla Escape).
 */
export function confirmar(opciones = {}) {
  const {
    titulo = '',
    mensaje = '',
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Cancelar',
    peligro = false,
  } = opciones

  // Si ya hay un modal abierto, se cierra el anterior como cancelado.
  if (estado.abierto && resolverActual) {
    const anterior = resolverActual
    resolverActual = null
    anterior(false)
  }

  estado.titulo = titulo
  estado.mensaje = mensaje
  estado.textoConfirmar = textoConfirmar
  estado.textoCancelar = textoCancelar
  estado.peligro = !!peligro
  estado.abierto = true

  return new Promise((resolve) => {
    resolverActual = resolve
  })
}

export function useConfirmState() {
  return estado
}

export function aceptarConfirmacion() {
  const resolver = resolverActual
  resolverActual = null
  estado.abierto = false
  if (resolver) resolver(true)
}

export function cancelarConfirmacion() {
  const resolver = resolverActual
  resolverActual = null
  estado.abierto = false
  if (resolver) resolver(false)
}
