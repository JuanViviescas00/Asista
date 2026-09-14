<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import api from '../services/api.js'
import './adminPerfil.css'

const toast = ref({ show: false, message: '', type: '' })
const loading = ref(false)

const userStr = sessionStorage.getItem('user_data')
const usuarioSesion = ref(userStr ? JSON.parse(userStr) : null)

const esInstructor = computed(() => usuarioSesion.value?.rol === 'Instructor')

const perfil = reactive({
  id: '',
  nombre: '',
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  correo: '',
  telefono: '',
  especialidad: '',
  rol: '',
  estado: 'Activo',
})

const esLiderCalculado = ref(false)

// Estado del Modal de Cambio de Contraseña
const showModalPassword = ref(false)
const passForm = reactive({
  actual: '',
  nueva: '',
  confirmar: ''
})
const passError = ref('')
const passLoading = ref(false)
const showPass = reactive({
  actual: false,
  nueva: false,
  confirmar: false
})

onMounted(async () => {
  if (usuarioSesion.value) {
    perfil.id = usuarioSesion.value.id || ''
    perfil.rol = usuarioSesion.value.rol || 'Usuario'
    perfil.nombre = usuarioSesion.value.nombre || ''
    perfil.correo = usuarioSesion.value.correo || ''
  }

  if (esInstructor.value && perfil.id) {
    try {
      const [instructores, misFichas] = await Promise.all([
        api.instructores.getAll(),
        api.fichas.getMisFichas(perfil.id).catch(() => [])
      ])
      const inst = instructores.find(i => String(i._id) === String(perfil.id) || i.correo === perfil.correo)
      if (inst) {
        perfil.id = inst._id
        perfil.nombres = inst.nombres || ''
        perfil.apellidos = inst.apellidos || ''
        perfil.nombre = `${inst.nombres || ''} ${inst.apellidos || ''}`.trim() || perfil.nombre
        perfil.tipoDocumento = inst.tipoDocumento || 'CC'
        perfil.numeroDocumento = inst.numeroDocumento || ''
        perfil.correo = inst.correo || perfil.correo
        perfil.telefono = inst.telefono || ''
        perfil.especialidad = inst.especialidad || 'Docente SENA'
        perfil.estado = inst.estado || 'Activo'

        const esLiderEnFicha = misFichas.some(f => f.esLider || String(f.instructorLiderId?._id || f.instructorLiderId) === String(inst._id))
        esLiderCalculado.value = !!(inst.esLider || esLiderEnFicha || usuarioSesion.value?.esLider)
      }
    } catch (e) {
      console.error('Error al cargar datos del instructor:', e)
    }
  } else {
    try {
      const data = await api.auth.getPerfil()
      if (data) {
        perfil.nombre = data.nombre || perfil.nombre
        perfil.rol = data.rol || perfil.rol
        perfil.telefono = data.telefono || ''
        perfil.correo = data.correo || perfil.correo
      }
    } catch (e) {
      console.error('Error al cargar perfil de admin:', e)
    }
  }
})

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

