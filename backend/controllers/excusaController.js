import Excusa from '../models/Excusa.js'
import Asistencia from '../models/Asistencia.js'
import Inasistencia from '../models/Inasistencia.js'
import { topeHorasPorJornada } from '../utils/jornadaUtils.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'


export async function getExcusas(req, res) {
  try {
    const { estado, fichaId, estudianteId } = req.query
    const filter = {}
    if (estado) filter.estado = String(estado)
    if (fichaId) filter.fichaId = String(fichaId)
    if (estudianteId) filter.estudianteId = String(estudianteId)
    // Un aprendiz solo ve sus propias excusas
    if (req.usuario?.rol === 'Estudiante') {
      delete filter.fichaId
      filter.estudianteId = String(req.usuario.estudianteId || req.usuario.id)
    }
    const excusas = await Excusa.find(filter).sort({ createdAt: -1 })
    res.json(excusas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createExcusa(req, res) {
  try {
    // Solo campos permitidos: el estado siempre inicia en 'Pendiente'
    const { estudianteId, fichaId, fechaInasistencia, motivo } = req.body
    if (req.usuario?.rol === 'Estudiante' && String(estudianteId) !== String(req.usuario.estudianteId || req.usuario.id)) {
      return res.status(403).json({ error: 'Solo puedes radicar excusas a tu nombre' })
    }
    const excusa = new Excusa({ estudianteId, fichaId, fechaInasistencia, motivo, estado: 'Pendiente' })
    await excusa.save()
    res.status(201).json(excusa)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateExcusa(req, res) {
  try {
    const permitidos = {}
    for (const campo of ['fechaInasistencia', 'motivo', 'motivoRechazo']) {
      if (req.body[campo] !== undefined) permitidos[campo] = String(req.body[campo])
    }
    const excusa = await Excusa.findByIdAndUpdate(req.params.id, permitidos, { new: true, runValidators: true })
    if (!excusa) return res.status(404).json({ error: 'Excusa no encontrada' })
    res.json(excusa)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function aprobarExcusa(req, res) {
  try {
    const excusa = await Excusa.findById(req.params.id)
    if (!excusa) return res.status(404).json({ error: 'Excusa no encontrada' })

    excusa.estado = 'Aprobada'
    await excusa.save()

    const [estudianteDoc, fichaDoc] = await Promise.all([
      Estudiante.findById(excusa.estudianteId),
      Ficha.findById(excusa.fichaId)
    ])

    const tope = topeHorasPorJornada(fichaDoc?.jornada || '')

    // 1. Actualizar o crear Inasistencia con tipo 'Excusada' y estadoCarga 'LISTO_PARA_SUBIR'
    const inasistencia = await Inasistencia.findOneAndUpdate(
      {
        estudianteId: excusa.estudianteId,
        fecha: excusa.fechaInasistencia,
        fichaId: excusa.fichaId
      },
      {
        $set: {
          tipo: 'Excusada',
          horas: tope,
          hora: '—',
          tiempoTardanza: '0 horas',
          estadoCarga: 'LISTO_PARA_SUBIR'
        },
        $setOnInsert: {
          origen: 'manual'
        }
      },
      { upsert: true, new: true }
    )

    // 2. Compatibilidad legacy con Asistencia
    await Asistencia.findOneAndUpdate(
      {
        estudianteId: excusa.estudianteId,
        fecha: excusa.fechaInasistencia,
        fichaId: excusa.fichaId
      },
      {
        $set: {
          estado: 'Excusada',
          hora: '—',
          horasTardanza: 0,
          tiempoTardanza: '0 horas'
        }
      },
      { upsert: true }
    )

    await Estudiante.findByIdAndUpdate(excusa.estudianteId, { estadoAsistencia: 'Excusada' })

    res.json({ ok: true, excusa, inasistencia })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function rechazarExcusa(req, res) {
  try {
    const { motivoRechazo } = req.body
    const excusa = await Excusa.findByIdAndUpdate(
      req.params.id,
      { estado: 'Rechazada', motivoRechazo: motivoRechazo || '' },
      { new: true }
    )
    if (!excusa) return res.status(404).json({ error: 'Excusa no encontrada' })
    res.json({ ok: true, excusa })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
