<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useConfirmState, aceptarConfirmacion, cancelarConfirmacion } from '../composables/useConfirm.js'

const estado = useConfirmState()
const cancelarBtn = ref(null)

function onTecla(e) {
  if (e.key === 'Escape') cancelarConfirmacion()
}

onMounted(() => {
  document.addEventListener('keydown', onTecla)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onTecla)
})

watch(
  () => estado.abierto,
  (abierto) => {
    if (abierto) nextTick(() => cancelarBtn.value?.focus())
  }
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="estado.abierto"
      class="mc-overlay"
      @mousedown.self="cancelarConfirmacion"
    >
      <div class="mc-card" role="dialog" aria-modal="true" :aria-label="estado.titulo">
        <h3 class="mc-titulo">{{ estado.titulo }}</h3>
        <p class="mc-mensaje">{{ estado.mensaje }}</p>
        <div class="mc-acciones">
          <button
            ref="cancelarBtn"
            type="button"
            class="mc-btn mc-btn-cancelar"
            @click="cancelarConfirmacion"
          >{{ estado.textoCancelar }}</button>
          <button
            type="button"
            class="mc-btn mc-btn-confirmar"
            :class="{ 'mc-btn-peligro': estado.peligro }"
            @click="aceptarConfirmacion"
          >{{ estado.textoConfirmar }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mc-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(22, 33, 15, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.mc-card {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 420px;
  padding: 22px 22px 20px;
  box-shadow: 0 24px 64px rgba(22, 33, 15, 0.28);
  font-family: 'Work Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.mc-titulo {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 800;
  color: #16210f;
}

.mc-mensaje {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #5b6356;
  white-space: pre-line;
  word-break: break-word;
}

.mc-acciones {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.mc-btn {
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.mc-btn-cancelar {
  background: #ffffff;
  color: #16210f;
  border: 1px solid #d9e2d3;
}
.mc-btn-cancelar:hover {
  background: #f6f8f4;
}

.mc-btn-confirmar {
  background: #39a900;
  color: #ffffff;
  border: 1px solid #39a900;
}
.mc-btn-confirmar:hover {
  background: #2f8c00;
}

.mc-btn-peligro {
  background: #c4432b;
  border-color: #c4432b;
}
.mc-btn-peligro:hover {
  background: #a33622;
}

.mc-btn:focus-visible {
  outline: 2px solid #39a900;
  outline-offset: 2px;
}

@media (max-width: 420px) {
  .mc-acciones { flex-direction: column-reverse; }
  .mc-acciones .mc-btn { width: 100%; }
}
</style>
