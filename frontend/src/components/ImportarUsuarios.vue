<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import * as XLSX from 'xlsx'
import api from '../services/api.js'
import './importarUsuarios.css'

const toast = ref({ show: false, message: '', type: '' })
const tipoImportacion = ref('estudiantes') // 'estudiantes', 'instructores', 'fichas'
const archivoNombre = ref('')
const registros = ref([])
const errores = ref([])
const advertencias = ref([])
const importado = ref(false)
const loading = ref(false)

const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : { id: '', rol: 'Administrador' })
const esLider = ref(false)
const permisoCarga = ref(true)

const HEADERS_ESTUDIANTES = ['Tipo_Doc', 'Num_Doc', 'Nombres', 'Apellidos', 'Genero', 'Correo', 'Telefono', 'Ficha', 'Jornada']
const HEADERS_INSTRUCTORES = ['Tipo_Doc', 'Num_Doc', 'Nombres', 'Apellidos', 'Genero', 'Correo', 'Telefono', 'Ficha', 'Es_Lider', 'Jornada']
const HEADERS_FICHAS = ['Codigo_Ficha', 'Nombre_Programa', 'Jornada', 'Aula_Asignada', 'Fecha_Inicio', 'Fecha_Fin']

const headersEsperados = computed(() => {
  if (tipoImportacion.value === 'fichas') return HEADERS_FICHAS
  if (tipoImportacion.value === 'instructores') return HEADERS_INSTRUCTORES
  return HEADERS_ESTUDIANTES
})

const fichasList = ref([])
const estudiantesExistentes = ref([])
const instructoresExistentes = ref([])

onMounted(async () => {
  try {
    const [fRes, eRes, iRes] = await Promise.all([
      api.fichas.getAll(),
      api.estudiantes.getAll(),
      api.instructores.getAll()
    ])
    fichasList.value = fRes
    estudiantesExistentes.value = eRes
    instructoresExistentes.value = iRes
  } catch (e) {}

  if (usuario.value.rol === 'Instructor') {
    try {
      const misFichas = await api.fichas.getMisFichas(usuario.value.id)
      esLider.value = misFichas.some(f => f.esLider)
      if (!esLider.value) {
        permisoCarga.value = false
      }
    } catch (e) {
      permisoCarga.value = false
    }
  }
})

function getFichaPorCodigo(codigo) {
  if (!codigo) return null
  return fichasList.value.find(f => String(f.codigoFicha).toLowerCase() === String(codigo).toLowerCase())
}

function getInstructorNombre(id) {
  if (!id) return ''
  if (typeof id === 'object') return `${id.nombres || ''} ${id.apellidos || ''}`.trim()
  return ''
}

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function parsearCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim())
  if (lineas.length < 2) {
    showToastFn('El archivo debe tener al menos una línea de cabecera y datos', 'error')
    return { headers: [], rows: [] }
  }
  const headers = parsearLineaCSV(lineas[0]).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lineas.length; i++) {
    const valores = parsearLineaCSV(lineas[i])
    if (valores.length === 0) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = (valores[idx] !== undefined && valores[idx] !== null ? String(valores[idx]) : '').trim() })
    rows.push({ ...row, _linea: i + 1 })
  }
  return { headers, rows }
}

