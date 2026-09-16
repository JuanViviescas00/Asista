<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'

const filtroFicha = ref(null)
const fechaDesde = ref('')
const fechaHasta = ref('')
const showRegistrar = ref(false)
const loading = ref(false)
const HORAS_POR_DIA = 6

const registroForm = reactive({
  fichaId: null, estudianteId: null,
  fecha: new Date().toISOString().slice(0, 10),
  estado: 'Presente', hora: '',
})

const fichasList = ref([])
const todosEstudiantes = ref([])
const todasAsistencias = ref([])

onMounted(async () => {
  await Promise.all([loadFichas(), loadEstudiantes(), loadAsistencias(), loadDiasFestivos()])
})

async function loadFichas() { try { fichasList.value = await api.fichas.getAll() } catch (e) {} }
async function loadEstudiantes() { try { todosEstudiantes.value = await api.estudiantes.getAll() } catch (e) {} }

async function loadAsistencias() {
  try {
    const params = {}
    if (filtroFicha.value) params.fichaId = filtroFicha.value
    if (fechaDesde.value) params.fechaDesde = fechaDesde.value
    if (fechaHasta.value) params.fechaHasta = fechaHasta.value
    todasAsistencias.value = await api.asistencias.getAll(params)
  } catch (e) {}
}

function getFichaById(id) { return fichasList.value.find(f => f._id === id) }
function getEstudianteById(id) { return todosEstudiantes.value.find(e => e._id === id) }

const estudiantesDeFicha = computed(() => {
  if (!filtroFicha.value) return []
  return todosEstudiantes.value.filter(e => e.fichaId === filtroFicha.value && e.estado === 'Activo')
})

const estudiantesDeFichaTodos = computed(() => {
  if (!filtroFicha.value) return []
  return todosEstudiantes.value.filter(e => e.fichaId === filtroFicha.value)
})

const asistenciasFiltradas = computed(() => {
  let lista = todasAsistencias.value
  if (filtroFicha.value) lista = lista.filter(a => a.fichaId === filtroFicha.value)
  if (fechaDesde.value) lista = lista.filter(a => a.fecha >= fechaDesde.value)
  if (fechaHasta.value) lista = lista.filter(a => a.fecha <= fechaHasta.value)
  return lista
})

const fechasUnicas = computed(() => {
  const fechas = [...new Set(asistenciasFiltradas.value.map(a => a.fecha))]
  return fechas.sort()
})

const resumenAsistencia = computed(() => {
  let presentes = 0, tardanzas = 0, fallas = 0, excusadas = 0, sinRegistro = 0
  if (filtroFicha.value && fechaDesde.value && fechaHasta.value) {
    const estudiantes = estudiantesDeFicha.value
    estudiantes.forEach(est => {
      const registros = asistenciasFiltradas.value.filter(a => a.estudianteId === est._id)
      if (registros.length === 0) { sinRegistro++; return }
      const tieneFalta = registros.some(r => r.estado === 'Falta')
      const tieneTardanza = registros.some(r => r.estado === 'Tardanza')
      const tieneExcusada = registros.some(r => r.estado === 'Excusada')
      const todosPresente = registros.every(r => r.estado === 'Presente')
      if (tieneFalta) fallas++
      else if (tieneTardanza) tardanzas++
      else if (todosPresente) presentes++
      else if (tieneExcusada) excusadas++
    })
  } else {
    presentes = asistenciasFiltradas.value.filter(a => a.estado === 'Presente').length
    tardanzas = asistenciasFiltradas.value.filter(a => a.estado === 'Tardanza').length
    fallas = asistenciasFiltradas.value.filter(a => a.estado === 'Falta').length
    excusadas = asistenciasFiltradas.value.filter(a => a.estado === 'Excusada').length
  }
  return { presentes, tardanzas, fallas, excusadas, sinRegistro, total: presentes + tardanzas + fallas + excusadas + sinRegistro }
})

