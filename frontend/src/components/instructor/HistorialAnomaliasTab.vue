<script setup>
const props = defineProps({
  anomalias: { type: Array, default: () => [] },
  formatoDescarga: { type: String, default: 'excel' }
})

const emit = defineEmits(['update:formatoDescarga', 'exportar'])

function onFormatoChange(event) {
  emit('update:formatoDescarga', event.target.value)
}
</script>

<template>
  <div class="section-body">
    <div class="section-header-row">
      <div>
        <h4>Historial de Asistencias (Anomalías)</h4>
        <p class="section-desc">Mostrando únicamente las fallas, tardanzas y excusas de hoy en esta ficha:</p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <template v-if="anomalias.length > 0">
          <select
            :value="formatoDescarga"
            @change="onFormatoChange"
            class="form-input"
            title="Formato de descarga"
            style="width: auto; height: 38px; padding: 0 10px; font-size: 13px; cursor: pointer;"
          >
            <option value="excel">Excel</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            class="btn-export"
            @click="emit('exportar')"
            :title="formatoDescarga === 'pdf' ? 'Descargar PDF' : 'Descargar Excel'"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </template>
      </div>
    </div>

    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Aprendiz</th>
            <th>Instructor</th>
            <th>Estado</th>
            <th>Tiempo Tardanza</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="asis in anomalias" :key="asis._id">
            <td>{{ asis.fecha }} {{ asis.hora }}</td>
            <td>{{ asis.estudianteId?.nombres || '' }} {{ asis.estudianteId?.apellidos || '' }}</td>
            <td>
              <span v-if="asis.instructorId?.nombres" style="font-size: 12px; font-weight: 600; color: #4338ca;">
                {{ asis.instructorId.nombres }} {{ asis.instructorId.apellidos || '' }}
              </span>
              <span v-else style="font-size: 12px; color: #94a3b8;">Sistema / Lector</span>
            </td>
            <td>
              <span class="status-pill" :class="'status-' + (asis.estado || asis.tipo || '').toLowerCase()">
                {{ asis.estado || asis.tipo }}
              </span>
            </td>
            <td style="font-size: 12px; font-weight: 600; color: #64748b;">
              {{ asis.estado === 'Tardanza' ? (asis.tiempoTardanza || '1 hora') : '0 horas' }}
            </td>
          </tr>
          <tr v-if="anomalias.length === 0">
            <td colspan="5" class="empty-cell">No hay anomalías registradas hoy (fallas, tardanzas o excusas).</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
