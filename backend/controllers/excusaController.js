import Excusa from '../models/Excusa.js'
import Asistencia from '../models/Asistencia.js'
import Inasistencia from '../models/Inasistencia.js'
import { topeHorasPorJornada } from '../utils/jornadaUtils.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import { upsertAsistenciaSQLite } from '../services/sqliteExport.js'

export async function getExcusas(req, res) {
  try {
    const { estado, fichaId } = req.query
    const filter = {}
    if (estado) filter.estado = estado
    if (fichaId) filter.fichaId = fichaId
    const excusas = await Excusa.find(filter).sort({ createdAt: -1 })
    res.json(excusas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createExcusa(req, res) {
  try {
    const excusa = new Excusa(req.body)
    await excusa.save()
    res.status(201).json(excusa)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateExcusa(req, res) {
  try {
    const excusa = await Excusa.findByIdAndUpdate(req.params.id, req.body, { new: true })
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

    // 3. Sincronizar en SQLite
    try {
      if (estudianteDoc && fichaDoc) {
        upsertAsistenciaSQLite({
          fichaCodigo: fichaDoc.codigoFicha || String(excusa.fichaId),
          nombrePrograma: fichaDoc.nombrePrograma || '',
          jornada: fichaDoc.jornada || '',
          documentoAprendiz: estudianteDoc.numeroDocumento || '',
          nombreAprendiz: `${estudianteDoc.nombres || ''} ${estudianteDoc.apellidos || ''}`.trim(),
          correoAprendiz: estudianteDoc.correo || '',
          fecha: excusa.fechaInasistencia,
          estado: 'Excusada',
          hora: '—',
          horasTardanza: 0,
          tiempoTardanza: '0 horas'
        })
      }
    } catch (sqliteErr) {
      console.warn('[SQLite] Error al actualizar excusa en SQLite:', sqliteErr.message)
    }

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