const analisisEstudiantes = computed(() => {
  if (!filtroFicha.value || estudiantesDeFichaTodos.value.length === 0) return []
  return estudiantesDeFichaTodos.value.map(est => {
    const registros = asistenciasFiltradas.value.filter(a => a.estudianteId === est._id)
    const totalRegistros = registros.length
    const totalPresentes = registros.filter(r => r.estado === 'Presente').length
    const totalTardanzas = registros.filter(r => r.estado === 'Tardanza').length
    const totalFallas = registros.filter(r => r.estado === 'Falta').length
    const totalExcusadas = registros.filter(r => r.estado === 'Excusada').length
    const porcentaje = totalRegistros > 0 ? Math.round(((totalPresentes + totalExcusadas) / totalRegistros) * 100) : 0
    const fechasFallas = registros.filter(r => r.estado === 'Falta').map(r => r.fecha).sort()
    let maxConsecutivas = 0
    let consecutivasActual = 0
    for (let i = 0; i < fechasFallas.length; i++) {
      if (i === 0) { consecutivasActual = 1 } else {
        const prev = new Date(fechasFallas[i - 1])
        const curr = new Date(fechasFallas[i])
        const diff = (curr - prev) / (1000 * 60 * 60 * 24)
        if (diff <= 2) consecutivasActual++
        else consecutivasActual = 1
      }
      if (consecutivasActual > maxConsecutivas) maxConsecutivas = consecutivasActual
    }
    const horasFalladas = totalFallas * HORAS_POR_DIA
    const alertaDesercion = maxConsecutivas >= 3 || horasFalladas >= 18
    return { estudiante: est, totalRegistros, totalPresentes, totalTardanzas, totalFallas, totalExcusadas, porcentaje, maxConsecutivas, horasFalladas, alertaDesercion }
  }).sort((a, b) => a.porcentaje - b.porcentaje)
})

const estudiantesEnRiesgo = computed(() => analisisEstudiantes.value.filter(a => a.alertaDesercion))

const porcentajeGeneral = computed(() => {
  const analisis = analisisEstudiantes.value
  if (analisis.length === 0) return 0
  return Math.round(analisis.reduce((sum, a) => sum + a.porcentaje, 0) / analisis.length)
})

function getEstadoEstudianteEnFecha(estudianteId, fecha) {
  return asistenciasFiltradas.value.find(a => a.estudianteId === estudianteId && a.fecha === fecha) || null
}

const diasFestivosCache = ref([])

async function loadDiasFestivos() {
  try { diasFestivosCache.value = await api.diasFestivos.getAll() } catch (e) {}
}

function esDiaFestivo(fecha, fichaId) {
  if (fecha) {
    const [y, m, d] = fecha.split('-').map(Number)
    const dt = new Date(y, m - 1, d, 12, 0, 0)
    if (dt.getDay() === 0) {
      return { motivo: 'Domingo', descripcion: 'Día no laboral' }
    }
  }
  return diasFestivosCache.value.find(d => {
    if (d.fecha !== fecha) return false
    if (!d.fichasAplicables || d.fichasAplicables === 'todas') return true
    if (d.fichasAplicables === 'jornada') {
      const f = fichasList.value.find(fi => fi._id === fichaId)
      return f && Array.isArray(d.jornadasSeleccionadas) && d.jornadasSeleccionadas.includes(f.jornada)
    }
    return d.fichasSeleccionadas && d.fichasSeleccionadas.some(s => s === fichaId || s._id === fichaId)
  }) || null
}

function asistenciaBadge(estado) {
  if (estado === 'Presente') return 'badge-success'
  if (estado === 'Tardanza') return 'badge-warning'
  if (estado === 'Excusada') return 'badge-ficha'
  return 'badge-danger'
}

