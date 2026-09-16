<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import KioskoView from './views/KioskoView.vue'
import DocenteLogin from './views/DocenteLogin.vue'
import DocenteView from './views/DocenteView.vue'

const vista = ref('kiosko')
const status = ref({ online: false, claseActiva: null, docente: null })

let unsubscribe = null

onMounted(async () => {
  status.value = await window.huellero.getStatus()
  unsubscribe = window.huellero.onStatus((s) => {
    status.value = s
    if (vista.value === 'docente' && !s.docente) {
      vista.value = 'kiosko'
    }
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

function abrirLogin() {
  vista.value = 'login'
}

async function manejarLogin(credenciales) {
  const res = await window.huellero.loginDocente(credenciales.correo, credenciales.password)
  if (res.ok) {
    status.value = await window.huellero.getStatus()
    vista.value = 'docente'
    return true
  }
  return res.error
}

async function manejarLogout() {
  await window.huellero.logoutDocente()
  status.value = await window.huellero.getStatus()
  vista.value = 'kiosko'
}
</script>

<template>
  <Transition name="view-swap" mode="out-in">
    <KioskoView v-if="vista === 'kiosko'" key="kiosko" :status="status" @abrir-login="abrirLogin" />
    <DocenteLogin v-else-if="vista === 'login'" key="login" @volver="vista = 'kiosko'" :on-login="manejarLogin" />
    <DocenteView v-else-if="vista === 'docente'" key="docente" :status="status" @logout="manejarLogout" />
  </Transition>
</template>