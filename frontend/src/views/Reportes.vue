<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import api from '../services/index.js'
import StatCard from '../components/StatCard.vue'
import {
  LIMITE_DIAS_CONSECUTIVOS,
  LIMITE_DIAS_NO_CONSECUTIVOS,
  rachaMaximaConsecutiva,
} from '../utils/inasistencias.js'
import { useToast } from '../composables/useToast.js'

// ---------- Estado del formulario ----------
const tipoReporte = ref('aprendiz') // 'aprendiz' | 'ficha' | 'desercion'
const filtroFicha = ref(null)
const busqueda = ref('')            // nombre o documento del aprendiz
const estudianteSel = ref(null)     // aprendiz elegido de la lista
const fechaDesde = ref('')
const fechaHasta = ref('')
const listaAbierta = ref(false)
const mensajeError = ref('')
const cargando = ref(false)

const { toast, showToast } = useToast()

// ---------- Datos ----------
const fichasList = ref([])
const estudiantesFicha = ref([])
const instructores = ref([])
const asistenciasFicha = ref([])    // asistencias de la ficha en el rango elegido
const reporte = ref(null)           // snapshot de la búsqueda generada (incluye la lista de aprendices)
const diaSeleccionado = ref(null)
const excusasFicha = ref([])        // excusas radicadas de la ficha (de ahí sale el motivo)
const calendarioEst = ref(null)     // aprendiz cuyo calendario se muestra
const detalleEst = ref(null)        // fila abierta en el modal

const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : { id: '', rol: 'Administrador' })
const esInstructor = computed(() => usuario.value?.rol === 'Instructor')

// Fichas disponibles: todas (Admin) o aquellas en las que el docente dicta clase (Líder o Apoyo)
const fichasDisponibles = computed(() => {
  if (!esInstructor.value) return fichasList.value
  const miId = String(usuario.value?.id || '')
  return fichasList.value.filter((f) => {
    const liderId = f.instructorLiderId?._id || f.instructorLiderId
    const esLider = String(liderId) === miId
    const esDocente = Array.isArray(f.instructores) && f.instructores.some((inst) => {
      const instId = inst?._id || inst
      return String(instId) === miId
    })
    return f.esLider || esLider || esDocente
  })
})

onMounted(async () => {
  try {
    const [fichas, insts] = await Promise.all([
      api.fichas.getAll(),
      api.instructores.getAll().catch(() => []),
    ])
    fichasList.value = fichas
    instructores.value = insts
  } catch (e) {
    console.error('Error al cargar datos de reportes:', e)
    mensajeError.value = 'No se pudieron cargar las fichas. Intenta recargar la página.'
  }
  consultarEstadoRutaDesercion()
})

const fichaSeleccionada = computed(() =>
  fichasList.value.find((f) => String(f._id) === String(filtroFicha.value))
)

// Al cambiar de ficha se cargan sus aprendices y se reinicia la búsqueda
watch(filtroFicha, async (val) => {
  busqueda.value = ''
  estudianteSel.value = null
  reporte.value = null
  calendarioEst.value = null
  detalleEst.value = null
  diaSeleccionado.value = null
  mensajeError.value = ''
  estudiantesFicha.value = []
  if (!val) return
  try {
    estudiantesFicha.value = await api.estudiantes.getAll({ fichaId: val })
  } catch (e) {
    console.error(e)
    mensajeError.value = 'No se pudieron cargar los aprendices de la ficha.'
  }
})

// ---------- Búsqueda de aprendiz (nombre o documento) ----------
function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
function nombreCompleto(e) {
  return `${e.nombres || ''} ${e.apellidos || ''}`.trim()
}

const coincidencias = computed(() => {
  const q = normalizar(busqueda.value)
  if (!q || !filtroFicha.value) return []
  return estudiantesFicha.value.filter((e) =>
    normalizar(nombreCompleto(e)).includes(q) || String(e.numeroDocumento || '').toLowerCase().includes(q)
  )
})
const sugerencias = computed(() => coincidencias.value.slice(0, 8))

function onEscribir() {
  estudianteSel.value = null
  listaAbierta.value = true
}
function elegirEstudiante(e) {
  estudianteSel.value = e
  busqueda.value = `${nombreCompleto(e)} - ${e.numeroDocumento}`
  listaAbierta.value = false
}
function cerrarListaConRetraso() {
  setTimeout(() => { listaAbierta.value = false }, 150)
}

const rangoInvalido = computed(() =>
  !!(fechaDesde.value && fechaHasta.value && fechaDesde.value > fechaHasta.value)
)
const puedeGenerar = computed(() => {
  if (!filtroFicha.value || cargando.value) return false
  if (tipoReporte.value === 'desercion') return true
  return !!(fechaDesde.value && fechaHasta.value && !rangoInvalido.value)
})

// ---------- Generar reporte ----------
function fechaISO(valor) {
  return String(valor || '').slice(0, 10)
}

async function generarReporte() {
  mensajeError.value = ''
  if (!puedeGenerar.value) return

  // Aprendices del reporte: toda la ficha (reporte por ficha), el elegido, las coincidencias de la búsqueda,
  // o toda la ficha si no se escribió nada
  let lista
  if (tipoReporte.value === 'ficha' || tipoReporte.value === 'desercion') {
    lista = estudiantesFicha.value
  } else if (estudianteSel.value) {
    lista = [estudianteSel.value]
  } else if (busqueda.value.trim()) {
    if (!coincidencias.value.length) {
      mensajeError.value = 'No se encontró ningún aprendiz con ese nombre o documento en la ficha elegida.'
      return
    }
    lista = coincidencias.value
  } else {
    lista = estudiantesFicha.value
  }

  let desde = fechaDesde.value
  let hasta = fechaHasta.value
  if (tipoReporte.value === 'desercion') {
    desde = fichaSeleccionada.value?.fechaInicio || '2020-01-01'
    hasta = hoyISO
  }

  cargando.value = true
  diaSeleccionado.value = null
  detalleEst.value = null
  paginaRuta.value = 1
  try {
    asistenciasFicha.value = await api.asistencias.getAll({
      fichaId: filtroFicha.value,
      fechaDesde: desde,
      fechaHasta: hasta,
    })
    // El motivo de la excusa vive en la colección de excusas; si falla, el reporte sigue funcionando
    try {
      excusasFicha.value = await api.excusas.getAll({ fichaId: filtroFicha.value })
    } catch (e) {
      console.error(e)
      excusasFicha.value = []
    }
    reporte.value = {
      tipo: tipoReporte.value,
      estudiantes: lista,
      ficha: fichaSeleccionada.value,
      desde,
      hasta,
    }
    // Si el resultado es un solo aprendiz, se muestra su calendario de una vez
    calendarioEst.value = tipoReporte.value === 'aprendiz' && lista.length === 1 ? lista[0] : null
    if (tipoReporte.value === 'desercion') {
      await consultarEstadoRutaDesercion()
    }
  } catch (e) {
    console.error(e)
    mensajeError.value = 'No se pudo generar el reporte. Intenta de nuevo.'
  } finally {
    cargando.value = false
  }
}

function cambiarTipo(tipo) {
  if (tipoReporte.value === tipo) return
  tipoReporte.value = tipo
  reporte.value = null
  calendarioEst.value = null
  detalleEst.value = null
  diaSeleccionado.value = null
  mensajeError.value = ''
}

function limpiar() {
  filtroFicha.value = null
  busqueda.value = ''
  estudianteSel.value = null
  fechaDesde.value = ''
  fechaHasta.value = ''
  reporte.value = null
  calendarioEst.value = null
  detalleEst.value = null
  diaSeleccionado.value = null
  mensajeError.value = ''
}

// ---------- Calendario ----------
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Clasificación: verde = asistió, amarillo = excusa, rojo = falla.
// Si en un mismo día hay varios registros, prevalece el más grave (falla > excusa > asistió).
function categoria(estado) {
  if (estado === 'Tardanza') return 'tarde'
  if (estado === 'Excusada') return 'excusa'
  if (estado === 'Falta' || estado === 'Ausente') return 'falla'
  return null
}
const PRIORIDAD = { falla: 3, excusa: 2, tarde: 1 }

const asistenciasCalendario = computed(() => {
  if (!calendarioEst.value) return []
  return asistenciasFicha.value.filter((a) =>
    String(a.estudianteId?._id || a.estudianteId) === String(calendarioEst.value._id) &&
    fechaISO(a.fecha) >= reporte.value.desde && fechaISO(a.fecha) <= reporte.value.hasta
  )
})

