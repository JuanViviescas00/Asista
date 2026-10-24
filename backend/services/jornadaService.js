import Jornada from '../models/Jornada.js'

/**
 * Garantiza que exista una Jornada para (fichaId, fecha) sin pisar una
 * existente. Usa upsert con $setOnInsert: si ya hay una jornada, se devuelve
 * tal cual (no se sobrescribe instructor/origen/claseId). Si hay una condición
 * de carrera por el índice único (código 11000), vuelve a leer y devuelve la
 * existente.
 *
 * @param {{ fichaId: *, fecha: string, instructorId?: *, origen: 'manual'|'huellero', claseId?: * }} params
 * @returns {Promise<Object>} Documento Jornada
 */
export async function asegurarJornada({ fichaId, fecha, instructorId, origen, claseId }) {
  try {
    const jornada = await Jornada.findOneAndUpdate(
      { fichaId, fecha },
      {
        $setOnInsert: {
          fichaId,
          fecha,
          instructorId: instructorId || null,
          origen,
          claseId: claseId || null,
        },
      },
      { upsert: true, new: true }
    )
    return jornada
  } catch (err) {
    if (err?.code === 11000) {
      return Jornada.findOne({ fichaId, fecha })
    }
    throw err
  }
}
