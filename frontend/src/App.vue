<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAuth, initAuth } from './composables/useAuth.js'
import { setViewForRole } from './router/index.js'
import DefaultLayout from './layouts/DefaultLayout.vue'
import Login from './views/Login.vue'
import KioscoAsistencia from './views/KioscoAsistencia.vue'

const { autenticado, usuario, onLoginSuccess } = useAuth()
const modoKioscoStandalone = ref(false)

// Al cambiar de rol (login/logout), sitúa al usuario en su vista por defecto.
watch(
  () => usuario.value?.rol,
  (rol) => {
    if (autenticado.value && rol) setViewForRole(rol)
  },
  { immediate: true }
)

onMounted(() => {
  initAuth()
})
</script>

<template>
  <KioscoAsistencia
    v-if="modoKioscoStandalone"
    :standalone="true"
    @salir-kiosco="modoKioscoStandalone = false"
  />

  <Login
    v-else-if="!autenticado"
    @login-success="onLoginSuccess"
    @abrir-kiosco="modoKioscoStandalone = true"
  />

  <DefaultLayout v-else />
</template>
