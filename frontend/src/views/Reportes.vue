<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import api from '../services/index.js'
import StatCard from '../components/StatCard.vue'

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

// ---------- Filtro por pasos ----------
const TOTAL_PASOS = 4
const pasoMax = ref(1) // último paso visible

const sinMovimiento = typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function mostrarPaso(n) {
  if (n <= pasoMax.value) return
  pasoMax.value = n
  nextTick(() => {
    const destino = document.getElementById(n === TOTAL_PASOS ? 'rf-resumen' : `rf-paso-${n}`)
    destino?.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'nearest' })
  })
}

// Al elegir ficha se revela el paso 2; si se deja vacía se vuelve al paso 1
watch(filtroFicha, (val) => {
  showPreview.value = false
  filtroEstudiante.value = 'todos'
  filtroInstructor.value = 'todos'
  if (val) mostrarPaso(2)
  else pasoMax.value = 1
})

const hayPersona = computed(() =>
  filtroInstructor.value !== 'todos' || filtroEstudiante.value !== 'todos' || !!busquedaTexto.value.trim()
)
const hayFechas = computed(() => !!(fechaDesde.value || fechaHasta.value))
const rangoInvalido = computed(() =>
  !!(fechaDesde.value && fechaHasta.value && fechaDesde.value > fechaHasta.value)
)

// Fecha local (evita el desfase de toISOString por zona horaria)
function fechaLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

function aplicarAtajo(dias) {
  if (dias === 0) {
    fechaDesde.value = ''
    fechaHasta.value = ''
    return
  }
  const hoy = new Date()
  const inicio = new Date()
  inicio.setDate(hoy.getDate() - dias)
  fechaDesde.value = fechaLocalISO(inicio)
  fechaHasta.value = fechaLocalISO(hoy)
}

const opcionesHoras = [
  { valor: 'todas', texto: 'Todas', icono: 'eye' },
  { valor: 'sin_excusa', texto: 'Sin excusa', icono: 'x' },
  { valor: 'con_excusa', texto: 'Con excusa', icono: 'check' }
]
const textoHoras = { todas: 'Todas las horas', sin_excusa: 'Solo sin excusa', con_excusa: 'Solo con excusa' }
const textoFormato = { pdf: 'PDF', xlsx: 'Excel (CSV)' }

// Resumen en vivo de la búsqueda
const resumenFiltros = computed(() => {
  const items = []
  const f = fichaSeleccionada.value
  items.push(f ? `Ficha ${f.codigoFicha}` : 'Sin ficha')

  const inst = todosInstructores.value.find(i => String(i._id) === String(filtroInstructor.value))
  items.push(filtroInstructor.value === 'todos' || !inst ? 'Todos los docentes' : `${inst.nombres} ${inst.apellidos}`)

  const est = todosEstudiantes.value.find(e => String(e._id) === String(filtroEstudiante.value))
  items.push(filtroEstudiante.value === 'todos' || !est ? 'Todos los aprendices' : `${est.nombres} ${est.apellidos}`)

  if (busquedaTexto.value.trim()) items.push(`Busca “${busquedaTexto.value.trim()}”`)

  items.push(hayFechas.value
    ? `${fechaDesde.value || 'inicio'} a ${fechaHasta.value || 'hoy'}`
    : 'Todo el periodo')
  items.push(textoHoras[filtroTipoInasistencia.value])
  items.push(textoFormato[formato.value])
  return items
})

async function generarReporte() {
  if (!filtroFicha.value || rangoInvalido.value) return
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
  formato.value = 'pdf'
  showPreview.value = false
  pasoMax.value = 1
}
</script>

