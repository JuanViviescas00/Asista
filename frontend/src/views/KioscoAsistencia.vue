<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { socket, unirseASalaFicha, salirDeSalaFicha, notificarMarcacionKiosco } from '../services/index.js'
import api from '../services/index.js'
import { calcularMinutosTranscurridos, calcularEstadoPorTiempo } from '../utils/asistenciaTiempo.js'

const props = defineProps({
  ficha: {
    type: Object,
    default: null,
  },
  instructor: {
    type: Object,
    default: () => ({ nombre: 'Instructor' }),
  },
  fecha: {
    type: String,
    default: () => new Date().toISOString().slice(0, 10),
  },
  standalone: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['salir-kiosco', 'asistencia-marcada'])

// Estado de la sesión remota y ficha dinámica
const sesionActiva = ref(false)
const sesionData = ref(null)
const fichaDinamica = ref(props.ficha || null)
const sesionInicioMs = ref(null)

const fichaActual = computed(() => {
  if (fichaDinamica.value) return fichaDinamica.value
  if (sesionData.value) {
    return {
      _id: sesionData.value.fichaId,
      codigoFicha: sesionData.value.fichaCodigo,
      nombrePrograma: sesionData.value.nombrePrograma,
      jornada: sesionData.value.jornada,
      aulaAsignada: sesionData.value.aulaAsignada || 'Ambiente Asignado',
    }
  }
  return null
})

// Datos de la ficha
const estudiantesFicha = ref([])
const asistenciasDia = ref({})
const marcacionesRecientes = ref([]) // Solo los que han marcado en esta sesión

// Reloj en vivo
const horaActual = ref('')
let timerReloj = null

// SDK Biométrico
const lectorConectado = ref(false)
const capturando = ref(false)
const estadoLectorMsg = ref('Inicializando lector USB...')
const procesandoHuella = ref(false)
let fpSdk = null
let currentReaderUid = ''
let currentFormat = null

// Última verificación en pantalla
const ultimaMarcacion = ref(null)
let timerLimpiarMarcacion = null

// Pantalla completa
const esPantallaCompleta = ref(false)

onMounted(async () => {
  actualizarHora()
  timerReloj = setInterval(actualizarHora, 1000)

  if (props.ficha?._id) {
    await cargarEstudiantesYAsistencias(props.ficha._id)
  }
  iniciarSocketKiosco()
  iniciarSDKBiometrico()
})

onUnmounted(() => {
  if (timerReloj) clearInterval(timerReloj)
  if (timerLimpiarMarcacion) clearTimeout(timerLimpiarMarcacion)
  detenerCapturaBiometrica()
  if (fichaActual.value?._id) {
    salirDeSalaFicha(fichaActual.value._id)
  }
  salirDeSalaFicha('global_kioscos')
})

function actualizarHora() {
  const ahora = new Date()
  horaActual.value = ahora.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

// 1. Cargar estudiantes y asistencias previas de hoy
async function cargarEstudiantesYAsistencias(targetFichaId) {
  const idParaCargar = targetFichaId || fichaActual.value?._id
  if (!idParaCargar) return
  try {
    const [estRes, asisRes] = await Promise.all([
      api.estudiantes.getAll({ fichaId: idParaCargar, estado: 'Activo' }),
      api.asistencias.getAll({ fichaId: idParaCargar, fecha: props.fecha }),
    ])

    estudiantesFicha.value = Array.isArray(estRes) ? estRes : []
    const mapa = {}
    const listaRecientes = []

    if (Array.isArray(asisRes)) {
      asisRes.forEach((a) => {
        const estId = a.estudianteId?._id || a.estudianteId
        mapa[estId] = {
          estado: a.estado,
          hora: a.hora || '—',
        }
        if (a.estado === 'Presente' || a.estado === 'Tardanza') {
          const estObj = estudiantesFicha.value.find((e) => e._id === estId)
          if (estObj) {
            listaRecientes.unshift({
              id: estId,
              nombres: estObj.nombres,
              apellidos: estObj.apellidos,
              hora: a.hora || '—',
              estado: a.estado,
            })
          }
        }
      })
    }

    asistenciasDia.value = mapa
    marcacionesRecientes.value = listaRecientes.slice(0, 8)
  } catch (e) {
    console.error('[Kiosco] Error al cargar datos:', e)
  }
}

// 2. Conectar a Socket.IO para órdenes remotas
function iniciarSocketKiosco() {
  if (props.ficha?._id) {
    unirseASalaFicha(props.ficha._id, 'kiosco')
  }
  // Unirse siempre a la sala global de kioscos de aula
  unirseASalaFicha('global_kioscos', 'kiosco')

  // Estado inicial
  socket.on('estado_sesion', ({ activa, sesion }) => {
    sesionActiva.value = activa
    sesionData.value = sesion
    if (activa && sesion?.fichaId) {
      sesionInicioMs.value = Date.now()
      fichaDinamica.value = {
        _id: sesion.fichaId,
        codigoFicha: sesion.fichaCodigo,
        nombrePrograma: sesion.nombrePrograma,
        jornada: sesion.jornada,
      }
      cargarEstudiantesYAsistencias(sesion.fichaId)
      iniciarCapturaBiometrica()
    } else if (!activa) {
      sesionInicioMs.value = null
      detenerCapturaBiometrica()
    }
  })

  // Orden remota: Activar
  const onActivar = async (sesion) => {
    console.log('[Kiosco] 📡 Recibida orden remota: ACTIVAR ASISTENCIA para ficha', sesion.fichaCodigo)
    sesionActiva.value = true
    sesionData.value = sesion
    sesionInicioMs.value = Date.now()
    fichaDinamica.value = {
      _id: sesion.fichaId,
      codigoFicha: sesion.fichaCodigo,
      nombrePrograma: sesion.nombrePrograma,
      jornada: sesion.jornada,
    }
    await cargarEstudiantesYAsistencias(sesion.fichaId)
    iniciarCapturaBiometrica()
  }

  socket.on('kiosco:activar_lectura', onActivar)
  socket.on('kiosco:activar_lectura_global', onActivar)

  // Orden remota: Desactivar
  const onDesactivar = () => {
    console.log('[Kiosco] 📡 Recibida orden remota: DESACTIVAR ASISTENCIA')
    sesionActiva.value = false
    sesionInicioMs.value = null
    detenerCapturaBiometrica()
    if (props.standalone) {
      fichaDinamica.value = null
      sesionData.value = null
    }
  }

  socket.on('kiosco:desactivar_lectura', onDesactivar)
  socket.on('kiosco:desactivar_lectura_global', onDesactivar)
}

// 3. Inicializar SDK de Huella DigitalPersona
function iniciarSDKBiometrico() {
  if (typeof Fingerprint === 'undefined') {
    estadoLectorMsg.value = 'Esperando servicio de huellas...'
    setTimeout(iniciarSDKBiometrico, 1000)
    return
  }

  try {
    fpSdk = new Fingerprint.WebApi()
    currentFormat = Fingerprint.SampleFormat.PngImage

    fpSdk.onDeviceConnected = (e) => {
      if (e?.deviceUid) currentReaderUid = e.deviceUid
      lectorConectado.value = true
      estadoLectorMsg.value = 'Lector USB conectado'
      if (sesionActiva.value) iniciarCapturaBiometrica()
    }

    fpSdk.onDeviceDisconnected = () => {
      lectorConectado.value = false
      capturando.value = false
      estadoLectorMsg.value = 'Lector USB desconectado'
    }

    fpSdk.onSamplesAcquired = async (s) => {
      if (!s || !s.samples) return
      try {
        const samples = JSON.parse(s.samples)
        const sampleBase64 = Fingerprint.b64UrlTo64(samples[0])
        await procesarHuellaKiosco(sampleBase64)
      } catch (err) {
        console.error('[Kiosco] Error al parsear muestra:', err)
      }
    }

    fpSdk.enumerateDevices().then(
      (readers) => {
        if (readers && readers.length > 0) {
          currentReaderUid = readers[0]
          lectorConectado.value = true
          estadoLectorMsg.value = 'Lector USB listo'
          if (sesionActiva.value) iniciarCapturaBiometrica()
        } else {
          lectorConectado.value = false
          estadoLectorMsg.value = 'Conecte el lector de huellas USB'
        }
      },
      () => {
        lectorConectado.value = false
        estadoLectorMsg.value = 'Servicio local DigitalPersona no detectado'
      }
    )
  } catch (err) {
    console.error('[Kiosco] Error al crear WebApi:', err)
    estadoLectorMsg.value = 'Error inicializando sensor'
  }
}

function iniciarCapturaBiometrica() {
  if (!fpSdk || !lectorConectado.value || capturando.value) return
  fpSdk.startAcquisition(currentFormat, currentReaderUid).then(
    () => {
      capturando.value = true
      console.log('[Kiosco] 🟢 Captura biométrica iniciada')
    },
    (err) => console.error('[Kiosco] Error al iniciar captura:', err)
  )
}

function detenerCapturaBiometrica() {
  if (!fpSdk || !capturando.value) return
  fpSdk.stopAcquisition().then(
    () => {
      capturando.value = false
      console.log('[Kiosco] 🔴 Captura biométrica detenida')
    },
    (err) => console.warn('[Kiosco] Error al detener captura:', err)
  )
}

// 4. Procesar la huella leída
async function procesarHuellaKiosco(imageBase64) {
  if (procesandoHuella.value) return
  procesandoHuella.value = true

  try {
    const fichaId = fichaActual.value?._id
    if (!fichaId) return

    const result = await api.estudiantes.fingerprint.verify(imageBase64, fichaId)

    const ahora = new Date()
    const horaStr = ahora.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    if (result.match) {
      const estId = result.studentId
      const nombreCompleto = `${result.nombres} ${result.apellidos}`
      const registroPrevio = asistenciasDia.value[estId]

      // Determinar si es presente, tardanza o falta según el tiempo desde el inicio de la sesión
      const ahoraMs = ahora.getTime()
      const minutos = calcularMinutosTranscurridos(sesionInicioMs.value || ahoraMs, ahoraMs)
      const resultadoTiempo = calcularEstadoPorTiempo(minutos)
      const estadoMarcado = resultadoTiempo.estado

      if (registroPrevio && (registroPrevio.estado === 'Presente' || registroPrevio.estado === 'Tardanza')) {
        // Ya había registrado asistencia previamente
        mostrarResultadoMarcacion({
          tipo: 'ya_registrado',
          nombreCompleto,
        })
      } else {
        // Registrar nueva asistencia en BD
        await api.asistencias.create({
          estudianteId: estId,
          fichaId: fichaId,
          fecha: props.fecha,
          estado: estadoMarcado,
          hora: horaStr,
          horasTardanza: resultadoTiempo.horasTardanza,
          tiempoTardanza: resultadoTiempo.tiempoTardanza,
          instructorId: props.instructor?.id || null,
        })

        asistenciasDia.value[estId] = {
          estado: estadoMarcado,
          hora: horaStr,
        }

        const datosNotificacion = {
          fichaId,
          estudianteId: estId,
          nombres: result.nombres,
          apellidos: result.apellidos,
          hora: horaStr,
          estado: estadoMarcado,
        }

        // Notificar en tiempo real al panel del docente vía WebSockets
        notificarMarcacionKiosco(datosNotificacion)
        emit('asistencia-marcada', datosNotificacion)

        mostrarResultadoMarcacion({
          tipo: 'exito',
          nombreCompleto,
        })
      }
    } else {
      // Huella no reconocida
      mostrarResultadoMarcacion({
        tipo: 'no_reconocida',
        nombreCompleto: '',
      })
    }
  } catch (err) {
    console.error('[Kiosco] Error al verificar huella:', err)
  } finally {
    procesandoHuella.value = false
  }
}

function mostrarResultadoMarcacion(resultado) {
  if (timerLimpiarMarcacion) clearTimeout(timerLimpiarMarcacion)
  ultimaMarcacion.value = resultado

  // Limpiar el mensaje de bienvenida después de 3.5 segundos para que quede listo para el siguiente alumno
  timerLimpiarMarcacion = setTimeout(() => {
    ultimaMarcacion.value = null
  }, 3500)
}

function togglePantallaCompleta() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => console.log(err))
    esPantallaCompleta.value = true
  } else {
    document.exitFullscreen().catch((err) => console.log(err))
    esPantallaCompleta.value = false
  }
}

