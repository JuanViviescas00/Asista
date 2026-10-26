export const DESCRIPCION_MAX = 200 // el bot de Sofía Plus recorta a 200
export const TEXTO_EXCUSA_DEFECTO = 'Con excusa'
export const TEXTO_SIN_EXCUSA_DEFECTO = 'Sin excusa'

export function normalizarDescripcion(valor) {
  return String(valor ?? '').trim().slice(0, DESCRIPCION_MAX)
}

export function textoJustificacion(a) {
  const descripcion = String(a?.descripcion ?? '').trim()
  if (descripcion) return descripcion
  if (a.tipo === 'Excusada') return TEXTO_EXCUSA_DEFECTO
  return TEXTO_SIN_EXCUSA_DEFECTO
}
