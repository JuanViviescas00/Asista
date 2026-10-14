<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import FingerprintScan from '../components/FingerprintScan.vue'

const props = defineProps({
  status: { type: Object, required: true },
})

const emit = defineEmits(['abrir-login'])

const estado = ref('idle')
const resultado = ref(null)

const online = computed(() => props.status.online)
const listo = computed(() => props.status.listo)
const claseActiva = computed(() => props.status.claseActiva)
const dispositivoRegistrado = computed(() => !!props.status.dispositivoRegistrado)
const ultimoRechazo = computed(() => props.status.ultimoRechazo || null)
const pendientes = computed(() => props.status.pendientes || 0)
const lector = computed(() => props.status.lector || null)

// navigator.onLine solo indica que hay una interfaz de red activa, no internet real:
// puede dar falsos "en línea" (p. ej. red local sin salida a internet). Es una
// limitación aceptada para este indicador.
const enLineaInternet = ref(navigator.onLine)

function onInternetOnline() {
  enLineaInternet.value = true
}

function onInternetOffline() {
  enLineaInternet.value = false
}

const estadoConexion = computed(() => {
  if (listo.value) return { texto: 'En línea', clase: 'ok' }
  if (!enLineaInternet.value) {
    return {
      texto: 'Sin internet. Las asistencias se guardan en este equipo y se enviarán al reconectar.',
      clase: 'off',
    }
  }
  const r = ultimoRechazo.value
  if (r?.code === 'DEVICE_DISABLED') {
    return { texto: 'Este equipo fue deshabilitado por el administrador.', clase: 'off' }
  }
  if (r?.code === 'PENDING_APPROVAL') {
    return { texto: 'Equipo registrado. Esperando aprobación del administrador.', clase: 'warn' }
  }
  if (r?.code === 'INTERNAL_ERROR') {
    return {
      texto: 'El servidor tuvo un problema al verificar este equipo (puede ser la base de datos). Reintentando…',
      clase: 'warn',
    }
  }
  if (r) return { texto: r.message, clase: 'warn' }
  if (online.value) return { texto: 'Reintentando…', clase: 'warn' }
  return {
    texto: 'Sin conexión con el servidor. Reintentando… (puede tardar si estaba inactivo)',
    clase: 'off',
  }
})

const problemaLector = computed(() => {
  if (!lector.value) return null
  if (lector.value.estado === 'no-detectado') {
    return { texto: 'Lector de huellas no detectado. Revisa que esté conectado por USB.', clase: 'off' }
  }
  if (lector.value.estado === 'error') {
    return { texto: 'Error al iniciar el lector de huellas (driver o SDK). Reinstala Asista o revisa el driver.', clase: 'off' }
  }
  return null
})

const textoPendientes = computed(() => {
  const n = pendientes.value
  if (n <= 0) return null
  return n === 1 ? '1 asistencia pendiente por sincronizar' : `${n} asistencias pendientes por sincronizar`
})

const aviso = ref('')
let avisoTimer = null
let resultadoTimer = null

watch(
  () => props.status.avisoSesion,
  (val) => {
    if (!val) return
    aviso.value = val
    if (avisoTimer) clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => {
      aviso.value = ''
    }, 5000)
  },
  { immediate: true }
)

function onKeydown(e) {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    emit('abrir-login')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('online', onInternetOnline)
  window.addEventListener('offline', onInternetOffline)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('online', onInternetOnline)
  window.removeEventListener('offline', onInternetOffline)
  if (avisoTimer) clearTimeout(avisoTimer)
  if (resultadoTimer) clearTimeout(resultadoTimer)
})

async function leerHuella() {
  if (estado.value === 'leyendo') return
  estado.value = 'leyendo'
  resultado.value = null
  if (resultadoTimer) clearTimeout(resultadoTimer)

  try {
    const res = await window.huellero.capturarYVerificar()
    if (res.match) {
      if (res.duplicado) {
        resultado.value = { tipo: 'dup', texto: `${res.nombres} ${res.apellidos}` }
      } else {
        resultado.value = { tipo: 'ok', texto: `${res.nombres} ${res.apellidos}` }
      }
    } else {
      resultado.value = { tipo: 'error', texto: res.error || 'Huella no reconocida' }
    }
  } catch (err) {
    resultado.value = { tipo: 'error', texto: 'No se pudo procesar la huella' }
  } finally {
    estado.value = 'idle'
    // El módulo de escaneo vuelve solo a su estado de espera, listo para el siguiente aprendiz.
    resultadoTimer = setTimeout(() => {
      resultado.value = null
    }, 2600)
  }
}

function onLeerButton() {
  if (estado.value === 'leyendo') {
    window.huellero.cancelarCaptura()
  } else {
    leerHuella()
  }
}

const scanState = computed(() => {
  if (estado.value === 'leyendo') return 'scanning'
  if (resultado.value) return resultado.value.tipo
  return 'idle'
})
</script>

