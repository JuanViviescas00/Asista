<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import api from '../services/index.js'
import * as XLSX from 'xlsx'
import { socket, unirseASalaFicha, salirDeSalaFicha } from '../services/index.js'
import { calcularMinutosTranscurridos, calcularEstadoPorTiempo } from '../utils/asistenciaTiempo.js'
import { useAsistenciaDraftStore } from '../stores/asistenciaDraft.js'
import '../styles/panelInstructor.css'
import ModalExcusa from '../components/instructor/ModalExcusa.vue'
import ModalInhabilitarJornada from '../components/instructor/ModalInhabilitarJornada.vue'
import ModalAgregarDocente from '../components/instructor/ModalAgregarDocente.vue'
import ModalDesvincularDocente from '../components/instructor/ModalDesvincularDocente.vue'
import EquipoEjecutorTab from '../components/instructor/EquipoEjecutorTab.vue'
import HistorialAnomaliasTab from '../components/instructor/HistorialAnomaliasTab.vue'
import NavegadorDias from '../components/instructor/NavegadorDias.vue'
import HudJornadaInhabilitada from '../components/instructor/HudJornadaInhabilitada.vue'

const INTERVALO_COLA_OFFLINE_MS = 5000

const draftStore = useAsistenciaDraftStore()


const usuarioStr = sessionStorage.getItem('user_data')
const usuario = ref(usuarioStr ? JSON.parse(usuarioStr) : { id: '', nombre: 'Instructor', rol: 'Instructor' })

const misFichas = ref([])
const fichaSeleccionada = ref(null)
const estudiantesFicha = ref([])
const excusasFicha = ref([])
const asistenciasFicha = ref([])

// Historial del día: solo anomalías (fallas, tardanzas y excusas) registradas HOY
const historialAnomalias = computed(() => {
  const anomalos = ['Falta', 'Tardanza', 'Excusada', 'Ausente', 'Retardo']
  const hoy = getHoyLocalISO()
  return asistenciasFicha.value.filter(a => {
    const estado = a.estado || a.tipo
    return anomalos.includes(estado) && String(a.fecha || '').slice(0, 10) === hoy
  })
})

// Gestión de Equipo Docente (asignar docentes comunes si es líder o admin)
const esLiderEnFichaSeleccionada = computed(() => {
  if (!fichaSeleccionada.value) return false
  if (usuario.value?.rol === 'Administrador') return true
  if (fichaSeleccionada.value.esLider === true) return true
  const liderId = String(fichaSeleccionada.value.instructorLiderId?._id || fichaSeleccionada.value.instructorLiderId || '')
  const miId = String(usuario.value?.id || usuario.value?._id || '')
  return Boolean(liderId && miId && liderId === miId)
})

const todosLosInstructores = ref([])
const modalAgregarDocenteAbierto = ref(false)
const docenteSeleccionadoId = ref('')
const guardandoDocente = ref(false)

