/**
 * Lista blanca de orígenes para CORS (Express y Socket.IO).
 * - Peticiones sin Origin (huellero Electron, curl, mismo origen en GET) se permiten:
 *   CORS solo protege navegadores; la autenticación la hace JWT / token de dispositivo.
 * - Producción: dominios de Render (*.onrender.com), RENDER_EXTERNAL_URL y los definidos en CORS_ORIGIN / CORS_ORIGINS.
 * - Desarrollo: además localhost y túneles de desarrollo.
 */
const ORIGENES_FIJOS = [
  'https://asista.onrender.com',
  'https://huelleroactualizado-1.onrender.com',
]

function obtenerOrigenesEnv() {
  return [
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGINS,
    process.env.ALLOWED_ORIGINS,
    process.env.ORIGENES_PERMITIDOS,
    process.env.RENDER_EXTERNAL_URL,
  ]
    .filter(Boolean)
    .flatMap((val) => String(val).split(','))
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

const ES_PRODUCCION = process.env.NODE_ENV === 'production'

export function esOrigenPermitido(origin) {
  if (!origin) return true

  const origenesEnv = obtenerOrigenesEnv()

  // Wildcard explícito en variables de entorno
  if (origenesEnv.includes('*')) return true

  // Coincidencia exacta en lista fija o en variables de entorno
  if (ORIGENES_FIJOS.includes(origin) || origenesEnv.includes(origin)) return true

  // Cualquier subdominio de Render (ej: https://asista.onrender.com, https://asista-pr-1.onrender.com)
  if (/^https:\/\/[a-z0-9-]+(\.onrender\.com)$/i.test(origin)) return true

  if (!ES_PRODUCCION) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
    if (/^https:\/\/[a-z0-9-]+-\d+\.(use\.devtunnels\.ms|app\.github\.dev)$/i.test(origin)) return true
  }

  return false
}

/**
 * true si el Origin coincide con el host al que llegó la petición (mismo dominio).
 * Detrás de Traefik/Coolify se usa X-Forwarded-Host si existe.
 * Necesario para Socket.IO: el navegador envía Origin también en mismo origen.
 */
export function esMismoOrigen(origin, req) {
  if (!origin) return false
  try {
    const hostOrigen = new URL(origin).host.toLowerCase()
    const hostPeticion = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase()
    return Boolean(hostPeticion) && hostOrigen === hostPeticion
  } catch (_) {
    return false
  }
}
