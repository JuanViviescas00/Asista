<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'
import '../styles/fichas.css'
import { nombreProgramaLimpio } from '../utils/textos.js'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const editingId = ref(null)
const loading = ref(false)

const busquedaDocente = ref('')

const expandidos = ref({})
const showInhabilitarModal = ref(false)
const inhabilitarTarget = ref(null)
const inhabilitarMotivo = ref('')

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

// Recorta el nombre del programa sin partir palabras: "Análisis y desarrollo..."
function acortarNombre(texto, max = 22) {
  const s = String(texto ?? '').trim()
  if (s.length <= max) return s
  const corte = s.slice(0, max + 1)
  const i = corte.lastIndexOf(' ')
  let base = i > 0 ? corte.slice(0, i) : s.slice(0, max)
  base = base.replace(/(\s+(de|del|la|el|los|las|y|e|en|para|por|con|a|o))+$/i, '').replace(/[\s,.;:]+$/, '')
  return base + '...'
}

function toggleDetalle(id) {
  expandidos.value[id] = !expandidos.value[id]
}

function estaActiva(ficha) {
  return ficha.estado !== 'Inactivo'
}

function abrirInhabilitar(ficha) {
  inhabilitarTarget.value = ficha
  inhabilitarMotivo.value = ''
  showInhabilitarModal.value = true
}

function cerrarInhabilitar() {
  showInhabilitarModal.value = false
  inhabilitarTarget.value = null
}

async function confirmarInhabilitar() {
  if (!inhabilitarMotivo.value.trim()) {
    showToastFn('Debes ingresar un motivo para la inhabilitación', 'error')
    return
  }
  const ok = await cambiarEstado(inhabilitarTarget.value, 'Inactivo', inhabilitarMotivo.value.trim())
  if (ok) cerrarInhabilitar()
}

async function cambiarEstado(ficha, nuevoEstado, motivo = '') {
  const accion = nuevoEstado === 'Activo' ? 'habilitar' : 'inhabilitar'
  try {
    const actualizada = await api.fichas.update(ficha._id, { estado: nuevoEstado, motivo })
    // Si el servidor no guarda el campo "estado", lo detectamos en lugar de mostrar un éxito falso.
    if ((actualizada?.estado ?? 'Activo') !== nuevoEstado) {
      showToastFn(`No se pudo ${accion} la ficha: el servidor no guardó el estado`, 'error')
      return false
    }
    await loadFichas()
    showToastFn(nuevoEstado === 'Activo' ? 'Ficha habilitada correctamente' : 'Ficha inhabilitada correctamente')
    return true
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
    return false
  }
}

