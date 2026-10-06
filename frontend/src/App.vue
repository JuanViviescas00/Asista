<script setup>
import { watch, onMounted } from 'vue'
import { useAuth, initAuth } from './composables/useAuth.js'
import { setViewForRole, actualizarTituloPestana } from './router/index.js'
import DefaultLayout from './layouts/DefaultLayout.vue'
import Login from './views/Login.vue'

const { autenticado, usuario, onLoginSuccess } = useAuth()

// Al cambiar de rol (login/logout), sitúa al usuario en su vista por defecto.
watch(
  () => usuario.value?.rol,
  (rol) => {
    if (autenticado.value && rol) setViewForRole(rol)
  },
  { immediate: true }
)

// Título de pestaña: login (sin sesión) vs vista activa (con sesión).
watch(
  autenticado,
  (tieneSesion) => {
    if (tieneSesion) {
      actualizarTituloPestana()
    } else {
      document.title = 'Iniciar sesión · Asista'
    }
  },
  { immediate: true }
)

onMounted(() => {
  initAuth()
})
</script>

<template>
  <Login
    v-if="!autenticado"
    @login-success="onLoginSuccess"
  />

  <DefaultLayout v-else />
</template>
