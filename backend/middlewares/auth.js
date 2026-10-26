import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcryptjs from 'bcryptjs'
import Dispositivo from '../models/Dispositivo.js'

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'
const JWT_ALGORITHM = 'HS256'

/**
 * El secreto JWT es obligatorio en producción (mínimo 32 caracteres).
 * En desarrollo, si falta, se genera uno aleatorio por arranque (las sesiones
 * se invalidan al reiniciar) en lugar de usar un valor fijo publicado en el repo.
 */
function resolverSecretoJWT() {
  const secreto = process.env.JWT_SECRET
  if (secreto && secreto.length >= 32) return secreto
  if (process.env.NODE_ENV === 'production') {
    console.error('[Seguridad] JWT_SECRET no definido o con menos de 32 caracteres. Abortando arranque.')
    process.exit(1)
  }
  console.warn('[Seguridad] JWT_SECRET ausente o débil: usando un secreto aleatorio temporal (solo desarrollo).')
  return crypto.randomBytes(48).toString('hex')
}

const JWT_SECRET = resolverSecretoJWT()
const VERIFY_OPTS = { algorithms: [JWT_ALGORITHM] }

/**
 * Genera un token JWT firmado para la sesión del usuario
 * @param {Object} payload { id, rol, correo, nombre }
 * @returns {string} Token JWT
 */
export function generarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM })
}

/**
 * Verifica un token JWT y devuelve el payload decodificado, o null si es
 * inválido/expirado. Reutilizado por el WebSocket (unirse_sala) para no
 * duplicar la lógica de verificación del middleware Express.
 */
export function verificarTokenJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET, VERIFY_OPTS)
  } catch (_) {
    return null
  }
}

/**
 * Middleware de autenticación obligatoria mediante JWT
 * Extrae y valida la cabecera 'Authorization: Bearer <token>'
 */
export function autenticarJWT(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

  if (!token) {
    return res.status(401).json({
      error: 'Acceso no autorizado. Se requiere un token de sesión válido.',
      code: 'TOKEN_MISSING'
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, VERIFY_OPTS)
    req.usuario = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Tu sesión ha expirado. Por favor ingresa nuevamente.',
        code: 'TOKEN_EXPIRED'
      })
    }
    return res.status(401).json({
      error: 'Token de autenticación inválido o alterado.',
      code: 'TOKEN_INVALID'
    })
  }
}

/**
 * Middleware de autorización por roles
 * Valida que el rol provenga del token JWT criptográficamente verificado
 * @param {Array<string>} rolesPermitidos Lista de roles permitidos (ej. ['Administrador', 'Instructor'])
 */
export function verificarRol(rolesPermitidos = []) {
  return (req, res, next) => {
    if (!rolesPermitidos || rolesPermitidos.length === 0) {
      return next()
    }

    const rolUsuario = req.usuario?.rol

    if (!rolUsuario || !rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        error: `Acceso restringido. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`,
        code: 'FORBIDDEN'
      })
    }

    next()
  }
}

/**
 * Middleware de autorización: permite el acceso si el rol está en la lista,
 * o si se trata de un Instructor Líder (rol 'Instructor' + esLider === true).
 * Pensado para rutas que deben estar disponibles para Administrador y para
 * el Instructor Líder, pero no para el Instructor Común.
 * @param {Array<string>} rolesPermitidos Lista de roles permitidos (ej. ['Administrador'])
 */
export function verificarRolOLider(rolesPermitidos = []) {
  return async (req, res, next) => {
    if (!rolesPermitidos || rolesPermitidos.length === 0) {
      return next()
    }

    const rolUsuario = req.usuario?.rol
    let esLider = req.usuario?.esLider === true

    if (rolUsuario === 'Instructor' && !esLider && (req.usuario?.id || req.usuario?._id)) {
      try {
        const Ficha = (await import('../models/Ficha.js')).default
        const liderDeFicha = await Ficha.exists({ instructorLiderId: req.usuario.id || req.usuario._id })
        if (liderDeFicha) esLider = true
      } catch (_) {}
    }

    const permitidoPorRol = rolUsuario && rolesPermitidos.includes(rolUsuario)
    const permitidoPorLider = rolUsuario === 'Instructor' && esLider

    if (!permitidoPorRol && !permitidoPorLider) {
      return res.status(403).json({
        error: `Acceso restringido. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`,
        code: 'FORBIDDEN'
      })
    }

    next()
  }
}

