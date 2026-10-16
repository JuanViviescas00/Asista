import Admin from '../models/Admin.js'
import Instructor from '../models/Instructor.js'
import Estudiante from '../models/Estudiante.js'
import Ficha from '../models/Ficha.js'
import { generarToken } from '../middlewares/auth.js'
import { hashPassword, verifyAndUpgradePassword } from '../services/passwordService.js'
import { enviarCorreoRecuperacion, enviarCorreoConfirmacionCambioPassword } from '../services/emailService.js'

export async function login(req, res) {
  try {
    const { correo, password } = req.body
    if (!correo) {
      return res.status(400).json({ error: 'Correo o número de documento requerido' })
    }

    const identificador = String(correo).trim()

    // 1. Buscar en Administradores (por correo)
    const admin = await Admin.findOne({ correo: identificador })
    if (admin) {
      if (!password) {
        return res.status(400).json({ error: 'Contraseña requerida para cuenta de Administrador' })
      }
      const passOk = await verifyAndUpgradePassword(admin, password)
      if (passOk) {
        const payload = { id: admin._id, nombre: admin.nombre, correo: admin.correo, rol: admin.rol || 'Administrador' }
        const token = generarToken(payload)
        return res.json({
          ok: true,
          token,
          usuario: payload,
          admin: payload
        })
      }
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    // 2. Buscar en Instructores (por correo o número de documento)
    const instructor = await Instructor.findOne({
      $or: [{ correo: identificador }, { numeroDocumento: identificador }]
    })
    if (instructor) {
      if (instructor.estado === 'Inactivo') {
        return res.status(403).json({ error: 'Tu cuenta de instructor se encuentra inactiva' })
      }
      if (!password) {
        // Si no se proporcionó contraseña (consulta desde pestaña Aprendiz),
        // verificar si el identificador corresponde a un Aprendiz antes de fallar
        const estudianteFallback = await Estudiante.findOne({
          $or: [{ numeroDocumento: identificador }, { correo: identificador }]
        })
        if (estudianteFallback) {
          if (estudianteFallback.estado !== 'Activo') {
            return res.status(403).json({ error: `Tu cuenta de aprendiz se encuentra en estado ${estudianteFallback.estado}` })
          }
          const nombreCompleto = `${estudianteFallback.nombres} ${estudianteFallback.apellidos}`
          const payload = {
            id: estudianteFallback._id,
            nombre: nombreCompleto,
            correo: estudianteFallback.correo,
            rol: 'Estudiante',
            estudianteId: estudianteFallback._id
          }
          const token = generarToken(payload)
          return res.json({
            ok: true,
            token,
            usuario: payload,
            admin: payload
          })
        }
        return res.status(400).json({ error: 'Contraseña requerida para cuenta de Instructor' })
      }
      const passOk = await verifyAndUpgradePassword(instructor, password)
      if (passOk) {
        const fichaLider = await Ficha.findOne({ instructorLiderId: instructor._id })
        const esLider = !!(instructor.esLider || fichaLider)
        const nombreCompleto = `${instructor.nombres} ${instructor.apellidos}`
        const payload = {
          id: instructor._id,
          nombre: nombreCompleto,
          correo: instructor.correo,
          rol: 'Instructor',
          esLider,
          rolDetallado: esLider ? 'Instructor Líder' : 'Instructor Común'
        }
        const token = generarToken(payload)
        return res.json({
          ok: true,
          token,
          usuario: payload,
          admin: payload
        })
      }
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    // 3. Buscar en Estudiantes / Aprendices (Consulta directa por documento o correo, sin requerir contraseña)
    const estudiante = await Estudiante.findOne({
      $or: [{ numeroDocumento: identificador }, { correo: identificador }]
    })
    if (estudiante) {
      if (estudiante.estado !== 'Activo') {
        return res.status(403).json({ error: `Tu cuenta de aprendiz se encuentra en estado ${estudiante.estado}` })
      }

      // Los aprendices acceden de forma directa por documento para consulta
      const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`
      const payload = {
        id: estudiante._id,
        nombre: nombreCompleto,
        correo: estudiante.correo,
        rol: 'Estudiante',
        estudianteId: estudiante._id
      }
      const token = generarToken(payload)
      return res.json({
        ok: true,
        token,
        usuario: payload,
        admin: payload
      })
    }

    return res.status(401).json({ error: 'Usuario no encontrado o credenciales incorrectas' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getPerfil(req, res) {
  try {
    const admin = await Admin.findOne()
    if (!admin) return res.json(null)
    res.json({ nombre: admin.nombre, rol: admin.rol, telefono: admin.telefono, correo: admin.correo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updatePerfil(req, res) {
  try {
    const { nombre, telefono, correo, password } = req.body
    const usuarioId = req.usuario?.id
    if (!usuarioId) {
      return res.status(401).json({ error: 'Usuario no autenticado' })
    }

    let usuario = null
    if (req.usuario.rol === 'Administrador') {
      usuario = await Admin.findById(usuarioId)
    } else if (req.usuario.rol === 'Instructor') {
      usuario = await Instructor.findById(usuarioId)
    }

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (nombre !== undefined) {
      if (usuario.nombre !== undefined) usuario.nombre = nombre
      if (usuario.nombres !== undefined) usuario.nombres = nombre
    }
    if (telefono !== undefined) usuario.telefono = telefono
    if (correo !== undefined) usuario.correo = correo
    if (password) {
      usuario.password = await hashPassword(password)
    }

    await usuario.save()

    if (password && usuario.correo) {
      const nombreUsuario = usuario.nombre || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim() || 'Usuario'
      enviarCorreoConfirmacionCambioPassword(usuario.correo, nombreUsuario).catch(err => {
        console.error('[Email] Error al enviar confirmación de cambio de contraseña (perfil):', err.message)
      })
    }

    res.json({
      ok: true,
      perfil: {
        id: usuario._id,
        nombre: usuario.nombre || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim(),
        rol: usuario.rol,
        telefono: usuario.telefono,
        correo: usuario.correo
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function recoveryCode(req, res) {
  try {
    const { correo } = req.body
    if (!correo) return res.status(400).json({ error: 'Correo requerido' })

    const correoLimpio = String(correo).trim().toLowerCase()
    const admin = await Admin.findOne({ correo: correoLimpio })
    const instructor = await Instructor.findOne({ correo: correoLimpio })

    const usuario = admin || instructor
    if (!usuario) {
      return res.status(404).json({ error: 'No existe una cuenta asociada a este correo electrónico' })
    }

    // Generar PIN aleatorio seguro de 6 dígitos y almacenarlo hasheado con expiración
    const codigo = String(Math.floor(100000 + Math.random() * 900000))
    usuario.codigoRecuperacion = await hashPassword(codigo)
    usuario.expiraCodigoRecuperacion = new Date(Date.now() + 10 * 60 * 1000)
    await usuario.save()

    // Enviar código exclusivamente por correo electrónico institucional
    try {
      await enviarCorreoRecuperacion(correoLimpio, codigo)
    } catch (emailErr) {
      console.error('[Email] Error al enviar correo de recuperación:', emailErr.message)
      return res.status(500).json({ error: 'No se pudo enviar el correo de recuperación. Revisa la configuración del servidor SMTP.' })
    }

    // NUNCA divulgar el código en la respuesta HTTP
    res.json({ ok: true, message: 'Código de recuperación enviado a tu correo electrónico.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function resetPassword(req, res) {
  try {
    const { correo, codigo, nuevaPassword } = req.body
    if (!correo || !codigo || !nuevaPassword) {
      return res.status(400).json({ error: 'Correo, código de verificación y nueva contraseña son requeridos' })
    }

    if (nuevaPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
    }

    const correoLimpio = String(correo).trim().toLowerCase()
    const admin = await Admin.findOne({ correo: correoLimpio })
    const instructor = await Instructor.findOne({ correo: correoLimpio })
    const usuario = admin || instructor

    if (!usuario) {
      return res.status(404).json({ error: 'No se encontró ninguna cuenta asociada a este correo' })
    }

    if (!usuario.codigoRecuperacion || !usuario.expiraCodigoRecuperacion) {
      return res.status(400).json({ error: 'No hay una solicitud de recuperación activa para esta cuenta' })
    }

    if (new Date() > new Date(usuario.expiraCodigoRecuperacion)) {
      usuario.codigoRecuperacion = null
      usuario.expiraCodigoRecuperacion = null
      await usuario.save()
      return res.status(400).json({ error: 'El código de verificación ha expirado. Solicita uno nuevo.' })
    }

    // Validar el código contra el hash guardado en la base de datos
    const codigoValido = await verifyAndUpgradePassword(
      { password: usuario.codigoRecuperacion, save: () => {} },
      String(codigo).trim()
    )
    if (!codigoValido) {
      return res.status(400).json({ error: 'Código de verificación incorrecto' })
    }

    // Código verificado con éxito: actualizar contraseña y limpiar código
    usuario.password = await hashPassword(nuevaPassword)
    usuario.codigoRecuperacion = null
    usuario.expiraCodigoRecuperacion = null
    await usuario.save()

    if (usuario.correo) {
      const nombreUsuario = usuario.nombre || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim() || 'Usuario'
      enviarCorreoConfirmacionCambioPassword(usuario.correo, nombreUsuario).catch(err => {
        console.error('[Email] Error al enviar confirmación de cambio de contraseña (reset):', err.message)
      })
    }

    res.json({ ok: true, message: 'Contraseña restablecida exitosamente con cifrado seguro' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function cambiarPassword(req, res) {
  try {
    const { id, rol, correo, passwordActual, nuevaPassword } = req.body
    if (!passwordActual || !nuevaPassword) {
      return res.status(400).json({ error: 'Debes ingresar tu contraseña actual y la nueva contraseña.' })
    }

    if (nuevaPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' })
    }

    let usuario = null
    const rolNormalizado = (rol || '').toLowerCase()

    // 1. Buscar según rol o id/correo
    if (rolNormalizado.includes('admin') || (!rol && !id)) {
      if (id) usuario = await Admin.findById(id)
      if (!usuario && correo) usuario = await Admin.findOne({ correo })
      if (!usuario) usuario = await Admin.findOne()
    } else if (rolNormalizado.includes('instructor')) {
      if (id) usuario = await Instructor.findById(id)
      if (!usuario && correo) usuario = await Instructor.findOne({ correo })
    } else {
      if (id) {
        usuario = await Admin.findById(id) || await Instructor.findById(id)
      } else if (correo) {
        usuario = await Admin.findOne({ correo }) || await Instructor.findOne({ correo })
      }
    }

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' })
    }

    // 2. Verificar si la contraseña actual coincide mediante verifyAndUpgradePassword
    const passOk = await verifyAndUpgradePassword(usuario, passwordActual)
    if (!passOk) {
      return res.status(400).json({ error: 'La contraseña actual no coincide. Verifica e intenta de nuevo.' })
    }

    // 3. Hashear y guardar la nueva contraseña con bcrypt
    usuario.password = await hashPassword(nuevaPassword)
    await usuario.save()

    if (usuario.correo) {
      const nombreUsuario = usuario.nombre || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim() || 'Usuario'
      enviarCorreoConfirmacionCambioPassword(usuario.correo, nombreUsuario).catch(err => {
        console.error('[Email] Error al enviar confirmación de cambio de contraseña (cambiarPassword):', err.message)
      })
    }

    return res.json({ ok: true, message: '¡Contraseña actualizada exitosamente con cifrado seguro!' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
