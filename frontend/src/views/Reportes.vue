<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/index.js'

// Parámetros principales de búsqueda
const filtroFicha = ref(null)
const filtroInstructor = ref('todos') // 'todos' o ID del instructor
const filtroEstudiante = ref('todos') // 'todos' o ID del estudiante
const busquedaTexto = ref('') // Búsqueda libre por nombre, documento o docente
const fechaDesde = ref('')
const fechaHasta = ref('')
const formato = ref('pdf')
const showPreview = ref(false)
const filtroTipoInasistencia = ref('todas') // 'todas', 'sin_excusa', 'con_excusa'
const vistaReporte = ref('aprendices') // 'aprendices', 'docentes', 'sesiones'

const fichasList = ref([])
const todosInstructores = ref([])
const todosEstudiantes = ref([])
const todasAsistencias = ref([])

const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : { id: '', rol: 'Administrador' })

const fichasLideradas = computed(() => {
  if (usuario.value.rol === 'Administrador') {
    return fichasList.value
  }
  // Para instructor: solo las fichas que lidera
  return fichasList.value.filter(f => {
    const liderId = f.instructorLiderId?._id || f.instructorLiderId
    return String(liderId) === String(usuario.value.id)
  })
})

onMounted(async () => {
  try {
    const [fichas, instructores, estudiantes, asistencias] = await Promise.all([
      api.fichas.getAll(),
      api.instructores.getAll().catch(() => []),
      api.estudiantes.getAll(),
      api.asistencias.getAll()
    ])
    fichasList.value = fichas
    todosInstructores.value = instructores
    todosEstudiantes.value = estudiantes
    todasAsistencias.value = asistencias
  } catch (e) {
    console.error('Error al cargar datos de reportes:', e)
  }
})

const fichaSeleccionada = computed(() => fichasList.value.find(f => f._id === filtroFicha.value))

const horasPorJornada = computed(() => {
  const j = (fichaSeleccionada.value?.jornada || '').toLowerCase()
  if (j.includes('noche') || j.includes('nocturna')) return 4
  return 6 // Mañana, Tarde o Mixta estándar 6 horas
})

const estudiantesFicha = computed(() => {
  if (!filtroFicha.value) return []
  return todosEstudiantes.value.filter(e => e.fichaId === filtroFicha.value)
})

// Asistencias filtradas por Ficha, Rango de Fecha y Opcionalmente por Instructor
const asistenciasFichaFiltradas = computed(() => {
  if (!filtroFicha.value) return []
  return todasAsistencias.value.filter(a => {
    if (a.fichaId !== filtroFicha.value) return false
    if (fechaDesde.value && a.fecha < fechaDesde.value) return false
    if (fechaHasta.value && a.fecha > fechaHasta.value) return false

    if (filtroInstructor.value !== 'todos') {
      const instId = a.instructorId?._id || a.instructorId
      if (String(instId) !== String(filtroInstructor.value)) return false
    }
    return true
  })
})

// Lista de instructores que han dictado clases a esta Ficha
const instructoresDeLaFicha = computed(() => {
  if (!filtroFicha.value) return []
  const instIds = new Set()
  todasAsistencias.value
    .filter(a => a.fichaId === filtroFicha.value)
    .forEach(a => {
      const id = a.instructorId?._id || a.instructorId
      if (id) instIds.add(String(id))
    })

  return todosInstructores.value.filter(i => instIds.has(String(i._id)))
})

const fechasUnicas = computed(() => {
  let fechas = [...new Set(asistenciasFichaFiltradas.value.map(a => a.fecha))]
  return fechas.sort()
})

// Helper para extraer nombre del instructor de un registro
function getNombreInstructor(reg) {
  if (!reg || !reg.instructorId) return 'Sin asignar / Registro Kiosco'
  if (typeof reg.instructorId === 'object') {
    return `${reg.instructorId.nombres || ''} ${reg.instructorId.apellidos || ''}`.trim() || reg.instructorId.nombre || 'Instructor'
  }
  const inst = todosInstructores.value.find(i => String(i._id) === String(reg.instructorId))
  if (inst) return `${inst.nombres} ${inst.apellidos}`
  return 'Instructor'
}

