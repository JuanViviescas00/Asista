<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import api from '../services/api.js'
import { socket } from '../services/socket.js'

const dispositivos = ref([])
const fichas = ref([])
const selecciones = reactive({})
const loading = ref(false)
const savingId = ref(null)
const toast = ref({ show: false, message: '', type: '' })

// Estado online por deviceId (UUID), alimentado por DEVICE_CONNECTED/DISCONNECTED.
const onlineMap = reactive({})

const pendientes = computed(() =>
  dispositivos.value.filter((d) => d.activo === false && !d.aprobadoEn)
)
const activos = computed(() =>
  dispositivos.value.filter((d) => d.activo === true)
)
const deshabilitados = computed(() =>
  dispositivos.value.filter((d) => d.activo === false && !!d.aprobadoEn)
)

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadDispositivos(), loadFichas()])
  } finally {
    loading.value = false
  }

  socket.on('connect', unirseAdmin)
  if (socket.connected) unirseAdmin()
  socket.on('DEVICES_STATUS', onDevicesStatus)
  socket.on('DEVICE_CONNECTED', onDeviceConnected)
  socket.on('DEVICE_DISCONNECTED', onDeviceDisconnected)
})

onUnmounted(() => {
  socket.off('connect', unirseAdmin)
  socket.off('DEVICES_STATUS', onDevicesStatus)
  socket.off('DEVICE_CONNECTED', onDeviceConnected)
  socket.off('DEVICE_DISCONNECTED', onDeviceDisconnected)
})

function esAdmin() {
  try {
    const raw = sessionStorage.getItem('user_data')
    return raw ? JSON.parse(raw)?.rol === 'Administrador' : false
  } catch {
    return false
  }
}

function unirseAdmin() {
  if (esAdmin()) socket.emit('unirse_admin')
}

function onDevicesStatus(data) {
  const ids = Array.isArray(data?.deviceIds) ? data.deviceIds : []
  for (const id of ids) onlineMap[id] = true
}

function onDeviceConnected(data) {
  if (data?.deviceId) onlineMap[data.deviceId] = true
}

function onDeviceDisconnected(data) {
  if (data?.deviceId) onlineMap[data.deviceId] = false
}

async function loadDispositivos() {
  const data = await api.dispositivos.listar()
  dispositivos.value = data
  for (const d of dispositivos.value) {
    selecciones[d._id] = (d.fichas || []).map(f => f._id || f)
  }
}

async function loadFichas() {
  fichas.value = await api.fichas.getAll()
}

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function deviceLabel(d) {
  return d.nombre || d.deviceId || d._id
}

function toggleFicha(deviceId, fichaId) {
  const arr = selecciones[deviceId]
  if (!Array.isArray(arr)) return
  const i = arr.indexOf(fichaId)
  if (i > -1) arr.splice(i, 1)
  else arr.push(fichaId)
}

function getDispositivoDeFicha(fichaId) {
  return dispositivos.value.find(d => (d.fichas || []).some(f => String(f._id || f) === String(fichaId))) || null
}

async function guardar(device) {
  savingId.value = device._id
  try {
    await api.dispositivos.asociarFichas(device._id, selecciones[device._id] || [])
    showToast('Asociación guardada correctamente')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo guardar'), 'error')
  } finally {
    savingId.value = null
  }
}

async function resetFingerprint(device) {
  if (!confirm(`¿Resetear la identidad de hardware de "${deviceLabel(device)}"?\n\n` +
    'Se eliminará el fingerprint guardado y el dispositivo lo re-adoptará en su próxima conexión. ' +
    'Úsalo solo si reinstalaste Windows o reemplazaste el disco de ese PC.')) {
    return
  }
  savingId.value = device._id
  try {
    await api.dispositivos.resetFingerprint(device._id)
    showToast('Identidad de hardware reseteada. Re-adoptará al reconectar.')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo resetear'), 'error')
  } finally {
    savingId.value = null
  }
}

async function aprobarDispositivo(device) {
  savingId.value = device._id
  try {
    await api.dispositivos.aprobar(device._id)
    showToast('Dispositivo aprobado')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo aprobar'), 'error')
  } finally {
    savingId.value = null
  }
}

async function deshabilitarDispositivo(device) {
  if (!confirm(`¿Deshabilitar "${deviceLabel(device)}"?\n\nEl dispositivo perderá el acceso de inmediato si está conectado.`)) {
    return
  }
  savingId.value = device._id
  try {
    await api.dispositivos.deshabilitar(device._id)
    showToast('Dispositivo deshabilitado')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo deshabilitar'), 'error')
  } finally {
    savingId.value = null
  }
}

async function reactivarDispositivo(device) {
  savingId.value = device._id
  try {
    await api.dispositivos.aprobar(device._id)
    showToast('Dispositivo reactivado')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo reactivar'), 'error')
  } finally {
    savingId.value = null
  }
}

async function rechazarDispositivo(device) {
  if (!confirm(`¿Rechazar y eliminar "${deviceLabel(device)}"?\n\nEsta acción es permanente y borra el dispositivo.`)) {
    return
  }
  savingId.value = device._id
  try {
    await api.dispositivos.eliminar(device._id)
    showToast('Dispositivo rechazado y eliminado')
    await loadDispositivos()
  } catch (e) {
    showToast('Error: ' + (e.message || 'No se pudo rechazar'), 'error')
  } finally {
    savingId.value = null
  }
}