function porcentajeColor(pct) {
  if (pct >= 80) return '#22c55e'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

function abrirRegistrar() {
  registroForm.fichaId = filtroFicha.value
  registroForm.estudianteId = null
  registroForm.fecha = new Date().toISOString().slice(0, 10)
  registroForm.estado = 'Presente'
  registroForm.hora = ''
  showRegistrar.value = true
}

async function registrarAsistencia() {
  if (!registroForm.fichaId || !registroForm.estudianteId || !registroForm.fecha || !registroForm.estado) return
  loading.value = true
  try {
    await api.asistencias.create({
      estudianteId: registroForm.estudianteId,
      fichaId: registroForm.fichaId,
      fecha: registroForm.fecha,
      estado: registroForm.estado,
      hora: registroForm.hora || new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    })
    await loadAsistencias()
    showRegistrar.value = false
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function limpiarFiltros() {
  filtroFicha.value = null
  fechaDesde.value = ''
  fechaHasta.value = ''
}

onMounted(() => loadDiasFestivos())
</script>

<template>
  <div class="page-header">
    <h1>Dashboard de Asistencias</h1>
    <p>Monitoreo en vivo de asistencias, porcentajes y alertas de riesgo de desercion</p>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>Filtros</h3>
      <button class="btn btn-outline btn-sm" @click="limpiarFiltros">Limpiar</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Ficha</label>
        <select v-model="filtroFicha" @change="loadAsistencias()">
          <option :value="null">Todas las fichas</option>
          <option v-for="f in fichasList" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option>
        </select>
      </div>
      <div class="form-group"><label>Fecha Desde</label><input v-model="fechaDesde" type="date" @change="loadAsistencias()" /></div>
      <div class="form-group"><label>Fecha Hasta</label><input v-model="fechaHasta" type="date" @change="loadAsistencias()" /></div>
    </div>
  </div>

  <div v-if="filtroFicha && analisisEstudiantes.length > 0" class="stats-row dash-stats">
    <div class="stat-card stat-presente"><span class="stat-num">{{ porcentajeGeneral }}%</span><span class="stat-label">% Asistencia General</span></div>
    <div class="stat-card stat-tardanza"><span class="stat-num">{{ resumenAsistencia.tardanzas }}</span><span class="stat-label">Tardanzas</span></div>
    <div class="stat-card stat-falta"><span class="stat-num">{{ resumenAsistencia.fallas }}</span><span class="stat-label">Fallas Totales</span></div>
    <div v-if="estudiantesEnRiesgo.length > 0" class="stat-card" style="border-left-color: #ef4444; background: #fef2f2;">
      <span class="stat-num" style="color: #dc2626;">{{ estudiantesEnRiesgo.length }}</span>
      <span class="stat-label" style="color: #dc2626;">En Riesgo</span>
    </div>
  </div>

  <div v-if="estudiantesEnRiesgo.length > 0" class="card alerta-card">
    <div class="card-header">
      <h3 style="color: #dc2626;">Alerta de Riesgo de Desercion</h3>
      <span class="badge badge-danger">{{ estudiantesEnRiesgo.length }} estudiantes</span>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Estudiante</th><th>% Asistencia</th><th>Fallas</th><th>Fallas Seguidas</th><th>Horas Falladas</th><th>Alerta</th></tr></thead>
        <tbody>
          <tr v-for="a in estudiantesEnRiesgo" :key="a.estudiante._id" class="fila-error">
            <td><strong>{{ a.estudiante.nombres }} {{ a.estudiante.apellidos }}</strong><div style="font-size: 11px; color: var(--text-secondary);">{{ a.estudiante.numeroDocumento }}</div></td>
            <td><span :style="{ color: porcentajeColor(a.porcentaje), fontWeight: 700 }">{{ a.porcentaje }}%</span></td>
            <td>{{ a.totalFallas }}</td>
            <td><span v-if="a.maxConsecutivas >= 3" class="badge badge-danger">{{ a.maxConsecutivas }} seguidas</span><span v-else>{{ a.maxConsecutivas }}</span></td>
            <td><span v-if="a.horasFalladas >= 18" class="badge badge-danger">{{ a.horasFalladas }}h</span><span v-else>{{ a.horasFalladas }}h</span></td>
            <td><span v-if="a.maxConsecutivas >= 3" class="badge badge-danger">3+ fallas seguidas</span><span v-if="a.horasFalladas >= 18" class="badge badge-danger" style="display: block; margin-top: 2px;">18h+ falladas</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="filtroFicha && analisisEstudiantes.length > 0" class="card">
    <div class="card-header"><h3>Grafico de Porcentaje de Asistencia por Estudiante</h3></div>
    <div class="grafico-barras">
      <div v-for="a in analisisEstudiantes" :key="a.estudiante._id" class="barra-item">
        <div class="barra-label">{{ a.estudiante.nombres.split(' ')[0] }} {{ a.estudiante.apellidos.split(' ')[0] }}</div>
        <div class="barra-track"><div class="barra-fill" :style="{ width: a.totalRegistros > 0 ? a.porcentaje + '%' : '0%', background: porcentajeColor(a.porcentaje) }"></div></div>
        <div class="barra-valor" :style="{ color: porcentajeColor(a.porcentaje) }">{{ a.totalRegistros > 0 ? a.porcentaje + '%' : 'S/R' }}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>Tabla de Asistencias</h3>
      <div class="btn-group"><button class="btn btn-primary btn-sm" @click="abrirRegistrar">+ Registrar Asistencia</button></div>
    </div>

    <div v-if="!filtroFicha" class="empty-state"><p>Selecciona una ficha y un rango de fechas para ver el registro de asistencias.</p></div>
    <div v-else-if="estudiantesDeFichaTodos.length === 0" class="empty-state"><p>No hay estudiantes en esta ficha.</p></div>
    <div v-else-if="fechasUnicas.length === 0" class="empty-state"><p>No hay registros de asistencia para esta ficha en el rango de fechas seleccionado.</p></div>

    <div v-else class="table-container" style="max-height: 500px; overflow-y: auto;">
      <table>
        <thead>
          <tr>
            <th style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">Estudiante</th>
            <th v-for="fecha in fechasUnicas" :key="fecha" style="position: sticky; top: 0; background: #f8fafc; z-index: 1; text-align: center; min-width: 100px;">{{ fecha.slice(5) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="est in estudiantesDeFichaTodos" :key="est._id" :class="{ 'fila-inactivo': est.estado !== 'Activo' }">
            <td style="min-width: 200px;"><strong>{{ est.nombres }} {{ est.apellidos }}</strong><div style="font-size: 11px; color: var(--text-secondary);">{{ est.numeroDocumento }}</div></td>
            <td v-for="fecha in fechasUnicas" :key="fecha" style="text-align: center;">
              <template v-if="esDiaFestivo(fecha, filtroFicha)">
                <span class="badge badge-festivo" style="font-size: 11px;">{{ esDiaFestivo(fecha, filtroFicha).motivo === 'Festivo' ? 'Festivo' : esDiaFestivo(fecha, filtroFicha).motivo === 'Jornada Pedagogica' ? 'J. Pedag' : 'Receso' }}</span>
              </template>
              <template v-else>
                <span v-if="getEstadoEstudianteEnFecha(est._id, fecha)" class="badge" :class="asistenciaBadge(getEstadoEstudianteEnFecha(est._id, fecha).estado)" style="font-size: 11px;">{{ getEstadoEstudianteEnFecha(est._id, fecha).estado }}<div style="font-size: 10px; opacity: 0.7;">{{ getEstadoEstudianteEnFecha(est._id, fecha).hora }}</div></span>
                <span v-else style="color: #cbd5e1; font-size: 24px;">—</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="showRegistrar" class="modal-overlay" @click.self="showRegistrar = false">
    <div class="modal">
      <h2>Registrar Asistencia</h2>
      <div class="form-grid">
        <div class="form-group"><label>Ficha</label><select v-model="registroForm.fichaId" @change="registroForm.estudianteId = null"><option :value="null" disabled>Selecciona una ficha</option><option v-for="f in fichasList" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option></select></div>
        <div class="form-group"><label>Estudiante</label><select v-model="registroForm.estudianteId"><option :value="null" disabled>Selecciona un estudiante</option><option v-for="e in todosEstudiantes.filter(e => e.fichaId === registroForm.fichaId && e.estado === 'Activo')" :key="e._id" :value="e._id">{{ e.nombres }} {{ e.apellidos }}</option></select></div>
        <div class="form-group"><label>Fecha</label><input v-model="registroForm.fecha" type="date" /></div>
        <div class="form-group"><label>Estado</label><select v-model="registroForm.estado"><option value="Presente">Presente</option><option value="Tardanza">Tardanza</option><option value="Falta">Falta</option></select></div>
        <div class="form-group"><label>Hora</label><input v-model="registroForm.hora" type="time" /></div>
      </div>
      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="showRegistrar = false">Cancelar</button>
        <button class="btn btn-primary" @click="registrarAsistencia" :disabled="loading">Registrar</button>
      </div>
    </div>
  </div>
</template>
