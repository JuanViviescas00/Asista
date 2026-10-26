import mongoose from 'mongoose'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import Inasistencia from '../models/Inasistencia.js'
import ReporteDesercion from '../models/ReporteDesercion.js'
import ConfiguracionSistema from '../models/ConfiguracionSistema.js'
import { enviarReporteRutaDesercion } from '../services/emailService.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esObjectIdValido(valor) {
  return mongoose.Types.ObjectId.isValid(String(valor || ''))
}

function correosDeVariableEnv(valor) {
  return String(valor || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c && EMAIL_REGEX.test(c))
}

async function obtenerCorreosGlobales() {
  const config = await ConfiguracionSistema.findOne({ clave: 'general' })
  const coordinador = correosDeVariableEnv(config?.correoCoordinador || process.env.CORREO_COORDINADOR)
  const bienestar = correosDeVariableEnv(config?.correoBienestar || process.env.CORREO_BIENESTAR)
  return { coordinador, bienestar }
}

export async function estadoCorreosRutaDesercion(req, res) {
  try {
    const { coordinador, bienestar } = await obtenerCorreosGlobales()
    res.json({
      listo: coordinador.length > 0 && bienestar.length > 0,
      falta: {
        coordinador: coordinador.length === 0,
        bienestar: bienestar.length === 0,
      },
    })
  } catch (err) {
    console.error('Error al consultar el estado de los correos del reporte:', err.message)
    res.status(500).json({ error: 'Error interno al consultar el estado.' })
  }
}

export async function reportarRutaDesercion(req, res) {
  try {
    const { estudianteId, fichaId } = req.body || {}

    if (!esObjectIdValido(estudianteId) || !esObjectIdValido(fichaId)) {
      return res.status(400).json({ error: 'estudianteId y fichaId deben ser identificadores válidos.' })
    }

    const [estudiante, ficha] = await Promise.all([
      Estudiante.findById(estudianteId),
      Ficha.findById(fichaId).populate('instructorLiderId instructores'),
    ])

    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado.' })
    if (!ficha) return res.status(404).json({ error: 'Ficha no encontrada.' })

    // El estudiante debe pertenecer a la ficha indicada
    if (String(estudiante.fichaId) !== String(ficha._id)) {
      return res.status(400).json({ error: 'El estudiante no pertenece a la ficha indicada.' })
    }

    // Autorización: Administrador, o Instructor asignado a la ficha (líder o equipo)
    const usuarioId = String(req.usuario?.id || '')
    const rol = req.usuario?.rol
    if (rol !== 'Administrador') {
      if (rol !== 'Instructor') {
        return res.status(403).json({ error: 'No tienes permiso para reportar a la ruta de deserción.' })
      }
      const esLider = String(ficha.instructorLiderId?._id || ficha.instructorLiderId || '') === usuarioId
      const esDocente = Array.isArray(ficha.instructores) && ficha.instructores.some((i) => String(i?._id || i) === usuarioId)
      if (!esLider && !esDocente) {
        return res.status(403).json({ error: 'Solo puedes reportar aprendices de fichas donde estés asignado como docente.' })
      }
    }

    // Faltas del estudiante en la ficha (tipo 'Falta', sin excusa). Solo se arma el detalle.
    const inasistencias = await Inasistencia.find({
      estudianteId: estudiante._id,
      fichaId: ficha._id,
      tipo: 'Falta',
    }).select('fecha').sort({ fecha: 1 })

    const fechasFallas = inasistencias.map((i) => i.fecha)

    // Destinatarios: coordinador + bienestar (BD con respaldo en env) + correos del equipo docente
    const { coordinador, bienestar } = await obtenerCorreosGlobales()

    if (!coordinador.length || !bienestar.length) {
      return res.status(409).json({ error: 'Faltan los correos del coordinador y/o de bienestar. El administrador debe configurarlos en su Perfil.' })
    }

    const para = new Set([...coordinador, ...bienestar])

    const cc = new Set()
    const equipo = []
    if (ficha.instructorLiderId) equipo.push(ficha.instructorLiderId)
    if (Array.isArray(ficha.instructores)) equipo.push(...ficha.instructores.filter(Boolean))
    for (const inst of equipo) {
      const correo = String(inst?.correo || '').trim().toLowerCase()
      if (correo && EMAIL_REGEX.test(correo)) cc.add(correo)
    }

    const destinatarios = [...new Set([...para, ...cc])]
    if (!destinatarios.length) {
      return res.status(400).json({ error: 'No hay destinatarios configurados para el reporte. Revisa CORREO_COORDINADOR, CORREO_BIENESTAR o los correos de los docentes de la ficha.' })
    }

    const listaPara = [...para]
    const listaCc = [...cc]

    const nombreEstudiante = `${estudiante.nombres || ''} ${estudiante.apellidos || ''}`.trim()

    const simulado = process.env.RUTA_REPORTE_ENVIO_REAL !== 'true'

    if (!simulado) {
      try {
        await enviarReporteRutaDesercion({
          destinatarios,
          para: listaPara,
          cc: listaCc,
          estudiante: {
            nombre: nombreEstudiante,
            tipoDocumento: estudiante.tipoDocumento,
            numeroDocumento: estudiante.numeroDocumento,
          },
          ficha: {
            codigoFicha: ficha.codigoFicha,
            nombrePrograma: ficha.nombrePrograma,
          },
          fechasFallas,
          reportadoPor: req.usuario?.nombre || rol,
        })
      } catch (err) {
        console.error('No se pudo enviar el correo del reporte de ruta de deserción:', err.message)
        return res.status(502).json({ error: 'No se pudo enviar el correo del reporte. Intenta de nuevo.' })
      }
    }

    const registro = await new ReporteDesercion({
      estudianteId: estudiante._id,
      fichaId: ficha._id,
      fechasFallas,
      destinatarios,
      simulado,
      enviadoPor: { id: req.usuario?.id, rol: req.usuario?.rol },
    }).save()

    res.json({
      ok: true,
      simulado,
      destinatarios,
      reportadoEn: registro.createdAt,
    })
  } catch (err) {
    console.error('Error al reportar a la ruta de deserción:', err.message)
    res.status(500).json({ error: 'Error interno al procesar el reporte de deserción.' })
  }
}
