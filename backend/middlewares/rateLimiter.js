import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// En sedes con NAT muchos equipos comparten la misma IP pública: los límites de
// dispositivos se cuentan por deviceId (si viene) y no por IP.
function clavePorDispositivo(req) {
  const deviceId = req.headers['x-device-id'] || req.body?.deviceId
  if (typeof deviceId === 'string' && deviceId.length > 0 && deviceId.length <= 100) return `dev:${deviceId}`
  return ipKeyGenerator(req.ip)
}

/**
 * Limitador de intentos para el inicio de sesión (previene ataques de fuerza bruta)
 * Permite hasta 20 intentos cada 15 minutos por dirección IP (solo cuenta los fallidos).
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // Máximo 20 intentos fallidos por IP cada 15 minutos
  skipSuccessfulRequests: true,
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

/**
 * Limitador general de la API: frena scraping y abuso automatizado
 * sin afectar el uso normal (incluido el kiosco/huellero).
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: 'Demasiadas solicitudes desde esta conexión. Intente de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Registro de nuevos dispositivos huellero (endpoint público): máximo 50 por hora por IP
 * (holgado para instalar varios equipos en la misma sede; cada uno queda pendiente de aprobación).
 */
export const registroDispositivoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Demasiados registros de dispositivos desde esta conexión. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Endpoints autenticados por dispositivo (sync, plantillas, enrolamiento):
 * limita intentos de adivinar credenciales de dispositivo.
 */
export const dispositivoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: clavePorDispositivo,
  message: { error: 'Demasiadas solicitudes del dispositivo. Intente de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})
