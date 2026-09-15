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
const claseActiva = computed(() => props.status.claseActiva)
const dispositivoRegistrado = computed(() => !!props.status.dispositivoRegistrado)
const ultimoRechazo = computed(() => props.status.ultimoRechazo || null)

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

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
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
      <span class="hud-item" :class="online ? 'ok' : ultimoRechazo ? 'warn' : 'off'">
        <AppIcon :name="online ? 'wifi' : 'wifi-off'" :size="16" />
        {{ online ? 'En línea' : ultimoRechazo ? ultimoRechazo.message : 'Sin conexión' }}
      </span>

      <Transition name="hud-in">
        <span v-if="claseActiva" class="hud-item ok">
          <AppIcon name="shield-check" :size="16" />
          Ficha {{ claseActiva.codigoFicha || claseActiva.fichaId }}
        </span>
      </Transition>

      <span v-if="!dispositivoRegistrado" class="hud-item pending">
        <AppIcon name="clock" :size="16" />
        Equipo no identificado. Reintentando…
      </span>
    </header>

    <main class="lector">
      <FingerprintScan :state="scanState" :size="146" />

      <h1>{{ claseActiva ? 'Coloca tu dedo para marcar asistencia' : 'No hay clase activa' }}</h1>
      <p v-if="claseActiva" class="hint">Apoya el dedo firmemente en el lector DigitalPersona</p>

      <button class="primary leer" :disabled="estado === 'leyendo' || !claseActiva" @click="leerHuella">
        {{ estado === 'leyendo' ? 'Leyendo…' : 'Leer huella' }}
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

    <button class="ghost acceso" title="Acceso docente" @click="emit('abrir-login')">
      <AppIcon name="settings" :size="18" />
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
  padding: 10px;
  border-radius: 10px;
  opacity: 0.35;
}

.acceso:hover {
  opacity: 1;
  background: var(--bg-elev-2);
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