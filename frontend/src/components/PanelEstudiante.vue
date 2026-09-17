<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../services/index.js'
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
const filtroInasistencias = ref('todas') // 'todas', 'sin_excusa', 'con_excusa'

const showNuevaExcusaModal = ref(false)
const nuevaExcusa = ref({
  fechaInasistencia: new Date().toISOString().split('T')[0],
  motivo: ''
})

const emit = defineEmits(['cerrar-sesion'])

function cerrarSesion() {
  sessionStorage.removeItem('admin_auth')
  sessionStorage.removeItem('user_data')
  emit('cerrar-sesion')
}

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

      const asisRes = await api.asistencias.getAll({ estudianteId: estudiante.value._id })
      asistencias.value = asisRes
    }
  } catch (err) {
    error.value = err.message || 'Error al cargar información del aprendiz'
  } finally {
    loading.value = false
  }
}

const horasPorJornada = computed(() => {
  const j = (ficha.value?.jornada || '').toLowerCase()
  if (j.includes('noche') || j.includes('nocturna')) return 4
  return 6
})

const resumen = computed(() => {
  let presentes = 0, tardanzas = 0, fallasSinExcusa = 0, fallasConExcusa = 0
  const hDia = horasPorJornada.value

  asistencias.value.forEach(a => {
    const est = a.estado || a.tipo
    if (est === 'Presente' || est === 'Entrada') presentes++
    else if (est === 'Tardanza' || est === 'Retardo') tardanzas++
    else if (est === 'Excusada') fallasConExcusa++
    else if (est === 'Falta' || est === 'Ausente') fallasSinExcusa++
  })

  const horasSinExcusa = fallasSinExcusa * hDia
  const horasConExcusa = fallasConExcusa * hDia
  const totalHorasFalladas = horasSinExcusa + horasConExcusa

  return {
    presentes,
    tardanzas,
    fallasSinExcusa,
    fallasConExcusa,
    horasSinExcusa,
    horasConExcusa,
    totalHorasFalladas,
    total: asistencias.value.length
  }
})

const asistenciasFiltradas = computed(() => {
  if (filtroInasistencias.value === 'sin_excusa') {
    return asistencias.value.filter(a => {
      const est = a.estado || a.tipo
      return est === 'Falta' || est === 'Ausente'
    })
  }
  if (filtroInasistencias.value === 'con_excusa') {
    return asistencias.value.filter(a => {
      const est = a.estado || a.tipo
      return est === 'Excusada'
    })
  }
  return asistencias.value
})

async function radicarExcusa() {
  if (!nuevaExcusa.value.motivo.trim()) {
    alert('Ingresa el motivo o justificación de la inasistencia')
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
    alert('Excusa radicada correctamente. Será revisada por tu Instructor.')
    showNuevaExcusaModal.value = false
    nuevaExcusa.value.motivo = ''
    await cargarDatosEstudiante()
  } catch (err) {
    alert('Error al radicar excusa: ' + err.message)
  }
}
</script>

