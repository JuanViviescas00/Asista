<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import api from '../services/index.js'
import * as XLSX from 'xlsx'
import { socket, unirseASalaFicha, salirDeSalaFicha } from '../services/index.js'
import { calcularMinutosTranscurridos, calcularEstadoPorTiempo } from '../utils/asistenciaTiempo.js'
import '../styles/panelInstructor.css'

// Flag de control: el enrolamiento/captura de huellas por SDK del navegador
// (Fingerprint.WebApi + endpoints /estudiantes/fingerprint-*) está reemplazado
// por la app de escritorio Asista. Con `true` se restaura el flujo anterior.
const ENROLAMIENTO_EN_PANEL = false

const usuarioStr = sessionStorage.getItem('user_data')
const usuario = ref(usuarioStr ? JSON.parse(usuarioStr) : { id: '', nombre: 'Instructor', rol: 'Instructor' })

const misFichas = ref([])
const fichaSeleccionada = ref(null)
const estudiantesFicha = ref([])
const excusasFicha = ref([])
const asistenciasFicha = ref([])
const loading = ref(true)
const error = ref('')
const vistaFicha = ref('asistencia')

// Control Remoto en Vivo
const sesionRemotaActiva = ref(false)
const dispositivoOnline = ref(false)
const feedEnVivoDocente = ref([])
const claseIniciadaAt = ref(null)

// Toast notifications
const toast = reactive({ show: false, message: '', type: 'success' })
function showToast(message, type = 'success') {
  toast.show = true
  toast.message = message
  toast.type = type
  setTimeout(() => { toast.show = false }, 3000)
}

onMounted(async () => {
  await Promise.all([cargarMisFichas(), cargarDiasFestivos()])
  await restaurarEstadoClase()
  iniciarSocketDocente()
})

onUnmounted(() => {
  if (fichaSeleccionada.value?._id) {
    salirDeSalaFicha(fichaSeleccionada.value._id)
  }
})

function iniciarSocketDocente() {
  socket.on('ATTENDANCE_REGISTERED', (data) => {
    if (!data || !data.estudianteId) return
    if (asistenciaDia.value[data.estudianteId]) {
      asistenciaDia.value[data.estudianteId].estado = data.estado
      asistenciaDia.value[data.estudianteId].horaMarcacion = data.hora
    }
    feedEnVivoDocente.value.unshift({
      id: data.estudianteId,
      nombre: `${data.nombres} ${data.apellidos}`,
      hora: data.hora,
      estado: data.estado,
    })
    if (feedEnVivoDocente.value.length > 8) {
      feedEnVivoDocente.value.pop()
    }
    showToast(`${data.nombres} ${data.apellidos} marcó ${data.estado} (${data.hora})`, data.estado === 'Tardanza' ? 'warning' : 'success')
  })

  socket.on('CLASS_ACTIVATED', (data) => {
    if (!data || !data.fichaId) return
    if (fichaSeleccionada.value && String(fichaSeleccionada.value._id) === String(data.fichaId)) {
      sesionRemotaActiva.value = true
    }
  })

  socket.on('CLASS_DEACTIVATED', (data) => {
    if (!data || !data.fichaId) return
    if (fichaSeleccionada.value && String(fichaSeleccionada.value._id) === String(data.fichaId)) {
      sesionRemotaActiva.value = false
    }
  })

  socket.on('error_autenticacion', (data) => {
    console.warn('[WS] error_autenticacion:', data)
    showToast(data?.error || 'No autorizado para unirse a la sala de la ficha.', 'error')
  })

  socket.on('DEVICE_STATUS', (data) => {
    dispositivoOnline.value = !!data?.online
  })

  socket.on('DEVICE_CONNECTED', () => {
    dispositivoOnline.value = true
  })

  socket.on('DEVICE_DISCONNECTED', () => {
    dispositivoOnline.value = false
  })
}

async function restaurarEstadoClase() {
  try {
    const estado = await api.clases.estado()
    if (estado?.activa && estado.ficha) {
      const fichaActiva = misFichas.value.find(f => String(f._id) === String(estado.ficha._id))
      if (fichaActiva) {
        await seleccionarFicha(fichaActiva)
      }
      sesionRemotaActiva.value = true
      claseIniciadaAt.value = estado.iniciadaAt ? new Date(estado.iniciadaAt).getTime() : Date.now()
    } else {
      sesionRemotaActiva.value = false
      claseIniciadaAt.value = null
    }
  } catch (e) {
    console.error('Error al restaurar el estado de la clase:', e)
  }
}

async function iniciarSesionRemotaDocente() {
  if (!fichaSeleccionada.value) return
  try {
    const resultado = await api.clases.activar({
      fichaId: fichaSeleccionada.value._id,
      instructorId: usuario.value.id,
    })
    sesionRemotaActiva.value = true
    claseIniciadaAt.value = resultado?.clase?.iniciadaAt ? new Date(resultado.clase.iniciadaAt).getTime() : Date.now()
    showToast('Clase activada: el lector del aula está listo para tomar asistencia.', 'success')
  } catch (e) {
    showToast(e.message || 'No se pudo activar la clase', 'error')
  }
}

async function detenerSesionRemotaDocente() {
  if (!fichaSeleccionada.value) return
  try {
    await api.clases.finalizar({
      fichaId: fichaSeleccionada.value._id,
      instructorId: usuario.value.id,
    })
    sesionRemotaActiva.value = false
    claseIniciadaAt.value = null
    showToast('Clase finalizada.', 'info')
  } catch (e) {
    showToast(e.message || 'No se pudo finalizar la clase', 'error')
  }
}

const listaDiasFestivos = ref([])

async function cargarDiasFestivos() {
  try {
    listaDiasFestivos.value = await api.diasFestivos.getAll()
  } catch (e) {
    console.error('Error al cargar dias festivos:', e)
  }
}

async function cargarMisFichas() {
  loading.value = true
  error.value = ''
  try {
    if (usuario.value.id) {
      misFichas.value = await api.fichas.getMisFichas(usuario.value.id)
      if (misFichas.value.length > 0) {
        seleccionarFicha(misFichas.value[0])
      }
    } else {
      misFichas.value = await api.fichas.getAll()
    }
  } catch (err) {
    error.value = err.message || 'Error al cargar las fichas asignadas'
  } finally {
    loading.value = false
  }
}

async function seleccionarFicha(ficha) {
  if (fichaSeleccionada.value?._id) {
    salirDeSalaFicha(fichaSeleccionada.value._id)
  }
  fichaSeleccionada.value = ficha
  vistaFicha.value = 'asistencia'
  feedEnVivoDocente.value = []
  if (ficha?._id) {
    unirseASalaFicha(ficha._id, 'docente')
  }
  await cargarDatosFicha(ficha._id)
}

const memoriaBiometricaRAM = ref([])

async function cargarDatosFicha(fichaId) {
  try {
    const estRes = await api.estudiantes.getAll({ fichaId, estado: 'Activo' }).catch(e => { console.error('Error est:', e); return [] })
    const asisRes = await api.asistencias.getAll({ fichaId }).catch(e => { console.error('Error asis:', e); return [] })
    const bioRes = await api.fichas.getPlantillasBiometricas(fichaId).catch(e => { console.error('Error bio:', e); return [] })

    estudiantesFicha.value = Array.isArray(estRes) ? estRes : []
    asistenciasFicha.value = Array.isArray(asisRes) ? asisRes : []
    memoriaBiometricaRAM.value = Array.isArray(bioRes) ? bioRes : []
    inicializarAsistenciaDia()
  } catch (err) {
    console.error('Error al cargar detalle de ficha:', err)
  }
}

