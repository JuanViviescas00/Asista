<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/index.js'
import * as XLSX from 'xlsx'
import {
  analizarInasistenciasGraves,
  LIMITE_DIAS_CONSECUTIVOS,
  LIMITE_DIAS_NO_CONSECUTIVOS,
} from '../utils/inasistencias.js'

const usuarioStr = sessionStorage.getItem('user_data')
const usuario = ref(usuarioStr ? JSON.parse(usuarioStr) : { id: '', rol: 'Administrador' })

const fichasList = ref([])
const todosEstudiantes = ref([])
const todasAsistencias = ref([])
const filtroFicha = ref(null)
const loading = ref(true)

const esInstructor = computed(() => usuario.value?.rol === 'Instructor')

// Fichas que puede ver: todas (Admin) o solo las que lidera (Instructor Líder).
const fichasDisponibles = computed(() => {
  if (!esInstructor.value) return fichasList.value
  return fichasList.value.filter((f) => {
    const liderId = f.instructorLiderId?._id || f.instructorLiderId
    return String(liderId) === String(usuario.value.id)
  })
})

const estudiantesFiltrados = computed(() => {
  if (filtroFicha.value) {
    return todosEstudiantes.value.filter((e) => String(e.fichaId) === String(filtroFicha.value))
  }
  if (esInstructor.value) {
    const ids = fichasDisponibles.value.map((f) => String(f._id))
    return todosEstudiantes.value.filter((e) => ids.includes(String(e.fichaId)))
  }
  return todosEstudiantes.value
})

const analisis = computed(() =>
  analizarInasistenciasGraves(estudiantesFiltrados.value, todasAsistencias.value)
)

const consecutivos = computed(() => analisis.value.filter((a) => a.consecutivoGrave))
const noConsecutivos = computed(() => analisis.value.filter((a) => a.noConsecutivoGrave && !a.consecutivoGrave))

const etiquetaConsecutivos = computed(() => `${LIMITE_DIAS_CONSECUTIVOS}+ días consecutivos`)
const etiquetaNoConsecutivos = computed(() => `${LIMITE_DIAS_NO_CONSECUTIVOS}+ días no consecutivos`)

function getFichaNombre(fichaId) {
  const f = fichasList.value.find((f) => String(f._id) === String(fichaId))
  return f ? `${f.codigoFicha} - ${f.nombrePrograma}` : 'Sin ficha'
}

