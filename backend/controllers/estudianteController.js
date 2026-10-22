import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import mongoose from 'mongoose'
import { calcularResumenAsistencia } from '../services/asistenciaService.js'
import { capitalizarTexto } from '../utils/textUtils.js'

// Resuelve un fichaId (campo Mixed: ObjectId o codigoFicha) a su documento Ficha.
// Reutiliza el mismo patrón de resolución ya presente en getEstudiantes y getPlantillasFicha.
async function resolverFicha(fichaId) {
  if (!fichaId) return null
  const query = []
  if (mongoose.Types.ObjectId.isValid(fichaId)) {
    query.push({ _id: fichaId })
  }
  query.push({ codigoFicha: String(fichaId).trim() })
  try {
    return await Ficha.findOne({ $or: query })
  } catch (_) {
    return null
  }
}

// Campos que un Docente Líder puede modificar en un aprendiz de su ficha.
// Excluye campos sensibles/estructurales: fichaId (reubicación de ficha),
// estadoAsistencia, y todo lo biométrico (huellaEnrolada, huellaTemplate,
// fechaEnrolamiento, dedoEnrolado) que queda reservado a Administrador o al
// flujo de enrolamiento real.
const CAMPOS_PERMITIDOS_LIDER = ['nombres', 'apellidos', 'tipoDocumento', 'numeroDocumento', 'correo', 'telefono', 'genero', 'estado', 'motivo']

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function getEstudiantes(req, res) {
  try {
    const { fichaId, documento, nombres, estado, instructorId } = req.query
    const filter = {}

    if (instructorId) {
      const misFichas = await Ficha.find({
        $or: [
          { instructorLiderId: instructorId },
          { instructores: instructorId }
        ]
      })
      const misFichaIds = []
      misFichas.forEach(f => {
        misFichaIds.push(f._id)
        misFichaIds.push(String(f._id))
        if (f.codigoFicha) misFichaIds.push(f.codigoFicha)
      })

      if (fichaId) {
        const idsBuscar = [fichaId]
        if (mongoose.Types.ObjectId.isValid(fichaId)) {
          idsBuscar.push(new mongoose.Types.ObjectId(fichaId))
        }
        try {
          const queryFicha = []
          if (mongoose.Types.ObjectId.isValid(fichaId)) {
            queryFicha.push({ _id: fichaId })
          }
          queryFicha.push({ codigoFicha: String(fichaId).trim() })
          const fichaDoc = await Ficha.findOne({ $or: queryFicha })
          if (fichaDoc) {
            idsBuscar.push(fichaDoc._id)
            idsBuscar.push(String(fichaDoc._id))
            if (fichaDoc.codigoFicha) idsBuscar.push(fichaDoc.codigoFicha)
          }
        } catch (e) {}

        const permitidos = idsBuscar.filter(id => misFichaIds.some(mfId => String(mfId) === String(id)))
        filter.fichaId = { $in: permitidos.length > 0 ? permitidos : [new mongoose.Types.ObjectId()] }
      } else {
        filter.fichaId = { $in: misFichaIds.length > 0 ? misFichaIds : [new mongoose.Types.ObjectId()] }
      }
    } else if (fichaId) {
      const idsBuscar = [fichaId]
      if (mongoose.Types.ObjectId.isValid(fichaId)) {
        idsBuscar.push(new mongoose.Types.ObjectId(fichaId))
      }
      try {
        const queryFicha = []
        if (mongoose.Types.ObjectId.isValid(fichaId)) {
          queryFicha.push({ _id: fichaId })
        }
        queryFicha.push({ codigoFicha: String(fichaId).trim() })
        
        const fichaDoc = await Ficha.findOne({ $or: queryFicha })
        if (fichaDoc) {
          idsBuscar.push(fichaDoc._id)
          idsBuscar.push(String(fichaDoc._id))
          if (fichaDoc.codigoFicha) idsBuscar.push(fichaDoc.codigoFicha)
        }
      } catch (e) {}

      filter.fichaId = { $in: idsBuscar }
    }

    if (estado) filter.estado = estado
    if (documento) filter.numeroDocumento = { $regex: escapeRegex(documento), $options: 'i' }
    if (nombres) {
      const safeNombres = escapeRegex(nombres)
      filter.$or = [
        { nombres: { $regex: safeNombres, $options: 'i' } },
        { apellidos: { $regex: safeNombres, $options: 'i' } },
      ]
    }
    const estudiantes = await Estudiante.find(filter)
      .select('-huellaTemplate -huellaTemplate2')
      .sort({ createdAt: -1 })
    res.json(estudiantes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getAsistenciaResumen(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'ID de estudiante inválido' })
    }
    const resumen = await calcularResumenAsistencia(id)
    res.json({ success: true, estudianteId: String(id), ...resumen })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createEstudiante(req, res) {
  try {
    const { fichaId } = req.body
    if (!fichaId) {
      return res.status(400).json({ error: 'Debe especificar una ficha para el estudiante. Debe crear primero la ficha.' })
    }
    const fichaExiste = await resolverFicha(fichaId)
    if (!fichaExiste) {
      return res.status(400).json({ error: 'La ficha especificada no existe. Debe crear primero la ficha.' })
    }
    req.body.fichaId = fichaExiste._id
    if (req.body.nombres) req.body.nombres = capitalizarTexto(req.body.nombres)
    if (req.body.apellidos) req.body.apellidos = capitalizarTexto(req.body.apellidos)
    const estudiante = new Estudiante(req.body)
    await estudiante.save()
    res.status(201).json(estudiante)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un estudiante registrado con este número de documento.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function updateEstudiante(req, res) {
  try {
    const esAdmin = req.usuario?.rol === 'Administrador'
    let updateData = req.body

    if (!esAdmin) {
      // Docente: debe ser el líder de la ficha del estudiante que intenta modificar.
      const estudianteActual = await Estudiante.findById(req.params.id)
      if (!estudianteActual) return res.status(404).json({ error: 'Estudiante no encontrado' })

      const ficha = await resolverFicha(estudianteActual.fichaId)
      if (!ficha) {
        return res.status(403).json({ error: 'No se pudo determinar la ficha del estudiante' })
      }

      const liderId = String(ficha.instructorLiderId || '')
      if (liderId !== String(req.usuario.id)) {
        return res.status(403).json({ error: 'Solo el líder de esta ficha puede modificar este estudiante' })
      }

      // Restringir los campos que puede tocar un Docente Líder.
      updateData = {}
      for (const campo of CAMPOS_PERMITIDOS_LIDER) {
        if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
          updateData[campo] = req.body[campo]
        }
      }
    }

    if (updateData.nombres) updateData.nombres = capitalizarTexto(updateData.nombres)
    if (updateData.apellidos) updateData.apellidos = capitalizarTexto(updateData.apellidos)
    const estudiante = await Estudiante.findByIdAndUpdate(req.params.id, updateData, { new: true })
    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' })
    res.json(estudiante)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe otro estudiante registrado con este número de documento.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function deleteEstudiante(req, res) {
  try {
    const estudiante = await Estudiante.findByIdAndDelete(req.params.id)
    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarEstudiantes(req, res) {
  try {
    const { estudiantes } = req.body
    if (!estudiantes || !Array.isArray(estudiantes)) {
      return res.status(400).json({ error: 'Se requiere un array de estudiantes' })
    }

    const esAdmin = req.usuario?.rol === 'Administrador'
    if (!esAdmin) {
      // Docente Líder: solo puede importar estudiantes a fichas de las que es líder.
      const noAutorizadas = []
      for (const e of estudiantes) {
        const ficha = await resolverFicha(e.fichaId)
        const liderId = ficha ? String(ficha.instructorLiderId || '') : ''
        if (!ficha || liderId !== String(req.usuario.id)) {
          noAutorizadas.push(ficha ? ficha.codigoFicha : String(e.fichaId || 'sin ficha'))
        }
      }
      if (noAutorizadas.length > 0) {
        const unicas = [...new Set(noAutorizadas)]
        return res.status(403).json({
          error: `No tienes permiso para importar estudiantes a las siguientes fichas (debes ser su instructor líder): ${unicas.join(', ')}`
        })
      }
    }

    // Capitalizar nombres y validar fichas existentes
    for (const e of estudiantes) {
      if (e.nombres) e.nombres = capitalizarTexto(e.nombres)
      if (e.apellidos) e.apellidos = capitalizarTexto(e.apellidos)
    }

    // Validar que cada estudiante tenga una ficha existente y resolver su _id
    const fichasInexistentes = []
    for (const e of estudiantes) {
      if (!e.fichaId) {
        fichasInexistentes.push(e.numeroDocumento || 'Estudiante sin ficha')
        continue
      }
      const fichaDoc = await resolverFicha(e.fichaId)
      if (!fichaDoc) {
        fichasInexistentes.push(String(e.fichaId))
      } else {
        e.fichaId = fichaDoc._id
      }
    }

    if (fichasInexistentes.length > 0) {
      const unicas = [...new Set(fichasInexistentes)]
      return res.status(400).json({
        error: `No se pueden importar estudiantes porque las siguientes fichas no existen en el sistema: ${unicas.join(', ')}. Debe crear primero las fichas.`
      })
    }

    const result = await Estudiante.insertMany(estudiantes)
    res.status(201).json({ ok: true, count: result.length })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Uno o más estudiantes ya están registrados con ese número de documento.' })
    }
    res.status(500).json({ error: err.message })
  }
}


export async function enrolarHuellaLegacy(req, res) {
  try {
    const { huellaTemplate } = req.body
    const estudiante = await Estudiante.findByIdAndUpdate(
      req.params.id,
      {
        huellaEnrolada: true,
        huellaTemplate: huellaTemplate || `TEMPLATE_HUELLA_${Date.now()}`,
        fechaEnrolamiento: new Date().toISOString().split('T')[0]
      },
      { new: true }
    )
    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' })
    res.json({ ok: true, estudiante })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