function getInstructorNombre(id) {
  if (!id) return 'No asignado'
  const instId = id._id || id
  const instructor = instructoresList.value.find(i => i._id === instId)
  return instructor ? `${instructor.nombres} ${instructor.apellidos}` : (id.nombres ? `${id.nombres} ${id.apellidos}` : 'No asignado')
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
      <button class="fichas-button fichas-button-primary" @click="openCreate" title="Nueva Ficha"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
    </div>

    <div v-if="fichas.length === 0" class="fichas-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
      <p>No hay fichas registradas. Crea la primera usando el botón "Nueva Ficha".</p>
    </div>

    <div v-else class="fichas-table-container">
      <table class="fichas-table">
        <colgroup>
          <col class="col-codigo">
          <col class="col-ficha">
          <col class="col-docente">
          <col class="col-acciones">
        </colgroup>
        <thead>
          <tr>
            <th>Código Ficha</th>
            <th>Ficha</th>
            <th>Docente Líder</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="f in fichas" :key="f._id">
            <tr :class="{ 'fichas-row-inactiva': !estaActiva(f) }">
              <td><strong>{{ f.codigoFicha }}</strong></td>
              <td><span class="fichas-badge fichas-badge-ficha" :title="nombreProgramaLimpio(f.nombrePrograma)">{{ acortarNombre(nombreProgramaLimpio(f.nombrePrograma)) }}</span></td>
              <td>
                <span class="fichas-badge fichas-badge-leader">
                  {{ getInstructorNombre(f.instructorLiderId) }}
                </span>
              </td>
              <td>
              <div class="fichas-button-group">
                <button class="fichas-button fichas-button-outline fichas-button-small" @click="openEdit(f)" title="Editar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                <button v-if="estaActiva(f)" class="fichas-button fichas-button-warning fichas-button-small" @click="abrirInhabilitar(f)" title="Inhabilitar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
                <button v-else class="fichas-button fichas-button-primary fichas-button-small" @click="cambiarEstado(f, 'Activo')" title="Habilitar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></button>
                <button class="fichas-button fichas-button-outline fichas-button-small fichas-toggle" :class="{ 'fichas-toggle-abierto': expandidos[f._id] }" :aria-expanded="!!expandidos[f._id]" @click="toggleDetalle(f._id)" :title="expandidos[f._id] ? 'Ocultar información' : 'Ver más información'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
              </div>
              </td>
            </tr>
            <tr v-if="expandidos[f._id]" class="fichas-detalle-fila">
              <td colspan="4">
                <div class="fichas-detalle">
                  <div class="fichas-detalle-item"><span class="fichas-detalle-label">Aula</span><span>{{ f.aulaAsignada || '—' }}</span></div>
                  <div class="fichas-detalle-item"><span class="fichas-detalle-label">Jornada</span><span><span class="fichas-badge" :class="jornadaBadge(f.jornada)">{{ f.jornada }}</span></span></div>
                  <div class="fichas-detalle-item"><span class="fichas-detalle-label">Estado</span><span><span class="fichas-badge" :class="estaActiva(f) ? 'fichas-badge-success' : 'fichas-badge-inactive'">{{ estaActiva(f) ? 'Activa' : 'Inactiva' }}</span></span></div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>

  <!-- MODAL DE CREACIÓN / EDICIÓN DE FICHA -->
  <div v-if="showModal" class="fichas-modal-overlay" @click.self="closeModal">
    <div class="fichas-modal fichas-modal-large">
      <h2>{{ editingId ? ' Editar Ficha' : ' Nueva Ficha' }}</h2>
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
            <option value="Mañana"> Mañana</option>
            <option value="Tarde"> Tarde</option>
            <option value="Noche"> Noche</option>
          </select>
        </div>
        <div class="fichas-form-group">
          <label>Aula Asignada *</label>
          <input v-model="fichaForm.aulaAsignada" type="text" placeholder="Ej: Aula 302 - Bloque A" />
        </div>

        <!-- BUSCADOR DE DOCENTES -->
        <div class="fichas-form-group fichas-form-group-wide">
          <label> Filtrar / Buscar Docente en la Lista</label>
          <input
            v-model="busquedaDocente"
            type="text"
            placeholder="Escribe el nombre, apellido, documento o especialidad del docente..."
            class="fichas-instructor-search"
          />
        </div>

        <div class="fichas-form-group fichas-form-group-wide">
          <label> Docente Líder de la Ficha (Obligatorio) *</label>
          <select v-model="fichaForm.instructorLiderId" class="fichas-leader-select">
            <option :value="null" disabled>Selecciona al Docente Líder...</option>
            <option v-for="i in instructoresFiltrados" :key="i._id" :value="i._id">
               {{ i.nombres }} {{ i.apellidos }} — {{ i.especialidad }}
            </option>
          </select>
          <p v-if="instructoresFiltrados.length === 0" class="fichas-warning-text">
            No se encontraron docentes con la búsqueda "{{ busquedaDocente }}".
          </p>
          <p v-if="liderYaEsLiderEnOtraFicha" class="fichas-warning-text">
             <strong>Aviso de Liderazgo:</strong> Este docente ya es Líder de la Ficha <strong>{{ liderYaEsLiderEnOtraFicha.codigoFicha }}</strong> ({{ liderYaEsLiderEnOtraFicha.nombrePrograma }}). Se permite ser líder de múltiples fichas.
          </p>
        </div>

        <div class="fichas-form-group fichas-form-group-wide">
          <label> Docentes Comunes Asignados (Opcional)</label>
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
        <button class="fichas-button fichas-button-outline" @click="closeModal" title="Cancelar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="fichas-button fichas-button-primary" @click="guardarFicha" :disabled="loading" title="Guardar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL DE INHABILITACIÓN DE FICHA -->
  <div v-if="showInhabilitarModal" class="fichas-modal-overlay" @click.self="cerrarInhabilitar">
    <div class="fichas-modal fichas-modal-small">
      <h2>Inhabilitar Ficha</h2>
      <p class="fichas-modal-text">
        Estás a punto de inhabilitar la ficha <strong>{{ inhabilitarTarget?.codigoFicha }}</strong>.
        Esta acción la marcará como inactiva.
      </p>
      <div class="fichas-form-group">
        <label>Motivo de inhabilitación</label>
        <textarea v-model="inhabilitarMotivo" rows="3" placeholder="Ej: Ficha finalizada, se canceló la formación, etc."></textarea>
      </div>
      <div class="fichas-modal-actions">
        <button class="fichas-button fichas-button-outline" @click="cerrarInhabilitar" title="Cancelar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="fichas-button fichas-button-danger" @click="confirmarInhabilitar" title="Confirmar Inhabilitación"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="fichas-toast" :class="'fichas-toast-' + toast.type">{{ toast.message }}</div>
</template>
