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

// Horarios de inicio de jornada (minutos desde medianoche) — réplica exacta del
// backend/services/asistenciaService.js (HORARIOS_JORNADA): Mañana 06:00, Tarde 12:00, Noche 18:00.
export const HORARIOS_JORNADA = {
  'Mañana': 360,
  'Tarde': 720,
  'Noche': 1080,
}

function parseMinutosDesdeMedianoche(horaMarcacion) {
  if (!horaMarcacion) return null
  if (horaMarcacion instanceof Date) {
    return horaMarcacion.getHours() * 60 + horaMarcacion.getMinutes()
  }
  if (typeof horaMarcacion === 'string') {
    const s = horaMarcacion.trim()
    const esPM = /p\.?\s*m\.?/i.test(s)
    const esAM = /a\.?\s*m\.?/i.test(s)
    const m = s.match(/(\d{1,2}):(\d{1,2})/)
    if (m) {
      let h = parseInt(m[1], 10)
      const min = parseInt(m[2], 10)
      if (esPM && h < 12) h += 12
      if (esAM && h === 12) h = 0
      return h * 60 + min
    }
  }
  return null
}

/**
 * Convierte un valor de fecha/hora en milisegundos de un instante REAL (epoch), o
 * null si no representa un instante válido. Acepta Date, número (epoch ms) o
 * string ISO. Un string de solo hora ("07:15:30") NO es un instante real: devuelve
 * null, y el llamador cae al camino de reconstrucción desde el string.
 * @param {Date|number|string|null} valor
 * @returns {number|null}
 */
function parseInstanteReal(valor) {
  if (valor == null || valor === '') return null
  const ms = valor instanceof Date ? valor.getTime() : new Date(valor).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Calcula el estado de una marcación usando SIEMPRE la hora real de inicio de la
 * clase cuando está disponible (inicioClaseReal). Solo si no hay inicio real
 * (null/undefined) cae al fallback de horario FIJO por jornada (HORARIOS_JORNADA),
 * replicando el wrap de +1440 para jornada Noche del backend.
 *
 * @param {string|Date} horaMarcacion hora de la marcación (solo hora, p. ej. "07:15:30" o "07:15 p. m.")
 * @param {number|string|Date|null} inicioClaseReal hora real de inicio de la clase (ms, ISO o Date), o null
 * @param {string} jornada 'Mañana' | 'Tarde' | 'Noche'
 * @param {number|string|Date|null} [timestampMarcacion=null] instante REAL de la marcación (createdAt
 *        del registro de asistencia). Si viene junto con inicioClaseReal, se usa el camino directo.
 * @returns {{ estado: string, horas: number, texto: string }}
 */
export function calcularEstadoAsistenciaFrontend(horaMarcacion, inicioClaseReal, jornada, timestampMarcacion = null) {
  // ---- Camino 1 (preferido): hay instante REAL de marcación Y de inicio de clase.
  // Diferencia directa entre los dos timestamps, igual que el backend
  // (asistenciaService.calcularEstadoAsistencia): no reconstruye la hora desde el
  // string ni aplica wrap. Un resultado negativo (marcación antes del inicio) se
  // trata como Presente por calcularEstadoPorTiempo, igual que en el backend.
  const marcacionRealMs = timestampMarcacion ? parseInstanteReal(timestampMarcacion) : null
  const inicioRealMs = inicioClaseReal ? parseInstanteReal(inicioClaseReal) : null
  if (marcacionRealMs != null && inicioRealMs != null) {
    const directo = calcularEstadoPorTiempo(calcularMinutosTranscurridos(inicioRealMs, marcacionRealMs))
    return { estado: directo.estado, horas: directo.horasTardanza, texto: directo.tiempoTardanza }
  }

  // ---- Camino 2 (fallback, comportamiento previo intacto): sin instante real de
  // marcación (registros viejos sin createdAt, o marcas de esta sesión todavía en
  // memoria). Reconstruye la marcación desde el string de hora y, si no hay inicio
  // real, cae al horario fijo de jornada con el wrap de Noche.
  const minutosMarcacion = parseMinutosDesdeMedianoche(horaMarcacion)
  if (minutosMarcacion == null) {
    return { estado: 'Presente', horas: 0, texto: '0 horas' }
  }

  let minutos
  if (inicioClaseReal) {
    const inicio = new Date(inicioClaseReal)
    if (Number.isNaN(inicio.getTime())) {
      minutos = 0
    } else {
      // Reconstruye la marcación en la MISMA fecha del inicio de la clase y usa
      // la resta de timestamps completos (igual que el backend), con wrap +1440
      // si el resultado es negativo (cruce de medianoche).
      const marcacionMs = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, minutosMarcacion).getTime()
      minutos = calcularMinutosTranscurridos(inicio.getTime(), marcacionMs)
      if (minutos < 0) minutos += 1440
    }
  } else {
    // Fallback fijo de jornada (último recurso, sin clase activa).
    const inicio = HORARIOS_JORNADA[jornada] ?? HORARIOS_JORNADA['Mañana']
    minutos = minutosMarcacion - inicio
    if (jornada === 'Noche' && minutos < 0) minutos += 1440
  }

  const r = calcularEstadoPorTiempo(minutos)
  return { estado: r.estado, horas: r.horasTardanza, texto: r.tiempoTardanza }
}
