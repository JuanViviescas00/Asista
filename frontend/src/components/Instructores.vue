<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/api.js'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const showInhabilitarModal = ref(false)
const editingId = ref(null)
const inhabilitarTarget = ref(null)
const inhabilitarMotivo = ref('')
const loading = ref(false)
const busquedaAvanzadaAbierta = ref(true)

const busqueda = reactive({
  documento: '',
  nombres: '',
  estado: 'Todos',
  tipoDocente: 'Todos',
  especialidad: ''
})

const instructorForm = reactive({
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  correo: '',
  telefono: '',
  especialidad: '',
})

const instructores = ref([])

onMounted(async () => { await loadInstructores() })

async function loadInstructores() {
  try { instructores.value = await api.instructores.getAll() } catch (e) {
    showToastFn('Error al cargar instructores', 'error')
  }
}

const activosCount = computed(() => instructores.value.filter(i => i.estado === 'Activo').length)
const inactivosCount = computed(() => instructores.value.filter(i => i.estado === 'Inactivo').length)
const lideresCount = computed(() => instructores.value.filter(i => i.esLider).length)

const especialidadesDisponibles = computed(() => {
  return [...new Set(instructores.value.map(i => i.especialidad).filter(Boolean))].sort()
})

const criteriosActivos = computed(() => {
  let count = 0
  if (busqueda.documento.trim()) count++
  if (busqueda.nombres.trim()) count++
  if (busqueda.estado !== 'Todos') count++
  if (busqueda.tipoDocente !== 'Todos') count++
  if (busqueda.especialidad) count++
  return count
})

function limpiarBusqueda() {
  Object.assign(busqueda, {
    documento: '',
    nombres: '',
    estado: 'Todos',
    tipoDocente: 'Todos',
    especialidad: ''
  })
}

const instructoresFiltrados = computed(() => {
  let lista = instructores.value
  if (busqueda.estado !== 'Todos') {
    lista = lista.filter(i => i.estado === busqueda.estado)
  }
  if (busqueda.tipoDocente !== 'Todos') {
    if (busqueda.tipoDocente === 'Lider') lista = lista.filter(i => i.esLider)
    if (busqueda.tipoDocente === 'Comun') lista = lista.filter(i => !i.esLider)
  }
  if (busqueda.especialidad) {
    lista = lista.filter(i => (i.especialidad || '').toLowerCase() === busqueda.especialidad.toLowerCase())
  }
  if (busqueda.documento.trim()) {
    const doc = busqueda.documento.toLowerCase().trim()
    lista = lista.filter(i => (i.numeroDocumento || '').toLowerCase().includes(doc))
  }
  if (busqueda.nombres.trim()) {
    const nom = busqueda.nombres.toLowerCase().trim()
    lista = lista.filter(i => {
      const completo = `${i.nombres || ''} ${i.apellidos || ''}`.toLowerCase()
      return completo.includes(nom)
    })
  }
  return lista
})

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openCreate() {
  editingId.value = null
  Object.assign(instructorForm, {
    nombres: '', apellidos: '', tipoDocumento: 'CC', numeroDocumento: '',
    correo: '', telefono: '', especialidad: '',
  })
  showModal.value = true
}

function openEdit(instructor) {
  editingId.value = instructor._id
  Object.assign(instructorForm, instructor)
  showModal.value = true
}

function closeModal() { showModal.value = false }

