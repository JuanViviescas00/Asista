import mongoose from 'mongoose'
import Instructor from '../models/Instructor.js'
import Ficha from '../models/Ficha.js'
import Estudiante from '../models/Estudiante.js'
import Inasistencia from '../models/Inasistencia.js'
import SofiaPlusSync from '../models/SofiaPlusSync.js'
import { hashPassword, claveInicialInstructor } from '../services/passwordService.js'
import { encrypt, decrypt } from '../services/cryptoService.js'
import { enviarCorreoConfirmacionCambioPassword } from '../services/emailService.js'
import { capitalizarTexto, normalizarTipoDocumento, normalizarNumeroDocumento } from '../utils/textUtils.js'
import { ejecutarRPAInasistencias, obtenerEstadoRPA } from '../services/rpaService.js'
import { textoJustificacion } from '../utils/descripcionInasistencia.js'

// Resuelve un fichaId (ObjectId o codigoFicha) a su documento Ficha.
// Mismo patrón de resolución usado en estudianteController.updateEstudiante.
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

export async function getInstructores(req, res) {
  try {
    const instructores = await Instructor.find().sort({ createdAt: -1 })
    const fichasLideres = await Ficha.find({ instructorLiderId: { $ne: null } })
    const idsLideres = new Set(fichasLideres.map(f => String(f.instructorLiderId)))

    const resultado = instructores.map(inst => {
      const obj = inst.toObject()
      delete obj.password // No exponer el hash en la respuesta
      const tienePasswordSofia = Boolean(obj.passwordSofiaPlus)
      delete obj.passwordSofiaPlus // Proteger credenciales externas
      const esLiderEnFicha = idsLideres.has(String(inst._id))
      return {
        ...obj,
        tienePasswordSofia,
        esLider: !!(inst.esLider || esLiderEnFicha)
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createInstructor(req, res) {
  try {
    const data = { ...req.body }
    if (data.nombres) data.nombres = capitalizarTexto(data.nombres)
    if (data.apellidos) data.apellidos = capitalizarTexto(data.apellidos)
    if (data.tipoDocumento) data.tipoDocumento = normalizarTipoDocumento(data.tipoDocumento)
    if (data.numeroDocumento) data.numeroDocumento = normalizarNumeroDocumento(data.numeroDocumento)
    if (data.correo) data.correo = String(data.correo).trim().toLowerCase()
    if (data.especialidad) data.especialidad = capitalizarTexto(data.especialidad)
    const clavePlana = data.password || claveInicialInstructor(data.numeroDocumento)
    if (String(clavePlana).length < 6) {
      return res.status(400).json({ error: 'La contraseña inicial no es válida: el número de documento normalizado debe tener al menos 6 caracteres. Asigna una contraseña manual.' })
    }
    data.password = await hashPassword(clavePlana)

    if (data.passwordSofiaPlus) {
      data.passwordSofiaPlus = encrypt(data.passwordSofiaPlus)
    }

    const instructor = new Instructor(data)
    await instructor.save()

    const obj = instructor.toObject()
    delete obj.password
    const tienePasswordSofia = Boolean(obj.passwordSofiaPlus)
    delete obj.passwordSofiaPlus
    obj.tienePasswordSofia = tienePasswordSofia
    res.status(201).json(obj)
  } catch (err) {
    if (err.code === 11000) {
      const campo = Object.keys(err.keyPattern || {})[0] || 'documento o correo'
      return res.status(400).json({ error: `Ya existe un instructor registrado con ese ${campo === 'correo' ? 'correo electrónico' : 'número de documento'}.` })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function updateInstructor(req, res) {
  try {
    const esAdmin = req.usuario?.rol === 'Administrador'
    if (!esAdmin) {
      if (String(req.usuario.id) !== String(req.params.id)) {
        return res.status(403).json({ error: 'Solo puedes actualizar tu propio perfil de instructor' })
      }
    }

    // Un instructor solo puede editar datos de contacto y su clave de Sofía Plus.
    const CAMPOS_AUTOEDICION = ['nombres', 'apellidos', 'telefono', 'correo', 'especialidad', 'passwordSofiaPlus']
    const data = {}
    for (const [campo, valor] of Object.entries(req.body)) {
      if (esAdmin || CAMPOS_AUTOEDICION.includes(campo)) data[campo] = valor
    }
    delete data.codigoRecuperacion
    delete data.expiraCodigoRecuperacion
    delete data.intentosCodigoRecuperacion
    if (data.nombres) data.nombres = capitalizarTexto(data.nombres)
    if (data.apellidos) data.apellidos = capitalizarTexto(data.apellidos)
    if (data.tipoDocumento) data.tipoDocumento = normalizarTipoDocumento(data.tipoDocumento)
    if (data.numeroDocumento) data.numeroDocumento = normalizarNumeroDocumento(data.numeroDocumento)
    if (data.correo) data.correo = String(data.correo).trim().toLowerCase()
    if (data.especialidad) data.especialidad = capitalizarTexto(data.especialidad)

    if (data.password) {
      data.password = await hashPassword(data.password)
    } else {
      delete data.password
    }

    if (data.passwordSofiaPlus !== undefined) {
      data.passwordSofiaPlus = encrypt(data.passwordSofiaPlus)
    }

    const instructor = await Instructor.findByIdAndUpdate(req.params.id, data, { new: true })
    if (!instructor) return res.status(404).json({ error: 'Instructor no encontrado' })

    if (req.body.password && instructor.correo) {
      const nombreInst = `${instructor.nombres || ''} ${instructor.apellidos || ''}`.trim() || 'Instructor'
      enviarCorreoConfirmacionCambioPassword(instructor.correo, nombreInst).catch(err => {
        console.error('[Email] Error al enviar confirmación de cambio de contraseña (instructor):', err.message)
      })
    }

    const obj = instructor.toObject()
    delete obj.password
    const tienePasswordSofia = Boolean(obj.passwordSofiaPlus)
    delete obj.passwordSofiaPlus
    obj.tienePasswordSofia = tienePasswordSofia
    res.json(obj)
  } catch (err) {
    if (err.code === 11000) {
      const campo = Object.keys(err.keyPattern || {})[0] || 'documento o correo'
      return res.status(400).json({ error: `Ya existe otro instructor registrado con ese ${campo === 'correo' ? 'correo electrónico' : 'número de documento'}.` })
    }
    res.status(500).json({ error: err.message })
  }
}

export async function deleteInstructor(req, res) {
  try {
    const instructor = await Instructor.findByIdAndDelete(req.params.id)
    if (!instructor) return res.status(404).json({ error: 'Instructor no encontrado' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function importarInstructores(req, res) {
  try {
    const { instructores } = req.body
    if (!instructores || !Array.isArray(instructores)) {
      return res.status(400).json({ error: 'Se requiere un array de instructores' })
    }

    const esAdmin = req.usuario?.rol === 'Administrador'
    if (!esAdmin) {
      // Docente Líder: solo puede asignar instructores a fichas de las que es líder.
      const noAutorizadas = []
      for (const inst of instructores) {
        const { fichaId, fichas, esLider } = inst
        let listaFichas = []
        if (Array.isArray(fichas) && fichas.length > 0) {
          listaFichas = fichas
        } else if (fichaId) {
          listaFichas = [{ fichaId, esLider: !!esLider }]
        }
        for (const item of listaFichas) {
          const targetFichaId = item.fichaId || item
          if (!targetFichaId) continue
          const ficha = await resolverFicha(targetFichaId)
          const liderId = ficha ? String(ficha.instructorLiderId || '') : ''
          if (!ficha || liderId !== String(req.usuario.id)) {
            noAutorizadas.push(ficha ? ficha.codigoFicha : String(targetFichaId))
          }
        }
      }
      if (noAutorizadas.length > 0) {
        const unicas = [...new Set(noAutorizadas)]
        return res.status(403).json({
          error: `No tienes permiso para asignar instructores a las siguientes fichas (debes ser su instructor líder): ${unicas.join(', ')}`
        })
      }
    }

    let creados = 0
    let actualizados = 0
    let errores = 0

    for (const inst of instructores) {
      try {
        const { fichaId, fichas, esLider, password, ...rest } = inst
        if (rest.nombres) rest.nombres = capitalizarTexto(rest.nombres)
        if (rest.apellidos) rest.apellidos = capitalizarTexto(rest.apellidos)
        if (rest.tipoDocumento) rest.tipoDocumento = normalizarTipoDocumento(rest.tipoDocumento)
        if (rest.numeroDocumento) rest.numeroDocumento = normalizarNumeroDocumento(rest.numeroDocumento)
        if (rest.correo) rest.correo = String(rest.correo).trim().toLowerCase()
        if (rest.especialidad) rest.especialidad = capitalizarTexto(rest.especialidad)
        if (!rest.rol) rest.rol = 'Instructor'

        const existe = await Instructor.findOne({
          $or: [
            { numeroDocumento: String(rest.numeroDocumento).trim() },
            { correo: rest.correo }
          ]
        })

        let instructor
        if (!existe) {
          const clavePlana = password || claveInicialInstructor(rest.numeroDocumento)
          if (String(clavePlana).length < 6) {
            errores++
            continue
          }
          const passwordHash = await hashPassword(clavePlana)
          const datosCrear = {
            ...rest,
            password: passwordHash
          }
          if (datosCrear.passwordSofiaPlus) {
            datosCrear.passwordSofiaPlus = encrypt(datosCrear.passwordSofiaPlus)
          }
          instructor = await Instructor.create(datosCrear)
          creados++
        } else {
          const datos = { ...rest }
          if (password) {
            datos.password = await hashPassword(password)
          }
          if (datos.passwordSofiaPlus !== undefined) {
            datos.passwordSofiaPlus = encrypt(datos.passwordSofiaPlus)
          }
          instructor = await Instructor.findByIdAndUpdate(existe._id, datos, { new: true })
          actualizados++
        }

        // Normalizar lista de fichas
        let listaFichas = []
        if (Array.isArray(fichas) && fichas.length > 0) {
          listaFichas = fichas
        } else if (fichaId) {
          listaFichas = [{ fichaId, esLider: !!esLider }]
        }

        for (const item of listaFichas) {
          const targetFichaId = item.fichaId || item
          const esLiderFicha = item.esLider !== undefined ? item.esLider : esLider
          if (targetFichaId) {
            if (esLiderFicha) {
              await Ficha.findByIdAndUpdate(targetFichaId, { instructorLiderId: instructor._id })
            } else {
              await Ficha.findByIdAndUpdate(targetFichaId, { $addToSet: { instructores: instructor._id } })
            }
          }
        }
      } catch (err) {
        errores++
      }
    }

    res.status(201).json({ ok: true, creados, actualizados, errores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Obtener credenciales para bot RPA de Sofia Plus por ID
function puedeVerCredenciales(req, instructor) {
  return req.usuario?.rol === 'Administrador' || String(req.usuario?.id) === String(instructor._id)
}

export async function getCredencialesSofia(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ ok: false, error: 'ID inválido' })
    }
    const instructor = await Instructor.findById(req.params.id)
    if (!instructor) {
      return res.status(404).json({ ok: false, error: 'Instructor no encontrado' })
    }
    if (!puedeVerCredenciales(req, instructor)) {
      return res.status(403).json({ ok: false, error: 'Solo puedes acceder a tus propios datos' })
    }
    if (!instructor) {
      return res.status(404).json({ ok: false, error: 'Instructor no encontrado' })
    }

    if (!instructor.passwordSofiaPlus) {
      return res.status(400).json({
        ok: false,
        error: 'El instructor no tiene configurada su contraseña de Sofia Plus en el sistema'
      })
    }

    res.json({
      ok: true,
      instructorId: instructor._id,
      nombreCompleto: `${instructor.nombres} ${instructor.apellidos}`.trim(),
      tipoDocumento: instructor.tipoDocumento || 'CC',
      numeroDocumento: instructor.numeroDocumento,
      passwordSofiaPlus: decrypt(instructor.passwordSofiaPlus)
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// Obtener credenciales para bot RPA de Sofia Plus por número de documento
export async function getCredencialesSofiaPorDocumento(req, res) {
  try {
    const { documento } = req.params
    const instructor = await Instructor.findOne({ numeroDocumento: String(documento).trim() })
    if (!instructor) {
      return res.status(404).json({ ok: false, error: 'Instructor no encontrado con ese documento' })
    }
    if (!puedeVerCredenciales(req, instructor)) {
      return res.status(403).json({ ok: false, error: 'Solo puedes acceder a tus propios datos' })
    }

    if (!instructor.passwordSofiaPlus) {
      return res.status(400).json({
        ok: false,
        error: `El instructor ${instructor.nombres} ${instructor.apellidos} no tiene configurada su contraseña de Sofia Plus`
      })
    }

    res.json({
      ok: true,
      instructorId: instructor._id,
      nombreCompleto: `${instructor.nombres} ${instructor.apellidos}`.trim(),
      tipoDocumento: instructor.tipoDocumento || 'CC',
      numeroDocumento: instructor.numeroDocumento,
      passwordSofiaPlus: decrypt(instructor.passwordSofiaPlus)
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// Obtener listado de inasistencias para el robot RPA de Sofia Plus
export async function getInasistenciasParaRPA(req, res) {
  try {
    const { documento } = req.params
    const { fecha, fichaId } = req.query

    const instructor = await Instructor.findOne({ numeroDocumento: String(documento).trim() })
    if (!instructor) {
      return res.status(404).json({ ok: false, error: 'Instructor no encontrado con ese documento' })
    }

    // Filtrar estrictamente las inasistencias que fueron dictadas / registradas por este instructor
    const filter = {
      instructorId: instructor._id,
      tipo: { $in: ['Falta', 'Tardanza', 'Excusada'] },
      estadoCarga: 'LISTO_PARA_SUBIR'
    }

    if (fichaId) {
      const fichaDoc = await resolverFicha(fichaId)
      if (fichaDoc) filter.fichaId = fichaDoc._id
    }
    if (fecha) filter.fecha = fecha

    const inasistenciasDocs = await Inasistencia.find(filter)
      .populate('estudianteId')
      .populate('fichaId')
      .sort({ fecha: -1, 'fichaId.codigoFicha': 1 })

    const inasistencias = inasistenciasDocs
      .filter(a => a.estudianteId && a.fichaId)
      .map(a => ({
        asistenciaId: String(a._id),
        fecha: a.fecha,
        estado: a.tipo,
        horas: a.horas,
        ficha: {
          id: a.fichaId._id,
          codigo: a.fichaId.codigoFicha || '',
          nombre: a.fichaId.nombrePrograma || a.fichaId.nombre || '',
          jornada: a.fichaId.jornada || ''
        },
        aprendiz: {
          id: a.estudianteId._id,
          tipoDocumento: a.estudianteId.tipoDocumento || 'CC',
          numeroDocumento: a.estudianteId.numeroDocumento || '',
          nombres: a.estudianteId.nombres || '',
          apellidos: a.estudianteId.apellidos || '',
          nombreCompleto: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim()
        },
        justificacion: textoJustificacion(a)
      }))

    res.json({
      ok: true,
      instructor: {
        id: instructor._id,
        nombreCompleto: `${instructor.nombres} ${instructor.apellidos}`.trim(),
        tipoDocumento: instructor.tipoDocumento || 'CC',
        numeroDocumento: instructor.numeroDocumento,
        passwordSofiaPlus: decrypt(instructor.passwordSofiaPlus)
      },
      total: inasistencias.length,
      inasistencias
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// Obtener consolidado de todos los instructores con credenciales Sofia Plus y sus inasistencias pendientes
export async function getTodosInasistenciasParaRPA(req, res) {
  try {
    const { fecha } = req.query

    // 1. Buscar todos los instructores que tengan contraseña de Sofia Plus configurada
    const instructores = await Instructor.find({
      passwordSofiaPlus: { $exists: true, $ne: '' }
    })

    if (!instructores || instructores.length === 0) {
      return res.json({
        ok: true,
        totalInstructores: 0,
        totalInasistencias: 0,
        instructores: []
      })
    }

    const resultadoInstructores = []
    let granTotalInasistencias = 0

    for (const inst of instructores) {
      // Filtrar estrictamente las inasistencias de este instructor
      const filter = {
        instructorId: inst._id,
        tipo: { $in: ['Falta', 'Tardanza', 'Excusada'] },
        estadoCarga: 'LISTO_PARA_SUBIR'
      }
      if (fecha) filter.fecha = fecha

      const inasistenciasValidas = (await Inasistencia.find(filter)
        .populate('estudianteId')
        .populate('fichaId')
        .sort({ fecha: -1, 'fichaId.codigoFicha': 1 }))
        .filter(a => a.estudianteId && a.fichaId)

      if (inasistenciasValidas.length === 0) continue

      // Agrupar por ficha
      const fichasMap = new Map()
      inasistenciasValidas.forEach(a => {
        const fCodigo = a.fichaId.codigoFicha || 'SIN_CODIGO'
        if (!fichasMap.has(fCodigo)) {
          fichasMap.set(fCodigo, {
            id: a.fichaId._id,
            codigo: fCodigo,
            nombre: a.fichaId.nombrePrograma || a.fichaId.nombre || '',
            jornada: a.fichaId.jornada || '',
            aprendices: []
          })
        }

        fichasMap.get(fCodigo).aprendices.push({
          asistenciaId: String(a._id),
          fecha: a.fecha,
          estado: a.tipo,
          horas: a.horas,
          aprendiz: {
            id: a.estudianteId._id,
            tipoDocumento: a.estudianteId.tipoDocumento || 'CC',
            numeroDocumento: a.estudianteId.numeroDocumento || '',
            nombres: a.estudianteId.nombres || '',
            apellidos: a.estudianteId.apellidos || '',
            nombreCompleto: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim()
          },
          justificacion: textoJustificacion(a)
        })
      })

      const fichasConNovedades = Array.from(fichasMap.values())
      const totalDocente = inasistenciasValidas.length
      granTotalInasistencias += totalDocente

      resultadoInstructores.push({
        id: inst._id,
        nombreCompleto: `${inst.nombres} ${inst.apellidos}`.trim(),
        tipoDocumento: inst.tipoDocumento || 'CC',
        numeroDocumento: inst.numeroDocumento,
        passwordSofiaPlus: decrypt(inst.passwordSofiaPlus),
        totalInasistencias: totalDocente,
        fichas: fichasConNovedades
      })
    }

    res.json({
      ok: true,
      fecha: fecha || 'todas',
      totalInstructores: resultadoInstructores.length,
      totalInasistencias: granTotalInasistencias,
      instructores: resultadoInstructores
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// Confirmar y bloquear asistencia tras subida exitosa a Sofia Plus (soporta individual o lote de IDs agrupados)
export async function confirmarSubidaSofia(req, res) {
  try {
    const { asistenciaId, inasistenciaId, asistenciaIds, estudianteId, fichaId, fecha } = req.body

    const idsList = Array.isArray(asistenciaIds) && asistenciaIds.length > 0
      ? asistenciaIds
      : (inasistenciaId || asistenciaId ? [inasistenciaId || asistenciaId] : [])

    // Validar que los ids recibidos sean ObjectIds válidos.
    for (const id of idsList) {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        return res.status(400).json({ ok: false, error: 'Identificador de inasistencia no válido' })
      }
    }
    if (fichaId && !mongoose.Types.ObjectId.isValid(String(fichaId))) {
      return res.status(400).json({ ok: false, error: 'Identificador de ficha no válido' })
    }
    if (estudianteId && !mongoose.Types.ObjectId.isValid(String(estudianteId))) {
      return res.status(400).json({ ok: false, error: 'Identificador de estudiante no válido' })
    }

    if (idsList.length === 0 && (!estudianteId || !fecha)) {
      return res.status(400).json({ ok: false, error: 'Se requiere asistenciaId, asistenciaIds o (estudianteId y fecha)' })
    }

    // Sin ids, la búsqueda por (estudianteId, fecha) exige también fichaId.
    if (idsList.length === 0 && !fichaId) {
      return res.status(400).json({ ok: false, error: 'Se requiere fichaId junto con estudianteId y fecha' })
    }

    const query = idsList.length > 0 ? { _id: { $in: idsList } } : { estudianteId, fecha }
    if (fichaId) query.fichaId = fichaId

    // Idempotencia: si no hay coincidencias con la query original -> 404.
    const totalCoincidentes = await Inasistencia.countDocuments(query)
    if (totalCoincidentes === 0) {
      return res.status(404).json({ ok: false, error: 'Registro(s) de inasistencia no encontrado(s)' })
    }

    // Clasificar estados de los coincidentes y obtener ids elegibles para SofiaPlusSync.
    const coincidentes = await Inasistencia.find(query).select('_id estadoCarga').lean()
    const yaConfirmados = coincidentes.filter(d => d.estadoCarga === 'SUBIDA').length
    const noListos = coincidentes.filter(d => d.estadoCarga === 'EN_ESPERA').length
    const idsElegibles = coincidentes
      .filter(d => d.estadoCarga === 'LISTO_PARA_SUBIR' || d.estadoCarga === 'SUBIDA')
      .map(d => d._id)

    // Actualizar SOLO los que están LISTO_PARA_SUBIR a SUBIDA (nunca EN_ESPERA).
    const updateResult = await Inasistencia.updateMany(
      { ...query, estadoCarga: 'LISTO_PARA_SUBIR' },
      { $set: { estadoCarga: 'SUBIDA', fechaSubidaSofia: new Date() } }
    )

    // Actualizar o marcar en la colección SofiaPlusSync solo los ids elegibles.
    if (idsElegibles.length > 0) {
      await SofiaPlusSync.updateMany(
        { $or: [{ inasistenciaId: { $in: idsElegibles } }, { asistenciaId: { $in: idsElegibles } }] },
        { $set: { estadoSync: 'subido', fechaSubida: new Date() } }
      )
    }

    res.json({
      ok: true,
      mensaje: 'Inasistencia(s) confirmada(s) y sincronizada(s) con Sofia Plus exitosamente',
      actualizados: updateResult.modifiedCount,
      yaConfirmados,
      noListos
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

export async function ejecutarRobotRPA(req, res) {
  try {
    const { doc, fecha, ficha, dryRun, limite, headless } = req.body || {}
    const resultado = await ejecutarRPAInasistencias({
      doc,
      fecha,
      ficha,
      dryRun,
      limite,
      headless
    })

    if (!resultado.ok) {
      return res.status(400).json(resultado)
    }
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}

// Consultar el estado actual de ejecución del Robot RPA
export function getEstadoRobotRPA(req, res) {
  try {
    const estado = obtenerEstadoRPA()
    res.json({ ok: true, estado })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