// 1. DATOS POR APRENDIZ (CON DETALLE DE DOCENTE EN CADA INASISTENCIA)
const datosReporteAprendices = computed(() => {
  const hDia = horasPorJornada.value
  return estudiantesFicha.value.map(est => {
    let presentes = 0, tardanzas = 0, fallasSinExcusa = 0, fallasConExcusa = 0
    let horasTardanza = 0
    const detallesInasistencias = []

    fechasUnicas.value.forEach(fecha => {
      const reg = asistenciasFichaFiltradas.value.find(a => a.estudianteId === est._id && a.fecha === fecha)
      if (reg) {
        const docenteNombre = getNombreInstructor(reg)
        if (reg.estado === 'Presente') {
          presentes++
        } else if (reg.estado === 'Tardanza') {
          tardanzas++
          horasTardanza += Number(reg.horasTardanza) || 0
        } else if (reg.estado === 'Excusada') {
          fallasConExcusa++
          detallesInasistencias.push({
            fecha,
            docente: docenteNombre,
            tipo: 'Excusada',
            horas: hDia,
            motivo: reg.motivo || reg.motivoInhabilitacion || 'Sin motivo detallado'
          })
        } else if (reg.estado === 'Falta' || reg.estado === 'Ausente') {
          fallasSinExcusa++
          detallesInasistencias.push({
            fecha,
            docente: docenteNombre,
            tipo: 'Injustificada',
            horas: hDia,
            motivo: 'Falta injustificada'
          })
        }
      }
    })

    const totalDias = presentes + tardanzas + fallasSinExcusa + fallasConExcusa
    const porcentaje = totalDias > 0 ? Math.round(((presentes + (tardanzas * 0.5)) / totalDias) * 100) : 0

    const horasSinExcusa = fallasSinExcusa * hDia
    const horasConExcusa = fallasConExcusa * hDia
    const horasTotalesFalladas = horasSinExcusa + horasConExcusa

    return {
      estudiante: est,
      presentes,
      tardanzas,
      horasTardanza,
      fallasSinExcusa,
      fallasConExcusa,
      horasSinExcusa,
      horasConExcusa,
      horasTotalesFalladas,
      detallesInasistencias,
      totalDias,
      porcentaje
    }
  })
})

// FILTRADO DINÁMICO POR BÚSQUEDA DE TEXTO, ESTUDIANTE, DOCENTE Y HORAS
const datosReporteAprendicesFiltrados = computed(() => {
  let lista = datosReporteAprendices.value

  // Filtro por estudiante seleccionado en el dropdown
  if (filtroEstudiante.value !== 'todos') {
    lista = lista.filter(r => String(r.estudiante._id) === String(filtroEstudiante.value))
  }

  // Filtro por tipo de inasistencia (horas)
  if (filtroTipoInasistencia.value === 'sin_excusa') {
    lista = lista.filter(r => r.horasSinExcusa > 0)
  } else if (filtroTipoInasistencia.value === 'con_excusa') {
    lista = lista.filter(r => r.horasConExcusa > 0)
  }

  // Búsqueda de texto libre (Nombre del estudiante, documento, o nombre del profesor)
  const q = busquedaTexto.value.trim().toLowerCase()
  if (q) {
    lista = lista.filter(r => {
      const nombreEst = `${r.estudiante.nombres} ${r.estudiante.apellidos}`.toLowerCase()
      const docEst = String(r.estudiante.numeroDocumento || '').toLowerCase()
      const coincideEst = nombreEst.includes(q) || docEst.includes(q)

      const coincideDocente = r.detallesInasistencias.some(d =>
        d.docente.toLowerCase().includes(q) || d.motivo.toLowerCase().includes(q)
      )

      return coincideEst || coincideDocente
    })
  }

  return lista
})

