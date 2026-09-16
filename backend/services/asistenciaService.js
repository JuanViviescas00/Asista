import mongoose from 'mongoose'
import Ficha from '../models/Ficha.js'

/**
 * Retorna la fecha actual local en formato YYYY-MM-DD
 */
export function getHoyString() {
  const ahora = new Date()
  const offsetMs = ahora.getTimezoneOffset() * 60000
  const localDate = new Date(ahora.getTime() - offsetMs)
  return localDate.toISOString().split('T')[0]
}

/**
 * Obtiene lista de ObjectIds compatibles buscando por _id o por codigoFicha
 */
export async function getFichaIdList(fichaId) {
  if (!fichaId) return []
  const ids = []
  if (mongoose.Types.ObjectId.isValid(fichaId)) {
    ids.push(new mongoose.Types.ObjectId(fichaId))
  }
  try {
    const queryFicha = []
    if (mongoose.Types.ObjectId.isValid(fichaId)) {
      queryFicha.push({ _id: fichaId })
    }
    queryFicha.push({ codigoFicha: String(fichaId).trim() })
    const fichaDoc = await Ficha.findOne({ $or: queryFicha })
    if (fichaDoc) {
      const docId = fichaDoc._id
      if (!ids.some(id => String(id) === String(docId))) {
        ids.push(docId)
      }
    }
  } catch (e) {}
  return ids
}

// Umbrales de tardanza medidos en MINUTOS desde la hora de inicio de la clase.
// Regla del negocio:
//   0 a 5 min  -> Presente (a tiempo)
//   5 a 65 min -> Tardanza de 1 hora
//   65 a 125 min -> Tardanza de 2 horas
//   más de 125 min -> Falta (asistencia fallida)
export const TOLERANCIA_MINUTOS = 5
export const LIMITE_TARDANZA_1_HORA = 65
export const LIMITE_TARDANZA_2_HORAS = 125

/**
 * Calcula el estado de una marcación (Presente / Tardanza / Falta) según los
 * minutos transcurridos desde la hora de inicio de la clase (`inicioClase`).
 *
 * Devuelve un objeto con:
 *   - estado: 'Presente' | 'Tardanza' | 'Falta'
 *   - horasTardanza: número de horas de retraso (0 si no aplica)
 *   - tiempoTardanza: texto legible del retraso ('0 horas', '1 hora', '2 horas')
 */
export function calcularEstadoAsistencia(inicioClase, fechaHora = new Date()) {
  const inicioMs = inicioClase ? new Date(inicioClase).getTime() : Date.now()
  const marcacionMs = fechaHora ? new Date(fechaHora).getTime() : Date.now()

  const minutos = Math.floor((marcacionMs - inicioMs) / 60000)

  if (minutos < 0 || minutos <= TOLERANCIA_MINUTOS) {
    return { estado: 'Presente', horasTardanza: 0, tiempoTardanza: '0 horas' }
  }
  if (minutos <= LIMITE_TARDANZA_1_HORA) {
    return { estado: 'Tardanza', horasTardanza: 1, tiempoTardanza: '1 hora' }
  }
  if (minutos <= LIMITE_TARDANZA_2_HORAS) {
    return { estado: 'Tardanza', horasTardanza: 2, tiempoTardanza: '2 horas' }
  }
  return { estado: 'Falta', horasTardanza: 0, tiempoTardanza: '0 horas' }
}
