<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import AdminPerfil from './components/AdminPerfil.vue'
import Instructores from './components/Instructores.vue'
import Fichas from './components/Fichas.vue'
import Estudiantes from './components/Estudiantes.vue'
import ImportarUsuarios from './components/ImportarUsuarios.vue'
import Dashboard from './components/Dashboard.vue'
import Reportes from './components/Reportes.vue'
import DiasFestivos from './components/DiasFestivos.vue'
import PanelDispositivos from './components/PanelDispositivos.vue'
import PanelInstructor from './components/PanelInstructor.vue'
import PanelEstudiante from './components/PanelEstudiante.vue'
import Login from './components/Login.vue'
import KioscoAsistencia from './components/KioscoAsistencia.vue'

const INACTIVIDAD_MS = 10 * 60 * 1000

const modoKioscoStandalone = ref(false)
const autenticado = ref(sessionStorage.getItem('admin_auth') === 'true')
const userStr = sessionStorage.getItem('user_data')
const usuario = ref(userStr ? JSON.parse(userStr) : null)

const currentView = ref(
  usuario.value?.rol === 'Instructor' ? 'panel_instructor' : (usuario.value?.rol === 'Estudiante' ? 'panel_estudiante' : 'perfil')
)
const sidebarOpen = ref(false)
let inactividadTimer = null

const views = {
  panel_instructor: { component: PanelInstructor, label: 'Mis Fichas / Grupos', roles: ['Instructor'] },
  panel_estudiante: { component: PanelEstudiante, label: 'Mi Panel Aprendiz', roles: ['Estudiante'] },
  dashboard: { component: Dashboard, label: 'Dashboard', roles: ['Administrador'] },
  perfil: { component: AdminPerfil, label: 'Perfil', roles: ['Administrador', 'Instructor'] },
  instructores: { component: Instructores, label: 'Instructores', roles: ['Administrador'] },
  estudiantes: { component: Estudiantes, label: 'Estudiantes', roles: ['Administrador', 'Instructor'] },
  fichas: { component: Fichas, label: 'Fichas', roles: ['Administrador'] },
  dispositivos: { component: PanelDispositivos, label: 'Dispositivos', roles: ['Administrador'] },
  importar: { component: ImportarUsuarios, label: 'Importar / Carga Masiva', roles: ['Administrador', 'Instructor'] },
  reportes: { component: Reportes, label: 'Reportes', roles: ['Administrador', 'Instructor'] },
  diasFestivos: { component: DiasFestivos, label: 'Días Inhabilitados', roles: ['Administrador'] },
}

const viewsDisponibles = computed(() => {
  const rolActual = usuario.value?.rol || 'Administrador'
  const filtrados = {}
  for (const key in views) {
    if (views[key].roles.includes(rolActual)) {
      filtrados[key] = views[key]
    }
  }
  return filtrados
})

const currentComponent = computed(() => {
  if (views[currentView.value]) {
    return views[currentView.value].component
  }
  if (usuario.value?.rol === 'Instructor') return PanelInstructor
  if (usuario.value?.rol === 'Estudiante') return PanelEstudiante
  return Dashboard
})

const headerTitulo = computed(() => {
  if (usuario.value?.rol === 'Instructor') return 'Panel Instructor'
  if (usuario.value?.rol === 'Estudiante') return 'Panel Aprendiz'
  return 'Panel Admin'
})

const headerSubtitulo = computed(() => {
  if (usuario.value?.rol === 'Instructor') return 'Docente SENA'
  if (usuario.value?.rol === 'Estudiante') return 'Aprendiz SENA'
  return 'Administración SENA'
})

import api from './services/api.js'
import { reconectarConAuth } from './services/socket.js'

const estadoSistema = reactive({
  estadoWebSocket: 'Desconectado',
  estadoLectorUSB: 'Desconectado',
  colorSemaforo: 'rojo',
})

let statusInterval = null

let fpSdkCheck = null

async function verificarEstadoRealSistema() {
  // 1. Verificar Servidor Backend
  try {
    const res = await api.estudiantes.fingerprint.status()
    if (res && res.sdkAvailable !== undefined) {
      estadoSistema.estadoWebSocket = 'Conectado'
    } else {
      estadoSistema.estadoWebSocket = 'Desconectado'
    }
  } catch (err) {
    estadoSistema.estadoWebSocket = 'Desconectado'
    estadoSistema.estadoLectorUSB = 'Desconectado'
    estadoSistema.colorSemaforo = 'rojo'
    return
  }

  // 2. Verificar Lector USB Físico vía SDK
  if (typeof Fingerprint !== 'undefined') {
    try {
      if (!fpSdkCheck) {
        fpSdkCheck = new Fingerprint.WebApi()
      }
      const readers = await fpSdkCheck.enumerateDevices()
      if (readers && readers.length > 0) {
        estadoSistema.estadoLectorUSB = 'Conectado'
      } else {
        estadoSistema.estadoLectorUSB = 'Desconectado'
      }
    } catch (e) {
      estadoSistema.estadoLectorUSB = 'Desconectado'
    }
  } else {
    estadoSistema.estadoLectorUSB = 'Desconectado'
  }

  // 3. Evaluar Color del Semáforo General
  if (estadoSistema.estadoWebSocket === 'Conectado' && estadoSistema.estadoLectorUSB === 'Conectado') {
    estadoSistema.colorSemaforo = 'verde'
  } else if (estadoSistema.estadoWebSocket === 'Conectado') {
    estadoSistema.colorSemaforo = 'amarillo'
  } else {
    estadoSistema.colorSemaforo = 'rojo'
  }
}