function parsearXLSX(dataBuffer) {
  try {
    const workbook = XLSX.read(dataBuffer, { type: 'array' })
    const primerHojaNombre = workbook.SheetNames[0]
    if (!primerHojaNombre) {
      showToastFn('El archivo Excel no contiene hojas de cálculo', 'error')
      return { headers: [], rows: [] }
    }
    const hoja = workbook.Sheets[primerHojaNombre]
    const dataMatriz = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' })
    if (!dataMatriz || dataMatriz.length < 2) {
      showToastFn('El archivo debe tener al menos una fila de cabecera y datos', 'error')
      return { headers: [], rows: [] }
    }

    // Cabeceras en la primera fila
    const headersCrudos = dataMatriz[0].map(h => String(h || '').trim())
    const rows = []

    for (let i = 1; i < dataMatriz.length; i++) {
      const fila = dataMatriz[i]
      // Si la fila está completamente vacía, ignorarla
      if (!fila || fila.every(v => v === '' || v === null || v === undefined)) continue

      const row = {}
      headersCrudos.forEach((h, idx) => {
        if (!h) return
        const val = fila[idx]
        row[h] = val !== undefined && val !== null ? String(val).trim() : ''
      })
      rows.push({ ...row, _linea: i + 1 })
    }

    return { headers: headersCrudos, rows }
  } catch (err) {
    console.error('Error procesando XLSX:', err)
    showToastFn('Error al leer el archivo Excel: ' + err.message, 'error')
    return { headers: [], rows: [] }
  }
}

function parsearLineaCSV(linea) {
  const resultado = []
  let actual = ''
  let dentroDeComillas = false
  for (let i = 0; i < linea.length; i++) {
    const char = linea[i]
    if (char === '"') { dentroDeComillas = !dentroDeComillas }
    else if ((char === ',' || char === ';') && !dentroDeComillas) { resultado.push(actual); actual = '' }
    else { actual += char }
  }
  resultado.push(actual)
  return resultado
}


function validarHeaders(headers) {
  return headersEsperados.value.every(h => headers.includes(h))
}

function obtenerFichasPorCadena(cadena) {
  if (!cadena) return []
  const codigos = String(cadena).split(/[,;/|]+/).map(c => c.trim()).filter(Boolean)
  return codigos.map(cod => ({
    codigo: cod,
    ficha: getFichaPorCodigo(cod)
  }))
}

function validarFila(row) {
  const errs = []
  const requeridos = headersEsperados.value

  for (const h of requeridos) {
    if (row[h] === undefined || row[h] === null || row[h] === '') {
      errs.push(`Falta el campo obligatorio: ${h}`)
    }
  }

  if (tipoImportacion.value === 'fichas') {
    if (row.Jornada && !['Mañana', 'Tarde', 'Noche', 'Diurna', 'Nocturna', 'Mixta'].includes(row.Jornada)) {
      errs.push(`Jornada inválida: "${row.Jornada}". Debe ser Mañana, Tarde o Noche`)
    }
  } else {
    if (row.Tipo_Doc && !['CC', 'TI', 'PEP'].includes(row.Tipo_Doc.toUpperCase())) {
      errs.push(`Tipo_Doc inválido: "${row.Tipo_Doc}". Debe ser CC, CE o PEP`)
    }
    if (row.Correo && !row.Correo.includes('@')) {
      errs.push(`Correo inválido: "${row.Correo}"`)
    }
    if (row.Ficha) {
      if (tipoImportacion.value === 'instructores') {
        const fichasBuscadas = obtenerFichasPorCadena(row.Ficha)
        fichasBuscadas.forEach(fb => {
          if (!fb.ficha) {
            errs.push(`Ficha no encontrada: "${fb.codigo}". Debes crear la ficha previamente o cargar el archivo de fichas`)
          }
        })
      } else {
        const ficha = getFichaPorCodigo(row.Ficha)
        if (!ficha) {
          errs.push(`Ficha no encontrada: "${row.Ficha}". Debes crear la ficha previamente o cargar el archivo de fichas`)
        } else if (row.Jornada && ficha.jornada !== row.Jornada) {
          errs.push(`Jornada "${row.Jornada}" no coincide con la ficha "${row.Ficha}" (${ficha.jornada})`)
        }
      }
    }
    if (tipoImportacion.value === 'instructores' && row.Es_Lider) {
      const valLider = String(row.Es_Lider).trim().toUpperCase()
      if (!['SI', 'NO', 'S', 'N', 'LIDER', 'COMUN', 'TRUE', 'FALSE', '1', '0'].includes(valLider)) {
        errs.push(`Es_Lider inválido: "${row.Es_Lider}". Debe ser SI o NO`)
      }
    }
  }
  return errs
}