// 2. DATOS CONSOLIDADOS POR DOCENTE / MATERIA
const datosReporteDocentes = computed(() => {
  const hDia = horasPorJornada.value
  const mapaDocentes = {}

  asistenciasFichaFiltradas.value.forEach(a => {
    const instId = a.instructorId?._id || a.instructorId || 'sin_asignar'
    const nombre = getNombreInstructor(a)
    const especialidad = a.instructorId?.especialidad || 'Formación Técnica'

    if (!mapaDocentes[instId]) {
      mapaDocentes[instId] = {
        id: instId,
        nombre,
        especialidad,
        fechasSet: new Set(),
        totalPresentes: 0,
        totalTardanzas: 0,
        totalFallasSinExcusa: 0,
        totalFallasConExcusa: 0,
        totalRegistros: 0
      }
    }

    mapaDocentes[instId].fechasSet.add(a.fecha)
    mapaDocentes[instId].totalRegistros++

    if (a.estado === 'Presente') mapaDocentes[instId].totalPresentes++
    else if (a.estado === 'Tardanza') mapaDocentes[instId].totalTardanzas++
    else if (a.estado === 'Excusada') mapaDocentes[instId].totalFallasConExcusa++
    else if (a.estado === 'Falta' || a.estado === 'Ausente') mapaDocentes[instId].totalFallasSinExcusa++
  })

  let resultado = Object.values(mapaDocentes).map(d => {
    const clasesDictadas = d.fechasSet.size
    const horasDictadas = clasesDictadas * hDia
    const totalAusencias = d.totalFallasSinExcusa + d.totalFallasConExcusa
    const totalMarcaciones = d.totalPresentes + d.totalTardanzas + totalAusencias
    const porcentaje = totalMarcaciones > 0 ? Math.round(((d.totalPresentes + (d.totalTardanzas * 0.5)) / totalMarcaciones) * 100) : 0

    return {
      ...d,
      clasesDictadas,
      horasDictadas,
      totalAusencias,
      horasAusentes: totalAusencias * hDia,
      horasSinExcusa: d.totalFallasSinExcusa * hDia,
      horasConExcusa: d.totalFallasConExcusa * hDia,
      porcentaje
    }
  }).sort((a, b) => b.clasesDictadas - a.clasesDictadas)

  // Filtro por búsqueda de texto
  const q = busquedaTexto.value.trim().toLowerCase()
  if (q) {
    resultado = resultado.filter(d =>
      d.nombre.toLowerCase().includes(q) || d.especialidad.toLowerCase().includes(q)
    )
  }

  return resultado
})

// 3. DATOS POR SESIÓN / FECHA DE CLASE
const datosReporteSesiones = computed(() => {
  const hDia = horasPorJornada.value
  let sesiones = fechasUnicas.value.map(fecha => {
    const registrosFecha = asistenciasFichaFiltradas.value.filter(a => a.fecha === fecha)
    const primerReg = registrosFecha[0]
    const docente = getNombreInstructor(primerReg)

    let presentes = 0, tardanzas = 0, fallasSinExcusa = 0, fallasConExcusa = 0
    registrosFecha.forEach(r => {
      if (r.estado === 'Presente') presentes++
      else if (r.estado === 'Tardanza') tardanzas++
      else if (r.estado === 'Excusada') fallasConExcusa++
      else fallasSinExcusa++
    })

    const total = presentes + tardanzas + fallasSinExcusa + fallasConExcusa
    const porcentaje = total > 0 ? Math.round(((presentes + (tardanzas * 0.5)) / total) * 100) : 0

    return {
      fecha,
      docente,
      horasSesion: hDia,
      presentes,
      tardanzas,
      fallasSinExcusa,
      fallasConExcusa,
      total,
      porcentaje
    }
  }).reverse()

  const q = busquedaTexto.value.trim().toLowerCase()
  if (q) {
    sesiones = sesiones.filter(s =>
      s.docente.toLowerCase().includes(q) || s.fecha.toLowerCase().includes(q)
    )
  }

  return sesiones
})

const resumenReporte = computed(() => {
  const d = datosReporteAprendices.value
  return {
    totalEstudiantes: d.length,
    totalPresentes: d.reduce((s, r) => s + r.presentes, 0),
    totalTardanzas: d.reduce((s, r) => s + r.tardanzas, 0),
    totalHorasSinExcusa: d.reduce((s, r) => s + r.horasSinExcusa, 0),
    totalHorasConExcusa: d.reduce((s, r) => s + r.horasConExcusa, 0),
    totalHorasFalladas: d.reduce((s, r) => s + r.horasTotalesFalladas, 0),
    totalDocentesActivos: datosReporteDocentes.value.length,
    totalSesionesDictadas: fechasUnicas.value.length,
    porcentajeGeneral: d.length > 0 ? Math.round(d.reduce((s, r) => s + r.porcentaje, 0) / d.length) : 0,
  }
})

