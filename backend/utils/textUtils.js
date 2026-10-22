/**
 * Utilidades de formateo y estandarización de texto para el backend.
 */

export const TIPOS_DOCUMENTO_CODIGOS = ['CC', 'TI', 'CE', 'PA', 'PEP', 'PPT', 'CD', 'RC', 'SC']

export const TIPOS_DOCUMENTO = [
  { codigo: 'CC', descripcion: 'Cédula de Ciudadanía' },
  { codigo: 'TI', descripcion: 'Tarjeta de Identidad' },
  { codigo: 'CE', descripcion: 'Cédula de Extranjería' },
  { codigo: 'PA', descripcion: 'Pasaporte' },
  { codigo: 'PEP', descripcion: 'Permiso Especial de Permanencia' },
  { codigo: 'PPT', descripcion: 'Permiso por Protección Temporal' },
  { codigo: 'CD', descripcion: 'Carné Diplomático' },
  { codigo: 'RC', descripcion: 'Registro Civil' },
  { codigo: 'SC', descripcion: 'Salvoconducto de Permanencia' },
]

/**
 * Convierte un texto a Capitalize / Title Case.
 * Ejemplo: "JUAN CARLOS PÉREZ" -> "Juan Carlos Pérez"
 *          "maría de los ángeles" -> "María De Los Ángeles"
 *          "gómez-restrepo" -> "Gómez-Restrepo"
 * @param {string} str Texto a capitalizar
 * @returns {string} Texto formateado
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
 * @param {string} tipo
 * @returns {string} Código oficial (CC, TI, CE, PA, PEP, PPT, CD, RC, SC)
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
 * "diurna" -> "Mañana", "nocturna" -> "Noche", "vespertina" -> "Tarde", etc.
 * @param {string} j
 * @returns {string} Mañana, Tarde, Noche o Mixta
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
 * Normaliza un número de documento o código de ficha (elimina puntos, espacios y guiones).
 * @param {string|number} doc
 * @returns {string}
 */
export function normalizarNumeroDocumento(doc) {
  if (doc === null || doc === undefined) return ''
  return String(doc).trim().replace(/[\.\s-]/g, '')
}
