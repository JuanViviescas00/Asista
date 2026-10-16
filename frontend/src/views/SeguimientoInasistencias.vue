<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/index.js'
import * as XLSX from 'xlsx'
import {
  analizarInasistenciasGraves,
  LIMITE_DIAS_CONSECUTIVOS,
  LIMITE_DIAS_NO_CONSECUTIVOS,
} from '../utils/inasistencias.js'
import { apodoPrograma, formatearNumeroDocumento } from '../utils/textos.js'
import StatCard from '../components/StatCard.vue'

const usuarioStr = sessionStorage.getItem('user_data')
const usuario = ref(usuarioStr ? JSON.parse(usuarioStr) : { id: '', rol: 'Administrador' })

const fichasList = ref([])
const todosEstudiantes = ref([])
const todasAsistencias = ref([])
const filtroFicha = ref(null)
const loading = ref(true)

const esInstructor = computed(() => usuario.value?.rol === 'Instructor')

// Fichas disponibles: todas (Admin) o todas en las que el docente dicta clase (Líder o de Apoyo).
const fichasDisponibles = computed(() => {
  if (!esInstructor.value) return fichasList.value
  const miId = String(usuario.value?.id || '')
  return fichasList.value.filter((f) => {
    const liderId = f.instructorLiderId?._id || f.instructorLiderId
    const esLider = String(liderId) === miId
    const esDocente = Array.isArray(f.instructores) && f.instructores.some((inst) => {
      const instId = inst?._id || inst
      return String(instId) === miId
    })
    return f.esLider || esLider || esDocente
  })
})

const estudiantesFiltrados = computed(() => {
  if (filtroFicha.value) {
    const targetFicha = fichasList.value.find((f) => String(f._id) === String(filtroFicha.value))
    const validIds = [String(filtroFicha.value)]
    if (targetFicha?.codigoFicha) validIds.push(String(targetFicha.codigoFicha).trim())

    return todosEstudiantes.value.filter((e) => {
      const eFichaId = e.fichaId?._id || e.fichaId
      return validIds.includes(String(eFichaId).trim())
    })
  }

  if (esInstructor.value) {
    const validIds = []
    fichasDisponibles.value.forEach((f) => {
      validIds.push(String(f._id))
      if (f.codigoFicha) validIds.push(String(f.codigoFicha).trim())
    })
    return todosEstudiantes.value.filter((e) => {
      const eFichaId = e.fichaId?._id || e.fichaId
      return validIds.includes(String(eFichaId).trim())
    })
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
  const targetId = fichaId?._id || fichaId
  const f = fichasList.value.find((f) => String(f._id) === String(targetId) || String(f.codigoFicha).trim() === String(targetId).trim())
  return f ? `${f.codigoFicha} - ${f.nombrePrograma}` : 'Sin ficha'
}

function getFichaApodo(fichaId) {
  const targetId = fichaId?._id || fichaId
  const f = fichasList.value.find((f) => String(f._id) === String(targetId) || String(f.codigoFicha).trim() === String(targetId).trim())
  return f ? apodoPrograma(f.nombrePrograma) : 'Sin ficha'
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
    const promises = [
      esInstructor.value && usuario.value?.id
        ? api.fichas.getMisFichas(usuario.value.id)
        : api.fichas.getAll(),
      api.estudiantes.getAll(),
      api.asistencias.getAll(),
    ]
    const [fichas, estudiantes, asistencias] = await Promise.all(promises)
    fichasList.value = Array.isArray(fichas) ? fichas : []
    todosEstudiantes.value = Array.isArray(estudiantes) ? estudiantes : []
    todasAsistencias.value = Array.isArray(asistencias) ? asistencias : []
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
    <!-- Selector de ficha (Admin / Instructor con sus fichas de formación) -->
    <div class="card">
      <div class="card-header">
        <h3>Parámetros de Consulta</h3>
      </div>

      <div
        v-if="esInstructor && fichasDisponibles.length === 0"
        class="alert alert-error"
        style="max-width: 100%;"
      >
        No tienes fichas asignadas actualmente. Contacta al Administrador para que te asigne a tus grupos de formación.
      </div>

      <div v-else class="form-grid">
        <div class="form-group">
          <label>Ficha de Formación</label>
          <select v-model="filtroFicha">
            <option :value="null">
              {{ esInstructor ? 'Todas mis fichas asignadas' : 'Todas las fichas' }}
            </option>
            <option v-for="f in fichasDisponibles" :key="f._id" :value="f._id">
              {{ f.codigoFicha }} - {{ f.nombrePrograma }} {{ f.esLider ? '(Líder)' : '' }}
            </option>
          </select>
        </div>
      </div>

      <!-- Resumen -->
      <div class="stats-row" style="margin-top: 20px;">
        <StatCard icon="alert-triangle" :label="`Con ${etiquetaConsecutivos}`" :value="consecutivos.length" variant="rojo" />
        <StatCard icon="clock" :label="`Con ${etiquetaNoConsecutivos}`" :value="noConsecutivos.length" variant="ambar" />
        <StatCard icon="users" label="Aprendices evaluados" :value="estudiantesFiltrados.length" variant="gris" />
      </div>
    </div>

    <!-- GRUPO 1: DIAS CONSECUTIVOS -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 style="color: #ef4444;"> {{ etiquetaConsecutivos }} fallados</h3>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">
            Aprendices que acumulan faltas seguidas. Requieren intervención prioritaria.
          </p>
        </div>
        <button
          class="btn btn-outline btn-sm"
          :disabled="consecutivos.length === 0"
          @click="descargarExcel(consecutivos, 'Seguimiento_Inasistencias_Consecutivas')"
          title="Exportar Excel"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
              <td :title="`${a.estudiante.tipoDocumento} ${a.estudiante.numeroDocumento}`">{{ a.estudiante.tipoDocumento }} {{ formatearNumeroDocumento(a.estudiante.numeroDocumento) }}</td>
              <td><span class="badge badge-ficha" :title="getFichaNombre(a.estudiante.fichaId)">{{ getFichaApodo(a.estudiante.fichaId) }}</span></td>
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
    <div class="card">
      <div class="card-header">
        <div>
          <h3 style="color: #b45309;"> {{ etiquetaNoConsecutivos }} fallados</h3>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">
            Aprendices con faltas acumuladas (no necesariamente seguidas). Requieren seguimiento.
          </p>
        </div>
        <button
          class="btn btn-outline btn-sm"
          :disabled="noConsecutivos.length === 0"
          @click="descargarExcel(noConsecutivos, 'Seguimiento_Inasistencias_No_Consecutivas')"
          title="Exportar Excel"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
              <td :title="`${a.estudiante.tipoDocumento} ${a.estudiante.numeroDocumento}`">{{ a.estudiante.tipoDocumento }} {{ formatearNumeroDocumento(a.estudiante.numeroDocumento) }}</td>
              <td><span class="badge badge-ficha" :title="getFichaNombre(a.estudiante.fichaId)">{{ getFichaApodo(a.estudiante.fichaId) }}</span></td>
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
