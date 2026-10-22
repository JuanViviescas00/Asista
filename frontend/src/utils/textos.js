const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'un', 'una', 'unos', 'unas', 'para', 'por', 'con', 'a', 'o', 'u', 'al'])

export const TIPOS_DOCUMENTO_CODIGOS = ['CC', 'TI', 'CE', 'PA', 'PEP', 'PPT', 'CD', 'RC', 'SC']

export const TIPOS_DOCUMENTO = [
  { codigo: 'CC', descripcion: 'CC - Cédula de Ciudadanía' },
  { codigo: 'TI', descripcion: 'TI - Tarjeta de Identidad' },
  { codigo: 'CE', descripcion: 'CE - Cédula de Extranjería' },
  { codigo: 'PA', descripcion: 'PA - Pasaporte' },
  { codigo: 'PEP', descripcion: 'PEP - Permiso Especial de Permanencia' },
  { codigo: 'PPT', descripcion: 'PPT - Permiso por Protección Temporal' },
  { codigo: 'CD', descripcion: 'CD - Carné Diplomático' },
  { codigo: 'RC', descripcion: 'RC - Registro Civil' },
  { codigo: 'SC', descripcion: 'SC - Salvoconducto de Permanencia' },
]

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
  const s = String(numero ?? '').trim().replace(/[\.\s-]/g, '')
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

/**
 * Normaliza y estandariza el tipo de documento.
 * Acepta códigos y nombres comunes (ej. "pasaporte", "tarjeta de identidad", "TI", "PA", "CD").
 */
export function normalizarTipoDocumento(tipo) {
  if (!tipo) return 'CC'
  const t = String(tipo).trim().toUpperCase()
  if (['PAS', 'PASAPORTE'].includes(t)) return 'PA'
  if (['CARNE DIPLOMATICO', 'CARNÉ DIPLOMÁTICO', 'DIPLOMATICO', 'DIPLOMÁTICO'].includes(t)) return 'CD'
  if (['TARJETA IDENTIDAD', 'TARJETA DE IDENTIDAD', 'TARJETA'].includes(t)) return 'TI'
  if (['CEDULA', 'CÉDULA', 'CEDULA CIUDADANIA', 'CÉDULA DE CIUDADANÍA', 'CEDULA DE CIUDADANIA'].includes(t)) return 'CC'
  if (['CEDULA EXTRANJERIA', 'CÉDULA DE EXTRANJERÍA', 'CEDULA DE EXTRANJERIA'].includes(t)) return 'CE'
  if (['PERMISO ESPECIAL', 'PERMISO ESPECIAL DE PERMANENCIA'].includes(t)) return 'PEP'
  if (['PERMISO PROTECCION', 'PERMISO POR PROTECCION TEMPORAL', 'PROTECCION TEMPORAL', 'PERMISO PROTECCIÓN TEMPORAL'].includes(t)) return 'PPT'
  if (['REGISTRO CIVIL'].includes(t)) return 'RC'
  if (['SALVOCONDUCTO', 'SALVOCONDUCTO DE PERMANENCIA'].includes(t)) return 'SC'
  if (TIPOS_DOCUMENTO_CODIGOS.includes(t)) return t
  return t
}

/**
 * Normaliza la jornada académica a los estándares oficiales del SENA.
 */
export function normalizarJornada(j) {
  if (!j) return 'Mañana'
  const s = String(j).trim().toLowerCase()
  if (s.includes('mañana') || s.includes('manana') || s.includes('diurna') || s.includes('matutina')) return 'Mañana'
  if (s.includes('tarde') || s.includes('vespertina')) return 'Tarde'
  if (s.includes('noche') || s.includes('nocturna')) return 'Noche'
  if (s.includes('mixta')) return 'Mixta'
  return capitalizarTexto(s)
}

/**
 * Limpia números de documento (elimina puntos, espacios y guiones).
 */
export function normalizarNumeroDocumento(doc) {
  if (doc === null || doc === undefined) return ''
  return String(doc).trim().replace(/[\.\s-]/g, '')
}