function detectarAdvertencia(row) {
  if (tipoImportacion.value === 'instructores' && row.Es_Lider && row.Ficha) {
    const valLider = String(row.Es_Lider).trim().toUpperCase()
    const esLiderVal = ['SI', 'S', 'LIDER', 'TRUE', '1'].includes(valLider)
    if (esLiderVal) {
      const fichasBuscadas = obtenerFichasPorCadena(row.Ficha)
      for (const fb of fichasBuscadas) {
        if (fb.ficha && fb.ficha.instructorLiderId) {
          const nombreActualLider = getInstructorNombre(fb.ficha.instructorLiderId)
          return `La Ficha ${fb.codigo} ya tiene asignado como Líder a ${nombreActualLider || 'otro docente'}. Al importar, se actualizará a ${row.Nombres} ${row.Apellidos}.`
        }
      }
    }
  }
  return null
}

function procesarArchivo(event) {
  const file = event.target.files[0]
  if (!file) return
  archivoNombre.value = file.name
  registros.value = []
  errores.value = []
  advertencias.value = []
  importado.value = false

  const extension = file.name.split('.').pop().toLowerCase()
  const esExcel = extension === 'xlsx' || extension === 'xls'

  const procesarFilasYHeaders = (headers, rows) => {
    if (!headers || headers.length === 0 || !rows || rows.length === 0) {
      showToastFn('El archivo está vacío o no contiene filas de datos', 'error')
      return
    }
    if (!validarHeaders(headers)) {
      showToastFn('El archivo no contiene las cabeceras requeridas: ' + headersEsperados.value.join(', '), 'error')
      return
    }

    const tempRegistros = []
    const tempErrores = []
    const tempAdvertencias = []
    const documentosEnArchivo = new Map()

    rows.forEach((row) => {
      const errs = validarFila(row)


      // VERIFICACIÓN ANTI-DUPLICADOS DE DOCUMENTO/CÓDIGO
      if (tipoImportacion.value === 'estudiantes') {
        const docNum = String(row.Num_Doc || '').trim()
        if (docNum) {
          if (documentosEnArchivo.has(docNum)) {
            errs.push(`Documento duplicado en el archivo: El número "${docNum}" ya aparece previamente en la línea ${documentosEnArchivo.get(docNum)}`)
          } else {
            documentosEnArchivo.set(docNum, row._linea)
          }

          const existeEnBD = estudiantesExistentes.value.find(e => String(e.numeroDocumento).trim() === docNum)
          if (existeEnBD) {
            errs.push(`Documento ya registrado en la base de datos: El número "${docNum}" ya pertenece al aprendiz ${existeEnBD.nombres} ${existeEnBD.apellidos}`)
          }
        }
      } else if (tipoImportacion.value === 'instructores') {
        const docNum = String(row.Num_Doc || '').trim()
        if (docNum) {
          const existeEnBD = instructoresExistentes.value.find(i => String(i.numeroDocumento).trim() === docNum)
          if (existeEnBD) {
            row._infoMultificha = `El docente ya está registrado previamente (${existeEnBD.nombres} ${existeEnBD.apellidos}). Se le asignará la(s) nueva(s) ficha(s).`
          } else if (documentosEnArchivo.has(docNum)) {
            row._infoMultificha = `El docente ya aparece en la línea ${documentosEnArchivo.get(docNum)}. Se le asignarán múltiples fichas.`
          } else {
            documentosEnArchivo.set(docNum, row._linea)
          }
        }
      } else {
        // Para Fichas: Validar duplicado por Código de Ficha
        const codFicha = String(row.Codigo_Ficha || '').trim()
        if (codFicha) {
          if (documentosEnArchivo.has(codFicha)) {
            errs.push(`Código de Ficha duplicado en el archivo: La ficha "${codFicha}" ya aparece previamente en la línea ${documentosEnArchivo.get(codFicha)}`)
          } else {
            documentosEnArchivo.set(codFicha, row._linea)
          }

          const existeEnBD = fichasList.value.find(f => String(f.codigoFicha).trim() === codFicha)
          if (existeEnBD) {
            errs.push(`Código de Ficha ya registrado en la base de datos: La ficha "${codFicha}" (${existeEnBD.nombrePrograma}) ya existe`)
          }
        }
      }

      if (errs.length > 0) {
        tempErrores.push({ linea: row._linea, datos: row, errores: errs })
      } else {
        const adv = detectarAdvertencia(row)
        if (adv) {
          row._advertencia = adv
          tempAdvertencias.push({ linea: row._linea, docente: `${row.Nombres} ${row.Apellidos}`, ficha: row.Ficha, mensaje: adv })
        }
        tempRegistros.push(row)
      }
    })

    registros.value = tempRegistros
    errores.value = tempErrores
    advertencias.value = tempAdvertencias
  }

  const reader = new FileReader()
  if (esExcel) {
    reader.onload = (e) => {
      const buffer = e.target.result
      const { headers, rows } = parsearXLSX(buffer)
      procesarFilasYHeaders(headers, rows)
    }
    reader.readAsArrayBuffer(file)
  } else {
    reader.onload = (e) => {
      const texto = e.target.result
      const { headers, rows } = parsearCSV(texto)
      procesarFilasYHeaders(headers, rows)
    }
    reader.readAsText(file, 'UTF-8')
  }
}