// =============================================
// TOMA DE ASISTENCIA Y GESTIÓN DE JORNADA
// =============================================
function getHoyLocalISO() {
  const ahora = new Date()
  const year = ahora.getFullYear()
  const month = String(ahora.getMonth() + 1).padStart(2, '0')
  const day = String(ahora.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fechaHoyMax = computed(() => getHoyLocalISO())
const fechaAsistencia = ref(getHoyLocalISO())
const asistenciaDia = ref({})
const guardandoAsistencia = ref(false)

const esFechaActualOHoy = computed(() => {
  return fechaAsistencia.value >= fechaHoyMax.value
})

// Estado de inhabilitación de jornada
const showInhabilitarModal = ref(false)
const motivoInhabilitar = ref('Reunión institucional / Actividad SENA')
const motivoInhabilitarOtro = ref('')
const inhabilitando = ref(false)

const esDomingo = computed(() => {
  if (!fechaAsistencia.value) return false
  const [y, m, d] = fechaAsistencia.value.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  return dt.getDay() === 0
})

const diaFestivoOInhabilitado = computed(() => {
  const fecha = fechaAsistencia.value
  const ficha = fichaSeleccionada.value
  if (!ficha) return null
  const fichaId = String(ficha._id)
  const jornada = ficha.jornada

  return (listaDiasFestivos.value || []).find(d => {
    if (d.fecha !== fecha) return false
    if (!d.fichasAplicables || d.fichasAplicables === 'todas') return true
    if (d.fichasAplicables === 'jornada') {
      return Array.isArray(d.jornadasSeleccionadas) && d.jornadasSeleccionadas.includes(jornada)
    }
    if (d.fichasAplicables === 'especificas') {
      return (d.fichasSeleccionadas || []).some(f => String(f._id || f) === fichaId)
    }
    return false
  })
})

const jornadaInhabilitada = computed(() => {
  const hoy = fechaAsistencia.value
  if (esDomingo.value) return true
  const porAsistencia = asistenciasFicha.value.some(a => a.fecha === hoy && a.estado === 'Inhabilitada')
  return porAsistencia || !!diaFestivoOInhabilitado.value
})

const motivoInhabilitacionDia = computed(() => {
  const hoy = fechaAsistencia.value
  if (esDomingo.value) {
    return 'Domingo — Día no laboral institucional'
  }
  if (diaFestivoOInhabilitado.value) {
    const d = diaFestivoOInhabilitado.value
    return d.descripcion ? `${d.motivo} — ${d.descripcion}` : d.motivo
  }
  const reg = asistenciasFicha.value.find(a => a.fecha === hoy && a.estado === 'Inhabilitada')
  return reg?.motivoInhabilitacion || 'Jornada no impartida'
})

function cambiarFechaDia(delta) {
  const [y, m, d] = fechaAsistencia.value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  const nuevaFecha = `${year}-${month}-${day}`

  if (nuevaFecha > fechaHoyMax.value) {
    showToast('No es posible consultar ni gestionar fechas futuras.', 'warning')
    fechaAsistencia.value = fechaHoyMax.value
  } else {
    fechaAsistencia.value = nuevaFecha
  }
  inicializarAsistenciaDia()
}

function onFechaChange() {
  if (fechaAsistencia.value > fechaHoyMax.value) {
    showToast('No es posible consultar ni gestionar fechas futuras.', 'warning')
    fechaAsistencia.value = fechaHoyMax.value
  }
  inicializarAsistenciaDia()
}

function irAHoy() {
  fechaAsistencia.value = fechaHoyMax.value
  inicializarAsistenciaDia()
}

function abrirModalInhabilitar() {
  if (fechaAsistencia.value > fechaHoyMax.value) {
    showToast('No es posible inhabilitar fechas futuras.', 'warning')
    return
  }
  motivoInhabilitar.value = 'Reunión institucional / Actividad SENA'
  motivoInhabilitarOtro.value = ''
  showInhabilitarModal.value = true
}

async function confirmarInhabilitarJornada() {
  inhabilitando.value = true
  const motivoFinal = motivoInhabilitar.value === 'Otro' ? (motivoInhabilitarOtro.value.trim() || 'Jornada no impartida') : motivoInhabilitar.value
  const fecha = fechaAsistencia.value
  showInhabilitarModal.value = false
  try {
    await api.asistencias.inhabilitarJornada({
      fichaId: fichaSeleccionada.value._id,
      fecha: fecha,
      motivo: motivoFinal,
      instructorId: usuario.value.id || null,
    })

    // Actualización inmediata en memoria para reactividad instantánea
    asistenciasFicha.value = asistenciasFicha.value.filter(a => a.fecha !== fecha)
    for (const est of estudiantesFicha.value) {
      asistenciasFicha.value.push({
        estudianteId: est,
        fichaId: fichaSeleccionada.value._id,
        fecha: fecha,
        estado: 'Inhabilitada',
        hora: '—',
        motivoInhabilitacion: motivoFinal,
      })
    }
    inicializarAsistenciaDia()

    await cargarDatosFicha(fichaSeleccionada.value._id)
    showToast(`Sesión del ${fecha} inhabilitada correctamente.`, 'info')
  } catch (err) {
    showToast('Error al inhabilitar jornada: ' + err.message, 'error')
    await cargarDatosFicha(fichaSeleccionada.value._id)
  } finally {
    inhabilitando.value = false
  }
}

async function reactivarJornada() {
  inhabilitando.value = true
  const fecha = fechaAsistencia.value
  try {
    await api.asistencias.reactivarJornada({
      fichaId: fichaSeleccionada.value._id,
      fecha: fecha,
    })

    // Limpiar en memoria inmediatamente
    asistenciasFicha.value = asistenciasFicha.value.filter(a => !(a.fecha === fecha && a.estado === 'Inhabilitada'))
    inicializarAsistenciaDia()

    await cargarDatosFicha(fichaSeleccionada.value._id)
    showToast(`Sesión del ${fecha} reactivada exitosamente.`, 'success')
  } catch (err) {
    showToast('Error al reactivar jornada: ' + err.message, 'error')
  } finally {
    inhabilitando.value = false
  }
}

function calcularHorasTardanza(horaMarcacionStr, jornada) {
  if (!horaMarcacionStr) return { horas: 0, texto: '0 horas' }

  // Horarios de inicio oficial:
  // Mañana: 6:30 AM (390 min) -> Tolerancia 10 min hasta 6:40 AM (400 min)
  // Tarde: 12:30 PM (750 min) -> Tolerancia 10 min hasta 12:40 PM (760 min)
  // Noche: 6:30 PM / 18:30 (1110 min) -> Tolerancia 10 min hasta 6:40 PM (1120 min)
  let inicioMin = 390 // 6:30 AM por defecto
  let limiteTolerancia = 400 // 6:40 AM

  if (jornada === 'Tarde') {
    inicioMin = 750 // 12:30 PM
    limiteTolerancia = 760 // 12:40 PM
  } else if (jornada === 'Noche') {
    inicioMin = 1110 // 6:30 PM (18:30)
    limiteTolerancia = 1120 // 6:40 PM
  }

  let minutosMarcacion = 0
  if (horaMarcacionStr instanceof Date) {
    minutosMarcacion = horaMarcacionStr.getHours() * 60 + horaMarcacionStr.getMinutes()
  } else if (typeof horaMarcacionStr === 'string') {
    const esPM = /p\.?\s*m\.?/i.test(horaMarcacionStr)
    const esAM = /a\.?\s*m\.?/i.test(horaMarcacionStr)
    const match = horaMarcacionStr.match(/(\d{1,2}):(\d{1,2})/)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      if (esPM && h < 12) h += 12
      if (esAM && h === 12) h = 0
      minutosMarcacion = h * 60 + m
    }
  }

  if (minutosMarcacion <= limiteTolerancia) {
    return { horas: 0, texto: '0 horas' }
  }

  const minutosPasadosInicio = minutosMarcacion - inicioMin
  const horasTardanza = Math.max(1, Math.ceil(minutosPasadosInicio / 60))

  return {
    horas: horasTardanza,
    texto: `${horasTardanza} ${horasTardanza === 1 ? 'hora' : 'horas'}`
  }
}

function inicializarAsistenciaDia() {
  const hoy = fechaAsistencia.value
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  const registros = {}
  for (const est of estudiantesFicha.value) {
    const existente = asistenciasFicha.value.find(
      a => (String(a.estudianteId?._id || a.estudianteId) === String(est._id)) && a.fecha === hoy
    )
    const estado = existente ? existente.estado : 'Ninguno'
    const hora = existente ? (existente.hora || '') : ''
    const tardanzaInfo = estado === 'Tardanza'
      ? (existente.tiempoTardanza ? { horas: existente.horasTardanza || 1, texto: existente.tiempoTardanza } : calcularHorasTardanza(hora, jornadaFicha))
      : { horas: 0, texto: '0 horas' }

    registros[est._id] = {
      estado,
      excusa: existente ? existente.estado === 'Excusada' : false,
      horaMarcacion: hora,
      horasTardanza: tardanzaInfo.horas,
      tiempoTardanza: tardanzaInfo.texto,
    }
  }
  asistenciaDia.value = registros
}

function marcarPresente(estId) {
  if (jornadaInhabilitada.value) {
    showToast('La sesión está inhabilitada. Reactívala para tomar asistencia.', 'warning')
    return
  }
  const reg = asistenciaDia.value[estId]
  if (!reg) return

  if (reg.estado === 'Presente' || reg.estado === 'Tardanza') {
    // Desmarcar al hacer clic de nuevo
    reg.estado = 'Ninguno'
    reg.horaMarcacion = ''
    reg.horasTardanza = 0
    reg.tiempoTardanza = '0 horas'
  } else {
    const ahora = new Date()
    const horaFormateada = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const ahoraMs = ahora.getTime()
    const minutos = calcularMinutosTranscurridos(claseIniciadaAt.value || ahoraMs, ahoraMs)
    const tardanzaInfo = calcularEstadoPorTiempo(minutos)

    reg.estado = tardanzaInfo.estado
    reg.horaMarcacion = horaFormateada
    reg.horasTardanza = tardanzaInfo.horasTardanza
    reg.tiempoTardanza = tardanzaInfo.tiempoTardanza
    reg.excusa = false
  }
}

function toggleExcusa(estId) {
  if (jornadaInhabilitada.value) {
    showToast('La sesión está inhabilitada. Reactívala para registrar excusas.', 'warning')
    return
  }
  const reg = asistenciaDia.value[estId]
  if (reg) {
    reg.excusa = !reg.excusa
    if (reg.excusa) {
      reg.estado = 'Excusada'
    } else {
      reg.estado = 'Ninguno'
      reg.horaMarcacion = ''
      reg.horasTardanza = 0
      reg.tiempoTardanza = '0 horas'
    }
  }
}

async function guardarAsistenciaDia() {
  if (jornadaInhabilitada.value) {
    showToast('Esta sesión ya se encuentra guardada como inhabilitada.', 'info')
    return
  }
  if (fechaAsistencia.value > fechaHoyMax.value) {
    showToast('No es posible registrar ni finalizar asistencias en fechas futuras.', 'warning')
    return
  }
  guardandoAsistencia.value = true
  const hoy = fechaAsistencia.value
  const horaActual = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  let exitosos = 0
  let errores = 0

  for (const est of estudiantesFicha.value) {
    const reg = asistenciaDia.value[est._id]
    let estadoFinal = 'Falta'
    let horaMarcada = horaActual
    let hTardanza = 0
    let tTardanza = '0 horas'

    if (reg) {
      if (reg.excusa) {
        estadoFinal = 'Excusada'
        horaMarcada = reg.horaMarcacion || horaActual
      } else if (['Presente', 'Tardanza', 'Excusada'].includes(reg.estado)) {
        estadoFinal = reg.estado
        horaMarcada = reg.horaMarcacion || horaActual
        if (estadoFinal === 'Tardanza') {
          const calc = calcularHorasTardanza(horaMarcada, jornadaFicha)
          hTardanza = reg.horasTardanza || calc.horas
          tTardanza = reg.tiempoTardanza || calc.texto
        }
      }
    }

    try {
      await api.asistencias.create({
        estudianteId: est._id,
        fichaId: fichaSeleccionada.value._id,
        estado: estadoFinal,
        fecha: hoy,
        hora: horaMarcada,
        horasTardanza: hTardanza,
        tiempoTardanza: tTardanza,
        instructorId: usuario.value.id || null,
      })
      exitosos++
    } catch (err) {
      errores++
      console.error(`Error asistencia ${est.nombres}:`, err.message)
    }
  }

  await cargarDatosFicha(fichaSeleccionada.value._id)
  guardandoAsistencia.value = false

  if (errores === 0) {
    showToast(`Jornada finalizada. Asistencias guardadas exitosamente.`)
  } else {
    showToast(`${exitosos} guardados, ${errores} con error`, 'warning')
  }
}

// Contadores de asistencia del día
const conteoAsistencia = computed(() => {
  if (jornadaInhabilitada.value) {
    return { Presente: 0, Tardanza: 0, Falta: 0, Excusada: 0, Inhabilitada: estudiantesFicha.value.length }
  }
  const conteo = { Presente: 0, Tardanza: 0, Falta: 0, Excusada: 0 }
  for (const est of estudiantesFicha.value) {
    const reg = asistenciaDia.value[est._id]
    if (reg) {
      const estado = reg.excusa ? 'Excusada' : reg.estado
      if (['Presente', 'Tardanza', 'Excusada'].includes(estado)) {
        conteo[estado]++
      } else {
        conteo.Falta++ // Los no marcados cuentan como Falta automática
      }
    } else {
      conteo.Falta++
    }
  }
  return conteo
})



// =============================================
// SEMÁFORO DE ESTADO (WS SERVIDORES + LECTORES USB)
// =============================================
const wsConectado = ref(false)
const sdkBackendActivo = ref(false)
const lectorConectado = ref(false)
const sdkCargando = ref(true)
const estadoLector = ref('Verificando Lector USB...')

let fpSdk = null
let currentReaderUid = ''
let capturing = false
let sdkInitIntentos = 0
let currentFormat = null
let modoCaptura = 'enrolamiento' // 'enrolamiento' o 'asistencia'

// Estado de verificación biométrica para asistencia
const verificandoHuella = ref(false)
const ultimaVerificacion = ref(null)

async function verificarConexionServidor() {
  if (!ENROLAMIENTO_EN_PANEL) return
  try {
    const res = await api.estudiantes.fingerprint.status()
    wsConectado.value = true
    sdkBackendActivo.value = !!(res && res.sdkAvailable)
  } catch (err) {
    wsConectado.value = false
    sdkBackendActivo.value = false
  }
}

function verificarEstadoLectorUSB() {
  if (!ENROLAMIENTO_EN_PANEL) return
  if (!fpSdk || capturing || enrolando.value) return // No consultar durante captura o enrolamiento para no interrumpir la transmisión de datos

  fpSdk.enumerateDevices().then(function (readers) {
    sdkCargando.value = false
    if (readers && readers.length > 0) {
      currentReaderUid = readers[0]
      lectorConectado.value = true
      estadoLector.value = `Lector USB Conectado (${readers.length} dispositivo detectado)`
    } else {
      currentReaderUid = ''
      lectorConectado.value = false
      estadoLector.value = 'Sin lector de huellas USB'
    }
  }, function (error) {
    sdkCargando.value = false
    lectorConectado.value = false
    currentReaderUid = ''
    estadoLector.value = 'Servicio local de huellas no responde'
  })
}

function initFingerprintSDK() {
  if (!ENROLAMIENTO_EN_PANEL) return
  sdkInitIntentos++
  console.log('[FP SDK] Intento', sdkInitIntentos, '- verificando Fingerprint global...')

  if (typeof Fingerprint === 'undefined') {
    console.warn('[FP SDK] Fingerprint global no definido aun.')
    sdkCargando.value = true
    estadoLector.value = 'SDK no cargado - scripts faltantes'
    if (sdkInitIntentos < 10) {
      setTimeout(initFingerprintSDK, 1000)
    } else {
      sdkCargando.value = false
      lectorConectado.value = false
      estadoLector.value = 'SDK no disponible tras varios intentos'
    }
    return
  }

  console.log('[FP SDK] Fingerprint global OK, creando WebApi...')
  try {
    fpSdk = new Fingerprint.WebApi()
    console.log('[FP SDK] WebApi creado:', fpSdk)
  } catch (e) {
    console.error('[FP SDK] Error al crear WebApi:', e.message)
    sdkCargando.value = false
    lectorConectado.value = false
    estadoLector.value = 'Error al inicializar SDK: ' + e.message
    return
  }

  fpSdk.onDeviceConnected = function (e) {
    console.log('[FP SDK] Dispositivo conectado:', e)
    if (e && e.deviceUid) currentReaderUid = e.deviceUid
    lectorConectado.value = true
    sdkCargando.value = false
    estadoLector.value = 'Lector conectado - U.are.U 4500'
  }

  fpSdk.onDeviceDisconnected = function (e) {
    console.log('[FP SDK] Dispositivo desconectado:', e)
    lectorConectado.value = false
    currentReaderUid = ''
    estadoLector.value = 'Lector desconectado'
  }

  fpSdk.onCommunicationFailed = function (e) {
    console.error('[FP SDK] Error de comunicacion:', e)
    estadoLector.value = 'Error de comunicacion con el lector'
    lectorConectado.value = false
    sdkCargando.value = false
  }

  fpSdk.onSamplesAcquired = function (s) {
    console.log('[FP SDK] Muestra adquirida, modo:', modoCaptura)
    detenerCapturaSDK()
    try {
      const samples = JSON.parse(s.samples)
      if (!samples || samples.length === 0) {
        console.warn('[FP SDK] No hay samples en la respuesta')
        return
      }
      const imgSrc = 'data:image/png;base64,' + Fingerprint.b64UrlTo64(samples[0])
      console.log('[FP SDK] PNG generado, size:', imgSrc.length)
      if (modoCaptura === 'asistencia') {
        procesarVerificacionAsistencia(imgSrc)
      } else {
        enviarCapturaAlBackend(imgSrc)
      }
    } catch (e) {
      console.error('[FP SDK] Error procesando muestra:', e.message)
    }
  }

  fpSdk.onQualityReported = function (e) {
    console.log('[FP SDK] Calidad reportada:', e.quality)
  }

  console.log('[FP SDK] Enumerando dispositivos...')
  fpSdk.enumerateDevices().then(function (readers) {
    console.log('[FP SDK] Dispositivos encontrados:', readers)
    sdkCargando.value = false
    if (readers && readers.length > 0) {
      currentReaderUid = readers[0]
      lectorConectado.value = true
      estadoLector.value = 'Lector U.are.U 4500 listo (' + readers.length + ' dispositivo(s))'
    } else {
      estadoLector.value = 'No se detecto lector de huellas. ¿DigitalPersona Agent corriendo?'
      lectorConectado.value = false
    }
  }, function (error) {
    console.error('[FP SDK] Error al enumerar:', error)
    sdkCargando.value = false
    estadoLector.value = 'Error al buscar dispositivos: ' + (error.message || error)
    lectorConectado.value = false
  })
}

function iniciarCapturaSDK() {
  console.log('[FP SDK] iniciarCapturaSDK - capturing:', capturing, 'readerUid:', currentReaderUid)
  if (capturing) {
    console.warn('[FP SDK] Ya esta capturando')
    return
  }
  if (!currentReaderUid) {
    console.log('[FP SDK] No hay readerUid, re-enumerando...')
    fpSdk.enumerateDevices().then(function (readers) {
      if (readers && readers.length > 0) {
        currentReaderUid = readers[0]
        lectorConectado.value = true
        estadoLector.value = 'Lector listo'
        iniciarCapturaSDK()
      } else {
        showToast('Lector no detectado. Verifique la conexion USB y el DigitalPersona Agent.', 'error')
      }
    })
    return
  }

  console.log('[FP SDK] Iniciando adquisicion en', currentReaderUid, 'formato: PngImage')
  currentFormat = Fingerprint.SampleFormat.PngImage
  fpSdk.startAcquisition(currentFormat, currentReaderUid).then(function () {
    console.log('[FP SDK] Adquisicion iniciada OK')
    capturing = true
  }, function (error) {
    console.error('[FP SDK] Error al iniciar adquisicion:', error)
    showToast('Error al iniciar captura: ' + (error.message || error), 'error')
  })
}

function detenerCapturaSDK() {
  if (!capturing || !fpSdk) return
  console.log('[FP SDK] Deteniendo captura...')
  fpSdk.stopAcquisition().then(function () {
    console.log('[FP SDK] Captura detenida')
    capturing = false
  }, function (e) {
    console.warn('[FP SDK] Error al detener:', e)
    capturing = false
  })
}

// =============================================
// VERIFICACIÓN BIOMÉTRICA PARA ASISTENCIA
// =============================================
function iniciarVerificacionHuella() {
  if (!ENROLAMIENTO_EN_PANEL) return
  if (!fpSdk || !lectorConectado.value) {
    showToast('El lector de huellas no está conectado.', 'error')
    return
  }
  if (!fichaSeleccionada.value) {
    showToast('Selecciona una ficha primero.', 'error')
    return
  }
  verificandoHuella.value = true
  ultimaVerificacion.value = null
  modoCaptura = 'asistencia'
  showToast('Coloque el dedo en el lector para registrar asistencia...', 'info')
  iniciarCapturaSDK()
}

function detenerVerificacionHuella() {
  detenerCapturaSDK()
  verificandoHuella.value = false
  modoCaptura = 'enrolamiento'
}

async function procesarVerificacionAsistencia(imageBase64) {
  try {
    const fichaId = fichaSeleccionada.value._id
    const result = await api.estudiantes.fingerprint.verify(imageBase64, fichaId)

    if (result.match) {
      // Encontró al estudiante: marcarlo como presente
      const estId = result.studentId
      const nombre = `${result.nombres} ${result.apellidos}`
      
      // Verificar que el estudiante pertenece a esta ficha
      const estudianteEnFicha = estudiantesFicha.value.find(e => e._id === estId)
      if (estudianteEnFicha) {
        const reg = asistenciaDia.value[estId]
        if (reg && (reg.estado === 'Presente' || reg.estado === 'Tardanza')) {
          // Ya está marcado, no desmarcar
          ultimaVerificacion.value = {
            exito: true,
            nombre: nombre,
            estado: reg.estado,
            hora: reg.horaMarcacion,
          }
          showToast(`${nombre} ya estaba marcado como ${reg.estado}.`, 'info')
        } else {
          // Marcar como presente
          marcarPresente(estId)
          ultimaVerificacion.value = {
            exito: true,
            nombre: nombre,
            estado: asistenciaDia.value[estId]?.estado || 'Presente',
            hora: asistenciaDia.value[estId]?.horaMarcacion || '',
          }
          showToast(`${nombre} - ${asistenciaDia.value[estId]?.estado} (${asistenciaDia.value[estId]?.horaMarcacion})`, 'success')
        }
      } else {
        ultimaVerificacion.value = {
          exito: false,
          nombre: nombre,
          mensaje: 'Estudiante identificado pero no pertenece a esta ficha.',
        }
        showToast(`${nombre} no pertenece a esta ficha.`, 'warning')
      }
    } else {
      ultimaVerificacion.value = {
        exito: false,
        nombre: null,
        mensaje: 'Huella no reconocida. El estudiante puede no estar enrolado.',
      }
      showToast('Huella no reconocida. Intente de nuevo.', 'error')
    }
  } catch (err) {
    console.error('[Verificacion] Error:', err)
    ultimaVerificacion.value = {
      exito: false,
      nombre: null,
      mensaje: 'Error al verificar: ' + err.message,
    }
    showToast('Error al verificar huella: ' + err.message, 'error')
  }

  // Si el modo asistencia sigue activo, reactivar captura para el siguiente estudiante
  if (verificandoHuella.value) {
    setTimeout(() => {
      showToast('Lector listo para el siguiente estudiante...', 'info')
      iniciarCapturaSDK()
    }, 1500)
  }
}

// =============================================
// ENROLAMIENTO DE HUELLAS - SDK REAL
// =============================================
const showEnrolarModal = ref(false)
const estudianteTarget = ref(null)
const pasoEnrolamiento = ref(1)
const capturasCompletadas = ref(0)
const enrolando = ref(false)
const enrollmentSessionId = ref(null)
const dedoSeleccionado = ref('indice_derecho')

const sdkDisponible = computed(() => {
  return !!(lectorConectado.value && !sdkCargando.value)
})

const DEDOS = [
  { value: 'pulgar_derecho', label: 'Pulgar Derecho' },
  { value: 'indice_derecho', label: 'Índice Derecho' },
  { value: 'medio_derecho', label: 'Medio Derecho' },
  { value: 'anular_derecho', label: 'Anular Derecho' },
  { value: 'menique_derecho', label: 'Meñique Derecho' },
  { value: 'pulgar_izquierdo', label: 'Pulgar Izquierdo' },
  { value: 'indice_izquierdo', label: 'Índice Izquierdo' },
  { value: 'medio_izquierdo', label: 'Medio Izquierdo' },
  { value: 'anular_izquierdo', label: 'Anular Izquierdo' },
  { value: 'menique_izquierdo', label: 'Meñique Izquierdo' },
]

function abrirModalEnrolamiento(estudiante) {
  if (!ENROLAMIENTO_EN_PANEL) return
  estudianteTarget.value = estudiante
  pasoEnrolamiento.value = 1
  capturasCompletadas.value = 0
  enrolando.value = false
  dedoSeleccionado.value = estudiante.dedoEnrolado || 'indice_derecho'
  modoCaptura = 'enrolamiento'
  showEnrolarModal.value = true
  verificarEstadoLectorUSB()
}

async function iniciarEnrolamientoReal() {
  if (!lectorConectado.value) {
    showToast('El lector de huellas USB no está conectado.', 'error')
    return
  }
  if (!estudianteTarget.value) return

  enrolando.value = true
  pasoEnrolamiento.value = 2
  capturasCompletadas.value = 0
  modoCaptura = 'enrolamiento'

  try {
    const nombre = `${estudianteTarget.value.nombres} ${estudianteTarget.value.apellidos}`
    const doc = `${estudianteTarget.value.tipoDocumento} ${estudianteTarget.value.numeroDocumento}`
    const res = await api.estudiantes.fingerprint.enrollStart(
      estudianteTarget.value._id,
      nombre,
      doc,
      dedoSeleccionado.value
    )

    if (!res.success && res.error) {
      throw new Error(res.error)
    }

    enrollmentSessionId.value = res.sessionId
    showToast('Coloque el dedo en el lector para la primera muestra...', 'info')
    iniciarCapturaSDK()
  } catch (err) {
    enrolando.value = false
    pasoEnrolamiento.value = 1
    showToast('Error al iniciar enrolamiento: ' + err.message, 'error')
  }
}

async function enviarCapturaAlBackend(imageBase64) {
  if (!enrolando.value || !enrollmentSessionId.value || pasoEnrolamiento.value !== 2) return

  try {
    const res = await api.estudiantes.fingerprint.enrollCapture(
      enrollmentSessionId.value,
      imageBase64
    )

    if (res.error) {
      throw new Error(res.error)
    }

    const numMuestras = res.captures || (capturasCompletadas.value + 1)
    capturasCompletadas.value = numMuestras

    // Si el SDK indica que ya tiene suficientes muestras (ready=true) o se alcanzaron 4 muestras:
    if (res.ready || numMuestras >= 4) {
      // 1. Detener inmediatamente el sensor USB para evitar lecturas adicionales
      detenerCapturaSDK()
      enrolando.value = false

      // 2. Completar enrolamiento en el servidor con validación de no-duplicado
      try {
        const compRes = await api.estudiantes.fingerprint.enrollComplete(enrollmentSessionId.value)
        if (compRes.success) {
          pasoEnrolamiento.value = 3
          showToast(`¡Huella enrolada exitosamente para ${estudianteTarget.value.nombres}!`, 'success')
          await cargarDatosFicha(fichaSeleccionada.value._id)
        } else {
          throw new Error(compRes.error || 'Error al guardar plantilla biométrica')
        }
      } catch (compErr) {
        pasoEnrolamiento.value = 1
        capturasCompletadas.value = 0
        showToast(compErr.message, 'error')
      }
    } else {
      showToast(`Muestra ${numMuestras} de 4 registrada. Levante y coloque el dedo nuevamente...`, 'info')
      setTimeout(() => {
        if (enrolando.value && showEnrolarModal.value && pasoEnrolamiento.value === 2) {
          iniciarCapturaSDK()
        }
      }, 700)
    }
  } catch (err) {
    console.error('Error al procesar muestra:', err)
    showToast('Muestra no válida: ' + err.message + '. Intente de nuevo.', 'warning')
    setTimeout(() => {
      if (enrolando.value && showEnrolarModal.value && pasoEnrolamiento.value === 2) {
        iniciarCapturaSDK()
      }
    }, 1000)
  }
}

async function cancelarEnrolamiento() {
  detenerCapturaSDK()
  if (enrollmentSessionId.value) {
    try {
      await api.estudiantes.fingerprint.enrollCancel(enrollmentSessionId.value)
    } catch (e) {}
  }
  enrolando.value = false
  showEnrolarModal.value = false
  estudianteTarget.value = null
  pasoEnrolamiento.value = 1
  capturasCompletadas.value = 0
  enrollmentSessionId.value = null
  modoCaptura = 'asistencia'
}


// =============================================
// GESTIONAR ESTUDIANTES (Solo Líder)
// =============================================
const showEditEstudianteModal = ref(false)
const estudianteEditando = ref(null)
const editForm = reactive({
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  correo: '',
  telefono: '',
  genero: '',
  estado: 'Activo',
})
const guardandoEstudiante = ref(false)

function abrirEditarEstudiante(est) {
  estudianteEditando.value = est
  editForm.nombres = est.nombres
  editForm.apellidos = est.apellidos
  editForm.tipoDocumento = est.tipoDocumento || 'CC'
  editForm.numeroDocumento = est.numeroDocumento
  editForm.correo = est.correo
  editForm.telefono = est.telefono
  editForm.genero = est.genero || ''
  editForm.estado = est.estado || 'Activo'
  showEditEstudianteModal.value = true
}

async function guardarEstudiante() {
  guardandoEstudiante.value = true
  try {
    await api.estudiantes.update(estudianteEditando.value._id, {
      nombres: editForm.nombres,
      apellidos: editForm.apellidos,
      tipoDocumento: editForm.tipoDocumento,
      numeroDocumento: editForm.numeroDocumento,
      correo: editForm.correo,
      telefono: editForm.telefono,
      genero: editForm.genero,
      estado: editForm.estado,
    })
    await cargarDatosFicha(fichaSeleccionada.value._id)
    showEditEstudianteModal.value = false
    showToast('Datos del aprendiz actualizados correctamente')
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error')
  } finally {
    guardandoEstudiante.value = false
  }
}

// =============================================
// EXPORTAR A EXCEL
// =============================================
function exportarAsistenciaDia() {
  const hoy = fechaAsistencia.value
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  const data = estudiantesFicha.value.map(est => {
    const reg = asistenciaDia.value[est._id]
    const estadoStr = jornadaInhabilitada.value ? 'Inhabilitada' : (reg ? (reg.excusa ? 'Excusada' : reg.estado) : 'Sin registro')
    let tardanzaStr = '0 horas'
    if (estadoStr === 'Tardanza') {
      tardanzaStr = reg?.tiempoTardanza || calcularHorasTardanza(reg?.horaMarcacion, jornadaFicha).texto
    }
    return {
      'Aprendiz': `${est.nombres} ${est.apellidos}`,
      'Tipo Doc.': est.tipoDocumento,
      'Documento': est.numeroDocumento,
      'Estado': estadoStr,
      'Hora Marcación': jornadaInhabilitada.value ? '—' : (reg?.horaMarcacion || '—'),
      'Tiempo de Tardanza': tardanzaStr,
      'Excusa': reg?.excusa ? 'Sí' : 'No',
      'Fecha': hoy,
      'Observación / Motivo': jornadaInhabilitada.value ? motivoInhabilitacionDia.value : ''
    }
  })
  descargarExcel(data, `Asistencia_${fichaSeleccionada.value.codigoFicha}_${hoy}`)
}

function exportarHistorial() {
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  const data = asistenciasFicha.value.map(asis => {
    const est = estudiantesFicha.value.find(e => String(e._id) === String(asis.estudianteId?._id || asis.estudianteId))
    const nombreEst = est ? `${est.nombres} ${est.apellidos}` : (asis.estudianteId?.nombres ? `${asis.estudianteId.nombres} ${asis.estudianteId.apellidos}` : 'Aprendiz')
    const docEst = est ? est.numeroDocumento : (asis.estudianteId?.numeroDocumento || '')
    let tardanzaStr = '0 horas'
    if (asis.estado === 'Tardanza') {
      tardanzaStr = asis.tiempoTardanza || calcularHorasTardanza(asis.hora, jornadaFicha).texto
    }
    return {
      'Fecha': asis.fecha,
      'Hora': asis.hora || '—',
      'Aprendiz': nombreEst,
      'Documento': docEst,
      'Estado': asis.estado,
      'Tiempo de Tardanza': tardanzaStr,
      'Motivo Inhabilitación': asis.motivoInhabilitacion || '—',
    }
  })
  descargarExcel(data, `Historial_${fichaSeleccionada.value.codigoFicha}`)
}

function exportarListaEstudiantes() {
  const data = estudiantesFicha.value.map(est => ({
    'Nombres': est.nombres,
    'Apellidos': est.apellidos,
    'Tipo Doc.': est.tipoDocumento,
    'Documento': est.numeroDocumento,
    'Correo': est.correo,
    'Teléfono': est.telefono,
    'Género': est.genero || '',
    'Estado': est.estado,
    'Huella Enrolada': est.huellaEnrolada ? 'Sí' : 'No',
  }))
  descargarExcel(data, `Estudiantes_${fichaSeleccionada.value.codigoFicha}`)
}

function descargarSQLite() {
  try {
    const url = api.asistencias.downloadSqliteUrl()
    const a = document.createElement('a')
    a.href = url
    a.download = 'asistencias_institucion.sqlite'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast('Descargando base de datos SQLite institucional...', 'success')
  } catch (err) {
    console.error('Error al descargar SQLite:', err)
    showToast('Error al descargar SQLite: ' + err.message, 'error')
  }
}

function descargarExcel(data, nombreArchivo) {
  if (data.length === 0) {
    showToast('No hay datos para exportar', 'warning')
    return
  }
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')

  // Auto-ajustar ancho de columnas
  const maxWidths = {}
  const keys = Object.keys(data[0])
  keys.forEach(key => {
    maxWidths[key] = Math.max(
      key.length,
      ...data.map(row => String(row[key] || '').length)
    )
  })
  ws['!cols'] = keys.map(key => ({ wch: Math.min(maxWidths[key] + 2, 40) }))

  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
  showToast(`Archivo "${nombreArchivo}.xlsx" descargado`)
}
</script>

<template>
  <div class="panel-instructor">
    <!-- Toast Notification -->
    <Transition name="toast-fade">
      <div v-if="toast.show" class="toast-notification" :class="'toast-' + toast.type">
        {{ toast.message }}
      </div>
    </Transition>

    <!-- Encabezado del Instructor -->
    <div class="page-header">
      <h1>Bienvenido, {{ usuario.nombre }}</h1>
      <p>Panel de Control de Instructor SENA</p>
      <div class="header-role-pill">Docente</div>
    </div>

    <div v-if="loading" class="loading-box">
      Cargando tus fichas y grupos asignados...
    </div>

    <div v-else-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-else class="content-layout">
      <!-- Selector de Fichas -->
      <div class="fichas-sidebar">
        <h3>Mis Fichas Asignadas</h3>
        <div v-if="misFichas.length === 0" class="no-fichas">
          No tienes fichas asignadas actualmente. Contacta al Administrador.
        </div>
        <div
          v-for="ficha in misFichas"
          :key="ficha._id"
          class="ficha-card"
          :class="{ active: fichaSeleccionada && fichaSeleccionada._id === ficha._id }"
          @click="seleccionarFicha(ficha)"
        >
          <div class="ficha-card-header">
            <span class="ficha-code">Ficha {{ ficha.codigoFicha }}</span>
            <!-- Badge de Liderazgo -->
            <span v-if="ficha.esLider" class="badge badge-lider" title="Docente Líder de esta Ficha">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h16l1.5-9-5 3-4.5-6-4.5 6-5-3L4 18z"/></svg>
              Líder
            </span>
            <span v-else class="badge badge-comun" title="Docente Común en esta Ficha">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6z"/></svg>
              Común
            </span>
          </div>
          <div class="ficha-title">{{ ficha.nombrePrograma }}</div>
          <div class="ficha-sub">Aula: {{ ficha.aulaAsignada }} | {{ ficha.jornada }}</div>
        </div>
      </div>

      <!-- Detalle y Operaciones de la Ficha Seleccionada -->
      <div v-if="fichaSeleccionada" class="ficha-detail">
        <div class="ficha-banner">
          <div class="banner-title">
            <h3>{{ fichaSeleccionada.nombrePrograma }} ({{ fichaSeleccionada.codigoFicha }})</h3>
            <span v-if="fichaSeleccionada.esLider" class="badge-banner badge-lider">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h16l1.5-9-5 3-4.5-6-4.5 6-5-3L4 18z"/></svg>
              Docente Líder de la Ficha
            </span>
            <span v-else class="badge-banner badge-comun">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6z"/></svg>
              Docente Común
            </span>
          </div>
          <div class="banner-actions">
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'asistencia' }"
              @click="vistaFicha = 'asistencia'"
              title="Tomar Asistencia"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </button>
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'editar_asistencia' }"
              @click="vistaFicha = 'editar_asistencia'"
              title="Historial"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/></svg>
            </button>
            <!-- BOTÓN GESTIONAR ESTUDIANTES -->
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'gestionar_estudiantes' }"
              @click="vistaFicha = 'gestionar_estudiantes'"
              title="Gestionar Estudiantes"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
            </button>
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'docentes' }"
              @click="vistaFicha = 'docentes'"
              title="Equipo Docente"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="8" r="3.3"/><path d="M2.5 19c1.2-3.4 3.8-5.2 6.5-5.2s5.3 1.8 6.5 5.2z"/><circle cx="17" cy="8.5" r="2.6" opacity="0.75"/><path d="M15 13.6c2.2.4 4 2 5 5H18" opacity="0.75"/></svg>
            </button>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 1: TOMAR ASISTENCIA (POR DÍAS)      -->
        <!-- ========================================= -->
        <div v-if="vistaFicha === 'asistencia'" class="section-body">
          <!-- CENTRO DE CONTROL REMOTO -->
          <div class="remote-control-panel">
            <div class="remote-control-header">
              <div class="remote-control-info">
                <div class="remote-status-badge" :class="sesionRemotaActiva ? 'badge-live' : 'badge-idle'">
                  <span class="live-dot" :class="{ 'live-dot-pulsing': sesionRemotaActiva }"></span>
                  <span>{{ sesionRemotaActiva ? 'CLASE EN VIVO (PASE DE LISTA REMOTO ACTIVO)' : 'PASE DE LISTA REMOTO EN ESPERA' }}</span>
                </div>
                <p class="remote-desc">
                  {{ sesionRemotaActiva 
                    ? 'El Kiosco del aula está recibiendo huellas de los aprendices. Las marcaciones se sincronizan aquí en tiempo real.' 
                    : 'Inicia el pase de lista desde este dispositivo móvil/web para activar automáticamente el lector en el computador del aula.' 
                  }}
                </p>
              </div>

              <div class="remote-control-actions">
                <!-- Botón Iniciar / Finalizar Remoto -->
                <button
                  v-if="!sesionRemotaActiva"
                  type="button"
                  class="btn-remote-start"
                  @click="iniciarSesionRemotaDocente"
                  :disabled="jornadaInhabilitada"
                  title="Iniciar pase de lista"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-remote-stop"
                  @click="detenerSesionRemotaDocente"
                  title="Finalizar pase de lista"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>

              </div>
            </div>

            <!-- Feed en Vivo si la sesión remota está activa o hay marcaciones recientes -->
            <div v-if="feedEnVivoDocente.length > 0" class="remote-live-feed">
              <div class="live-feed-title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M8 9a6 6 0 0 1 8 0"/><path d="M5 6a10.5 10.5 0 0 1 14 0"/></svg>
                <span>Marcaciones Recientes en Tiempo Real</span>
              </div>
              <div class="live-feed-chips">
                <div
                  v-for="item in feedEnVivoDocente"
                  :key="item.id + item.hora"
                  class="live-feed-chip"
                  :class="item.estado === 'Tardanza' ? 'feed-tardanza' : 'feed-presente'"
                >
                  <span class="feed-dot"></span>
                  <strong>{{ item.nombre }}</strong>
                  <span class="feed-time">{{ item.hora }} ({{ item.estado }})</span>
                </div>
              </div>
            </div>
          </div>

          <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <h4>Tomar Asistencia</h4>
              <p class="section-desc">Control biométrico y manual por jornada para la Ficha {{ fichaSeleccionada.codigoFicha }}.</p>
            </div>
            
            <!-- Controles de Navegación por Días e Inhabilitación -->
            <div class="section-header-actions" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <!-- Barra de Navegación por Días -->
              <div class="day-nav-bar" :class="{ 'nav-day-inhabilitada': jornadaInhabilitada }" style="display: inline-flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 3px 6px;">
                <button
                  type="button"
                  class="btn-nav-day"
                  @click="cambiarFechaDia(-1)"
                  title="Día anterior"
                  style="background: transparent; border: none; font-size: 13px; font-weight: 700; color: #475569; padding: 5px 8px; cursor: pointer; border-radius: 4px;"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <input
                  type="date"
                  v-model="fechaAsistencia"
                  :max="fechaHoyMax"
                  @change="onFechaChange"
                  class="input-fecha"
                  title="Seleccionar fecha (Solo hoy o días anteriores)"
                  style="border: none; background: transparent; font-weight: 600; font-size: 13px; color: #1e293b; padding: 4px 6px; outline: none; cursor: pointer;"
                />
                <span v-if="jornadaInhabilitada" style="font-size: 11px; background: #ea580c; color: white; padding: 2px 6px; border-radius: 6px; font-weight: 700; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
                  Inhabilitada
                </span>
                <button
                  type="button"
                  class="btn-nav-day"
                  :disabled="esFechaActualOHoy"
                  @click="cambiarFechaDia(1)"
                  :title="esFechaActualOHoy ? 'No puedes avanzar a días futuros' : 'Día siguiente'"
                  :style="{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: esFechaActualOHoy ? '#cbd5e1' : '#475569',
                    padding: '5px 8px',
                    cursor: esFechaActualOHoy ? 'not-allowed' : 'pointer',
                    borderRadius: '4px'
                  }"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button
                  type="button"
                  class="btn-today"
                  @click="irAHoy"
                  :disabled="fechaAsistencia === fechaHoyMax"
                  title="Ir a hoy"
                  :style="{
                    background: fechaAsistencia === fechaHoyMax ? '#f1f5f9' : '#e2e8f0',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: fechaAsistencia === fechaHoyMax ? '#94a3b8' : '#334155',
                    padding: '4px 8px',
                    marginLeft: '4px',
                    borderRadius: '4px',
                    cursor: fechaAsistencia === fechaHoyMax ? 'default' : 'pointer'
                  }"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </button>
              </div>

              <!-- Botón Inhabilitar / Reactivar -->
              <button
                v-if="!jornadaInhabilitada"
                type="button"
                class="btn-inhabilitar-action"
                @click="abrirModalInhabilitar"
                :disabled="fechaAsistencia > fechaHoyMax"
                title="Inhabilitar día"
                style="background: #fff1f2; border: 1.5px solid #fecdd3; color: #e11d48; font-weight: 600; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
              <button
                v-else
                type="button"
                class="btn-reactivar-action"
                @click="reactivarJornada"
                :disabled="inhabilitando"
                title="Reactivar día"
                style="background: #f0fdf4; border: 1.5px solid #bbf7d0; color: #16a34a; font-weight: 700; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>

          <!-- HUD Card de Día Inhabilitado -->
          <div v-if="jornadaInhabilitada" class="hud-inhabilitado-card">
            <div class="hud-inhabilitado-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
            </div>
            <div class="hud-inhabilitado-content">
              <div class="hud-inhabilitado-title">
                <span>JORNADA INHABILITADA</span>
                <span class="hud-inhabilitado-fecha">{{ fechaAsistencia }}</span>
              </div>
              <div class="hud-inhabilitado-motivo">
                <strong>Motivo registrado:</strong> {{ motivoInhabilitacionDia }}
              </div>
              <div class="hud-inhabilitado-desc">
                La toma de asistencia para este día se encuentra suspendida. Los aprendices no acumulan fallas injustificadas ni penalizaciones.
              </div>
            </div>
            <button
              class="btn btn-reactivar-hud"
              @click="reactivarJornada"
              :disabled="inhabilitando"
              title="Reactivar día"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>

          <!-- Panel de verificación biométrica activa (Solo si la sesión no está inhabilitada) -->
          <div v-if="ENROLAMIENTO_EN_PANEL && verificandoHuella && !jornadaInhabilitada" class="biometric-panel">
            <div class="biometric-pulse-icon"></div>
            <div class="biometric-panel-text">
              <strong>Lector biométrico activo</strong>
              <span>Esperando que los estudiantes coloquen su dedo en el sensor...</span>
            </div>
            <div v-if="ultimaVerificacion" class="biometric-last-result" :class="{ 'result-ok': ultimaVerificacion.exito, 'result-fail': !ultimaVerificacion.exito }">
              <span v-if="ultimaVerificacion.exito">
                {{ ultimaVerificacion.nombre }} — {{ ultimaVerificacion.estado }} ({{ ultimaVerificacion.hora }})
              </span>
              <span v-else>
                {{ ultimaVerificacion.mensaje }}
              </span>
            </div>
          </div>

          <!-- Contadores rápidos -->
          <div class="conteo-row">
            <div v-if="jornadaInhabilitada" class="conteo-chip" style="background: #ffedd5; color: #9a3412; border: 1.5px solid #fdba74; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
              Sesión Inhabilitada ({{ conteoAsistencia.Inhabilitada }} aprendices protegidos sin falta)
            </div>
            <template v-else>
              <div class="conteo-chip conteo-presente"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.2 9"/></svg> Presentes: {{ conteoAsistencia.Presente }}</div>
              <div class="conteo-chip conteo-tardanza"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M8 3l-2 2M16 3l2 2"/></svg> Tardanza: {{ conteoAsistencia.Tardanza }}</div>
              <div class="conteo-chip conteo-falta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> Falta: {{ conteoAsistencia.Falta }}</div>
              <div class="conteo-chip conteo-excusada"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Excusada: {{ conteoAsistencia.Excusada }}</div>
            </template>
          </div>

          <div v-if="!jornadaInhabilitada" class="info-alert-bar" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:2px;"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M8 3l-2 2M16 3l2 2"/></svg>
            <span><strong>Cálculo Automático de Tardanza:</strong> Al marcar a un aprendiz como <strong>Presente</strong>, se captura la hora exacta. Si supera los 10 minutos de inicio de jornada ({{ fichaSeleccionada.jornada }}), se asignará automáticamente como <strong>Tardanza</strong>. Quienes queden sin marcar se registrarán como <strong>Falta</strong> al finalizar la jornada.</span>
          </div>

          <!-- Contenedor de la Tabla con estilo Disabled/Overlay si la jornada está inhabilitada -->
          <div :class="{ 'table-inhabilitada-overlay': jornadaInhabilitada }">
            <div v-if="jornadaInhabilitada" class="watermark-inhabilitada-bar" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
              SESIÓN INHABILITADA — Los controles de marcado se encuentran pausados para este día
            </div>

            <table class="data-table data-table-asistencia">
              <thead>
                <tr>
                  <th>Aprendiz</th>
                  <th>Documento</th>
                  <th>Marcar Presente</th>
                  <th>Excusa (F2F)</th>
                  <th>Hora Marcación</th>
                  <th>Estado Asignado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="est in estudiantesFicha" :key="est._id"
                    :class="{ 'row-excusada': asistenciaDia[est._id]?.excusa, 'row-disabled': jornadaInhabilitada }">
                  <td><strong>{{ est.nombres }} {{ est.apellidos }}</strong></td>
                  <td>{{ est.tipoDocumento }} {{ est.numeroDocumento }}</td>
                  <td class="td-radio">
                    <label class="checkbox-label" :style="jornadaInhabilitada ? 'cursor: not-allowed; opacity: 0.5;' : ''">
                      <input
                        type="checkbox"
                        :checked="asistenciaDia[est._id]?.estado === 'Presente' || asistenciaDia[est._id]?.estado === 'Tardanza'"
                        :disabled="asistenciaDia[est._id]?.excusa || jornadaInhabilitada"
                        @change="marcarPresente(est._id)"
                      />
                      <span class="checkbox-custom radio-presente"></span>
                    </label>
                  </td>
                  <td class="td-radio">
                    <label class="checkbox-label" :style="jornadaInhabilitada ? 'cursor: not-allowed; opacity: 0.5;' : ''">
                      <input
                        type="checkbox"
                        :checked="asistenciaDia[est._id]?.excusa"
                        :disabled="jornadaInhabilitada"
                        @change="toggleExcusa(est._id)"
                      />
                      <span class="checkbox-custom"></span>
                    </label>
                  </td>
                  <td style="font-size: 12px; font-weight: 600; color: #475569;">
                    {{ jornadaInhabilitada ? '—' : (asistenciaDia[est._id]?.horaMarcacion || '—') }}
                  </td>
                  <td>
                    <span v-if="jornadaInhabilitada" class="badge" style="background: #fed7aa; color: #9a3412; font-weight: 700; border: 1px solid #f97316; display: inline-flex; align-items: center; gap: 5px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
                      Inhabilitada
                    </span>
                    <span v-else-if="asistenciaDia[est._id]?.excusa" class="badge badge-warning">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                      Excusada
                    </span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Presente'" class="badge badge-success">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.2 9"/></svg>
                      Presente (A tiempo)
                    </span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Tardanza'" class="badge badge-warning">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M8 3l-2 2M16 3l2 2"/></svg>
                      Tardanza ({{ asistenciaDia[est._id]?.tiempoTardanza || '1 hora' }})
                    </span>
                    <span v-else class="badge badge-danger">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                      Falta (Automática)
                    </span>
                  </td>
                </tr>
                <tr v-if="estudiantesFicha.length === 0">
                  <td colspan="6" class="empty-cell">No hay aprendices registrados en esta ficha.</td>
                </tr>
              </tbody>
            </table>

            <!-- VISTA MÓVIL OPTIMIZADA: TARJETAS TÁCTILES -->
            <div class="mobile-student-cards">
              <div
                v-for="est in estudiantesFicha"
                :key="'mob_' + est._id"
                class="mobile-student-card"
                :class="{
                  'mob-card-presente': asistenciaDia[est._id]?.estado === 'Presente',
                  'mob-card-tardanza': asistenciaDia[est._id]?.estado === 'Tardanza',
                  'mob-card-excusada': asistenciaDia[est._id]?.excusa,
                  'mob-card-inhabilitada': jornadaInhabilitada,
                }"
              >
                <div class="mob-card-header">
                  <div class="mob-avatar">
                    {{ (est.nombres?.[0] || 'A') + (est.apellidos?.[0] || '') }}
                  </div>
                  <div class="mob-info">
                    <strong class="mob-name">{{ est.nombres }} {{ est.apellidos }}</strong>
                    <span class="mob-doc">{{ est.tipoDocumento }} {{ est.numeroDocumento }}</span>
                  </div>
                  <div class="mob-status-badge">
                    <span v-if="jornadaInhabilitada" class="badge-mob-inh">Inhabilitada</span>
                    <span v-else-if="asistenciaDia[est._id]?.excusa" class="badge-mob-exc">Excusada</span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Presente'" class="badge-mob-pres">Presente</span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Tardanza'" class="badge-mob-tard">Tardanza</span>
                    <span v-else class="badge-mob-falta">Falta</span>
                  </div>
                </div>

                <div class="mob-card-footer">
                  <div class="mob-time-info">
                    <span class="time-label">Hora:</span>
                    <span class="time-val">{{ jornadaInhabilitada ? '—' : (asistenciaDia[est._id]?.horaMarcacion || 'Sin registro') }}</span>
                  </div>

                  <div class="mob-actions-row">
                    <!-- Botón Marcar Asistencia Táctil -->
                    <button
                      type="button"
                      class="btn-mob-presente"
                      :class="{ 'btn-mob-active': asistenciaDia[est._id]?.estado === 'Presente' || asistenciaDia[est._id]?.estado === 'Tardanza' }"
                      :disabled="asistenciaDia[est._id]?.excusa || jornadaInhabilitada"
                      @click="marcarPresente(est._id)"
                      title="Marcar presente"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>

                    <!-- Botón Excusa Táctil -->
                    <button
                      type="button"
                      class="btn-mob-excusa"
                      :class="{ 'btn-mob-exc-active': asistenciaDia[est._id]?.excusa }"
                      :disabled="jornadaInhabilitada"
                      @click="toggleExcusa(est._id)"
                      title="Registrar excusa"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="estudiantesFicha.length === 0" class="empty-cell" style="padding: 20px; text-align: center; color: #64748b;">
                No hay aprendices registrados en esta ficha.
              </div>
            </div>
          </div>

          <div class="action-bar" v-if="estudiantesFicha.length > 0">
            <button class="btn-export" @click="exportarAsistenciaDia" title="Exportar a Excel">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="btn-export" @click="descargarSQLite" title="Descargar SQLite">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <div v-if="jornadaInhabilitada" style="display: flex; align-items: center; gap: 8px; color: #c2410c; font-weight: 700; font-size: 13px; background: #fff7ed; border: 1px solid #fdba74; padding: 8px 14px; border-radius: 8px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
              Sesión Inhabilitada — Guardada en MongoDB y SQLite
            </div>
            <button
              v-else
              class="btn btn-primary btn-guardar"
              @click="guardarAsistenciaDia"
              :disabled="guardandoAsistencia"
              title="Guardar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </button>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 2: HISTORIAL DE ASISTENCIAS         -->
        <!-- ========================================= -->
        <div v-if="vistaFicha === 'editar_asistencia'" class="section-body">
          <div class="section-header-row">
            <div>
              <h4>Historial de Asistencias</h4>
              <p class="section-desc">Registros de asistencia de esta ficha:</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn-export" @click="descargarSQLite" title="Descargar SQLite">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="btn-export" @click="exportarHistorial" v-if="asistenciasFicha.length > 0" title="Exportar historial a Excel">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>
          </div>

          <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Aprendiz</th>
                <th>Estado</th>
                <th>Tiempo Tardanza</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asis in asistenciasFicha" :key="asis._id">
                <td>{{ asis.fecha }} {{ asis.hora }}</td>
                <td>{{ asis.estudianteId?.nombres || '' }} {{ asis.estudianteId?.apellidos || '' }}</td>
                <td>
                  <span class="status-pill" :class="'status-' + (asis.estado || asis.tipo || '').toLowerCase()">
                    {{ asis.estado || asis.tipo }}
                  </span>
                </td>
                <td style="font-size: 12px; font-weight: 600; color: #64748b;">
                  {{ asis.estado === 'Tardanza' ? (asis.tiempoTardanza || '1 hora') : '0 horas' }}
                </td>
              </tr>
              <tr v-if="asistenciasFicha.length === 0">
                <td colspan="4" class="empty-cell">No hay registros de asistencias pasadas.</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 4: GESTIONAR ESTUDIANTES            -->
        <!-- ========================================= -->
        <div v-if="vistaFicha === 'gestionar_estudiantes'" class="section-body">
          <div>
            <div class="section-header-row">
              <div>
                <h4 style="display: flex; align-items: center; gap: 8px;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                  Gestionar Datos de Aprendices
                </h4>
                <p class="section-desc">Información y edición de los aprendices de la Ficha {{ fichaSeleccionada.codigoFicha }}:</p>
              </div>
              <button class="btn-export" @click="exportarListaEstudiantes" v-if="estudiantesFicha.length > 0" title="Exportar lista a Excel">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>

            <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Aprendiz</th>
                  <th>Documento</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="est in estudiantesFicha" :key="est._id">
                  <td><strong>{{ est.nombres }} {{ est.apellidos }}</strong></td>
                  <td>{{ est.tipoDocumento }} {{ est.numeroDocumento }}</td>
                  <td>{{ est.correo }}</td>
                  <td>{{ est.telefono }}</td>
                  <td>
                    <span class="status-pill" :class="'status-' + (est.estado || '').toLowerCase()">
                      {{ est.estado }}
                    </span>
                  </td>
                  <td>
                    <button v-if="fichaSeleccionada && fichaSeleccionada.esLider" class="btn-sm btn-edit" @click="abrirEditarEstudiante(est)" title="Editar estudiante">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <span v-else style="font-size: 12px; color: #94a3b8;">Solo líder</span>
                  </td>
                </tr>
                <tr v-if="estudiantesFicha.length === 0">
                  <td colspan="6" class="empty-cell">No hay aprendices registrados en esta ficha.</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 5: EQUIPO DOCENTE DE LA FICHA       -->
        <!-- ========================================= -->
        <div v-if="vistaFicha === 'docentes'" class="section-body">
          <div class="section-header-row">
            <div>
              <h4>Equipo Docente - Ficha {{ fichaSeleccionada.codigoFicha }}</h4>
              <p class="section-desc">{{ fichaSeleccionada.nombrePrograma }} | Jornada: {{ fichaSeleccionada.jornada }}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 16px;">
            <!-- DOCENTE LÍDER -->
            <div class="docente-card" style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 18px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="badge badge-success" style="font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h16l1.5-9-5 3-4.5-6-4.5 6-5-3L4 18z"/></svg>
                  Docente Líder
                </span>
                <span v-if="String(fichaSeleccionada.instructorLiderId?._id || fichaSeleccionada.instructorLiderId) === String(usuario.id)" class="badge badge-lider" style="font-size: 11px;">(Tú)</span>
              </div>
              <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #166534;">
                {{ fichaSeleccionada.instructorLiderId?.nombres || 'No asignado' }} {{ fichaSeleccionada.instructorLiderId?.apellidos || '' }}
              </h4>
              <p style="font-size: 13px; color: #374151; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
                {{ fichaSeleccionada.instructorLiderId?.correo || 'Sin correo' }}
              </p>
              <p style="font-size: 13px; color: #374151; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;" v-if="fichaSeleccionada.instructorLiderId?.telefono">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a2 2 0 0 1-2 2C10.8 21 3 13.2 3 6a2 2 0 0 1 2-2z"/></svg>
                {{ fichaSeleccionada.instructorLiderId?.telefono }}
              </p>
              <p style="font-size: 12px; color: #15803d; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 6px;" v-if="fichaSeleccionada.instructorLiderId?.especialidad">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>
                {{ fichaSeleccionada.instructorLiderId?.especialidad }}
              </p>
            </div>

            <!-- DOCENTES COMUNES -->
            <div
              v-for="doc in (fichaSeleccionada.instructores || [])"
              :key="doc._id || doc"
              class="docente-card"
              style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 18px;"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="badge badge-neutral" style="font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6z"/></svg>
                  Docente Común
                </span>
                <span v-if="String(doc._id || doc) === String(usuario.id)" class="badge badge-comun" style="font-size: 11px;">(Tú)</span>
              </div>
              <h4 style="font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #1e293b;">
                {{ doc.nombres || 'Docente' }} {{ doc.apellidos || '' }}
              </h4>
              <p style="font-size: 13px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
                {{ doc.correo || 'Sin correo' }}
              </p>
              <p style="font-size: 13px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;" v-if="doc.telefono">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a2 2 0 0 1-2 2C10.8 21 3 13.2 3 6a2 2 0 0 1 2-2z"/></svg>
                {{ doc.telefono }}
              </p>
              <p style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 6px;" v-if="doc.especialidad">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>
                {{ doc.especialidad }}
              </p>
            </div>
          </div>
          <div v-if="(!fichaSeleccionada.instructores || fichaSeleccionada.instructores.length === 0)" style="padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #64748b; margin-top: 12px; display: flex; align-items: center; gap: 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>
            Esta ficha actualmente no tiene otros docentes comunes asignados.
          </div>
        </div>

      </div>
    </div>

    <!-- ========================================= -->
    <!-- MODAL EDITAR ESTUDIANTE (LÍDER)           -->
    <!-- ========================================= -->
    <div v-if="showEditEstudianteModal" class="modal-overlay" @click.self="showEditEstudianteModal = false">
      <div class="modal modal-edit">
        <h3 style="display: flex; align-items: center; gap: 9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/></svg>
          Editar Datos del Aprendiz
        </h3>
        <div class="modal-form">
          <div class="form-row">
            <div class="form-group">
              <label>Nombres</label>
              <input v-model="editForm.nombres" type="text" class="form-input" />
            </div>
            <div class="form-group">
              <label>Apellidos</label>
              <input v-model="editForm.apellidos" type="text" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 0.4;">
              <label>Tipo Doc.</label>
              <select v-model="editForm.tipoDocumento" class="form-input">
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="PEP">PEP</option>
              </select>
            </div>
            <div class="form-group">
              <label>Número de Documento</label>
              <input v-model="editForm.numeroDocumento" type="text" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Correo Electrónico</label>
              <input v-model="editForm.correo" type="email" class="form-input" />
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input v-model="editForm.telefono" type="text" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Género</label>
              <select v-model="editForm.genero" class="form-input">
                <option value="">Sin especificar</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div class="form-group">
              <label>Estado</label>
              <select v-model="editForm.estado" class="form-input">
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="Retirado">Retirado</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="showEditEstudianteModal = false" title="Cancelar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button class="btn btn-primary" @click="guardarEstudiante" :disabled="guardandoEstudiante" title="Guardar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
        </div>
      </div>
    </div>
    <!-- ========================================= -->
    <!-- MODAL INHABILITAR JORNADA                 -->
    <!-- ========================================= -->
    <div v-if="showInhabilitarModal" class="modal-overlay" @click.self="showInhabilitarModal = false">
      <div class="modal" style="max-width: 480px; text-align: left;">
        <h3 style="display: flex; align-items: center; gap: 8px; color: #9a3412;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
          Inhabilitar Sesión del Día
        </h3>
        <p style="color: #64748b; font-size: 13px; margin-bottom: 14px;">
          Ficha: <strong>{{ fichaSeleccionada.codigoFicha }}</strong> — {{ fichaSeleccionada.nombrePrograma }}<br>
          Fecha: <strong>{{ fechaAsistencia }}</strong> | Jornada: <strong>{{ fichaSeleccionada.jornada }}</strong>
        </p>

        <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 12px; border-radius: 8px; font-size: 12.5px; color: #c2410c; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>
          <span>Al inhabilitar la jornada, la sesión se guardará como suspendida y los aprendices <strong>no recibirán fallas injustificadas</strong> en esta fecha.</span>
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; display: block;">
            Motivo de inhabilitación:
          </label>
          <select v-model="motivoInhabilitar" class="form-input" style="width: 100%; padding: 8px 12px; font-size: 13px;">
            <option value="Reunión institucional / Actividad SENA">Reunión institucional / Actividad SENA</option>
            <option value="Permiso o incapacidad del instructor">Permiso o incapacidad del instructor</option>
            <option value="Salida pedagógica o práctica externa">Salida pedagógica o práctica externa</option>
            <option value="Falla técnica o de fluido eléctrico">Falla técnica o de fluido eléctrico</option>
            <option value="Día no lectivo / Festivo regional">Día no lectivo / Festivo regional</option>
            <option value="Otro">Otro motivo personalizado...</option>
          </select>
        </div>

        <div v-if="motivoInhabilitar === 'Otro'" class="form-group" style="margin-bottom: 18px;">
          <label style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; display: block;">
            Describe el motivo:
          </label>
          <input
            v-model="motivoInhabilitarOtro"
            type="text"
            class="form-input"
            placeholder="Ej: Mantenimiento de ambientes de aprendizaje..."
            style="width: 100%; padding: 8px 12px; font-size: 13px;"
          />
        </div>

        <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button class="btn btn-outline" @click="showInhabilitarModal = false" :disabled="inhabilitando" title="Cancelar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button
            class="btn btn-danger-solid"
            @click="confirmarInhabilitarJornada"
            :disabled="inhabilitando"
            title="Inhabilitar día"
            style="background: #e11d48; color: #ffffff; border: none; font-weight: 700; padding: 9px 16px; border-radius: 8px; cursor: pointer;"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