const registrosPorDia = computed(() => {
  const mapa = {}
  asistenciasCalendario.value.forEach((a) => {
    const f = fechaISO(a.fecha)
    if (!mapa[f]) mapa[f] = []
    mapa[f].push(a)
  })
  return mapa
})

function estadoDelDia(fecha) {
  const regs = registrosPorDia.value[fecha]
  if (!regs) return null
  let mejor = null
  regs.forEach((r) => {
    const c = categoria(r.estado)
    if (c && (!mejor || PRIORIDAD[c] > PRIORIDAD[mejor])) mejor = c
  })
  return mejor
}

// Rango de meses cubierto por el reporte (de la fecha "desde" a la fecha "hasta")
const rangoMeses = computed(() => {
  if (!reporte.value || !calendarioEst.value) return null
  const ini = parseISO(reporte.value.desde)
  const fin = parseISO(reporte.value.hasta)
  return {
    ini: { y: ini.getFullYear(), m: ini.getMonth() },
    fin: { y: fin.getFullYear(), m: fin.getMonth() },
  }
})

// Mes que se muestra: un solo calendario con navegación (flechas + selectores de mes y año)
const vista = ref({ y: new Date().getFullYear(), m: new Date().getMonth() })
watch(rangoMeses, (r) => {
  if (r) vista.value = { y: r.fin.y, m: r.fin.m } // arranca en el último mes del rango
})

const hoyISO = (() => {
  const h = new Date()
  return iso(h.getFullYear(), h.getMonth(), h.getDate())
})()

// No se pueden elegir fechas futuras: si se escribe una a mano, se ajusta a hoy
watch([fechaDesde, fechaHasta], ([d, h]) => {
  if (d && d > hoyISO) fechaDesde.value = hoyISO
  if (h && h > hoyISO) fechaHasta.value = hoyISO
})

const aniosDisponibles = computed(() => {
  const r = rangoMeses.value
  if (!r) return []
  const lista = []
  for (let y = r.ini.y; y <= r.fin.y; y++) lista.push(y)
  return lista
})

const mesesDisponibles = computed(() => {
  const r = rangoMeses.value
  if (!r) return []
  const desde = vista.value.y === r.ini.y ? r.ini.m : 0
  const hasta = vista.value.y === r.fin.y ? r.fin.m : 11
  const lista = []
  for (let m = desde; m <= hasta; m++) lista.push({ valor: m, nombre: MESES[m] })
  return lista
})

function ajustarAlRango(y, m) {
  const r = rangoMeses.value
  if (!r) return { y, m }
  if (y < r.ini.y || (y === r.ini.y && m < r.ini.m)) return { y: r.ini.y, m: r.ini.m }
  if (y > r.fin.y || (y === r.fin.y && m > r.fin.m)) return { y: r.fin.y, m: r.fin.m }
  return { y, m }
}

const anioVista = computed({
  get: () => vista.value.y,
  set: (y) => { vista.value = ajustarAlRango(Number(y), vista.value.m) },
})
const mesVista = computed({
  get: () => vista.value.m,
  set: (m) => { vista.value = ajustarAlRango(vista.value.y, Number(m)) },
})

const puedeAnterior = computed(() => {
  const r = rangoMeses.value
  return !!r && (vista.value.y > r.ini.y || (vista.value.y === r.ini.y && vista.value.m > r.ini.m))
})
const puedeSiguiente = computed(() => {
  const r = rangoMeses.value
  return !!r && (vista.value.y < r.fin.y || (vista.value.y === r.fin.y && vista.value.m < r.fin.m))
})

function cambiarMes(delta) {
  const d = new Date(vista.value.y, vista.value.m + delta, 1)
  vista.value = ajustarAlRango(d.getFullYear(), d.getMonth())
}

