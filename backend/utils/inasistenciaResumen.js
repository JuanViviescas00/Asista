// Util compartido para calcular resúmenes de asistencia sobre los modelos NUEVOS
// (Inasistencia + Jornada). NO importa controladores; evita circularidad.

export function filaResumenDesdeInasistencia(a) {
  return {
    fecha: a.fecha,
    estado: a.tipo,
    horasTardanza: a.tipo === 'Tardanza' ? Number(a.horas) || 0 : 0,
  }
}

export function construirFilasResumenPorEstudiante({ inasistencias = [], jornadas = [] }) {
  const porEstudiante = new Map()
  const novedadFechas = new Map()

  for (const a of inasistencias) {
    const key = String(a.estudianteId)
    if (!porEstudiante.has(key)) porEstudiante.set(key, [])
    porEstudiante.get(key).push(filaResumenDesdeInasistencia(a))
    if (!novedadFechas.has(key)) novedadFechas.set(key, new Set())
    novedadFechas.get(key).add(a.fecha)
  }

  for (const j of jornadas) {
    for (const p of (j.presentes || [])) {
      const key = String(p.estudianteId?._id || p.estudianteId)
      if (!key || key === 'undefined') continue
      const fechas = novedadFechas.get(key)
      if (fechas && fechas.has(j.fecha)) continue
      if (!porEstudiante.has(key)) porEstudiante.set(key, [])
      porEstudiante.get(key).push({ fecha: j.fecha, estado: 'Presente', horasTardanza: 0 })
    }
  }

  for (const filas of porEstudiante.values()) {
    filas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  }

  return porEstudiante
}
