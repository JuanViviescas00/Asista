<script setup>
import { ref, reactive, computed } from 'vue'
import api from '../services/index.js'
import { useAuth } from '../composables/useAuth.js'

const props = defineProps({
  usuario: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['completado', 'cerrar-sesion'])

const { actualizarUsuario, cerrarSesion } = useAuth()

// Control del Wizard: Paso 1 (Contraseña Sistema) o Paso 2 (Sofía Plus)
const pasoActual = ref(1)
const loading = ref(false)
const errorMensaje = ref('')
const exitoMensaje = ref('')

// Formulario reactivo
const form = reactive({
  passwordActual: '',
  nuevaPassword: '',
  confirmarPassword: '',
  passwordSofiaPlus: '',
  confirmarSofiaPlus: ''
})

// Visibilidad de contraseñas
const show = reactive({
  actual: false,
  nueva: false,
  confirmar: false,
  sofia: false,
  confirmarSofia: false
})

const nombreInstructor = computed(() => {
  return props.usuario?.nombre || props.usuario?.nombres || 'Docente'
})

// Validación en vivo Paso 1
const paso1Valido = computed(() => {
  return (
    form.passwordActual.trim().length > 0 &&
    form.nuevaPassword.length >= 6 &&
    form.confirmarPassword === form.nuevaPassword &&
    form.nuevaPassword !== form.passwordActual
  )
})

// Validación en vivo Paso 2
const paso2Valido = computed(() => {
  return (
    form.passwordSofiaPlus.trim().length >= 4 &&
    form.confirmarSofiaPlus === form.passwordSofiaPlus
  )
})

function avanzarAPaso2() {
  errorMensaje.value = ''

  if (!form.passwordActual.trim()) {
    errorMensaje.value = 'Ingresa tu contraseña actual o provisional (tu documento).'
    return
  }

  if (form.nuevaPassword.length < 6) {
    errorMensaje.value = 'La nueva contraseña debe tener al menos 6 caracteres.'
    return
  }

  if (form.nuevaPassword !== form.confirmarPassword) {
    errorMensaje.value = 'La confirmación de la nueva contraseña no coincide.'
    return
  }

  if (form.nuevaPassword.trim() === form.passwordActual.trim()) {
    errorMensaje.value = 'Por seguridad, la nueva contraseña debe ser diferente a la actual.'
    return
  }

  // Avanzar al paso 2
  pasoActual.value = 2
}

function volverAPaso1() {
  errorMensaje.value = ''
  pasoActual.value = 1
}

async function finalizarConfiguracion() {
  errorMensaje.value = ''
  exitoMensaje.value = ''

  if (!form.passwordSofiaPlus.trim()) {
    errorMensaje.value = 'Ingresa tu contraseña del portal Sofía Plus.'
    return
  }

  if (form.passwordSofiaPlus.length < 4) {
    errorMensaje.value = 'Ingresa una contraseña válida de Sofía Plus.'
    return
  }

  if (form.passwordSofiaPlus !== form.confirmarSofiaPlus) {
    errorMensaje.value = 'La confirmación de la contraseña de Sofía Plus no coincide.'
    return
  }

  loading.value = true
  try {
    const res = await api.auth.completarPrimerLogin({
      passwordActual: form.passwordActual.trim(),
      nuevaPassword: form.nuevaPassword,
      passwordSofiaPlus: form.passwordSofiaPlus.trim()
    })

    if (res.ok) {
      exitoMensaje.value = res.message || '¡Configuración completada con éxito!'
      
      // Actualizar token si el backend generó uno nuevo
      if (res.token) {
        sessionStorage.setItem('auth_token', res.token)
      }

      // Actualizar estado reactivo global del usuario
      actualizarUsuario(res.usuario)

      setTimeout(() => {
        emit('completado', res.usuario)
      }, 1000)
    } else {
      errorMensaje.value = res.error || 'Ocurrió un error al actualizar las credenciales.'
    }
  } catch (err) {
    errorMensaje.value = err.message || 'Error al guardar los cambios. Verifica tu contraseña actual.'
  } finally {
    loading.value = false
  }
}

function handleCerrarSesion() {
  cerrarSesion()
  emit('cerrar-sesion')
}
</script>

<template>
  <div class="firstlogin-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="firstlogin-card">
      <!-- Barra superior decorativa institucional SENA -->
      <div class="firstlogin-topbar"></div>

      <!-- Encabezado -->
      <div class="firstlogin-header">
        <div class="firstlogin-badge">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Configuración Obligatoria de Seguridad
        </div>
        <h2 id="modal-title" class="firstlogin-title">Primer Inicio de Sesión</h2>
        <p class="firstlogin-subtitle">
          Hola, <strong>{{ nombreInstructor }}</strong>. Antes de acceder al sistema, debes configurar tus credenciales de acceso institucional y del robot de Sofía Plus.
        </p>
      </div>

      <!-- Indicador de Pasos (Stepper) -->
      <div class="firstlogin-stepper">
        <div class="step-item" :class="{ active: pasoActual === 1, completed: pasoActual > 1 }">
          <div class="step-circle">
            <svg v-if="pasoActual > 1" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span v-else>1</span>
          </div>
          <span class="step-label">Nueva Contraseña</span>
        </div>

        <div class="step-connector" :class="{ completed: pasoActual > 1 }"></div>

        <div class="step-item" :class="{ active: pasoActual === 2 }">
          <div class="step-circle">2</div>
          <span class="step-label">Clave Sofía Plus</span>
        </div>
      </div>

      <!-- Alertas de estado -->
      <div v-if="errorMensaje" class="firstlogin-alert alert-error" role="alert">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ errorMensaje }}</span>
      </div>

      <div v-if="exitoMensaje" class="firstlogin-alert alert-success" role="alert">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>{{ exitoMensaje }}</span>
      </div>

      <!-- PASO 1: Cambio de Contraseña del Sistema -->
      <div v-if="pasoActual === 1" class="firstlogin-body">
        <div class="firstlogin-step-desc">
          <p>
            Por seguridad, debes sustituir tu contraseña provisional por una clave personal segura para el ingreso a Asista.
          </p>
        </div>

        <div class="firstlogin-form-group">
          <label>Contraseña Actual o Provisional</label>
          <div class="input-password-wrapper">
            <input
              v-model="form.passwordActual"
              :type="show.actual ? 'text' : 'password'"
              placeholder="Ingresa tu documento o clave provisional"
              autocomplete="current-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              @click="show.actual = !show.actual"
              :title="show.actual ? 'Ocultar' : 'Mostrar'"
            >
              <svg v-if="!show.actual" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <span class="field-hint">Si es tu primer ingreso, utiliza tu número de documento.</span>
        </div>

        <div class="firstlogin-form-group">
          <label>Nueva Contraseña</label>
          <div class="input-password-wrapper">
            <input
              v-model="form.nuevaPassword"
              :type="show.nueva ? 'text' : 'password'"
              placeholder="Mínimo 6 caracteres"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              @click="show.nueva = !show.nueva"
              :title="show.nueva ? 'Ocultar' : 'Mostrar'"
            >
              <svg v-if="!show.nueva" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="firstlogin-form-group">
          <label>Confirmar Nueva Contraseña</label>
          <div class="input-password-wrapper">
            <input
              v-model="form.confirmarPassword"
              :type="show.confirmar ? 'text' : 'password'"
              placeholder="Repite la nueva contraseña"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              @click="show.confirmar = !show.confirmar"
              :title="show.confirmar ? 'Ocultar' : 'Mostrar'"
            >
              <svg v-if="!show.confirmar" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <span v-if="form.confirmarPassword && form.nuevaPassword !== form.confirmarPassword" class="field-error">
            Las contraseñas no coinciden.
          </span>
        </div>

        <div class="firstlogin-actions">
          <button
            type="button"
            class="btn-firstlogin-primary"
            :disabled="!paso1Valido"
            @click="avanzarAPaso2"
          >
            <span>Siguiente: Clave Sofía Plus</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- PASO 2: Contraseña de Sofía Plus -->
      <div v-else-if="pasoActual === 2" class="firstlogin-body">
        <div class="firstlogin-info-box">
          <div class="info-box-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="info-box-text">
            <strong>Sincronización Automática con Sofía Plus</strong>
            <p>
              El robot RPA utiliza esta clave para subir automáticamente las inasistencias de tus fichas. Tu clave se cifra de forma segura con estándar militar AES-256.
            </p>
          </div>
        </div>

        <div class="firstlogin-form-group">
          <label>Contraseña de Sofía Plus</label>
          <div class="input-password-wrapper">
            <input
              v-model="form.passwordSofiaPlus"
              :type="show.sofia ? 'text' : 'password'"
              placeholder="Tu contraseña oficial de senasofiaplus.edu.co"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              @click="show.sofia = !show.sofia"
              :title="show.sofia ? 'Ocultar' : 'Mostrar'"
            >
              <svg v-if="!show.sofia" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="firstlogin-form-group">
          <label>Confirmar Contraseña de Sofía Plus</label>
          <div class="input-password-wrapper">
            <input
              v-model="form.confirmarSofiaPlus"
              :type="show.confirmarSofia ? 'text' : 'password'"
              placeholder="Confirma tu clave de Sofía Plus"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              @click="show.confirmarSofia = !show.confirmarSofia"
              :title="show.confirmarSofia ? 'Ocultar' : 'Mostrar'"
            >
              <svg v-if="!show.confirmarSofia" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <span v-if="form.confirmarSofiaPlus && form.passwordSofiaPlus !== form.confirmarSofiaPlus" class="field-error">
            Las contraseñas de Sofía Plus no coinciden.
          </span>
        </div>

        <div class="firstlogin-actions-dual">
          <button
            type="button"
            class="btn-firstlogin-secondary"
            :disabled="loading"
            @click="volverAPaso1"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            <span>Atrás</span>
          </button>

          <button
            type="button"
            class="btn-firstlogin-primary"
            :disabled="!paso2Valido || loading"
            @click="finalizarConfiguracion"
          >
            <svg v-if="loading" class="spinner" viewBox="0 0 24 24" width="18" height="18">
              <circle class="spinner-track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none"/>
              <circle class="spinner-head" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="32" stroke-linecap="round"/>
            </svg>
            <span v-if="loading">Guardando...</span>
            <span v-else>Guardar y Comenzar</span>
            <svg v-if="!loading" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Pie de página: Opción de salir si no tiene los datos en el momento -->
      <div class="firstlogin-footer">
        <p>
          ¿No tienes tus claves a mano?
          <button type="button" class="btn-link-logout" @click="handleCerrarSesion">
            Cerrar sesión
          </button>
          y configurar luego.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.firstlogin-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  overflow-y: auto;
}

