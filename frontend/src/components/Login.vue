<script setup>
import { ref, reactive } from 'vue'
import { enviarCodigoRecuperacion } from '../services/emailService.js'
import api from '../services/api.js'
import instructorIcon from '../assets/instructor-icon.png'
import senaLogo from '../assets/sena-logo.png'
import './login.css'

const emit = defineEmits(['login-success'])

const tipoAcceso = ref('personal') // 'personal' (Instructores/Admin) o 'aprendiz' (Consulta por documento)

const form = reactive({
  correo: '',
  password: '',
  documentoAprendiz: '',
})

const error = ref('')
const exito = ref('')
const showPassword = ref(false)
const pantalla = ref('login') // 'login' o 'recuperar'
const loading = ref(false)

const recuperarForm = reactive({
  correo: '',
  codigo: '',
  nuevaPassword: '',
  confirmarPassword: '',
})

const codigoGenerado = ref('')
const codigoEnviado = ref(false)
const mostrarCodigoEnPantalla = ref(false)
const errorRecuperar = ref('')
const exitoRecuperar = ref('')
const enviando = ref(false)

function cambiarTipoAcceso(tipo) {
  tipoAcceso.value = tipo
  error.value = ''
  exito.value = ''
}

async function iniciarSesionPersonal() {
  error.value = ''
  exito.value = ''

  if (!form.correo || !form.password) {
    error.value = 'Ingresa tu correo y contraseña'
    return
  }

  loading.value = true
  try {
    const res = await api.auth.login(form.correo, form.password)
    if (res.ok) {
      sessionStorage.setItem('admin_auth', 'true')
      if (res.token) {
        sessionStorage.setItem('auth_token', res.token)
      }
      const userData = res.usuario || res.admin
      sessionStorage.setItem('user_data', JSON.stringify(userData))
      emit('login-success', userData)
    }
  } catch (err) {
    error.value = err.message || 'Correo o contraseña incorrectos'
  } finally {
    loading.value = false
  }
}

async function consultarAprendiz() {
  error.value = ''
  exito.value = ''

  if (!form.documentoAprendiz.trim()) {
    error.value = 'Ingresa tu Número de Documento'
    return
  }

  loading.value = true
  const doc = form.documentoAprendiz.trim()
  try {
    // Consulta directa de estudiante por documento sin contraseña
    const res = await api.auth.login(doc)
    if (res.ok && res.usuario) {
      sessionStorage.setItem('admin_auth', 'true')
      if (res.token) {
        sessionStorage.setItem('auth_token', res.token)
      }
      sessionStorage.setItem('user_data', JSON.stringify(res.usuario))
      emit('login-success', res.usuario)
    }
  } catch (err) {
    error.value = 'Número de documento no encontrado o aprendiz inactivo'
  } finally {
    loading.value = false
  }
}

function irARecuperar() {
  pantalla.value = 'recuperar'
  error.value = ''
  exito.value = ''
  Object.assign(recuperarForm, {
    correo: '',
    codigo: '',
    nuevaPassword: '',
    confirmarPassword: '',
  })
  codigoGenerado.value = ''
  codigoEnviado.value = false
  mostrarCodigoEnPantalla.value = false
  errorRecuperar.value = ''
  exitoRecuperar.value = ''
}

function volverAlLogin() {
  pantalla.value = 'login'
  error.value = ''
  exito.value = ''
}

async function enviarCodigo() {
  errorRecuperar.value = ''
  exitoRecuperar.value = ''

  if (!recuperarForm.correo) {
    errorRecuperar.value = 'Ingresa tu correo electrónico'
    return
  }

  try {
    await api.auth.checkRecoveryEmail(recuperarForm.correo)
  } catch (err) {
    errorRecuperar.value = 'El correo ingresado no coincide con ningún usuario registrado'
    return
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000))
  codigoGenerado.value = codigo

  const recovery = {
    correo: recuperarForm.correo,
    codigo,
    expira: Date.now() + 10 * 60 * 1000,
  }
  localStorage.setItem('admin_recovery', JSON.stringify(recovery))

  enviando.value = true
  try {
    await enviarCodigoRecuperacion(recuperarForm.correo, codigo)
    codigoEnviado.value = true
    mostrarCodigoEnPantalla.value = false
    exitoRecuperar.value = 'Código de verificación enviado a tu correo.'
  } catch (e) {
    codigoEnviado.value = true
    mostrarCodigoEnPantalla.value = true
    exitoRecuperar.value = 'Usa este código para continuar.'
  } finally {
    enviando.value = false
  }
}

