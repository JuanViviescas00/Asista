<script setup>
import { useAvisoState, cerrarAviso } from '../composables/useAviso.js'

const estado = useAvisoState()
</script>

<template>
  <Teleport to="body">
    <Transition name="aviso">
      <div
        v-if="estado.abierto"
        class="aviso-global"
        :class="'aviso-global-' + estado.tipo"
        role="status"
      >
        <span class="aviso-global-mensaje">{{ estado.mensaje }}</span>
        <button
          type="button"
          class="aviso-global-cerrar"
          aria-label="Cerrar"
          @click="cerrarAviso"
        >&times;</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.aviso-global {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2100;
  max-width: 420px;
  padding: 12px 14px 12px 18px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 4px rgba(22, 33, 15, 0.03), 0 18px 48px rgba(22, 33, 15, 0.18);
  font-family: 'Work Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.aviso-global-mensaje {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.aviso-global-cerrar {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 0 4px;
  color: inherit;
  opacity: 0.75;
}
.aviso-global-cerrar:hover {
  opacity: 1;
}

.aviso-global-success {
  background: #2f8c00;
  color: #ffffff;
}
.aviso-global-error {
  background: #c4432b;
  color: #ffffff;
}
.aviso-global-warning {
  background: #e9a100;
  color: #4a3b00;
}
.aviso-global-info {
  background: #16210f;
  color: #ffffff;
}

.aviso-enter-active,
.aviso-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.aviso-enter-from,
.aviso-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 480px) {
  .aviso-global, .ag-aviso { left: 12px; right: 12px; max-width: none; }
}
</style>