.firstlogin-card {
  position: relative;
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35);
  border: 1px solid #e2e8f0;
  overflow: hidden;
  animation: modalEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.firstlogin-topbar {
  height: 6px;
  width: 100%;
  background: linear-gradient(90deg, #047857 0%, #059669 50%, #10b981 100%);
}

.firstlogin-header {
  padding: 1.75rem 2rem 1rem 2rem;
  text-align: center;
}

.firstlogin-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.firstlogin-title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.firstlogin-subtitle {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.5;
}

/* Stepper */
.firstlogin-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 2rem 1.25rem 2rem;
  gap: 0.75rem;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  border: 1px solid #cbd5e1;
}

.step-item.active .step-circle {
  background: #047857;
  color: #ffffff;
  border-color: #047857;
  box-shadow: 0 0 0 3px rgba(4, 120, 87, 0.2);
}

.step-item.completed .step-circle {
  background: #10b981;
  color: #ffffff;
  border-color: #10b981;
}

.step-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #64748b;
}

.step-item.active .step-label {
  color: #047857;
}

.step-item.completed .step-label {
  color: #10b981;
}

.step-connector {
  flex: 1;
  max-width: 60px;
  height: 2px;
  background: #e2e8f0;
  transition: all 0.2s ease;
}

.step-connector.completed {
  background: #10b981;
}

