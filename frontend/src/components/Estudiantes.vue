<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const showRetirarModal = ref(false)
const editingId = ref(null)
const retirarTarget = ref(null)
const retirarMotivo = ref('')
const retirarTipo = ref('Inactivo')
const filtroEstado = ref('Todos')
const busquedaAvanzadaAbierta = ref(false)
const loading = ref(false)

const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : null)
const esInstructor = computed(() => usuario.value?.rol === 'Instructor')

const busqueda = reactive({ fichaId: null, jornada: '', documento: '', nombres: '', estadoAsistencia: '' })

const estudianteForm = reactive({
  nombres: '', apellidos: '', tipoDocumento: 'CC', numeroDocumento: '',
  correo: '', telefono: '', fichaId: null,
})

const estudiantes = ref([])
const fichasList = ref([])

onMounted(async () => { await Promise.all([loadEstudiantes(), loadFichas()]) })

async function loadEstudiantes() {
  try {
    const params = {}
    if (esInstructor.value && usuario.value?.id) {
      params.instructorId = usuario.value.id
    }
    estudiantes.value = await api.estudiantes.getAll(params)
  } catch (e) {
    showToastFn('Error al cargar estudiantes', 'error')
  }
}

async function loadFichas() {
  try {
    if (esInstructor.value && usuario.value?.id) {
      fichasList.value = await api.fichas.getMisFichas(usuario.value.id)
    } else {
      fichasList.value = await api.fichas.getAll()
    }
  } catch (e) {}
}

function getFichaById(fichaId) {
  if (!fichaId) return null
  const idTarget = typeof fichaId === 'object' ? String(fichaId._id || '') : String(fichaId).trim()
  return fichasList.value.find(f =>
    String(f._id) === idTarget ||
    String(f.codigoFicha).trim() === idTarget
  )
}

function esLiderDeEstudiante(estudiante) {
  if (!esInstructor.value) return true
  const ficha = getFichaById(estudiante.fichaId)
  return !!(ficha && ficha.esLider)
}

const estudiantesFiltrados = computed(() => {
  let lista = estudiantes.value
  if (filtroEstado.value !== 'Todos') lista = lista.filter(e => e.estado === filtroEstado.value)
  if (busqueda.fichaId) {
    const targetFicha = getFichaById(busqueda.fichaId)
    const targetIds = [String(busqueda.fichaId)]
    if (targetFicha) {
      targetIds.push(String(targetFicha._id))
      targetIds.push(String(targetFicha.codigoFicha))
    }
    lista = lista.filter(e => {
      const eFichaId = typeof e.fichaId === 'object' ? String(e.fichaId?._id || '') : String(e.fichaId || '')
      return targetIds.includes(eFichaId)
    })
  }
  if (busqueda.jornada) {
    lista = lista.filter(e => {
      const ficha = getFichaById(e.fichaId)
      return ficha && ficha.jornada === busqueda.jornada
    })
  }
  if (busqueda.documento) {
    const doc = busqueda.documento.toLowerCase()
    lista = lista.filter(e => e.numeroDocumento.toLowerCase().includes(doc))
  }
  if (busqueda.nombres) {
    const nom = busqueda.nombres.toLowerCase()
    lista = lista.filter(e => {
      const completo = `${e.nombres} ${e.apellidos}`.toLowerCase()
      return completo.includes(nom)
    })
  }
  if (busqueda.estadoAsistencia) lista = lista.filter(e => e.estadoAsistencia === busqueda.estadoAsistencia)
  return lista
})

const criteriosActivos = computed(() => {
  let count = 0
  if (busqueda.fichaId) count++
  if (busqueda.jornada) count++
  if (busqueda.documento) count++
  if (busqueda.nombres) count++
  if (busqueda.estadoAsistencia) count++
  return count
})

function limpiarBusqueda() {
  Object.assign(busqueda, { fichaId: null, jornada: '', documento: '', nombres: '', estadoAsistencia: '' })
}

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openCreate() {
  editingId.value = null
  Object.assign(estudianteForm, {
    nombres: '', apellidos: '', tipoDocumento: 'CC', numeroDocumento: '',
    correo: '', telefono: '', fichaId: null,
  })
  showModal.value = true
}

