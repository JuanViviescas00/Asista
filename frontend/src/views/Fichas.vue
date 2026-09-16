<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'
import '../styles/fichas.css'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const editingId = ref(null)
const loading = ref(false)

const busquedaDocente = ref('')

const fichaForm = reactive({
  codigoFicha: '',
  nombrePrograma: '',
  jornada: 'Diurna',
  aulaAsignada: '',
  instructorLiderId: null,
  instructores: [], // Instructores Comunes
  fechaInicio: '',
  fechaFin: '',
})

const fichas = ref([])
const instructoresList = ref([])

onMounted(async () => {
  await Promise.all([loadFichas(), loadInstructores()])
})

async function loadFichas() {
  try {
    fichas.value = await api.fichas.getAll()
  } catch (e) {
    showToastFn('Error al cargar fichas', 'error')
  }
}

async function loadInstructores() {
  try {
    instructoresList.value = await api.instructores.getAll()
  } catch (e) {}
}

const instructoresFiltrados = computed(() => {
  const query = busquedaDocente.value.toLowerCase().trim()
  const activos = instructoresList.value.filter(i => i.estado !== 'Inactivo')
  if (!query) return activos
  return activos.filter(i => 
    `${i.nombres} ${i.apellidos} ${i.numeroDocumento || ''} ${i.especialidad || ''} ${i.correo || ''}`.toLowerCase().includes(query)
  )
})

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openCreate() {
  editingId.value = null
  busquedaDocente.value = ''
  Object.assign(fichaForm, {
    codigoFicha: '',
    nombrePrograma: '',
    jornada: 'Diurna',
    aulaAsignada: '',
    instructorLiderId: null,
    instructores: [],
    fechaInicio: '',
    fechaFin: '',
  })
  showModal.value = true
}

function openEdit(ficha) {
  editingId.value = ficha._id
  busquedaDocente.value = ''
  const comunesIds = Array.isArray(ficha.instructores)
    ? ficha.instructores.map(i => i._id || i)
    : []

  Object.assign(fichaForm, {
    codigoFicha: ficha.codigoFicha,
    nombrePrograma: ficha.nombrePrograma,
    jornada: ficha.jornada,
    aulaAsignada: ficha.aulaAsignada,
    instructorLiderId: ficha.instructorLiderId?._id || ficha.instructorLiderId || null,
    instructores: comunesIds,
    fechaInicio: ficha.fechaInicio,
    fechaFin: ficha.fechaFin,
  })
  showModal.value = true
}

function toggleInstructorComun(id) {
  const index = fichaForm.instructores.indexOf(id)
  if (index > -1) {
    fichaForm.instructores.splice(index, 1)
  } else {
    fichaForm.instructores.push(id)
  }
}

function closeModal() {
  showModal.value = false
}