async function guardarInstructor() {
  const { nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, especialidad } = instructorForm
  if (!nombres || !apellidos || !numeroDocumento || !correo || !telefono || !especialidad) {
    showToastFn('Completa todos los campos obligatorios', 'error')
    return
  }
  loading.value = true
  try {
    const body = { nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, especialidad }
    if (editingId.value) {
      await api.instructores.update(editingId.value, body)
      showToastFn('Instructor actualizado correctamente')
    } else {
      body.estado = 'Activo'
      body.motivo = ''
      await api.instructores.create(body)
      showToastFn('Instructor creado correctamente')
    }
    await loadInstructores()
    closeModal()
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function abrirInhabilitar(instructor) {
  inhabilitarTarget.value = instructor
  inhabilitarMotivo.value = ''
  showInhabilitarModal.value = true
}

async function confirmarInhabilitar() {
  if (!inhabilitarMotivo.value.trim()) {
    showToastFn('Debes ingresar un motivo para la inhabilitacion', 'error')
    return
  }
  try {
    await api.instructores.update(inhabilitarTarget.value._id, {
      estado: 'Inactivo',
      motivo: inhabilitarMotivo.value.trim(),
    })
    await loadInstructores()
    showInhabilitarModal.value = false
    showToastFn('Instructor inhabilitado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

async function activarInstructor(instructor) {
  try {
    await api.instructores.update(instructor._id, { estado: 'Activo', motivo: '' })
    await loadInstructores()
    showToastFn('Instructor activado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

async function eliminarInstructor(id) {
  try {
    await api.instructores.delete(id)
    await loadInstructores()
    showToastFn('Instructor eliminado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function nombreCompleto(i) { return `${i.nombres} ${i.apellidos}` }
</script>

<template>
  <div class="page-header">
    <h1>Instructores</h1>
    <p>Gestiona los instructores y docentes del sistema institucional</p>
  </div>

  <div class="stats-row">
    <div class="stat-card stat-activo">
      <span class="stat-num">{{ instructores.length }}</span>
      <span class="stat-label">Total Instructores</span>
    </div>
    <div class="stat-card stat-activo">
      <span class="stat-num">{{ activosCount }}</span>
      <span class="stat-label">Activos</span>
    </div>
    <div class="stat-card stat-inactivo">
      <span class="stat-num">{{ inactivosCount }}</span>
      <span class="stat-label">Inactivos</span>
    </div>
    <div class="stat-card" style="border-left: 4px solid #3b82f6;">
      <span class="stat-num">{{ lideresCount }}</span>
      <span class="stat-label">Docentes Líderes</span>
    </div>
  </div>

  <div class="card busqueda-card">
    <div class="card-header busqueda-header">
      <div class="header-title-group">
        <h3>Búsqueda y Filtros</h3>
        <span v-if="criteriosActivos > 0" class="badge-filtros-activos">
          {{ criteriosActivos }} filtro(s) activo(s)
        </span>
      </div>
      <div class="btn-group">
        <button v-if="criteriosActivos > 0" class="btn btn-outline btn-sm btn-limpiar" @click="limpiarBusqueda">
          Limpiar filtros
        </button>
        <button class="btn btn-outline btn-sm" @click="busquedaAvanzadaAbierta = !busquedaAvanzadaAbierta">
          {{ busquedaAvanzadaAbierta ? 'Ocultar' : 'Mostrar' }} filtros
        </button>
      </div>
    </div>

    <div v-if="busquedaAvanzadaAbierta" class="busqueda-body">
      <!-- Fila 1: Búsqueda por texto (Documento y Nombres) -->
      <div class="busqueda-fila busqueda-fila-textos">
        <div class="campo-busqueda">
          <label for="buscar-doc">Documento de Identidad</label>
          <div class="input-con-clear">
            <input
              id="buscar-doc"
              v-model="busqueda.documento"
              type="text"
              placeholder="Buscar por número de documento..."
              class="input-control"
            />
            <button v-if="busqueda.documento" class="btn-clear-campo" @click="busqueda.documento = ''" title="Borrar">×</button>
          </div>
        </div>

        <div class="campo-busqueda">
          <label for="buscar-nom">Nombre o Apellido</label>
          <div class="input-con-clear">
            <input
              id="buscar-nom"
              v-model="busqueda.nombres"
              type="text"
              placeholder="Buscar por nombres o apellidos..."
              class="input-control"
            />
            <button v-if="busqueda.nombres" class="btn-clear-campo" @click="busqueda.nombres = ''" title="Borrar">×</button>
          </div>
        </div>
      </div>

      <!-- Fila 2: Filtros Selectores (Estado, Tipo, Especialidad) -->
      <div class="busqueda-fila busqueda-fila-selects">
        <div class="campo-busqueda">
          <label for="filtro-estado">Estado del Docente</label>
          <select id="filtro-estado" v-model="busqueda.estado" class="select-control">
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>

        <div class="campo-busqueda">
          <label for="filtro-tipo">Rol en Ficha</label>
          <select id="filtro-tipo" v-model="busqueda.tipoDocente" class="select-control">
            <option value="Todos">Todos los roles</option>
            <option value="Lider">Instructor Líder</option>
            <option value="Comun">Instructor Común</option>
          </select>
        </div>

        <div class="campo-busqueda">
          <label for="filtro-esp">Especialidad Técnica</label>
          <select id="filtro-esp" v-model="busqueda.especialidad" class="select-control">
            <option value="">Todas las especialidades</option>
            <option v-for="esp in especialidadesDisponibles" :key="esp" :value="esp">{{ esp }}</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h3>Listado de Instructores</h3>
        <span v-if="criteriosActivos > 0" class="badge badge-primary">
          {{ instructoresFiltrados.length }} de {{ instructores.length }} resultado(s)
        </span>
      </div>
      <button class="btn btn-primary" @click="openCreate">+ Nuevo Instructor</button>
    </div>

    <div v-if="instructores.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>No hay instructores registrados. Crea el primero usando el botón "Nuevo Instructor".</p>
    </div>

    <div v-else-if="instructoresFiltrados.length === 0" class="empty-state" style="padding: 32px 16px;">
      <p style="font-size: 15px; color: #64748b; margin-bottom: 12px;">
        No se encontraron instructores que coincidan con los criterios de búsqueda.
      </p>
      <button class="btn btn-outline btn-sm" @click="limpiarBusqueda">Limpiar Filtros</button>
    </div>

    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Documento</th>
            <th>Correo</th>
            <th>Teléfono</th>
            <th>Especialidad</th>
            <th>Tipo Docente</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in instructoresFiltrados" :key="i._id" :class="{ 'fila-inactivo': i.estado === 'Inactivo' }">
            <td><strong>{{ nombreCompleto(i) }}</strong></td>
            <td><span class="badge badge-primary">{{ i.tipoDocumento }}</span> {{ i.numeroDocumento }}</td>
            <td>{{ i.correo }}</td>
            <td>{{ i.telefono }}</td>
            <td><span class="badge badge-success">{{ i.especialidad }}</span></td>
            <td>
              <span class="badge" :class="i.esLider ? 'badge-primary' : 'badge-neutral'" style="font-size: 12px; font-weight: 600;">
                {{ i.esLider ? 'Instructor Líder' : 'Instructor Común' }}
              </span>
            </td>
            <td>
              <span class="badge" :class="i.estado === 'Activo' ? 'badge-success' : 'badge-danger'">{{ i.estado }}</span>
              <div v-if="i.estado === 'Inactivo' && i.motivo" class="motivo-texto">{{ i.motivo }}</div>
            </td>
            <td>
              <div class="btn-group">
                <button class="btn btn-outline btn-sm" @click="openEdit(i)">Editar</button>
                <button v-if="i.estado === 'Activo'" class="btn btn-warning btn-sm" @click="abrirInhabilitar(i)">Inhabilitar</button>
                <button v-else class="btn btn-success btn-sm" @click="activarInstructor(i)">Activar</button>
                <button class="btn btn-danger btn-sm" @click="eliminarInstructor(i._id)">Eliminar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="showInhabilitarModal" class="modal-overlay" @click.self="showInhabilitarModal = false">
    <div class="modal">
      <h2>Inhabilitar Instructor</h2>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        Estas a punto de inhabilitar a <strong>{{ inhabilitarTarget ? nombreCompleto(inhabilitarTarget) : '' }}</strong>.
        Esta accion impedira su acceso inmediato al sistema.
      </p>
      <div class="form-group">
        <label>Motivo de inhabilitacion</label>
        <textarea v-model="inhabilitarMotivo" rows="3" placeholder="Ej: Ya no pertenece a la institucion, termino contrato, etc." style="width: 100%; padding: 10px 12px; border: 1px solid var(--input-border); border-radius: 6px; font-size: 14px; font-family: var(--sans); resize: vertical;"></textarea>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="showInhabilitarModal = false">Cancelar</button>
        <button class="btn btn-danger" @click="confirmarInhabilitar">Confirmar Inhabilitacion</button>
      </div>
    </div>
  </div>

  <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h2>{{ editingId ? 'Editar Instructor' : 'Nuevo Instructor' }}</h2>
      <div class="form-grid">
        <div class="form-group"><label>Nombres</label><input v-model="instructorForm.nombres" type="text" placeholder="Nombres del instructor" /></div>
        <div class="form-group"><label>Apellidos</label><input v-model="instructorForm.apellidos" type="text" placeholder="Apellidos del instructor" /></div>
        <div class="form-group">
          <label>Tipo de Documento</label>
          <select v-model="instructorForm.tipoDocumento">
            <option value="CC">CC - Cedula de Ciudadania</option>
            <option value="CE">CE - Cedula de Extranjeria</option>
            <option value="PEP">PEP - Permiso Especial</option>
          </select>
        </div>
        <div class="form-group"><label>Numero de Documento</label><input v-model="instructorForm.numeroDocumento" type="text" placeholder="Numero de documento" /></div>
        <div class="form-group"><label>Correo Electronico</label><input v-model="instructorForm.correo" type="email" placeholder="correo@ejemplo.com" /></div>
        <div class="form-group"><label>Telefono</label><input v-model="instructorForm.telefono" type="tel" placeholder="+57 300 000 0000" /></div>
        <div class="form-group"><label>Especialidad</label><input v-model="instructorForm.especialidad" type="text" placeholder="Ej: Desarrollo de Software" /></div>
      </div>
      <div v-if="!editingId" style="margin-top: 16px; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 12.5px; color: #1e40af;">
        <strong>Cuenta de Acceso Automática:</strong> Se creará una cuenta para iniciar sesión. Su usuario será <strong>{{ instructorForm.correo || 'el correo ingresado' }}</strong> y su contraseña estándar inicial será <strong>sena2026</strong> (el docente podrá cambiarla desde su Perfil).
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="closeModal">Cancelar</button>
        <button class="btn btn-primary" @click="guardarInstructor" :disabled="loading">{{ loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear') + ' Instructor' }}</button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
</template>

<style scoped>
.busqueda-card {
  padding: 20px 24px;
  margin-bottom: 24px;
}

.busqueda-header {
  margin-bottom: 16px;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge-filtros-activos {
  background: rgba(57, 169, 0, 0.14);
  color: #1F5C00;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.btn-limpiar {
  color: #C4432B;
  border-color: #F3CFC6;
  background: #FBEAE6;
}

.btn-limpiar:hover {
  background: #F6D9D0;
  border-color: #C4432B;
}

.busqueda-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.busqueda-fila {
  display: grid;
  gap: 16px;
  width: 100%;
}

.busqueda-fila-textos {
  grid-template-columns: 1fr 1fr;
}

.busqueda-fila-selects {
  grid-template-columns: 1fr 1fr 1fr;
}

@media (max-width: 860px) {
  .busqueda-fila-textos,
  .busqueda-fila-selects {
    grid-template-columns: 1fr;
  }
}

.campo-busqueda {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.campo-busqueda label {
  font-size: 12px;
  font-weight: 700;
  color: #4A5344;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.input-con-clear {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.input-control {
  width: 100%;
  height: 40px;
  padding: 8px 32px 8px 12px;
  border: 1.5px solid #E2E6DE;
  border-radius: 8px;
  font-size: 13.5px;
  font-family: inherit;
  background: #ffffff;
  color: #16210F;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.input-control:focus {
  outline: none;
  border-color: #39A900;
  box-shadow: 0 0 0 3px rgba(57, 169, 0, 0.15);
  background: #ffffff;
}

.btn-clear-campo {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  font-size: 18px;
  line-height: 1;
  color: #7C857A;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 50%;
}

.btn-clear-campo:hover {
  color: #C4432B;
  background: #EEF0EC;
}

.select-control {
  width: 100%;
  height: 40px;
  padding: 8px 12px;
  border: 1.5px solid #E2E6DE;
  border-radius: 8px;
  font-size: 13.5px;
  font-family: inherit;
  background: #ffffff;
  color: #16210F;
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.select-control:focus {
  outline: none;
  border-color: #39A900;
  box-shadow: 0 0 0 3px rgba(57, 169, 0, 0.15);
}
</style>
