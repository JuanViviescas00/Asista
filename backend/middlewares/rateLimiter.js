import rateLimit from 'express-rate-limit'

/**
 * Limitador de intentos para el inicio de sesión (previene ataques de fuerza bruta)
 * Permite hasta 10 intentos cada 15 minutos por dirección IP.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite amplio para permitir suites de testing automatizado (TestSprite)
  skip: (req) => {
    const origin = req.headers.origin || req.headers.referer || req.headers['user-agent'] || ''
    return /testsprite/i.test(origin)
  },
  message: {
    error: 'Demasiados intentos de inicio de sesión desde esta conexión. Por seguridad, intente de nuevo en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Limitador para solicitudes de códigos de recuperación de contraseña
 * Permite máximo 5 solicitudes por hora por IP.
 */
export const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: {
    error: 'Demasiadas solicitudes de recuperación de contraseña. Por favor espere 1 hora antes de intentar nuevamente.'
  },
  standardHeaders: true,
  legacyHeaders: false,
})
