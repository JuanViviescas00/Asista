<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import api from '../services/index.js'
import StatCard from '../components/StatCard.vue'
import { mostrarAviso } from '../composables/useAviso.js'
import '../styles/panelEstudiante.css'

const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : { id: '', nombre: 'Estudiante', rol: 'Estudiante' })

const estudiante = ref(null)
const ficha = ref(null)
const instructorLider = ref(null)
const asistencias = ref([])
const excusas = ref([])
const loading = ref(true)
const error = ref('')
const filtroTipo = ref('todas') // 'todas' | 'tardanzas' | 'fallas'
const fechaDesde = ref('')
const fechaHasta = ref('')
const pagina = ref(1)
const FILAS_POR_PAGINA = 10

const showNuevaExcusaModal = ref(false)
const nuevaExcusa = ref({
  fechaInasistencia: new Date().toISOString().split('T')[0],
  motivo: ''
})

onMounted(async () => {
  await cargarDatosEstudiante()
})

async function cargarDatosEstudiante() {
  loading.value = true
  error.value = ''
  try {
    const estId = usuario.value.id || usuario.value.estudianteId
    const todosEst = await api.estudiantes.getAll()
    estudiante.value = todosEst.find(e => e._id === estId) || todosEst[0]

    if (estudiante.value && estudiante.value.fichaId) {
      const fichas = await api.fichas.getAll()
      ficha.value = fichas.find(f => f._id === estudiante.value.fichaId)
      if (ficha.value && ficha.value.instructorLiderId) {
        instructorLider.value = ficha.value.instructorLiderId
      }

      // Descripciones de excusa aprobadas (registradas por el instructor o aprobadas)
      try {
        const excRes = await api.excusas.getAll({ fichaId: estudiante.value.fichaId })
        excusas.value = (Array.isArray(excRes) ? excRes : []).filter(e =>
          String(e.estudianteId?._id || e.estudianteId) === String(estudiante.value._id)
        )
      } catch (e) {
        excusas.value = []
      }

      const asisRes = await api.asistencias.getAll({ estudianteId: estudiante.value._id })
      asistencias.value = (asisRes || []).filter(a => String(a.estudianteId?._id || a.estudianteId) === String(estudiante.value._id))
    }
  } catch (err) {
    error.value = err.message || 'Error al cargar información del aprendiz'
  } finally {
    loading.value = false
  }
}

const horasPorJornada = computed(() => {
  const j = (ficha.value?.jornada || '').toLowerCase()
  if (j.includes('noche') || j.includes('nocturna')) return 5
  return 6
})

const resumen = computed(() => {
  let horasRetardo = 0, presentes = 0, tardanzas = 0, fallasSinExcusa = 0, fallasConExcusa = 0
  const hDia = horasPorJornada.value

  asistencias.value.forEach(a => {
    const est = a.estado || a.tipo
    if (est === 'Presente' || est === 'Entrada') presentes++
    else if (est === 'Tardanza' || est === 'Retardo') { tardanzas++; horasRetardo += Number(a.horasTardanza ?? a.horas) || 0 }
    else if (est === 'Excusada') fallasConExcusa++
    else if (est === 'Falta' || est === 'Ausente') fallasSinExcusa++
  })

  const horasSinExcusa = fallasSinExcusa * hDia
  const horasConExcusa = fallasConExcusa * hDia
  const totalHorasFalladas = horasSinExcusa + horasConExcusa

  return {
    presentes,
    tardanzas,
    horasRetardo,
    fallasSinExcusa,
    fallasConExcusa,
    horasSinExcusa,
    horasConExcusa,
    totalHorasFalladas,
    total: asistencias.value.length
  }
})

const asistenciasFiltradas = computed(() => {
  return asistencias.value.filter(a => {
    const f = String(a.fecha || '').slice(0, 10)
    if (fechaDesde.value && f < fechaDesde.value) return false
    if (fechaHasta.value && f > fechaHasta.value) return false
    const est = a.estado || a.tipo
    const esTardanza = est === 'Tardanza' || est === 'Retardo'
    if (filtroTipo.value === 'tardanzas') return esTardanza
    if (filtroTipo.value === 'fallas') return !esTardanza
    return true
  })
})

function limpiarFechas() {
  fechaDesde.value = ''
  fechaHasta.value = ''
}

function horasTardanzaDe(asis) {
  return Number(asis.horasTardanza ?? asis.horas) || 0
}

// --- Historial: quién registró la novedad ---
function estadoDe(asis) {
  return asis.estado || asis.tipo || ''
}

function claseFila(asis) {
  const est = estadoDe(asis)
  if (est === 'Presente' || est === 'Entrada') return 'sp-row-ok'
  if (est === 'Tardanza') return 'sp-row-warn'
  if (est === 'Excusada') return 'sp-row-info'
  return 'sp-row-bad'
}