async function guardarFicha() {
  const { codigoFicha, nombrePrograma, jornada, aulaAsignada, instructorLiderId, instructores, fechaInicio, fechaFin } = fichaForm
  if (!codigoFicha || !nombrePrograma || !jornada || !aulaAsignada || !instructorLiderId || !fechaInicio || !fechaFin) {
    showToastFn('Completa todos los campos obligatorios', 'error')
    return
  }
  loading.value = true
  try {
    const comunesFiltrados = instructores.filter(id => id !== instructorLiderId)
    const body = {
      codigoFicha,
      nombrePrograma,
      jornada,
      aulaAsignada,
      instructorLiderId,
      instructores: comunesFiltrados,
      fechaInicio,
      fechaFin
    }
    if (editingId.value) {
      await api.fichas.update(editingId.value, body)
      showToastFn('Ficha actualizada correctamente')
    } else {
      await api.fichas.create(body)
      showToastFn('Ficha creada correctamente')
    }
    await loadFichas()
    closeModal()
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function eliminarFicha(id) {
  if (!confirm('¿Estás seguro de eliminar esta ficha?')) return
  try {
    await api.fichas.delete(id)
    await loadFichas()
    showToastFn('Ficha eliminada correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function getInstructorNombre(id) {
  if (!id) return 'No asignado'
  const instId = id._id || id
  const instructor = instructoresList.value.find(i => i._id === instId)
  return instructor ? `${instructor.nombres} ${instructor.apellidos}` : (id.nombres ? `${id.nombres} ${id.apellidos}` : 'No asignado')
}

function getComunesNombres(comunes) {
  if (!comunes || comunes.length === 0) return 'Ninguno'
  return comunes
    .map(c => getInstructorNombre(c))
    .filter(n => n !== 'No asignado')
    .join(', ') || 'Ninguno'
}

function jornadaBadge(jornada) {
  if (jornada === 'Mañana' || jornada === 'Diurna') return 'fichas-badge-primary'
  if (jornada === 'Tarde' || jornada === 'Mixta') return 'fichas-badge-warning'
  return 'fichas-badge-success'
}

const liderYaEsLiderEnOtraFicha = computed(() => {
  if (!fichaForm.instructorLiderId) return null
  const lidId = fichaForm.instructorLiderId
  return fichas.value.find(f => f._id !== editingId.value && (f.instructorLiderId?._id === lidId || f.instructorLiderId === lidId))
})
</script>

<template>
  <div class="fichas-page-header">
    <h1>Gestión de Fichas</h1>
    <p>Asigna Instructores Líderes e Instructores Comunes a las fichas</p>
  </div>

  <div class="fichas-card">
    <div class="fichas-card-header">
      <h3>Listado de Fichas</h3>
      <button class="fichas-button fichas-button-primary" @click="openCreate">+ Nueva Ficha</button>
    </div>

    <div v-if="fichas.length === 0" class="fichas-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
      <p>No hay fichas registradas. Crea la primera usando el botón "Nueva Ficha".</p>
    </div>

    <div v-else class="fichas-table-container">
      <table class="fichas-table">
        <thead>
          <tr>
            <th>Código Ficha</th>
            <th>Programa</th>
            <th>Jornada</th>
            <th>Aula</th>
            <th>Docente Líder 👑</th>
            <th>Docentes Comunes 👤</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in fichas" :key="f._id">
            <td><strong>{{ f.codigoFicha }}</strong></td>
            <td>{{ f.nombrePrograma }}</td>
            <td><span class="fichas-badge" :class="jornadaBadge(f.jornada)">{{ f.jornada }}</span></td>
            <td>{{ f.aulaAsignada }}</td>
            <td>
              <span class="fichas-badge fichas-badge-leader">
                👑 {{ getInstructorNombre(f.instructorLiderId) }}
              </span>
            </td>
            <td>
              <span class="fichas-common-text">
                {{ getComunesNombres(f.instructores) }}
              </span>
            </td>
            <td>
              <div class="fichas-button-group">
                <button class="fichas-button fichas-button-outline fichas-button-small" @click="openEdit(f)">✏️ Editar</button>
                <button class="fichas-button fichas-button-danger fichas-button-small" @click="eliminarFicha(f._id)">🗑️ Eliminar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- MODAL DE CREACIÓN / EDICIÓN DE FICHA -->
  <div v-if="showModal" class="fichas-modal-overlay" @click.self="closeModal">
    <div class="fichas-modal fichas-modal-large">
      <h2>{{ editingId ? '✏️ Editar Ficha' : '➕ Nueva Ficha' }}</h2>
      <div class="fichas-form-grid">
        <div class="fichas-form-group">
          <label>Código de Ficha *</label>
          <input v-model="fichaForm.codigoFicha" type="text" placeholder="Ej: 2670123" />
        </div>
        <div class="fichas-form-group">
          <label>Nombre del Programa *</label>
          <input v-model="fichaForm.nombrePrograma" type="text" placeholder="Ej: Análisis y Desarrollo de Software" />
        </div>
        <div class="fichas-form-group">
          <label>Jornada *</label>
          <select v-model="fichaForm.jornada">
            <option value="Mañana">🌅 Mañana</option>
            <option value="Tarde">☀️ Tarde</option>
            <option value="Noche">🌙 Noche</option>
          </select>
        </div>
        <div class="fichas-form-group">
          <label>Aula Asignada *</label>
          <input v-model="fichaForm.aulaAsignada" type="text" placeholder="Ej: Aula 302 - Bloque A" />
        </div>

        <!-- BUSCADOR DE DOCENTES -->
        <div class="fichas-form-group fichas-form-group-wide">
          <label>🔍 Filtrar / Buscar Docente en la Lista</label>
          <input
            v-model="busquedaDocente"
            type="text"
            placeholder="Escribe el nombre, apellido, documento o especialidad del docente..."
            class="fichas-instructor-search"
          />
        </div>

        <div class="fichas-form-group fichas-form-group-wide">
          <label>👑 Docente Líder de la Ficha (Obligatorio) *</label>
          <select v-model="fichaForm.instructorLiderId" class="fichas-leader-select">
            <option :value="null" disabled>Selecciona al Docente Líder...</option>
            <option v-for="i in instructoresFiltrados" :key="i._id" :value="i._id">
              👑 {{ i.nombres }} {{ i.apellidos }} — {{ i.especialidad }}
            </option>
          </select>
          <p v-if="instructoresFiltrados.length === 0" class="fichas-warning-text">
            No se encontraron docentes con la búsqueda "{{ busquedaDocente }}".
          </p>
          <p v-if="liderYaEsLiderEnOtraFicha" class="fichas-warning-text">
            ⚠️ <strong>Aviso de Liderazgo:</strong> Este docente ya es Líder de la Ficha <strong>{{ liderYaEsLiderEnOtraFicha.codigoFicha }}</strong> ({{ liderYaEsLiderEnOtraFicha.nombrePrograma }}). Se permite ser líder de múltiples fichas.
          </p>
        </div>

        <div class="fichas-form-group fichas-form-group-wide">
          <label>👤 Docentes Comunes Asignados (Opcional)</label>
          <p class="fichas-help-text">Selecciona los docentes adicionales que dictan clases en esta ficha:</p>
          <div class="fichas-instructor-check-grid">
            <label
              v-for="i in instructoresFiltrados"
              :key="i._id"
              class="fichas-instructor-check-item"
              :class="{ 'is-disabled': i._id === fichaForm.instructorLiderId }"
            >
              <input
                type="checkbox"
                :value="i._id"
                :checked="fichaForm.instructores.includes(i._id)"
                :disabled="i._id === fichaForm.instructorLiderId"
                @change="toggleInstructorComun(i._id)"
              />
              <span>
                {{ i.nombres }} {{ i.apellidos }}
                <small v-if="i._id === fichaForm.instructorLiderId" class="fichas-leader-note"> (Líder principal)</small>
              </span>
            </label>
            <div v-if="instructoresFiltrados.length === 0" class="fichas-no-instructors">
              No se encontraron docentes que coincidan con la búsqueda.
            </div>
          </div>
        </div>

        <div class="fichas-form-group">
          <label>Fecha de Inicio *</label>
          <input v-model="fichaForm.fechaInicio" type="date" />
        </div>
        <div class="fichas-form-group">
          <label>Fecha de Fin *</label>
          <input v-model="fichaForm.fechaFin" type="date" />
        </div>
      </div>
      <div class="fichas-modal-actions">
        <button class="fichas-button fichas-button-outline" @click="closeModal">Cancelar</button>
        <button class="fichas-button fichas-button-primary" @click="guardarFicha" :disabled="loading">
          {{ loading ? 'Guardando...' : (editingId ? '💾 Actualizar Ficha' : '➕ Crear Ficha') }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="fichas-toast" :class="'fichas-toast-' + toast.type">{{ toast.message }}</div>
</template>
