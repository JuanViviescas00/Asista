<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/index.js'
import '../styles/consultaEstudiante.css'

const busqueda = ref('')
const estudianteSeleccionado = ref(null)
const asistenciasEstudiante = ref([])
const excusasEstudiante = ref([])
const loadingDetalle = ref(false)

const todosEstudiantes = ref([])
const fichasList = ref([])

onMounted(async () => {
  try {
    const [estudiantes, fichas] = await Promise.all([api.estudiantes.getAll(), api.fichas.getAll()])
    todosEstudiantes.value = estudiantes.map(e => {
      const ficha = fichas.find(f => f._id === e.fichaId)
      return { ...e, _ficha: ficha }
    })
    fichasList.value = fichas
  } catch (e) {}
})

const resultados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return []
  return todosEstudiantes.value.filter(e => {
    const nombreCompleto = `${e.nombres} ${e.apellidos}`.toLowerCase()
    return nombreCompleto.includes(q) || e.numeroDocumento.toLowerCase().includes(q)
  }).slice(0, 10)
})

async function seleccionarEstudiante(est) {
  estudianteSeleccionado.value = { ...est }
  loadingDetalle.value = true
  try {
    const [asis, exc] = await Promise.all([
      api.asistencias.getAll({ estudianteId: est._id }),
      api.excusas.getAll({ estudianteId: est._id })
    ])
    asistenciasEstudiante.value = asis
    excusasEstudiante.value = exc
  } catch (e) {
    console.error('Error al cargar reporte de estudiante:', e)
  } finally {
    loadingDetalle.value = false
  }
}

function cerrarPerfil() {
  estudianteSeleccionado.value = null
  busqueda.value = ''
  asistenciasEstudiante.value = []
  excusasEstudiante.value = []
}

function limpiarBusqueda() {
  busqueda.value = ''
  estudianteSeleccionado.value = null
  asistenciasEstudiante.value = []
  excusasEstudiante.value = []
}

const metricasEstudiante = computed(() => {
  let presentes = 0, retardos = 0, fallas = 0
  asistenciasEstudiante.value.forEach(a => {
    if (a.tipo === 'Entrada' || a.tipo === 'Presente') presentes++
    else if (a.tipo === 'Retardo' || a.tipo === 'Tardanza') retardos++
    else if (a.tipo === 'Falla' || a.tipo === 'Ausente') fallas++
  })
  const total = presentes + retardos + fallas
  const pct = total > 0 ? Math.round(((presentes + (retardos * 0.5)) / total) * 100) : 100
  return { presentes, retardos, fallas, total, pct }
})

function imprimirReporteIndividual() {
  window.print()
}

function estadoBadge(estado) {
  if (estado === 'Activo') return 'student-consult-badge-success'
  if (estado === 'Inactivo') return 'student-consult-badge-warning'
  return 'student-consult-badge-danger'
}

function asistenciaBadge(estado) {
  if (estado === 'Presente' || estado === 'Entrada') return 'student-consult-badge-success'
  if (estado === 'Retardo' || estado === 'Tardanza') return 'student-consult-badge-warning'
  if (estado === 'Ausente' || estado === 'Falla') return 'student-consult-badge-danger'
  return 'student-consult-badge-neutral'
}
</script>