function nombreRegistrante(asis) {
  const ins = asis.instructorId
  if (ins && typeof ins === 'object') {
    const nombre = `${ins.nombres || ''} ${ins.apellidos || ''}`.trim()
    if (nombre) return nombre
  }
  return ''
}

function inicialesRegistrante(asis) {
  const partes = nombreRegistrante(asis).split(' ').filter(Boolean)
  if (partes.length === 0) return ''
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase()
}

function metodoRegistro(asis) {
  const m = String(asis.metodo || asis.origen || '').toLowerCase()
  if (m === 'huella' || m === 'huellero') return 'Huella'
  if (m === 'manual') return 'Manual'
  return ''
}

// Ordenamiento por columna (clic en el encabezado)
const ordenCol = ref('')
const ordenDir = ref('asc')

function ordenarPor(col) {
  if (ordenCol.value === col) {
    ordenDir.value = ordenDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    ordenCol.value = col
    ordenDir.value = 'asc'
  }
}

function claveOrden(asis, col) {
  if (col === 'fecha') return asis.fecha || ''
  if (col === 'hora') return asis.hora && asis.hora !== '—' ? asis.hora : ''
  if (col === 'estado') return estadoDe(asis)
  if (col === 'registrado') return nombreRegistrante(asis).toLowerCase()
  if (col === 'motivo') return (asis.motivo || asis.motivoInhabilitacion || '').toLowerCase()
  return ''
}

const asistenciasOrdenadas = computed(() => {
  const lista = [...asistenciasFiltradas.value]
  if (!ordenCol.value) return lista
  const dir = ordenDir.value === 'asc' ? 1 : -1
  return lista.sort((a, b) =>
    String(claveOrden(a, ordenCol.value)).localeCompare(String(claveOrden(b, ordenCol.value)), 'es', { numeric: true }) * dir
  )
})

const totalPaginas = computed(() => Math.max(1, Math.ceil(asistenciasOrdenadas.value.length / FILAS_POR_PAGINA)))
const asistenciasPagina = computed(() => {
  const inicio = (pagina.value - 1) * FILAS_POR_PAGINA
  return asistenciasOrdenadas.value.slice(inicio, inicio + FILAS_POR_PAGINA)
})
watch([fechaDesde, fechaHasta, filtroTipo, ordenCol, ordenDir], () => { pagina.value = 1 })

// Fecha -> descripción de la excusa aprobada (la más reciente primero)
const motivosExcusaPorFecha = computed(() => {
  const mapa = {}
  for (const e of excusas.value) {
    if (e.estado !== 'Aprobada' || !e.fechaInasistencia) continue
    if (!mapa[e.fechaInasistencia]) mapa[e.fechaInasistencia] = e.motivo
  }
  return mapa
})

function motivoDeFila(asis) {
  const propio = asis.motivo || asis.motivoInhabilitacion
  if (propio) return propio
  if (estadoDe(asis) === 'Excusada') return motivosExcusaPorFecha.value[asis.fecha] || ''
  return ''
}

async function radicarExcusa() {
  if (!nuevaExcusa.value.motivo.trim()) {
    mostrarAviso('Ingresa el motivo o justificación de la inasistencia', 'warning')
    return
  }
  try {
    await api.excusas.create({
      estudianteId: estudiante.value._id,
      fichaId: estudiante.value.fichaId,
      fechaInasistencia: nuevaExcusa.value.fechaInasistencia,
      motivo: nuevaExcusa.value.motivo,
      estado: 'Pendiente'
    })
    mostrarAviso('Excusa radicada correctamente. Será revisada por tu Instructor.', 'success')
    showNuevaExcusaModal.value = false
    nuevaExcusa.value.motivo = ''
    await cargarDatosEstudiante()
  } catch (err) {
    mostrarAviso('Error al radicar excusa: ' + err.message, 'error')
  }
}
</script>