function openEdit(estudiante) {
  editingId.value = estudiante._id
  Object.assign(estudianteForm, {
    nombres: estudiante.nombres, apellidos: estudiante.apellidos,
    tipoDocumento: estudiante.tipoDocumento, numeroDocumento: estudiante.numeroDocumento,
    correo: estudiante.correo, telefono: estudiante.telefono, fichaId: estudiante.fichaId,
  })
  showModal.value = true
}

function closeModal() { showModal.value = false }

async function guardarEstudiante() {
  const { nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, fichaId } = estudianteForm
  if (!nombres || !apellidos || !numeroDocumento || !correo || !telefono || !fichaId) {
    showToastFn('Completa todos los campos obligatorios', 'error')
    return
  }
  loading.value = true
  try {
    const body = { nombres, apellidos, tipoDocumento, numeroDocumento, correo, telefono, fichaId }
    if (editingId.value) {
      await api.estudiantes.update(editingId.value, body)
      showToastFn('Estudiante actualizado correctamente')
    } else {
      body.estado = 'Activo'
      body.motivo = ''
      body.estadoAsistencia = 'Sin registro'
      await api.estudiantes.create(body)
      showToastFn('Estudiante creado correctamente')
    }
    await loadEstudiantes()
    closeModal()
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function abrirRetirar(estudiante, tipo) {
  retirarTarget.value = estudiante
  retirarMotivo.value = ''
  retirarTipo.value = tipo
  showRetirarModal.value = true
}

async function confirmarRetirar() {
  if (!retirarMotivo.value.trim()) {
    showToastFn('Debes ingresar un motivo', 'error')
    return
  }
  try {
    await api.estudiantes.update(retirarTarget.value._id, {
      estado: retirarTipo.value,
      motivo: retirarMotivo.value.trim(),
    })
    await loadEstudiantes()
    showRetirarModal.value = false
    const label = retirarTipo.value === 'Retirado' ? 'retirado' : 'inhabilitado'
    showToastFn(`Estudiante ${label} correctamente. El historial se ha conservado.`)
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

async function activarEstudiante(estudiante) {
  try {
    await api.estudiantes.update(estudiante._id, { estado: 'Activo', motivo: '' })
    await loadEstudiantes()
    showToastFn('Estudiante activado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

async function eliminarEstudiante(id) {
  const est = estudiantes.value.find(e => e._id === id)
  if (est && est.estado !== 'Activo') {
    showToastFn('No se puede eliminar un estudiante con historial. Usa la opcion Retirar en su lugar.', 'error')
    return
  }
  try {
    await api.estudiantes.delete(id)
    await loadEstudiantes()
    showToastFn('Estudiante eliminado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function nombreCompleto(e) { return `${e.nombres} ${e.apellidos}` }

function getFichaNombre(fichaId) {
  if (!fichaId) return '—'
  const ficha = getFichaById(fichaId)
  return ficha ? `${ficha.codigoFicha} - ${ficha.nombrePrograma}` : 'No asignada'
}

function getJornada(fichaId) {
  if (!fichaId) return '—'
  const ficha = getFichaById(fichaId)
  return ficha ? ficha.jornada : '—'
}

function estadoBadge(estado) {
  if (estado === 'Activo') return 'badge-success'
  if (estado === 'Inactivo') return 'badge-warning'
  return 'badge-danger'
}

function asistenciaBadge(estado) {
  if (estado === 'Presente') return 'badge-success'
  if (estado === 'Ausente') return 'badge-danger'
  return 'badge-neutral'
}

function activosCount() { return estudiantes.value.filter(e => e.estado === 'Activo').length }
function inactivosCount() { return estudiantes.value.filter(e => e.estado === 'Inactivo').length }
function retiradosCount() { return estudiantes.value.filter(e => e.estado === 'Retirado').length }
</script>

<template>
  <div class="page-header">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div>
        <h1>Estudiantes</h1>
        <p v-if="esInstructor">
          👨‍🏫 Mostrando únicamente los aprendices de <strong>tus fichas asignadas</strong>.
        </p>
        <p v-else>
          Gestiona los estudiantes. Al inhabilitar o retirar se conserva la trazabilidad.
        </p>
      </div>
      <div v-if="esInstructor" style="background: rgba(16, 185, 129, 0.1); border: 1px solid #6ee7b7; color: #065f46; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
        Fichas asignadas: {{ fichasList.length }}
      </div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card stat-activo"><span class="stat-num">{{ activosCount() }}</span><span class="stat-label">Activos</span></div>
    <div class="stat-card stat-inactivo"><span class="stat-num">{{ inactivosCount() }}</span><span class="stat-label">Inactivos</span></div>
    <div class="stat-card stat-retirado"><span class="stat-num">{{ retiradosCount() }}</span><span class="stat-label">Retirados</span></div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>Busqueda Avanzada</h3>
      <div class="btn-group">
        <button v-if="criteriosActivos > 0" class="btn btn-outline btn-sm" @click="limpiarBusqueda">Limpiar filtros ({{ criteriosActivos }})</button>
        <button class="btn btn-outline btn-sm" @click="busquedaAvanzadaAbierta = !busquedaAvanzadaAbierta">{{ busquedaAvanzadaAbierta ? 'Ocultar' : 'Mostrar' }} busqueda</button>
      </div>
    </div>
    <div v-if="busquedaAvanzadaAbierta" class="busqueda-grid">
      <div class="form-group">
        <label>Ficha</label>
        <select v-model="busqueda.fichaId">
          <option :value="null">Todas las fichas</option>
          <option v-for="f in fichasList" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option>
        </select>
      </div>
      <div class="form-group"><label>Jornada</label><select v-model="busqueda.jornada"><option value="">Todas las jornadas</option><option value="Mañana">🌅 Mañana</option><option value="Tarde">☀️ Tarde</option><option value="Noche">🌙 Noche</option></select></div>
      <div class="form-group"><label>Numero de Documento</label><input v-model="busqueda.documento" type="text" placeholder="Buscar por documento..." /></div>
      <div class="form-group"><label>Nombres</label><input v-model="busqueda.nombres" type="text" placeholder="Buscar por nombre..." /></div>
      <div class="form-group"><label>Estado de Asistencia</label><select v-model="busqueda.estadoAsistencia"><option value="">Todos</option><option value="Sin registro">Sin registro</option><option value="Presente">Presente</option><option value="Ausente">Ausente</option></select></div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h3>Listado de Estudiantes</h3>
        <span v-if="criteriosActivos > 0" class="badge badge-primary">{{ estudiantesFiltrados.length }} resultado(s)</span>
        <select v-model="filtroEstado" class="filtro-select">
          <option value="Todos">Todos</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option><option value="Retirado">Retirados</option>
        </select>
      </div>
      <button v-if="!esInstructor" class="btn btn-primary" @click="openCreate">+ Nuevo Estudiante</button>
    </div>

    <div v-if="estudiantesFiltrados.length === 0" class="empty-state">
      <p>{{ criteriosActivos > 0 ? 'No se encontraron estudiantes con los criterios de busqueda.' : 'No hay estudiantes registrados. Crea el primero usando el boton "Nuevo Estudiante".' }}</p>
    </div>

    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Documento</th><th>Correo</th><th>Telefono</th><th>Ficha</th><th>Jornada</th><th>Asistencia</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in estudiantesFiltrados" :key="e._id" :class="{ 'fila-inactivo': e.estado !== 'Activo' }">
            <td><strong>{{ nombreCompleto(e) }}</strong></td>
            <td><span class="badge badge-primary">{{ e.tipoDocumento }}</span> {{ e.numeroDocumento }}</td>
            <td>{{ e.correo }}</td>
            <td>{{ e.telefono }}</td>
            <td><span class="badge badge-ficha">{{ getFichaNombre(e.fichaId) }}</span></td>
            <td>{{ getJornada(e.fichaId) }}</td>
            <td><span class="badge" :class="asistenciaBadge(e.estadoAsistencia)">{{ e.estadoAsistencia || 'Sin registro' }}</span></td>
            <td>
              <span class="badge" :class="estadoBadge(e.estado)">{{ e.estado }}</span>
              <div v-if="e.estado !== 'Activo' && e.motivo" class="motivo-texto">{{ e.motivo }}</div>
            </td>
            <td>
              <div class="btn-group">
                <template v-if="esLiderDeEstudiante(e)">
                  <button class="btn btn-outline btn-sm" @click="openEdit(e)">Editar</button>
                  <template v-if="e.estado === 'Activo'">
                    <button class="btn btn-warning btn-sm" @click="abrirRetirar(e, 'Inactivo')">Inhabilitar</button>
                    <button class="btn btn-danger btn-sm" @click="abrirRetirar(e, 'Retirado')">Retirar</button>
                  </template>
                  <button v-else class="btn btn-success btn-sm" @click="activarEstudiante(e)">Activar</button>
                </template>
                <span v-else style="font-size: 12px; color: #94a3b8;">Solo líder de ficha</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="showRetirarModal" class="modal-overlay" @click.self="showRetirarModal = false">
    <div class="modal">
      <h2>{{ retirarTipo === 'Retirado' ? 'Retirar' : 'Inhabilitar' }} Estudiante</h2>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">Vas a {{ retirarTipo === 'Retirado' ? 'retirar' : 'inhabilitar' }} a <strong>{{ retirarTarget ? nombreCompleto(retirarTarget) : '' }}</strong>. Su historial y trazabilidad se conservaran, solo cambiara su estado.</p>
      <div class="form-group">
        <label>Motivo</label>
        <textarea v-model="retirarMotivo" rows="3" placeholder="Ej: Traslado de sede, retiro voluntario, bajo rendimiento, etc." style="width: 100%; padding: 10px 12px; border: 1px solid var(--input-border); border-radius: 6px; font-size: 14px; font-family: var(--sans); resize: vertical;"></textarea>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="showRetirarModal = false">Cancelar</button>
        <button class="btn btn-danger" @click="confirmarRetirar">Confirmar {{ retirarTipo === 'Retirado' ? 'Retiro' : 'Inhabilitacion' }}</button>
      </div>
    </div>
  </div>

  <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h2>{{ editingId ? 'Editar Estudiante' : 'Nuevo Estudiante' }}</h2>
      <div class="form-grid">
        <div class="form-group"><label>Nombres</label><input v-model="estudianteForm.nombres" type="text" placeholder="Nombres del estudiante" /></div>
        <div class="form-group"><label>Apellidos</label><input v-model="estudianteForm.apellidos" type="text" placeholder="Apellidos del estudiante" /></div>
        <div class="form-group"><label>Tipo de Documento</label><select v-model="estudianteForm.tipoDocumento"><option value="CC">CC</option><option value="CE">CE</option><option value="PEP">PEP</option></select></div>
        <div class="form-group"><label>Numero de Documento</label><input v-model="estudianteForm.numeroDocumento" type="text" placeholder="Numero de documento" /></div>
        <div class="form-group"><label>Correo Electronico</label><input v-model="estudianteForm.correo" type="email" placeholder="correo@ejemplo.com" /></div>
        <div class="form-group"><label>Telefono</label><input v-model="estudianteForm.telefono" type="tel" placeholder="+57 300 000 0000" /></div>
        <div class="form-group">
          <label>Ficha Asignada</label>
          <select
            v-model="estudianteForm.fichaId"
            :disabled="esInstructor"
            :style="esInstructor ? 'background: #f1f5f9; color: #94a3b8; cursor: not-allowed;' : ''"
          >
            <option :value="null" disabled>Selecciona una ficha</option>
            <option v-for="f in fichasList" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }} ({{ f.jornada }})</option>
          </select>
        </div>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="closeModal">Cancelar</button>
        <button class="btn btn-primary" @click="guardarEstudiante" :disabled="loading">{{ loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear') + ' Estudiante' }}</button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
</template>
