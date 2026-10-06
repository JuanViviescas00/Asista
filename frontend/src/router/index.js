// ============================================================
// ROUTER — definición central de rutas (vistas) y navegación.
//
// No usa vue-router (no está instalado); implementa un router
// liviano con estado reactivo. Cada ruta asocia un nombre interno
// con su componente, etiqueta del menú y roles permitidos.
// ============================================================
import { ref, watch } from 'vue'

import Dashboard from '../views/Dashboard.vue'
import AdminPerfil from '../views/AdminPerfil.vue'
import Instructores from '../views/Instructores.vue'
import Fichas from '../views/Fichas.vue'
import Estudiantes from '../views/Estudiantes.vue'
import ImportarUsuarios from '../views/ImportarUsuarios.vue'
import Reportes from '../views/Reportes.vue'
import SeguimientoInasistencias from '../views/SeguimientoInasistencias.vue'
import DiasFestivos from '../views/DiasFestivos.vue'
import PanelDispositivos from '../views/PanelDispositivos.vue'
import PanelInstructor from '../views/PanelInstructor.vue'
import PanelEstudiante from '../views/PanelEstudiante.vue'

export const routes = {
  panel_instructor: { component: PanelInstructor, label: 'Mis Fichas / Grupos', meta: { title: 'Mis fichas' }, roles: ['Instructor'] },
  panel_estudiante: { component: PanelEstudiante, label: 'Mi Panel Aprendiz', meta: { title: 'Mi panel' }, roles: ['Estudiante'] },
  dashboard: { component: Dashboard, label: 'Dashboard', meta: { title: 'Panel principal' }, roles: ['Administrador'] },
  perfil: { component: AdminPerfil, label: 'Perfil', meta: { title: 'Perfil' }, roles: ['Administrador', 'Instructor'] },
  instructores: { component: Instructores, label: 'Instructores', meta: { title: 'Instructores' }, roles: ['Administrador'] },
  estudiantes: { component: Estudiantes, label: 'Estudiantes', meta: { title: 'Estudiantes' }, roles: ['Administrador', 'Instructor'] },
  fichas: { component: Fichas, label: 'Fichas', meta: { title: 'Fichas' }, roles: ['Administrador'] },
  dispositivos: { component: PanelDispositivos, label: 'Dispositivos', meta: { title: 'Dispositivos' }, roles: ['Administrador'] },
  importar: { component: ImportarUsuarios, label: 'Importar / Carga Masiva', meta: { title: 'Importar usuarios' }, roles: ['Administrador', 'Instructor'], soloLider: true },
  reportes: { component: Reportes, label: 'Reportes', meta: { title: 'Reportes' }, roles: ['Administrador', 'Instructor'] },
  seguimiento: { component: SeguimientoInasistencias, label: 'Seguimiento Inasistencias', meta: { title: 'Seguimiento de inasistencias' }, roles: ['Administrador', 'Instructor'] },
  diasFestivos: { component: DiasFestivos, label: 'Días Inhabilitados', meta: { title: 'Días inhabilitados' }, roles: ['Administrador'] },
}

export function defaultViewForRole(rol) {
  if (rol === 'Instructor') return 'panel_instructor'
  if (rol === 'Estudiante') return 'panel_estudiante'
  return 'perfil'
}

const currentView = ref(null)

export function navigate(view) {
  if (routes[view]) currentView.value = view
}

export function setViewForRole(rol) {
  currentView.value = defaultViewForRole(rol)
}

export function getCurrentView() {
  return currentView
}

export function viewsForRole(rol, esLider) {
  const result = {}
  for (const key in routes) {
    const ruta = routes[key]
    if (!ruta.roles.includes(rol)) continue
    if (ruta.soloLider && rol === 'Instructor' && !esLider) continue
    result[key] = ruta
  }
  return result
}

export function currentComponentFor(rol) {
  if (currentView.value && routes[currentView.value]) {
    return routes[currentView.value].component
  }
  return routes[defaultViewForRole(rol)].component
}

// Actualiza el título de la pestaña al cambiar de vista (equivalente a
// router.afterEach de vue-router, adaptado a este router liviano).
export function actualizarTituloPestana() {
  const ruta = currentView.value ? routes[currentView.value] : null
  const titulo = ruta?.meta?.title
  document.title = titulo ? `${titulo} · Asista` : 'Asista'
}

watch(currentView, actualizarTituloPestana)
