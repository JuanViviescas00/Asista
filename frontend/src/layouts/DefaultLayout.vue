<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { useAuth } from '../composables/useAuth.js'
import { useSistemaEstado } from '../composables/useSistemaEstado.js'
import { getCurrentView, navigate, viewsForRole, currentComponentFor } from '../router/index.js'
import senaLogo from '../assets/sena-logo.png'
import instructorAvatar from '../assets/instructor-avatar.png'

const $q = useQuasar()
const { usuario, headerTitulo, headerSubtitulo, cerrarSesion } = useAuth()
const { estadoSistema, textoEstado, colorEstadoClass } = useSistemaEstado()

// Drawer de Quasar: `drawerOpen` controla la visibilidad en móvil (overlay),
// `drawerMini` controla el modo colapsado/desplegado en escritorio.
const drawerOpen = ref(false)
const drawerMini = ref(false)

const currentView = getCurrentView()

const rolActual = computed(() => usuario.value?.rol || 'Administrador')

// Instructores (incluido el instructor líder) ven un avatar en lugar del logo SENA.
const esInstructor = computed(() => rolActual.value === 'Instructor')
const vistasDelRol = computed(() => viewsForRole(rolActual.value, usuario.value?.esLider))

// "Perfil" ya no aparece como ítem del menú: se abre al pulsar el logo SENA.
const viewsDisponibles = computed(() => {
  const { perfil, ...resto } = vistasDelRol.value
  return resto
})
const tienePerfil = computed(() => !!vistasDelRol.value.perfil)

// El modo mini (solo íconos) existe únicamente en escritorio. En móvil el
// drawer siempre se muestra completo para no perder los textos del menú.
const esMovil = computed(() => $q.screen.lt.md)
const miniEfectivo = computed(() => drawerMini.value && !esMovil.value)
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
  if (esMovil.value) return
  drawerMini.value = !drawerMini.value
}

// Clic en el logo SENA: abre el layout de Perfil.
function abrirPerfil() {
  if (!tienePerfil.value) return
  navigate('perfil')
  if (esMovil.value) {
    drawerOpen.value = false
  }
}

// Clic dentro del sidebar: si está contraído (mini) lo expande; si ya está
// expandido no hace nada (ya no se cierra al presionarlo por dentro).
function onSidebarClick() {
  if (!esMovil.value && drawerMini.value) {
    drawerMini.value = false
  }
}

// Clic fuera del menú: lo cierra.
// - Escritorio: lo contrae al modo mini.
// - Móvil: el overlay de Quasar ya se cierra al tocar el fondo oscuro.
function onClickFuera(e) {
  if (esMovil.value || drawerMini.value) return
  if (e.target.closest?.('.app-sidebar')) return
  drawerMini.value = true
}

onMounted(() => document.addEventListener('click', onClickFuera))
onBeforeUnmount(() => document.removeEventListener('click', onClickFuera))

function irA(key) {
  navigate(key)
  // Solo cerramos el overlay en móvil; en escritorio el menú
  // permanece tal cual estaba (abierto o mini), sin cerrarse.
  if (esMovil.value) {
    drawerOpen.value = false
  }
}
</script>

<template>
  <q-layout view="hhh lpr fff" class="app-shell">
    <q-drawer
      v-model="drawerOpen"
      :mini="miniEfectivo"
      show-if-above
      mini-to-overlay
      :width="272"
      :mini-width="88"
      class="app-sidebar"
    >
      <div class="sidebar-inner" @click="onSidebarClick">
        <div class="sidebar-header">
          <div class="sidebar-header-top">
            <button
              type="button"
              class="sidebar-logo-btn"
              :class="{ active: currentView === 'perfil' }"
              @click.stop="abrirPerfil"
              :title="tienePerfil ? 'Ir a Perfil' : null"
            >
              <img
                v-if="esInstructor"
                :src="instructorAvatar"
                alt="Instructor"
                class="sidebar-avatar-img"
              />
              <img v-else :src="senaLogo" alt="Logo SENA" />
            </button>
          </div>

          <template v-if="!miniEfectivo">
            <h2 class="sidebar-title">{{ tituloPrincipal }} <span>{{ tituloResaltado }}</span></h2>
            <p class="sidebar-subtitle">{{ headerSubtitulo }}</p>
          </template>
        </div>

        <nav class="sidebar-nav">
          <a
            v-for="(view, key) in viewsDisponibles"
            :key="key"
            class="nav-item"
            :class="{ active: currentView === key }"
            :title="miniEfectivo ? view.label : null"
            @click.stop="irA(key)"
          >
            <span class="nav-item-icon">
              <q-icon :name="iconosPorVista[key] || 'circle'" size="20px" />
            </span>
            <span v-if="!miniEfectivo" class="nav-item-label">{{ view.label }}</span>
            <q-icon v-if="!miniEfectivo && currentView === key" name="chevron_right" class="nav-item-arrow" size="18px" />
          </a>

          <a
            class="nav-item nav-item-logout"
            :title="miniEfectivo ? 'Cerrar Sesión' : null"
            @click.stop="cerrarSesion"
          >
            <span class="nav-item-icon">
              <q-icon name="logout" size="20px" />
            </span>
            <span v-if="!miniEfectivo" class="nav-item-label">Cerrar Sesión</span>
          </a>
        </nav>

        <div class="sidebar-status" :class="colorEstadoClass(estadoSistema.colorEstado)">
          <span v-if="!miniEfectivo" class="estado-dot"></span>
          <span class="estado-icon"><q-icon name="fingerprint" size="18px" /></span>
          <span v-if="!miniEfectivo" class="status-title">{{ textoEstado }}</span>
        </div>
      </div>
    </q-drawer>

    <q-page-container>
      <button class="menu-toggle" @click="toggleDrawer">&#9776;</button>
      <main class="main-content">
        <header class="app-topbar">
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

