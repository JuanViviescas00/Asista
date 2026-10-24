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

/**
 * Elimina marcas diacríticas / acentos de una cadena para comparaciones insensibles.
 * Ejemplo: "Análisis" -> "Analisis"
 */
export function quitarAcentos(str) {
  if (!str || typeof str !== 'string') return ''
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Catálogo canónico predeterminado de programas de formación del SENA.
 */
export const PROGRAMAS_ESTANDAR = [
  {
    nombre: 'Análisis y Desarrollo de Software',
    sigla: 'ADSO',
    codigo: '228106',
    nivel: 'Tecnólogo',
    alias: [
      'analisis y desarrollo de software',
      'analisis y desarrollo del software',
      'analisis y desarrollo',
      'desarrollo de software',
      'adso',
    ],
  },
  {
    nombre: 'Cocina',
    sigla: 'COC',
    codigo: '635503',
    nivel: 'Técnico',
    alias: [
      'cocina',
      'gastronomia',
      'gastronomía',
      'arte culinario',
      'servicios de cocina',
    ],
  },
  {
    nombre: 'Construcción',
    sigla: 'CONS',
    codigo: '836118',
    nivel: 'Técnico',
    alias: [
      'construccion',
      'construcción',
      'construccion de edificaciones',
      'construcción de edificaciones',
      'construcciones',
      'obras civiles',
    ],
  },
  {
    nombre: 'Infraestructura de TI y Comunicaciones (IITIC)',
    sigla: 'IITIC',
    codigo: '228120',
    nivel: 'Tecnólogo',
    alias: [
      'iitic',
      'infraestructura de ti y comunicaciones',
      'infraestructura ti',
      'redes y comunicaciones',
      'infraestructura de tecnologias de la informacion y las comunicaciones',
      'infraestructura de tecnologías de la información y las comunicaciones',
    ],
  },
]

const CONECTORES_PROGRAMA = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'por', 'con', 'a', 'al'])

function capitalizarPrograma(str) {
  const palabras = str.trim().toLowerCase().split(/\s+/)
  return palabras.map((p, index) => {
    if (!p) return ''
    if (index > 0 && CONECTORES_PROGRAMA.has(p)) return p
    if (p.startsWith('(') && p.endsWith(')')) {
      return '(' + p.slice(1, -1).toUpperCase() + ')'
    }
    return p.charAt(0).toUpperCase() + p.slice(1)
  }).join(' ')
}

/**
 * Normaliza el nombre de un programa de formación contra el catálogo canónico o dinámico.
 * Resuelve tildes faltantes, variaciones ("de" vs "del"), siglas (ADSO, IITIC) y mayúsculas.
 * @param {string} nombre
 * @param {Array} catalogoBD Lista opcional de programas activos cargados de la base de datos
 * @returns {string} Nombre estandarizado canónico
 */
export function normalizarNombrePrograma(nombre, catalogoBD = []) {
  if (!nombre || typeof nombre !== 'string') return ''
  const limpio = nombre.trim()
  if (!limpio) return ''

  const sinAcentos = quitarAcentos(limpio).toLowerCase()

  // 1. Buscar en catálogo dinámico de la base de datos si fue proporcionado
  if (Array.isArray(catalogoBD) && catalogoBD.length > 0) {
    for (const prog of catalogoBD) {
      if (!prog || !prog.nombre) continue
      if (quitarAcentos(prog.nombre).toLowerCase() === sinAcentos) return prog.nombre
      if (prog.sigla && quitarAcentos(prog.sigla).toLowerCase() === sinAcentos) return prog.nombre
      if (Array.isArray(prog.alias)) {
        for (const al of prog.alias) {
          if (quitarAcentos(al).toLowerCase() === sinAcentos) return prog.nombre
        }
      }
    }
  }

  // 2. Buscar en catálogo canónico predeterminado
  for (const prog of PROGRAMAS_ESTANDAR) {
    if (quitarAcentos(prog.nombre).toLowerCase() === sinAcentos) return prog.nombre
    if (prog.sigla && quitarAcentos(prog.sigla).toLowerCase() === sinAcentos) return prog.nombre
    if (Array.isArray(prog.alias)) {
      for (const al of prog.alias) {
        if (quitarAcentos(al).toLowerCase() === sinAcentos) return prog.nombre
      }
    }
  }

  // 3. Fallback: aplicar formato Capitalize inteligente respetando conectores
  return capitalizarPrograma(limpio)
}