/**
 * Middleware de autenticación opcional
 * Si hay un token presente lo decodifica y lo adjunta a req.usuario, pero no bloquea si no lo hay.
 */
export function autenticarOpcional(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

  if (token) {
    try {
      req.usuario = jwt.verify(token, JWT_SECRET, VERIFY_OPTS)
    } catch (_) {
      // Ignorar error para permitir acceso no autenticado si aplica
    }
  }
  next()
}

/**
 * Verifica las credenciales de un dispositivo huellero (deviceId + token)
 * contra el tokenHash guardado. Devuelve el documento si es válido y está activo.
 */
export async function verificarCredencialesDispositivo(deviceId, token) {
  if (!deviceId || !token || typeof deviceId !== 'string' || typeof token !== 'string') return null
  try {
    const dispositivo = await Dispositivo.findOne({ deviceId })
    if (!dispositivo || dispositivo.activo !== true || !dispositivo.tokenHash) return null
    const ok = await bcryptjs.compare(token, dispositivo.tokenHash)
    return ok ? dispositivo : null
  } catch (_) {
    return null
  }
}

/**
 * Permite el acceso con JWT de Administrador/Instructor o con credenciales
 * de un dispositivo huellero aprobado (cabeceras x-device-id / x-device-token).
 * Si hay JWT válido de otro rol (p. ej. Estudiante) también se adjunta a
 * req.usuario para que el controlador restrinja los datos a su propio registro.
 */
export function autenticarJWTODispositivo(rolesPermitidos = ['Administrador', 'Instructor', 'Estudiante']) {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, VERIFY_OPTS)
        if (rolesPermitidos.includes(decoded.rol)) {
          req.usuario = decoded
          return next()
        }
      } catch (_) { /* se intenta con credenciales de dispositivo */ }
    }

    const dispositivo = await verificarCredencialesDispositivo(req.headers['x-device-id'], req.headers['x-device-token'])
    if (dispositivo) {
      req.dispositivo = dispositivo
      return next()
    }

    return res.status(401).json({
      error: 'Acceso no autorizado. Se requiere un token de sesión válido.',
      code: 'TOKEN_MISSING'
    })
  }
}

/**
 * Middleware de autenticación para los endpoints del Robot RPA (Sofia Plus).
 * Acepta:
 *  (a) la cabecera 'x-rpa-key' igual a process.env.RPA_API_KEY, comparada con
 *      crypto.timingSafeEqual (si las longitudes difieren, se rechaza sin lanzar
 *      excepción), o
 *  (b) un JWT válido de rol Administrador (reutilizando verificarTokenJWT).
 * Si RPA_API_KEY no está definida, la vía (a) queda deshabilitada (fail closed)
 * y se escribe una advertencia en consola sin imprimir ninguna clave.
 */
export function autenticarRPA(req, res, next) {
  const apiKey = process.env.RPA_API_KEY
  const headerKey = req.headers['x-rpa-key']

  if (apiKey && headerKey && typeof headerKey === 'string') {
    const keyBuf = Buffer.from(apiKey)
    const headerBuf = Buffer.from(headerKey)
    if (keyBuf.length === headerBuf.length && crypto.timingSafeEqual(keyBuf, headerBuf)) {
      return next()
    }
  } else if (!apiKey) {
    console.warn('[Seguridad] RPA_API_KEY no definida: la autenticación por clave del RPA queda deshabilitada (fail closed).')
  }

  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
  if (token) {
    const decoded = verificarTokenJWT(token)
    if (decoded && decoded.rol === 'Administrador') {
      req.usuario = decoded
      return next()
    }
  }

  return res.status(401).json({
    ok: false,
    error: 'Acceso no autorizado. Se requiere una clave de RPA válida o un token de Administrador.'
  })
}