<template>
  <div class="student-portal-page">
    <div class="student-portal-header">
      <div>
        <h2>Portal del Aprendiz SENA</h2>
        <p class="student-portal-subtitle">Consulta de Asistencias, Fichas e Inasistencias Justificadas</p>
      </div>
      <div style="display: flex; gap: 12px; align-items: center;">
        <span class="student-portal-role">Aprendiz</span>
        <button class="student-portal-logout" @click="cerrarSesion">
          🚪 Cerrar Sesión
        </button>
      </div>
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
            <span>Aula:</span>
            <strong>{{ ficha ? ficha.aulaAsignada : '—' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Instructor Líder:</span>
            <strong>{{ instructorLider ? `${instructorLider.nombres} ${instructorLider.apellidos}` : 'No asignado' }}</strong>
          </div>
          <div class="student-portal-info-item">
            <span>Huella Biométrica:</span>
            <strong :style="{ color: estudiante?.huellaEnrolada ? '#16a34a' : '#d97706' }">
              {{ estudiante?.huellaEnrolada ? '🟢 Enrolada' : '🟡 Pendiente de Enrolar' }}
            </strong>
          </div>
        </div>
      </div>

      <!-- Métricas y Registros -->
      <div class="student-portal-main">
        <!-- MÉTRICAS DE HORAS E INASISTENCIAS -->
        <div class="student-portal-stats" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));">
          <div class="student-portal-stat student-portal-stat-present">
            <span class="student-portal-stat-number">{{ resumen.presentes }}</span>
            <span class="student-portal-stat-label">Presentes</span>
          </div>
          <div class="student-portal-stat student-portal-stat-late">
            <span class="student-portal-stat-number">{{ resumen.tardanzas }}</span>
            <span class="student-portal-stat-label">Tardanzas</span>
          </div>
          <div class="student-portal-stat" style="border-left: 4px solid #6366f1; background: #f8fafc; padding: 12px; border-radius: 8px;">
            <span class="student-portal-stat-number" style="color: #4f46e5;">{{ resumen.totalHorasFalladas }}h</span>
            <span class="student-portal-stat-label" style="font-size: 11px; font-weight: 700;">Total Horas Ausente</span>
          </div>
          <div class="student-portal-stat student-portal-stat-absent" style="border-left: 4px solid #ef4444;">
            <span class="student-portal-stat-number" style="color: #dc2626;">{{ resumen.horasSinExcusa }}h</span>
            <span class="student-portal-stat-label" style="font-size: 11px; font-weight: 700;">❌ Sin Excusa</span>
          </div>
          <div class="student-portal-stat" style="border-left: 4px solid #0284c7; background: #f0f9ff; padding: 12px; border-radius: 8px;">
            <span class="student-portal-stat-number" style="color: #0284c7;">{{ resumen.horasConExcusa }}h</span>
            <span class="student-portal-stat-label" style="font-size: 11px; font-weight: 700;">📋 Con Excusa</span>
          </div>
        </div>

        <!-- FILTROS DE HISTORIAL -->
        <div style="margin: 16px 0; display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            class="btn btn-sm"
            :class="filtroInasistencias === 'todas' ? 'btn-primary' : 'btn-outline'"
            @click="filtroInasistencias = 'todas'"
          >
            📊 Todo el Historial
          </button>
          <button
            class="btn btn-sm"
            :class="filtroInasistencias === 'sin_excusa' ? 'btn-danger' : 'btn-outline'"
            @click="filtroInasistencias = 'sin_excusa'"
          >
            ❌ Solo Sin Excusa (Injustificadas)
          </button>
          <button
            class="btn btn-sm"
            :class="filtroInasistencias === 'con_excusa' ? 'btn-info' : 'btn-outline'"
            @click="filtroInasistencias = 'con_excusa'"
          >
            📋 Solo Con Excusa (Justificadas)
          </button>
        </div>

        <!-- Tabla Historial de Asistencia -->
        <div class="student-portal-card">
          <div class="student-portal-card-header">
            <h3>Mi Historial de Asistencias e Inasistencias</h3>
          </div>
          <div class="student-portal-table-container">
            <table class="student-portal-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Estado</th>
                  <th>Motivo / Justificación</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="asis in asistenciasFiltradas" :key="asis._id">
                  <td><strong>{{ asis.fecha }}</strong></td>
                  <td>{{ asis.hora || '—' }}</td>
                  <td>
                    <span
                      v-if="asis.estado === 'Presente' || asis.tipo === 'Presente'"
                      class="student-portal-badge student-portal-badge-success"
                    >
                      Presente
                    </span>
                    <span
                      v-else-if="asis.estado === 'Tardanza' || asis.tipo === 'Tardanza'"
                      class="student-portal-badge student-portal-badge-warning"
                    >
                      Tardanza
                    </span>
                    <span
                      v-else-if="asis.estado === 'Excusada'"
                      class="student-portal-badge"
                      style="background: #e0f2fe; color: #0369a1; font-weight: 700;"
                    >
                      📋 Excusada ({{ horasPorJornada }} hrs)
                    </span>
                    <span
                      v-else
                      class="student-portal-badge student-portal-badge-danger"
                    >
                      ❌ Falta ({{ horasPorJornada }} hrs)
                    </span>
                  </td>
                  <td>
                    <span v-if="asis.motivo || asis.motivoInhabilitacion" style="color: #475569; font-size: 13px;">
                      {{ asis.motivo || asis.motivoInhabilitacion }}
                    </span>
                    <span v-else style="color: #94a3b8; font-size: 12px;">—</span>
                  </td>
                </tr>
                <tr v-if="asistenciasFiltradas.length === 0">
                  <td colspan="4" class="student-portal-empty-cell">
                    No se encontraron registros para el filtro seleccionado.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
