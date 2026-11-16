<script setup>
defineProps({
  fecha: { type: String, required: true },
  motivo: { type: String, default: '' },
  inhabilitando: { type: Boolean, default: false },
  jornadaEsDeOtroDocente: { type: Boolean, default: false }
})

const emit = defineEmits(['reactivar'])
</script>

<template>
  <div class="hud-inhabilitado-card">
    <div class="hud-inhabilitado-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
    </div>
    <div class="hud-inhabilitado-content">
      <div class="hud-inhabilitado-title">
        <span>JORNADA INHABILITADA</span>
        <span class="hud-inhabilitado-fecha">{{ fecha }}</span>
      </div>
      <div class="hud-inhabilitado-motivo">
        <strong>Motivo registrado:</strong> {{ motivo }}
      </div>
      <div class="hud-inhabilitado-desc">
        La toma de asistencia para este día se encuentra suspendida. Los aprendices no acumulan fallas injustificadas ni penalizaciones.
      </div>
    </div>
    <button
      class="btn btn-reactivar-hud"
      @click="emit('reactivar')"
      :disabled="inhabilitando || jornadaEsDeOtroDocente"
      title="Reactivar día"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
  </div>
</template>
