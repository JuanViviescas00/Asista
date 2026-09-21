<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'
import { nombreProgramaLimpio, truncar, formatearNumeroDocumento } from '../utils/textos.js'
import StatCard from '../components/StatCard.vue'

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
const expandidos = ref({})

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

function getFichaProgramaCompleto(fichaId) {
  if (!fichaId) return '—'
  const ficha = getFichaById(fichaId)
  return ficha ? nombreProgramaLimpio(ficha.nombrePrograma) : 'No asignada'
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

function getFichaPrograma(fichaId) {
  return acortarNombre(getFichaProgramaCompleto(fichaId))
}

function getFichaCodigo(fichaId) {
  if (!fichaId) return '—'
  const ficha = getFichaById(fichaId)
  return ficha ? ficha.codigoFicha : '—'
}

function toggleDetalle(id) {
  expandidos.value[id] = !expandidos.value[id]
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

function activosCount() { return estudiantes.value.filter(e => e.estado === 'Activo').length }
function inactivosCount() { return estudiantes.value.filter(e => e.estado === 'Inactivo').length }
function retiradosCount() { return estudiantes.value.filter(e => e.estado === 'Retirado').length }
</script>

<template>
  <div class="page-header">
    <h1>Estudiantes</h1>
    <p v-if="esInstructor">
      ‍ Mostrando únicamente los aprendices de <strong>tus fichas asignadas</strong>.
    </p>
    <p v-else>
      Gestiona los estudiantes. Al inhabilitar o retirar se conserva la trazabilidad.
    </p>
    <div v-if="esInstructor" style="display: inline-block; margin-top: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid #6ee7b7; color: #065f46; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
      Fichas asignadas: {{ fichasList.length }}
    </div>
  </div>

  <div class="stats-row">
    <StatCard icon="check-circle" label="Activos" :value="activosCount()" variant="verde" />
    <StatCard icon="minus-circle" label="Inactivos" :value="inactivosCount()" variant="ambar" />
    <StatCard icon="user-x" label="Retirados" :value="retiradosCount()" variant="rojo" />
  </div>

  <div class="card">
    <div class="card-header">
      <h3>Busqueda Avanzada</h3>
      <div class="btn-group">
        <button v-if="criteriosActivos > 0" class="btn btn-outline btn-sm" @click="limpiarBusqueda" title="Limpiar filtros"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="btn btn-outline btn-sm" @click="busquedaAvanzadaAbierta = !busquedaAvanzadaAbierta" title="Mostrar u ocultar búsqueda"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
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
      <div class="form-group"><label>Jornada</label><select v-model="busqueda.jornada"><option value="">Todas las jornadas</option><option value="Mañana"> Mañana</option><option value="Tarde"> Tarde</option><option value="Noche"> Noche</option></select></div>
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
      <button v-if="!esInstructor" class="btn btn-primary" @click="openCreate" title="Nuevo Estudiante"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
    </div>

    <div v-if="estudiantesFiltrados.length === 0" class="empty-state">
      <p>{{ criteriosActivos > 0 ? 'No se encontraron estudiantes con los criterios de busqueda.' : 'No hay estudiantes registrados. Crea el primero usando el boton "Nuevo Estudiante".' }}</p>
    </div>

    <div v-else class="table-container">
      <table class="est-tabla">
        <colgroup>
          <col class="col-nombre">
          <col class="col-ficha-num">
          <col class="col-ficha">
          <col class="col-estado">
          <col class="col-acciones">
        </colgroup>
        <thead>
          <tr>
            <th>Nombre</th><th>N° Ficha</th><th>Ficha</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="e in estudiantesFiltrados" :key="e._id">
            <tr :class="{ 'fila-inactivo': e.estado !== 'Activo' }">
              <td><strong :title="nombreCompleto(e)">{{ truncar(nombreCompleto(e), 28) }}</strong></td>
              <td><strong>{{ getFichaCodigo(e.fichaId) }}</strong></td>
              <td><span class="badge badge-ficha est-ficha-nombre" :title="getFichaProgramaCompleto(e.fichaId)">{{ getFichaPrograma(e.fichaId) }}</span></td>
              <td><span class="badge" :class="estadoBadge(e.estado)">{{ e.estado }}</span></td>
              <td>
              <div class="btn-group">
                <template v-if="esLiderDeEstudiante(e)">
                  <button class="btn btn-outline btn-sm" @click="openEdit(e)" title="Editar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                  <template v-if="e.estado === 'Activo'">
                    <button class="btn btn-warning btn-sm" @click="abrirRetirar(e, 'Inactivo')" title="Inhabilitar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
                    <button class="btn btn-danger btn-sm" @click="abrirRetirar(e, 'Retirado')" title="Retirar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg></button>
                  </template>
                  <button v-else class="btn btn-success btn-sm" @click="activarEstudiante(e)" title="Activar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>
                </template>
                <span v-else style="font-size: 12px; color: #94a3b8;">Solo líder de ficha</span>
                <button class="btn btn-outline btn-sm est-toggle" :class="{ 'est-toggle-abierto': expandidos[e._id] }" :aria-expanded="!!expandidos[e._id]" @click="toggleDetalle(e._id)" :title="expandidos[e._id] ? 'Ocultar información' : 'Ver más información'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
              </div>
              </td>
            </tr>
            <tr v-if="expandidos[e._id]" class="est-detalle-fila">
              <td colspan="5">
                <div class="est-detalle">
                  <div class="est-detalle-item"><span class="est-detalle-label">Documento</span><span :title="`${e.tipoDocumento} ${e.numeroDocumento}`"><span class="doc-tipo">{{ e.tipoDocumento }}</span> {{ formatearNumeroDocumento(e.numeroDocumento) }}</span></div>
                  <div class="est-detalle-item"><span class="est-detalle-label">Correo</span><span>{{ e.correo || '—' }}</span></div>
                  <div class="est-detalle-item"><span class="est-detalle-label">Teléfono</span><span>{{ e.telefono || '—' }}</span></div>
                  <div class="est-detalle-item"><span class="est-detalle-label">Jornada</span><span>{{ getJornada(e.fichaId) }}</span></div>
                  <div v-if="e.estado !== 'Activo' && e.motivo" class="est-detalle-item est-detalle-motivo"><span class="est-detalle-label">Motivo</span><span>{{ e.motivo }}</span></div>
                </div>
              </td>
            </tr>
          </template>
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
        <button class="btn btn-outline" @click="showRetirarModal = false" title="Cancelar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="btn btn-danger" @click="confirmarRetirar" title="Confirmar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>
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
        <button class="btn btn-outline" @click="closeModal" title="Cancelar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="btn btn-primary" @click="guardarEstudiante" :disabled="loading" title="Guardar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
</template>

<style>
/* Anchos de columna controlados para evitar espacios vacíos anchos entre columnas.
   El ancho total de la tabla no cambia (sigue siendo 100% del contenedor),
   solo se distribuye el espacio interno de forma proporcional al contenido. */
.est-tabla { table-layout: fixed; }
.est-tabla .col-nombre { width: 30%; }
.est-tabla .col-ficha-num { width: 11%; }
.est-tabla .col-ficha { width: 25%; }
.est-tabla .col-estado { width: 13%; }
.est-tabla .col-acciones { width: 21%; }

.est-tabla td:last-child .btn-group { justify-content: flex-start; }
.est-tabla td, .est-tabla th { overflow: hidden; text-overflow: ellipsis; }
.est-tabla td:last-child, .est-tabla th:last-child { overflow: visible; }
.est-ficha-nombre { white-space: nowrap; font-size: 12px; }
.est-toggle svg { transition: transform .2s ease; }
.est-toggle-abierto svg { transform: rotate(180deg); }
.est-detalle-fila td { padding: 0; background: var(--verde-tenue); }
.est-detalle-fila:hover { background: var(--verde-tenue) !important; }
.est-detalle { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px 24px; padding: 18px 20px; }
.est-detalle-item { display: flex; flex-direction: column; gap: 4px; font-size: 14px; min-width: 0; overflow-wrap: anywhere; }
.est-detalle-label { font-size: 12px; font-weight: 600; color: var(--texto-suave); }
.est-detalle-motivo { grid-column: 1 / -1; }

@media (max-width: 640px) {
  .est-tabla { min-width: 620px; }
  .est-tabla th, .est-tabla td { padding: 12px 10px; }
  .est-detalle { grid-template-columns: 1fr; gap: 12px 16px; padding: 16px; }
}
</style>
