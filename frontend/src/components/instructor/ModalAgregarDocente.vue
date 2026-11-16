<script setup>
import { ref, reactive, watch } from 'vue'

const props = defineProps({
  abierto: { type: Boolean, default: false },
  ficha: { type: Object, default: () => ({}) },
  docentesDisponibles: { type: Array, default: () => [] },
  guardando: { type: Boolean, default: false }
})

const emit = defineEmits(['cerrar', 'confirmar'])

const modoAsignar = ref('existente')
const docenteSeleccionadoId = ref('')
const nuevoDocenteForm = reactive({
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  correo: '',
  telefono: '',
  especialidad: ''
})

watch(() => props.abierto, (val) => {
  if (val) {
    modoAsignar.value = 'existente'
    docenteSeleccionadoId.value = ''
    nuevoDocenteForm.nombres = ''
    nuevoDocenteForm.apellidos = ''
    nuevoDocenteForm.tipoDocumento = 'CC'
    nuevoDocenteForm.numeroDocumento = ''
    nuevoDocenteForm.correo = ''
    nuevoDocenteForm.telefono = ''
    nuevoDocenteForm.especialidad = ''
  }
})

function onCerrar() {
  if (props.guardando) return
  emit('cerrar')
}

function onConfirmar() {
  emit('confirmar', {
    modo: modoAsignar.value,
    docenteId: docenteSeleccionadoId.value,
    nuevoDocente: { ...nuevoDocenteForm }
  })
}
</script>

<template>
  <div
    v-if="abierto"
    class="modal-overlay"
    @click.self="onCerrar"
    @keydown.esc="onCerrar"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      style="max-width: 540px; background: #ffffff; border-radius: 14px; padding: 24px 26px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;"
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(0, 120, 50, 0.1); color: #007832; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #1e293b;">Agregar Instructor al Equipo Ejecutor</h3>
            <p style="margin: 2px 0 0; font-size: 12.5px; color: #64748b;">Ficha {{ ficha?.codigoFicha }} — {{ ficha?.jornada }}</p>
          </div>
        </div>
        <button
          @click="onCerrar"
          style="background: none; border: none; font-size: 22px; color: #94a3b8; cursor: pointer; line-height: 1; padding: 4px;"
          aria-label="Cerrar modal"
        >&times;</button>
      </div>

      <!-- TABS MODO: EXISTENTE VS NUEVO -->
      <div style="display: flex; gap: 6px; margin: 16px 0 20px; background: #f1f5f9; padding: 4px; border-radius: 10px;">
        <button
          type="button"
          :style="modoAsignar === 'existente' ? 'background: #ffffff; color: #007832; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748b; font-weight: 600;'"
          style="flex: 1; padding: 9px 12px; border: none; border-radius: 7px; font-size: 13px; cursor: pointer; transition: all .15s ease;"
          @click="modoAsignar = 'existente'"
        >
          Instructor Existente
        </button>
        <button
          type="button"
          :style="modoAsignar === 'nuevo' ? 'background: #ffffff; color: #007832; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748b; font-weight: 600;'"
          style="flex: 1; padding: 9px 12px; border: none; border-radius: 7px; font-size: 13px; cursor: pointer; transition: all .15s ease;"
          @click="modoAsignar = 'nuevo'"
        >
          + Registrar Nuevo Instructor
        </button>
      </div>

      <!-- MODO 1: SELECCIONAR DOCENTE EXISTENTE -->
      <div v-if="modoAsignar === 'existente'">
        <p style="font-size: 13px; color: #64748b; margin-bottom: 14px; line-height: 1.5;">
          Selecciona un instructor ya registrado en la institución para vincularlo como instructor común de esta ficha:
        </p>
        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Selecciona el Instructor</label>
          <select v-model="docenteSeleccionadoId" class="form-input" style="width: 100%; height: 44px; border-radius: 8px; font-size: 13.5px; padding: 0 12px;">
            <option value="" disabled>Selecciona un instructor de la lista...</option>
            <option v-for="inst in docentesDisponibles" :key="inst._id || inst.id" :value="inst._id || inst.id">
              {{ inst.nombres }} {{ inst.apellidos || '' }} — {{ inst.correo || inst.especialidad || 'Instructor' }}
            </option>
          </select>
          <p v-if="docentesDisponibles.length === 0" style="font-size: 12.5px; color: #b45309; background: #fffbeb; border: 1px solid #fef3c7; padding: 10px 12px; border-radius: 8px; margin-top: 10px;">
            No hay otros instructores registrados disponibles. Puedes usar la pestaña <strong>"+ Registrar Nuevo Instructor"</strong> para crearlo con sus datos.
          </p>
        </div>
      </div>

      <!-- MODO 2: REGISTRAR NUEVO DOCENTE CON TODOS SUS DATOS -->
      <div v-else>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 14px; line-height: 1.5;">
          Ingresa todos los datos del nuevo instructor. Se creará su cuenta institucional y se vinculará de inmediato a esta ficha:
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Nombres *</label>
            <input v-model="nuevoDocenteForm.nombres" type="text" class="form-input" placeholder="Nombres del instructor" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Apellidos *</label>
            <input v-model="nuevoDocenteForm.apellidos" type="text" class="form-input" placeholder="Apellidos del instructor" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Tipo Documento</label>
            <select v-model="nuevoDocenteForm.tipoDocumento" class="form-input" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;">
              <option value="CC">Cédula de Ciudadanía (CC)</option>
              <option value="CE">Cédula de Extranjería (CE)</option>
              <option value="TI">Tarjeta de Identidad (TI)</option>
              <option value="PEP">Permiso Especial (PEP)</option>
              <option value="PAS">Pasaporte (PAS)</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">N° Documento *</label>
            <input v-model="nuevoDocenteForm.numeroDocumento" type="text" class="form-input" placeholder="Número de documento" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Correo Institucional *</label>
            <input v-model="nuevoDocenteForm.correo" type="email" class="form-input" placeholder="correo@sena.edu.co" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Teléfono</label>
            <input v-model="nuevoDocenteForm.telefono" type="tel" class="form-input" placeholder="Ej: 3001234567" style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 5px;">Especialidad / Área Pedagógica</label>
            <input v-model="nuevoDocenteForm.especialidad" type="text" class="form-input" placeholder="Ej: Programación web, Base de datos, Redes..." style="width: 100%; height: 40px; padding: 0 10px; font-size: 13px; border-radius: 7px;" />
          </div>
        </div>
        <p style="font-size: 11.5px; color: #64748b; margin: 0 0 16px;">
          * La contraseña inicial de acceso del nuevo instructor será por defecto su número de documento.
        </p>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        <button type="button" class="btn btn-outline" @click="onCerrar" style="padding: 9px 18px; font-size: 13px; font-weight: 600;">Cancelar</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="(modoAsignar === 'existente' && !docenteSeleccionadoId) || guardando"
          @click="onConfirmar"
          style="padding: 9px 20px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;"
        >
          <span>{{ guardando ? 'Guardando...' : (modoAsignar === 'existente' ? 'Asignar al Equipo Ejecutor' : 'Guardar y Asignar') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