<template>
  <div class="student-portal-page">
    <div class="page-header">
      <h1>Portal del Aprendiz SENA</h1>
      <p>Consulta de Asistencias, Fichas e Inasistencias Justificadas</p>
      <div class="student-portal-role-pill">Aprendiz</div>
    </div>

    <div v-if="loading" class="student-portal-loading">
      Cargando tu perfil e información de asistencia...
    </div>

    <div v-else-if="error" class="student-portal-error">
      {{ error }}
    </div>

    <div v-else class="student-portal-grid">
      <!-- Tarjeta Perfil & Ficha -->
      <div class="student-portal-profile-card">
        <div class="student-portal-avatar">
          {{ estudiante?.nombres?.charAt(0) }}{{ estudiante?.apellidos?.charAt(0) }}
        </div>
        <h3>{{ estudiante?.nombres }} {{ estudiante?.apellidos }}</h3>
        <p class="student-portal-document">{{ estudiante?.tipoDocumento }} {{ estudiante?.numeroDocumento }}</p>

        <div class="student-portal-info-list">
          <div class="student-portal-info-item">
            <span>Ficha:</span>
            <strong>{{ ficha ? `${ficha.codigoFicha} - ${ficha.nombrePrograma}` : 'No asignada' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Jornada:</span>
            <strong>{{ ficha ? `${ficha.jornada} (${horasPorJornada}h/día)` : '—' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Ambiente:</span>
            <strong>{{ ficha ? ficha.aulaAsignada : '—' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Instructor Líder:</span>
            <strong>{{ instructorLider ? `${instructorLider.nombres} ${instructorLider.apellidos}` : 'No asignado' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Huella Biométrica:</span>
            <strong :style="{ color: estudiante?.huellaEnrolada ? '#16a34a' : '#d97706' }">
              {{ estudiante?.huellaEnrolada ? ' Enrolada' : ' Pendiente de Enrolar' }}
            </strong>
          </div>
        </div>
      </div>

      <!-- Métricas y Registros -->
      <div class="student-portal-main">
        <!-- MÉTRICAS DE HORAS E INASISTENCIAS -->
        <div class="student-portal-stats student-portal-stats-cards">
                    <StatCard class="student-stat-doble" icon="x-circle" label="Inasistencias" :value="`${resumen.fallasSinExcusa + resumen.fallasConExcusa} ${(resumen.fallasSinExcusa + resumen.fallasConExcusa) === 1 ? 'día' : 'días'} · ${resumen.totalHorasFalladas}h`" variant="rojo" />
          <StatCard class="student-stat-doble" icon="clock" label="Horas de Retardo" :value="`${resumen.horasRetardo}h · ${resumen.tardanzas} ${resumen.tardanzas === 1 ? 'tardanza' : 'tardanzas'}`" variant="ambar" />
        </div>

        <!-- FILTRO POR TIPO -->
        <div class="sp-filtro-tipo" role="group" aria-label="Filtrar por tipo">
          <button type="button" class="sp-tipo-btn sp-tipo-todas" :class="{ 'is-active': filtroTipo === 'todas' }" @click="filtroTipo = 'todas'" title="Todas (inasistencias y tardanzas)" aria-label="Todas">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
            <span>Todas</span>
          </button>
          <button type="button" class="sp-tipo-btn sp-tipo-falla" :class="{ 'is-active': filtroTipo === 'fallas' }" @click="filtroTipo = 'fallas'" title="Solo inasistencias" aria-label="Solo inasistencias">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>Inasistencias</span>
          </button>
          <button type="button" class="sp-tipo-btn sp-tipo-tarde" :class="{ 'is-active': filtroTipo === 'tardanzas' }" @click="filtroTipo = 'tardanzas'" title="Solo tardanzas" aria-label="Solo tardanzas">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Tardanzas</span>
          </button>
        </div>

        <!-- FILTRO POR FECHA -->
        <div class="sp-filtro-fecha">
          <label>Desde
            <input type="date" v-model="fechaDesde" :max="fechaHasta || undefined" />
          </label>
          <label>Hasta
            <input type="date" v-model="fechaHasta" :min="fechaDesde || undefined" />
          </label>
          <button v-if="fechaDesde || fechaHasta" type="button" class="sp-filtro-limpiar" @click="limpiarFechas">Limpiar</button>
        </div>

        <!-- Tabla Historial de Asistencia -->
        <div class="student-portal-card sp-hist-card">
          <div class="student-portal-card-header">
            <h3 class="sp-hist-title">Mi Historial de Asistencias e Inasistencias</h3>
            <span class="sp-hist-count">{{ asistenciasOrdenadas.length }} {{ asistenciasOrdenadas.length === 1 ? 'registro' : 'registros' }}</span>
          </div>
          <div class="student-portal-table-container sp-hist-wrap">
            <table class="student-portal-table sp-hist-table">
              <thead>
                <tr>
                  <th :aria-sort="ordenCol === 'fecha' ? (ordenDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button type="button" class="sp-th-btn" @click="ordenarPor('fecha')">
                      Fecha
                      <svg class="sp-sort" :class="{ 'is-asc': ordenCol === 'fecha' && ordenDir === 'asc', 'is-desc': ordenCol === 'fecha' && ordenDir === 'desc' }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9" class="up"/><polyline points="8 15 12 19 16 15" class="down"/></svg>
                    </button>
                  </th>
                  <th :aria-sort="ordenCol === 'hora' ? (ordenDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button type="button" class="sp-th-btn" @click="ordenarPor('hora')">
                      Hora
                      <svg class="sp-sort" :class="{ 'is-asc': ordenCol === 'hora' && ordenDir === 'asc', 'is-desc': ordenCol === 'hora' && ordenDir === 'desc' }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9" class="up"/><polyline points="8 15 12 19 16 15" class="down"/></svg>
                    </button>
                  </th>
                  <th :aria-sort="ordenCol === 'estado' ? (ordenDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button type="button" class="sp-th-btn" @click="ordenarPor('estado')">
                      Estado
                      <svg class="sp-sort" :class="{ 'is-asc': ordenCol === 'estado' && ordenDir === 'asc', 'is-desc': ordenCol === 'estado' && ordenDir === 'desc' }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9" class="up"/><polyline points="8 15 12 19 16 15" class="down"/></svg>
                    </button>
                  </th>
                  <th :aria-sort="ordenCol === 'registrado' ? (ordenDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button type="button" class="sp-th-btn" @click="ordenarPor('registrado')">
                      Registrado por
                      <svg class="sp-sort" :class="{ 'is-asc': ordenCol === 'registrado' && ordenDir === 'asc', 'is-desc': ordenCol === 'registrado' && ordenDir === 'desc' }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9" class="up"/><polyline points="8 15 12 19 16 15" class="down"/></svg>
                    </button>
                  </th>
                  <th :aria-sort="ordenCol === 'motivo' ? (ordenDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                    <button type="button" class="sp-th-btn" @click="ordenarPor('motivo')">
                      Motivo / Justificación
                      <svg class="sp-sort" :class="{ 'is-asc': ordenCol === 'motivo' && ordenDir === 'asc', 'is-desc': ordenCol === 'motivo' && ordenDir === 'desc' }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9" class="up"/><polyline points="8 15 12 19 16 15" class="down"/></svg>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="asis in asistenciasPagina" :key="asis._id" :class="claseFila(asis)">
                  <td>
                    <span class="sp-hist-icono-texto">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {{ asis.fecha }}
                    </span>
                  </td>
                  <td>
                    <span v-if="asis.hora && asis.hora !== '—'" class="sp-hist-icono-texto">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {{ asis.hora }}
                    </span>
                    <span v-else class="sp-hist-sinhora">--:--:--</span>
                  </td>
                  <td>
                    <span v-if="asis.estado === 'Presente' || asis.tipo === 'Presente'" class="sp-pill sp-pill-ok">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><polyline points="7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      Presente
                    </span>
                    <span v-else-if="asis.estado === 'Tardanza' || asis.tipo === 'Tardanza'" class="sp-pill sp-pill-warn">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="currentColor"/><line x1="12" y1="9.5" x2="12" y2="13.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="#fff"/></svg>
                      Tardanza ({{ horasTardanzaDe(asis) }} {{ horasTardanzaDe(asis) === 1 ? 'hr' : 'hrs' }})
                    </span>
                    <span v-else-if="asis.estado === 'Excusada'" class="sp-pill sp-pill-info">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><line x1="12" y1="11" x2="12" y2="16.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="#fff"/></svg>
                      Excusada ({{ horasPorJornada }} hrs)
                    </span>
                    <span v-else class="sp-pill sp-pill-bad">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>
                      Falta ({{ horasPorJornada }} hrs)
                    </span>
                  </td>
                  <td>
                    <div v-if="nombreRegistrante(asis)" class="sp-hist-quien">
                      <span class="sp-hist-avatar" aria-hidden="true">{{ inicialesRegistrante(asis) }}</span>
                      <span class="sp-hist-quien-texto">
                        <span class="sp-hist-quien-nombre">{{ nombreRegistrante(asis) }}</span>
                        <span v-if="metodoRegistro(asis)" class="sp-hist-metodo">{{ metodoRegistro(asis) }}</span>
                      </span>
                    </div>
                    <span v-else class="sp-hist-vacio">—</span>
                  </td>
                  <td>
                    <span v-if="motivoDeFila(asis)" class="sp-hist-motivo">
                      {{ motivoDeFila(asis) }}
                    </span>
                    <span v-else class="sp-hist-vacio">—</span>
                  </td>
                </tr>
                <tr v-if="asistenciasOrdenadas.length === 0">
                  <td colspan="5" class="student-portal-empty-cell">
                    No se encontraron registros con el filtro seleccionado.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="asistenciasOrdenadas.length > 0" class="sp-paginacion">
            <button type="button" class="sp-pag-flecha" :disabled="pagina <= 1" @click="pagina--" title="Anterior" aria-label="Página anterior">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="sp-pag-info">Página {{ pagina }} de {{ totalPaginas }}</span>
            <button type="button" class="sp-pag-flecha" :disabled="pagina >= totalPaginas" @click="pagina++" title="Siguiente" aria-label="Página siguiente">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
