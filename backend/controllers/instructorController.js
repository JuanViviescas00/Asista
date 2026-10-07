import mongoose from 'mongoose'
import Instructor from '../models/Instructor.js'
import Ficha from '../models/Ficha.js'
import Asistencia from '../models/Asistencia.js'
import { hashPassword } from '../services/passwordService.js'
import { encrypt, decrypt } from '../services/cryptoService.js'

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
      if (obj.passwordSofiaPlus) {
        obj.passwordSofiaPlus = decrypt(obj.passwordSofiaPlus)
      }
      const esLiderEnFicha = idsLideres.has(String(inst._id))
      return {
        ...obj,
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
    const clavePlana = data.password || 'sena2026'
    data.password = await hashPassword(clavePlana)

    if (data.passwordSofiaPlus) {
      data.passwordSofiaPlus = encrypt(data.passwordSofiaPlus)
    }

    const instructor = new Instructor(data)
    await instructor.save()

    const obj = instructor.toObject()
    delete obj.password
    if (obj.passwordSofiaPlus) {
      obj.passwordSofiaPlus = decrypt(obj.passwordSofiaPlus)
    }
    res.status(201).json(obj)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateInstructor(req, res) {
  try {
    const data = { ...req.body }
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

    const obj = instructor.toObject()
    delete obj.password
    if (obj.passwordSofiaPlus) {
      obj.passwordSofiaPlus = decrypt(obj.passwordSofiaPlus)
    }
    res.json(obj)
  } catch (err) {
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
        if (!rest.rol) rest.rol = 'Instructor'

        const existe = await Instructor.findOne({
          $or: [
            { numeroDocumento: String(rest.numeroDocumento).trim() },
            { correo: rest.correo }
          ]
        })

        let instructor
        if (!existe) {
          const clavePlana = password || 'sena2026'
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
export async function getCredencialesSofia(req, res) {
  try {
    const instructor = await Instructor.findById(req.params.id)
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

    // Fichas donde el instructor es líder o instructor de apoyo
    const fichas = await Ficha.find({
      $or: [
        { instructorLiderId: instructor._id },
        { instructores: instructor._id }
      ]
    })
    const fichaIds = fichas.map(f => f._id)

    let targetFichaIds = fichaIds
    if (fichaId) {
      const fichaDoc = await resolverFicha(fichaId)
      targetFichaIds = fichaDoc ? [fichaDoc._id] : []
    }

    const filter = {
      fichaId: { $in: targetFichaIds },
      estado: { $in: ['Falta', 'Tardanza'] }
    }
    if (fecha) filter.fecha = fecha

    const asistencias = await Asistencia.find(filter)
      .populate('estudianteId')
      .populate('fichaId')
      .sort({ fecha: -1, 'fichaId.codigoFicha': 1 })

    const inasistencias = asistencias
      .filter(a => a.estudianteId && a.fichaId)
      .map(a => {
        const jNorm = String(a.fichaId?.jornada || '').toLowerCase()
        const esNoche = jNorm.includes('noche') || jNorm.includes('nocturn')
        const horasJornada = esNoche ? 5 : 6
        const horas = a.horasTardanza || (a.estado === 'Falta' || a.estado === 'Excusada' ? horasJornada : 1)
        return {
          asistenciaId: a._id,
          fecha: a.fecha,
          estado: a.estado,
          horas,
          ficha: {
            id: a.fichaId._id,
            codigo: a.fichaId.codigoFicha || '',
            nombre: a.fichaId.nombre || '',
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
          justificacion: a.estado === 'Excusada'
            ? 'Falla justificada'
            : (a.estado === 'Falta'
                ? 'Falla injustificada'
                : 'Tardanza injustificada')
        }
      })

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
      // Fichas donde el instructor es líder o instructor de apoyo
      const fichas = await Ficha.find({
        $or: [
          { instructorLiderId: inst._id },
          { instructores: inst._id }
        ]
      })

      if (!fichas || fichas.length === 0) continue

      const fichaIds = fichas.map(f => f._id)

      const filter = {
        fichaId: { $in: fichaIds },
        estado: { $in: ['Falta', 'Tardanza'] }
      }
      if (fecha) filter.fecha = fecha

      const asistencias = await Asistencia.find(filter)
        .populate('estudianteId')
        .populate('fichaId')
        .sort({ fecha: -1, 'fichaId.codigoFicha': 1 })

      const inasistenciasValidas = asistencias.filter(a => a.estudianteId && a.fichaId)

      if (inasistenciasValidas.length === 0) continue

      // Agrupar por ficha
      const fichasMap = new Map()
      inasistenciasValidas.forEach(a => {
        const fCodigo = a.fichaId.codigoFicha || 'SIN_CODIGO'
        if (!fichasMap.has(fCodigo)) {
          fichasMap.set(fCodigo, {
            id: a.fichaId._id,
            codigo: fCodigo,
            nombre: a.fichaId.nombre || '',
            jornada: a.fichaId.jornada || '',
            aprendices: []
          })
        }

        const jNorm = String(a.fichaId?.jornada || '').toLowerCase()
        const esNoche = jNorm.includes('noche') || jNorm.includes('nocturn')
        const horasJornada = esNoche ? 5 : 6
        const horas = a.horasTardanza || (a.estado === 'Falta' || a.estado === 'Excusada' ? horasJornada : 1)
        fichasMap.get(fCodigo).aprendices.push({
          asistenciaId: a._id,
          fecha: a.fecha,
          estado: a.estado,
          horas,
          aprendiz: {
            id: a.estudianteId._id,
            tipoDocumento: a.estudianteId.tipoDocumento || 'CC',
            numeroDocumento: a.estudianteId.numeroDocumento || '',
            nombres: a.estudianteId.nombres || '',
            apellidos: a.estudianteId.apellidos || '',
            nombreCompleto: `${a.estudianteId.nombres || ''} ${a.estudianteId.apellidos || ''}`.trim()
          },
          justificacion: a.estado === 'Excusada'
            ? 'Falla justificada'
            : (a.estado === 'Falta'
                ? 'Falla injustificada'
                : 'Tardanza injustificada')
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


