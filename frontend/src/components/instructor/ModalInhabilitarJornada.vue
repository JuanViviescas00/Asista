<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  abierto: { type: Boolean, default: false },
  ficha: { type: Object, default: () => ({}) },
  fecha: { type: String, default: '' },
  inhabilitando: { type: Boolean, default: false }
})

const emit = defineEmits(['cerrar', 'confirmar'])

const motivoInhabilitar = ref('Reunión institucional / Actividad SENA')
const motivoInhabilitarOtro = ref('')

watch(() => props.abierto, (val) => {
  if (val) {
    motivoInhabilitar.value = 'Reunión institucional / Actividad SENA'
    motivoInhabilitarOtro.value = ''
  }
})

function onCerrar() {
  if (props.inhabilitando) return
  emit('cerrar')
}

function onConfirmar() {
  const motivoFinal = motivoInhabilitar.value === 'Otro'
    ? (motivoInhabilitarOtro.value.trim() || 'Jornada no impartida')
    : motivoInhabilitar.value
  emit('confirmar', motivoFinal)
}
</script>

<template>
  <div
    v-if="abierto"
    class="modal-overlay"
    @click.self="onCerrar"
    @keydown.esc="onCerrar"
  >
    <div class="modal" style="max-width: 480px; text-align: left;" role="dialog" aria-modal="true">
      <h3 style="display: flex; align-items: center; gap: 8px; color: #9a3412;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg>
        Inhabilitar Sesión del Día
      </h3>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 14px;">
        Ficha: <strong>{{ ficha?.codigoFicha }}</strong> — {{ ficha?.nombrePrograma }}<br>
        Fecha: <strong>{{ fecha }}</strong> | Jornada: <strong>{{ ficha?.jornada }}</strong>
      </p>

      <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 12px; border-radius: 8px; font-size: 12.5px; color: #c2410c; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>
        <span>Al inhabilitar la jornada, la sesión se guardará como suspendida y los aprendices <strong>no recibirán fallas injustificadas</strong> en esta fecha.</span>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; display: block;">
          Motivo de inhabilitación:
        </label>
        <select v-model="motivoInhabilitar" class="form-input" style="width: 100%; padding: 8px 12px; font-size: 13px;">
          <option value="Reunión institucional / Actividad SENA">Reunión institucional / Actividad SENA</option>
          <option value="Permiso o incapacidad del instructor">Permiso o incapacidad del instructor</option>
          <option value="Salida pedagógica o práctica externa">Salida pedagógica o práctica externa</option>
          <option value="Falla técnica o de fluido eléctrico">Falla técnica o de fluido eléctrico</option>
          <option value="Día no lectivo / Festivo regional">Día no lectivo / Festivo regional</option>
          <option value="Otro">Otro motivo personalizado...</option>
        </select>
      </div>

      <div v-if="motivoInhabilitar === 'Otro'" class="form-group" style="margin-bottom: 18px;">
        <label style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; display: block;">
          Describe el motivo:
        </label>
        <input
          v-model="motivoInhabilitarOtro"
          type="text"
          class="form-input"
          placeholder="Ej: Mantenimiento de ambientes de aprendizaje..."
          style="width: 100%; padding: 8px 12px; font-size: 13px;"
        />
      </div>

      <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button class="btn btn-outline" @click="onCerrar" :disabled="inhabilitando" title="Cancelar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button
          class="btn btn-danger-solid"
          @click="onConfirmar"
          :disabled="inhabilitando"
          title="Inhabilitar día"
          style="background: #e11d48; color: #ffffff; border: none; font-weight: 700; padding: 9px 16px; border-radius: 8px; cursor: pointer;"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>
