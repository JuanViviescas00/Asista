<script setup>
const props = defineProps({
  ficha: { type: Object, default: () => ({}) },
  esLider: { type: Boolean, default: false },
  usuarioId: { type: [String, Number], default: '' }
})

const emit = defineEmits(['abrirModalAgregar', 'solicitarDesvincular'])

function esMismoUsuario(id) {
  if (!id || !props.usuarioId) return false
  return String(id) === String(props.usuarioId)
}
</script>

<template>
  <div class="section-body">
    <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h4>Equipo Ejecutor - Ficha {{ ficha?.codigoFicha }}</h4>
        <p class="section-desc">{{ ficha?.nombrePrograma }} | Jornada: {{ ficha?.jornada }}</p>
      </div>
      <button
        v-if="esLider"
        class="btn btn-primary"
        style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer;"
        @click="emit('abrirModalAgregar')"
        title="Agregar instructor al equipo ejecutor"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Asignar Instructor</span>
      </button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 16px;">
      <!-- DOCENTE LÍDER -->
      <div class="docente-card" style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="badge badge-success" style="font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h16l1.5-9-5 3-4.5-6-4.5 6-5-3L4 18z"/></svg>
            Instructor Líder
          </span>
          <span v-if="esMismoUsuario(ficha?.instructorLiderId?._id || ficha?.instructorLiderId)" class="badge badge-lider" style="font-size: 11px;">(Tú)</span>
        </div>
        <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #166534;">
          {{ ficha?.instructorLiderId?.nombres || 'No asignado' }} {{ ficha?.instructorLiderId?.apellidos || '' }}
        </h4>
        <p style="font-size: 13px; color: #374151; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          {{ ficha?.instructorLiderId?.correo || 'Sin correo' }}
        </p>
        <p style="font-size: 13px; color: #374151; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;" v-if="ficha?.instructorLiderId?.telefono">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a2 2 0 0 1-2 2C10.8 21 3 13.2 3 6a2 2 0 0 1 2-2z"/></svg>
          {{ ficha?.instructorLiderId?.telefono }}
        </p>
        <p style="font-size: 12px; color: #15803d; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 6px;" v-if="ficha?.instructorLiderId?.especialidad">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>
          {{ ficha?.instructorLiderId?.especialidad }}
        </p>
      </div>

      <!-- DOCENTES COMUNES -->
      <div
        v-for="doc in (ficha?.instructores || [])"
        :key="doc._id || doc"
        class="docente-card"
        style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 18px; position: relative;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="badge badge-neutral" style="font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6z"/></svg>
            Instructor Común
          </span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span v-if="esMismoUsuario(doc._id || doc)" class="badge badge-comun" style="font-size: 11px;">(Tú)</span>
            <button
              v-if="esLider"
              type="button"
              class="btn-quitar-doc"
              @click="emit('solicitarDesvincular', doc)"
              title="Desvincular instructor de la ficha"
              style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; cursor: pointer; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; transition: background .15s ease;"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Quitar</span>
            </button>
          </div>
        </div>
        <h4 style="font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #1e293b;">
          {{ doc.nombres || 'Instructor' }} {{ doc.apellidos || '' }}
        </h4>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          {{ doc.correo || 'Sin correo' }}
        </p>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;" v-if="doc.telefono">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a2 2 0 0 1-2 2C10.8 21 3 13.2 3 6a2 2 0 0 1 2-2z"/></svg>
          {{ doc.telefono }}
        </p>
        <p style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 6px;" v-if="doc.especialidad">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>
          {{ doc.especialidad }}
        </p>
      </div>
    </div>
    <div v-if="(!ficha?.instructores || ficha?.instructores.length === 0)" style="padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #64748b; margin-top: 12px; display: flex; align-items: center; gap: 8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>
      Esta ficha actualmente no tiene otros instructores comunes asignados.
    </div>
  </div>
</template>
