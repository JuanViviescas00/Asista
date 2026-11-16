<script setup>
const props = defineProps({
  abierto: { type: Boolean, default: false },
  ficha: { type: Object, default: () => ({}) },
  docente: { type: Object, default: null },
  desvinculando: { type: Boolean, default: false }
})

const emit = defineEmits(['cerrar', 'confirmar'])

function onCerrar() {
  if (props.desvinculando) return
  emit('cerrar')
}

function onConfirmar() {
  emit('confirmar')
}
</script>

<template>
  <div
    v-if="abierto"
    class="modal-overlay"
    @click.self="onCerrar"
    @keydown.esc="onCerrar"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      style="max-width: 460px; background: #ffffff; border-radius: 14px; padding: 26px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;"
    >
      <div style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px;">
        <div style="width: 44px; height: 44px; border-radius: 10px; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #1e293b;">Desvincular Instructor del Equipo Ejecutor</h3>
          <p style="margin: 3px 0 0; font-size: 13px; color: #64748b;">Ficha {{ ficha?.codigoFicha }}</p>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 16px;">
        <p style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0f172a;">
          {{ docente?.nombres }} {{ docente?.apellidos }}
        </p>
        <p style="margin: 0; font-size: 12.5px; color: #64748b;">
          {{ docente?.correo || 'Sin correo registrado' }}
          <span v-if="docente?.especialidad"> | {{ docente?.especialidad }}</span>
        </p>
      </div>

      <p style="font-size: 13.5px; color: #475569; line-height: 1.5; margin-bottom: 22px;">
        ¿Estás seguro de quitar a este instructor del equipo ejecutor? Ya no podrá registrar asistencias ni iniciar sesiones en este grupo. Las asistencias registradas previamente <strong>se conservarán</strong>.
      </p>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button
          type="button"
          class="btn btn-outline"
          @click="onCerrar"
          :disabled="desvinculando"
          style="padding: 9px 18px; font-size: 13px; font-weight: 600;"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn"
          @click="onConfirmar"
          :disabled="desvinculando"
          style="background: #dc2626; color: #ffffff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>{{ desvinculando ? 'Desvinculando...' : 'Sí, desvincular' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
