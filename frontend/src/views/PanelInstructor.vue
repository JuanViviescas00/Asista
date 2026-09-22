<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import api from '../services/index.js'
import * as XLSX from 'xlsx'
import { socket, unirseASalaFicha, salirDeSalaFicha } from '../services/index.js'
import { calcularMinutosTranscurridos, calcularEstadoPorTiempo } from '../utils/asistenciaTiempo.js'

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
  // Mañana: 6:00 AM (360 min) -> Tolerancia hasta 6:15 AM (375 min)
  // Tarde: 12:30 PM (750 min) -> Tolerancia hasta 12:45 PM (765 min)
  // Noche: 6:30 PM / 18:30 (1110 min) -> Tolerancia hasta 6:45 PM (1125 min)
  let inicioMin = 360 // 6:00 AM por defecto
  let limiteTolerancia = 375 // 6:15 AM

  if (jornada === 'Tarde') {
    inicioMin = 750 // 12:30 PM
    limiteTolerancia = 765 // 12:45 PM
  } else if (jornada === 'Noche') {
    inicioMin = 1110 // 6:30 PM (18:30)
    limiteTolerancia = 1125 // 6:45 PM
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
    <div class="instructor-header">
      <div>
        <h2>Bienvenido, {{ usuario.nombre }}</h2>
        <p class="subtitle">Panel de Control de Instructor SENA</p>
      </div>

      <div class="user-badge" style="display: flex; gap: 12px; align-items: center;">
        <span class="role-pill">Docente</span>
      </div>
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
                <div class="remote-device-status" :class="dispositivoOnline ? 'device-online' : 'device-offline'">
                  <span class="device-dot"></span>
                  {{ dispositivoOnline ? 'Lector del aula conectado' : 'Lector del aula desconectado' }}
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
          <div v-if="verificandoHuella && !jornadaInhabilitada" class="biometric-panel">
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
            <span><strong>Cálculo Automático de Tardanza:</strong> Al marcar a un aprendiz como <strong>Presente</strong>, se captura la hora exacta. Si supera los 15 minutos de inicio de jornada ({{ fichaSeleccionada.jornada }}), se asignará automáticamente como <strong>Tardanza</strong>. Quienes queden sin marcar se registrarán como <strong>Falta</strong> al finalizar la jornada.</span>
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

<style scoped>
.panel-instructor {
  padding: 24px;
  position: relative;
}

/* Toast */
.toast-notification {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 99999;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.18), 0 4px 10px -2px rgba(0,0,0,0.1);
  max-width: 360px;
  width: auto;
  word-break: break-word;
}
.toast-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.toast-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.toast-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: all 0.3s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateY(-12px); }

.instructor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.subtitle {
  color: var(--text-muted, #64748b);
  font-size: 14px;
}

.role-pill {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 13px;
}

.content-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 24px;
}

@media (max-width: 860px) {
  .content-layout {
    grid-template-columns: 1fr;
  }
}

