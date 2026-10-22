/**
 * Utilidades de formateo y estandarización de texto para el backend.
 */

/**
 * Convierte un texto a Capitalize / Title Case.
 * Ejemplo: "JUAN CARLOS PÉREZ" -> "Juan Carlos Pérez"
 *          "maría de los ángeles" -> "María De Los Ángeles"
 *          "gómez-restrepo" -> "Gómez-Restrepo"
 * @param {string} str Texto a capitalizar
 * @returns {string} Texto formateado
 */
export function capitalizarTexto(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(palabra => {
      if (!palabra) return ''
      return palabra
        .split('-')
        .map(p => p ? p.charAt(0).toUpperCase() + p.slice(1) : '')
        .join('-')
    })
    .join(' ')
}
