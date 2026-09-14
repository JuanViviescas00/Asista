<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import FingerprintScan from '../components/FingerprintScan.vue'

const props = defineProps({
  claseActiva: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const DEDOS = [
  'Pulgar derecho',
  'Índice derecho',
  'Medio derecho',
  'Anular derecho',
  'Meñique derecho',
  'Pulgar izquierdo',
  'Índice izquierdo',
  'Medio izquierdo',
  'Anular izquierdo',
  'Meñique izquierdo',
]

const ficha = ref(null)
const fichasDisponibles = ref([])
const estudiantes = ref([])
const cargando = ref(true)
const cargandoEstudiantes = ref(false)
const errorInicial = ref('')

const busqueda = ref('')
const seleccionadoId = ref(null)
const dedo = ref('')
const estadoCaptura = ref('idle')
const mensajeCaptura = ref('')

const hayClaseActiva = computed(() => !!props.claseActiva)

const estudiantesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return estudiantes.value
  return estudiantes.value.filter((e) =>
    `${e.nombres} ${e.apellidos} ${e.numeroDocumento}`.toLowerCase().includes(q)
  )
})

const seleccionado = computed(
  () => estudiantes.value.find((e) => e._id === seleccionadoId.value) || null
)

const captureScanState = computed(() => {
  if (estadoCaptura.value === 'capturando') return 'scanning'
  if (estadoCaptura.value === 'ok') return 'ok'
  if (estadoCaptura.value === 'error') return 'error'
  return 'idle'
})

let offProgreso = null

onMounted(async () => {
  offProgreso = window.huellero.onEnrolarProgreso((p) => {
    mensajeCaptura.value = p.mensaje || ''
    if (p.fase === 'completado') {
      estadoCaptura.value = 'ok'
    } else if (p.fase === 'cancelado') {
      estadoCaptura.value = 'idle'
    } else {
      estadoCaptura.value = 'capturando'
    }
  })

  const resFichas = await window.huellero.getFichasLider()
  if (!resFichas.ok) {
    errorInicial.value = resFichas.error
    cargando.value = false
    return
  }

  fichasDisponibles.value = resFichas.fichas
  cargando.value = false

  // Si solo lidera una ficha, entra directo — sin fricción extra.
  if (resFichas.fichas.length === 1) {
    await elegirFicha(resFichas.fichas[0])
  }
})

async function elegirFicha(f) {
  ficha.value = f
  errorInicial.value = ''
  cargandoEstudiantes.value = true

  const resEstudiantes = await window.huellero.getEstudiantesFicha(f._id)
  if (!resEstudiantes.ok) {
    errorInicial.value = resEstudiantes.error
    cargandoEstudiantes.value = false
    return
  }

  estudiantes.value = resEstudiantes.estudiantes
  cargandoEstudiantes.value = false
}

function cambiarFicha() {
  ficha.value = null
  estudiantes.value = []
  seleccionadoId.value = null
  errorInicial.value = ''
}

onUnmounted(() => {
  if (offProgreso) offProgreso()
})

function seleccionar(id) {
  seleccionadoId.value = id
  estadoCaptura.value = 'idle'
  mensajeCaptura.value = ''
}

function cancelar() {
  window.huellero.cancelarEnrolamiento()
}

function cerrar() {
  window.huellero.cancelarEnrolamiento()
  emit('close')
}

