import Jornada from '../models/Jornada.js'
import { getFichaIdList } from '../services/asistenciaService.js'
import { asegurarJornada } from '../services/jornadaService.js'

export async function getJornadas(req, res) {
  try {
    const { fichaId, desde, hasta } = req.query
    const filter = {}
    if (fichaId) {
      const idsBuscar = await getFichaIdList(fichaId)
      filter.fichaId = { $in: idsBuscar }
    }
    if (desde || hasta) {
      filter.fecha = {}
      if (desde) filter.fecha.$gte = desde
      if (hasta) filter.fecha.$lte = hasta
    }
    const jornadas = await Jornada.find(filter)
      .populate('instructorId')
      .sort({ fecha: 1 })
    res.json(jornadas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createJornada(req, res) {
  try {
    const { fichaId, fecha, instructorId, origen, claseId } = req.body
    const origenFinal = origen || 'manual'
    if (!['manual', 'huellero'].includes(origenFinal)) {
      return res.status(400).json({ error: 'El campo origen debe ser "manual" o "huellero".' })
    }
    const instructorFinal = instructorId || req.usuario?.id || null
    const jornada = await asegurarJornada({
      fichaId,
      fecha,
      instructorId: instructorFinal,
      origen: origenFinal,
      claseId: claseId || null,
    })
    res.json(jornada)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
