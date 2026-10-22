const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'un', 'una', 'unos', 'unas', 'para', 'por', 'con', 'a', 'o', 'u', 'al'])

export function apodoPrograma(nombre) {
  if (!nombre) return ''
  const texto = String(nombre)
  const match = texto.match(/\(([^)]+)\)\s*$/)
  if (match && match[1].trim()) return match[1].trim().toUpperCase()
  const palabras = texto.split(/\s+/).filter(p => p && !PALABRAS_VACIAS.has(p.toLowerCase()))
  const acronimo = palabras.slice(0, 4).map(p => p[0].toUpperCase()).join('')
  return acronimo || texto
}

export function nombreProgramaLimpio(nombre) {
  if (!nombre) return ''
  return String(nombre).replace(/\s*\([^)]+\)\s*$/, '').trim()
}

export function truncar(texto, max = 24) {
  const s = String(texto ?? '')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function formatearNumeroDocumento(numero) {
  const s = String(numero ?? '').trim()
  if (!/^\d+$/.test(s)) return s
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Estandariza un texto en formato Capitalize / Title Case.
 * Maneja mayúsculas sostenidas, minúsculas, espacios y palabras con guiones.
 * Ejemplo: "JUAN CARLOS PÉREZ" -> "Juan Carlos Pérez"
 */
export function capitalizarTexto(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(palabra => {
      if (!palabra) return ''
      return palabra
        .split('-')
        .map(p => p ? p.charAt(0).toUpperCase() + p.slice(1) : '')
        .join('-')
    })
    .join(' ')
}
