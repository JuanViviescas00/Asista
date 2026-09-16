import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'sena_jwt_super_secret_key_2026_biometria_adso'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

/**
 * Genera un token JWT firmado para la sesión del usuario
 * @param {Object} payload { id, rol, correo, nombre }
 * @returns {string} Token JWT
 */
export function generarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/**
 * Verifica un token JWT y devuelve el payload decodificado, o null si es
 * inválido/expirado. Reutilizado por el WebSocket (unirse_sala) para no
 * duplicar la lógica de verificación del middleware Express.
 */
export function verificarTokenJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
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
    const decoded = jwt.verify(token, JWT_SECRET)
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
 * Middleware de autenticación opcional
 * Si hay un token presente lo decodifica y lo adjunta a req.usuario, pero no bloquea si no lo hay.
 */
export function autenticarOpcional(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

  if (token) {
    try {
      req.usuario = jwt.verify(token, JWT_SECRET)
    } catch (_) {
      // Ignorar error para permitir acceso no autenticado si aplica
    }
  }
  next()
}
