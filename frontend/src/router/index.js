// ============================================================
// ROUTER — definición central de rutas (vistas) y navegación.
//
// No usa vue-router (no está instalado); implementa un router
// liviano con estado reactivo. Cada ruta asocia un nombre interno
// con su componente, etiqueta del menú y roles permitidos.
// ============================================================
import { ref } from 'vue'

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
  seguimiento: { component: SeguimientoInasistencias, label: 'Seguimiento Inasistencias', roles: ['Administrador', 'Instructor'] },
  diasFestivos: { component: DiasFestivos, label: 'Días Inhabilitados', roles: ['Administrador'] },
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

export function viewsForRole(rol) {
  const result = {}
  for (const key in routes) {
    if (routes[key].roles.includes(rol)) {
      result[key] = routes[key]
    }
  }
  return result
}

export function currentComponentFor(rol) {
  if (currentView.value && routes[currentView.value]) {
    return routes[currentView.value].component
  }
  return routes[defaultViewForRole(rol)].component
}
