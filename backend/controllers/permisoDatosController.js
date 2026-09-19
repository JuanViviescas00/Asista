import mongoose from 'mongoose'
import Estudiante from '../models/Estudiante.js'
import Instructor from '../models/Instructor.js'
import PermisoDatosPersonales from '../models/PermisoDatosPersonales.js'

function esObjectIdValido(id) {
  return mongoose.Types.ObjectId.isValid(String(id))
}

export async function getConsentimientoDatos(req, res) {
  try {
    const { id } = req.params
    if (!esObjectIdValido(id)) {
      return res.status(400).json({ error: 'ID de estudiante inválido' })
    }

    const permiso = await PermisoDatosPersonales.findOne({ estudianteId: id })
    if (!permiso) {
      return res.json({ existe: false })
    }

    res.json({ existe: true, ...permiso.toObject() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createConsentimientoDatos(req, res) {
  try {
    const { id } = req.params
    const { instructorId, versionTerminos } = req.body

    if (!esObjectIdValido(id)) {
      return res.status(400).json({ error: 'ID de estudiante inválido' })
    }
    if (!instructorId || !versionTerminos) {
      return res.status(400).json({ error: 'instructorId y versionTerminos son requeridos' })
    }
    if (!esObjectIdValido(instructorId)) {
      return res.status(400).json({ error: 'instructorId inválido' })
    }

    const estudiante = await Estudiante.findById(id)
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }

    const instructor = await Instructor.findById(instructorId)
    if (!instructor) {
      return res.status(404).json({ error: 'Instructor no encontrado' })
    }

    const existente = await PermisoDatosPersonales.findOne({ estudianteId: id })
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un consentimiento de datos para este estudiante' })
    }

    const permiso = new PermisoDatosPersonales({
      estudianteId: id,
      aceptadoPor: instructorId,
      versionTerminos,
    })
    await permiso.save()

    res.status(201).json(permiso)
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un consentimiento de datos para este estudiante' })
    }
    res.status(500).json({ error: err.message })
  }
}