async function ejecutarImportacion() {
  if (registros.value.length === 0) {
    showToastFn('No hay registros válidos para importar', 'error')
    return
  }

  loading.value = true
  try {
    if (tipoImportacion.value === 'fichas') {
      const items = registros.value.map(r => ({
        codigoFicha: r.Codigo_Ficha,
        nombrePrograma: r.Nombre_Programa,
        jornada: r.Jornada || 'Diurna',
        aulaAsignada: r.Aula_Asignada || 'Aula General',
        fechaInicio: r.Fecha_Inicio || '2026-02-01',
        fechaFin: r.Fecha_Fin || '2026-11-30',
      }))
      await api.fichas.importar(items)
      fichasList.value = await api.fichas.getAll()
      showToastFn(`${registros.value.length} fichas importadas correctamente`)
    } else if (tipoImportacion.value === 'instructores') {
      const items = registros.value.map(r => {
        const fichasBuscadas = obtenerFichasPorCadena(r.Ficha)
        const valLider = String(r.Es_Lider || '').trim().toUpperCase()
        const esLiderVal = ['SI', 'S', 'LIDER', 'TRUE', '1'].includes(valLider)
        
        const listaFichas = fichasBuscadas
          .filter(fb => fb.ficha)
          .map(fb => ({ fichaId: fb.ficha._id, esLider: esLiderVal }))

        const primeraFicha = fichasBuscadas[0]?.ficha

        return {
          nombres: r.Nombres,
          apellidos: r.Apellidos,
          tipoDocumento: r.Tipo_Doc.toUpperCase(),
          numeroDocumento: r.Num_Doc,
          correo: r.Correo,
          telefono: r.Telefono,
          especialidad: primeraFicha ? primeraFicha.nombrePrograma : 'Docente SENA',
          fichas: listaFichas,
          esLider: esLiderVal,
          password: 'sena2026',
          rol: 'Instructor',
          estado: 'Activo',
        }
      })
      await api.instructores.importar(items)
      showToastFn(`${registros.value.length} registro(s) de docentes procesados e impartiendo sus respectivas fichas`)
    } else {
      const items = registros.value.map(r => {
        const ficha = getFichaPorCodigo(r.Ficha)
        return {
          nombres: r.Nombres,
          apellidos: r.Apellidos,
          tipoDocumento: r.Tipo_Doc.toUpperCase(),
          numeroDocumento: r.Num_Doc,
          correo: r.Correo,
          telefono: r.Telefono,
          fichaId: ficha ? ficha._id : null,
          genero: r.Genero,
          estado: 'Activo',
          motivo: '',
          estadoAsistencia: 'Sin registro',
        }
      })
      await api.estudiantes.importar(items)
      showToastFn(`${registros.value.length} estudiantes importados correctamente`)
    }
    importado.value = true
  } catch (e) {
    showToastFn('Error al importar: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function descargarPlantilla(formato = 'csv') {
  let headers = []
  let datosEjemplo = []
  let nombreBase = ''

  if (tipoImportacion.value === 'fichas') {
    nombreBase = 'carga_masiva_fichas'
    headers = HEADERS_FICHAS
    datosEjemplo = [
      ['2670123', 'Análisis y Desarrollo de Software (ADSO)', 'Mañana', 'Aula 302 Bloque A', '2026-02-01', '2026-11-30'],
      ['2891234', 'Gestión de Redes de Datos', 'Tarde', 'Laboratorio 105 Bloque B', '2026-02-01', '2026-11-30'],
      ['2901122', 'Diseño Gráfico Digital', 'Noche', 'Taller de Diseño Bloque C', '2026-02-15', '2026-12-15']
    ]
  } else if (tipoImportacion.value === 'instructores') {
    nombreBase = 'carga_masiva_instructores'
    headers = HEADERS_INSTRUCTORES
    datosEjemplo = [
      ['CC', '1055443301', 'Carlos Alberto', 'Mendoza Pérez', 'Masculino', 'carlos.mendoza@sena.edu.co', '3104567890', '2670123, 2891234', 'SI', 'Mañana'],
      ['CC', '1055443302', 'Patricia Elena', 'Jaramillo Morales', 'Femenino', 'patricia.jaramillo@sena.edu.co', '3156789012', '2891234', 'SI', 'Tarde'],
      ['CC', '1055443303', 'Roberto Antonio', 'Gómez Restrepo', 'Masculino', 'roberto.gomez@sena.edu.co', '3123456789', '2901122 / 2670123', 'NO', 'Noche'],
      ['CC', '1055443304', 'María Fernanda', 'Suárez Castro', 'Femenino', 'maria.suarez@sena.edu.co', '3189012345', '2670123', 'NO', 'Mañana']
    ]
  } else {
    nombreBase = 'carga_masiva_estudiantes'
    headers = HEADERS_ESTUDIANTES
    datosEjemplo = [
      ['CC', '1098765432', 'Alejandro', 'Morales Ríos', 'Masculino', 'alejandro.morales@misena.edu.co', '3112345678', '2670123', 'Mañana'],
      ['CC', '1098765433', 'Valentina', 'Ospina Gutiérrez', 'Femenino', 'valentina.ospina@misena.edu.co', '3123456789', '2670123', 'Mañana'],
      ['CC', '1098765434', 'Santiago', 'Cardona Henao', 'Masculino', 'santiago.cardona@misena.edu.co', '3134567890', '2670123', 'Mañana']
    ]
  }

  if (formato === 'xlsx') {
    // Solo la plantilla con sus encabezados de columna, sin filas de datos de ejemplo
    const matriz = [headers]
    const ws = XLSX.utils.aoa_to_sheet(matriz)
    ws['!cols'] = headers.map(h => ({ wch: Math.max(String(h).length + 4, 18) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, `${nombreBase}.xlsx`)
    showToastFn(`Plantilla ${nombreBase}.xlsx descargada`)
  } else {
    const lineas = [
      headers.join(','),
      ...datosEjemplo.map(fila => fila.map(v => (String(v).includes(',') || String(v).includes(';') ? `"${v}"` : v)).join(','))
    ]
    const contenido = lineas.join('\n')
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `${nombreBase}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToastFn(`Plantilla ${nombreBase}.csv descargada`)
  }
}

function limpiarTodo() {
  archivoNombre.value = ''
  registros.value = []
  errores.value = []
  advertencias.value = []
  importado.value = false
  const input = document.getElementById('archivo-input')
  if (input) input.value = ''
}
</script>

<template>
  <div class="import-users-page-header">
    <h1>Carga Masiva de Archivos</h1>
    <p>Importación masiva mediante archivos planos CSV o libros de Excel (.xlsx / .xls)</p>
  </div>

  <!-- SI NO TIENE PERMISO (SI ES DOCENTE COMÚN) -->
  <div v-if="!permisoCarga" class="import-users-card import-users-restricted-card">
    <div class="import-users-restricted-message">
      🔒 <strong>Acceso Restringido:</strong> La carga masiva mediante archivos planos o Excel está reservada para el <strong>Administrador</strong> o <strong>Instructores Líderes de Ficha</strong>.
    </div>
  </div>

  <!-- CONFIGURACIÓN DE IMPORTACIÓN SI TIENE PERMISO -->
  <template v-else>
    <div class="import-users-card">
      <div class="import-users-card-header">
        <h3>Configuración de Importación</h3>
        <div class="import-users-header-actions">
          <button class="import-users-button import-users-button-outline import-users-button-small" @click="descargarPlantilla('xlsx')">
            📊 Plantilla (.xlsx)
          </button>
          <button class="import-users-button import-users-button-outline import-users-button-small" @click="descargarPlantilla('csv')">
            📄 Plantilla (.csv)
          </button>
          <span v-if="usuario.rol === 'Instructor'" class="import-users-badge import-users-badge-success">
            👑 Docente Líder Autorizado
          </span>
        </div>
      </div>
      <div class="import-users-form-grid">
        <div class="import-users-form-group">
          <label>Tipo de Datos a Importar</label>
          <select v-model="tipoImportacion" :disabled="archivoNombre !== ''" @change="limpiarTodo">
            <option value="estudiantes">👨‍🎓 Estudiantes (Aprendices)</option>
            <option value="instructores">👨‍🏫 Instructores / Docentes</option>
            <option value="fichas" v-if="usuario.rol === 'Administrador'">📋 Fichas / Programas</option>
          </select>
        </div>
        <div class="import-users-form-group">
          <label>Archivo Excel o CSV (.xlsx, .xls, .csv)</label>
          <div class="import-users-file-upload">
            <input id="archivo-input" type="file" accept=".xlsx,.xls,.csv" @change="procesarArchivo" class="import-users-file-input" />
            <label for="archivo-input" class="import-users-file-label">{{ archivoNombre || 'Seleccionar archivo .xlsx o .csv' }}</label>
          </div>
        </div>
      </div>

      <div class="import-users-info">
        <h4>Formato requerido del archivo ({{ tipoImportacion.toUpperCase() }}):</h4>
        <p>Cabeceras obligatorias requeridas (en la fila 1 de Excel o CSV):</p>
        <code>{{ headersEsperados.join(',') }}</code>

        
        <ul v-if="tipoImportacion === 'instructores'" class="import-users-info-list">
          <li><strong>Tipo_Doc:</strong> CC, CE o PEP</li>
          <li><strong>Ficha:</strong> Código(s) de la ficha asignada. Para que un docente dicte <strong>más de una clase / ficha</strong>, puedes separar los códigos con comas o barras (ej: <code>"2670123, 2891234"</code>) o registrar al docente en filas separadas.</li>
          <li><strong>Es_Lider:</strong> Pon <code>SI</code> si el docente es el Líder de la ficha, o <code>NO</code> si es Docente Común</li>
          <li><strong>Jornada:</strong> Debe coincidir con la jornada de la ficha</li>
        </ul>
        <ul v-else-if="tipoImportacion === 'fichas'" class="import-users-info-list">
          <li><strong>Codigo_Ficha:</strong> Número identificador único de la ficha (ej. 2901122)</li>
          <li><strong>Nombre_Programa:</strong> Nombre del programa (ej. Análisis y Desarrollo de Software)</li>
          <li><strong>Jornada:</strong> Mañana, Tarde o Noche</li>
          <li><strong>Fecha_Inicio / Fecha_Fin:</strong> Formato YYYY-MM-DD (ej. 2026-02-01)</li>
        </ul>
        <ul v-else class="import-users-info-list">
          <li><strong>Tipo_Doc:</strong> CC, CE o PEP</li>
          <li><strong>Ficha:</strong> Código de ficha existente en el sistema</li>
          <li><strong>Jornada:</strong> Debe coincidir con la jornada de la ficha</li>
        </ul>
      </div>
    </div>

    <!-- ERRORES BLOQUEANTES -->
    <div v-if="errores.length > 0" class="import-users-card">
      <div class="import-users-card-header">
        <h3>Errores de Validación (Bloqueantes)</h3>
        <span class="import-users-badge import-users-badge-danger">{{ errores.length }} errores</span>
      </div>
      <div class="import-users-table-container">
        <table class="import-users-table">
          <thead>
            <tr>
              <th>Línea</th>
              <th>Datos</th>
              <th>Errores</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(err, idx) in errores" :key="idx" class="import-users-row-error">
              <td>{{ err.linea }}</td>
              <td class="import-users-small-cell">
                {{ err.datos.Codigo_Ficha || err.datos.Nombres || 'Fila ' + err.linea }} 
                {{ err.datos.Nombre_Programa || err.datos.Apellidos || '' }}
              </td>
              <td>
                <ul class="import-users-error-list">
                  <li v-for="(e, i) in err.errores" :key="i">{{ e }}</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ADVERTENCIAS INFORMATIVAS DE LIDERAZGO -->
    <div v-if="advertencias.length > 0" class="import-users-card import-users-warning-card">
      <div class="import-users-card-header">
        <h3 class="import-users-warning-title">⚠️ Advertencias de Liderazgo (Opcionales)</h3>
        <span class="import-users-badge import-users-badge-warning">{{ advertencias.length }} avisos</span>
      </div>
      <div class="import-users-table-container">
        <table class="import-users-table">
          <thead>
            <tr>
              <th>Línea</th>
              <th>Docente</th>
              <th>Ficha</th>
              <th>Aviso Informativo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(adv, idx) in advertencias" :key="idx" class="import-users-row-warning">
              <td><strong>{{ adv.linea }}</strong></td>
              <td>{{ adv.docente }}</td>
              <td><code>{{ adv.ficha }}</code></td>
              <td class="import-users-warning-cell">{{ adv.mensaje }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- REGISTROS VÁLIDOS -->
    <div v-if="registros.length > 0 && !importado" class="import-users-card">
      <div class="import-users-card-header">
        <h3>Registros Válidos para Importar</h3>
        <span class="import-users-badge import-users-badge-success">{{ registros.length }} registros</span>
      </div>
      <div class="import-users-table-container">
        <table class="import-users-table">
          <thead>
            <tr v-if="tipoImportacion === 'fichas'">
              <th>Código Ficha</th><th>Nombre Programa</th><th>Jornada</th><th>Aula</th><th>Fecha Inicio</th><th>Fecha Fin</th>
            </tr>
            <tr v-else-if="tipoImportacion === 'instructores'">
              <th>Tipo Doc</th><th>Nro Doc</th><th>Nombres</th><th>Apellidos</th><th>Correo</th><th>Ficha</th><th>¿Es Líder?</th><th>Avisos</th>
            </tr>
            <tr v-else>
              <th>Tipo Doc</th><th>Nro Doc</th><th>Nombres</th><th>Apellidos</th><th>Género</th><th>Correo</th><th>Teléfono</th><th>Ficha</th><th>Jornada</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in registros.slice(0, 50)" :key="idx">
              <template v-if="tipoImportacion === 'fichas'">
                <td>{{ r.Codigo_Ficha }}</td><td>{{ r.Nombre_Programa }}</td><td>{{ r.Jornada }}</td><td>{{ r.Aula_Asignada }}</td><td>{{ r.Fecha_Inicio }}</td><td>{{ r.Fecha_Fin }}</td>
              </template>
              <template v-else-if="tipoImportacion === 'instructores'">
                <td>{{ r.Tipo_Doc }}</td><td>{{ r.Num_Doc }}</td><td>{{ r.Nombres }}</td><td>{{ r.Apellidos }}</td><td>{{ r.Correo }}</td><td>{{ r.Ficha }}</td>
                <td>
                  <span class="import-users-badge" :class="['SI', 'S', 'LIDER', 'TRUE', '1'].includes(String(r.Es_Lider).toUpperCase()) ? 'import-users-badge-success' : 'import-users-badge-neutral'">
                    {{ ['SI', 'S', 'LIDER', 'TRUE', '1'].includes(String(r.Es_Lider).toUpperCase()) ? '👑 Sí (Líder)' : '👤 No (Común)' }}
                  </span>
                </td>
                <td>
                  <span v-if="r._infoMultificha" class="import-users-badge import-users-badge-warning import-users-badge-spaced" :title="r._infoMultificha">
                    📚 Multi-Clase
                  </span>
                  <span v-if="r._advertencia" class="import-users-badge import-users-badge-warning" :title="r._advertencia">
                    ⚠️ Reemplazará Líder
                  </span>
                  <span v-if="!r._infoMultificha && !r._advertencia" class="import-users-muted">—</span>
                </td>
              </template>
              <template v-else>
                <td>{{ r.Tipo_Doc }}</td><td>{{ r.Num_Doc }}</td><td>{{ r.Nombres }}</td><td>{{ r.Apellidos }}</td><td>{{ r.Genero }}</td><td>{{ r.Correo }}</td><td>{{ r.Telefono }}</td><td>{{ r.Ficha }}</td><td>{{ r.Jornada }}</td>
              </template>
            </tr>
          </tbody>
        </table>
        <p v-if="registros.length > 50" class="import-users-more-message">
          Mostrando 50 de {{ registros.length }} registros
        </p>
      </div>
      <div class="import-users-actions">
        <button class="import-users-button import-users-button-primary" @click="ejecutarImportacion" :disabled="loading">
          {{ loading ? 'Importando...' : '📥 Importar ' + registros.length + ' ' + tipoImportacion.toUpperCase() }}
        </button>
        <button class="import-users-button import-users-button-outline" @click="limpiarTodo">Cancelar</button>
      </div>
    </div>

    <!-- COMPLETADO -->
    <div v-if="importado" class="import-users-card">
      <div class="import-users-card-header">
        <h3>Importación Completada Exitosamente</h3>
      </div>
      <div class="import-users-summary">
        <div class="import-users-stat import-users-stat-success">
          <span class="import-users-stat-number">{{ registros.length }}</span>
          <span>Importados correctamente</span>
        </div>
        <div v-if="errores.length > 0" class="import-users-stat import-users-stat-error">
          <span class="import-users-stat-number">{{ errores.length }}</span>
          <span>Con errores (omitidos)</span>
        </div>
      </div>
      <button class="import-users-button import-users-button-primary import-users-new-action" @click="limpiarTodo">Nueva Importación</button>
    </div>
  </template>

  <div v-if="toast.show" class="import-users-toast" :class="'import-users-toast-' + toast.type">{{ toast.message }}</div>
</template>