async function restablecerPassword() {
  errorRecuperar.value = ''
  exitoRecuperar.value = ''

  if (!recuperarForm.codigo) {
    errorRecuperar.value = 'Ingresa el código de verificación'
    return
  }
  if (!recuperarForm.nuevaPassword) {
    errorRecuperar.value = 'Ingresa la nueva contraseña'
    return
  }
  if (recuperarForm.nuevaPassword !== recuperarForm.confirmarPassword) {
    errorRecuperar.value = 'Las contraseñas no coinciden'
    return
  }

  const recoveryData = localStorage.getItem('admin_recovery')
  if (!recoveryData) {
    errorRecuperar.value = 'No hay un código de recuperación generado.'
    return
  }

  let recovery
  try { recovery = JSON.parse(recoveryData) } catch(e) {
    errorRecuperar.value = 'Error al leer los datos de recuperación'
    return
  }

  if (Date.now() > recovery.expira) {
    errorRecuperar.value = 'El código ha expirado.'
    localStorage.removeItem('admin_recovery')
    return
  }

  if (recuperarForm.codigo !== recovery.codigo) {
    errorRecuperar.value = 'Código de verificación incorrecto'
    return
  }

  try {
    await api.auth.resetPassword(recovery.correo, recuperarForm.nuevaPassword)
    localStorage.removeItem('admin_recovery')
    exitoRecuperar.value = 'Contraseña restablecida correctamente.'
    setTimeout(() => {
      volverAlLogin()
      exito.value = 'Contraseña restablecida. Inicia sesión con tu nueva clave.'
    }, 2000)
  } catch (err) {
    errorRecuperar.value = err.message || 'Error al restablecer contraseña'
  }
}
</script>

