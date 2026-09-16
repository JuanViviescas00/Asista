<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { useSistemaEstado } from '../composables/useSistemaEstado.js'
import { getCurrentView, navigate, viewsForRole, currentComponentFor } from '../router/index.js'

const { usuario, headerTitulo, headerSubtitulo, cerrarSesion } = useAuth()
const { estadoSistema, textoEstado, colorEstadoClass } = useSistemaEstado()

const sidebarOpen = ref(false)
const currentView = getCurrentView()

const viewsDisponibles = computed(() => viewsForRole(usuario.value?.rol || 'Administrador'))
const currentComponent = computed(() => currentComponentFor(usuario.value?.rol || 'Administrador'))
</script>

<template>
  <button class="menu-toggle" @click="sidebarOpen = !sidebarOpen">&#9776;</button>

  <div class="drawer-overlay" :class="{ visible: sidebarOpen }" @click="sidebarOpen = false"></div>

  <aside class="sidebar" :class="{ open: sidebarOpen }">
    <div class="sidebar-header">
      <h2>{{ headerTitulo }}</h2>
      <span>{{ headerSubtitulo }}</span>
    </div>
    <nav class="sidebar-nav">
      <a
        v-for="(view, key) in viewsDisponibles"
        :key="key"
        class="nav-item"
        :class="{ active: currentView === key }"
        @click="navigate(key)"
      >
        <svg v-if="key === 'panel_instructor'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <svg v-if="key === 'panel_estudiante'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 10 12 5 2 10l10 5 10-5z"/>
          <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>
        </svg>
        <svg v-if="key === 'dashboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <svg v-if="key === 'perfil'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <svg v-if="key === 'instructores'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <svg v-if="key === 'estudiantes'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
        <svg v-if="key === 'importar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <svg v-if="key === 'reportes'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <svg v-if="key === 'seguimiento'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <svg v-if="key === 'diasFestivos'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <svg v-if="key === 'fichas'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
        <svg v-if="key === 'dispositivos'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="12" rx="2" ry="2"/>
          <line x1="6" y1="20" x2="6" y2="16"/>
          <line x1="18" y1="20" x2="18" y2="16"/>
          <line x1="12" y1="20" x2="12" y2="16"/>
        </svg>
        {{ view.label }}
      </a>
    </nav>
    <div class="sidebar-status">
      <span
        class="estado-ojo"
        :class="colorEstadoClass(estadoSistema.colorEstado)"
        :title="textoEstado"
      ></span>
      <span class="status-title">{{ textoEstado }}</span>
    </div>
  </aside>

  <main class="main-content">
    <header class="app-topbar">
      <span class="app-topbar-user">{{ usuario?.nombre || headerTitulo }}</span>
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
</template>
