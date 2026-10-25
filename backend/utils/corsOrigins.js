/**
 * Lista blanca de orígenes para CORS (Express y Socket.IO).
 * - Peticiones sin Origin (huellero Electron, curl, mismo origen en GET) se permiten:
 *   CORS solo protege navegadores; la autenticación la hace JWT / token de dispositivo.
 * - Producción: dominio de Render + los definidos en CORS_ORIGINS (separados por coma).
 * - Desarrollo: además localhost y túneles de desarrollo.
 */
const ORIGENES_FIJOS = [
  'https://huelleroactualizado-1.onrender.com',
]

const ORIGENES_ENV = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

const ES_PRODUCCION = process.env.NODE_ENV === 'production'

export function esOrigenPermitido(origin) {
  if (!origin) return true
  if (ORIGENES_FIJOS.includes(origin) || ORIGENES_ENV.includes(origin)) return true
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
