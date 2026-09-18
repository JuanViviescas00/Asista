<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useAuth } from '../composables/useAuth.js'
import { useSistemaEstado } from '../composables/useSistemaEstado.js'
import { getCurrentView, navigate, viewsForRole, currentComponentFor } from '../router/index.js'
import senaLogo from '../assets/sena-logo.png'

const $q = useQuasar()
const { usuario, headerTitulo, headerSubtitulo, cerrarSesion } = useAuth()
const { estadoSistema, textoEstado, colorEstadoClass } = useSistemaEstado()

// Drawer de Quasar: `drawerOpen` controla la visibilidad base,
// `drawerMini` controla el modo colapsado/desplegado con mini-to-overlay.
const drawerOpen = ref(true)
const drawerMini = ref(true)

const currentView = getCurrentView()

const viewsDisponibles = computed(() => viewsForRole(usuario.value?.rol || 'Administrador'))
const currentComponent = computed(() => currentComponentFor(usuario.value?.rol || 'Administrador'))

// Ícono (Material Icons, vía Quasar) asociado a cada vista del menú.
const iconosPorVista = {
  panel_instructor: 'groups',
  panel_estudiante: 'school',
  dashboard: 'grid_view',
  perfil: 'person',
  instructores: 'person_add',
  estudiantes: 'group_add',
  fichas: 'badge',
  dispositivos: 'computer',
  importar: 'cloud_upload',
  reportes: 'description',
  seguimiento: 'warning',
  diasFestivos: 'event_busy',
}

// Título partido en dos para pintar "Panel" en blanco y el resto en verde,
// tal como en el diseño de referencia.
const tituloPrincipal = computed(() => headerTitulo.value.split(' ')[0])
const tituloResaltado = computed(() => headerTitulo.value.split(' ').slice(1).join(' '))

// Iniciales del usuario para el avatar (no hay foto de perfil en los datos).
const inicialesUsuario = computed(() => {
  const nombre = usuario.value?.nombre || ''
  const iniciales = nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return iniciales || 'SA'
})

function toggleMini() {
  drawerMini.value = !drawerMini.value
}

function onSidebarClick() {
  if (drawerMini.value) {
    drawerMini.value = false
  }
}

function irA(key) {
  navigate(key)
  // Al seleccionar un item, NO se guarda/cierra el menu!
}
</script>

<template>
  <q-layout view="hHh Lpr fFf" class="app-shell">
    <!-- Backdrop flotante cuando el menu esta expandido para cerrar al hacer clic afuera -->
    <div
      v-if="!drawerMini"
      class="sidebar-backdrop"
      @click="drawerMini = true"
    ></div>

    <q-drawer
      v-model="drawerOpen"
      :mini="drawerMini"
      mini-to-overlay
      show-if-above
      :width="290"
      :mini-width="80"
      class="app-sidebar"
      @click="onSidebarClick"
    >
      <div class="sidebar-inner">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <div class="sidebar-logo">
              <img :src="senaLogo" alt="Logo SENA" />
            </div>
            <div class="sidebar-brand-text" v-if="!drawerMini">
              <h2 class="sidebar-title">{{ tituloPrincipal }} <span>{{ tituloResaltado }}</span></h2>
              <p class="sidebar-subtitle">{{ headerSubtitulo }}</p>
            </div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a
            v-for="(view, key) in viewsDisponibles"
            :key="key"
            class="nav-item"
            :class="{ active: currentView === key }"
            :title="view.label"
            @click="irA(key)"
          >
            <span class="nav-item-icon">
              <q-icon :name="iconosPorVista[key] || 'circle'" size="18px" />
            </span>
            <span v-if="!drawerMini" class="nav-item-label">{{ view.label }}</span>
            <q-icon v-if="!drawerMini && currentView === key" name="chevron_right" class="nav-item-arrow" size="16px" />
          </a>
        </nav>

        <div
          class="sidebar-status"
          :class="colorEstadoClass(estadoSistema.colorEstado)"
          :title="drawerMini ? textoEstado : null"
        >
          <span v-if="!drawerMini" class="estado-dot"></span>
          <span class="estado-icon"><q-icon name="fingerprint" size="20px" /></span>
          <span v-if="!drawerMini" class="status-title">{{ textoEstado }}</span>
        </div>
      </div>
    </q-drawer>

    <q-page-container>
      <main class="main-content">
        <header class="app-topbar">
          <button class="btn-toggle-drawer" @click="toggleMini" :title="drawerMini ? 'Expandir menú' : 'Contraer menú'">
            <q-icon :name="drawerMini ? 'menu' : 'menu_open'" size="20px" />
            <span>{{ drawerMini ? 'Expandir' : 'Contraer' }}</span>
          </button>
          <button class="btn-logout-top" @click="cerrarSesion" title="Cerrar sesión">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar Sesión
          </button>
        </header>
        <component :is="currentComponent" />
      </main>
    </q-page-container>
  </q-layout>
</template>