async function iniciarCaptura() {
  if (!seleccionado.value) return
  if (!dedo.value) {
    estadoCaptura.value = 'error'
    mensajeCaptura.value = 'Elige el dedo a enrolar'
    return
  }

  estadoCaptura.value = 'capturando'
  mensajeCaptura.value = ''

  const res = await window.huellero.enrolarEstudiante({
    estudianteId: seleccionado.value._id,
    fichaId: ficha.value._id,
    dedo: dedo.value,
    nombre: `${seleccionado.value.nombres} ${seleccionado.value.apellidos}`.trim(),
  })

  if (res.ok) {
    estadoCaptura.value = 'ok'
    mensajeCaptura.value = 'Huella registrada correctamente'
  } else {
    estadoCaptura.value = 'error'
    mensajeCaptura.value = res.error || 'No se pudo registrar la huella'
  }
}
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <header>
        <div class="titulo">
          <AppIcon name="fingerprint" :size="19" />
          <h2>Registrar huella</h2>
        </div>
        <button class="ghost cerrar" @click="cerrar">
          <AppIcon name="x" :size="18" />
        </button>
      </header>

      <div v-if="cargando" class="cuerpo centrado">
        <AppIcon name="loader" :size="22" class="spin" />
        <p class="hint">Cargando tus fichas…</p>
      </div>

      <div v-else-if="errorInicial" class="cuerpo centrado">
        <AppIcon name="alert-triangle" :size="22" />
        <p class="error">{{ errorInicial }}</p>
        <button v-if="fichasDisponibles.length > 1" class="ghost" @click="cambiarFicha">
          Elegir otra ficha
        </button>
      </div>

      <!-- Catálogo: el líder tiene más de una ficha, debe elegir en cuál enrolar -->
      <div v-else-if="!ficha" class="cuerpo">
        <p class="hint">Eres líder de varias fichas. Elige en cuál quieres registrar huellas:</p>
        <ul class="lista lista-fichas">
          <li
            v-for="f in fichasDisponibles"
            :key="f._id"
            class="item-fila"
            @click="elegirFicha(f)"
          >
            <div>
              <strong>{{ f.codigoFicha }}</strong>
              <span class="hint">{{ f.nombrePrograma }}</span>
            </div>
          </li>
        </ul>
      </div>

      <div v-else-if="cargandoEstudiantes" class="cuerpo centrado">
        <AppIcon name="loader" :size="22" class="spin" />
        <p class="hint">Cargando estudiantes de {{ ficha.codigoFicha }}…</p>
      </div>

      <template v-else>
        <Transition name="aviso-in">
          <div v-if="hayClaseActiva" class="aviso">
            <AppIcon name="alert-triangle" :size="16" />
            Hay una clase activa en este dispositivo. Finalízala antes de enrolar huellas.
          </div>
        </Transition>

        <div class="cuerpo">
          <div class="ficha-info">
            <div>
              <span class="hint">Ficha</span>
              <strong>{{ ficha.codigoFicha }} · {{ ficha.nombrePrograma }}</strong>
            </div>
            <button v-if="fichasDisponibles.length > 1" class="ghost" @click="cambiarFicha">
              Cambiar ficha
            </button>
          </div>

          <div class="busqueda-wrap">
            <AppIcon name="search" :size="16" class="busqueda-icon" />
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o documento"
              class="busqueda"
            />
          </div>

          <ul class="lista">
            <li v-if="estudiantesFiltrados.length === 0" class="hint vacio">
              Sin resultados
            </li>
            <li
              v-for="(e, i) in estudiantesFiltrados"
              :key="e._id"
              :class="{ activo: e._id === seleccionadoId }"
              :style="{ animationDelay: Math.min(i, 8) * 22 + 'ms' }"
              class="item-fila"
              @click="seleccionar(e._id)"
            >
              <div>
                <strong>{{ e.nombres }} {{ e.apellidos }}</strong>
                <span class="hint">{{ e.tipoDocumento }} {{ e.numeroDocumento }}</span>
              </div>
              <span class="badge" :class="e.huellaEnrolada ? 'ok' : 'off'">
                <AppIcon :name="e.huellaEnrolada ? 'check-circle' : 'x-circle'" :size="13" />
                {{ e.huellaEnrolada ? (e.dedoEnrolado || 'Con huella') : 'Sin huella' }}
              </span>
            </li>
          </ul>

          <Transition name="panel-in">
            <div v-if="seleccionado" class="panel">
              <div class="panel-titulo">
                <strong>{{ seleccionado.nombres }} {{ seleccionado.apellidos }}</strong>
                <span class="hint">{{ seleccionado.numeroDocumento }}</span>
              </div>

              <label class="dedo">
                Dedo a enrolar
                <select v-model="dedo">
                  <option value="" disabled>Selecciona un dedo</option>
                  <option v-for="d in DEDOS" :key="d" :value="d">{{ d }}</option>
                </select>
              </label>

              <div class="scan-wrap">
                <FingerprintScan :state="captureScanState" :size="88" />
              </div>

              <Transition name="mensaje-in">
                <p v-if="mensajeCaptura" class="mensaje" :class="estadoCaptura">
                  <AppIcon
                    v-if="estadoCaptura === 'ok'"
                    name="check-circle"
                    :size="15"
                  />
                  <AppIcon
                    v-else-if="estadoCaptura === 'error'"
                    name="alert-triangle"
                    :size="15"
                  />
                  {{ mensajeCaptura }}
                </p>
              </Transition>

              <button
                class="primary"
                :disabled="estadoCaptura === 'capturando' || hayClaseActiva"
                @click="iniciarCaptura"
              >
                {{ estadoCaptura === 'capturando' ? 'Capturando…' : 'Iniciar captura' }}
              </button>

              <button v-if="estadoCaptura === 'capturando'" class="ghost" @click="cancelar">
                Cancelar
              </button>
            </div>
          </Transition>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 6, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  width: min(560px, 92vw);
  max-height: min(88vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--accent);
}