<template>
  <div class="student-consult-page">
    <div class="student-consult-page-header student-consult-no-print">
      <h1>Panel Consultor de Aprendiz</h1>
      <p>Búsqueda directa por número de documento e historial consolidado de reportes</p>
    </div>

    <!-- Barra de Búsqueda por Documento / Nombres -->
    <div v-if="!estudianteSeleccionado" class="student-consult-card student-consult-no-print">
      <div class="student-consult-search-bar">
        <svg class="student-consult-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="busqueda"
          type="text"
          class="student-consult-search-input"
          placeholder="Ingresa el número de documento o nombre del estudiante..."
          autofocus
        />
        <button v-if="busqueda" class="student-consult-button student-consult-button-outline student-consult-button-small" @click="limpiarBusqueda">Limpiar</button>
      </div>
    </div>

    <!-- Lista de Resultados Coincidentes -->
    <div v-if="!estudianteSeleccionado && busqueda && resultados.length === 0" class="student-consult-card student-consult-no-print">
      <div class="student-consult-empty-state">
        <p>No se encontró ningún estudiante registrado con el documento o término "{{ busqueda }}".</p>
      </div>
    </div>

    <div v-if="!estudianteSeleccionado && resultados.length > 0" class="student-consult-results student-consult-no-print">
      <div v-for="e in resultados" :key="e._id" class="student-consult-result-item" @click="seleccionarEstudiante(e)">
        <div class="student-consult-result-avatar">{{ e.nombres.charAt(0) }}{{ e.apellidos.charAt(0) }}</div>
        <div class="student-consult-result-info">
          <strong>{{ e.nombres }} {{ e.apellidos }}</strong>
          <span>Documento: <strong>{{ e.tipoDocumento }} {{ e.numeroDocumento }}</strong></span>
          <span v-if="e._ficha" class="student-consult-badge student-consult-badge-ficha">Ficha: {{ e._ficha.codigoFicha }} - {{ e._ficha.nombrePrograma }}</span>
        </div>
        <span class="student-consult-badge" :class="estadoBadge(e.estado)">{{ e.estado }}</span>
      </div>
    </div>

    <!-- REPORTE INDIVIDUAL DEL APRENDIZ SELECCIONADO -->
    <div v-if="estudianteSeleccionado" class="reporte-individual-container">
      <div class="student-consult-card student-consult-report-actions student-consult-no-print">
        <div class="student-consult-report-action-group">
          <button class="student-consult-button student-consult-button-outline" @click="cerrarPerfil">⬅ Volver a Búsqueda</button>
          <button class="student-consult-button student-consult-button-primary" @click="imprimirReporteIndividual"> Exportar / Imprimir Reporte (PDF)</button>
        </div>
      </div>

      <!-- Encabezado Oficial Imprimible -->
      <div class="student-consult-printable-report student-consult-card">
        <div class="student-consult-report-header">
          <div class="student-consult-brand-box">
            <h2>SENA</h2>
            <span>Sistema Biométrico de Asistencia</span>
          </div>
          <div class="student-consult-report-title-box">
            <h3>REPORTE INDIVIDUAL DE ASISTENCIA Y TRAZABILIDAD</h3>
            <p>Generado el: {{ new Date().toLocaleDateString() }} - {{ new Date().toLocaleTimeString() }}</p>
          </div>
        </div>

        <!-- Ficha técnica del Aprendiz -->
        <div class="student-consult-profile-summary">
          <div class="student-consult-profile-avatar">
            {{ estudianteSeleccionado.nombres.charAt(0) }}{{ estudianteSeleccionado.apellidos.charAt(0) }}
          </div>
          <div class="student-consult-profile-details">
            <div>
              <span class="student-consult-field-label">Aprendiz:</span>
              <strong class="student-consult-name-value">{{ estudianteSeleccionado.nombres }} {{ estudianteSeleccionado.apellidos }}</strong>
            </div>
            <div>
              <span class="student-consult-field-label">Documento de Identidad:</span>
              <strong>{{ estudianteSeleccionado.tipoDocumento }} - {{ estudianteSeleccionado.numeroDocumento }}</strong>
            </div>
            <div>
              <span class="student-consult-field-label">Correo Electrónico:</span>
              <span>{{ estudianteSeleccionado.correo || '—' }}</span>
            </div>
            <div>
              <span class="student-consult-field-label">Teléfono / Contacto:</span>
              <span>{{ estudianteSeleccionado.telefono || '—' }}</span>
            </div>
            <div>
              <span class="student-consult-field-label">Ficha de Formación:</span>
              <strong>{{ estudianteSeleccionado._ficha ? `${estudianteSeleccionado._ficha.codigoFicha} - ${estudianteSeleccionado._ficha.nombrePrograma}` : 'Sin Ficha' }}</strong>
            </div>
            <div>
              <span class="student-consult-field-label">Jornada y Aula:</span>
              <span>{{ estudianteSeleccionado._ficha ? `${estudianteSeleccionado._ficha.jornada} | ${estudianteSeleccionado._ficha.aulaAsignada}` : '—' }}</span>
            </div>
            <div>
              <span class="student-consult-field-label">Registro Biométrico:</span>
              <strong :style="{ color: estudianteSeleccionado.huellaEnrolada ? '#16a34a' : '#d97706' }">
                {{ estudianteSeleccionado.huellaEnrolada ? ' Huella Enrolada' : ' Huella Pendiente' }}
              </strong>
            </div>
            <div>
              <span class="student-consult-field-label">Estado en Sistema:</span>
              <span class="student-consult-badge" :class="estadoBadge(estudianteSeleccionado.estado)">{{ estudianteSeleccionado.estado }}</span>
            </div>
          </div>
        </div>

        <!-- Resumen Estadístico de Asistencia -->
        <div class="report-stats-section">
          <h4> Resumen Estadístico del Aprendiz</h4>
          <div class="student-consult-stats">
            <div class="student-consult-stat student-consult-stat-present">
              <span class="student-consult-stat-number">{{ metricasEstudiante.presentes }}</span>
              <span class="student-consult-stat-label">Presentes</span>
            </div>
            <div class="student-consult-stat student-consult-stat-late">
              <span class="student-consult-stat-number">{{ metricasEstudiante.retardos }}</span>
              <span class="student-consult-stat-label">Retardos / Tardanzas</span>
            </div>
            <div class="student-consult-stat student-consult-stat-absent">
              <span class="student-consult-stat-number">{{ metricasEstudiante.fallas }}</span>
              <span class="student-consult-stat-label">Fallas / Inasistencias</span>
            </div>
            <div class="student-consult-stat student-consult-stat-index">
              <span class="student-consult-stat-number">{{ metricasEstudiante.pct }}%</span>
              <span class="student-consult-stat-label">Índice Asistencia</span>
            </div>
          </div>
        </div>

        <!-- Tabla Histórica de Marcas -->
        <div class="student-consult-report-table-section">
          <h4> Historial Detallado de Registros de Asistencia</h4>
          <table class="student-consult-data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Tipo de Registro</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asis in asistenciasEstudiante" :key="asis._id">
                <td>{{ asis.fecha }}</td>
                <td>{{ asis.hora }}</td>
                <td>
                  <span class="student-consult-badge" :class="asistenciaBadge(asis.tipo)">{{ asis.tipo }}</span>
                </td>
              </tr>
              <tr v-if="asistenciasEstudiante.length === 0">
                <td colspan="3" class="student-consult-empty-cell">No se registran marcas de asistencia para este aprendiz.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tabla Histórica de Excusas -->
        <div class="student-consult-report-table-section">
          <h4> Historial de Excusas Radicadas</h4>
          <table class="student-consult-data-table">
            <thead>
              <tr>
                <th>Fecha Inasistencia</th>
                <th>Motivo / Justificación</th>
                <th>Estado de Excusa</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="exc in excusasEstudiante" :key="exc._id">
                <td>{{ exc.fechaInasistencia }}</td>
                <td>{{ exc.motivo }}</td>
                <td>
                  <span class="student-consult-badge" :class="exc.estado === 'Aprobada' ? 'student-consult-badge-success' : (exc.estado === 'Rechazada' ? 'student-consult-badge-danger' : 'student-consult-badge-warning')">
                    {{ exc.estado }}
                  </span>
                </td>
              </tr>
              <tr v-if="excusasEstudiante.length === 0">
                <td colspan="3" class="student-consult-empty-cell">No existen excusas radicadas por el aprendiz.</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
</template>