/* Alertas */
.firstlogin-alert {
  margin: 0 2rem 1rem 2rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.alert-success {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

/* Cuerpo del formulario */
.firstlogin-body {
  padding: 0 2rem 1.5rem 2rem;
}

.firstlogin-step-desc {
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
  color: #475569;
  line-height: 1.45;
}

.firstlogin-info-box {
  display: flex;
  gap: 12px;
  padding: 0.875rem 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  margin-bottom: 1.25rem;
}

.info-box-icon {
  color: #047857;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-box-text {
  font-size: 0.8125rem;
  color: #166534;
  line-height: 1.45;
}

.info-box-text strong {
  display: block;
  font-size: 0.875rem;
  margin-bottom: 2px;
  color: #14532d;
}

.info-box-text p {
  margin: 0;
}

.firstlogin-form-group {
  margin-bottom: 1.125rem;
}

.firstlogin-form-group label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.375rem;
}

.input-password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-password-wrapper input {
  width: 100%;
  padding: 0.625rem 2.5rem 0.625rem 0.875rem;
  font-size: 0.875rem;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  transition: all 0.15s ease;
  outline: none;
}

.input-password-wrapper input:focus {
  border-color: #047857;
  box-shadow: 0 0 0 3px rgba(4, 120, 87, 0.15);
}

.btn-toggle-eye {
  position: absolute;
  right: 0.625rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.btn-toggle-eye:hover {
  color: #475569;
}

.field-hint {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.field-error {
  display: block;
  font-size: 0.75rem;
  color: #dc2626;
  margin-top: 0.25rem;
}

/* Acciones */
.firstlogin-actions {
  margin-top: 1.5rem;
}

.firstlogin-actions-dual {
  display: flex;
  gap: 12px;
  margin-top: 1.5rem;
}

.btn-firstlogin-primary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #047857;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 0.6875rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.btn-firstlogin-primary:hover:not(:disabled) {
  background: #065f46;
}

.btn-firstlogin-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-firstlogin-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #ffffff;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.6875rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-firstlogin-secondary:hover:not(:disabled) {
  background: #f8fafc;
  color: #0f172a;
  border-color: #94a3b8;
}

.btn-firstlogin-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Footer */
.firstlogin-footer {
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  padding: 0.875rem 2rem;
  text-align: center;
  font-size: 0.8125rem;
  color: #64748b;
}

.firstlogin-footer p {
  margin: 0;
}

.btn-link-logout {
  background: none;
  border: none;
  color: #047857;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 0 4px;
}

.btn-link-logout:hover {
  color: #065f46;
}

/* Spinner */
.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner-track {
  opacity: 0.25;
}

.spinner-head {
  opacity: 0.9;
}
</style>