const totalPresentes = computed(() => {
  return Object.values(asistenciasDia.value).filter(
    (a) => a.estado === 'Presente' || a.estado === 'Tardanza'
  ).length
})

const porcentajeAsistencia = computed(() => {
  const total = estudiantesFicha.value.length
  if (total === 0) return 0
  return Math.round((totalPresentes.value / total) * 100)
})
</script>

<template>
  <div class="kiosco-container" :class="{ 'modo-pantalla-completa': esPantallaCompleta }">
    <!-- BARRA SUPERIOR INSTITUCIONAL -->
    <header class="kiosco-header">
      <div class="kiosco-brand">
        <div class="sena-logo-badge">SENA</div>
        <div class="kiosco-brand-info">
          <span class="kiosco-badge-tag">SISTEMA BIOMÉTRICO INSTITUCIONAL</span>
          <h2 v-if="fichaActual">{{ fichaActual.nombrePrograma }}</h2>
          <h2 v-else>KIOSCO DE AULA — MODO ESPERA</h2>
          <div v-if="fichaActual" class="kiosco-meta-tags">
            <span class="meta-tag">Ficha: <strong>{{ fichaActual.codigoFicha }}</strong></span>
            <span class="meta-tag">Jornada: <strong>{{ fichaActual.jornada }}</strong></span>
            <span class="meta-tag">Aula: <strong>{{ fichaActual.aulaAsignada || 'Ambiente Asignado' }}</strong></span>
          </div>
          <div v-else class="kiosco-meta-tags">
            <span class="meta-tag">Estado: <strong>Esperando inicio de clase</strong></span>
            <span class="meta-tag">Modo: <strong>Receptor Autónomo</strong></span>
          </div>
        </div>
      </div>

      <!-- RELOJ EN VIVO Y CONTROLES -->
      <div class="kiosco-header-right">
        <div class="live-clock-card">
          <div class="live-clock-time">{{ horaActual }}</div>
          <div class="live-clock-date">{{ fecha }}</div>
        </div>

        <div class="kiosco-actions">
          <button class="btn-kiosco-tool" @click="togglePantallaCompleta" title="Pantalla Completa">
            {{ esPantallaCompleta ? '🗗 Salir' : '⛶ Pantalla Completa' }}
          </button>
          <button class="btn-kiosco-exit" @click="$emit('salir-kiosco')">
            ✕ {{ standalone ? 'Volver al Inicio' : 'Volver al Panel' }}
          </button>
        </div>
      </div>
    </header>

    <!-- ESTADO DE LA SESIÓN REMOTA (BANNER) -->
    <div class="kiosco-session-banner" :class="sesionActiva ? 'banner-active' : 'banner-waiting'">
      <div class="banner-status-indicator">
        <span class="status-dot" :class="sesionActiva ? 'dot-pulsing' : 'dot-idle'"></span>
        <span v-if="sesionActiva">
          🟢 <strong>CLASE EN CURSO (PASE DE LISTA ACTIVO)</strong> — Lector Biométrico Listo
        </span>
        <span v-else>
          🟡 <strong>SESIÓN EN ESPERA</strong> — El docente activará la toma de asistencia desde su dispositivo
        </span>
      </div>

      <div class="banner-reader-status">
        <span class="reader-icon">🔌</span>
        <span>{{ estadoLectorMsg }}</span>
      </div>
    </div>

    <!-- CUERPO PRINCIPAL -->
    <main class="kiosco-main-body">
      <!-- MODO 1: EN ESPERA AUTÓNOMA (Sin ficha activa) -->
      <section v-if="!fichaActual" class="kiosco-center-area">
        <div class="kiosco-standby-card">
          <div class="standby-pulse-beacon">
            <span class="standby-icon">📡</span>
          </div>
          <h1 class="standby-title">Computador del Aula Conectado</h1>
          <p class="standby-subtitle">
            El instructor activará la clase de forma remota desde su dispositivo móvil o panel web.
            Esta pantalla cargará automáticamente los estudiantes y activará el lector de huellas.
          </p>

          <div class="standby-status-pill-row">
            <div class="standby-pill" :class="lectorConectado ? 'pill-ok' : 'pill-warn'">
              <span>{{ lectorConectado ? '🟢 Lector DigitalPersona USB Listo' : '🟠 Conecte el Lector USB' }}</span>
            </div>
            <div class="standby-pill pill-ok">
              <span>📡 Conexión en Tiempo Real Activa</span>
            </div>
          </div>
        </div>
      </section>

      <!-- MODO 2: FICHA ACTIVA (Tomando asistencia) -->
      <template v-else>
        <!-- ÁREA CENTRAL DE BIOMETRÍA Y FEEDBACK -->
        <section class="kiosco-center-area">
          <!-- 1. FEEDBACK LIMPIO: SOLO MENSAJE DE BIENVENIDA -->
          <transition name="pop-card">
            <div v-if="ultimaMarcacion" class="kiosco-welcome-card" :class="`welcome-${ultimaMarcacion.tipo}`">
              <div class="welcome-icon-circle">
                <span v-if="ultimaMarcacion.tipo === 'exito'" class="icon-glyph">👋</span>
                <span v-else-if="ultimaMarcacion.tipo === 'ya_registrado'" class="icon-glyph">ℹ️</span>
                <span v-else class="icon-glyph">⚠️</span>
              </div>

              <div class="welcome-text-group">
                <h1 v-if="ultimaMarcacion.tipo === 'exito'" class="welcome-title">
                  ¡Bienvenido, {{ ultimaMarcacion.nombreCompleto }}!
                </h1>
                <h1 v-else-if="ultimaMarcacion.tipo === 'ya_registrado'" class="welcome-title">
                  Hola, {{ ultimaMarcacion.nombreCompleto }}
                </h1>
                <h1 v-else class="welcome-title">
                  Huella no reconocida
                </h1>

                <p class="welcome-subtitle">
                  <span v-if="ultimaMarcacion.tipo === 'exito'">✅ Asistencia registrada correctamente</span>
                  <span v-else-if="ultimaMarcacion.tipo === 'ya_registrado'">Tu asistencia ya fue registrada el día de hoy</span>
                  <span v-else>Coloque su dedo firmemente e intente de nuevo</span>
                </p>
              </div>
            </div>
          </transition>

          <!-- 2. SCANNER VISUAL EN ESPERA DE HUELLA -->
          <div v-if="!ultimaMarcacion" class="kiosco-scanner-card" :class="{ 'scanner-disabled': !sesionActiva }">
            <div class="scanner-glow-circle" :class="{ 'glow-active': sesionActiva && capturando, 'glow-processing': procesandoHuella }">
              <div class="scanner-finger-icon">
                {{ procesandoHuella ? '⏳' : '🖐️' }}
              </div>
            </div>

            <div class="scanner-instructions">
              <h2 v-if="procesandoHuella" class="instruction-title">Verificando identidad biométrica...</h2>
              <h2 v-else-if="sesionActiva && capturando" class="instruction-title">
                Coloque su dedo firmemente sobre el sensor
              </h2>
              <h2 v-else class="instruction-title text-muted">
                Pase de lista no iniciado
              </h2>

              <p class="instruction-subtitle">
                {{
                  sesionActiva
                    ? 'Mantenga el dedo apoyado en el lector hasta ver la bienvenida.'
                    : 'Esperando señal de inicio del docente para activar el lector USB.'
                }}
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.kiosco-container {
  min-height: 100vh;
  background: radial-gradient(circle at 50% 10%, #0f172a 0%, #020617 100%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

/* HEADER */
.kiosco-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 28px;
  background: rgba(15, 23, 42, 0.85);
  border-bottom: 1px solid rgba(51, 65, 85, 0.6);
  backdrop-filter: blur(12px);
}

.kiosco-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sena-logo-badge {
  background: #39a900;
  color: white;
  font-weight: 900;
  font-size: 18px;
  letter-spacing: 1px;
  padding: 10px 14px;
  border-radius: 10px;
  box-shadow: 0 0 20px rgba(57, 169, 0, 0.4);
}

.kiosco-badge-tag {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.kiosco-brand-info h2 {
  margin: 2px 0 6px 0;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
}

.kiosco-meta-tags {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.meta-tag strong {
  color: #e2e8f0;
}

/* HEADER DERECHA */
.kiosco-header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.live-clock-card {
  text-align: right;
  background: rgba(30, 41, 59, 0.6);
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(71, 85, 105, 0.5);
}

.live-clock-time {
  font-size: 22px;
  font-weight: 800;
  color: #38bdf8;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.live-clock-date {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
}

.kiosco-actions {
  display: flex;
  gap: 8px;
}

.btn-kiosco-tool {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-kiosco-tool:hover {
  background: #334155;
  color: white;
}

.btn-kiosco-exit {
  background: #881337;
  color: #fecdd3;
  border: 1px solid #9f1239;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-kiosco-exit:hover {
  background: #9f1239;
  color: white;
}

/* BANNER DE ESTADO */
.kiosco-session-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 28px;
  font-size: 13px;
}

.banner-active {
  background: linear-gradient(90deg, rgba(22, 101, 52, 0.3) 0%, rgba(15, 23, 42, 0.6) 100%);
  border-bottom: 1px solid rgba(34, 197, 94, 0.3);
  color: #86efac;
}

.banner-waiting {
  background: linear-gradient(90deg, rgba(161, 98, 7, 0.25) 0%, rgba(15, 23, 42, 0.6) 100%);
  border-bottom: 1px solid rgba(234, 179, 8, 0.3);
  color: #fde047;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}

.dot-pulsing {
  background: #22c55e;
  box-shadow: 0 0 12px #22c55e;
  animation: pulse 1.5s infinite;
}

.dot-idle {
  background: #eab308;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.banner-reader-status {
  color: #94a3b8;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* CUERPO PRINCIPAL */
.kiosco-main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px 28px;
}

.kiosco-center-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 380px;
}

/* STANDBY CARD */
.kiosco-standby-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: rgba(30, 41, 59, 0.45);
  border: 1.5px dashed rgba(56, 189, 248, 0.4);
  border-radius: 28px;
  padding: 56px 40px;
  max-width: 680px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.standby-pulse-beacon {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
  border: 2px solid #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: 0 0 35px rgba(56, 189, 248, 0.4);
  animation: glowPulse 2.5s infinite;
}

.standby-icon {
  font-size: 50px;
}

.standby-title {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 12px 0;
}

.standby-subtitle {
  font-size: 14px;
  color: #94a3b8;
  max-width: 500px;
  line-height: 1.6;
  margin: 0 0 28px 0;
}

.standby-status-pill-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.standby-pill {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.pill-warn {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fde047;
}

/* SCANNER CARD */
.kiosco-scanner-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: rgba(30, 41, 59, 0.4);
  border: 1.5px dashed rgba(71, 85, 105, 0.5);
  border-radius: 24px;
  padding: 48px 60px;
  max-width: 650px;
  width: 100%;
}

.scanner-glow-circle {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
  border: 3px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  transition: all 0.3s;
}

.glow-active {
  border-color: #39a900;
  box-shadow: 0 0 35px rgba(57, 169, 0, 0.45);
  animation: glowPulse 2s infinite;
}

.glow-processing {
  border-color: #38bdf8;
  box-shadow: 0 0 35px rgba(56, 189, 248, 0.5);
  animation: rotate 1s infinite linear;
}

@keyframes glowPulse {
  0% { box-shadow: 0 0 15px rgba(57, 169, 0, 0.3); }
  50% { box-shadow: 0 0 45px rgba(57, 169, 0, 0.6); }
  100% { box-shadow: 0 0 15px rgba(57, 169, 0, 0.3); }
}

.scanner-finger-icon {
  font-size: 58px;
}

.instruction-title {
  font-size: 26px;
  font-weight: 800;
  color: #f8fafc;
  margin: 0 0 10px 0;
}

.instruction-subtitle {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
  max-width: 480px;
}

.scanner-disabled {
  opacity: 0.6;
}

/* WELCOME CARD (LIMPIA Y ELEGANTE) */
.kiosco-welcome-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: #0f172a;
  border-radius: 28px;
  padding: 48px 56px;
  max-width: 620px;
  width: 100%;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
  border: 2px solid #334155;
  transition: all 0.3s ease;
}

.welcome-exito {
  border-color: #22c55e;
  background: linear-gradient(145deg, rgba(20, 83, 45, 0.55) 0%, #0f172a 100%);
  box-shadow: 0 0 60px rgba(34, 197, 94, 0.4);
}

.welcome-ya_registrado {
  border-color: #38bdf8;
  background: linear-gradient(145deg, rgba(12, 74, 110, 0.55) 0%, #0f172a 100%);
  box-shadow: 0 0 60px rgba(56, 189, 248, 0.4);
}

.welcome-no_reconocida {
  border-color: #f59e0b;
  background: linear-gradient(145deg, rgba(120, 53, 15, 0.55) 0%, #0f172a 100%);
  box-shadow: 0 0 60px rgba(245, 158, 11, 0.4);
}

.welcome-icon-circle {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border: 2px solid currentColor;
}

.welcome-exito .welcome-icon-circle {
  border-color: #22c55e;
}

.welcome-ya_registrado .welcome-icon-circle {
  border-color: #38bdf8;
}

.welcome-no_reconocida .welcome-icon-circle {
  border-color: #f59e0b;
}

.icon-glyph {
  font-size: 48px;
}

.welcome-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.welcome-title {
  font-size: 32px;
  font-weight: 900;
  color: #ffffff;
  margin: 0 0 10px 0;
  letter-spacing: -0.5px;
}

.welcome-subtitle {
  font-size: 16px;
  color: #cbd5e1;
  margin: 0;
  font-weight: 500;
}

/* Transiciones */
.pop-card-enter-active {
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-card-leave-active {
  animation: popOut 0.2s ease-in;
}

@keyframes popIn {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes popOut {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(0.85); opacity: 0; }
}
</style>
