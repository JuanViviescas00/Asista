<script setup>
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps({
  onLogin: { type: Function, required: true },
})

const emit = defineEmits(['volver'])

const correo = ref('')
const password = ref('')
const error = ref('')
const cargando = ref(false)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function enviar() {
  if (cargando.value) return
  error.value = ''

  const valor = correo.value.trim()
  if (!EMAIL_REGEX.test(valor)) {
    error.value = 'Ingresa un correo electrónico válido'
    return
  }
  if (!password.value) {
    error.value = 'Ingresa la contraseña'
    return
  }

  cargando.value = true
  const res = await props.onLogin({ correo: valor, password: password.value })
  if (res === true) return

  error.value = res || 'No se pudo iniciar sesión'
  cargando.value = false
}
</script>

<template>
  <div class="login">
    <form class="card" @submit.prevent="enviar">
      <div class="card-icon">
        <AppIcon name="user" :size="24" />
      </div>

      <h2>Acceso docente</h2>
      <p class="hint">Inicia sesión para administrar la clase y el enrolamiento.</p>

      <label>
        Correo electrónico
        <input v-model="correo" type="email" autocomplete="email" required autofocus />
      </label>

      <label>
        Contraseña
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>

      <Transition name="error-in">
        <p v-if="error" class="error">
          <AppIcon name="alert-triangle" :size="15" />
          {{ error }}
        </p>
      </Transition>

      <button class="primary" type="submit" :disabled="cargando">
        <AppIcon v-if="cargando" name="loader" :size="16" class="spin" />
        {{ cargando ? 'Verificando…' : 'Entrar' }}
      </button>

      <button class="ghost" type="button" @click="emit('volver')">Volver</button>
    </form>
  </div>
</template>

<style scoped>
.login {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  width: 350px;
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 14px;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  padding: 30px;
  border-radius: 18px;
  animation: rise 0.32s var(--ease-out);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-bottom: 2px;
}

h2 {
  margin: 0;
  font-size: 20px;
}

.hint {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 14px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--muted);
  text-align: left;
}

.error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--danger);
  font-size: 13.5px;
}

.error-in-enter-active {
  transition: opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}

.error-in-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>