function colorPorcentaje(pct) {
  if (pct >= 80) return '#22c55e'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

function descargarExcel(lista, nombre) {
  if (!lista.length) return
  const data = lista.map((a) => ({
    Aprendiz: `${a.estudiante.nombres} ${a.estudiante.apellidos}`,
    Documento: a.estudiante.numeroDocumento || '',
    Ficha: getFichaNombre(a.estudiante.fichaId),
    Correo: a.estudiante.correo || '',
    Teléfono: a.estudiante.telefono || '',
    'Fallas Totales': a.totalFallas,
    'Racha Máxima Consecutiva': a.rachaMaxima,
    '% Asistencia': `${a.porcentaje}%`,
    'Fechas Falladas': a.fechasFallas.join(', '),
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento')
  XLSX.writeFile(wb, `${nombre}.xlsx`)
}

onMounted(async () => {
  loading.value = true
  try {
    const [fichas, estudiantes, asistencias] = await Promise.all([
      api.fichas.getAll(),
      api.estudiantes.getAll(),
      api.asistencias.getAll(),
    ])
    fichasList.value = fichas
    todosEstudiantes.value = estudiantes
    todasAsistencias.value = asistencias
  } catch (e) {
    console.error('Error cargando datos de seguimiento:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page-header">
    <h1>Seguimiento de Inasistencias Graves</h1>
    <p>Identifica a los aprendices con faltas más severas para hacerles seguimiento académico</p>
  </div>

  <div v-if="loading" class="empty-state"><p>Cargando información de inasistencias…</p></div>

  <template v-else>
    <!-- Selector de ficha (Admin) o acceso restringido (Instructor sin ficha líder) -->
    <div class="card">
      <div class="card-header">
        <h3>Parámetros de Consulta</h3>
      </div>

      <div
        v-if="esInstructor && fichasDisponibles.length === 0"
        class="alert alert-error"
        style="max-width: 100%;"
      >
        No tienes fichas asignadas como Líder, por lo tanto no puedes consultar el seguimiento de inasistencias.
      </div>

      <div v-else class="form-grid">
        <div class="form-group">
          <label>Ficha de Formación</label>
          <select v-model="filtroFicha">
            <option :value="null">
              {{ esInstructor ? 'Todas mis fichas' : 'Todas las fichas' }}
            </option>
            <option v-for="f in fichasDisponibles" :key="f._id" :value="f._id">
              {{ f.codigoFicha }} - {{ f.nombrePrograma }}
            </option>
          </select>
        </div>
      </div>

      <!-- Resumen -->
      <div class="stats-row" style="margin-top: 20px;">
        <div class="stat-card" style="border-left-color: #ef4444;">
          <span class="stat-num" style="color: #ef4444;">{{ consecutivos.length }}</span>
          <span class="stat-label">Con {{ etiquetaConsecutivos }}</span>
        </div>
        <div class="stat-card" style="border-left-color: #f59e0b;">
          <span class="stat-num" style="color: #f59e0b;">{{ noConsecutivos.length }}</span>
          <span class="stat-label">Con {{ etiquetaNoConsecutivos }}</span>
        </div>
        <div class="stat-card stat-sinregistro">
          <span class="stat-num">{{ estudiantesFiltrados.length }}</span>
          <span class="stat-label">Aprendices evaluados</span>
        </div>
      </div>
    </div>

    <!-- GRUPO 1: DIAS CONSECUTIVOS -->
    <div class="card" style="border-top: 4px solid #ef4444;">
      <div class="card-header">
        <div>
          <h3 style="color: #ef4444;">🚨 {{ etiquetaConsecutivos }} fallados</h3>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">
            Aprendices que acumulan faltas seguidas. Requieren intervención prioritaria.
          </p>
        </div>
        <button
          class="btn btn-outline btn-sm"
          :disabled="consecutivos.length === 0"
          @click="descargarExcel(consecutivos, 'Seguimiento_Inasistencias_Consecutivas')"
        >
          Exportar Excel
        </button>
      </div>

      <div v-if="consecutivos.length === 0" class="empty-state">
        <p>No hay aprendices con {{ etiquetaConsecutivos }} fallados.</p>
      </div>

      <div v-else class="table-container">
        <table>
          <thead>
            <tr>
              <th>Aprendiz</th>
              <th>Documento</th>
              <th>Ficha</th>
              <th>Contacto</th>
              <th>Fallas Totales</th>
              <th>Racha Máxima</th>
              <th>% Asistencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in consecutivos" :key="a.estudiante._id" class="fila-error">
              <td>
                <strong>{{ a.estudiante.nombres }} {{ a.estudiante.apellidos }}</strong>
                <div style="font-size: 11px; color: #64748b;">
                  Fallas: {{ a.fechasFallas.join(', ') }}
                </div>
              </td>
              <td>{{ a.estudiante.tipoDocumento }} {{ a.estudiante.numeroDocumento }}</td>
              <td><span class="badge badge-ficha">{{ getFichaNombre(a.estudiante.fichaId) }}</span></td>
              <td style="font-size: 12px;">
                <div>{{ a.estudiante.correo || '—' }}</div>
                <div>{{ a.estudiante.telefono || '—' }}</div>
              </td>
              <td><span class="badge badge-danger">{{ a.totalFallas }}</span></td>
              <td><span class="badge badge-danger">{{ a.rachaMaxima }} seguidas</span></td>
              <td>
                <strong :style="{ color: colorPorcentaje(a.porcentaje) }">{{ a.porcentaje }}%</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- GRUPO 2: DIAS NO CONSECUTIVOS -->
    <div class="card" style="border-top: 4px solid #f59e0b;">
      <div class="card-header">
        <div>
          <h3 style="color: #b45309;">⚠️ {{ etiquetaNoConsecutivos }} fallados</h3>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">
            Aprendices con faltas acumuladas (no necesariamente seguidas). Requieren seguimiento.
          </p>
        </div>
        <button
          class="btn btn-outline btn-sm"
          :disabled="noConsecutivos.length === 0"
          @click="descargarExcel(noConsecutivos, 'Seguimiento_Inasistencias_No_Consecutivas')"
        >
          Exportar Excel
        </button>
      </div>

      <div v-if="noConsecutivos.length === 0" class="empty-state">
        <p>No hay aprendices con {{ etiquetaNoConsecutivos }} fallados.</p>
      </div>

      <div v-else class="table-container">
        <table>
          <thead>
            <tr>
              <th>Aprendiz</th>
              <th>Documento</th>
              <th>Ficha</th>
              <th>Contacto</th>
              <th>Fallas Totales</th>
              <th>Racha Máxima</th>
              <th>% Asistencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in noConsecutivos" :key="a.estudiante._id">
              <td>
                <strong>{{ a.estudiante.nombres }} {{ a.estudiante.apellidos }}</strong>
                <div style="font-size: 11px; color: #64748b;">
                  Fallas: {{ a.fechasFallas.join(', ') }}
                </div>
              </td>
              <td>{{ a.estudiante.tipoDocumento }} {{ a.estudiante.numeroDocumento }}</td>
              <td><span class="badge badge-ficha">{{ getFichaNombre(a.estudiante.fichaId) }}</span></td>
              <td style="font-size: 12px;">
                <div>{{ a.estudiante.correo || '—' }}</div>
                <div>{{ a.estudiante.telefono || '—' }}</div>
              </td>
              <td><span class="badge badge-warning">{{ a.totalFallas }}</span></td>
              <td>{{ a.rachaMaxima }}</td>
              <td>
                <strong :style="{ color: colorPorcentaje(a.porcentaje) }">{{ a.porcentaje }}%</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
</template>
