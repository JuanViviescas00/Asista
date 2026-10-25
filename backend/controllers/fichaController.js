import Ficha from '../models/Ficha.js'
import Estudiante from '../models/Estudiante.js'
import Dispositivo from '../models/Dispositivo.js'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'
import { calcularResumenDesdeAsistencias } from '../services/asistenciaService.js'
import { construirFilasResumenPorEstudiante } from '../utils/inasistenciaResumen.js'
import { capitalizarTexto, normalizarJornada, normalizarNumeroDocumento, normalizarNombrePrograma, normalizarTipoDocumento } from '../utils/textUtils.js'
import Instructor from '../models/Instructor.js'
import { hashPassword, claveInicialInstructor } from '../services/passwordService.js'

export async function getFichas(req, res) {
  try {
    const { instructorId } = req.query
    const filter = {}
    // Un aprendiz solo ve la ficha a la que pertenece
    if (req.usuario?.rol === 'Estudiante') {
      const Estudiante = (await import('../models/Estudiante.js')).default
      const est = await Estudiante.findById(req.usuario.estudianteId || req.usuario.id).select('fichaId')
      if (!est?.fichaId) return res.json([])
      const q = [{ codigoFicha: String(est.fichaId) }]
      if (mongoose.Types.ObjectId.isValid(String(est.fichaId))) q.push({ _id: est.fichaId })
      filter.$or = q
    }
    if (instructorId) {
      filter.$or = [
        { instructorLiderId: instructorId },
        { instructores: instructorId }
      ]
    }
    const fichas = await Ficha.find(filter)
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
      .sort({ createdAt: -1 })
    res.json(fichas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getMisFichas(req, res) {
  try {
    const { instructorId } = req.params
    if (req.usuario?.rol !== 'Administrador' && String(req.usuario?.id) !== String(instructorId)) {
      return res.status(403).json({ error: 'Solo puedes consultar tus propias fichas' })
    }
    if (!mongoose.Types.ObjectId.isValid(String(instructorId))) {
      return res.status(400).json({ error: 'instructorId inválido' })
    }
    const fichas = await Ficha.find({
      $or: [
        { instructorLiderId: instructorId },
        { instructores: instructorId }
      ]
    })
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
      .sort({ createdAt: -1 })

    const resultado = fichas.map(f => {
      const liderIdStr = f.instructorLiderId ? String(f.instructorLiderId._id || f.instructorLiderId) : ''
      const esLider = liderIdStr === String(instructorId)
      return {
        ...f.toObject(),
        esLider
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getPlantillasFicha(req, res) {
  try {
    const { id } = req.params
    const deviceId = req.headers['x-device-id']
    const token = req.headers['x-device-token']

    // Autenticación: permitido para usuarios con sesión JWT activa (req.usuario)
    // o para dispositivos físicos mediante deviceId + token contra tokenHash con bcryptjs.
    if (!req.usuario) {
      if (!deviceId || !token) {
        return res.status(401).json({ error: 'deviceId y token son requeridos o sesión de usuario activa' })
      }
      const dispositivo = await Dispositivo.findOne({ deviceId: String(deviceId) })
      if (!dispositivo) {
        return res.status(401).json({ error: 'Dispositivo no registrado' })
      }
      if (dispositivo.activo !== true) {
        return res.status(403).json({ error: 'Dispositivo inactivo' })
      }
      const tokenValido = await bcryptjs.compare(String(token), dispositivo.tokenHash)
      if (!tokenValido) {
        return res.status(401).json({ error: 'Token de dispositivo inválido' })
      }
    }

    // Resuelve el id (ObjectId o codigoFicha) a los posibles valores de fichaId
    // que puede tener un Estudiante (campo Mixed), igual que el resto del backend.
    const idsBuscar = [id]
    if (mongoose.Types.ObjectId.isValid(id)) {
      idsBuscar.push(new mongoose.Types.ObjectId(id))
    }
    try {
      const queryFicha = []
      if (mongoose.Types.ObjectId.isValid(id)) queryFicha.push({ _id: id })
      queryFicha.push({ codigoFicha: String(id).trim() })
      const fichaDoc = await Ficha.findOne({ $or: queryFicha })
      if (fichaDoc) {
        idsBuscar.push(fichaDoc._id)
        if (fichaDoc.codigoFicha) idsBuscar.push(fichaDoc.codigoFicha)
      }
    } catch (_) {
      // ignorar: seguimos con el id tal cual llegó
    }

    const estudiantes = await Estudiante.find({
      fichaId: { $in: idsBuscar },
      estado: 'Activo',
      huellaEnrolada: true,
      $or: [
        { huellaTemplate: { $ne: '' } },
        { huellaTemplate2: { $ne: '' } },
      ],
    }).select('nombres apellidos huellaTemplate huellaTemplate2 tipoDocumento numeroDocumento')

    // Formato mínimo que consume el huellero (verify.js → toEngineRecord):
    // { estudianteId, nombres, apellidos, template, template2, tipoDocumento, numeroDocumento }
    const plantillas = estudiantes.map((e) => ({
      estudianteId: String(e._id),
      nombres: e.nombres,
      apellidos: e.apellidos,
      template: e.huellaTemplate || '',
      template2: e.huellaTemplate2 || '',
      tipoDocumento: e.tipoDocumento || '',
      numeroDocumento: e.numeroDocumento || '',
    }))

    res.json(plantillas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getTardanzasResumen(req, res) {
  try {
    const { id } = req.params

    const idsBuscar = [id]
    if (mongoose.Types.ObjectId.isValid(id)) idsBuscar.push(new mongoose.Types.ObjectId(id))
    try {
      const queryFicha = []
      if (mongoose.Types.ObjectId.isValid(id)) queryFicha.push({ _id: id })
      queryFicha.push({ codigoFicha: String(id).trim() })
      const fichaDoc = await Ficha.findOne({ $or: queryFicha })
      if (fichaDoc) {
        idsBuscar.push(fichaDoc._id)
        if (fichaDoc.codigoFicha) idsBuscar.push(fichaDoc.codigoFicha)
      }
    } catch (_) {}

    const estudiantes = await Estudiante.find({
      fichaId: { $in: idsBuscar },
      estado: { $ne: 'Retirado' },
    }).select('_id')

    const estudianteIds = estudiantes.map(e => e._id)
    const [inasistencias, jornadas] = await Promise.all([
      Inasistencia.find({ estudianteId: { $in: estudianteIds } }).sort({ fecha: 1 }),
      Jornada.find({ 'presentes.estudianteId': { $in: estudianteIds } })
    ])

    const porEstudiante = construirFilasResumenPorEstudiante({ inasistencias, jornadas })

    const resumen = {}
    for (const est of estudiantes) {
      const key = String(est._id)
      resumen[key] = calcularResumenDesdeAsistencias(porEstudiante.get(key) || [], fichaDoc?.jornada || '')
    }

    res.json({ ok: true, resumen })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createFicha(req, res) {
  try {
    const data = { ...req.body }
    if (data.codigoFicha) data.codigoFicha = normalizarNumeroDocumento(data.codigoFicha)
    if (data.nombrePrograma) data.nombrePrograma = normalizarNombrePrograma(data.nombrePrograma)
    if (data.jornada) data.jornada = normalizarJornada(data.jornada)
    if (data.aulaAsignada) data.aulaAsignada = capitalizarTexto(data.aulaAsignada)
    const ficha = new Ficha(data)
    await ficha.save()
    const populated = await ficha
      .populate('instructorLiderId', 'nombres apellidos correo')
    await populated.populate('instructores', 'nombres apellidos correo')
    res.status(201).json(populated)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una ficha registrada con este código de ficha.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function updateFicha(req, res) {
  try {
    const data = { ...req.body }
    if (data.codigoFicha) data.codigoFicha = normalizarNumeroDocumento(data.codigoFicha)
    if (data.nombrePrograma) data.nombrePrograma = normalizarNombrePrograma(data.nombrePrograma)
    if (data.jornada) data.jornada = normalizarJornada(data.jornada)
    if (data.aulaAsignada) data.aulaAsignada = capitalizarTexto(data.aulaAsignada)
    const ficha = await Ficha.findByIdAndUpdate(req.params.id, data, { new: true })
      .populate('instructorLiderId', 'nombres apellidos correo')
      .populate('instructores', 'nombres apellidos correo')
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })
    res.json(ficha)
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una ficha registrada con este código de ficha.' })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function deleteFicha(req, res) {
  try {
    const ficha = await Ficha.findByIdAndDelete(req.params.id)
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarFichas(req, res) {
  try {
    const { fichas } = req.body
    if (!fichas || !Array.isArray(fichas)) {
      return res.status(400).json({ error: 'Se requiere un array de fichas' })
    }
    for (const f of fichas) {
      if (f.codigoFicha) f.codigoFicha = normalizarNumeroDocumento(f.codigoFicha)
      if (f.nombrePrograma) f.nombrePrograma = normalizarNombrePrograma(f.nombrePrograma)
      if (f.jornada) f.jornada = normalizarJornada(f.jornada)
      if (f.aulaAsignada) f.aulaAsignada = capitalizarTexto(f.aulaAsignada)
    }
    const result = await Ficha.insertMany(fichas)
    res.status(201).json({ ok: true, count: result.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


export async function addInstructorAFicha(req, res) {
  try {
    const { id } = req.params
    let { instructorId, nuevoDocente } = req.body

    const ficha = await Ficha.findById(id)
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })

    const userId = String(req.usuario?.id || req.usuario?._id || '')
    const esAdmin = req.usuario?.rol === 'Administrador'
    const esLider = Boolean(userId && String(ficha.instructorLiderId) === userId)

    if (!esAdmin && !esLider) {
      return res.status(403).json({ error: 'Solo el docente líder de la ficha o un administrador puede agregar docentes al equipo.' })
    }

    // Si viene nuevoDocente, crearlo o reutilizarlo si ya existe
    if (nuevoDocente && !instructorId) {
      const { nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, especialidad, password } = nuevoDocente
      if (!nombres || !apellidos || !numeroDocumento || !correo) {
        return res.status(400).json({ error: 'Nombres, apellidos, número de documento y correo son obligatorios para el nuevo docente.' })
      }

      const docNorm = normalizarNumeroDocumento(numeroDocumento)
      const correoNorm = String(correo).trim().toLowerCase()

      const existe = await Instructor.findOne({
        $or: [{ numeroDocumento: docNorm }, { correo: correoNorm }]
      })

      if (existe) {
        instructorId = existe._id
      } else {
        const clavePlana = password || claveInicialInstructor(docNorm)
        if (String(clavePlana).length < 6) {
          return res.status(400).json({ error: 'La contraseña inicial no es válida: el número de documento debe tener al menos 6 dígitos.' })
        }
        const hashedPassword = await hashPassword(clavePlana)

        const nuevoInst = new Instructor({
          nombres: capitalizarTexto(nombres),
          apellidos: capitalizarTexto(apellidos),
          tipoDocumento: normalizarTipoDocumento(tipoDocumento || 'CC'),
          numeroDocumento: docNorm,
          correo: correoNorm,
          telefono: String(telefono || '').trim(),
          especialidad: capitalizarTexto(especialidad || 'Docente'),
          password: hashedPassword,
          rol: 'Instructor',
          primerLogin: true,
          estado: 'Activo'
        })
        await nuevoInst.save()
        instructorId = nuevoInst._id
      }
    }

    if (!instructorId) {
      return res.status(400).json({ error: 'Se requiere el ID del instructor a agregar o los datos del nuevo docente.' })
    }

    if (String(ficha.instructorLiderId) === String(instructorId)) {
      return res.status(400).json({ error: 'El docente seleccionado ya es el líder de esta ficha.' })
    }

    const yaAsignado = (ficha.instructores || []).some(i => String(i) === String(instructorId))
    if (yaAsignado) {
      return res.status(400).json({ error: 'El docente ya se encuentra en el equipo de trabajo de esta ficha.' })
    }

    ficha.instructores.push(instructorId)
    await ficha.save()

    const fichaActualizada = await Ficha.findById(id)
      .populate('instructorLiderId', 'nombres apellidos correo telefono especialidad')
      .populate('instructores', 'nombres apellidos correo telefono especialidad')

    res.json(fichaActualizada)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function removeInstructorDeFicha(req, res) {
  try {
    const { id, instructorId } = req.params
    const ficha = await Ficha.findById(id)
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada' })

    const userId = String(req.usuario?.id || req.usuario?._id || '')
    const esAdmin = req.usuario?.rol === 'Administrador'
    const esLider = Boolean(userId && String(ficha.instructorLiderId) === userId)

    if (!esAdmin && !esLider) {
      return res.status(403).json({ error: 'Solo el docente líder de la ficha o un administrador puede remover docentes del equipo.' })
    }

    ficha.instructores = (ficha.instructores || []).filter(i => String(i) !== String(instructorId))
    await ficha.save()

    const fichaActualizada = await Ficha.findById(id)
      .populate('instructorLiderId', 'nombres apellidos correo telefono especialidad')
      .populate('instructores', 'nombres apellidos correo telefono especialidad')

    res.json(fichaActualizada)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
