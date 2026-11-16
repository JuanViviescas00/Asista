<script setup>
const props = defineProps({
  fecha: { type: String, required: true },
  fechaHoyMax: { type: String, required: true },
  jornadaInhabilitada: { type: Boolean, default: false },
  esFechaActualOHoy: { type: Boolean, default: true },
  jornadaEsDeOtroDocente: { type: Boolean, default: false },
  inhabilitando: { type: Boolean, default: false }
})

const emit = defineEmits([
  'cambiarDia',
  'cambiarFecha',
  'irAHoy',
  'inhabilitar',
  'reactivar'
])

function onInputFecha(event) {
  emit('cambiarFecha', event.target.value)
}
</script>

<template>
  <div class="section-header-actions" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
    <!-- Barra de Navegación por Días -->
    <div class="day-nav-bar" :class="{ 'nav-day-inhabilitada': jornadaInhabilitada }" style="display: inline-flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 3px 6px;">
      <button
        type="button"
        class="btn-nav-day"
        @click="emit('cambiarDia', -1)"
        title="Día anterior"
        style="background: transparent; border: none; font-size: 13px; font-weight: 700; color: #475569; padding: 5px 8px; cursor: pointer; border-radius: 4px;"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input
        type="date"
        :value="fecha"
        :max="fechaHoyMax"
        @change="onInputFecha"
        class="input-fecha"
        title="Seleccionar fecha (Solo hoy o días anteriores)"
        style="border: none; background: transparent; font-weight: 600; font-size: 13px; color: #1e293b; padding: 4px 6px; outline: none; cursor: pointer;"
      />
      <span v-if="jornadaInhabilitada" style="font-size: 11px; background: #ea580c; color: white; padding: 2px 6px; border-radius: 6px; font-weight: 700; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
        Inhabilitada
      </span>
      <button
        type="button"
        class="btn-nav-day"
        :disabled="esFechaActualOHoy"
        @click="emit('cambiarDia', 1)"
        :title="esFechaActualOHoy ? 'No puedes avanzar a días futuros' : 'Día siguiente'"
        :style="{
          background: 'transparent',
          border: 'none',
          fontSize: '13px',
          fontWeight: 700,
          color: esFechaActualOHoy ? '#cbd5e1' : '#475569',
          padding: '5px 8px',
          cursor: esFechaActualOHoy ? 'not-allowed' : 'pointer',
          borderRadius: '4px'
        }"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button
        type="button"
        class="btn-today"
        @click="emit('irAHoy')"
        :disabled="fecha === fechaHoyMax"
        title="Ir a hoy"
        :style="{
          background: fecha === fechaHoyMax ? '#f1f5f9' : '#e2e8f0',
          border: 'none',
          fontSize: '11px',
          fontWeight: 700,
          color: fecha === fechaHoyMax ? '#94a3b8' : '#334155',
          padding: '4px 8px',
          marginLeft: '4px',
          borderRadius: '4px',
          cursor: fecha === fechaHoyMax ? 'default' : 'pointer'
        }"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </button>
    </div>

    <!-- Botón Inhabilitar / Reactivar -->
    <button
      v-if="!jornadaInhabilitada"
      type="button"
      class="btn-inhabilitar-action"
      @click="emit('inhabilitar')"
      :disabled="fecha > fechaHoyMax || jornadaEsDeOtroDocente"
      title="Inhabilitar día"
      style="background: #fff1f2; border: 1.5px solid #fecdd3; color: #e11d48; font-weight: 600; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
    </button>
    <button
      v-else
      type="button"
      class="btn-reactivar-action"
      @click="emit('reactivar')"
      :disabled="inhabilitando || jornadaEsDeOtroDocente"
      title="Reactivar día"
      style="background: #f0fdf4; border: 1.5px solid #bbf7d0; color: #16a34a; font-weight: 700; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
  </div>
</template>
