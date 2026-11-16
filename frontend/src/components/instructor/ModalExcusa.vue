<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  abierto: { type: Boolean, default: false },
  tipo: { type: String, default: 'excusa' }, // 'excusa' | 'descripcion'
  estudiante: { type: Object, default: null },
  fecha: { type: String, default: '' },
  editando: { type: Boolean, default: false },
  textoInicial: { type: String, default: '' },
  maxlength: { type: Number, default: 200 }
})

const emit = defineEmits(['cerrar', 'guardar'])

const texto = ref('')
const error = ref('')
const textareaRef = ref(null)

watch(() => props.abierto, (val) => {
  if (val) {
    texto.value = props.textoInicial || ''
    error.value = ''
    nextTick(() => textareaRef.value?.focus())
  }
}, { immediate: true })

watch(() => props.textoInicial, (val) => {
  if (props.abierto) {
    texto.value = val || ''
  }
})

function onCerrar() {
  emit('cerrar')
}

function onGuardar() {
  emit('guardar', texto.value.trim())
}
</script>

<template>
  <div
    v-if="abierto"
    class="modal-overlay"
    @click.self="onCerrar"
    @keydown.esc="onCerrar"
  >
    <!-- MODAL EXCUSA -->
    <div
      v-if="tipo === 'excusa'"
      class="modal excusa-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excusa-modal-titulo"
    >
      <h3 id="excusa-modal-titulo" class="excusa-modal-titulo">
        <span class="excusa-modal-icono" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </span>
        {{ editando ? 'Editar descripción de la excusa' : 'Registrar excusa' }}
      </h3>
      <p class="excusa-modal-sub">
        Aprendiz: <strong>{{ estudiante ? `${estudiante.nombres} ${estudiante.apellidos || ''}` : '' }}</strong><br>
        Fecha: <strong>{{ fecha }}</strong>
      </p>

      <label class="excusa-modal-label" for="modal-excusa-textarea">¿Por qué se le coloca la excusa al aprendiz? (opcional)</label>
      <p class="excusa-modal-sub">Este texto se enviará a Sofía Plus. Si lo dejas vacío se enviará "Con excusa". No incluyas datos médicos ni personales.</p>
      <textarea
        id="modal-excusa-textarea"
        ref="textareaRef"
        v-model="texto"
        class="form-input excusa-modal-textarea"
        :maxlength="maxlength"
        rows="4"
        placeholder="Ej: Permiso aprobado por coordinación."
        @input="error = ''"
      ></textarea>
      <div class="excusa-modal-pie">
        <span v-if="error" class="excusa-modal-error">{{ error }}</span>
        <span class="excusa-modal-contador">{{ texto.length }} / {{ maxlength }}</span>
      </div>

      <div class="modal-actions excusa-modal-acciones">
        <button type="button" class="btn btn-outline" @click="onCerrar">Cancelar</button>
        <button type="button" class="btn btn-primary" @click="onGuardar">Guardar</button>
      </div>
    </div>

    <!-- MODAL DESCRIPCIÓN SOFÍA PLUS -->
    <div
      v-else
      class="modal excusa-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desc-modal-titulo"
    >
      <h3 id="desc-modal-titulo" class="excusa-modal-titulo">
        <span class="excusa-modal-icono" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </span>
        Descripción para Sofía Plus (opcional)
      </h3>
      <p class="excusa-modal-sub">
        Si la dejas vacía se enviará el texto estándar (Falla justificada / injustificada). No incluyas datos médicos ni personales.
      </p>

      <textarea
        id="modal-desc-textarea"
        ref="textareaRef"
        v-model="texto"
        class="form-input excusa-modal-textarea"
        :maxlength="maxlength"
        rows="4"
        placeholder="Ej: El aprendiz no asistió a la totalidad de la jornada."
      ></textarea>
      <div class="excusa-modal-pie">
        <span class="excusa-modal-contador">{{ texto.length }} / {{ maxlength }}</span>
      </div>

      <div class="modal-actions excusa-modal-acciones">
        <button type="button" class="btn btn-outline" @click="onCerrar">Cancelar</button>
        <button type="button" class="btn btn-primary" @click="onGuardar">Guardar</button>
      </div>
    </div>
  </div>
</template>