h2 {
  margin: 0;
  font-size: 17px;
  color: var(--text);
}

.cerrar {
  padding: 8px;
  border-radius: 9px;
}

.cerrar:hover {
  background: var(--bg-elev-2);
  color: var(--text);
}

.cuerpo {
  padding: clamp(16px, 3vh, 22px);
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 2vh, 16px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.cuerpo::-webkit-scrollbar,
.lista::-webkit-scrollbar {
  width: 7px;
}

.cuerpo::-webkit-scrollbar-track,
.lista::-webkit-scrollbar-track {
  background: transparent;
}

.cuerpo::-webkit-scrollbar-thumb,
.lista::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 8px;
}

.cuerpo::-webkit-scrollbar-thumb:hover,
.lista::-webkit-scrollbar-thumb:hover {
  background: var(--muted-dim);
}

.centrado {
  align-items: center;
  text-align: center;
  padding: 44px 20px;
  color: var(--muted);
}

.aviso {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--warn-dim);
  color: var(--warn);
  padding: 12px 20px;
  font-size: 13.5px;
}

.aviso-in-enter-active {
  transition: opacity 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.aviso-in-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.ficha-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ficha-info > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lista-fichas .item-fila > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.busqueda-wrap {
  position: relative;
}

.busqueda-icon {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
}

.busqueda {
  padding-left: 38px;
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: min(220px, 24vh);
  flex-shrink: 0;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.item-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--line);
  animation: item-in 0.22s var(--ease-out) backwards;
  transition: background-color 0.12s var(--ease-out);
}

.item-fila:hover {
  background: var(--bg-elev-2);
}

.item-fila:last-child {
  border-bottom: none;
}

.item-fila.activo {
  background: var(--accent-dim);
}

@keyframes item-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.lista li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.vacio {
  padding: 18px;
  text-align: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge.ok {
  background: var(--accent-dim);
  color: var(--accent);
}

.badge.off {
  background: var(--bg-elev-2);
  color: var(--muted);
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-shrink: 0;
  gap: clamp(10px, 1.6vh, 14px);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: clamp(14px, 2.4vh, 20px);
}

.panel-in-enter-active {
  transition: opacity 0.24s var(--ease-out), transform 0.24s var(--ease-out);
}

.panel-in-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.panel-titulo {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dedo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--muted);
}

.scan-wrap {
  display: flex;
  justify-content: center;
  padding: clamp(6px, 1.4vh, 14px) 0;
}

.mensaje {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0;
  font-size: 14px;
  text-align: center;
}

.mensaje.ok {
  color: var(--accent);
}

.mensaje.error {
  color: var(--danger);
}

.mensaje.capturando {
  color: var(--text);
  font-size: 15.5px;
  font-weight: 600;
}

.mensaje-in-enter-active {
  transition: opacity 0.18s var(--ease-out);
}

.mensaje-in-enter-from {
  opacity: 0;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}

.error {
  color: var(--danger);
  font-size: 14px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>