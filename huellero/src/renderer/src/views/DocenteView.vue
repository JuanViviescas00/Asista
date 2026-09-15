<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import EnrolarHuellaModal from './EnrolarHuellaModal.vue'

const props = defineProps({
  status: { type: Object, required: true },
})

const emit = defineEmits(['logout'])

const nombre = computed(() => props.status.docente?.nombre || 'Docente')
const rolDetallado = computed(() => props.status.docente?.rolDetallado || 'Instructor')
const esLider = computed(() => !!props.status.docente?.esLider)

const modalAbierto = ref(false)
</script>

<template>
  <div class="docente">
    <header>
      <div class="quien">
        <div class="avatar">
          <AppIcon name="user" :size="20" />
        </div>
        <div class="quien-texto">
          <h1>Modo docente</h1>
          <span class="nombre">{{ nombre }} · {{ rolDetallado }}</span>
        </div>
      </div>
      <div class="acciones">
        <button v-if="esLider" class="primary" @click="modalAbierto = true">
          <AppIcon name="fingerprint" :size="17" />
          Registrar huella
        </button>
        <button class="secondary" @click="emit('logout')">
          <AppIcon name="log-out" :size="16" />
          Cerrar sesión
        </button>
      </div>
    </header>

    <main class="contenido">
      <div class="info" v-if="esLider">
        <AppIcon name="shield-check" :size="30" />
        <p>Como líder de ficha, puedes registrar las huellas de tus estudiantes.</p>
      </div>
      <div class="info muted" v-else>
        <AppIcon name="clock" :size="30" />
        <p>Solo los instructores líderes pueden registrar huellas.</p>
      </div>
    </main>

    <Transition name="modal-pop">
      <EnrolarHuellaModal
        v-if="modalAbierto"
        :clase-activa="status.claseActiva"
        @close="modalAbierto = false"
      />
    </Transition>
  </div>
</template>

<style scoped>
.docente {
  height: 100%;
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 26px;
  border-bottom: 1px solid var(--line);
}

.quien {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--bg-elev-2);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quien-texto {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

h1 {
  margin: 0;
  font-size: 19px;
}

.nombre {
  color: var(--muted);
  font-size: 13.5px;
}

.acciones {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.contenido {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 26px;
}

.info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 400px;
  text-align: center;
  color: var(--accent);
  animation: rise 0.3s var(--ease-out);
}

.info.muted {
  color: var(--muted);
}

.info p {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.6;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>