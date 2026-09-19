// Umbrales de tardanza medidos en MINUTOS desde la hora de inicio de la clase.
// Deben coincidir con backend/services/asistenciaService.js.
export const TOLERANCIA_MINUTOS = 5
export const LIMITE_TARDANZA_1_HORA = 65
export const LIMITE_TARDANZA_2_HORAS = 125

/**
 * Calcula los minutos transcurridos entre la hora de inicio de la clase y el
 * instante de la marcación.
 * @param {number|string|Date} inicioMs
 * @param {number} [ahoraMs=Date.now()]
 * @returns {number}
 */
export function calcularMinutosTranscurridos(inicioMs, ahoraMs = Date.now()) {
  const inicio = inicioMs ? new Date(inicioMs).getTime() : ahoraMs
  return Math.floor((ahoraMs - inicio) / 60000)
}

/**
 * Devuelve el estado de una marcación según los minutos transcurridos desde el
 * inicio de la clase.
 * @param {number} minutosTranscurridos
 * @returns {{ estado: 'Presente'|'Tardanza'|'Falta', horasTardanza: number, tiempoTardanza: string }}
 */
export function calcularEstadoPorTiempo(minutosTranscurridos) {
  if (minutosTranscurridos < 0 || minutosTranscurridos <= TOLERANCIA_MINUTOS) {
    return { estado: 'Presente', horasTardanza: 0, tiempoTardanza: '0 horas' }
  }
  if (minutosTranscurridos <= LIMITE_TARDANZA_1_HORA) {
    return { estado: 'Tardanza', horasTardanza: 1, tiempoTardanza: '1 hora' }
  }
  if (minutosTranscurridos <= LIMITE_TARDANZA_2_HORAS) {
    return { estado: 'Tardanza', horasTardanza: 2, tiempoTardanza: '2 horas' }
  }
  return { estado: 'Falta', horasTardanza: 0, tiempoTardanza: '0 horas' }
}