<template>
  <div class="page-header">
    <h1>Reportes, Inasistencias y Filtros Avanzados</h1>
    <p>Consulta y exporta el historial de asistencias filtrando simultáneamente por Aprendiz, Docente y Rango de Fechas</p>
  </div>

  <div v-if="usuario.rol === 'Instructor' && fichasLideradas.length === 0" class="card" style="background: #fff1f2; border-color: #fecdd3; color: #9f1239; padding: 20px;">
    <strong> Acceso Restringido a Reportes:</strong> Como Docente Común no tienes asignada ninguna Ficha bajo tu liderazgo. La generación de reportes está reservada para el Administrador o Docente Líder de Ficha.
  </div>

  <form v-else class="rf-panel" novalidate @submit.prevent="generarReporte">
    <h2 class="rf-h2">Parámetros de Búsqueda y Filtrado</h2>
    <p class="rf-sub">Empieza por la ficha. Los siguientes pasos irán apareciendo a medida que avances.</p>

    <!-- PASO 1: FICHA (siempre visible) -->
    <section id="rf-paso-1" class="rf-paso" :class="{ 'rf-activo': pasoMax === 1, 'rf-completo': pasoMax > 1 }" aria-labelledby="rf-t1">
      <div class="rf-num" aria-hidden="true">
        <template v-if="pasoMax > 1"><svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></template>
        <template v-else>1</template>
      </div>
      <div>
        <h3 id="rf-t1" class="rf-titulo">Elige la ficha <span class="rf-etiqueta rf-obligatorio">Obligatorio</span></h3>
        <p class="rf-ayuda">Al elegirla aparecerá el siguiente paso.</p>
        <div class="rf-campo rf-campo-ficha">
          <label for="rf-ficha" class="rf-solo-lectores">Ficha de Formación</label>
          <select id="rf-ficha" v-model="filtroFicha">
            <option :value="null" disabled>Selecciona una ficha</option>
            <option v-for="f in fichasLideradas" :key="f._id" :value="f._id">{{ f.codigoFicha }} - {{ f.nombrePrograma }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- PASO 2: PERSONA -->
    <Transition name="rf-entra">
      <section v-if="pasoMax >= 2" id="rf-paso-2" class="rf-paso" :class="{ 'rf-activo': pasoMax === 2, 'rf-completo': pasoMax > 2 }" aria-labelledby="rf-t2">
        <div class="rf-num" aria-hidden="true">
          <template v-if="pasoMax > 2"><svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></template>
          <template v-else>2</template>
        </div>
        <div>
          <h3 id="rf-t2" class="rf-titulo">Filtra por persona <span class="rf-etiqueta">Opcional</span></h3>
          <p class="rf-ayuda">Déjalo vacío para ver todos los docentes y aprendices de la ficha.</p>
          <div class="rf-rejilla">
            <div class="rf-campo">
              <label for="rf-docente">Docente / Instructor</label>
              <select id="rf-docente" v-model="filtroInstructor">
                <option value="todos">Todos los Docentes / Clases</option>
                <option v-for="inst in instructoresDeLaFicha" :key="inst._id" :value="inst._id">
                  {{ inst.nombres }} {{ inst.apellidos }} ({{ inst.especialidad || 'Docente' }})
                </option>
              </select>
            </div>
            <div class="rf-campo">
              <label for="rf-aprendiz">Aprendiz Específico</label>
              <select id="rf-aprendiz" v-model="filtroEstudiante">
                <option value="todos">Todos los Aprendices</option>
                <option v-for="est in estudiantesFicha" :key="est._id" :value="est._id">
                  {{ est.nombres }} {{ est.apellidos }} ({{ est.numeroDocumento }})
                </option>
              </select>
            </div>
          </div>

          <div class="rf-separador">o busca directamente</div>

          <div class="rf-campo rf-busqueda">
            <label for="rf-busqueda">Búsqueda rápida por aprendiz, documento o docente</label>
            <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="rf-busqueda" v-model="busquedaTexto" type="search" autocomplete="off"
                   placeholder="Escribe un nombre o número de documento" />
          </div>

          <div v-if="pasoMax === 2" class="rf-pie">
            <button type="button" class="rf-continuar" @click="mostrarPaso(3)">
              <span>{{ hayPersona ? 'Continuar' : 'Omitir este paso' }}</span> <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </button>
          </div>
        </div>
      </section>
    </Transition>

    <!-- PASO 3: PERIODO -->
    <Transition name="rf-entra">
      <section v-if="pasoMax >= 3" id="rf-paso-3" class="rf-paso" :class="{ 'rf-activo': pasoMax === 3, 'rf-completo': pasoMax > 3 }" aria-labelledby="rf-t3">
        <div class="rf-num" aria-hidden="true">
          <template v-if="pasoMax > 3"><svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></template>
          <template v-else>3</template>
        </div>
        <div>
          <h3 id="rf-t3" class="rf-titulo">Define el periodo <span class="rf-etiqueta">Opcional</span></h3>
          <p class="rf-ayuda">Usa un atajo o escribe las fechas exactas.</p>
          <div class="rf-rejilla">
            <div class="rf-campo">
              <label for="rf-desde">Fecha Desde</label>
              <input id="rf-desde" v-model="fechaDesde" type="date" />
            </div>
            <div class="rf-campo">
              <label for="rf-hasta">Fecha Hasta</label>
              <input id="rf-hasta" v-model="fechaHasta" type="date" />
            </div>
          </div>
          <div class="rf-atajos">
            <span class="rf-atajos-titulo">Atajos:</span>
            <button type="button" class="rf-chip" @click="aplicarAtajo(7)">Última semana</button>
            <button type="button" class="rf-chip" @click="aplicarAtajo(30)">Último mes</button>
            <button type="button" class="rf-chip" @click="aplicarAtajo(0)">Todo el periodo</button>
          </div>
          <p v-if="rangoInvalido" class="rf-error" role="alert">La fecha inicial no puede ser posterior a la final.</p>

          <div v-if="pasoMax === 3" class="rf-pie">
            <button type="button" class="rf-continuar" @click="mostrarPaso(4)">
              <span>{{ hayFechas ? 'Continuar' : 'Omitir este paso' }}</span> <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </button>
          </div>
        </div>
      </section>
    </Transition>

    <!-- PASO 4: HORAS Y FORMATO -->
    <Transition name="rf-entra">
      <section v-if="pasoMax >= 4" id="rf-paso-4" class="rf-paso rf-activo" aria-labelledby="rf-t4">
        <div class="rf-num" aria-hidden="true">4</div>
        <div>
          <h3 id="rf-t4" class="rf-titulo">Horas y formato de descarga <span class="rf-etiqueta">Opcional</span></h3>
          <p class="rf-ayuda">Elige qué horas mostrar y cómo quieres descargar el resultado.</p>

          <p id="rf-lbl-horas" class="rf-grupo-etq">Filtro de horas</p>
          <div class="rf-grupo-seg" role="radiogroup" aria-labelledby="rf-lbl-horas">
            <label v-for="op in opcionesHoras" :key="op.valor" class="rf-seg">
              <input v-model="filtroTipoInasistencia" type="radio" name="rf_horas" :value="op.valor" />
              <span>
                <svg v-if="op.icono === 'eye'" class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else-if="op.icono === 'x'" class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <svg v-else class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                {{ op.texto }}
              </span>
            </label>
          </div>

          <p id="rf-lbl-formato" class="rf-grupo-etq" style="margin-top: 18px;">Formato de descarga</p>
          <div class="rf-grupo-seg" role="radiogroup" aria-labelledby="rf-lbl-formato">
            <label class="rf-seg">
              <input v-model="formato" type="radio" name="rf_formato" value="pdf" />
              <span><svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> PDF (Impresión / Comité)</span>
            </label>
            <label class="rf-seg">
              <input v-model="formato" type="radio" name="rf_formato" value="xlsx" />
              <span><svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg> Excel (CSV)</span>
            </label>
          </div>
        </div>
      </section>
    </Transition>

    <!-- RESUMEN + ACCIONES -->
    <Transition name="rf-entra">
      <div v-if="pasoMax >= 4" id="rf-resumen" class="rf-resumen" aria-live="polite">
        <p class="rf-resumen-titulo">Tu búsqueda</p>
        <ul class="rf-resumen-lista">
          <li v-for="(item, i) in resumenFiltros" :key="i">{{ item }}</li>
        </ul>
        <div class="rf-acciones">
          <button type="submit" class="rf-btn rf-btn-primario" :disabled="!filtroFicha || rangoInvalido">
            <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar
          </button>
          <button type="button" class="rf-btn rf-btn-secundario" @click="limpiar">
            <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Limpiar todo
          </button>
        </div>
      </div>
    </Transition>

    <!-- Si aún no llega al último paso, permite limpiar igualmente -->
    <div v-if="pasoMax > 1 && pasoMax < 4" class="rf-acciones rf-acciones-parcial">
      <button type="button" class="rf-btn rf-btn-secundario" @click="limpiar">
        <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Limpiar todo
      </button>
    </div>
  </form>

  <div v-if="showPreview && fichaSeleccionada" id="reporte-print">
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <!-- Selector de Vista del Reporte -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'aprendices' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'aprendices'"
            title="Vista por Aprendiz"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'docentes' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'docentes'"
            title="Vista por Docente"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button
            class="btn btn-sm"
            :class="vistaReporte === 'sesiones' ? 'btn-primary' : 'btn-outline'"
            @click="vistaReporte = 'sesiones'"
            title="Vista por Sesión"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>

        <div class="btn-group">
          <button v-if="formato === 'pdf'" class="btn btn-primary btn-sm" @click="descargarPDF" title="Descargar PDF">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button v-else class="btn btn-success btn-sm" @click="descargarXLSX" title="Descargar CSV (Excel)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
        <StatCard icon="percent" label="Asistencia General" :value="`${resumenReporte.porcentajeGeneral}%`" variant="verde" />
        <StatCard icon="clock" label="Total Horas Ausente" :value="`${resumenReporte.totalHorasFalladas}h`" variant="indigo" />
        <StatCard icon="x-circle" label="Sin Excusa" :value="`${resumenReporte.totalHorasSinExcusa}h`" variant="rojo" />
        <StatCard icon="file-text" label="Con Excusa" :value="`${resumenReporte.totalHorasConExcusa}h`" variant="azul" />
        <StatCard icon="user-check" label="Docentes Registrados" :value="resumenReporte.totalDocentesActivos" variant="morado" />
        <StatCard icon="calendar" label="Sesiones de Clase" :value="resumenReporte.totalSesionesDictadas" variant="ambar" />
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
                <th> Sin Excusa</th>
                <th> Con Excusa</th>
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
                     {{ r.horasConExcusa }} hrs ({{ r.fallasConExcusa }} d)
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
                      <strong>{{ det.fecha }} ({{ det.horas }}h)</strong> - ‍ {{ det.docente }}:
                      <span :style="{ color: det.tipo === 'Excusada' ? '#0369a1' : '#dc2626' }">
                        {{ det.tipo === 'Excusada' ? ` ${det.motivo}` : ' Injustificada' }}
                      </span>
                    </div>
                  </div>
                  <span v-else style="color: #16a34a; font-weight: 600; font-size: 12px;"> Sin inasistencias</span>
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
                <th> Horas Sin Excusa</th>
                <th> Horas Con Excusa</th>
                <th>% Asistencia en sus Clases</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, idx) in datosReporteDocentes" :key="d.id">
                <td>{{ idx + 1 }}</td>
                <td><strong>‍ {{ d.nombre }}</strong></td>
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
                <th> Sin Excusa</th>
                <th> Con Excusa</th>
                <th>% Asistencia</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in datosReporteSesiones" :key="s.fecha">
                <td><strong>{{ s.fecha }}</strong></td>
                <td>‍ {{ s.docente }}</td>
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

