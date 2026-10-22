import { calcularDiasHabilesTranscurridos, DIAS_HABILES_VENTANA_EXCUSA } from './diasHabiles.js'

/**
 * Calcula el estado de carga de una inasistencia (ciclo EN_ESPERA ->
 * LISTO_PARA_SUBIR -> SUBIDA). Nunca devuelve 'SUBIDA': ese estado solo lo
 * asigna el proceso de subida a Sofía Plus.
 *
 * Reglas:
 * - 'Excusada' -> 'LISTO_PARA_SUBIR' (se envía de inmediato como justificada).
 * - 'Falta' / 'Tardanza' -> 'LISTO_PARA_SUBIR' si ya venció la ventana de excusa
 *   (calcularDiasHabilesTranscurridos >= DIAS_HABILES_VENTANA_EXCUSA + 1);
 *   en caso contrario 'EN_ESPERA'.
 *
 * @param {object} params
 * @param {string} params.fecha 'YYYY-MM-DD'
 * @param {string} params.tipo 'Falta' | 'Tardanza' | 'Excusada'
 * @param {string} params.jornada 'Mañana' | 'Tarde' | 'Noche' | 'Mixta'
 * @param {Set<string>} params.festivosSet Set de 'YYYY-MM-DD'
 * @param {string} params.hoyStr 'YYYY-MM-DD' (obligatorio)
 * @returns {'EN_ESPERA' | 'LISTO_PARA_SUBIR'}
 */
export function calcularEstadoCarga({ fecha, tipo, jornada = '', festivosSet = new Set(), hoyStr }) {
  if (tipo === 'Excusada') return 'LISTO_PARA_SUBIR'

  const diasHabiles = calcularDiasHabilesTranscurridos(fecha, festivosSet, hoyStr, jornada)
  if (diasHabiles >= DIAS_HABILES_VENTANA_EXCUSA + 1) return 'LISTO_PARA_SUBIR'

  return 'EN_ESPERA'
}