<template>
  <div class="login-page-shell">
    <div class="login-panel">
      <!-- Encabezado con Logo SENA -->
      <div class="login-brand-header">
        <div class="login-brand-icon">
          <img :src="senaLogo" alt="Logo SENA" />
        </div>
        <h2>Sistema Huellero SENA</h2>
        <p>Control y Gestión de Asistencias</p>
      </div>

      <template v-if="pantalla === 'login'">
        <!-- Selección de Acceso tipo Carnet -->
        <div class="login-carnet-selector">
          <button
            type="button"
            class="login-carnet"
            :class="{ 'is-active': tipoAcceso === 'personal' }"
            @click="cambiarTipoAcceso('personal')"
          >
            <span class="login-carnet-label">Instructores /<br />Personal SENA</span>
            <span class="login-carnet-avatar login-carnet-avatar-instructor">
              <img :src="instructorIcon" alt="Instructor" />
            </span>
            <span class="login-carnet-footer">Instructor</span>
          </button>

          <button
            type="button"
            class="login-carnet"
            :class="{ 'is-active': tipoAcceso === 'aprendiz' }"
            @click="cambiarTipoAcceso('aprendiz')"
          >
            <span class="login-carnet-label">Consulta<br />Aprendiz</span>
            <span class="login-carnet-avatar login-carnet-avatar-aprendiz">
              <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
                <path d="M12 3 1 8.5l11 5.5 9-4.5V17h2V8.5L12 3zm0 8.19L4.24 8.5 12 4.81l7.76 3.69L12 11.19z"/>
                <path d="M6 12.68v3.98c0 1.1 2.69 2.84 6 2.84s6-1.74 6-2.84v-3.98l-6 3-6-3z"/>
              </svg>
            </span>
            <span class="login-carnet-footer">Aprendiz</span>
          </button>
        </div>

        <div v-if="exito" class="login-success">{{ exito }}</div>
        <div v-if="error" class="login-error-message">{{ error }}</div>

        <!-- FORMULARIO 1: INSTRUCTORES / ADMIN -->
        <div v-if="tipoAcceso === 'personal'" class="login-form-container">
          <div class="login-form-group">
            <label>Correo Electrónico</label>
            <input class="login-input"
              v-model="form.correo"
              type="email"
              placeholder="correo@sena.edu.co"
              @keyup.enter="iniciarSesionPersonal"
            />
          </div>

          <div class="login-form-group">
            <label>Contraseña</label>
            <div class="login-password-wrapper">
              <input class="login-input"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="········"
                @keyup.enter="iniciarSesionPersonal"
              />
              <button type="button" class="login-password-toggle" @click="showPassword = !showPassword">
                <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <button class="login-button login-button-primary login-button-full" @click="iniciarSesionPersonal" :disabled="loading">
            {{ loading ? 'Iniciando sesión...' : '🔒 Ingresar al Sistema' }}
          </button>

          <p class="login-recovery-link">
            <a @click="irARecuperar">¿Olvidaste tu contraseña?</a>
          </p>
        </div>

        <!-- FORMULARIO 2: CONSULTA APRENDIZ (POR DOCUMENTO) -->
        <div v-else class="login-form-container">
          <div class="login-consultation-info">
            <span>ℹ️</span> Consulta únicamente tus datos y registros de asistencia ingresando tu número de documento.
          </div>

          <div class="login-form-group">
            <label>Número de Documento del Aprendiz</label>
            <input class="login-input"
              v-model="form.documentoAprendiz"
              type="text"
              placeholder="Ej. 1012345678"
              @keyup.enter="consultarAprendiz"
              autofocus
            />
          </div>

          <button class="login-button login-button-primary login-button-full login-button-student" @click="consultarAprendiz" :disabled="loading">
            {{ loading ? 'Consultando...' : '🔍 Consultar Mi Asistencia' }}
          </button>
        </div>
      </template>

      <!-- PANTALLA RECUPERAR CONTRASEÑA -->
      <template v-if="pantalla === 'recuperar'">
        <h3 class="login-recovery-title">
          Recuperar Contraseña
        </h3>

        <div v-if="exitoRecuperar" class="login-success">{{ exitoRecuperar }}</div>
        <div v-if="errorRecuperar" class="login-error-message">{{ errorRecuperar }}</div>

        <div class="login-form-group">
          <label>Correo Electrónico Registrado</label>
          <input class="login-input"
            v-model="recuperarForm.correo"
            type="email"
            placeholder="Tu correo registrado"
            :disabled="codigoEnviado"
          />
        </div>

        <button
          v-if="!codigoEnviado"
          class="login-button login-button-primary login-button-full"
          :disabled="enviando"
          @click="enviarCodigo"
        >
          {{ enviando ? 'Enviando...' : 'Enviar Código de Verificación' }}
        </button>

        <template v-if="codigoEnviado">
          <div v-if="mostrarCodigoEnPantalla" class="login-code-display">
            <p>Código para <strong>{{ recuperarForm.correo }}</strong>:</p>
            <div class="login-code-number">{{ codigoGenerado }}</div>
          </div>

          <div class="login-form-group">
            <label>Código de Verificación</label>
            <input class="login-input"
              v-model="recuperarForm.codigo"
              type="text"
              placeholder="Ingresa el código"
              maxlength="6"
            />
          </div>

          <div class="login-form-group">
            <label>Nueva Contraseña</label>
            <input class="login-input"
              v-model="recuperarForm.nuevaPassword"
              type="password"
              placeholder="········"
            />
          </div>

          <div class="login-form-group">
            <label>Confirmar Contraseña</label>
            <input class="login-input"
              v-model="recuperarForm.confirmarPassword"
              type="password"
              placeholder="········"
            />
          </div>

          <button class="login-button login-button-primary login-button-full" @click="restablecerPassword">
            Restablecer Contraseña
          </button>
        </template>

        <p class="login-recovery-link">
          <a @click="volverAlLogin">Volver al inicio de sesión</a>
        </p>
      </template>
    </div>
  </div>
</template>