.fichas-sidebar {
  background: var(--bg-card, #ffffff);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.fichas-sidebar h3 {
  font-size: 15px;
  margin-bottom: 16px;
  color: var(--text, #1e293b);
}

.ficha-card {
  background: var(--bg-muted, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ficha-card:hover {
  border-color: #3b82f6;
  transform: translateY(-1px);
}

.ficha-card.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

.ficha-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.ficha-code {
  font-weight: 700;
  font-size: 14px;
  color: #1e293b;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
}

.badge-lider { background: #dcfce7; color: #15803d; }
.badge-comun { background: #e0f2fe; color: #0369a1; }
.badge-pendiente { background: #fef3c7; color: #92400e; }

.ficha-title { font-size: 13px; color: #334155; margin-bottom: 4px; }
.ficha-sub { font-size: 11px; color: #64748b; }

.ficha-detail {
  background: var(--bg-card, #ffffff);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.ficha-banner {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.banner-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.banner-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover:not(.disabled) {
  border-color: #3b82f6;
  color: #2563eb;
}

.tab-btn.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.tab-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f1f5f9;
}

.lock-icon { margin-left: 4px; font-size: 11px; }

/* Section header */
.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.section-desc {
  color: #64748b;
  font-size: 13px;
  margin-top: 4px;
}

.input-fecha {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  margin-left: 8px;
}

.fecha-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

/* Contadores */
.conteo-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.conteo-chip {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.conteo-presente { background: #dcfce7; color: #15803d; }
.conteo-tardanza { background: #fef3c7; color: #92400e; }
.conteo-falta { background: #fee2e2; color: #991b1b; }
.conteo-excusada { background: #e0f2fe; color: #0369a1; }

/* Tables */
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

.data-table th, .data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}

.data-table th {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
}

.td-radio {
  text-align: center;
  width: 80px;
}

.row-excusada {
  background: #eff6ff;
}

/* Custom Radio */
.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.radio-label input, .checkbox-label input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.radio-custom {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  transition: all 0.15s ease;
  position: relative;
}

.radio-label input:checked ~ .radio-presente {
  border-color: #22c55e;
  background: #22c55e;
  box-shadow: inset 0 0 0 3px #fff;
}

.radio-label input:checked ~ .radio-tardanza {
  border-color: #f59e0b;
  background: #f59e0b;
  box-shadow: inset 0 0 0 3px #fff;
}

.radio-label input:checked ~ .radio-falta {
  border-color: #ef4444;
  background: #ef4444;
  box-shadow: inset 0 0 0 3px #fff;
}

.radio-label input:disabled ~ .radio-custom {
  opacity: 0.3;
  cursor: not-allowed;
}

.checkbox-custom {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid #cbd5e1;
  transition: all 0.15s ease;
  position: relative;
}

.checkbox-label input:checked ~ .checkbox-custom {
  border-color: #3b82f6;
  background: #3b82f6;
}

.checkbox-label input:checked ~ .checkbox-custom::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

/* Buttons */
.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.btn-guardar {
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
}

.btn-export {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-export:hover {
  border-color: #16a34a;
  color: #16a34a;
  background: #f0fdf4;
}

.action-buttons { display: flex; gap: 6px; }

.btn-sm {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.15s;
}
.btn-sm:hover { opacity: 0.85; }

.btn-success { background: #22c55e; color: white; }
.btn-warning { background: #f59e0b; color: white; }
.btn-danger { background: #ef4444; color: white; }
.btn-edit { background: #3b82f6; color: white; }

.btn-danger-solid {
  background: #ef4444;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

/* Status pills */
.status-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.status-presente { background: #dcfce7; color: #15803d; }
.status-tardanza { background: #fef3c7; color: #92400e; }
.status-falta { background: #fee2e2; color: #991b1b; }
.status-excusada { background: #e0f2fe; color: #0369a1; }
.status-pendiente { background: #fef3c7; color: #92400e; }
.status-aprobada { background: #dcfce7; color: #15803d; }
.status-rechazada { background: #fee2e2; color: #991b1b; }
.status-activo { background: #dcfce7; color: #15803d; }
.status-inactivo { background: #fee2e2; color: #991b1b; }
.status-retirado { background: #f1f5f9; color: #64748b; }

.restricted-box {
  padding: 24px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  color: #9f1239;
  font-size: 14px;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 24px !important;
}

/* Stats boxes */
.stats-mini-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.stat-box {
  padding: 12px 18px;
  border-radius: 8px;
}

.stat-total { background: #f8fafc; border: 1px solid #e2e8f0; }
.stat-enrolada { background: #f0fdf4; border: 1px solid #bbf7d0; }
.stat-pendiente { background: #fefce8; border: 1px solid #fef08a; }

.stat-label { font-size: 12px; color: #64748b; }
.stat-value { font-size: 20px; font-weight: 700; color: #1e293b; }
.stat-enrolada .stat-label { color: #166534; }
.stat-enrolada .stat-value { color: #15803d; }
.stat-pendiente .stat-label { color: #854d0e; }
.stat-pendiente .stat-value { color: #a16207; }

/* Sensor box */
.sensor-box {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
}

.fingerprint-icon { font-size: 48px; margin-bottom: 12px; }

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal {
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-edit {
  width: 560px;
  max-width: 95vw;
}

.modal h3 {
  margin-bottom: 16px;
  color: #1e293b;
}

.modal-form {
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

@media (max-width: 560px) {
  .form-row {
    flex-direction: column;
  }
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.form-input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.15s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

/* ===== Biometric Attendance Panel ===== */
.btn-biometric {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-biometric:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669, #047857);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.btn-biometric:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-biometric-stop {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  animation: pulse 2s infinite;
}

.btn-biometric-stop:hover {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}

.biometric-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border: 2px solid #6ee7b7;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.biometric-pulse-icon {
  font-size: 32px;
  animation: pulse 1.5s infinite;
}

.biometric-panel-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.biometric-panel-text strong {
  color: #065f46;
  font-size: 14px;
}

.biometric-panel-text span {
  color: #047857;
  font-size: 12px;
}

.biometric-last-result {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  width: 100%;
  text-align: center;
  margin-top: 4px;
}

.biometric-last-result.result-ok {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
}

.biometric-last-result.result-fail {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

/* ===== HUD JORNADA INHABILITADA ===== */
.hud-inhabilitado-card {
  display: flex;
  align-items: center;
  gap: 18px;
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
  border: 2px solid #ea580c;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 18px;
  box-shadow: 0 4px 16px rgba(234, 88, 12, 0.15);
  animation: fadeIn 0.3s ease;
  flex-wrap: wrap;
}

.hud-inhabilitado-icon {
  font-size: 38px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: #ffedd5;
  border-radius: 50%;
  border: 2px solid #fdba74;
}

.hud-inhabilitado-content {
  flex: 1;
  min-width: 250px;
}

.hud-inhabilitado-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 800;
  color: #9a3412;
  letter-spacing: 0.5px;
}

.hud-inhabilitado-fecha {
  background: #ea580c;
  color: #ffffff;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.hud-inhabilitado-motivo {
  margin-top: 5px;
  font-size: 13px;
  color: #7c2d12;
  font-weight: 600;
}

.hud-inhabilitado-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #9a3412;
  opacity: 0.95;
}

.btn-reactivar-hud {
  background: #16a34a;
  color: white;
  border: none;
  font-weight: 700;
  font-size: 13px;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);
  transition: all 0.2s ease;
}

.btn-reactivar-hud:hover:not(:disabled) {
  background: #15803d;
  transform: translateY(-1px);
}

.table-inhabilitada-overlay {
  position: relative;
  opacity: 0.75;
  filter: grayscale(30%);
  user-select: none;
}

.watermark-inhabilitada-bar {
  background: #fed7aa;
  border: 1.5px dashed #ea580c;
  color: #9a3412;
  text-align: center;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 8px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.nav-day-inhabilitada {
  border-color: #ea580c !important;
  background: #fff7ed !important;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* CENTRO DE CONTROL REMOTO */
.remote-control-panel {
  --rc-bg-1: #0a130f;
  --rc-bg-2: #15241c;
  --rc-line: #26392e;
  --rc-accent: #46d67c;
  --rc-accent-dim: rgba(70, 214, 124, 0.16);
  --rc-danger: #ff6f6f;
  --rc-danger-dim: rgba(255, 111, 111, 0.16);
  --rc-warn: #f2c94c;
  --rc-muted: #85a294;
  background: linear-gradient(150deg, var(--rc-bg-1) 0%, var(--rc-bg-2) 100%);
  border: 1px solid var(--rc-line);
  border-radius: 16px;
  padding: 24px 26px;
  margin-bottom: 20px;
  color: #eaf3ed;
  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.45);
}

.remote-control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 22px;
}

.remote-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 13px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  margin-bottom: 10px;
  margin-right: 14px;
}

.badge-live {
  background: var(--rc-accent-dim);
  border: 1px solid rgba(70, 214, 124, 0.4);
  color: var(--rc-accent);
}

.badge-idle {
  background: rgba(133, 162, 148, 0.12);
  border: 1px solid var(--rc-line);
  color: var(--rc-muted);
}

.remote-device-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 10px;
}

.device-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.device-online {
  color: var(--rc-accent);
}

.device-offline {
  color: var(--rc-danger);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rc-muted);
}

.live-dot-pulsing {
  background: var(--rc-accent);
  box-shadow: 0 0 10px var(--rc-accent);
  animation: pulseLive 1.6s ease-in-out infinite;
}

@keyframes pulseLive {
  0%, 100% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
}

.remote-desc {
  font-size: 13px;
  color: var(--rc-muted);
  margin: 4px 0 0;
  max-width: 580px;
  line-height: 1.55;
}

.remote-control-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-remote-start,
.btn-remote-stop {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  font-weight: 700;
  font-size: 13px;
  padding: 11px 20px;
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
}

.btn-remote-start {
  background: var(--rc-accent);
  color: #052e16;
  box-shadow: 0 6px 18px -6px rgba(70, 214, 124, 0.55);
}

.btn-remote-start:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.btn-remote-start:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.btn-remote-stop {
  background: transparent;
  color: var(--rc-danger);
  border: 1px solid var(--rc-danger);
}

.btn-remote-stop:hover {
  background: var(--rc-danger-dim);
}

.remote-live-feed {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--rc-line);
}

.live-feed-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--rc-muted);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.live-feed-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.live-feed-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  animation: chipIn 0.2s ease-out;
}

@keyframes chipIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

.feed-presente {
  background: var(--rc-accent-dim);
  border: 1px solid rgba(70, 214, 124, 0.35);
  color: var(--rc-accent);
}

.feed-tardanza {
  background: rgba(242, 201, 76, 0.14);
  border: 1px solid rgba(242, 201, 76, 0.35);
  color: var(--rc-warn);
}

.feed-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.feed-time {
  font-size: 11px;
  opacity: 0.75;
}

/* RESPONSIVE MOBILE REFINEMENTS */
.mobile-student-cards {
  display: none;
}

@media (max-width: 768px) {
  .panel-instructor {
    padding: 10px 8px;
  }

  .instructor-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
  }

  .content-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Selector de fichas tipo carrusel horizontal táctil */
  .fichas-sidebar {
    width: 100%;
    overflow-x: auto;
    display: flex;
    flex-direction: row;
    gap: 8px;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
  }

  .fichas-sidebar h3 {
    display: none;
  }

  .ficha-card {
    min-width: 200px;
    max-width: 240px;
    flex-shrink: 0;
    margin-bottom: 0;
    padding: 10px 12px;
    border-radius: 10px;
  }

  /* Barra de pestañas horizontales con scroll táctil */
  .banner-actions {
    overflow-x: auto;
    display: flex;
    gap: 6px;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
    width: 100%;
  }

  .tab-btn {
    white-space: nowrap;
    padding: 7px 12px;
    font-size: 12px;
    border-radius: 6px;
  }

  /* Panel remoto en móvil */
  .remote-control-panel {
    padding: 14px;
    border-radius: 12px;
  }

  .remote-control-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .remote-control-actions {
    flex-direction: column;
    width: 100%;
    gap: 8px;
  }

  .btn-remote-start,
  .btn-remote-stop {
    width: 100%;
    justify-content: center;
    padding: 12px 16px;
    font-size: 14px;
  }

  /* Ocultar SOLO la tabla rígida de 6 columnas de asistencia en móvil;
     el resto de tablas (historial, aprendices) se desplazan en horizontal. */
  .data-table-asistencia {
    display: none;
  }

  .data-table:not(.data-table-asistencia) {
    min-width: 560px;
  }

  .ficha-detail {
    padding: 14px;
  }

  .action-bar {
    flex-wrap: wrap;
    justify-content: stretch;
  }

  .modal {
    padding: 18px 16px;
  }

  .mobile-student-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-student-card {
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    transition: all 0.2s;
  }

  .mob-card-presente {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .mob-card-tardanza {
    border-color: #fde047;
    background: #fefce8;
  }

  .mob-card-excusada {
    border-color: #93c5fd;
    background: #eff6ff;
  }

  .mob-card-inhabilitada {
    opacity: 0.7;
    background: #fff7ed;
    border-color: #fdba74;
  }

  .mob-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .mob-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #e2e8f0;
    color: #1e293b;
    font-weight: 800;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .mob-card-presente .mob-avatar {
    background: #22c55e;
    color: white;
  }

  .mob-card-tardanza .mob-avatar {
    background: #eab308;
    color: white;
  }

  .mob-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .mob-name {
    font-size: 14px;
    color: #0f172a;
    font-weight: 700;
  }

  .mob-doc {
    font-size: 12px;
    color: #64748b;
  }

  .mob-status-badge span {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 12px;
  }

  .badge-mob-pres { background: #dcfce7; color: #166534; }
  .badge-mob-tard { background: #fef9c3; color: #854d0e; }
  .badge-mob-falta { background: #fee2e2; color: #991b1b; }
  .badge-mob-exc { background: #dbeafe; color: #1e40af; }
  .badge-mob-inh { background: #ffedd5; color: #9a3412; }

  .mob-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid #f1f5f9;
  }

  .mob-time-info {
    font-size: 12px;
    color: #64748b;
  }

  .time-val {
    font-weight: 700;
    color: #334155;
    margin-left: 3px;
  }

  .mob-actions-row {
    display: flex;
    gap: 6px;
  }

  .btn-mob-presente {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
    font-weight: 700;
    font-size: 12px;
    padding: 7px 12px;
    border-radius: 8px;
    cursor: pointer;
  }

  .btn-mob-presente.btn-mob-active {
    background: #16a34a;
    color: white;
    border-color: #15803d;
  }

  .btn-mob-excusa {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .btn-mob-excusa.btn-mob-exc-active {
    background: #2563eb;
    color: white;
    border-color: #1d4ed8;
  }

  /* Conteo chips en móvil */
  .conteo-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .conteo-chip {
    padding: 6px;
    font-size: 11px;
    text-align: center;
  }

  .section-header-actions {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    gap: 8px;
  }

  .day-nav-bar {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