async function generarReporte() {
  if (!filtroFicha.value) return
  try {
    const [estudiantes, asistencias] = await Promise.all([
      api.estudiantes.getAll({ fichaId: filtroFicha.value }),
      api.asistencias.getAll({ fichaId: filtroFicha.value, fechaDesde: fechaDesde.value || '', fechaHasta: fechaHasta.value || '' }),
    ])
    todosEstudiantes.value = estudiantes
    todasAsistencias.value = asistencias
    showPreview.value = true
  } catch (e) {
    console.error(e)
  }
}

function getFechaActual() {
  return new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

function descargarPDF() {
  const contenido = document.getElementById('reporte-print')
  if (!contenido) return
  const ventana = window.open('', '_blank', 'width=1150,height=850')
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Asistencias SENA</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:30px;color:#1e293b;font-size:12px}h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#64748b;margin-bottom:16px;font-weight:600}.info{background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px}.info p{margin:4px 0}.resumen{display:flex;gap:12px;margin-bottom:20px}.resumen div{flex:1;text-align:center;padding:12px;border-radius:8px;background:#f1f5f9}.resumen strong{display:block;font-size:22px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}.badge-danger{color:#dc2626;font-weight:bold}.badge-info{color:#0284c7;font-weight:bold}.badge-warning{color:#d97706;font-weight:bold}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}@media print{body{padding:15px}}</style></head><body>${contenido.innerHTML}</body></html>`)
  ventana.document.close()
  setTimeout(() => ventana.print(), 500)
}

function descargarXLSX() {
  const f = fichaSeleccionada.value
  let csv = '\uFEFFREPORTE DETALLADO DE ASISTENCIAS E INASISTENCIAS SENA\n'
  csv += `Ficha: ${f ? f.codigoFicha + ' - ' + f.nombrePrograma : ''}\n`
  csv += `Jornada: ${f ? f.jornada : ''} (${horasPorJornada.value}h/dia) | Aula: ${f ? f.aulaAsignada : ''}\n`
  csv += `Periodo: ${fechaDesde.value || 'Inicio'} al ${fechaHasta.value || 'Fin'}\n`
  csv += `Filtro Docente: ${filtroInstructor.value === 'todos' ? 'Todos' : (todosInstructores.value.find(i => String(i._id) === String(filtroInstructor.value))?.nombres || 'Docente')}\n`
  csv += `Filtro Aprendiz: ${filtroEstudiante.value === 'todos' ? 'Todos' : (todosEstudiantes.value.find(e => String(e._id) === String(filtroEstudiante.value))?.nombres || 'Aprendiz')}\n`
  csv += `Búsqueda Texto: ${busquedaTexto.value || 'Ninguna'}\n`
  csv += `Generado: ${getFechaActual()}\n\n`

  if (vistaReporte.value === 'docentes') {
    csv += 'Instructor,Especialidad,Clases_Dictadas,Horas_Dictadas,Total_Presentes,Total_Tardanzas,Hrs_Sin_Excusa,Hrs_Con_Excusa,% Asistencia\n'
    datosReporteDocentes.value.forEach(d => {
      csv += `"${d.nombre}","${d.especialidad}",${d.clasesDictadas},${d.horasDictadas} hrs,${d.totalPresentes},${d.totalTardanzas},${d.horasSinExcusa} hrs,${d.horasConExcusa} hrs,${d.porcentaje}%\n`
    })
  } else {
    csv += 'Tipo_Doc,Num_Doc,Aprendiz,Presentes,Tardanzas,Hrs_Total_Falladas,Hrs_Sin_Excusa,Hrs_Con_Excusa,% Asistencia,Detalle_Inasistencias_Docentes\n'
    datosReporteAprendicesFiltrados.value.forEach(r => {
      const detalleStr = `"${r.detallesInasistencias.map(d => `${d.fecha} (${d.docente}: ${d.tipo} - ${d.motivo})`).join('; ')}"`
      csv += `${r.estudiante.tipoDocumento},${r.estudiante.numeroDocumento},"${r.estudiante.nombres} ${r.estudiante.apellidos}",${r.presentes},${r.tardanzas},${r.horasTotalesFalladas} hrs,${r.horasSinExcusa} hrs,${r.horasConExcusa} hrs,${r.porcentaje}%,${detalleStr}\n`
    })
  }

  csv += `\nCONSOLIDADO INSTITUCIONAL\nTotal Estudiantes,${resumenReporte.value.totalEstudiantes}\n% Asistencia General,${resumenReporte.value.porcentajeGeneral}%\nTotal Horas Falladas,${resumenReporte.value.totalHorasFalladas} hrs\nTotal Horas Sin Excusa (Injustificadas),${resumenReporte.value.totalHorasSinExcusa} hrs\nTotal Horas Con Excusa (Justificadas),${resumenReporte.value.totalHorasConExcusa} hrs\nDocentes Activos en Ficha,${resumenReporte.value.totalDocentesActivos}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Reporte_Asistencias_${f ? f.codigoFicha : 'ficha'}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function limpiar() {
  filtroFicha.value = null
  filtroInstructor.value = 'todos'
  filtroEstudiante.value = 'todos'
  busquedaTexto.value = ''
  fechaDesde.value = ''
  fechaHasta.value = ''
  filtroTipoInasistencia.value = 'todas'
  vistaReporte.value = 'aprendices'
  showPreview.value = false
}
</script>

<template>
  <div class="page-header">
    <h1>Reportes, Inasistencias y Filtros Avanzados</h1>
    <p>Consulta y exporta el historial de asistencias filtrando simultáneamente por Aprendiz, Docente y Rango de Fechas</p>
  </div>

  <div v-if="usuario.rol === 'Instructor' && fichasLideradas.length === 0" class="card" style="background: #fff1f2; border-color: #fecdd3; color: #9f1239; padding: 20px;">
    <strong>🔒 Acceso Restringido a Reportes:</strong> Como Docente Común no tienes asignada ninguna Ficha bajo tu liderazgo. La generación de reportes está reservada para el Administrador o Docente Líder de Ficha.
  </div>

  <div v-else class="card">
    <div class="card-header"><h3>Parámetros de Búsqueda y Filtrado</h3></div>
    
    <!-- GRID DE FILTROS PRINCIPALES -->
    <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
      <!-- 1. Selector de Ficha -->
      <div class="form-group">
        <label>🏫 Ficha de Formación <span style="color: #ef4444;">*</span></label>
        <select v-model="filtroFicha" @change="showPreview = false; filtroEstudiante = 'todos'; filtroInstructor = 'todos'">
          <option :value="null" disabled>Selecciona una ficha</option>
          <option v-for="f in fichasLideradas" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option>
        </select>
      </div>

      <!-- 2. Filtro por Docente / Materia -->
      <div class="form-group">
        <label>👨‍🏫 Docente / Instructor</label>
        <select v-model="filtroInstructor" :disabled="!filtroFicha">
          <option value="todos">Todos los Docentes / Clases</option>
          <option v-for="inst in instructoresDeLaFicha" :key="inst._id" :value="inst._id">
            {{ inst.nombres }} {{ inst.apellidos }} ({{ inst.especialidad || 'Docente' }})
          </option>
        </select>
      </div>

      <!-- 3. Filtro por Aprendiz / Estudiante -->
      <div class="form-group">
        <label>👤 Aprendiz Específico</label>
        <select v-model="filtroEstudiante" :disabled="!filtroFicha">
          <option value="todos">Todos los Aprendices</option>
          <option v-for="est in estudiantesFicha" :key="est._id" :value="est._id">
            {{ est.nombres }} {{ est.apellidos }} ({{ est.numeroDocumento }})
          </option>
        </select>
      </div>

      <!-- 4. Rango de Fechas -->
      <div class="form-group">
        <label>📅 Fecha Desde</label>
        <input v-model="fechaDesde" type="date" />
      </div>

      <div class="form-group">
        <label>📅 Fecha Hasta</label>
        <input v-model="fechaHasta" type="date" />
      </div>

      <!-- 5. Formato -->
      <div class="form-group">
        <label>📄 Formato de Descarga</label>
        <select v-model="formato">
          <option value="pdf">PDF (Impresión / Comité)</option>
          <option value="xlsx">XLSX (CSV Excel)</option>
        </select>
      </div>
    </div>

    <!-- BARRA DE BÚSQUEDA LIBRE EN VIVO -->
    <div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 12px; border: 1.5px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px;">
      <label style="font-weight: 700; font-size: 13px; color: #1e293b; display: flex; align-items: center; gap: 6px;">
        <span>🔍</span> Búsqueda Rápida en Vivo (Aprendiz o Docente):
      </label>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input
          v-model="busquedaTexto"
          type="text"
          placeholder="Escribe el nombre del aprendiz, número de documento o nombre del docente..."
          style="flex: 1; padding: 10px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px;"
        />
        <button v-if="busquedaTexto" class="btn btn-outline btn-sm" @click="busquedaTexto = ''">
          ✕ Limpiar
        </button>
      </div>
    </div>

    <!-- FILTRO RÁPIDO DE INASISTENCIAS (HORAS CON/SIN EXCUSA) -->
    <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
      <span style="font-weight: 700; font-size: 13px; color: #475569;">Filtro de Horas:</span>
      <button
        class="btn btn-sm"
        :class="filtroTipoInasistencia === 'todas' ? 'btn-primary' : 'btn-outline'"
        @click="filtroTipoInasistencia = 'todas'"
      >
        📊 Horas Totales (Todas)
      </button>
      <button
        class="btn btn-sm"
        :class="filtroTipoInasistencia === 'sin_excusa' ? 'btn-danger' : 'btn-outline'"
        @click="filtroTipoInasistencia = 'sin_excusa'"
      >
        ❌ Solo Sin Excusa (Injustificadas)
      </button>
      <button
        class="btn btn-sm"
        :class="filtroTipoInasistencia === 'con_excusa' ? 'btn-info' : 'btn-outline'"
        @click="filtroTipoInasistencia = 'con_excusa'"
      >
        📋 Solo Con Excusa (Justificadas)
      </button>
    </div>

    <div class="btn-group" style="margin-top: 20px;">
      <button class="btn btn-primary" :disabled="!filtroFicha" @click="generarReporte">
        🔍 Consultar y Generar Reporte
      </button>
      <button class="btn btn-outline" @click="limpiar">Limpiar Filtros</button>
    </div>
  </div>

  <div v-if="showPreview && fichaSeleccionada" id="reporte-print">
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <!-- Selector de Vista del Reporte -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'aprendices' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'aprendices'"
          >
            👤 Vista por Aprendiz ({{ datosReporteAprendicesFiltrados.length }})
          </button>
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'docentes' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'docentes'"
          >
            👨‍🏫 Vista por Docente ({{ datosReporteDocentes.length }})
          </button>
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'sesiones' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'sesiones'"
          >
            📅 Vista por Sesión ({{ datosReporteSesiones.length }})
          </button>
        </div>

        <div class="btn-group">
          <button v-if="formato === 'pdf'" class="btn btn-primary btn-sm" @click="descargarPDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar PDF
          </button>
          <button v-else class="btn btn-success btn-sm" @click="descargarXLSX">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar CSV (Excel)
          </button>
        </div>
      </div>

      <div class="reporte-header">
        <h2>REPORTE OFICIAL DE ASISTENCIAS E INASISTENCIAS</h2>
        <p>SENA - Centro de Formación | Comité de Evaluación y Seguimiento</p>
      </div>

      <div class="reporte-info">
        <div class="reporte-info-item"><strong>Ficha:</strong> {{ fichaSeleccionada.codigoFicha }} - {{ fichaSeleccionada.nombrePrograma }}</div>
        <div class="reporte-info-item"><strong>Jornada:</strong> {{ fichaSeleccionada.jornada }} ({{ horasPorJornada }} horas/sesión)</div>
        <div class="reporte-info-item"><strong>Aula:</strong> {{ fichaSeleccionada.aulaAsignada }}</div>
        <div class="reporte-info-item"><strong>Filtro Docente:</strong> {{ filtroInstructor === 'todos' ? 'Todos los Profesores' : (todosInstructores.find(i => String(i._id) === String(filtroInstructor))?.nombres || 'Docente') }}</div>
        <div class="reporte-info-item"><strong>Filtro Aprendiz:</strong> {{ filtroEstudiante === 'todos' ? 'Todos los Aprendices' : (todosEstudiantes.find(e => String(e._id) === String(filtroEstudiante))?.nombres || 'Aprendiz') }}</div>
        <div class="reporte-info-item"><strong>Periodo Consultado:</strong> {{ fechaDesde || 'Inicio' }} al {{ fechaHasta || 'Fin' }}</div>
        <div class="reporte-info-item"><strong>Fecha de Generación:</strong> {{ getFechaActual() }}</div>
      </div>

      <!-- MÉTRICAS CONSOLIDADAS DE HORAS Y DOCENTES -->
      <div class="stats-row" style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px;">
        <div class="stat-card stat-presente">
          <span class="stat-num">{{ resumenReporte.porcentajeGeneral }}%</span>
          <span class="stat-label">Asistencia General</span>
        </div>
        <div class="stat-card" style="border-left-color: #6366f1;">
          <span class="stat-num">{{ resumenReporte.totalHorasFalladas }}h</span>
          <span class="stat-label">Total Horas Ausente</span>
        </div>
        <div class="stat-card" style="border-left-color: #ef4444;">
          <span class="stat-num" style="color: #ef4444;">{{ resumenReporte.totalHorasSinExcusa }}h</span>
          <span class="stat-label">❌ Sin Excusa</span>
        </div>
        <div class="stat-card" style="border-left-color: #0284c7;">
          <span class="stat-num" style="color: #0284c7;">{{ resumenReporte.totalHorasConExcusa }}h</span>
          <span class="stat-label">📋 Con Excusa</span>
        </div>
        <div class="stat-card" style="border-left-color: #8b5cf6;">
          <span class="stat-num">{{ resumenReporte.totalDocentesActivos }}</span>
          <span class="stat-label">Docentes Registrados</span>
        </div>
        <div class="stat-card" style="border-left-color: #f59e0b;">
          <span class="stat-num">{{ resumenReporte.totalSesionesDictadas }}</span>
          <span class="stat-label">Sesiones de Clase</span>
        </div>
      </div>

      <!-- ============================================= -->
      <!-- VISTA 1: DESGLOSE POR APRENDIZ                -->
      <!-- ============================================= -->
      <div v-if="vistaReporte === 'aprendices'">
        <div v-if="datosReporteAprendicesFiltrados.length === 0" class="empty-state">
          <p>No se encontraron aprendices que coincidan con los filtros de búsqueda aplicados.</p>
        </div>

        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Aprendiz</th>
                <th>Documento</th>
                <th>Presentes</th>
                <th>Tardanzas</th>
                <th>Horas Totales Ausente</th>
                <th>❌ Sin Excusa</th>
                <th>📋 Con Excusa</th>
                <th>Inasistencias por Fecha y Docente a Cargo</th>
                <th>% Asistencia</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in datosReporteAprendicesFiltrados" :key="r.estudiante._id">
                <td>{{ idx + 1 }}</td>
                <td><strong>{{ r.estudiante.nombres }} {{ r.estudiante.apellidos }}</strong></td>
                <td>{{ r.estudiante.tipoDocumento }} {{ r.estudiante.numeroDocumento }}</td>
                <td><span class="badge badge-success">{{ r.presentes }} d</span></td>
                <td><span class="badge badge-warning">{{ r.tardanzas }}</span></td>
                <td>
                  <strong style="font-size: 14px; color: #1e293b;">
                    {{ r.horasTotalesFalladas }} hrs
                  </strong>
                </td>
                <td>
                  <span class="badge badge-danger" style="font-size: 13px;">
                    {{ r.horasSinExcusa }} hrs ({{ r.fallasSinExcusa }} d)
                  </span>
                </td>
                <td>
                  <span v-if="r.horasConExcusa > 0" class="badge badge-info" style="font-size: 13px;">
                    📋 {{ r.horasConExcusa }} hrs ({{ r.fallasConExcusa }} d)
                  </span>
                  <span v-else style="color: #94a3b8; font-size: 12px;">—</span>
                </td>
                <td>
                  <div v-if="r.detallesInasistencias.length > 0" style="font-size: 11px; max-width: 340px;">
                    <div
                      v-for="(det, detIdx) in r.detallesInasistencias"
                      :key="detIdx"
                      style="margin-bottom: 4px; padding: 4px 6px; border-radius: 4px; background: #f8fafc; border-left: 3px solid;"
                      :style="{ borderColor: det.tipo === 'Excusada' ? '#0284c7' : '#ef4444' }"
                    >
                      <strong>{{ det.fecha }} ({{ det.horas }}h)</strong> - 👨‍🏫 {{ det.docente }}:
                      <span :style="{ color: det.tipo === 'Excusada' ? '#0369a1' : '#dc2626' }">
                        {{ det.tipo === 'Excusada' ? `📋 ${det.motivo}` : '❌ Injustificada' }}
                      </span>
                    </div>
                  </div>
                  <span v-else style="color: #16a34a; font-weight: 600; font-size: 12px;">✅ Sin inasistencias</span>
                </td>
                <td>
                  <strong :style="{ color: r.porcentaje >= 80 ? '#22c55e' : r.porcentaje >= 60 ? '#f59e0b' : '#ef4444' }">
                    {{ r.totalDias > 0 ? r.porcentaje + '%' : 'S/R' }}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================================= -->
      <!-- VISTA 2: DESGLOSE POR DOCENTE / MATERIA       -->
      <!-- ============================================= -->
      <div v-else-if="vistaReporte === 'docentes'">
        <div v-if="datosReporteDocentes.length === 0" class="empty-state">
          <p>No se encontraron registros de docentes para los filtros aplicados.</p>
        </div>

        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Instructor / Docente</th>
                <th>Especialidad / Materia</th>
                <th>Clases Dictadas</th>
                <th>Horas Dictadas</th>
                <th>Asistencias Marcadas</th>
                <th>Tardanzas</th>
                <th>❌ Horas Sin Excusa</th>
                <th>📋 Horas Con Excusa</th>
                <th>% Asistencia en sus Clases</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, idx) in datosReporteDocentes" :key="d.id">
                <td>{{ idx + 1 }}</td>
                <td><strong>👨‍🏫 {{ d.nombre }}</strong></td>
                <td><span class="badge badge-info">{{ d.especialidad }}</span></td>
                <td><strong>{{ d.clasesDictadas }} sesiones</strong></td>
                <td><span style="color: #475569; font-weight: 700;">{{ d.horasDictadas }} hrs</span></td>
                <td><span class="badge badge-success">{{ d.totalPresentes }}</span></td>
                <td><span class="badge badge-warning">{{ d.totalTardanzas }}</span></td>
                <td><span class="badge badge-danger">{{ d.horasSinExcusa }} hrs</span></td>
                <td><span class="badge badge-info">{{ d.horasConExcusa }} hrs</span></td>
                <td>
                  <strong :style="{ color: d.porcentaje >= 80 ? '#22c55e' : d.porcentaje >= 60 ? '#f59e0b' : '#ef4444' }">
                    {{ d.porcentaje }}%
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================================= -->
      <!-- VISTA 3: HISTORIAL POR SESIÓN DE CLASE        -->
      <!-- ============================================= -->
      <div v-else-if="vistaReporte === 'sesiones'">
        <div v-if="datosReporteSesiones.length === 0" class="empty-state">
          <p>No se encontraron sesiones registradas para los filtros aplicados.</p>
        </div>

        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha de Clase</th>
                <th>Docente a Cargo</th>
                <th>Horas Sesión</th>
                <th>Presentes</th>
                <th>Tardanzas</th>
                <th>❌ Sin Excusa</th>
                <th>📋 Con Excusa</th>
                <th>% Asistencia</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in datosReporteSesiones" :key="s.fecha">
                <td><strong>{{ s.fecha }}</strong></td>
                <td>👨‍🏫 {{ s.docente }}</td>
                <td>{{ s.horasSesion }} hrs</td>
                <td><span class="badge badge-success">{{ s.presentes }}</span></td>
                <td><span class="badge badge-warning">{{ s.tardanzas }}</span></td>
                <td><span class="badge badge-danger">{{ s.fallasSinExcusa }}</span></td>
                <td><span class="badge badge-info">{{ s.fallasConExcusa }}</span></td>
                <td>
                  <strong :style="{ color: s.porcentaje >= 80 ? '#22c55e' : s.porcentaje >= 60 ? '#f59e0b' : '#ef4444' }">
                    {{ s.porcentaje }}%
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="reporte-footer">
        <p>Documento oficial generado automáticamente por el Sistema de Asistencias SENA.</p>
        <p>Reporte filtrado dinámicamente por Aprendiz, Docente y Rango de Fechas.</p>
      </div>
    </div>
  </div>
</template>
