<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const showRechazarModal = ref(false)
const rechazarTarget = ref(null)
const rechazarMotivo = ref('')
const filtroEstado = ref('Todos')
const filtroFichaExcusa = ref(null)
const loading = ref(false)

const HORAS_POR_DIA = 6

const excusaForm = reactive({
  estudianteId: null, fechaInasistencia: '', tipoExcusa: 'Medica',
  adjuntoNombre: '', adjuntoData: null, horasDescontar: HORAS_POR_DIA,
})

const fichasList = ref([])
const todosEstudiantes = ref([])
const excusas = ref([])

onMounted(async () => {
  await Promise.all([loadExcusas(), loadEstudiantes(), loadFichas()])
})

async function loadExcusas() {
  try { excusas.value = await api.excusas.getAll() } catch (e) {}
}

async function loadEstudiantes() {
  try { todosEstudiantes.value = await api.estudiantes.getAll() } catch (e) {}
}

async function loadFichas() {
  try { fichasList.value = await api.fichas.getAll() } catch (e) {}
}

const excusasFiltradas = computed(() => {
  let lista = excusas.value
  if (filtroEstado.value !== 'Todos') lista = lista.filter(e => e.estado === filtroEstado.value)
  if (filtroFichaExcusa.value) lista = lista.filter(e => e.fichaId === filtroFichaExcusa.value)
  return lista.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

function getEstudianteById(id) { return todosEstudiantes.value.find(e => e._id === id) }
function getFichaById(id) { return fichasList.value.find(f => f._id === id) }

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openCreate() {
  Object.assign(excusaForm, {
    estudianteId: null, fechaInasistencia: '', tipoExcusa: 'Medica',
    adjuntoNombre: '', adjuntoData: null, horasDescontar: HORAS_POR_DIA,
  })
  showModal.value = true
}

function closeModal() { showModal.value = false }

function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  excusaForm.adjuntoNombre = file.name
  if (file.size > 2 * 1024 * 1024) {
    excusaForm.adjuntoData = null
    excusaForm.adjuntoNombre += ' (archivo grande - solo referencia)'
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => { excusaForm.adjuntoData = e.target.result }
  reader.readAsDataURL(file)
}

async function guardarExcusa() {
  if (!excusaForm.estudianteId || !excusaForm.fechaInasistencia || !excusaForm.tipoExcusa) {
    showToastFn('Completa todos los campos obligatorios', 'error')
    return
  }
  loading.value = true
  try {
    const est = getEstudianteById(excusaForm.estudianteId)
    await api.excusas.create({
      estudianteId: excusaForm.estudianteId,
      fichaId: est ? est.fichaId : null,
      fechaInasistencia: excusaForm.fechaInasistencia,
      tipoExcusa: excusaForm.tipoExcusa,
      adjuntoNombre: excusaForm.adjuntoNombre,
      adjuntoData: excusaForm.adjuntoData,
      horasDescontar: excusaForm.horasDescontar,
    })
    await loadExcusas()
    closeModal()
    showToastFn('Excusa registrada correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function aprobarExcusa(excusa) {
  try {
    await api.excusas.aprobar(excusa._id)
    await loadExcusas()
    showToastFn(`Excusa aprobada. ${excusa.horasDescontar} horas descontadas del contador de fallas.`)
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function abrirRechazar(excusa) {
  rechazarTarget.value = excusa
  rechazarMotivo.value = ''
  showRechazarModal.value = true
}

async function confirmarRechazo() {
  if (!rechazarMotivo.value.trim()) {
    showToastFn('Ingresa un motivo de rechazo', 'error')
    return
  }
  try {
    await api.excusas.rechazar(rechazarTarget.value._id, rechazarMotivo.value.trim())
    await loadExcusas()
    showRechazarModal.value = false
    showToastFn('Excusa rechazada')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function tipoBadge(tipo) {
  if (tipo === 'Medica') return 'badge-primary'
  if (tipo === 'Personal') return 'badge-warning'
  return 'badge-ficha'
}

function estadoBadge(estado) {
  if (estado === 'Aprobada') return 'badge-success'
  if (estado === 'Rechazada') return 'badge-danger'
  return 'badge-neutral'
}
</script>

<template>
  <div class="page-header">
    <h1>Excusas</h1>
    <p>Gestiona y aprueba excusas medicas, personales e institucionales con recalculo automatico de horas</p>
  </div>

  <div class="card">
    <div class="card-header">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h3>Listado de Excusas</h3>
        <select v-model="filtroEstado" class="filtro-select">
          <option value="Todos">Todas</option><option value="Pendiente">Pendientes</option><option value="Aprobada">Aprobadas</option><option value="Rechazada">Rechazadas</option>
        </select>
        <select v-model="filtroFichaExcusa" class="filtro-select">
          <option :value="null">Todas las fichas</option>
          <option v-for="f in fichasList" :key="f._id" :value="f._id">{{ f.codigoFicha }}</option>
        </select>
      </div>
      <button class="btn btn-primary" @click="openCreate">+ Registrar Excusa</button>
    </div>

    <div v-if="excusasFiltradas.length === 0" class="empty-state">
      <p>No hay excusas registradas. Usa el boton "Registrar Excusa" para agregar una.</p>
    </div>

    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Estudiante</th><th>Ficha</th><th>Fecha Inasistencia</th><th>Tipo</th><th>Adjunto</th><th>Horas</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in excusasFiltradas" :key="e._id" :class="{ 'fila-inactivo': e.estado === 'Rechazada' }">
            <td>
              <strong>{{ getEstudianteById(e.estudianteId)?.nombres }} {{ getEstudianteById(e.estudianteId)?.apellidos }}</strong>
              <div style="font-size: 11px; color: var(--text-secondary);">{{ getEstudianteById(e.estudianteId)?.numeroDocumento }}</div>
            </td>
            <td><span class="badge badge-ficha">{{ getFichaById(e.fichaId)?.codigoFicha || '—' }}</span></td>
            <td>{{ e.fechaInasistencia }}</td>
            <td><span class="badge" :class="tipoBadge(e.tipoExcusa)">{{ e.tipoExcusa }}</span></td>
            <td><span v-if="e.adjuntoNombre" style="font-size: 12px; color: var(--text-secondary);">{{ e.adjuntoNombre.length > 20 ? e.adjuntoNombre.slice(0, 20) + '...' : e.adjuntoNombre }}</span><span v-else>—</span></td>
            <td><strong>{{ e.horasDescontar }}h</strong></td>
            <td>
              <span class="badge" :class="estadoBadge(e.estado)">{{ e.estado }}</span>
              <div v-if="e.estado === 'Rechazada' && e.motivoRechazo" class="motivo-texto">{{ e.motivoRechazo }}</div>
            </td>
            <td>
              <div class="btn-group">
                <template v-if="e.estado === 'Pendiente'">
                  <button class="btn btn-success btn-sm" @click="aprobarExcusa(e)">Aprobar</button>
                  <button class="btn btn-danger btn-sm" @click="abrirRechazar(e)">Rechazar</button>
                </template>
                <span v-else style="font-size: 12px; color: var(--text-secondary);">{{ e.fechaRegistro }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h2>Registrar Excusa</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Estudiante</label>
          <select v-model="excusaForm.estudianteId">
            <option :value="null" disabled>Selecciona un estudiante</option>
            <option v-for="e in todosEstudiantes" :key="e._id" :value="e._id">{{ e.nombres }} {{ e.apellidos }} - {{ e.numeroDocumento }}</option>
          </select>
        </div>
        <div class="form-group"><label>Fecha de Inasistencia</label><input v-model="excusaForm.fechaInasistencia" type="date" /></div>
        <div class="form-group"><label>Tipo de Excusa</label><select v-model="excusaForm.tipoExcusa"><option value="Medica">Medica</option><option value="Personal">Personal</option><option value="Institucional">Institucional</option></select></div>
        <div class="form-group"><label>Horas a Descontar</label><input v-model.number="excusaForm.horasDescontar" type="number" min="1" max="24" /></div>
        <div class="form-group">
          <label>Adjunto PDF</label>
          <div class="file-upload-wrapper">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" @change="handleFileUpload" class="file-input" />
            <label class="file-label">{{ excusaForm.adjuntoNombre || 'Seleccionar archivo (PDF, JPG, PNG)' }}</label>
          </div>
        </div>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="closeModal">Cancelar</button>
        <button class="btn btn-primary" @click="guardarExcusa" :disabled="loading">{{ loading ? 'Guardando...' : 'Registrar Excusa' }}</button>
      </div>
    </div>
  </div>

  <div v-if="showRechazarModal" class="modal-overlay" @click.self="showRechazarModal = false">
    <div class="modal">
      <h2>Rechazar Excusa</h2>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">Indica el motivo por el cual se rechaza esta excusa.</p>
      <div class="form-group">
        <label>Motivo de Rechazo</label>
        <textarea v-model="rechazarMotivo" rows="3" placeholder="Ej: Documento no valido, falta informacion, fuera de plazo..." style="width: 100%; padding: 10px 12px; border: 1px solid var(--input-border); border-radius: 6px; font-size: 14px; font-family: var(--sans); resize: vertical;"></textarea>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="showRechazarModal = false">Cancelar</button>
        <button class="btn btn-danger" @click="confirmarRechazo">Confirmar Rechazo</button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
</template>