function formatFecha(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="page-header">
    <h1>Dispositivos / Huelleros</h1>
    <p>Asocia fichas a cada lector físico. Una ficha solo puede estar asociada a un dispositivo a la vez.</p>
  </div>

  <div v-if="loading" class="empty-state"><p>Cargando dispositivos…</p></div>

  <div v-else-if="dispositivos.length === 0" class="empty-state">
    <p>No hay dispositivos registrados todavía. La app del huellero se registra automáticamente al iniciar.</p>
  </div>

  <div v-else>
    <!-- Pendientes de aprobación -->
    <div v-if="pendientes.length > 0" class="pendientes-section">
      <h2 class="pendientes-title">⏳ Pendientes de aprobación</h2>
      <div v-for="d in pendientes" :key="d._id" class="card card-pendiente">
        <div class="card-header">
          <div>
            <h3>{{ d.hostname || deviceLabel(d) }}</h3>
            <span class="device-id">{{ d.deviceId }}</span>
            <span class="muted">Registrado: {{ formatFecha(d.createdAt) }}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-success btn-sm" :disabled="savingId === d._id" @click="aprobarDispositivo(d)">
              ✅ Aprobar
            </button>
            <button class="btn btn-danger btn-sm" :disabled="savingId === d._id" @click="rechazarDispositivo(d)">
              ❌ Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="dispositivos-list">
      <div v-for="d in activos" :key="d._id" class="card">
        <div class="card-header">
          <div>
            <h3>{{ deviceLabel(d) }}</h3>
            <span class="device-id">{{ d.nombre ? d.deviceId : '' }}</span>
            <span v-if="d.hostname" class="muted">{{ d.hostname }}</span>
            <span class="badge" :class="d.activo ? 'badge-success' : 'badge-danger'">
              {{ d.activo ? 'Activo' : 'Inactivo' }}
            </span>
            <span class="badge" :class="onlineMap[d.deviceId] ? 'badge-online' : 'badge-offline'">
              {{ onlineMap[d.deviceId] ? '● En línea' : '○ Desconectado' }}
            </span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary btn-sm" :disabled="savingId === d._id" @click="guardar(d)">
              {{ savingId === d._id ? 'Guardando…' : '💾 Guardar' }}
            </button>
            <button class="btn btn-sm btn-reset" :disabled="savingId === d._id" @click="resetFingerprint(d)">
              🔄 Resetear identidad de hardware
            </button>
            <button class="btn btn-danger btn-sm" :disabled="savingId === d._id" @click="deshabilitarDispositivo(d)">
              🚫 Deshabilitar
            </button>
          </div>
        </div>

      <div class="fichas-asociadas">
        <strong>Fichas asociadas:</strong>
        <template v-if="(d.fichas || []).length === 0">
          <span class="muted">Ninguna</span>
        </template>
        <span v-for="f in d.fichas" :key="f._id" class="badge badge-ficha">
          {{ f.codigoFicha }} · {{ f.nombrePrograma }}
        </span>
      </div>

      <div class="selector-label">Selecciona las fichas que debe atender este dispositivo:</div>
      <div class="dispositivo-fichas-grid">
        <label v-for="f in fichas" :key="f._id" class="dispositivo-ficha-item">
          <input
            type="checkbox"
            :checked="selecciones[d._id].includes(f._id)"
            @change="toggleFicha(d._id, f._id)"
          />
          <span>
            {{ f.codigoFicha }} · {{ f.nombrePrograma }}
            <small
              v-if="getDispositivoDeFicha(f._id) && getDispositivoDeFicha(f._id)._id !== d._id"
              class="move-hint"
              :class="{ 'move-active': selecciones[d._id].includes(f._id) }"
            >
              {{ selecciones[d._id].includes(f._id) ? '⚠️ se moverá desde' : 'en' }} {{ deviceLabel(getDispositivoDeFicha(f._id)) }}
            </small>
          </span>
        </label>
      </div>
    </div>
    </div>

    <!-- Deshabilitados (aprobados antes, luego inactivos) -->
    <div v-if="deshabilitados.length > 0" class="pendientes-section">
      <h2 class="deshabilitados-title">Deshabilitados</h2>
      <div v-for="d in deshabilitados" :key="d._id" class="card card-deshabilitado">
        <div class="card-header">
          <div>
            <h3>{{ d.hostname || deviceLabel(d) }}</h3>
            <span class="device-id">{{ d.deviceId }}</span>
            <span class="badge badge-danger">Inactivo</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-success btn-sm" :disabled="savingId === d._id" @click="reactivarDispositivo(d)">
              ✅ Reactivar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
</template>

<style scoped>
.pendientes-section {
  margin-bottom: 24px;
}

.pendientes-title {
  font-size: 16px;
  font-weight: 700;
  color: #b45309;
  margin-bottom: 12px;
}

.card-pendiente {
  border-left: 4px solid #f59e0b;
}

.deshabilitados-title {
  font-size: 16px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 12px;
}

.card-deshabilitado {
  opacity: 0.7;
  border-left: 4px solid #64748b;
}

.dispositivos-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.btn-reset {
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.device-id {
  display: inline-block;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--mono);
  margin-right: 8px;
}

.fichas-asociadas {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 13px;
}

.muted {
  color: var(--text-secondary);
}

.selector-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.dispositivo-fichas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}

.dispositivo-ficha-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.dispositivo-ficha-item:hover {
  background: var(--bg);
}

.dispositivo-ficha-item input {
  margin-top: 3px;
}

.move-hint {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
}

.move-hint.move-active {
  color: #b45309;
  font-weight: 600;
}

.badge-online {
  background: #dcfce7;
  color: #15803d;
}

.badge-offline {
  background: #f3f4f6;
  color: #6b7280;
}
</style>
