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

// Título partido en dos para pintar "Panel" en un color y el resto en verde,
// tal como en el diseño de referencia.
const tituloPrincipal = computed(() => headerTitulo.value.split(' ')[0])
const tituloResaltado = computed(() => headerTitulo.value.split(' ').slice(1).join(' '))

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function toggleMini() {
  drawerMini.value = !drawerMini.value
}

// Clic sobre cualquier parte del sidebar (fuera de los enlaces) alterna
// entre expandido y contraído. Solo en escritorio; en móvil el drawer es
// un overlay que se controla con el botón hamburguesa.
function onSidebarClick() {
  if ($q.screen.gt.sm) {
    toggleMini()
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
      mini-to-overlay
      :width="272"
      :mini-width="88"
      class="app-sidebar"
      @click="onSidebarClick"
    >
      <div class="sidebar-inner" @click="onSidebarClick">
        <div class="sidebar-header">
          <div class="sidebar-header-top">
            <button
              type="button"
              class="sidebar-logo-btn"
              @click.stop="toggleMini"
              :title="drawerMini ? 'Expandir menú' : 'Contraer menú'"
            >
              <img :src="senaLogo" alt="Logo SENA" />
            </button>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a
            v-for="(view, key) in viewsDisponibles"
            :key="key"
            class="nav-item"
            :class="{ active: currentView === key }"
            :title="drawerMini ? view.label : null"
            @click.stop="irA(key)"
          >
            <span class="nav-item-icon">
              <q-icon :name="iconosPorVista[key] || 'circle'" size="18px" />
            </span>
            <span v-if="!drawerMini" class="nav-item-label">{{ view.label }}</span>
            <q-icon v-if="!drawerMini && currentView === key" name="chevron_right" class="nav-item-arrow" size="16px" />
          </a>

          <a
            class="nav-item nav-item-logout"
            :title="drawerMini ? 'Cerrar Sesión' : null"
            @click.stop="cerrarSesion"
          >
            <span class="nav-item-icon">
              <q-icon name="logout" size="20px" />
            </span>
            <span v-if="!drawerMini" class="nav-item-label">Cerrar Sesión</span>
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