async function cargarTodosLosInstructores() {
  try {
    const res = await api.instructores.getAll()
    todosLosInstructores.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (err) {
    console.error('Error al cargar instructores:', err)
  }
}

const docentesDisponiblesParaFicha = computed(() => {
  if (!fichaSeleccionada.value) return []
  const liderId = String(fichaSeleccionada.value.instructorLiderId?._id || fichaSeleccionada.value.instructorLiderId || '')
  const asignadosIds = (fichaSeleccionada.value.instructores || []).map(i => String(i._id || i.id || i))
  return (todosLosInstructores.value || []).filter(doc => {
    const id = String(doc._id || doc.id)
    return id && id !== liderId && !asignadosIds.includes(id)
  })
})

const modoAsignar = ref('existente') // 'existente' | 'nuevo'
const nuevoDocenteForm = reactive({
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  correo: '',
  telefono: '',
  especialidad: ''
})

const modalDesvincularAbierto = ref(false)
const docenteADesvincular = ref(null)
const desvinculandoDocente = ref(false)

function abrirModalAgregarDocente() {
  modoAsignar.value = 'existente'
  docenteSeleccionadoId.value = ''
  Object.assign(nuevoDocenteForm, {
    nombres: '',
    apellidos: '',
    tipoDocumento: 'CC',
    numeroDocumento: '',
    correo: '',
    telefono: '',
    especialidad: ''
  })
  cargarTodosLosInstructores()
  modalAgregarDocenteAbierto.value = true
}

async function confirmarAgregarDocente(datosModal) {
  if (!fichaSeleccionada.value?._id) return
  guardandoDocente.value = true
  try {
    let payload
    let nombreDoc = ''
    const modo = datosModal?.modo || modoAsignar.value
    if (modo === 'existente') {
      const docenteId = datosModal?.docenteId || docenteSeleccionadoId.value
      if (!docenteId) {
        showToast('Debes seleccionar un instructor de la lista', 'warning')
        guardandoDocente.value = false
        return
      }
      payload = { instructorId: docenteId }
      const found = todosLosInstructores.value.find(i => String(i._id || i.id) === String(docenteId))
      nombreDoc = found ? `${found.nombres} ${found.apellidos || ''}`.trim() : 'Instructor'
    } else {
      const form = datosModal?.nuevoDocente || nuevoDocenteForm
      const { nombres, apellidos, numeroDocumento, correo } = form
      if (!nombres?.trim() || !apellidos?.trim() || !numeroDocumento?.trim() || !correo?.trim()) {
        showToast('Nombres, apellidos, documento y correo son obligatorios', 'warning')
        guardandoDocente.value = false
        return
      }
      payload = { nuevoDocente: { ...form } }
      nombreDoc = `${nombres.trim()} ${apellidos.trim()}`
    }

    const fichaActualizada = await api.fichas.agregarInstructor(fichaSeleccionada.value._id, payload)
    fichaSeleccionada.value.instructores = fichaActualizada.instructores || []
    const idx = misFichas.value.findIndex(f => String(f._id) === String(fichaSeleccionada.value._id))
    if (idx !== -1) {
      misFichas.value[idx].instructores = fichaActualizada.instructores || []
    }
    await cargarTodosLosInstructores()
    showToast(`Instructor ${nombreDoc} asignado al equipo ejecutor exitosamente.`, 'success')
    modalAgregarDocenteAbierto.value = false
    docenteSeleccionadoId.value = ''
  } catch (err) {
    showToast(err.message || 'Error al agregar instructor', 'error')
  } finally {
    guardandoDocente.value = false
  }
}

function abrirModalDesvincularDocente(doc) {
  docenteADesvincular.value = doc
  modalDesvincularAbierto.value = true
}

function cerrarModalDesvincularDocente() {
  if (desvinculandoDocente.value) return
  modalDesvincularAbierto.value = false
  docenteADesvincular.value = null
}

async function confirmarDesvincularDocente() {
  if (!docenteADesvincular.value || !fichaSeleccionada.value?._id) return
  desvinculandoDocente.value = true
  try {
    const docId = String(docenteADesvincular.value._id || docenteADesvincular.value.id || docenteADesvincular.value)
    const nombre = docenteADesvincular.value.nombres ? `${docenteADesvincular.value.nombres} ${docenteADesvincular.value.apellidos || ''}`.trim() : 'este instructor'
    const fichaActualizada = await api.fichas.eliminarInstructor(fichaSeleccionada.value._id, docId)
    fichaSeleccionada.value.instructores = fichaActualizada.instructores || []
    const idx = misFichas.value.findIndex(f => String(f._id) === String(fichaSeleccionada.value._id))
    if (idx !== -1) {
      misFichas.value[idx].instructores = fichaActualizada.instructores || []
    }
    await cargarTodosLosInstructores()
    showToast(`Instructor ${nombre} desvinculado de la ficha.`, 'info')
    cerrarModalDesvincularDocente()
  } catch (err) {
    showToast(err.message || 'Error al desvincular instructor', 'error')
  } finally {
    desvinculandoDocente.value = false
  }
}
const loading = ref(true)
const error = ref('')
const vistaFicha = ref('asistencia')

// Selector superior de fichas
function onSelectFicha(id) {
  const ficha = misFichas.value.find(f => String(f._id) === String(id))
  if (ficha && String(fichaSeleccionada.value?._id) !== String(ficha._id)) {
    seleccionarFicha(ficha)
  }
}

// Título de la página según la acción activa
const tituloVista = computed(() => {
  const f = fichaSeleccionada.value
  const detalle = f ? `Ficha ${f.codigoFicha} · ${f.nombrePrograma}` : ''
  if (!f) {
    return { icono: 'fichas', titulo: 'Mis Fichas / Grupos', subtitulo: 'Selecciona una ficha para gestionar su asistencia.' }
  }
  if (vistaFicha.value === 'editar_asistencia') {
    return { icono: 'historial', titulo: 'Historial de Asistencias', subtitulo: detalle }
  }
  if (vistaFicha.value === 'docentes') {
    return { icono: 'docentes', titulo: 'Equipo Ejecutor', subtitulo: detalle }
  }
  return { icono: 'asistencia', titulo: 'Tomar Asistencia', subtitulo: detalle }
})

// Control Remoto en Vivo
const sesionRemotaActiva = ref(false)
const dispositivoOnline = ref(false)
const finalizando = ref(false)
const claseIniciadaAt = ref(null)

// Toast notifications
const toast = reactive({ show: false, message: '', type: 'success' })
function showToast(message, type = 'success') {
  toast.show = true
  toast.message = message
  toast.type = type
  setTimeout(() => { toast.show = false }, 3000)
}

const sincronizandoCola = ref(false)

// Sincroniza la cola offline con guardia de reentrada (el timer y el evento
// 'online' pueden dispararla a la vez). Devuelve el resultado o null si ya
// hay una sincronización en curso.
async function procesarColaOffline() {
  if (sincronizandoCola.value) return null
  sincronizandoCola.value = true
  try {
    return await draftStore.sincronizarColaOffline(api)
  } finally {
    sincronizandoCola.value = false
  }
}

async function onConexionRecuperada() {
  const res = await procesarColaOffline()
  if (res && res.totalSincronizados > 0) {
    showToast(`Conexión recuperada: ${res.totalSincronizados} asistencias sincronizadas automáticamente.`, 'success')
    if (fichaSeleccionada.value?._id) {
      await cargarDatosFicha(fichaSeleccionada.value._id)
    }
  }
}

let timerColaOffline = null
function iniciarTimerColaOffline() {
  if (timerColaOffline) return
  timerColaOffline = setInterval(() => {
    if (navigator.onLine && draftStore.pendientesOfflineCount > 0) {
      procesarColaOffline()
    }
  }, INTERVALO_COLA_OFFLINE_MS)
}

onMounted(async () => {
  window.addEventListener('online', onConexionRecuperada)
  await Promise.all([cargarMisFichas(), cargarDiasFestivos(), cargarTodosLosInstructores()])
  await restaurarEstadoClase()
  iniciarSocketDocente()
  iniciarTimerColaOffline()
  if (draftStore.pendientesOfflineCount > 0) {
    onConexionRecuperada()
  }
})

onUnmounted(() => {
  window.removeEventListener('online', onConexionRecuperada)
  cancelarTodosDebounceHoras()
  if (timerColaOffline) {
    clearInterval(timerColaOffline)
    timerColaOffline = null
  }
  if (fichaSeleccionada.value?._id) {
    salirDeSalaFicha(fichaSeleccionada.value._id)
  }
})

function iniciarSocketDocente() {
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
      if (!finalizando.value) {
        cargarDatosFicha(fichaSeleccionada.value._id)
      }
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

const alternandoSesion = ref(false)

// Switch de pase de lista: si está apagado lo enciende (activa la clase) y viceversa.
async function alternarSesionRemota() {
  if (alternandoSesion.value || finalizando.value) return
  alternandoSesion.value = true
  try {
    if (sesionRemotaActiva.value) await detenerSesionRemotaDocente()
    else await iniciarSesionRemotaDocente()
  } finally {
    alternandoSesion.value = false
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
    showToast('Clase activada: el lector del ambiente está listo para tomar asistencia.', 'success')
  } catch (e) {
    showToast(e.message || 'No se pudo activar la clase', 'error')
  }
}

async function detenerSesionRemotaDocente() {
  if (!fichaSeleccionada.value || finalizando.value) return
  finalizando.value = true
  try {
    await api.clases.finalizar({
      fichaId: fichaSeleccionada.value._id,
      instructorId: usuario.value.id,
    })
    sesionRemotaActiva.value = false
    claseIniciadaAt.value = null
    showToast('Clase finalizada.', 'info')
    await cargarDatosFicha(fichaSeleccionada.value._id)
  } catch (e) {
    showToast(e.message || 'No se pudo finalizar la clase', 'error')
  } finally {
    finalizando.value = false
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
    const bioRes = await api.fichas.getPlantillasBiometricas(fichaId).catch(() => [])
    const excRes = await api.excusas.getAll({ fichaId }).catch(e => { console.error('Error excusas:', e); return [] })

    estudiantesFicha.value = Array.isArray(estRes) ? estRes : []
    const sFichaId = String(fichaId)
    asistenciasFicha.value = (Array.isArray(asisRes) ? asisRes : []).filter(a => {
      const aFicha = String(a.fichaId?._id || a.fichaId)
      return aFicha === sFichaId
    })
    memoriaBiometricaRAM.value = Array.isArray(bioRes) ? bioRes : []
    excusasFicha.value = Array.isArray(excRes) ? excRes : []
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

const docenteResponsableDia = computed(() => {
  const hoy = fechaAsistencia.value
  const currentFichaId = fichaSeleccionada.value ? String(fichaSeleccionada.value._id) : null
  const reg = asistenciasFicha.value.find(
    a => a.fecha === hoy &&
         (!currentFichaId || String(a.fichaId?._id || a.fichaId) === currentFichaId) &&
         a.instructorId
  )
  if (!reg || !reg.instructorId) return null

  if (typeof reg.instructorId === 'object' && reg.instructorId.nombres) {
    return {
      id: String(reg.instructorId._id || reg.instructorId),
      nombreCompleto: `${reg.instructorId.nombres} ${reg.instructorId.apellidos || ''}`.trim(),
      correo: reg.instructorId.correo || '',
      especialidad: reg.instructorId.especialidad || ''
    }
  }

  const instIdStr = String(reg.instructorId._id || reg.instructorId)
  if (usuario.value && String(usuario.value.id) === instIdStr) {
    return {
      id: instIdStr,
      nombreCompleto: (usuario.value.nombre || 'Instructor'),
      correo: usuario.value.correo || '',
      especialidad: usuario.value.especialidad || ''
    }
  }

  const lider = fichaSeleccionada.value?.instructorLiderId
  if (lider && String(lider._id || lider) === instIdStr) {
    return {
      id: instIdStr,
      nombreCompleto: `${lider.nombres || ''} ${lider.apellidos || ''}`.trim() || 'Instructor Líder',
      correo: lider.correo || '',
      especialidad: lider.especialidad || ''
    }
  }

  const deFicha = (fichaSeleccionada.value?.instructores || []).find(i => String(i._id || i) === instIdStr)
  if (deFicha && typeof deFicha === 'object' && deFicha.nombres) {
    return {
      id: instIdStr,
      nombreCompleto: `${deFicha.nombres} ${deFicha.apellidos || ''}`.trim(),
      correo: deFicha.correo || '',
      especialidad: deFicha.especialidad || ''
    }
  }

  return {
    id: instIdStr,
    nombreCompleto: 'Instructor a cargo',
    correo: '',
    especialidad: ''
  }
})

const jornadaEsDeOtroDocente = computed(() => {
  if (usuario.value?.rol === 'Administrador') return false
  if (!docenteResponsableDia.value) return false
  const currentUserId = usuario.value?.id ? String(usuario.value.id) : null
  return currentUserId ? String(docenteResponsableDia.value.id) !== currentUserId : false
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

function avisarJornadaAjena() {
  const nombre = docenteResponsableDia.value?.nombreCompleto || 'otro instructor'
  showToast(`Esta jornada fue registrada por ${nombre}. Solo ese instructor puede modificarla.`, 'warning')
}

function abrirModalInhabilitar() {
  if (jornadaEsDeOtroDocente.value) { avisarJornadaAjena(); return }
  if (fechaAsistencia.value > fechaHoyMax.value) {
    showToast('No es posible inhabilitar fechas futuras.', 'warning')
    return
  }
  motivoInhabilitar.value = 'Reunión institucional / Actividad SENA'
  motivoInhabilitarOtro.value = ''
  showInhabilitarModal.value = true
}

async function confirmarInhabilitarJornada(motivoDesdeModal) {
  if (jornadaEsDeOtroDocente.value) { showInhabilitarModal.value = false; avisarJornadaAjena(); return }
  inhabilitando.value = true
  const motivoFinal = motivoDesdeModal || (motivoInhabilitar.value === 'Otro' ? (motivoInhabilitarOtro.value.trim() || 'Jornada no impartida') : motivoInhabilitar.value)
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
  if (jornadaEsDeOtroDocente.value) { avisarJornadaAjena(); return }
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

// Horas de clase por día según la jornada de la ficha (mismo criterio del módulo Reportes:
// Noche = 5 horas, Mañana / Tarde = 6 horas).
const horasClaseFicha = computed(() => {
  const j = (fichaSeleccionada.value?.jornada || '').toLowerCase()
  return (j.includes('noche') || j.includes('nocturna')) ? 5 : 6
})

// Horas fallidas sugeridas según el estado (el instructor puede ajustarlas a mano):
//  - Falta (con o sin excusa): todas las horas de la jornada
//  - Tardanza: las horas de retraso (1 o 2, sin pasar del máximo)
//  - Presente: 0
function horasAuto(reg) {
  const max = horasClaseFicha.value
  if (!reg) return 0
  if (reg.excusa) {
    const h = Number(reg.horasTardanza) || 0
    return (h > 0 && h < max) ? h : max
  }
  if (reg.estado === 'Falta') return max
  if (reg.estado === 'Tardanza') return Math.min(Number(reg.horasTardanza) || 1, max)
  return 0
}

// Solo números enteros: se bloquean ".", ",", "e", "+" y "-"
function bloquearNoEnteros(ev) {
  if (['.', ',', 'e', 'E', '+', '-'].includes(ev.key)) ev.preventDefault()
}

function actualizarEstadoPorHoras(reg, n) {
  if (!reg) return
  const max = horasClaseFicha.value
  const limitado = Math.min(Math.max(n, 0), max)
  reg.horasFallidas = limitado

  if (reg.excusa) {
    if (limitado === 0) {
      reg.excusa = false
      reg.motivoExcusa = ''
      reg.descripcion = ''
      reg.estado = 'Presente'
      reg.horasTardanza = 0
      reg.tiempoTardanza = '0 horas'
      if (!reg.horaMarcacion || reg.horaMarcacion === '—') {
        reg.horaMarcacion = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
      return
    }
    reg.estado = 'Excusada'
    if (limitado > 0 && limitado < max) {
      reg.horasTardanza = limitado
      reg.tiempoTardanza = `${limitado} ${limitado === 1 ? 'hora' : 'horas'}`
    } else {
      reg.horasTardanza = 0
      reg.tiempoTardanza = '0 horas'
    }
    return
  }

  if (limitado === 0) {
    reg.estado = 'Presente'
    reg.horasTardanza = 0
    reg.tiempoTardanza = '0 horas'
    if (!reg.horaMarcacion || reg.horaMarcacion === '—') {
      reg.horaMarcacion = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  } else if (limitado < max) {
    reg.estado = 'Tardanza'
    reg.horasTardanza = limitado
    reg.tiempoTardanza = `${limitado} ${limitado === 1 ? 'hora' : 'horas'}`
    if (!reg.horaMarcacion || reg.horaMarcacion === '—') {
      reg.horaMarcacion = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  } else {
    reg.estado = 'Falta'
    reg.horasTardanza = 0
    reg.tiempoTardanza = '0 horas'
    reg.horaMarcacion = '—'
  }
}

// Debounce de envío por aprendiz (~800 ms tras la última tecla).
const debounceHoras = new Map()

function programarDebounceHoras(estId) {
  const prev = debounceHoras.get(estId)
  if (prev) clearTimeout(prev)
  const t = setTimeout(() => {
    debounceHoras.delete(estId)
    sincronizarCambioNube(estId)
  }, 800)
  debounceHoras.set(estId, t)
}

function cancelarDebounceHoras(estId) {
  const t = debounceHoras.get(estId)
  if (t) {
    clearTimeout(t)
    debounceHoras.delete(estId)
  }
}

function cancelarTodosDebounceHoras() {
  for (const t of debounceHoras.values()) clearTimeout(t)
  debounceHoras.clear()
}

// Mientras escribe: se actualiza el estado (Tardanza/Falta/Presente) y los chips en vivo
function onHorasInput(estId, ev) {
  const reg = asistenciaDia.value[estId]
  if (!reg || !reg.esMio || jornadaInhabilitada.value) return
  const n = parseInt(ev.target.value, 10)
  if (Number.isNaN(n)) return // campo vacío mientras escribe
  actualizarEstadoPorHoras(reg, n)
  programarDebounceHoras(estId)
}

// Al salir del campo: se asegura el rango válido y sincroniza en la nube
async function onHorasChange(estId, ev) {
  cancelarDebounceHoras(estId)
  const reg = asistenciaDia.value[estId]
  if (!reg) return
  if (!reg.esMio) {
    showToast(`Solo de lectura: Registrado por Prof. ${reg.nombreDocenteCreador || 'otro instructor'}.`, 'warning')
    ev.target.value = reg.horasFallidas || 0
    return
  }
  // Campo vacío al salir = 0 horas (antes se restauraba el valor anterior y no se guardaba)
  const raw = String(ev.target.value ?? '').trim()
  const n = raw === '' ? 0 : parseInt(raw, 10)
  const valorFinal = Number.isNaN(n) ? (reg.horasFallidas || 0) : n
  actualizarEstadoPorHoras(reg, valorFinal)
  ev.target.value = reg.horasFallidas
  await sincronizarCambioNube(estId)
}

function inicializarAsistenciaDia() {
  limpiarEstadosFila()
  cancelarTodosDebounceHoras()
  const hoy = fechaAsistencia.value
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  const currentFichaId = fichaSeleccionada.value ? String(fichaSeleccionada.value._id) : null
  const currentUserId = usuario.value?.id ? String(usuario.value.id) : null
  const esAdmin = usuario.value?.rol === 'Administrador'
  const registros = {}

  for (const est of estudiantesFicha.value) {
    const existente = asistenciasFicha.value.find(
      a => (String(a.estudianteId?._id || a.estudianteId) === String(est._id)) &&
           a.fecha === hoy &&
           (!currentFichaId || String(a.fichaId?._id || a.fichaId) === currentFichaId)
    )
    const estado = existente ? existente.estado : 'Presente'
    const hora = existente ? (existente.hora || '') : (new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    const tardanzaInfo = estado === 'Tardanza'
      ? (existente.tiempoTardanza ? { horas: existente.horasTardanza || 1, texto: existente.tiempoTardanza } : calcularHorasTardanza(hora, jornadaFicha))
      : (estado === 'Excusada'
        ? { horas: Number(existente.horasTardanza) || 0, texto: existente.tiempoTardanza || '0 horas' }
        : { horas: 0, texto: '0 horas' })

    // Verificación de propiedad docente (Solo lectura para otros docentes)
    const instructorAsignado = existente?.instructorId
    const instructorAsignadoId = instructorAsignado ? String(instructorAsignado._id || instructorAsignado) : null
    // Si otro instructor ya es el responsable del día, ninguna fila es editable (ni siquiera las aún sin registro)
    const jornadaAjena = !esAdmin && jornadaEsDeOtroDocente.value
    const esMio = !jornadaAjena && (!existente || !instructorAsignadoId || esAdmin || (currentUserId && instructorAsignadoId === currentUserId))

    let nombreDocenteCreador = ''
    if (!esMio && instructorAsignado) {
      if (typeof instructorAsignado === 'object' && instructorAsignado.nombres) {
        nombreDocenteCreador = `${instructorAsignado.nombres} ${instructorAsignado.apellidos || ''}`.trim()
      } else {
        nombreDocenteCreador = docenteResponsableDia.value?.nombreCompleto || 'otro instructor'
      }
    } else if (!esMio && jornadaAjena) {
      nombreDocenteCreador = docenteResponsableDia.value?.nombreCompleto || 'otro instructor'
    }

    registros[est._id] = {
      estado,
      excusa: existente ? existente.estado === 'Excusada' : false,
      motivoExcusa: existente && existente.estado === 'Excusada'
        ? (buscarExcusaAprobada(est._id, hoy, currentFichaId)?.motivo || '')
        : '',
      horaMarcacion: hora,
      horasTardanza: tardanzaInfo.horas,
      tiempoTardanza: tardanzaInfo.texto,
      subidoSofia: existente ? !!existente.subidoSofia : false,
      previo: null,
      esMio,
      nombreDocenteCreador,
      descripcion: existente?.descripcion || '',
    }
    registros[est._id].horasFallidas = horasAuto(registros[est._id])
  }

  // Superponer los items pendientes de la cola offline de esta ficha y fecha,
  // para que una recarga sin conexión siga mostrando las marcas pendientes.
  const sFichaId = String(fichaSeleccionada.value?._id || '')
  const itemsCola = draftStore.colaOffline
    .flatMap((lote) => (Array.isArray(lote.items) ? lote.items : []))
    .filter((it) => String(it.fichaId) === sFichaId && it.fecha === hoy)

  for (const item of itemsCola) {
    const estId = String(item.estudianteId)
    const reg = registros[estId]
    if (!reg) continue
    // subidoSofia y esMio salen SIEMPRE del servidor. Si el servidor ya marcó
    // la fila como subida a Sofía Plus, se ignora el item y se quita de la cola.
    if (reg.subidoSofia) {
      draftStore.quitarDeColaOffline(item.estudianteId, item.fichaId, item.fecha)
      continue
    }
    reg.estado = item.estado
    reg.excusa = item.estado === 'Excusada'
    reg.horaMarcacion = item.hora || '—'
    reg.horasTardanza = item.horasTardanza || 0
    reg.tiempoTardanza = item.tiempoTardanza || '0 horas'
    reg.descripcion = item.descripcion ?? reg.descripcion
    reg.horasFallidas = horasAuto(reg)
  }

  asistenciaDia.value = registros
}

// Estado visual por fila: 'guardando' | 'guardado' | 'error'
const estadoFilaSync = ref({})
const timersGuardado = new Map()
// Serialización por aprendiz: a lo sumo una petición en vuelo + un estado pendiente.
const syncEnVuelo = new Map()

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setEstadoFila(estId, estado, detalle = '') {
  const prev = timersGuardado.get(estId)
  if (prev) {
    clearTimeout(prev)
    timersGuardado.delete(estId)
  }
  estadoFilaSync.value[estId] = { estado, detalle }
  if (estado === 'guardado') {
    timersGuardado.set(estId, setTimeout(() => {
      if (estadoFilaSync.value[estId]?.estado === 'guardado') {
        delete estadoFilaSync.value[estId]
      }
      timersGuardado.delete(estId)
    }, 2000))
  }
}

function limpiarEstadosFila() {
  for (const t of timersGuardado.values()) clearTimeout(t)
  timersGuardado.clear()
  estadoFilaSync.value = {}
}

// Construye el payload a partir del estado ACTUAL del aprendiz (en el momento del envío).
function construirItem(estId) {
  const reg = asistenciaDia.value[estId]
  if (!reg || !fichaSeleccionada.value?._id || !fechaAsistencia.value) return null

  const horaActual = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  let estadoFinal = reg.excusa ? 'Excusada' : reg.estado
  let horaMarcada = reg.horaMarcacion || horaActual
  let hTardanza = reg.horasTardanza || 0
  let tTardanza = reg.tiempoTardanza || '0 horas'

  if (estadoFinal === 'Falta') {
    horaMarcada = '—'
    hTardanza = 0
    tTardanza = '0 horas'
  } else if (estadoFinal === 'Tardanza') {
    // Tardanza manual (sin marcación de huella): no se guarda hora, igual que la falta manual.
    if (!reg.horaMarcacion) horaMarcada = '—'
    hTardanza = reg.horasTardanza || reg.horasFallidas || 1
    tTardanza = `${hTardanza} ${hTardanza === 1 ? 'hora' : 'horas'}`
  }

  return {
    estudianteId: estId,
    fichaId: fichaSeleccionada.value._id,
    estado: estadoFinal,
    fecha: fechaAsistencia.value,
    hora: horaMarcada,
    horasTardanza: hTardanza,
    tiempoTardanza: tTardanza,
    instructorId: usuario.value.id || null,
    descripcion: reg.descripcion || '',
    metodo: 'MANUAL',
  }
}

async function enviarEstado(estId) {
  const esperas = [1000, 3000, 8000]
  for (let intento = 0; ; intento++) {
    const item = construirItem(estId)
    if (!item) return
    const fecha = item.fecha
    const sFichaId = String(item.fichaId)

    setEstadoFila(estId, 'guardando')
    try {
      const res = await api.asistencias.create(item)
      if (res?.eliminado) {
        asistenciasFicha.value = asistenciasFicha.value.filter(a =>
          !(String(a.estudianteId?._id || a.estudianteId) === String(estId) &&
            a.fecha === fecha &&
            String(a.fichaId?._id || a.fichaId) === sFichaId)
        )
      } else if (res?._id) {
        const idx = asistenciasFicha.value.findIndex(a =>
          String(a.estudianteId?._id || a.estudianteId) === String(estId) &&
          a.fecha === fecha &&
          String(a.fichaId?._id || a.fichaId) === sFichaId
        )
        if (idx >= 0) {
          asistenciasFicha.value[idx] = res
        } else {
          asistenciasFicha.value.push(res)
        }
      }
      draftStore.quitarDeColaOffline(item.estudianteId, item.fichaId, fecha)
      setEstadoFila(estId, 'guardado')
      await sincronizarMotivoExcusa(estId, item)
      return
    } catch (err) {
      if (err.status === 409) {
        showToast(err.message, 'error')
        await cargarDatosFicha(item.fichaId)
        delete estadoFilaSync.value[estId]
        return
      }
      if (err.status && err.status >= 400 && err.status < 500) {
        setEstadoFila(estId, 'error', err.message)
        return
      }
      console.warn(`[Sync Nube] Reintento ${intento + 1} para ${estId}:`, err.message)
      if (intento >= esperas.length) {
        draftStore.encolarOffline([item])
        setEstadoFila(estId, 'error', `${err.message} — se guardó localmente y se reintentará`)
        return
      }
      await dormir(esperas[intento])
    }
  }
}

async function procesarColaSync(estId, entrada, fichaId, fecha) {
  try {
    do {
      entrada.pendiente = false
      if (String(fichaSeleccionada.value?._id) !== String(fichaId) || fechaAsistencia.value !== fecha) {
        console.warn(`[Sync Nube] Se cambió de fecha/ficha durante la sincronización de ${estId}; se omite el estado pendiente.`)
        break
      }
      await enviarEstado(estId)
    } while (entrada.pendiente && asistenciaDia.value[estId])
  } finally {
    syncEnVuelo.delete(estId)
  }
}

function sincronizarCambioNube(estId) {
  const reg = asistenciaDia.value[estId]
  if (!reg || !fichaSeleccionada.value?._id || !fechaAsistencia.value) return
  if (!reg.esMio) return
  if (fechaAsistencia.value > fechaHoyMax.value) return

  const fichaId = fichaSeleccionada.value._id
  const fecha = fechaAsistencia.value

  const entrada = syncEnVuelo.get(estId)
  if (entrada?.enVuelo) {
    entrada.pendiente = true
    return
  }

  const nueva = { enVuelo: true, pendiente: false }
  syncEnVuelo.set(estId, nueva)
  void procesarColaSync(estId, nueva, fichaId, fecha)
}

async function marcarFalta(estId) {
  if (jornadaInhabilitada.value) {
    showToast('La sesión está inhabilitada. Reactívala para tomar asistencia.', 'warning')
    return
  }
  const reg = asistenciaDia.value[estId]
  if (!reg) return

  if (!reg.esMio) {
    showToast(`Solo de lectura: Esta asistencia fue registrada por el Prof. ${reg.nombreDocenteCreador || 'otro instructor'}.`, 'warning')
    return
  }

  if (reg.subidoSofia) {
    showToast('Esta inasistencia ya fue reportada formalmente a Sofia Plus y no se puede modificar.', 'warning')
    return
  }

  if (reg.excusa) {
    if (Number(reg.horasFallidas) < horasClaseFicha.value) {
      reg.horasTardanza = 0
      reg.tiempoTardanza = '0 horas'
      reg.horasFallidas = horasAuto(reg)
      await sincronizarCambioNube(estId)
      return
    }
    // Desmarcar la falla justificada: vuelve a Presente
    const previo = reg.previo
    reg.estado = previo?.estado || 'Presente'
    reg.horaMarcacion = previo?.horaMarcacion || new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    reg.horasTardanza = previo?.horasTardanza || 0
    reg.tiempoTardanza = previo?.tiempoTardanza || '0 horas'
    reg.excusa = false
    reg.motivoExcusa = ''
    reg.descripcion = ''
    reg.previo = null
    reg.horasFallidas = horasAuto(reg)
    await sincronizarCambioNube(estId)
    return
  }

  if (reg.estado === 'Falta') {
    // Desmarcar la falla: vuelve a estar Presente
    const previo = reg.previo
    reg.estado = previo?.estado || 'Presente'
    reg.horaMarcacion = previo?.horaMarcacion || new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    reg.horasTardanza = previo?.horasTardanza || 0
    reg.tiempoTardanza = previo?.tiempoTardanza || '0 horas'
    reg.excusa = false
    reg.previo = null
  } else {
    // Marcar falla
    reg.previo = {
      estado: reg.estado,
      horaMarcacion: reg.horaMarcacion,
      horasTardanza: reg.horasTardanza,
      tiempoTardanza: reg.tiempoTardanza,
    }
    reg.estado = 'Falta'
    reg.horaMarcacion = '—'
    reg.horasTardanza = 0
    reg.tiempoTardanza = '0 horas'
    reg.excusa = false
  }
  reg.horasFallidas = horasAuto(reg)

  await sincronizarCambioNube(estId)
}

// --- Descripción de la excusa (modal) ---
const showExcusaModal = ref(false)
const excusaEstId = ref('')
const excusaTexto = ref('')
const excusaError = ref('')
const excusaEditando = ref(false)
const excusaTextareaRef = ref(null)
const EXCUSA_MAX = 300
const DESCRIPCION_MAX = 200

const excusaEstudiante = computed(() => estudiantesFicha.value.find(e => String(e._id) === String(excusaEstId.value)) || null)

// Excusa aprobada (la más reciente) de un aprendiz en una fecha y ficha
function buscarExcusaAprobada(estId, fecha, fichaId) {
  return excusasFicha.value.find(e =>
    String(e.estudianteId?._id || e.estudianteId) === String(estId) &&
    e.fechaInasistencia === fecha &&
    e.estado === 'Aprobada' &&
    (!fichaId || String(e.fichaId?._id || e.fichaId) === String(fichaId))
  ) || null
}

function validarEdicionExcusa(estId) {
  if (jornadaInhabilitada.value) {
    showToast('La sesión está inhabilitada. Reactívala para registrar excusas.', 'warning')
    return null
  }
  const reg = asistenciaDia.value[estId]
  if (!reg) return null

  if (!reg.esMio) {
    showToast(`Solo de lectura: Esta asistencia fue registrada por el Prof. ${reg.nombreDocenteCreador || 'otro instructor'}.`, 'warning')
    return null
  }

  if (reg.subidoSofia) {
    showToast('Esta inasistencia ya fue reportada formalmente a Sofia Plus y no se puede modificar.', 'warning')
    return null
  }
  return reg
}

async function abrirModalExcusa(estId, editando = false) {
  const reg = validarEdicionExcusa(estId)
  if (!reg) return
  excusaEstId.value = estId
  excusaEditando.value = editando
  excusaTexto.value = editando ? (reg.motivoExcusa || reg.descripcion || '') : ''
  excusaError.value = ''
  showExcusaModal.value = true
  await nextTick()
  excusaTextareaRef.value?.focus()
}

function cerrarModalExcusa() {
  showExcusaModal.value = false
  excusaEstId.value = ''
  excusaTexto.value = ''
  excusaError.value = ''
}

async function confirmarExcusa() {
  const estId = excusaEstId.value
  const reg = validarEdicionExcusa(estId)
  if (!reg) { cerrarModalExcusa(); return }

  const texto = excusaTexto.value.trim().slice(0, DESCRIPCION_MAX)

  reg.motivoExcusa = texto
  reg.excusa = true
  reg.estado = 'Excusada'
  reg.horasFallidas = horasAuto(reg)
  reg.descripcion = texto
  cerrarModalExcusa()

  await sincronizarCambioNube(estId)
}

// Clic en el checkbox de excusa: al activarla se pide la descripción; al desactivarla se retira
async function toggleExcusa(estId) {
  const reg = validarEdicionExcusa(estId)
  if (!reg) return

  if (!reg.excusa) {
    await abrirModalExcusa(estId, false)
    return
  }

  reg.excusa = false
  reg.motivoExcusa = ''
  reg.descripcion = ''
  const h = Number(reg.horasTardanza) || 0
  const max = horasClaseFicha.value
  if (h > 0 && h < max) {
    reg.estado = 'Tardanza'
    reg.horasTardanza = h
    reg.tiempoTardanza = `${h} ${h === 1 ? 'hora' : 'horas'}`
  } else {
    reg.estado = 'Falta'
    reg.horasTardanza = 0
    reg.tiempoTardanza = '0 horas'
    reg.horaMarcacion = '—'
  }
  reg.horasFallidas = horasAuto(reg)

  await sincronizarCambioNube(estId)
}

function editarExcusa(estId) {
  const reg = asistenciaDia.value[estId]
  if (!reg?.excusa) return
  abrirModalExcusa(estId, true)
}

// Guarda (o retira) la descripción de la excusa usando los endpoints de excusas ya existentes
async function sincronizarMotivoExcusa(estId, item) {
  const reg = asistenciaDia.value[estId]
  const existente = buscarExcusaAprobada(estId, item.fecha, item.fichaId)
  try {
    if (item.estado === 'Excusada') {
      const motivo = (reg?.motivoExcusa || '').trim()
      if (!motivo) return
      if (existente && existente.motivo === motivo) return
      if (existente) {
        await api.excusas.rechazar(existente._id, 'Reemplazada por una descripción actualizada del instructor')
        existente.estado = 'Rechazada'
      }
      const nueva = await api.excusas.create({
        estudianteId: estId,
        fichaId: item.fichaId,
        fechaInasistencia: item.fecha,
        motivo,
        estado: 'Aprobada',
      })
      if (nueva?._id) excusasFicha.value = [nueva, ...excusasFicha.value]
    } else if (existente) {
      await api.excusas.rechazar(existente._id, 'Excusa retirada por el instructor')
      existente.estado = 'Rechazada'
    }
  } catch (err) {
    console.warn('[Excusa] No se pudo sincronizar la descripción:', err.message)
    showToast('La asistencia se guardó, pero no se pudo guardar la descripción de la excusa.', 'warning')
  }
}

// --- Descripción opcional para Sofía Plus (modal) ---
const showDescModal = ref(false)
const descEstId = ref('')
const descTexto = ref('')
const descTextareaRef = ref(null)

// Valida que la fila admita una descripción: debe existir, ser mía, no estar
// reportada a Sofía Plus y estar en Falta, Tardanza o Excusada (excusa cuenta).
function validarEdicionDescripcion(estId) {
  const reg = asistenciaDia.value[estId]
  if (!reg) return null
  if (!reg.esMio) return null
  if (reg.subidoSofia) return null
  const estadoEfectivo = reg.excusa ? 'Excusada' : reg.estado
  if (!['Falta', 'Tardanza', 'Excusada'].includes(estadoEfectivo)) return null
  return reg
}

async function abrirModalDescripcion(estId) {
  const reg = validarEdicionDescripcion(estId)
  if (!reg) return
  descEstId.value = estId
  descTexto.value = reg.descripcion || ''
  showDescModal.value = true
  await nextTick()
  descTextareaRef.value?.focus()
}

function cerrarModalDescripcion() {
  showDescModal.value = false
  descEstId.value = ''
  descTexto.value = ''
}

async function confirmarDescripcion() {
  const estId = descEstId.value
  const reg = asistenciaDia.value[estId]
  if (!reg) { cerrarModalDescripcion(); return }
  reg.descripcion = descTexto.value.trim().slice(0, DESCRIPCION_MAX)
  cerrarModalDescripcion()
  await sincronizarCambioNube(estId)
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
      if (reg.excusa || reg.estado === 'Excusada') {
        conteo.Excusada++
      } else if (reg.estado === 'Falta') {
        conteo.Falta++
      } else if (reg.estado === 'Tardanza') {
        conteo.Tardanza++
      } else {
        conteo.Presente++
      }
    } else {
      conteo.Presente++
    }
  }
  return conteo
})




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
  descargarDatos(data, `Asistencia_${fichaSeleccionada.value.codigoFicha}_${hoy}`, `Asistencia del día ${hoy}`)
}

function exportarHistorial() {
  const jornadaFicha = fichaSeleccionada.value?.jornada || 'Mañana'
  const data = historialAnomalias.value.map(asis => {
    const est = estudiantesFicha.value.find(e => String(e._id) === String(asis.estudianteId?._id || asis.estudianteId))
    const nombreEst = est ? `${est.nombres} ${est.apellidos}` : (asis.estudianteId?.nombres ? `${asis.estudianteId.nombres} ${asis.estudianteId.apellidos}` : 'Aprendiz')
    const docEst = est ? est.numeroDocumento : (asis.estudianteId?.numeroDocumento || '')
    const nombreDocente = asis.instructorId?.nombres ? `${asis.instructorId.nombres} ${asis.instructorId.apellidos || ''}`.trim() : 'Sistema / Lector'
    let tardanzaStr = '0 horas'
    if (asis.estado === 'Tardanza') {
      tardanzaStr = asis.tiempoTardanza || calcularHorasTardanza(asis.hora, jornadaFicha).texto
    }
    return {
      'Fecha': asis.fecha,
      'Hora': asis.hora || '—',
      'Aprendiz': nombreEst,
      'Documento': docEst,
      'Instructor Responsable': nombreDocente,
      'Estado': asis.estado,
      'Tiempo de Tardanza': tardanzaStr,
      'Motivo Inhabilitación': asis.motivoInhabilitacion || '—',
    }
  })
  descargarDatos(data, `Anomalias_${fichaSeleccionada.value.codigoFicha}`, 'Historial de anomalías (fallas, tardanzas y excusas)')
}

// Formato elegido para descargar ('excel' | 'pdf')
const formatoDescarga = ref('excel')

async function descargarDatos(data, nombreArchivo, titulo) {
  if (formatoDescarga.value === 'pdf') {
    await descargarPDF(data, nombreArchivo, titulo)
  } else {
    descargarExcel(data, nombreArchivo)
  }
}

async function descargarPDF(data, nombreArchivo, titulo) {
  if (data.length === 0) {
    showToast('No hay datos para exportar', 'warning')
    return
  }
  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const autoTable = autoTableModule.default || autoTableModule.autoTable
    const limpiar = v => String(v ?? '').replace(/[—–]/g, '-')

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const ficha = fichaSeleccionada.value
    doc.setFontSize(14)
    doc.text(limpiar(titulo), 40, 40)
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(limpiar(`Ficha ${ficha.codigoFicha} - ${ficha.nombrePrograma} | Jornada: ${ficha.jornada || ''}`), 40, 58)

    const columnas = Object.keys(data[0])
    autoTable(doc, {
      startY: 72,
      head: [columnas.map(limpiar)],
      body: data.map(row => columnas.map(c => limpiar(row[c]))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [57, 169, 0], textColor: 255 },
      alternateRowStyles: { fillColor: [242, 249, 237] },
    })

    doc.save(`${nombreArchivo}.pdf`)
    showToast(`Archivo "${nombreArchivo}.pdf" descargado`)
  } catch (err) {
    console.error('Error al generar PDF:', err)
    showToast('Error al generar el PDF: ' + err.message, 'error')
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

    <!-- Título dinámico según la acción activa -->
    <div class="instructor-titlebar">
      <div class="titlebar-text">
        <h1>{{ tituloVista.titulo }}</h1>
        <p>{{ tituloVista.subtitulo }}</p>
      </div>
    </div>

    <div v-if="loading" class="loading-box">
      Cargando tus fichas y grupos asignados...
    </div>

    <div v-else-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <template v-else>
    <!-- Filtro superior de fichas -->
    <div v-if="misFichas.length > 0" class="fichas-filtro">
      <div class="filtro-select-wrap">
        <label class="filtro-label" for="select-ficha">Ficha</label>
        <select
          id="select-ficha"
          class="filtro-select"
          :value="fichaSeleccionada ? fichaSeleccionada._id : ''"
          @change="onSelectFicha($event.target.value)"
        >
          <option value="" disabled>Seleccione la ficha</option>
          <option v-for="ficha in misFichas" :key="ficha._id" :value="ficha._id">
            Ficha {{ ficha.codigoFicha }} · {{ ficha.nombrePrograma }} · Ambiente {{ ficha.aulaAsignada }} · {{ ficha.jornada }}{{ ficha.esLider ? ' · Líder' : '' }}
          </option>
        </select>
      </div>
    </div>

    <div v-else class="no-fichas">
      No tienes fichas asignadas actualmente. Contacta al Administrador.
    </div>

    <div class="content-layout">
      <!-- Detalle y Operaciones de la Ficha Seleccionada -->
      <div v-if="fichaSeleccionada" class="ficha-detail">
        <div class="ficha-banner">
          <div class="banner-title">
            <h3>{{ fichaSeleccionada.nombrePrograma }} ({{ fichaSeleccionada.codigoFicha }})</h3>
            <span v-if="fichaSeleccionada.esLider" class="badge-banner badge-lider">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h16l1.5-9-5 3-4.5-6-4.5 6-5-3L4 18z"/></svg>
              Instructor Líder de la Ficha
            </span>
            <span v-else class="badge-banner badge-comun">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6z"/></svg>
              Instructor Común
            </span>
          </div>
          <div class="banner-actions">
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'asistencia' }"
              @click="vistaFicha = 'asistencia'"
              title="Tomar Asistencia"
            >
              <svg class="tab-icon-color" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="34" height="34" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect x="5" y="9" width="32" height="30" rx="5" fill="#E8F5E0" stroke="#2F8C00" stroke-width="2.5"/>
  <path d="M5 18h32" stroke="#2F8C00" stroke-width="2.5"/>
  <path d="M5 14a5 5 0 0 1 5-5h22a5 5 0 0 1 5 5v4H5z" fill="#39A900" stroke="#2F8C00" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M13 5v7M29 5v7" stroke="#2F8C00" stroke-width="3"/>
  <path d="M11 25l2 2 3.5-4M20 25l2 2 3.5-4M11 33l2 2 3.5-4" stroke="#39A900" stroke-width="2.2"/>
  <circle cx="35" cy="34" r="10" fill="#ffffff" stroke="#2F8C00" stroke-width="2.5"/>
  <path d="M35 28.5V34l3.5 2.5" stroke="#2F8C00" stroke-width="2.5"/>
</svg>
              <span class="tab-label">Asistencia</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'editar_asistencia' }"
              @click="vistaFicha = 'editar_asistencia'"
              title="Historial"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
              <span class="tab-label">Historial</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: vistaFicha === 'docentes' }"
              @click="vistaFicha = 'docentes'"
              title="Equipo Ejecutor"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="tab-label">Equipo Ejecutor</span>
            </button>

            <!-- Botón-switch de pase de lista: rojo = apagado, verde = encendido -->
            <button
              type="button"
              class="switch-pase-lista"
              :class="sesionRemotaActiva ? 'is-on' : 'is-off'"
              role="switch"
              :aria-checked="sesionRemotaActiva"
              :disabled="alternandoSesion || finalizando || (!sesionRemotaActiva && jornadaInhabilitada)"
              :title="sesionRemotaActiva ? 'Pase de lista encendido: clic para apagar' : 'Pase de lista apagado: clic para encender'"
              @click="alternarSesionRemota"
            >
              <svg v-if="!sesionRemotaActiva" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 1: TOMAR ASISTENCIA (POR DÍAS)      -->
        <!-- ========================================= -->
        <div v-if="vistaFicha === 'asistencia'" class="section-body">
          <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <h4>Tomar Asistencia</h4>
              <p class="section-desc">Control biométrico y manual por jornada para la Ficha {{ fichaSeleccionada.codigoFicha }}.</p>
            </div>
            
            <!-- Controles de Navegación por Días e Inhabilitación -->
            <NavegadorDias
              :fecha="fechaAsistencia"
              :fecha-hoy-max="fechaHoyMax"
              :jornada-inhabilitada="jornadaInhabilitada"
              :es-fecha-actual-o-hoy="esFechaActualOHoy"
              :jornada-es-de-otro-docente="jornadaEsDeOtroDocente"
              :inhabilitando="inhabilitando"
              @cambiar-dia="cambiarFechaDia"
              @cambiar-fecha="(f) => { fechaAsistencia = f; onFechaChange() }"
              @ir-a-hoy="irAHoy"
              @inhabilitar="abrirModalInhabilitar"
              @reactivar="reactivarJornada"
            />
          </div>

          <!-- HUD Card de Día Inhabilitado -->
          <HudJornadaInhabilitada
            v-if="jornadaInhabilitada"
            :fecha="fechaAsistencia"
            :motivo="motivoInhabilitacionDia"
            :inhabilitando="inhabilitando"
            :jornada-es-de-otro-docente="jornadaEsDeOtroDocente"
            @reactivar="reactivarJornada"
          />

          <!-- BANNER SUPERIOR: DOCENTE RESPONSABLE DE LA JORNADA -->
          <div
            v-if="!jornadaInhabilitada"
            class="docente-jornada-banner"
            :class="{
              'banner-docente-ajeno': jornadaEsDeOtroDocente,
              'banner-docente-propio': !jornadaEsDeOtroDocente && docenteResponsableDia,
              'banner-docente-nuevo': !docenteResponsableDia
            }"
          >
            <div class="docente-jornada-icon-wrap">
              <svg v-if="jornadaEsDeOtroDocente" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div class="docente-jornada-body">
              <div class="docente-jornada-header-line">
                <span class="docente-jornada-pre">Instructor a cargo de la jornada:</span>
                <strong class="docente-jornada-nombre">
                  Prof. {{ docenteResponsableDia ? docenteResponsableDia.nombreCompleto : (usuario?.nombre || `${usuario?.nombres || ''} ${usuario?.apellidos || ''}`.trim() || 'Instructor') }}
                </strong>
                <span v-if="jornadaEsDeOtroDocente" class="badge-solo-lectura-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Modo solo lectura (No modificable)
                </span>
                <span v-else-if="docenteResponsableDia" class="badge-tu-jornada-tag">
                  (Tú registraste esta jornada)
                </span>
                <span v-else class="badge-pendiente-tag">
                  (Pendiente por registrar)
                </span>
              </div>
              <p class="docente-jornada-desc">
                <template v-if="jornadaEsDeOtroDocente">
                  Esta sesión fue registrada por otro instructor. Puedes visualizarla pero los controles están bloqueados para proteger el registro del instructor titular.
                </template>
                <template v-else-if="docenteResponsableDia">
                  Tienes permisos de edición completos sobre esta jornada registrada.
                </template>
                <template v-else>
                  Jornada sin registro previo. Los cambios que efectúes quedarán vinculados a tu usuario como instructor a cargo del día.
                </template>
              </p>
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
                  <th>Marcar Falla</th>
                  <th>Excusa (F2F)</th>
                  <th>Hora Marcación</th>
                  <th>Estado Asignado</th>
                  <th class="th-horas">Horas Fallidas</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="est in estudiantesFicha" :key="est._id"
                    :class="{ 'row-excusada': asistenciaDia[est._id]?.excusa, 'row-disabled': jornadaInhabilitada }">
                  <td>
                    <strong>{{ est.nombres }} {{ est.apellidos }}</strong>
                    <span v-if="estadoFilaSync[est._id]" class="sync-indicador" :class="'sync-' + estadoFilaSync[est._id].estado" :title="estadoFilaSync[est._id].estado === 'error' ? (estadoFilaSync[est._id].detalle || 'Error al guardar') : (estadoFilaSync[est._id].estado === 'guardando' ? 'Guardando…' : 'Guardado')">
                      <template v-if="estadoFilaSync[est._id].estado === 'guardando'">●</template>
                      <template v-else-if="estadoFilaSync[est._id].estado === 'guardado'">✓</template>
                      <template v-else>!</template>
                    </span>
                  </td>
                  <td>{{ est.tipoDocumento }} {{ est.numeroDocumento }}</td>
                  <td class="td-radio">
                    <label class="checkbox-label" :style="(jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio) ? 'cursor: not-allowed; opacity: 0.5;' : ''" :title="!asistenciaDia[est._id]?.esMio ? 'Solo lectura: jornada de otro instructor' : ''">
                      <input
                        type="checkbox"
                        :checked="asistenciaDia[est._id]?.estado === 'Falta' || (asistenciaDia[est._id]?.excusa && Number(asistenciaDia[est._id]?.horasFallidas) >= horasClaseFicha)"
                        :disabled="jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                        @change="marcarFalta(est._id)"
                      />
                      <span class="checkbox-custom checkbox-falta"></span>
                    </label>
                  </td>
                  <td class="td-radio">
                    <label class="checkbox-label" :style="(jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio) ? 'cursor: not-allowed; opacity: 0.5;' : ''" :title="!asistenciaDia[est._id]?.esMio ? 'Solo lectura: jornada de otro instructor' : ''">
                      <input
                        type="checkbox"
                        :checked="asistenciaDia[est._id]?.excusa"
                        :disabled="jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                        @change="toggleExcusa(est._id)"
                      />
                      <span class="checkbox-custom"></span>
                    </label>
                  </td>
                  <td style="font-size: 12px; font-weight: 600; color: #475569;">
                    {{ jornadaInhabilitada ? '—' : (asistenciaDia[est._id]?.horaMarcacion || '—') }}
                  </td>
                  <td>
                    <span v-if="asistenciaDia[est._id]?.subidoSofia" class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #10b981; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Inasistencia ya reportada en Sofia Plus. Bloqueada para edición.">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Reportado Sofia Plus ({{ asistenciaDia[est._id]?.estado }})
                    </span>
                    <span v-else-if="jornadaInhabilitada" class="badge" style="background: #fed7aa; color: #9a3412; font-weight: 700; border: 1px solid #f97316; display: inline-flex; align-items: center; gap: 5px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
                      Inhabilitada
                    </span>
                    <span
                      v-else-if="asistenciaDia[est._id]?.excusa"
                      class="badge badge-warning badge-excusa-tip"
                      tabindex="0"
                      role="button"
                      :aria-label="'Excusada: ' + (asistenciaDia[est._id]?.descripcion || asistenciaDia[est._id]?.motivoExcusa || 'Se enviará &quot;Con excusa&quot; a Sofía Plus')"
                      @click="editarExcusa(est._id)"
                      @keydown.enter="editarExcusa(est._id)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                      Excusada
                      <span class="excusa-tooltip" role="tooltip">
                        <strong>Descripción para Sofía Plus</strong>
                        <span>{{ asistenciaDia[est._id]?.descripcion || asistenciaDia[est._id]?.motivoExcusa || 'Se enviará "Con excusa" a Sofía Plus' }}</span>
                        <em v-if="asistenciaDia[est._id]?.esMio && !asistenciaDia[est._id]?.subidoSofia">Clic para editar</em>
                      </span>
                    </span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Falta'" class="badge badge-danger">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                      Falta
                    </span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Tardanza'" class="badge badge-warning">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M8 3l-2 2M16 3l2 2"/></svg>
                      Tardanza ({{ asistenciaDia[est._id]?.tiempoTardanza || '1 hora' }})
                    </span>
                    <span v-else class="badge badge-success">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.2 9"/></svg>
                      Presente (A tiempo)
                    </span>
                    <button
                      v-if="(asistenciaDia[est._id]?.excusa || asistenciaDia[est._id]?.estado === 'Falta' || asistenciaDia[est._id]?.estado === 'Tardanza') && !jornadaInhabilitada"
                      type="button"
                      class="btn-desc-nota"
                      :class="{ 'btn-desc-nota-activa': asistenciaDia[est._id]?.descripcion }"
                      :disabled="asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                      :title="asistenciaDia[est._id]?.subidoSofia ? 'Ya reportada a Sofía Plus' : (asistenciaDia[est._id]?.descripcion ? 'Editar descripción: ' + asistenciaDia[est._id]?.descripcion : 'Añadir descripción opcional')"
                      @click="abrirModalDescripcion(est._id)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                    </button>
                  </td>
                  <td class="td-horas">
                    <div class="horas-wrap">
                      <input
                        type="number"
                        class="input-horas"
                        :class="{ 'input-horas-activo': (asistenciaDia[est._id]?.horasFallidas || 0) > 0 }"
                        min="0"
                        :max="horasClaseFicha"
                        step="1"
                        inputmode="numeric"
                        :value="asistenciaDia[est._id]?.horasFallidas || 0"
                        :disabled="jornadaInhabilitada || !asistenciaDia[est._id]?.esMio"
                        :title="!asistenciaDia[est._id]?.esMio ? 'Solo lectura: registrada por otro instructor' : (`Horas fallidas (máximo ${horasClaseFicha})`)"
                        @keydown="bloquearNoEnteros"
                        @input="onHorasInput(est._id, $event)"
                        @change="onHorasChange(est._id, $event)"
                      />
                      <span class="horas-max">/ {{ horasClaseFicha }}</span>
                    </div>
                  </td>
                </tr>
                <tr v-if="estudiantesFicha.length === 0">
                  <td colspan="7" class="empty-cell">No hay aprendices registrados en esta ficha.</td>
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
                    <strong class="mob-name">
                      {{ est.nombres }} {{ est.apellidos }}
                      <span v-if="estadoFilaSync[est._id]" class="sync-indicador" :class="'sync-' + estadoFilaSync[est._id].estado" :title="estadoFilaSync[est._id].estado === 'error' ? (estadoFilaSync[est._id].detalle || 'Error al guardar') : (estadoFilaSync[est._id].estado === 'guardando' ? 'Guardando…' : 'Guardado')">
                        <template v-if="estadoFilaSync[est._id].estado === 'guardando'">●</template>
                        <template v-else-if="estadoFilaSync[est._id].estado === 'guardado'">✓</template>
                        <template v-else>!</template>
                      </span>
                    </strong>
                    <span class="mob-doc">{{ est.tipoDocumento }} {{ est.numeroDocumento }}</span>
                  </div>
                  <div class="mob-status-badge">
                    <span v-if="asistenciaDia[est._id]?.subidoSofia" class="badge-mob-pres" style="background: #059669; color: #fff;">Sofia OK</span>
                    <span v-else-if="jornadaInhabilitada" class="badge-mob-inh">Inhabilitada</span>
                    <span v-else-if="asistenciaDia[est._id]?.excusa" class="badge-mob-exc" :title="asistenciaDia[est._id]?.descripcion || asistenciaDia[est._id]?.motivoExcusa || 'Se enviará &quot;Con excusa&quot; a Sofía Plus'" @click="editarExcusa(est._id)">Excusada</span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Falta'" class="badge-mob-falta">Falta</span>
                    <span v-else-if="asistenciaDia[est._id]?.estado === 'Tardanza'" class="badge-mob-tard">Tardanza</span>
                    <span v-else class="badge-mob-pres">Presente</span>
                  </div>
                </div>
                <div class="mob-card-footer">
                  <div class="mob-time-info">
                    <span class="time-label">Hora:</span>
                    <span class="time-val">{{ jornadaInhabilitada ? '—' : (asistenciaDia[est._id]?.horaMarcacion || 'Sin registro') }}</span>
                    <span class="time-label" style="margin-left: 6px;">Fallidas:</span>
                    <input
                      type="number"
                      class="input-horas input-horas-mob"
                      :class="{ 'input-horas-activo': (asistenciaDia[est._id]?.horasFallidas || 0) > 0 }"
                      min="0"
                      :max="horasClaseFicha"
                      step="1"
                      inputmode="numeric"
                      :value="asistenciaDia[est._id]?.horasFallidas || 0"
                      :disabled="jornadaInhabilitada || !asistenciaDia[est._id]?.esMio"
                      @keydown="bloquearNoEnteros"
                      @input="onHorasInput(est._id, $event)"
                      @change="onHorasChange(est._id, $event)"
                    />
                    <span class="horas-max">/ {{ horasClaseFicha }}</span>
                  </div>

                  <div class="mob-actions-row">
                    <!-- Botón Marcar Falla Táctil -->
                    <button
                      type="button"
                      class="btn-mob-falta"
                      :class="{ 'btn-mob-falta-active': asistenciaDia[est._id]?.estado === 'Falta' || (asistenciaDia[est._id]?.excusa && Number(asistenciaDia[est._id]?.horasFallidas) >= horasClaseFicha) }"
                      :disabled="jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                      @click="marcarFalta(est._id)"
                      :title="!asistenciaDia[est._id]?.esMio ? 'Solo lectura: jornada de otro instructor' : 'Marcar falla'"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>

                    <!-- Botón Excusa Táctil -->
                    <button
                      type="button"
                      class="btn-mob-excusa"
                      :class="{ 'btn-mob-exc-active': asistenciaDia[est._id]?.excusa }"
                      :disabled="jornadaInhabilitada || asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                      @click="toggleExcusa(est._id)"
                      :title="!asistenciaDia[est._id]?.esMio ? 'Solo lectura: jornada de otro instructor' : 'Registrar excusa'"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </button>

                    <!-- Botón Descripción (nota Sofía Plus) -->
                    <button
                      v-if="(asistenciaDia[est._id]?.excusa || asistenciaDia[est._id]?.estado === 'Falta' || asistenciaDia[est._id]?.estado === 'Tardanza') && !jornadaInhabilitada"
                      type="button"
                      class="btn-mob-nota"
                      :disabled="asistenciaDia[est._id]?.subidoSofia || !asistenciaDia[est._id]?.esMio"
                      :title="asistenciaDia[est._id]?.subidoSofia ? 'Ya reportada a Sofía Plus' : (asistenciaDia[est._id]?.descripcion ? 'Editar descripción: ' + asistenciaDia[est._id]?.descripcion : 'Añadir descripción opcional')"
                      @click="abrirModalDescripcion(est._id)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
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
            <!-- Indicador de cola offline si hay asistencias pendientes por enviar -->
            <button
              v-if="draftStore.pendientesOfflineCount > 0"
              class="btn"
              @click="onConexionRecuperada"
              title="Haz clic para intentar sincronizar las asistencias guardadas localmente"
              style="background: #fffbeb; border: 1.5px solid #fcd34d; color: #b45309; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px;"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>{{ draftStore.pendientesOfflineCount }} offline (Reintentar envío)</span>
            </button>

            <select v-model="formatoDescarga" class="form-input" title="Formato de descarga" style="width: auto; height: 38px; padding: 0 10px; font-size: 13px; cursor: pointer;"><option value="excel">Excel</option><option value="pdf">PDF</option></select>
            <button class="btn-export" @click="exportarAsistenciaDia" :title="formatoDescarga === 'pdf' ? 'Descargar PDF' : 'Descargar Excel'">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <div v-if="jornadaInhabilitada" style="display: flex; align-items: center; gap: 8px; color: #c2410c; font-weight: 700; font-size: 13px; background: #fff7ed; border: 1px solid #fdba74; padding: 8px 14px; border-radius: 8px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
              Sesión Inhabilitada — Guardada en MongoDB y SQLite
            </div>
          </div>
        </div>

        <!-- ========================================= -->
        <!-- VISTA 2: HISTORIAL DE ASISTENCIAS         -->
        <!-- ========================================= -->
        <HistorialAnomaliasTab
          v-if="vistaFicha === 'editar_asistencia'"
          :anomalias="historialAnomalias"
          v-model:formato-descarga="formatoDescarga"
          @exportar="exportarHistorial"
        />

        <!-- ========================================= -->
        <!-- VISTA 5: EQUIPO DOCENTE DE LA FICHA       -->
        <!-- ========================================= -->
        <EquipoEjecutorTab
          v-if="vistaFicha === 'docentes'"
          :ficha="fichaSeleccionada"
          :es-lider="esLiderEnFichaSeleccionada"
          :usuario-id="usuario.id"
          @abrir-modal-agregar="abrirModalAgregarDocente"
          @solicitar-desvincular="abrirModalDesvincularDocente"
        />

      </div>

      <!-- Estado de espera: aún no se ha elegido una ficha -->
      <div v-else-if="misFichas.length > 0" class="ficha-espera" aria-live="polite">
        <!-- Maqueta fantasma de lo que aparecerá al elegir la ficha -->
        <div class="espera-fantasma" aria-hidden="true">
          <div class="sk sk-title"></div>
          <div class="sk sk-pill"></div>
          <div class="sk-row">
            <div class="sk sk-tab"></div>
            <div class="sk sk-tab"></div>
            <div class="sk sk-tab"></div>
            <div class="sk sk-tab sk-tab-end"></div>
          </div>
          <div class="sk-row sk-chips">
            <div class="sk sk-chip"></div>
            <div class="sk sk-chip"></div>
            <div class="sk sk-chip"></div>
            <div class="sk sk-chip"></div>
          </div>
          <div class="sk sk-line"></div>
          <div class="sk sk-line"></div>
          <div class="sk sk-line sk-line-short"></div>
        </div>

        <!-- Indicador central -->
        <div class="espera-centro">
          <div class="espera-icono">
            <span class="espera-ring"></span>
            <span class="espera-ring espera-ring-2"></span>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11c0 3.5-.5 6-2 8"/><path d="M8 15c.5-1 .8-2.6.8-4a3.2 3.2 0 0 1 6.4 0c0 2.6-.4 5.2-1.4 7.4"/><path d="M5 12a7 7 0 0 1 14 0c0 2-.2 3.8-.7 5.5"/><path d="M3.5 9.5A9 9 0 0 1 20.5 9.5"/></svg>
          </div>
          <span class="espera-badge">
            <span class="espera-dot"></span>
            Esperando selección de ficha
          </span>
        </div>
      </div>
    </div>

    <!-- ========================================= -->
    <!-- MODAL INHABILITAR JORNADA                 -->
    <!-- ========================================= -->
    <!-- MODAL EXCUSA -->
    <ModalExcusa
      :abierto="showExcusaModal"
      tipo="excusa"
      :estudiante="excusaEstudiante"
      :fecha="fechaAsistencia"
      :editando="excusaEditando"
      :texto-inicial="excusaTexto"
      @cerrar="cerrarModalExcusa"
      @guardar="(txt) => { excusaTexto = txt; confirmarExcusa() }"
    />

    <!-- MODAL DESCRIPCIÓN SOFÍA PLUS -->
    <ModalExcusa
      :abierto="showDescModal"
      tipo="descripcion"
      :texto-inicial="descTexto"
      @cerrar="cerrarModalDescripcion"
      @guardar="(txt) => { descTexto = txt; confirmarDescripcion() }"
    />

    <!-- MODAL INHABILITAR JORNADA -->
    <ModalInhabilitarJornada
      :abierto="showInhabilitarModal"
      :ficha="fichaSeleccionada"
      :fecha="fechaAsistencia"
      :inhabilitando="inhabilitando"
      @cerrar="showInhabilitarModal = false"
      @confirmar="confirmarInhabilitarJornada"
    />

    <!-- MODAL AGREGAR DOCENTE -->
    <ModalAgregarDocente
      :abierto="modalAgregarDocenteAbierto"
      :ficha="fichaSeleccionada"
      :docentes-disponibles="docentesDisponiblesParaFicha"
      :guardando="guardandoDocente"
      @cerrar="modalAgregarDocenteAbierto = false"
      @confirmar="confirmarAgregarDocente"
    />

    <!-- MODAL DESVINCULAR DOCENTE -->
    <ModalDesvincularDocente
      :abierto="modalDesvincularAbierto"
      :ficha="fichaSeleccionada"
      :docente="docenteADesvincular"
      :desvinculando="desvinculandoDocente"
      @cerrar="cerrarModalDesvincularDocente"
      @confirmar="confirmarDesvincularDocente"
    />
    </template>

  </div>
</template>

