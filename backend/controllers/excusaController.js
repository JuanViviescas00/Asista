import Excusa from '../models/Excusa.js'
import DiaFestivo from '../models/DiaFestivo.js'
import Inasistencia from '../models/Inasistencia.js'
import { topeHorasPorJornada } from '../utils/jornadaUtils.js'
import { calcularEstadoCarga } from '../utils/inasistenciaEstado.js'
import { getHoyString } from '../services/asistenciaService.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import { emitirAsistenciaRegistrada } from '../services/socketService.js'

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
    const {
      estudianteId,
      fichaId,
      fechaInasistencia,
      motivo,
      tipoExcusa,
      adjuntoNombre,
      adjuntoData,
      horasDescontar,
      estado
    } = req.body

    if (req.usuario?.rol === 'Estudiante' && String(estudianteId) !== String(req.usuario.estudianteId || req.usuario.id)) {
      return res.status(403).json({ error: 'Solo puedes radicar excusas a tu nombre' })
    }

    // Si el usuario no es Estudiante (ej. Instructor o Administrador) y envía estado, permitirlo ('Aprobada' o 'Pendiente')
    const estadoFinal = (req.usuario?.rol !== 'Estudiante' && estado) ? String(estado) : 'Pendiente'

    const motivoFinal = (motivo && String(motivo).trim()) || (tipoExcusa ? `Excusa ${tipoExcusa}` : '')
    if (!motivoFinal) {
      return res.status(400).json({ error: 'El motivo de la excusa es obligatorio.' })
    }

    const excusa = new Excusa({
      estudianteId,
      fichaId,
      fechaInasistencia,
      motivo: motivoFinal,
      tipoExcusa: tipoExcusa || 'Medica',
      adjuntoNombre: adjuntoNombre || '',
      adjuntoData: adjuntoData || null,
      horasDescontar: Number(horasDescontar) || 6,
      estado: estadoFinal
    })
    await excusa.save()
    res.status(201).json(excusa)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateExcusa(req, res) {
  try {
    const permitidos = {}
    for (const campo of ['fechaInasistencia', 'motivo', 'tipoExcusa', 'adjuntoNombre', 'adjuntoData', 'horasDescontar', 'motivoRechazo']) {
      if (req.body[campo] !== undefined) permitidos[campo] = req.body[campo]
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

    // Buscar la Inasistencia existente para conservar datos ya reportados.
    const existente = await Inasistencia.findOne({
      estudianteId: excusa.estudianteId,
      fichaId: excusa.fichaId,
      fecha: excusa.fechaInasistencia
    })

    // Bloqueo por subida a Sofía Plus: una novedad ya subida no puede editarse.
    if (existente?.estadoCarga === 'SUBIDA') {
      return res.status(409).json({
        error: 'Esta inasistencia ya fue reportada a Sofía Plus y no se puede modificar.'
      })
    }

    excusa.estado = 'Aprobada'
    await excusa.save()

    const [estudianteDoc, fichaDoc] = await Promise.all([
      Estudiante.findById(excusa.estudianteId),
      Ficha.findById(excusa.fichaId)
    ])

    const tope = topeHorasPorJornada(fichaDoc?.jornada || '')

    // Horas: conservar las de una Tardanza existente; en los demás casos usar el tope.
    const horas = existente?.tipo === 'Tardanza' ? existente.horas : tope

    // instructorId: conservar el existente; si no, usar el líder de la ficha.
    const instructorId = existente?.instructorId || fichaDoc?.instructorLiderId || null

    // Calcular el estado de carga (ciclo EN_ESPERA -> LISTO_PARA_SUBIR -> SUBIDA).
    const festivosDocs = await DiaFestivo.find().select('fecha')
    const festivosSet = new Set(festivosDocs.map((d) => d.fecha))
    const estadoCarga = calcularEstadoCarga({ fecha: excusa.fechaInasistencia, tipo: 'Excusada', jornada: fichaDoc?.jornada || '', festivosSet, hoyStr: getHoyString() })

    // Conservar descripción previa o asignar el motivo de la excusa radicada
    const descripcion = (existente?.descripcion || '').trim() || (excusa.motivo || '').trim() || ''

    // 1. Actualizar o crear Inasistencia con tipo 'Excusada'.
    const inasistencia = await Inasistencia.findOneAndUpdate(
      {
        estudianteId: excusa.estudianteId,
        fecha: excusa.fechaInasistencia,
        fichaId: excusa.fichaId
      },
      {
        $set: {
          tipo: 'Excusada',
          horas,
          hora: '—',
          tiempoTardanza: '0 horas',
          instructorId,
          estadoCarga,
          descripcion
        },
        $setOnInsert: {
          origen: 'manual'
        }
      },
      { upsert: true, new: true }
    )

    await Estudiante.findByIdAndUpdate(excusa.estudianteId, { estadoAsistencia: 'Excusada' })

    // Emitir evento por Socket.io para actualización en tiempo real en los paneles
    try {
      emitirAsistenciaRegistrada(String(excusa.fichaId), {
        asistenciaId: inasistencia._id,
        estudianteId: excusa.estudianteId,
        nombres: estudianteDoc?.nombres || '',
        apellidos: estudianteDoc?.apellidos || '',
        estado: 'Excusada',
        hora: inasistencia.hora,
        tiempoTardanza: inasistencia.tiempoTardanza,
        horasTardanza: 0,
        metodo: inasistencia.origen === 'huellero' ? 'HUELLA' : 'MANUAL',
        fecha: excusa.fechaInasistencia
      })
    } catch (wsErr) {
      console.warn('[Socket] Error emitiendo excusa aprobada:', wsErr.message)
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