async function guardarPerfil() {
  loading.value = true
  try {
    if (esInstructor.value && perfil.id) {
      const body = {
        nombres: perfil.nombres || perfil.nombre,
        apellidos: perfil.apellidos,
        telefono: perfil.telefono,
        correo: perfil.correo,
        especialidad: perfil.especialidad,
      }

      await api.instructores.update(perfil.id, body)
      
      // Actualizar sesión
      const updatedUser = { ...usuarioSesion.value, nombre: `${perfil.nombres} ${perfil.apellidos}`.trim(), correo: perfil.correo }
      sessionStorage.setItem('user_data', JSON.stringify(updatedUser))
      
      showToast('Perfil de instructor actualizado correctamente')
    } else {
      const body = {
        nombre: perfil.nombre,
        telefono: perfil.telefono,
        correo: perfil.correo,
      }

      const res = await api.auth.updatePerfil(body)
      if (res.ok) {
        Object.assign(perfil, res.perfil)
        showToast('Perfil de administrador actualizado correctamente')
      }
    }
  } catch (e) {
    showToast('Error al guardar perfil: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

// Funciones del Modal de Contraseña
function abrirModalPassword() {
  passForm.actual = ''
  passForm.nueva = ''
  passForm.confirmar = ''
  passError.value = ''
  showPass.actual = false
  showPass.nueva = false
  showPass.confirmar = false
  showModalPassword.value = true
}

function cerrarModalPassword() {
  showModalPassword.value = false
  passError.value = ''
}

async function procesarCambioPassword() {
  passError.value = ''
  
  if (!passForm.actual) {
    passError.value = 'Debes ingresar tu contraseña actual.'
    return
  }
  if (!passForm.nueva) {
    passError.value = 'Debes ingresar la nueva contraseña.'
    return
  }
  if (passForm.nueva.length < 6) {
    passError.value = 'La nueva contraseña debe tener al menos 6 caracteres.'
    return
  }
  if (passForm.nueva !== passForm.confirmar) {
    passError.value = 'La confirmación de la nueva contraseña no coincide.'
    return
  }

  passLoading.value = true
  try {
    const res = await api.auth.cambiarPassword({
      id: perfil.id || usuarioSesion.value?.id,
      rol: perfil.rol || usuarioSesion.value?.rol,
      correo: perfil.correo || usuarioSesion.value?.correo,
      passwordActual: passForm.actual,
      nuevaPassword: passForm.nueva,
    })

    if (res.ok) {
      showToast('✅ ¡Contraseña actualizada exitosamente!', 'success')
      cerrarModalPassword()
    } else {
      passError.value = res.error || 'Error al actualizar contraseña'
    }
  } catch (err) {
    passError.value = err.message || 'La contraseña actual no es correcta.'
  } finally {
    passLoading.value = false
  }
}
</script>

<template>
  <div class="admin-profile-page-header">
    <h1>{{ esInstructor ? '👨‍🏫 Perfil del Instructor / Maestro' : '⚙️ Perfil del Administrador' }}</h1>
    <p>{{ esInstructor ? 'Información personal y académica del docente' : 'Gestiona tu información personal y seguridad de la cuenta' }}</p>
  </div>

  <!-- Vista para Instructor / Maestro -->
  <div v-if="esInstructor" class="admin-profile-card">
    <div class="admin-profile-card-header">
      <h3>Datos Personales del Instructor</h3>
    </div>
    <div class="admin-profile-form-grid">
      <div class="admin-profile-form-group">
        <label>Nombres</label>
        <input v-model="perfil.nombres" type="text" placeholder="Nombres" />
      </div>
      <div class="admin-profile-form-group">
        <label>Apellidos</label>
        <input v-model="perfil.apellidos" type="text" placeholder="Apellidos" />
      </div>
      <div class="admin-profile-form-group">
        <label>Tipo Documento</label>
        <input :value="perfil.tipoDocumento" type="text" disabled />
      </div>
      <div class="admin-profile-form-group">
        <label>Número Documento</label>
        <input :value="perfil.numeroDocumento" type="text" disabled />
      </div>
      <div class="admin-profile-form-group">
        <label>Especialidad / Área</label>
        <input v-model="perfil.especialidad" type="text" placeholder="Ej. Desarrollo de Software" />
      </div>
      <div class="admin-profile-form-group">
        <label>Rol en el Sistema</label>
        <input :value="perfil.rol" type="text" disabled />
      </div>
      <div class="admin-profile-form-group">
        <label>Correo Electrónico</label>
        <input v-model="perfil.correo" type="email" placeholder="correo@sena.edu.co" />
      </div>
      <div class="admin-profile-form-group">
        <label>Número de Teléfono</label>
        <input v-model="perfil.telefono" type="tel" placeholder="+57 300 000 0000" />
      </div>
    </div>
    <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
      <button class="admin-profile-button admin-profile-button-primary" @click="guardarPerfil" :disabled="loading">
        {{ loading ? 'Guardando...' : '💾 Guardar Cambios' }}
      </button>
      <button class="admin-profile-button admin-profile-button-security" @click="abrirModalPassword">
        🔒 Cambiar Contraseña
      </button>
    </div>
  </div>

  <!-- Vista para Administrador -->
  <div v-else class="admin-profile-card">
    <div class="admin-profile-card-header">
      <h3>Información Personal</h3>
    </div>
    <div class="admin-profile-form-grid">
      <div class="admin-profile-form-group">
        <label>Nombre</label>
        <input v-model="perfil.nombre" type="text" placeholder="Tu nombre completo" />
      </div>
      <div class="admin-profile-form-group">
        <label>Rol</label>
        <input :value="perfil.rol" type="text" disabled />
      </div>
      <div class="admin-profile-form-group">
        <label>Número de Teléfono</label>
        <input v-model="perfil.telefono" type="tel" placeholder="+57 300 000 0000" />
      </div>
      <div class="admin-profile-form-group">
        <label>Correo Electrónico</label>
        <input v-model="perfil.correo" type="email" placeholder="admin@correo.com" />
      </div>
    </div>
    <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
      <button class="admin-profile-button admin-profile-button-primary" @click="guardarPerfil" :disabled="loading">
        {{ loading ? 'Guardando...' : '💾 Guardar Cambios' }}
      </button>
      <button class="admin-profile-button admin-profile-button-security" @click="abrirModalPassword">
        🔒 Cambiar Contraseña
      </button>
    </div>
  </div>

  <!-- Resumen del Perfil -->
  <div class="admin-profile-card">
    <div class="admin-profile-card-header">
      <h3>Resumen del Perfil</h3>
    </div>
    <div class="admin-profile-info">
      <div class="admin-profile-field">
        <label>Nombre Completo</label>
        <div class="admin-profile-value">{{ (perfil.nombres ? `${perfil.nombres} ${perfil.apellidos}` : perfil.nombre) || '—' }}</div>
      </div>
      <div class="admin-profile-field" v-if="esInstructor">
        <label>Documento de Identidad</label>
        <div class="admin-profile-value">{{ perfil.tipoDocumento }} {{ perfil.numeroDocumento || '—' }}</div>
      </div>
      <div class="admin-profile-field">
        <label>Rol en la Institución</label>
        <div class="admin-profile-value">
          <template v-if="esInstructor">
            <span class="admin-profile-badge" :class="esLiderCalculado ? 'admin-profile-badge-primary' : 'admin-profile-badge-neutral'" style="font-size: 13px; padding: 4px 10px; font-weight: 600;">
              {{ esLiderCalculado ? '👥 Instructor Líder' : '👨‍🏫 Instructor Común' }}
            </span>
          </template>
          <template v-else>
            <span class="admin-profile-badge admin-profile-badge-primary" style="font-size: 13px; padding: 4px 10px;">{{ perfil.rol }}</span>
          </template>
        </div>
      </div>
      <div class="admin-profile-field" v-if="esInstructor">
        <label>Especialidad</label>
        <div class="admin-profile-value">{{ perfil.especialidad || '—' }}</div>
      </div>
      <div class="admin-profile-field">
        <label>Teléfono</label>
        <div class="admin-profile-value">{{ perfil.telefono || '—' }}</div>
      </div>
      <div class="admin-profile-field">
        <label>Correo Electrónico</label>
        <div class="admin-profile-value">{{ perfil.correo || '—' }}</div>
      </div>
    </div>
  </div>

  <!-- MODAL DE CAMBIO DE CONTRASEÑA -->
  <div v-if="showModalPassword" class="password-modal-backdrop" @click.self="cerrarModalPassword">
    <div class="password-modal-card">
      <div class="password-modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 22px;">🔐</span>
          <div>
            <h3 style="margin: 0; font-size: 18px; color: #1e293b;">Actualizar Contraseña</h3>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Ingresa tu contraseña actual para autorizar el cambio</p>
          </div>
        </div>
        <button class="password-modal-close-btn" @click="cerrarModalPassword">✕</button>
      </div>

      <div v-if="passError" class="password-modal-error">
        ⚠️ {{ passError }}
      </div>

      <form class="password-modal-body" @submit.prevent="procesarCambioPassword">
        <!-- Contraseña Actual -->
        <div class="password-input-group">
          <label>Contraseña Actual <span style="color: #ef4444;">*</span></label>
          <div class="password-input-wrapper">
            <input
              v-model="passForm.actual"
              :type="showPass.actual ? 'text' : 'password'"
              placeholder="Escribe tu contraseña actual"
              required
              autocomplete="current-password"
            />
            <button type="button" class="password-toggle-btn" @click="showPass.actual = !showPass.actual">
              {{ showPass.actual ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <!-- Nueva Contraseña -->
        <div class="password-input-group">
          <label>Nueva Contraseña <span style="color: #ef4444;">*</span></label>
          <div class="password-input-wrapper">
            <input
              v-model="passForm.nueva"
              :type="showPass.nueva ? 'text' : 'password'"
              placeholder="Mínimo 6 caracteres"
              required
              autocomplete="new-password"
            />
            <button type="button" class="password-toggle-btn" @click="showPass.nueva = !showPass.nueva">
              {{ showPass.nueva ? '🙈' : '👁️' }}
            </button>
          </div>
          <small style="color: #64748b; font-size: 11px;">Mínimo 6 caracteres alfanuméricos.</small>
        </div>

        <!-- Confirmar Nueva Contraseña -->
        <div class="password-input-group">
          <label>Confirmar Nueva Contraseña <span style="color: #ef4444;">*</span></label>
          <div class="password-input-wrapper">
            <input
              v-model="passForm.confirmar"
              :type="showPass.confirmar ? 'text' : 'password'"
              placeholder="Repite la nueva contraseña"
              required
              autocomplete="new-password"
            />
            <button type="button" class="password-toggle-btn" @click="showPass.confirmar = !showPass.confirmar">
              {{ showPass.confirmar ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <div class="password-modal-actions">
          <button type="button" class="btn btn-outline" @click="cerrarModalPassword" :disabled="passLoading">
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary" :disabled="passLoading">
            {{ passLoading ? 'Verificando...' : '💾 Actualizar Contraseña' }}
          </button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="toast.show" class="admin-profile-toast" :class="'admin-profile-toast-' + toast.type">
    {{ toast.message }}
  </div>
</template>

<style scoped>
.admin-profile-button-security {
  background: #4A5344;
  color: #ffffff;
}
.admin-profile-button-security:hover {
  background: #16210F;
}

/* MODAL DE CONTRASEÑA */
.password-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(22, 33, 15, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.password-modal-card {
  background: #ffffff;
  border-radius: 20px;
  max-width: 440px;
  width: 100%;
  box-shadow: 0 2px 4px rgba(22,33,15,.03), 0 18px 48px rgba(22,33,15,.08);
  overflow: hidden;
  animation: modalPop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes modalPop {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.password-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid #E2E6DE;
  background: #F7F9F5;
}

.password-modal-close-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #7C857A;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.password-modal-close-btn:hover {
  background: #E2E6DE;
  color: #16210F;
}

.password-modal-error {
  margin: 16px 22px 0 22px;
  padding: 10px 14px;
  background: #FBEAE6;
  border: 1px solid #F3CFC6;
  color: #C4432B;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.password-modal-body {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.password-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.password-input-group label {
  font-size: 13px;
  font-weight: 600;
  color: #4A5344;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrapper input {
  width: 100%;
  padding: 10px 42px 10px 14px;
  border: 1.5px solid #E2E6DE;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'Work Sans', system-ui, sans-serif;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.password-input-wrapper input:focus {
  outline: none;
  border-color: #39A900;
  box-shadow: 0 0 0 3px rgba(57, 169, 0, 0.14);
}

.password-toggle-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  color: #7C857A;
}

.password-modal-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