<template>
  <div class="kiosko">
    <Transition name="aviso-drop">
      <div v-if="aviso" class="aviso-sesion">{{ aviso }}</div>
    </Transition>

    <header class="hud">
      <span class="hud-item" :class="estadoConexion.clase">
        <AppIcon :name="listo ? 'wifi' : 'wifi-off'" :size="16" />
        {{ estadoConexion.texto }}
      </span>

      <Transition name="hud-in">
        <span v-if="claseActiva" class="hud-item ok">
          <AppIcon name="shield-check" :size="16" />
          Ficha {{ claseActiva.codigoFicha || claseActiva.fichaId }}
        </span>
      </Transition>

      <span v-if="problemaLector" class="hud-item" :class="problemaLector.clase">
        <AppIcon name="alert-triangle" :size="16" />
        {{ problemaLector.texto }}
      </span>

      <span v-if="textoPendientes" class="hud-item warn">
        <AppIcon name="clock" :size="16" />
        {{ textoPendientes }}
      </span>

      <span v-if="!dispositivoRegistrado" class="hud-item pending">
        <AppIcon name="clock" :size="16" />
        Equipo no identificado. Reintentando…
      </span>
    </header>

    <main class="lector">
      <FingerprintScan :state="scanState" :size="146" />

      <h1>{{ claseActiva ? 'Coloca tu dedo para marcar asistencia' : 'No hay clase activa' }}</h1>
      <p v-if="claseActiva" class="hint">Apoya el dedo firmemente en el lector DigitalPersona</p>

      <button class="primary leer" :disabled="!claseActiva" @click="onLeerButton">
        {{ estado === 'leyendo' ? 'Detener' : 'Leer huella' }}
      </button>

      <Transition name="resultado-in">
        <div v-if="resultado" class="resultado" :class="resultado.tipo">
          <template v-if="resultado.tipo === 'ok'">
            <strong>Asistencia registrada</strong>
            <span>{{ resultado.texto }}</span>
          </template>
          <template v-else-if="resultado.tipo === 'dup'">
            <strong>Ya registraste tu asistencia</strong>
            <span>{{ resultado.texto }}</span>
          </template>
          <template v-else>
            <strong>No se pudo registrar</strong>
            <span>{{ resultado.texto }}</span>
          </template>
        </div>
      </Transition>
    </main>

    <button
      class="ghost acceso"
      title="Acceso docente"
      aria-label="Configuración"
      @click="emit('abrir-login')"
    >
      <AppIcon name="settings" :size="28" />
    </button>
  </div>
</template>

<style scoped>
.kiosko {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.hud {
  display: flex;
  gap: 10px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
}

.hud-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px 7px 12px;
  border-radius: 999px;
  font-family: var(--font-display);
}

.hud-item.ok {
  background: var(--accent-dim);
  color: var(--accent);
}

.hud-item.off {
  background: var(--danger-dim);
  color: var(--danger);
}

.hud-item.warn {
  background: var(--warn-dim);
  color: var(--warn);
}

.hud-item.pending {
  background: var(--bg-elev-2);
  color: var(--muted);
}

.lector {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: center;
  padding: 0 24px;
}

h1 {
  margin: 0;
  font-size: 25px;
  font-weight: 600;
}

.hint {
  margin: -6px 0 6px;
  color: var(--muted);
  font-size: 14px;
}

.leer {
  min-width: 210px;
  padding: 16px 32px;
  font-size: 16px;
}

.resultado {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
  padding: 12px 22px;
  border-radius: 12px;
  font-size: 15px;
}

.resultado.ok {
  background: var(--accent-dim);
  color: var(--accent);
}

.resultado.dup {
  background: var(--warn-dim);
  color: var(--warn);
}

.resultado.error {
  background: var(--danger-dim);
  color: var(--danger);
}

.resultado-in-enter-active {
  transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out);
}

.resultado-in-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.acceso {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 10px;
  color: #86efac;
  opacity: 0.9;
  transition: color 0.18s var(--ease-out), background-color 0.18s var(--ease-out);
}

.acceso :deep(svg) {
  filter: drop-shadow(0 0 2px rgba(134, 239, 172, 0.35));
  transition: filter 0.18s var(--ease-out);
}

.acceso:hover:not(:disabled) {
  color: #ffffff;
  background: var(--bg-elev-2);
  opacity: 1;
}

.acceso:hover:not(:disabled) :deep(svg) {
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.7));
}

.acceso:focus-visible {
  color: #ffffff;
  background: var(--bg-elev-2);
  opacity: 1;
}

.acceso:focus-visible :deep(svg) {
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.7));
}

.aviso-sesion {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--warn-dim);
  color: var(--warn);
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  z-index: 60;
  white-space: nowrap;
}

.aviso-drop-enter-active,
.aviso-drop-leave-active {
  transition: opacity 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.aviso-drop-enter-from,
.aviso-drop-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

.hud-in-enter-active {
  transition: opacity 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.hud-in-enter-from {
  opacity: 0;
  transform: scale(0.9);
}
</style>