// Celdas del mes visible, en semanas completas (lunes a domingo).
// Los días de los meses vecinos se muestran atenuados y no se pueden seleccionar.
const celdasMes = computed(() => {
  if (!rangoMeses.value) return []
  const { y, m } = vista.value
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const diasMes = new Date(y, m + 1, 0).getDate()
  const totalCeldas = Math.ceil((offset + diasMes) / 7) * 7
  const celdas = []
  for (let i = 0; i < totalCeldas; i++) {
    const fecha = new Date(y, m, 1 - offset + i)
    const f = iso(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    const delMes = fecha.getMonth() === m
    celdas.push({
      fecha: f,
      dia: fecha.getDate(),
      delMes,
      enRango: delMes && f >= reporte.value.desde && f <= reporte.value.hasta,
      estado: delMes ? estadoDelDia(f) : null,
    })
  }
  return celdas
})

const resumen = computed(() => {
  const r = { tarde: 0, excusa: 0, falla: 0 }
  Object.keys(registrosPorDia.value).forEach((f) => {
    const c = estadoDelDia(f)
    if (c) r[c]++
  })
  return r
})

function etiquetaEstado(estado) {
  if (estado === 'Tardanza') return 'Llegada tarde'
  if (estado === 'Falta' || estado === 'Ausente') return 'Falla'
  return estado
}

const textoEstado = { tarde: 'Llegada tarde', excusa: 'Presentó excusa', falla: 'Falla' }
const textoBarra = { tarde: 'LLEGADA TARDE', excusa: 'EXCUSA', falla: 'FALLA' }

function nombreInstructor(reg) {
  const i = reg?.instructorId
  if (!i) return 'Sin instructor asignado'
  if (typeof i === 'object') return `${i.nombres || ''} ${i.apellidos || ''}`.trim() || 'Instructor'
  const inst = instructores.value.find((x) => String(x._id) === String(i))
  return inst ? `${inst.nombres} ${inst.apellidos}` : 'Instructor'
}

// Motivo de la excusa de un registro: se busca por aprendiz + fecha (se prefiere la aprobada)
function motivoExcusa(reg) {
  if (!reg) return ''
  const estId = String(reg.estudianteId?._id || reg.estudianteId || '')
  const fecha = fechaISO(reg.fecha)
  const candidatas = excusasFicha.value.filter((x) =>
    String(x.estudianteId?._id || x.estudianteId) === estId && fechaISO(x.fechaInasistencia) === fecha
  )
  const ex = candidatas.find((x) => x.estado === 'Aprobada') || candidatas.find((x) => x.estado !== 'Rechazada') || candidatas[0]
  return ex?.motivo || reg.motivo || reg.motivoInhabilitacion || ''
}

function formatoFechaLarga(f) {
  return parseISO(f).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

// Ventana flotante con el detalle del día (se abre al pulsar la etiqueta dentro del calendario)
const popover = ref(null) // { top, left }
const POP_ANCHO = 320

function posicionarPopover(el) {
  const r = el.getBoundingClientRect()
  const margen = 12
  let left = r.right + 8
  if (left + POP_ANCHO > window.innerWidth - margen) left = r.left - POP_ANCHO - 8
  if (left < margen) left = Math.max(margen, Math.min(r.left, window.innerWidth - POP_ANCHO - margen))
  let top = r.top
  const maxTop = window.innerHeight - 280
  if (top > maxTop) top = Math.max(margen, maxTop)
  popover.value = { top, left }
}

function cerrarPopover() {
  popover.value = null
  diaSeleccionado.value = null
}

function seleccionarDia(celda, ev) {
  if (!celda.enRango) return
  if (celda.estado && diaSeleccionado.value !== celda.fecha) {
    diaSeleccionado.value = celda.fecha
    const el = ev?.currentTarget?.querySelector('.rp-cal-evento') || ev?.currentTarget
    if (el) posicionarPopover(el)
  } else {
    cerrarPopover()
  }
}

function clickFuera(e) {
  if (!popover.value) return
  if (e.target.closest?.('.rp-pop') || e.target.closest?.('.rp-cal-dia')) return
  cerrarPopover()
}
onMounted(() => {
  document.addEventListener('mousedown', clickFuera)
  window.addEventListener('resize', cerrarPopover)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', clickFuera)
  window.removeEventListener('resize', cerrarPopover)
})

const detalleDia = computed(() => {
  if (!diaSeleccionado.value) return null
  return {
    fecha: diaSeleccionado.value,
    estado: estadoDelDia(diaSeleccionado.value),
    registros: registrosPorDia.value[diaSeleccionado.value] || [],
  }
})
// Ruta de deserción: 2 o más días consecutivos de falla, o 3 o más días de falla acumulados
const RUTA_DIAS_CONSECUTIVOS = 2
const RUTA_DIAS_ACUMULADOS = 3

// ---------- Tabla de aprendices ----------
const horasPorJornada = computed(() => {
  const j = (reporte.value?.ficha?.jornada || '').toLowerCase()
  if (j.includes('noche') || j.includes('nocturna')) return 5
  return 6 // Mañana, Tarde o Mixta
})

// Fechas con clase registrada en la ficha dentro del rango
const fechasClase = computed(() => {
  if (!reporte.value) return []
  const d = reporte.value.desde
  const h = reporte.value.hasta
  return [...new Set(
    asistenciasFicha.value.map((a) => fechaISO(a.fecha)).filter((f) => f >= d && f <= h)
  )].sort()
})

function datosAprendiz(est) {
  const hDia = horasPorJornada.value
  const porFecha = {}
  asistenciasFicha.value.forEach((a) => {
    if (String(a.estudianteId?._id || a.estudianteId) === String(est._id)) {
      porFecha[fechaISO(a.fecha)] = a
    }
  })

  let presentes = 0, tardanzas = 0, fallasSinExcusa = 0, fallasConExcusa = 0
  let horasTardanza = 0
  const inasistencias = []

  fechasClase.value.forEach((fecha) => {
    const reg = porFecha[fecha]
    if (!reg) return
    if (reg.estado === 'Presente') presentes++
    else if (reg.estado === 'Tardanza') {
      tardanzas++
      horasTardanza += Number(reg.horasTardanza) || 0
    } else if (reg.estado === 'Excusada') {
      fallasConExcusa++
      inasistencias.push({
        fecha, horas: hDia, tipo: 'Excusada',
        motivo: reg.motivo || reg.motivoInhabilitacion || 'Sin motivo detallado',
        docente: nombreInstructor(reg),
      })
    } else if (reg.estado === 'Falta' || reg.estado === 'Ausente') {
      fallasSinExcusa++
      inasistencias.push({
        fecha, horas: hDia, tipo: 'Injustificada',
        motivo: 'Falta injustificada',
        docente: nombreInstructor(reg),
      })
    }
  })

  const totalDias = presentes + tardanzas + fallasSinExcusa + fallasConExcusa
  const porcentaje = totalDias > 0 ? Math.round(((presentes + tardanzas * 0.5) / totalDias) * 100) : null

  const fechasInjustificadas = inasistencias.filter((i) => i.tipo === 'Injustificada').map((i) => i.fecha).sort()
  const rachaMaxima = rachaMaximaConsecutiva(fechasInjustificadas)
  const consecutivoGrave = rachaMaxima >= LIMITE_DIAS_CONSECUTIVOS
  const acumuladoGrave = fallasSinExcusa >= LIMITE_DIAS_NO_CONSECUTIVOS
  const rutaConsecutivos = rachaMaxima >= RUTA_DIAS_CONSECUTIVOS
  const rutaAcumulados = fallasSinExcusa >= RUTA_DIAS_ACUMULADOS
  const riesgo = (consecutivoGrave || acumuladoGrave)
    ? 'critico'
    : ((rutaConsecutivos || rutaAcumulados) ? 'ruta' : 'normal')

  return {
    estudiante: est,
    presentes, tardanzas, fallasSinExcusa, fallasConExcusa,
    horasSinExcusa: fallasSinExcusa * hDia,
    horasConExcusa: fallasConExcusa * hDia,
    horasAusencia: (fallasSinExcusa + fallasConExcusa) * hDia,
    diasInasistencia: fallasSinExcusa + fallasConExcusa,
    horasTardanza,
    totalHoras: (fallasSinExcusa + fallasConExcusa) * hDia + horasTardanza,
    totalDias, porcentaje, rachaMaxima, riesgo, inasistencias,
    fechasFallas: fechasInjustificadas,
    rutaConsecutivos,
    rutaAcumulados,
    enRuta: rutaConsecutivos || rutaAcumulados,
  }
}

const filasAprendices = computed(() => {
  if (!reporte.value) return []
  return reporte.value.estudiantes
    .map(datosAprendiz)
    .sort((a, b) => nombreCompleto(a.estudiante).localeCompare(nombreCompleto(b.estudiante), 'es'))
})

// Métricas de toda la ficha en el periodo consultado (no dependen de la búsqueda de aprendiz)
const resumenFicha = computed(() => {
  if (!reporte.value) return null
  const todos = estudiantesFicha.value.map(datosAprendiz)
  const conRegistro = todos.filter((d) => d.porcentaje !== null)
  const docentes = new Set()
  asistenciasFicha.value.forEach((a) => {
    const f = fechaISO(a.fecha)
    if (f < reporte.value.desde || f > reporte.value.hasta) return
    const id = a.instructorId?._id || a.instructorId
    if (id) docentes.add(String(id))
  })
  return {
    porcentajeGeneral: conRegistro.length
      ? Math.round(conRegistro.reduce((t, d) => t + d.porcentaje, 0) / conRegistro.length)
      : 0,
    enRuta: todos.filter((d) => d.enRuta).length,
    desertores: todos.filter((d) => d.riesgo === 'critico').length,
    enRutaNivel: todos.filter((d) => d.riesgo === 'ruta').length,
    docentes: docentes.size,
    sesiones: fechasClase.value.length,
  }
})

// Aprendices en ruta de deserción, de mayor a menor gravedad
const filasRuta = computed(() =>
  filasAprendices.value
    .filter((f) => f.enRuta)
    .sort((a, b) =>
      (b.rutaConsecutivos - a.rutaConsecutivos) ||
      (b.rachaMaxima - a.rachaMaxima) ||
      (b.fallasSinExcusa - a.fallasSinExcusa) ||
      nombreCompleto(a.estudiante).localeCompare(nombreCompleto(b.estudiante), 'es'))
)

// Paginación de la tabla de ruta de deserción (máximo 10 filas por página)
const paginaRuta = ref(1)
const FILAS_RUTA_POR_PAGINA = 10
const totalPaginasRuta = computed(() => Math.max(1, Math.ceil(filasRuta.value.length / FILAS_RUTA_POR_PAGINA)))
const filasRutaPaginadas = computed(() => {
  const inicio = (paginaRuta.value - 1) * FILAS_RUTA_POR_PAGINA
  return filasRuta.value.slice(inicio, inicio + FILAS_RUTA_POR_PAGINA)
})

// Estado de los correos globales para poder reportar
const reporteListo = ref(false)
const reporteFalta = reactive({ coordinador: false, bienestar: false })

async function consultarEstadoRutaDesercion() {
  try {
    const estado = await api.reportes.estadoRutaDesercion()
    reporteListo.value = !!estado?.listo
    reporteFalta.coordinador = !!estado?.falta?.coordinador
    reporteFalta.bienestar = !!estado?.falta?.bienestar
  } catch (e) {
    console.error('Error al consultar el estado de la ruta de deserción:', e)
    reporteListo.value = false
  }
}

// Modal de confirmación "Reportar a ruta de deserción"
const modalReporteAbierto = ref(false)
const reporteTarget = ref(null)
const enviandoReporte = ref(false)
const reportadoMap = reactive({})
const reporteError = ref('')

function abrirModalReporteDesercion(fila) {
  if (!reporteListo.value) return
  reporteError.value = ''
  reporteTarget.value = fila
  modalReporteAbierto.value = true
}

function cerrarModalReporteDesercion() {
  if (enviandoReporte.value) return
  modalReporteAbierto.value = false
  reporteTarget.value = null
  reporteError.value = ''
}

function formatoCorto(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

function reportadoInfo(fila) {
  const id = fila?.estudiante?._id
  if (!id) return null
  const info = reportadoMap[id]
  if (info) {
    if (typeof info === 'string') return { fecha: info, simulado: false }
    return { fecha: info.fecha || null, simulado: !!info.simulado }
  }
  if (fila.ultimoReporte) return { fecha: fila.ultimoReporte, simulado: false }
  return null
}

function reportadoFecha(fila) {
  return reportadoInfo(fila)?.fecha || null
}

function reportadoSimulado(fila) {
  return reportadoInfo(fila)?.simulado || false
}

async function enviarReporteDesercion() {
  const fila = reporteTarget.value
  if (!fila) return
  enviandoReporte.value = true
  reporteError.value = ''
  try {
    const res = await api.reportes.reportarDesercion({
      estudianteId: fila.estudiante._id,
      fichaId: reporte.value?.ficha?._id,
    })
    if (res?.reportadoEn) {
      reportadoMap[fila.estudiante._id] = { fecha: res.reportadoEn, simulado: !!res.simulado }
    }
    if (res?.simulado) {
      const dest = Array.isArray(res.destinatarios)
        ? res.destinatarios.join(', ')
        : (res.destinatarios || 'coordinador, bienestar y equipo ejecutor')
      showToast(`Simulación: no se envió ningún correo. Destinatarios: ${dest}`, 'warning')
    } else {
      const n = Array.isArray(res?.destinatarios) ? res.destinatarios.length : (res?.destinatarios ?? 0)
      showToast(`Reporte enviado a ${n} destinatarios`, 'success')
    }
    modalReporteAbierto.value = false
    reporteTarget.value = null
  } catch (e) {
    reporteError.value = e?.message || 'No se pudo enviar el reporte'
    showToast(reporteError.value, 'error')
  } finally {
    enviandoReporte.value = false
  }
}

const subtituloResultado = computed(() => {
  if (!reporte.value) return ''
  if (reporte.value.tipo === 'desercion') {
    const n = filasRuta.value.length
    return `${n} ${n === 1 ? 'aprendiz en ruta' : 'aprendices en ruta'} de ${filasAprendices.value.length}`
  }
  const n = filasAprendices.value.length
  return `${n} ${n === 1 ? 'aprendiz' : 'aprendices'}`
})

function verRutaDesercion() {
  cambiarTipo('desercion')
  generarReporte()
}

const totalesFicha = computed(() => filasAprendices.value.reduce((t, f) => ({
  dias: t.dias + f.diasInasistencia,
  horasInasistencia: t.horasInasistencia + f.horasAusencia,
  horasTardanza: t.horasTardanza + f.horasTardanza,
  totalHoras: t.totalHoras + f.totalHoras,
}), { dias: 0, horasInasistencia: 0, horasTardanza: 0, totalHoras: 0 }))

const textoRiesgo = {
  critico: (f) => `Deserción (${f.rachaMaxima >= LIMITE_DIAS_CONSECUTIVOS ? `${f.rachaMaxima} d seguidos` : `${f.fallasSinExcusa} d acumulados`})`,
  ruta: (f) => `En ruta (${f.rachaMaxima >= RUTA_DIAS_CONSECUTIVOS ? `${f.rachaMaxima} d seguidos` : `${f.fallasSinExcusa} d acumulados`})`,
  normal: () => 'Normal',
}
const claseRiesgo = { critico: 'badge-danger', ruta: 'badge-warning', normal: 'badge-success' }

// ---------- Modal de detalle ----------
function abrirDetalle(fila) { detalleEst.value = fila }
function cerrarDetalle() { detalleEst.value = null }
function onTecla(e) {
  if (e.key !== 'Escape') return
  if (detalleEst.value) cerrarDetalle()
  else if (popover.value) cerrarPopover()
}
onMounted(() => window.addEventListener('keydown', onTecla))
onBeforeUnmount(() => window.removeEventListener('keydown', onTecla))
</script>

<template>
  <div class="page-header">
    <h1>Reportes de Asistencia</h1>
    <p>Elige una ficha, define el rango de fechas y, si quieres, busca a un aprendiz específico</p>
  </div>

  <div v-if="esInstructor && fichasDisponibles.length === 0" class="card rp-sin-fichas">
    <strong>Acceso a Reportes:</strong> actualmente no tienes asignada ninguna ficha de formación. Los reportes están disponibles para los instructores asignados a cada ficha (líder o de apoyo) y para administradores.
  </div>

  <template v-else>
    <!-- ===== BÚSQUEDA ===== -->
    <form class="rp-panel" novalidate @submit.prevent="generarReporte">
      <div class="rp-panel-head">
        <h2>Búsqueda de reporte</h2>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>

      <div class="rp-tipos" role="tablist" aria-label="Tipo de reporte">
        <button type="button" role="tab" class="rp-tipo" :class="{ 'rp-tipo-on': tipoReporte === 'aprendiz' }" :aria-selected="tipoReporte === 'aprendiz'" @click="cambiarTipo('aprendiz')">Por aprendiz</button>
        <button type="button" role="tab" class="rp-tipo" :class="{ 'rp-tipo-on': tipoReporte === 'ficha' }" :aria-selected="tipoReporte === 'ficha'" @click="cambiarTipo('ficha')">Por ficha</button>
        <button type="button" role="tab" class="rp-tipo" :class="{ 'rp-tipo-on': tipoReporte === 'desercion' }" :aria-selected="tipoReporte === 'desercion'" @click="cambiarTipo('desercion')">Ruta de deserción</button>
      </div>

      <div class="rp-rejilla">
        <div class="rp-campo">
          <label for="rp-ficha">Ficha</label>
          <select id="rp-ficha" v-model="filtroFicha">
            <option :value="null" disabled>Escoja una ficha</option>
            <option v-for="f in fichasDisponibles" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option>
          </select>
        </div>

        <div v-if="tipoReporte === 'aprendiz'" class="rp-campo rp-campo-busqueda">
          <label for="rp-aprendiz">Aprendiz</label>
          <input
            id="rp-aprendiz"
            v-model="busqueda"
            type="text"
            autocomplete="off"
            :disabled="!filtroFicha"
            :placeholder="filtroFicha ? 'Nombre o cédula' : 'Primero escoja una ficha'"
            @input="onEscribir"
            @focus="listaAbierta = true"
            @blur="cerrarListaConRetraso"
          />
          <ul v-if="listaAbierta && sugerencias.length && !estudianteSel" class="rp-sugerencias" role="listbox">
            <li v-for="e in sugerencias" :key="e._id" role="option" @mousedown.prevent="elegirEstudiante(e)">
              <strong>{{ nombreCompleto(e) }}</strong>
              <span>{{ e.tipoDocumento }} {{ e.numeroDocumento }}</span>
            </li>
          </ul>
          <p v-else-if="listaAbierta && busqueda.trim() && filtroFicha && !sugerencias.length" class="rp-sin-resultados">Sin coincidencias en esta ficha</p>
        </div>

        <template v-if="tipoReporte !== 'desercion'">
          <div class="rp-campo">
            <label for="rp-desde">Fecha de inicio</label>
            <input id="rp-desde" v-model="fechaDesde" type="date" :max="hoyISO" />
          </div>

          <div class="rp-campo">
            <label for="rp-hasta">Fecha final</label>
            <input id="rp-hasta" v-model="fechaHasta" type="date" :max="hoyISO" />
          </div>
        </template>
      </div>

      <p v-if="rangoInvalido" class="rp-error" role="alert">La fecha de inicio no puede ser posterior a la fecha final.</p>
      <p v-if="mensajeError" class="rp-error" role="alert">{{ mensajeError }}</p>

      <div class="rp-acciones">
        <button type="submit" class="rp-btn rp-btn-primario" :disabled="!puedeGenerar">
          {{ cargando ? 'Generando...' : 'Generar reporte' }}
        </button>
        <button type="button" class="rp-btn rp-btn-secundario" @click="limpiar">Limpiar</button>
      </div>
    </form>

    <!-- ===== TABLA DE APRENDICES ===== -->
    <section v-if="reporte" class="rp-resultado" aria-live="polite">
      <header class="rp-res-head">
        <div>
          <h2>{{ { ficha: 'Reporte de la ficha', desercion: 'Ruta de deserción · Ficha' }[reporte.tipo] || 'Aprendices de la ficha' }} {{ reporte.ficha?.codigoFicha }}</h2>
          <p>
            <template v-if="reporte.tipo === 'desercion'">Toda la ficha · hasta hoy</template>
            <template v-else>{{ reporte.desde }} al {{ reporte.hasta }}</template>
            · {{ subtituloResultado }}
          </p>
        </div>
      </header>

      <div v-if="resumenFicha" class="rp-stats">
        <StatCard icon="percent" label="Asistencia General" :value="`${resumenFicha.porcentajeGeneral}%`" variant="verde" />
        <StatCard icon="x-circle" label="Deserción (3 seguidas o 5 acumuladas)" :value="`${resumenFicha.desertores}`" variant="rojo" />
        <StatCard icon="clock" label="En ruta (2 seguidas o 3 acumuladas)" :value="`${resumenFicha.enRutaNivel}`" variant="ambar" />
        <StatCard icon="user-check" label="Instructores en Ficha" :value="resumenFicha.docentes" variant="morado" />
        <StatCard icon="calendar" label="Sesiones Dictadas" :value="resumenFicha.sesiones" variant="indigo" />
      </div>
      <p v-if="resumenFicha" class="rp-nota rp-nota-stats">Las tarjetas resumen toda la ficha en el periodo consultado. Asistencia general: promedio de asistencia de los aprendices con registros. Cada presente suma 1 día, cada tardanza suma 0,5 día y las faltas no suman.</p>

      <div v-if="resumenFicha && resumenFicha.enRuta > 0 && reporte.tipo !== 'desercion'" class="rp-aviso" role="alert">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <p>
          <strong>{{ resumenFicha.enRuta }} {{ resumenFicha.enRuta === 1 ? 'aprendiz está' : 'aprendices están' }} en ruta de deserción</strong>
          (2 o más días seguidos de falla, o 3 o más días de falla acumulados).
        </p>
        <button type="button" class="rp-aviso-btn" @click="verRutaDesercion">Ver ruta de deserción</button>
      </div>

      <div v-if="!filasAprendices.length" class="rp-vacio-msg">No hay aprendices para mostrar con los filtros aplicados.</div>
      <template v-else-if="reporte.tipo === 'ficha'">
        <div class="rp-tabla-wrap">
          <table class="rp-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Identificación</th>
                <th class="rp-num-col">Días de inasistencia</th>
                <th class="rp-num-col">Horas de inasistencia</th>
                <th class="rp-num-col">Horas por llegadas tarde</th>
                <th class="rp-num-col">Total de horas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in filasAprendices" :key="f.estudiante._id" class="rp-fila" tabindex="0" @click="abrirDetalle(f)" @keydown.enter="abrirDetalle(f)">
                <td><strong>{{ nombreCompleto(f.estudiante) }}</strong></td>
                <td>{{ f.estudiante.tipoDocumento }} {{ f.estudiante.numeroDocumento }}</td>
                <td class="rp-num-col">{{ f.diasInasistencia }}</td>
                <td class="rp-num-col">{{ f.horasAusencia }} h</td>
                <td class="rp-num-col">{{ f.horasTardanza }} h</td>
                <td class="rp-num-col"><strong>{{ f.totalHoras }} h</strong></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Total de la ficha</td>
                <td class="rp-num-col">{{ totalesFicha.dias }}</td>
                <td class="rp-num-col">{{ totalesFicha.horasInasistencia }} h</td>
                <td class="rp-num-col">{{ totalesFicha.horasTardanza }} h</td>
                <td class="rp-num-col">{{ totalesFicha.totalHoras }} h</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="rp-nota">Cada día de inasistencia (falla o excusa) cuenta {{ horasPorJornada }} horas según la jornada de la ficha. Las horas por llegadas tarde se suman al total. Haz clic en un aprendiz para ver su detalle.</p>
      </template>
      <template v-else-if="reporte.tipo === 'desercion'">
        <div v-if="!filasRuta.length" class="rp-ruta-ok">
          Ningún aprendiz de la ficha está en ruta de deserción en el periodo consultado.
        </div>
        <div v-else class="rp-tabla-wrap">
          <table class="rp-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Identificación</th>
                <th>Nivel</th>
                <th>Motivo</th>
                <th class="rp-num-col">Días de falla</th>
                <th>Fechas de las fallas</th>
                <th class="rp-th-acc">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in filasRutaPaginadas" :key="f.estudiante._id" class="rp-fila" tabindex="0" @click="abrirDetalle(f)" @keydown.enter="abrirDetalle(f)">
                <td><strong>{{ nombreCompleto(f.estudiante) }}</strong></td>
                <td>{{ f.estudiante.tipoDocumento }} {{ f.estudiante.numeroDocumento }}</td>
                <td>
                  <span class="badge" :class="f.riesgo === 'critico' ? 'badge-danger' : 'badge-warning'">{{ f.riesgo === 'critico' ? 'Deserción' : 'En ruta' }}</span>
                </td>
                <td>
                  <div class="rp-motivos">
                    <span v-if="f.rutaConsecutivos" class="rp-motivo">{{ f.rachaMaxima }} {{ f.rachaMaxima === 1 ? 'día seguido' : 'días seguidos' }}</span>
                    <span v-if="f.rutaAcumulados" class="rp-motivo">{{ f.fallasSinExcusa }} acumulados</span>
                  </div>
                </td>
                <td class="rp-num-col"><strong>{{ f.fallasSinExcusa }}</strong></td>
                <td>
                  <div class="rp-motivos">
                    <span v-for="fecha in f.fechasFallas" :key="fecha" class="rp-chip-fecha">{{ fecha }}</span>
                  </div>
                </td>
                <td class="rp-td-acc">
                  <div class="rp-acciones-celda">
                    <button type="button" class="rp-link" @click.stop="abrirDetalle(f)">Ver reporte de fallas</button>
                    <button
                      v-if="!reportadoFecha(f)"
                      type="button"
                      class="rp-btn rp-btn-reportar"
                      :disabled="!reporteListo"
                      :title="reporteListo ? '' : 'El administrador debe configurar el correo del coordinador y el de bienestar al aprendiz en su Perfil'"
                      @click.stop="abrirModalReporteDesercion(f)"
                    >Reportar</button>
                    <span
                      v-else
                      class="rp-reportado"
                      :class="{ 'rp-reportado-simulado': reportadoSimulado(f) }"
                      :title="reportadoSimulado(f) ? 'Simulación: no se envió ningún correo' : 'Ya se envió el reporte a ruta de deserción'"
                    >{{ reportadoSimulado(f) ? 'Simulado' : 'Reportado' }} {{ formatoCorto(reportadoFecha(f)) }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav v-if="totalPaginasRuta > 1" class="rp-paginacion" aria-label="Paginación de la ruta de deserción">
          <button type="button" class="rp-pag-flecha" :disabled="paginaRuta === 1" aria-label="Página anterior" @click="paginaRuta--">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="rp-pag-info">Página {{ paginaRuta }} de {{ totalPaginasRuta }}</span>
          <button type="button" class="rp-pag-flecha" :disabled="paginaRuta === totalPaginasRuta" aria-label="Página siguiente" @click="paginaRuta++">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </nav>
        <p class="rp-nota">
          Un aprendiz entra en la ruta de deserción con {{ RUTA_DIAS_CONSECUTIVOS }} o más días seguidos de falla injustificada, o con {{ RUTA_DIAS_ACUMULADOS }} o más días de falla acumulados (no tienen que ser seguidos). Las excusas no cuentan y un fin de semana no interrumpe una racha. Con 3 días seguidos o 5 acumulados el nivel pasa a "Deserción". Haz clic en un aprendiz para ver su detalle.
        </p>
      </template>
      <div v-else class="rp-tabla-wrap">
        <table class="rp-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Identificación</th>
              <th>Riesgo</th>
              <th>Horas de ausencia</th>
              <th class="rp-th-acc">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filasAprendices" :key="f.estudiante._id" class="rp-fila" tabindex="0" @click="abrirDetalle(f)" @keydown.enter="abrirDetalle(f)">
              <td><strong>{{ nombreCompleto(f.estudiante) }}</strong></td>
              <td>{{ f.estudiante.tipoDocumento }} {{ f.estudiante.numeroDocumento }}</td>
              <td><span class="badge" :class="claseRiesgo[f.riesgo]">{{ textoRiesgo[f.riesgo](f) }}</span></td>
              <td><strong>{{ f.horasAusencia }} hrs</strong></td>
              <td class="rp-td-acc">
                <button type="button" class="rp-link" @click.stop="abrirDetalle(f)">Ver detalle</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===== CALENDARIO ===== -->
    <section v-if="reporte && calendarioEst" class="rp-resultado">
      <header class="rp-res-head">
        <div>
          <h2>Calendario de {{ nombreCompleto(calendarioEst) }}</h2>
          <p>
            {{ calendarioEst.tipoDocumento }} {{ calendarioEst.numeroDocumento }}
            · Ficha {{ reporte.ficha?.codigoFicha }}
            · {{ reporte.desde }} al {{ reporte.hasta }}
          </p>
        </div>
        <ul class="rp-leyenda" aria-label="Leyenda de colores">
          <li><span class="rp-punto rp-tarde"></span>Llegadas tarde <b>{{ resumen.tarde }}</b></li>
          <li><span class="rp-punto rp-excusa"></span>Excusa <b>{{ resumen.excusa }}</b></li>
          <li><span class="rp-punto rp-falla"></span>Falla <b>{{ resumen.falla }}</b></li>
        </ul>
      </header>

      <div class="rp-cal">
        <div class="rp-cal-nav">
          <button type="button" class="rp-cal-flecha" :disabled="!puedeAnterior" aria-label="Mes anterior" @click="cambiarMes(-1)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <select v-model="mesVista" class="rp-cal-select rp-cal-select-mes" aria-label="Mes">
            <option v-for="mm in mesesDisponibles" :key="mm.valor" :value="mm.valor">{{ mm.nombre }}</option>
          </select>
          <select v-model="anioVista" class="rp-cal-select rp-cal-select-anio" aria-label="Año">
            <option v-for="aa in aniosDisponibles" :key="aa" :value="aa">{{ aa }}</option>
          </select>
          <button type="button" class="rp-cal-flecha" :disabled="!puedeSiguiente" aria-label="Mes siguiente" @click="cambiarMes(1)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div class="rp-cal-tabla">
          <div class="rp-cal-cab">
            <span v-for="d in DIAS_SEMANA" :key="d">{{ d }}</span>
          </div>
          <div class="rp-cal-grid">
            <button
              v-for="c in celdasMes"
              :key="c.fecha"
              type="button"
              class="rp-cal-dia"
              :class="{
                'rp-cal-otro': !c.delMes,
                'rp-cal-fuera': c.delMes && !c.enRango,
                'rp-cal-hoy': c.fecha === hoyISO && c.delMes,
                'rp-activo': diaSeleccionado === c.fecha,
              }"
              :disabled="!c.enRango"
              :title="c.estado ? textoEstado[c.estado] : (c.enRango ? 'Sin registro' : '')"
              :aria-label="`${c.dia} de ${MESES[vista.m]} ${vista.y}${c.estado ? ': ' + textoEstado[c.estado] : ''}`"
              @click="seleccionarDia(c, $event)"
            >
              <span class="rp-cal-num">{{ c.dia }}</span>
              <span v-if="c.estado" class="rp-cal-evento" :class="`rp-${c.estado}`">{{ textoBarra[c.estado] }}</span>
            </button>
          </div>
        </div>
      </div>

      <Teleport to="body">
        <div v-if="detalleDia && popover" class="rp-pop" role="dialog" aria-label="Detalle del día" :style="{ top: popover.top + 'px', left: popover.left + 'px', width: POP_ANCHO + 'px' }">
          <header class="rp-pop-head">
            <span>Detalle del día</span>
            <button type="button" class="rp-pop-x" aria-label="Cerrar" @click="cerrarPopover">&times;</button>
          </header>
          <div class="rp-pop-body">
            <p class="rp-pop-fecha">{{ formatoFechaLarga(detalleDia.fecha) }}</p>
            <p v-if="!detalleDia.registros.length" class="rp-pop-vacio">No hay registro de asistencia para este día.</p>
            <div v-for="(r, i) in detalleDia.registros" :key="i" class="rp-pop-reg">
              <span class="rp-pop-lbl">Estado:</span>
              <span class="rp-pop-val">
                <span class="rp-pop-dot" :class="categoria(r.estado) ? `rp-pop-${categoria(r.estado)}` : ''"></span>
                {{ r.estado === 'Excusada' ? 'Excusada' : etiquetaEstado(r.estado) }}
                <span v-if="r.estado === 'Tardanza'" class="badge badge-danger rp-badge-det">Sin excusa</span>
              </span>
              <span class="rp-pop-lbl">Instructor:</span>
              <span class="rp-pop-val">{{ nombreInstructor(r) }}</span>
              <template v-if="r.estado === 'Tardanza' && Number(r.horasTardanza) > 0">
                <span class="rp-pop-lbl">Tardanza:</span>
                <span class="rp-pop-val">{{ r.horasTardanza }} {{ Number(r.horasTardanza) === 1 ? 'hora' : 'horas' }}</span>
              </template>
              <template v-if="r.estado === 'Excusada'">
                <span class="rp-pop-lbl">Motivo de la excusa:</span>
                <span class="rp-pop-val">{{ motivoExcusa(r) || 'No se registró un motivo.' }}</span>
              </template>
            </div>
          </div>
        </div>
      </Teleport>
    </section>

    <!-- ===== MODAL DE DETALLE ===== -->
    <div v-if="detalleEst" class="rp-overlay" @click.self="cerrarDetalle">
      <div class="rp-modal" role="dialog" aria-modal="true" aria-labelledby="rp-modal-titulo">
        <header class="rp-modal-head">
          <div>
            <h3 id="rp-modal-titulo">{{ nombreCompleto(detalleEst.estudiante) }}</h3>
            <p>{{ detalleEst.estudiante.tipoDocumento }} {{ detalleEst.estudiante.numeroDocumento }} · Ficha {{ reporte.ficha?.codigoFicha }}</p>
          </div>
          <button type="button" class="rp-cerrar" aria-label="Cerrar" @click="cerrarDetalle">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="rp-modal-cuerpo">
          <h4 class="rp-sec-titulo">Resumen</h4>
          <div class="rp-resumen-grid">
            <div class="rp-dato"><span>Riesgo de deserción</span><b><span class="badge" :class="claseRiesgo[detalleEst.riesgo]">{{ textoRiesgo[detalleEst.riesgo](detalleEst) }}</span></b></div>
            <div class="rp-dato"><span>Tardanzas</span><b>{{ detalleEst.tardanzas }}</b></div>
            <div class="rp-dato"><span>Sin excusa</span><b>{{ detalleEst.horasSinExcusa }} hrs ({{ detalleEst.fallasSinExcusa }} d)</b></div>
            <div class="rp-dato"><span>Con excusa</span><b>{{ detalleEst.horasConExcusa }} hrs ({{ detalleEst.fallasConExcusa }} d)</b></div>
          </div>

          <h4 class="rp-sec-titulo">Inasistencias por fecha</h4>
          <p v-if="!detalleEst.inasistencias.length" class="rp-sin-inas">Sin inasistencias en el periodo consultado.</p>
          <div v-else class="rp-tabla-wrap">
            <table class="rp-tabla rp-tabla-det">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horas</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th>Instructor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(i, idx) in detalleEst.inasistencias" :key="idx">
                  <td><strong>{{ i.fecha }}</strong></td>
                  <td>{{ i.horas }} h</td>
                  <td><span class="badge" :class="i.tipo === 'Excusada' ? 'badge-warning' : 'badge-danger'">{{ i.tipo }}</span></td>
                  <td>{{ i.motivo }}</td>
                  <td>{{ i.docente }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== MODAL DE CONFIRMACIÓN "REPORTAR" ===== -->
    <div v-if="modalReporteAbierto && reporteTarget" class="rp-overlay" @click.self="cerrarModalReporteDesercion">
      <div class="rp-modal rp-modal-reporte" role="dialog" aria-modal="true" aria-labelledby="rp-reporte-titulo">
        <header class="rp-modal-head">
          <div>
            <h3 id="rp-reporte-titulo">Reportar a ruta de deserción</h3>
            <p>{{ nombreCompleto(reporteTarget.estudiante) }} · {{ reporteTarget.estudiante.tipoDocumento }} {{ reporteTarget.estudiante.numeroDocumento }}</p>
          </div>
          <button type="button" class="rp-cerrar" aria-label="Cerrar" @click="cerrarModalReporteDesercion">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="rp-modal-cuerpo">
          <p class="rp-reporte-texto">
            ¿Seguro que quieres reportar a este aprendiz en la ruta de deserción? Se notificará por correo al coordinador, bienestar al aprendiz y al equipo ejecutor de la ficha.
          </p>
          <p v-if="reporteError" class="rp-reporte-error" role="alert">{{ reporteError }}</p>
          <div class="rp-reporte-acciones">
            <button type="button" class="rp-btn rp-btn-secundario" :disabled="enviandoReporte" @click="cerrarModalReporteDesercion">Cancelar</button>
            <button type="button" class="rp-btn rp-btn-primario" :disabled="enviandoReporte" @click="enviarReporteDesercion">
              {{ enviandoReporte ? 'Enviando...' : 'Confirmar y reportar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.rp-sin-fichas { background: #fff1f2; border-color: #fecdd3; color: #9f1239; padding: 20px; }

.rp-panel {
  --rp-verde: var(--verde, #39a900);
  --rp-verde-osc: #2c8300;
  --rp-borde: var(--borde, #e3e8df);
  --rp-texto: var(--tinta, #16210f);
  --rp-suave: var(--texto-suave, #5b6356);
  --rp-rojo: #c4432b;
  --c-tarde: #38bdf8;
  --c-excusa: #f5c400;
  --c-falla: #d93025;

  background: #fff;
  border-radius: 24px;
  padding: 28px 36px 30px;
  margin-bottom: 24px;
  box-shadow: 0 1px 2px rgba(30, 50, 20, .04), 0 12px 32px rgba(30, 50, 20, .06);
}
.rp-resultado { --c-tarde: #38bdf8; --c-excusa: #f5c400; --c-falla: #d93025; }

.rp-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; color: var(--rp-verde-osc); }
.rp-panel-head h2 { margin: 0; font-size: 18px; font-weight: 800; color: var(--rp-texto); }

.rp-rejilla { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; align-items: end; }
.rp-campo { position: relative; }
.rp-campo label { display: block; font-size: 13px; font-weight: 700; line-height: 18px; height: 18px; margin-bottom: 6px; color: var(--rp-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.rp-campo select,
.rp-campo input {
  width: 100%;
  height: 46px;
  box-sizing: border-box;
  margin: 0;
  padding: 0 14px;
  background: #fff;
  border: 1px solid var(--rp-borde);
  border-radius: 10px;
  font: inherit;
  font-size: 15px;
  color: var(--rp-texto);
  transition: border-color .15s, box-shadow .15s;
}
.rp-campo select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 38px;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%235b6356' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}
.rp-campo input:disabled { background: #f6f8f4; cursor: not-allowed; }
.rp-campo input::placeholder { color: #9aa294; }
.rp-campo select:focus,
.rp-campo input:focus { outline: none; border-color: var(--rp-verde); box-shadow: 0 0 0 3px rgba(57, 169, 0, .18); }

.rp-sugerencias {
  position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
  margin: 0; padding: 6px; list-style: none;
  background: #fff; border: 1px solid var(--rp-borde); border-radius: 12px;
  box-shadow: 0 12px 28px rgba(22, 33, 15, .14);
  max-height: 280px; overflow-y: auto;
}
.rp-sugerencias li { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px; border-radius: 8px; cursor: pointer; }
.rp-sugerencias li:hover { background: #f2f9ed; }
.rp-sugerencias strong { font-size: 14px; color: var(--rp-texto); }
.rp-sugerencias span { font-size: 12.5px; color: var(--rp-suave); }
.rp-sin-resultados { position: absolute; top: calc(100% + 4px); left: 0; margin: 0; font-size: 12.5px; color: var(--rp-suave); }

.rp-error { margin: 14px 0 0; font-size: 13.5px; font-weight: 600; color: var(--rp-rojo); }

.rp-acciones { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.rp-btn {
  height: 44px; padding: 0 22px; border-radius: 10px; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer;
  border: 1px solid transparent; transition: background .15s, border-color .15s, opacity .15s;
}
.rp-btn-primario { background: var(--rp-verde); color: #fff; }
.rp-btn-primario:hover:not(:disabled) { background: var(--rp-verde-osc); }
.rp-btn-primario:disabled { opacity: .45; cursor: not-allowed; }
.rp-btn-secundario { background: #fff; color: var(--rp-texto); border-color: var(--rp-borde); }
.rp-btn-secundario:hover { background: #f6f8f4; }
.rp-btn:focus-visible { outline: 2px solid var(--rp-verde); outline-offset: 2px; }

/* ===== Resultado ===== */
.rp-resultado {
  background: #fff; border-radius: 24px; padding: 28px 36px 32px; margin-bottom: 24px;
  box-shadow: 0 1px 2px rgba(30, 50, 20, .04), 0 12px 32px rgba(30, 50, 20, .06);
}
.rp-res-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.rp-res-head h2 { margin: 0 0 4px; font-size: 20px; font-weight: 800; color: #16210f; }
.rp-res-head p { margin: 0; font-size: 14px; color: #5b6356; }

.rp-leyenda { display: flex; gap: 10px; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
.rp-leyenda li { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid #e3e8df; border-radius: 999px; font-size: 13.5px; font-weight: 600; color: #16210f; }
.rp-leyenda b { font-weight: 800; }

.rp-punto { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; background: #cfd6ca; }
.rp-punto.rp-tarde { background: var(--c-tarde); }
.rp-punto.rp-excusa { background: var(--c-excusa); }
.rp-punto.rp-falla { background: var(--c-falla); }

/* Calendario de un solo mes, con navegación */
.rp-cal-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.rp-cal-flecha {
  width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 50%; color: #2e7d32; cursor: pointer;
  transition: background .15s;
}
.rp-cal-flecha:hover:not(:disabled) { background: #f2f9ed; }
.rp-cal-flecha:disabled { color: #c5ccc0; cursor: default; }
.rp-cal-select {
  height: 40px; padding: 0 12px; border: 1px solid #d5dbd0; border-radius: 6px; background: #fff;
  font: inherit; font-size: 14px; color: #16210f; cursor: pointer;
}
.rp-cal-select:focus { outline: 2px solid #39a900; outline-offset: 1px; }
.rp-cal-select-mes { min-width: 140px; }
.rp-cal-select-anio { min-width: 110px; }

.rp-cal-tabla { border: 1px solid #e3e8df; border-radius: 12px; overflow: hidden; }
.rp-cal-cab, .rp-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.rp-cal-cab span {
  padding: 10px 0; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: #2e7d32; background: #fafbf9; border-bottom: 1px solid #e3e8df;
}
.rp-cal-dia {
  position: relative; min-height: 86px; padding: 8px 8px 6px; display: flex; flex-direction: column; align-items: stretch; gap: 6px;
  background: #fff; border: none; border-right: 1px solid #e3e8df; border-bottom: 1px solid #e3e8df; border-radius: 0;
  font: inherit; text-align: right; cursor: pointer; transition: background .15s;
}
.rp-cal-dia:nth-child(7n) { border-right: none; }
.rp-cal-dia:nth-last-child(-n + 7) { border-bottom: none; }
.rp-cal-dia:hover:not(:disabled) { background: #f2f9ed; }
.rp-cal-dia:focus-visible { outline: 2px solid #39a900; outline-offset: -2px; }
.rp-cal-dia.rp-activo { background: #f2f9ed; box-shadow: inset 0 0 0 2px #39a900; }
.rp-cal-dia.rp-cal-hoy { background: #f1f8e9; }
.rp-cal-dia.rp-cal-otro { background: #f5f5f5; cursor: default; }
.rp-cal-dia.rp-cal-fuera { cursor: default; }
.rp-cal-num { font-size: 14px; font-weight: 700; color: #16210f; line-height: 1.2; }
.rp-cal-otro .rp-cal-num, .rp-cal-fuera .rp-cal-num { color: #b7bdb3; font-weight: 600; }
.rp-cal-evento {
  display: block; width: 100%; padding: 3px 6px; border-radius: 4px; text-align: left;
  font-size: 10px; font-weight: 800; letter-spacing: .02em; color: #fff; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-cal-evento.rp-tarde { background: var(--c-tarde); color: #06324a; }
.rp-cal-evento.rp-excusa { background: var(--c-excusa); color: #4a3b00; }
.rp-cal-evento.rp-falla { background: var(--c-falla); }

.rp-detalle { margin-top: 24px; padding: 18px 20px; background: #f7f9f5; border-radius: 14px; }
.rp-detalle h4 { margin: 0 0 10px; font-size: 15px; font-weight: 800; color: #16210f; }
.rp-detalle h4::first-letter { text-transform: uppercase; }
.rp-badge-det { margin-left: 8px; font-size: 11px; vertical-align: middle; }
.rp-detalle-vacio { margin: 0; font-size: 14px; color: #5b6356; }
.rp-detalle ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.rp-detalle li { display: flex; gap: 12px; align-items: flex-start; }
.rp-detalle li .rp-punto { margin-top: 6px; }
.rp-detalle li strong { display: block; font-size: 14px; color: #16210f; }
.rp-detalle-meta { display: block; font-size: 13px; color: #5b6356; }

.rp-tipos { display: inline-flex; gap: 4px; padding: 4px; background: #f0f2ee; border-radius: 12px; margin-bottom: 22px; }
.rp-tipo { height: 38px; padding: 0 20px; border: none; border-radius: 9px; background: transparent; font: inherit; font-size: 14.5px; font-weight: 700; color: #5b6356; cursor: pointer; transition: background .15s, color .15s; }
.rp-tipo:hover { color: #16210f; }
.rp-tipo-on, .rp-tipo-on:hover { background: #fff; color: #2c8300; box-shadow: 0 1px 3px rgba(22, 33, 15, .12); }
.rp-tipo:focus-visible { outline: 2px solid #39a900; outline-offset: 2px; }
.rp-num-col { text-align: right !important; white-space: nowrap; }
.rp-tabla tfoot td { padding: 13px 16px; background: #f7f9f5; font-weight: 800; color: #16210f; border-top: 1px solid #e3e8df; }
.rp-nota { margin: 14px 2px 0; font-size: 13px; color: #5b6356; }

.rp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 8px; }
.rp-nota-stats { margin: 0 2px 20px; }
.rp-aviso { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0 0 20px; padding: 14px 18px; background: #fff7e6; border: 1px solid #f5d28a; border-radius: 14px; color: #8a5a00; }
.rp-aviso svg { flex: none; }
.rp-aviso p { margin: 0; flex: 1; min-width: 220px; font-size: 14px; color: #6b4600; }
.rp-aviso-btn { height: 38px; padding: 0 16px; border: 1px solid #e0b04a; border-radius: 9px; background: #fff; font: inherit; font-size: 13.5px; font-weight: 700; color: #8a5a00; cursor: pointer; }
.rp-aviso-btn:hover { background: #fff1d0; }
.rp-ruta-ok { padding: 20px; background: #f2f9ed; border-radius: 14px; color: #2c8300; font-weight: 600; font-size: 14.5px; }
.rp-motivos { display: flex; flex-wrap: wrap; gap: 6px; }
.rp-motivo { padding: 3px 10px; border-radius: 999px; background: #fbeae6; color: #b3361f; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.rp-chip-fecha { padding: 3px 9px; border-radius: 8px; background: #f0f2ee; color: #3d4638; font-size: 12.5px; font-weight: 600; white-space: nowrap; }

.rp-opcional { font-weight: 500; color: #9aa294; }
.rp-vacio-msg { padding: 24px; text-align: center; color: #5b6356; font-size: 14.5px; }

.rp-tabla-wrap { overflow-x: auto; border: 1px solid #e3e8df; border-radius: 14px; }
.rp-tabla { width: 100%; border-collapse: collapse; font-size: 14.5px; }
.rp-tabla th { text-align: left; padding: 12px 16px; background: #f7f9f5; font-size: 12.5px; font-weight: 700; color: #5b6356; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #e3e8df; white-space: nowrap; }
.rp-tabla td { padding: 13px 16px; border-bottom: 1px solid #eef1ea; color: #16210f; vertical-align: middle; }
.rp-tabla tbody tr:last-child td { border-bottom: none; }
.rp-fila { cursor: pointer; transition: background .15s; }
.rp-fila:hover, .rp-fila:focus-visible { background: #f2f9ed; outline: none; }
.rp-th-acc { text-align: right !important; }
.rp-td-acc { text-align: right; white-space: nowrap; }
.rp-link { background: none; border: none; padding: 6px 8px; font: inherit; font-size: 13.5px; font-weight: 700; color: #2c8300; cursor: pointer; border-radius: 6px; }
.rp-link:hover { background: #e8f5e0; }
.rp-acciones-celda { display: inline-flex; align-items: center; gap: 8px; }
.rp-btn-reportar {
  height: 34px; padding: 0 14px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 700;
  background: #c4432b; color: #fff; cursor: pointer; border: 1px solid transparent; transition: background .15s, opacity .15s;
}
.rp-btn-reportar:hover:not(:disabled) { background: #a33622; }
.rp-btn-reportar:disabled { opacity: .45; cursor: not-allowed; }
.rp-reportado { padding: 5px 10px; border-radius: 999px; background: #f2f9ed; color: #2c8300; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.rp-reportado-simulado { background: #fff7e0; color: #9a6b00; }
.rp-reporte-error { margin: 16px 0 0; padding: 10px 14px; background: #fbeae6; border: 1px solid #f3cfc6; color: #c4432b; border-radius: 8px; font-size: 13px; font-weight: 600; }

.rp-paginacion { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; }
.rp-pag-flecha {
  width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center;
  background: #fff; border: 1px solid #d5dbd0; border-radius: 50%; color: #2e7d32; cursor: pointer;
  transition: background .15s, border-color .15s, opacity .15s;
}
.rp-pag-flecha:hover:not(:disabled) { background: #f2f9ed; border-color: #39a900; }
.rp-pag-flecha:disabled { opacity: .4; cursor: default; }
.rp-pag-info { font-size: 14px; font-weight: 700; color: #16210f; }

.rp-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(22, 33, 15, .45); display: flex; align-items: center; justify-content: center; padding: 20px; }
.rp-modal { background: #fff; border-radius: 20px; width: 100%; max-width: 820px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(22, 33, 15, .28); }
.rp-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 22px 26px 16px; border-bottom: 1px solid #e3e8df; }
.rp-modal-head h3 { margin: 0 0 4px; font-size: 19px; font-weight: 800; color: #16210f; }
.rp-modal-head p { margin: 0; font-size: 13.5px; color: #5b6356; }
.rp-cerrar { background: none; border: none; padding: 6px; border-radius: 8px; color: #5b6356; cursor: pointer; }
.rp-cerrar:hover { background: #f0f2ee; }
.rp-modal-cuerpo { padding: 20px 26px 26px; overflow-y: auto; }
.rp-sec-titulo { margin: 0 0 12px; font-size: 14px; font-weight: 800; color: #16210f; }
.rp-resumen-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 26px; }
.rp-dato { background: #f7f9f5; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px; }
.rp-dato span { font-size: 12.5px; color: #5b6356; }
.rp-dato b { font-size: 15px; color: #16210f; }
.rp-sin-inas { margin: 0; padding: 16px; background: #f2f9ed; border-radius: 12px; color: #2c8300; font-weight: 600; font-size: 14px; }
.rp-tabla-det td, .rp-tabla-det th { padding: 11px 14px; }
.rp-modal-reporte {
  --rp-verde: var(--verde, #39a900);
  --rp-verde-osc: #2c8300;
  --rp-borde: var(--borde, #e3e8df);
  --rp-texto: var(--tinta, #16210f);
  max-width: 480px;
}
.rp-reporte-texto { margin: 0; font-size: 14.5px; line-height: 1.55; color: #16210f; }
.rp-reporte-acciones { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

@media (max-width: 1100px) { .rp-rejilla { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* Ventana flotante de detalle del día */
.rp-pop { position: fixed; z-index: 1100; max-width: calc(100vw - 24px); background: #fff; border-radius: 6px; box-shadow: 0 8px 28px rgba(22, 33, 15, .28); overflow: hidden; }
.rp-pop-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #e8f5e0; color: #2e7d32; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.rp-pop-x { background: none; border: none; font-size: 22px; line-height: 1; color: #2e7d32; cursor: pointer; padding: 0 4px; }
.rp-pop-x:hover { color: #16210f; }
.rp-pop-body { padding: 14px 16px 16px; max-height: 60vh; overflow-y: auto; }
.rp-pop-fecha { margin: 0 0 12px; font-size: 14px; font-weight: 800; color: #16210f; }
.rp-pop-fecha::first-letter { text-transform: uppercase; }
.rp-pop-vacio { margin: 0; font-size: 14px; color: #5b6356; }
.rp-pop-reg { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #e3e8df; }
.rp-pop-reg:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
.rp-pop-lbl { margin-top: 8px; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #2e7d32; }
.rp-pop-lbl:first-child { margin-top: 0; }
.rp-pop-val { font-size: 14px; color: #16210f; word-break: break-word; }
.rp-pop-dot { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 50%; background: #b7bdb3; }
.rp-pop-dot.rp-pop-tarde { background: #38bdf8; }
.rp-pop-dot.rp-pop-excusa { background: #f5c400; }
.rp-pop-dot.rp-pop-falla { background: #d93025; }

@media (max-width: 640px) {
  .rp-panel, .rp-resultado { padding: 22px 18px 24px; border-radius: 18px; }
  .rp-rejilla { grid-template-columns: 1fr; }
  .rp-modal-head, .rp-modal-cuerpo { padding-left: 18px; padding-right: 18px; }
  .rp-cal-dia { min-height: 58px; padding: 6px 4px 4px; }
  .rp-cal-num { font-size: 12px; }
  .rp-cal-evento { font-size: 8px; padding: 2px 3px; }
  .rp-cal-select-mes { min-width: 120px; }
}
</style>