function manejarExpiracionAuth(e) {
  cerrarSesion()
  if (e?.detail) {
    alert(e.detail)
  }
}

onMounted(() => {
  verificarEstadoRealSistema()
  statusInterval = setInterval(verificarEstadoRealSistema, 3000)
  window.addEventListener('auth-expired', manejarExpiracionAuth)
})

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
  window.removeEventListener('auth-expired', manejarExpiracionAuth)
})

function colorSemaforoClass(color) {
  if (color === 'verde') return 'semaforo-verde'
  if (color === 'amarillo') return 'semaforo-amarillo'
  return 'semaforo-rojo'
}

function onLoginSuccess(userData) {
  autenticado.value = true
  sessionStorage.setItem('admin_auth', 'true')
  if (userData) {
    usuario.value = userData
    sessionStorage.setItem('user_data', JSON.stringify(userData))
  } else {
    const raw = sessionStorage.getItem('user_data')
    if (raw) usuario.value = JSON.parse(raw)
  }
  if (usuario.value?.rol === 'Instructor') {
    currentView.value = 'panel_instructor'
  } else if (usuario.value?.rol === 'Estudiante') {
    currentView.value = 'panel_estudiante'
  } else {
    currentView.value = 'perfil'
  }
  reconectarConAuth()
}

function cerrarSesion() {
  autenticado.value = false
  usuario.value = null
  sessionStorage.removeItem('admin_auth')
  sessionStorage.removeItem('user_data')
  sessionStorage.removeItem('auth_token')
  currentView.value = 'perfil'
  detenerTimerInactividad()
  reconectarConAuth()
}

function navigate(view) {
  currentView.value = view
  sidebarOpen.value = false
}

function reiniciarTimerInactividad() {
  if (inactividadTimer) clearTimeout(inactividadTimer)
  inactividadTimer = setTimeout(() => {
    cerrarSesion()
  }, INACTIVIDAD_MS)
}

function detenerTimerInactividad() {
  if (inactividadTimer) {
    clearTimeout(inactividadTimer)
    inactividadTimer = null
  }
}

function iniciarTimerInactividad() {
  detenerTimerInactividad()
  const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'mousedown']
  eventos.forEach(e => document.addEventListener(e, reiniciarTimerInactividad))
  reiniciarTimerInactividad()
}

function limpiarListeners() {
  const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'mousedown']
  eventos.forEach(e => document.removeEventListener(e, reiniciarTimerInactividad))
  detenerTimerInactividad()
}

watch(autenticado, (val) => {
  if (val) {
    iniciarTimerInactividad()
  } else {
    limpiarListeners()
  }
})

onMounted(() => {
  if (autenticado.value) {
    iniciarTimerInactividad()
  }
})

onUnmounted(() => {
  limpiarListeners()
})
</script>

<template>
  <KioscoAsistencia
    v-if="modoKioscoStandalone"
    :standalone="true"
    @salir-kiosco="modoKioscoStandalone = false"
  />

  <Login v-else-if="!autenticado" @login-success="onLoginSuccess" @abrir-kiosco="modoKioscoStandalone = true" />

  <template v-else>
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
          <svg v-if="key === 'consulta'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
        <div class="status-title">Estado del Sistema</div>
        <div class="semaforo-container">
          <div class="semaforo" :class="colorSemaforoClass(estadoSistema.colorSemaforo)">
            <div class="luz luz-roja" :class="{ activa: estadoSistema.colorSemaforo === 'rojo' }"></div>
            <div class="luz luz-amarilla" :class="{ activa: estadoSistema.colorSemaforo === 'amarillo' }"></div>
            <div class="luz luz-verde" :class="{ activa: estadoSistema.colorSemaforo === 'verde' }"></div>
          </div>
          <div class="status-detalle">
            <div class="status-line">
              <span class="status-dot" :class="estadoSistema.estadoWebSocket === 'Conectado' ? 'dot-verde' : 'dot-rojo'"></span>
              <span>WebSocket: {{ estadoSistema.estadoWebSocket }}</span>
            </div>
            <div class="status-line">
              <span class="status-dot" :class="estadoSistema.estadoLectorUSB === 'Conectado' ? 'dot-verde' : 'dot-rojo'"></span>
              <span>U.are.U 4500: {{ estadoSistema.estadoLectorUSB }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="sidebar-footer">
        <button class="btn-logout" @click="cerrarSesion">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar Sesión
        </button>
      </div>
    </aside>

    <main class="main-content">
      <component :is="currentComponent" @cerrar-sesion="cerrarSesion" />
    </main>
  </template>
</template>