<style scoped>
/* ====== Filtro por pasos (Reportes) ====== */
.rf-panel {
  --rf-verde: var(--verde, #39a900);
  --rf-verde-osc: #2c8300;
  --rf-verde-claro: #eaf6e0;
  --rf-verde-borde: #b9de9c;
  --rf-borde: var(--borde, #e3e8df);
  --rf-borde-fuerte: #cdd5c8;
  --rf-texto: var(--tinta, #1a1f16);
  --rf-suave: var(--texto-suave, #5b6356);
  --rf-tenue: #8b9385;
  --rf-rojo: #c62828;
  --rf-rojo-claro: #fdeceb;
  --rf-radio: 10px;

  background: #fff;
  border-radius: 24px;
  padding: 28px 36px 32px;
  margin-bottom: 24px;
  box-shadow: 0 1px 2px rgba(30, 50, 20, .04), 0 12px 32px rgba(30, 50, 20, .06);
}

.rf-panel :focus-visible { outline: 2px solid var(--rf-verde); outline-offset: 2px; }

.rf-h2 { margin: 0 0 4px; font-size: 18px; font-weight: 800; color: var(--rf-texto); }
.rf-sub { margin: 0 0 8px; font-size: 14px; color: var(--rf-suave); }

.rf-solo-lectores { position: absolute; left: -9999px; }

/* Pasos */
.rf-paso {
  display: grid;
  grid-template-columns: 34px 1fr;
  column-gap: 16px;
  padding: 20px 0 22px;
}
.rf-paso + .rf-paso,
.rf-paso + .rf-resumen { border-top: 1px solid var(--rf-borde); }
.rf-paso + .rf-resumen { margin-top: 0; }

.rf-num {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1.5px solid var(--rf-borde-fuerte);
  background: #fff;
  display: grid; place-items: center;
  font-size: 14px; font-weight: 800;
  color: var(--rf-suave);
  transition: background .2s, border-color .2s, color .2s;
}
.rf-activo .rf-num { border-color: var(--rf-verde); color: var(--rf-verde-osc); background: var(--rf-verde-claro); }
.rf-completo .rf-num { background: var(--rf-verde); border-color: var(--rf-verde); color: #fff; }
.rf-num .rf-ico { width: 17px; height: 17px; }

.rf-titulo { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 3px 0 2px; font-size: 16px; font-weight: 800; color: var(--rf-texto); }
.rf-ayuda { margin: 0 0 14px; font-size: 13.5px; color: var(--rf-suave); }

.rf-etiqueta { font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #f0f2ee; color: var(--rf-suave); }
.rf-obligatorio { background: var(--rf-rojo-claro); color: var(--rf-rojo); }

.rf-ico { width: 18px; height: 18px; flex: none; }

/* Campos */
.rf-rejilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.rf-campo { position: relative; }
.rf-campo label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; color: var(--rf-texto); }
.rf-campo-ficha { max-width: 460px; }

.rf-campo select,
.rf-campo input[type="search"],
.rf-campo input[type="date"] {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  background: #fff;
  border: 1px solid var(--rf-borde);
  border-radius: var(--rf-radio);
  font: inherit;
  font-size: 15px;
  color: var(--rf-texto);
  transition: border-color .15s, box-shadow .15s;
}
.rf-campo select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 38px;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%235b6356' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}
.rf-campo select:hover,
.rf-campo input:hover { border-color: var(--rf-borde-fuerte); }
.rf-campo select:focus,
.rf-campo input:focus { outline: none; border-color: var(--rf-verde); box-shadow: 0 0 0 3px rgba(57, 169, 0, .18); }
.rf-campo input::placeholder { color: var(--rf-tenue); }

.rf-error { margin: 10px 0 0; font-size: 13px; font-weight: 600; color: var(--rf-rojo); }

.rf-separador {
  display: flex; align-items: center; gap: 12px;
  margin: 16px 0 12px;
  font-size: 13px; color: var(--rf-tenue);
}
.rf-separador::before,
.rf-separador::after { content: ""; flex: 1; height: 1px; background: var(--rf-borde); }

.rf-busqueda .rf-ico { position: absolute; left: 14px; bottom: 13px; width: 19px; height: 19px; color: var(--rf-tenue); pointer-events: none; }
.rf-campo.rf-busqueda input[type="search"] { padding-left: 44px; }

/* Atajos y opciones segmentadas */
.rf-atajos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; align-items: center; }
.rf-atajos-titulo { font-size: 13px; color: var(--rf-suave); margin-right: 2px; }

.rf-chip,
.rf-seg span {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--rf-borde);
  border-radius: 999px;
  background: #fff;
  font: inherit;
  font-size: 14px; font-weight: 600;
  color: var(--rf-texto);
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.rf-chip:hover,
.rf-seg span:hover { border-color: var(--rf-verde-borde); background: #f7fbf3; }

.rf-grupo-seg { display: flex; flex-wrap: wrap; gap: 8px; }
.rf-grupo-etq { font-size: 13px; font-weight: 700; margin: 0 0 8px; color: var(--rf-texto); }

.rf-seg { position: relative; margin: 0; }
.rf-seg input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
.rf-seg input:checked + span { background: var(--rf-verde-claro); border-color: var(--rf-verde); color: var(--rf-verde-osc); }
.rf-seg input:focus-visible + span { outline: 2px solid var(--rf-verde); outline-offset: 2px; }
.rf-seg span { border-radius: var(--rf-radio); }

/* Botón para pasar al siguiente paso */
.rf-pie { margin-top: 20px; }
.rf-continuar {
  display: inline-flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 18px;
  background: #fff;
  border: 1px solid var(--rf-verde-borde);
  border-radius: var(--rf-radio);
  color: var(--rf-verde-osc);
  font: inherit; font-weight: 700; font-size: 14.5px;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.rf-continuar:hover { background: var(--rf-verde-claro); border-color: var(--rf-verde); }

/* Resumen y acciones */
.rf-resumen {
  margin-top: 6px;
  padding: 16px 18px;
  background: #f7f9f5;
  border: 1px solid var(--rf-borde);
  border-radius: 16px;
}
.rf-resumen-titulo { margin: 0 0 10px; font-size: 13px; font-weight: 700; color: var(--rf-suave); }
.rf-resumen-lista { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rf-resumen-lista li {
  padding: 4px 12px;
  background: #fff;
  border: 1px solid var(--rf-borde);
  border-radius: 999px;
  font-size: 13px; font-weight: 600;
  color: var(--rf-texto);
}

.rf-acciones { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.rf-acciones-parcial { margin-top: 4px; }

.rf-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 46px; padding: 0 22px;
  border-radius: var(--rf-radio);
  border: 1px solid var(--rf-borde);
  background: #fff;
  color: var(--rf-texto);
  font: inherit; font-weight: 700; font-size: 15px;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.rf-btn .rf-ico { width: 19px; height: 19px; }
.rf-btn-primario { background: var(--rf-verde); border-color: var(--rf-verde); color: #fff; }
.rf-btn-primario:hover:not(:disabled) { background: var(--verde-hover, #2f8c00); border-color: var(--verde-hover, #2f8c00); }
.rf-btn-primario:disabled { opacity: .5; cursor: not-allowed; }
.rf-btn-secundario:hover { background: #f4f6f2; border-color: var(--rf-borde-fuerte); }

/* Animación de entrada de cada paso */
.rf-entra-enter-active { animation: rf-entra .4s cubic-bezier(.2, .7, .2, 1) both; }
@keyframes rf-entra {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}

@media (max-width: 860px) {
  .rf-panel { padding: 22px 18px 26px; border-radius: 20px; }
  .rf-rejilla { grid-template-columns: 1fr; }
  .rf-paso { grid-template-columns: 30px 1fr; column-gap: 12px; }
  .rf-num { width: 28px; height: 28px; font-size: 13px; }
}

@media (prefers-reduced-motion: reduce) {
  .rf-panel * { transition: none !important; }
  .rf-entra-enter-active { animation: none; }
}
</style>
