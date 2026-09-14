<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/api.js'
import './diasFestivos.css'

const toast = ref({ show: false, message: '', type: '' })
const showModal = ref(false)
const editingId = ref(null)
const loading = ref(false)
const sincronizandoAPI = ref(false)

const diaFestivoForm = reactive({
  fecha: '',
  motivo: 'Festivo',
  fichasAplicables: 'todas',
  jornadasSeleccionadas: ['Mañana', 'Tarde', 'Noche'],
  fichasSeleccionadas: [],
  descripcion: '',
})

const diasFestivos = ref([])
const fichasList = ref([])

onMounted(async () => {
  await Promise.all([loadDiasFestivos(), loadFichas()])
})

async function loadDiasFestivos() {
  try { diasFestivos.value = await api.diasFestivos.getAll() } catch (e) {}
}

async function loadFichas() {
  try { fichasList.value = await api.fichas.getAll() } catch (e) {}
}

const diasOrdenados = computed(() => [...diasFestivos.value].sort((a, b) => a.fecha.localeCompare(b.fecha)))

const diasFuturos = computed(() => {
  const hoy = new Date().toISOString().slice(0, 10)
  return diasOrdenados.value.filter(d => d.fecha >= hoy)
})

const diasPasados = computed(() => {
  const hoy = new Date().toISOString().slice(0, 10)
  return diasOrdenados.value.filter(d => d.fecha < hoy)
})

function showToastFn(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openCreate() {
  editingId.value = null
  Object.assign(diaFestivoForm, {
    fecha: '',
    motivo: 'Festivo',
    fichasAplicables: 'todas',
    jornadasSeleccionadas: ['Mañana', 'Tarde', 'Noche'],
    fichasSeleccionadas: [],
    descripcion: ''
  })
  showModal.value = true
}

function openEdit(dia) {
  editingId.value = dia._id
  Object.assign(diaFestivoForm, {
    fecha: dia.fecha,
    motivo: dia.motivo,
    fichasAplicables: dia.fichasAplicables || 'todas',
    jornadasSeleccionadas: dia.jornadasSeleccionadas?.length ? [...dia.jornadasSeleccionadas] : ['Mañana', 'Tarde', 'Noche'],
    fichasSeleccionadas: (dia.fichasSeleccionadas || []).map(f => f._id || f),
    descripcion: dia.descripcion || '',
  })
  showModal.value = true
}

function closeModal() { showModal.value = false }

function toggleJornada(j) {
  const idx = diaFestivoForm.jornadasSeleccionadas.indexOf(j)
  if (idx === -1) diaFestivoForm.jornadasSeleccionadas.push(j)
  else diaFestivoForm.jornadasSeleccionadas.splice(idx, 1)
}

function toggleFicha(fichaId) {
  const idx = diaFestivoForm.fichasSeleccionadas.indexOf(fichaId)
  if (idx === -1) diaFestivoForm.fichasSeleccionadas.push(fichaId)
  else diaFestivoForm.fichasSeleccionadas.splice(idx, 1)
}

async function sincronizarAPI() {
  sincronizandoAPI.value = true
  try {
    const anioActual = new Date().getFullYear()
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anioActual}/CO`)
    if (!res.ok) throw new Error('No se pudo conectar con el servicio de festivos')
    
    const festivosAPI = await res.json()
    let agregados = 0

    for (const fest of festivosAPI) {
      const yaExiste = diasFestivos.value.some(d => d.fecha === fest.date)
      if (!yaExiste) {
        await api.diasFestivos.create({
          fecha: fest.date,
          motivo: 'Festivo',
          descripcion: fest.localName || fest.name,
          fichasAplicables: 'todas',
          jornadasSeleccionadas: ['Mañana', 'Tarde', 'Noche'],
          fichasSeleccionadas: []
        })
        agregados++
      }
    }

    await loadDiasFestivos()
    if (agregados > 0) {
      showToastFn(`Se sincronizaron ${agregados} días festivos de Colombia (${anioActual}) e inhabilitaron automáticamente`)
    } else {
      showToastFn(`Los días festivos oficiales de Colombia (${anioActual}) ya están registrados`)
    }
  } catch (err) {
    showToastFn('Error al sincronizar con la API: ' + err.message, 'error')
  } finally {
    sincronizandoAPI.value = false
  }
}

async function guardarDiaFestivo() {
  if (!diaFestivoForm.fecha || !diaFestivoForm.motivo) {
    showToastFn('Completa todos los campos obligatorios', 'error')
    return
  }
  loading.value = true
  try {
    const body = {
      fecha: diaFestivoForm.fecha,
      motivo: diaFestivoForm.motivo,
      fichasAplicables: diaFestivoForm.fichasAplicables,
      jornadasSeleccionadas: diaFestivoForm.jornadasSeleccionadas,
      fichasSeleccionadas: diaFestivoForm.fichasSeleccionadas,
      descripcion: diaFestivoForm.descripcion,
    }
    if (editingId.value) {
      await api.diasFestivos.update(editingId.value, body)
      showToastFn('Día festivo / inhabilitación actualizado correctamente')
    } else {
      await api.diasFestivos.create(body)
      showToastFn('Día festivo / inhabilitación registrado correctamente')
    }
    await loadDiasFestivos()
    closeModal()
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function eliminarDiaFestivo(id) {
  if (!confirm('¿Deseas eliminar este día festivo / inhabilitación?')) return
  try {
    await api.diasFestivos.delete(id)
    await loadDiasFestivos()
    showToastFn('Día festivo / inhabilitación eliminado correctamente')
  } catch (e) {
    showToastFn('Error: ' + e.message, 'error')
  }
}

function motivoBadge(motivo) {
  if (motivo === 'Festivo') return 'badge-primary'
  if (motivo === 'Inhabilitado Institucional' || motivo === 'Inhabilitado') return 'badge-danger'
  if (motivo === 'Jornada Pedagogica' || motivo === 'Jornada Pedagógica') return 'badge-warning'
  return 'badge-ficha'
}

function getFichasNombres(dia) {
  if (dia.fichasAplicables === 'todas') return 'Todas las clases y jornadas'
  if (dia.fichasAplicables === 'jornada') {
    const j = (dia.jornadasSeleccionadas || []).join(', ')
    return `Jornadas: ${j || 'Ninguna'}`
  }
  if (!dia.fichasSeleccionadas || dia.fichasSeleccionadas.length === 0) return 'Todas las clases'
  return dia.fichasSeleccionadas.map(id => {
    const f = fichasList.value.find(f => (f._id === id) || (f._id === id?._id))
    return f ? f.codigoFicha : ''
  }).filter(Boolean).join(', ')
}

function formatFecha(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function esHoy(fecha) { return fecha === new Date().toISOString().slice(0, 10) }
</script>

<template>
  <div class="page-header">
    <h1>Días Festivos e Inhabilitados</h1>
    <p>Inhabilita automáticamente las clases de la institución por festivos, jornadas o fichas seleccionadas</p>
  </div>

  <div class="card">
    <div class="card-header">
      <h3>Calendario de Días No Laborables / Inhabilitados</h3>
      <div class="btn-group">
        <button class="btn btn-outline" @click="sincronizarAPI" :disabled="sincronizandoAPI">
          {{ sincronizandoAPI ? 'Sincronizando...' : 'Sincronizar Festivos Colombia (API)' }}
        </button>
        <button class="btn btn-primary" @click="openCreate">
          + Inhabilitar Día / Registrar Festivo
        </button>
      </div>
    </div>

    <div v-if="diasOrdenados.length === 0" class="empty-state">
      <p>No hay días festivos ni inhabilitaciones registradas.</p>
    </div>

    <div v-else>
      <div v-if="diasFuturos.length > 0" style="margin-bottom: 24px;">
        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text);">Próximos Días Inhabilitados / Festivos</h4>
        <div class="festivos-grid">
          <div v-for="d in diasFuturos" :key="d._id" class="festivo-card" :class="{ 'festivo-hoy': esHoy(d.fecha) }">
            <div class="festivo-fecha">
              <span class="festivo-dia">{{ d.fecha.slice(8) }}</span>
              <span class="festivo-mes">{{ new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short' }) }}</span>
            </div>
            <div class="holidays-item-info">
              <strong>{{ d.descripcion || d.motivo }}</strong>
              <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                <span class="badge" :class="motivoBadge(d.motivo)">{{ d.motivo }}</span>
              </div>
              <span style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">{{ getFichasNombres(d) }}</span>
            </div>
            <div class="btn-group">
              <button class="btn btn-outline btn-sm" @click="openEdit(d)">Editar</button>
              <button class="btn btn-danger btn-sm" @click="eliminarDiaFestivo(d._id)">Eliminar</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="diasPasados.length > 0">
        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">Días Anteriores ({{ diasPasados.length }})</h4>
        <div class="table-container">
          <table>
            <thead><tr><th>Fecha</th><th>Motivo</th><th>Descripción</th><th>Alcance</th><th>Acciones</th></tr></thead>
            <tbody>
              <tr v-for="d in diasPasados" :key="d._id">
                <td>{{ formatFecha(d.fecha) }}</td>
                <td><span class="holidays-badge" :class="motivoBadge(d.motivo)">{{ d.motivo }}</span></td>
                <td>{{ d.descripcion || '—' }}</td>
                <td class="holidays-fiches-cell">{{ getFichasNombres(d) }}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-outline btn-sm" @click="openEdit(d)">Editar</button>
                    <button class="btn btn-danger btn-sm" @click="eliminarDiaFestivo(d._id)">Eliminar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h2>{{ editingId ? 'Editar' : 'Registrar' }} Día Festivo / Inhabilitación</h2>
      <div class="form-grid">
        <div class="form-group"><label>Fecha *</label><input v-model="diaFestivoForm.fecha" type="date" /></div>
        <div class="form-group">
          <label>Motivo *</label>
          <select v-model="diaFestivoForm.motivo">
            <option value="Festivo">Festivo Oficial</option>
            <option value="Inhabilitado Institucional">Inhabilitado Institucional</option>
            <option value="Jornada Pedagogica">Jornada Pedagógica</option>
            <option value="Receso">Receso / Vacaciones</option>
            <option value="Actividad Especial">Actividad Especial</option>
          </select>
        </div>
        <div class="form-group"><label>Descripción (Opcional)</label><input v-model="diaFestivoForm.descripcion" type="text" placeholder="Ej: Día festivo nacional, Día cívico, Reunión..." /></div>
        <div class="form-group">
          <label>Inhabilitar Clases</label>
          <select v-model="diaFestivoForm.fichasAplicables">
            <option value="todas">Todas las clases y jornadas</option>
            <option value="jornada">Por jornadas específicas</option>
            <option value="especificas">Por fichas específicas</option>
          </select>
        </div>
      </div>

      <!-- Selección de Jornadas -->
      <div v-if="diaFestivoForm.fichasAplicables === 'jornada'" style="margin-top: 16px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;">
          Selecciona las jornadas a inhabilitar
        </label>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <label class="ficha-check-item" style="cursor: pointer;">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Mañana')" @change="toggleJornada('Mañana')" />
            <span>Mañana</span>
          </label>
          <label class="ficha-check-item" style="cursor: pointer;">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Tarde')" @change="toggleJornada('Tarde')" />
            <span>Tarde</span>
          </label>
          <label class="ficha-check-item" style="cursor: pointer;">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Noche')" @change="toggleJornada('Noche')" />
            <span>Noche</span>
          </label>
        </div>
      </div>

      <!-- Selección de Fichas Específicas -->
      <div v-if="diaFestivoForm.fichasAplicables === 'especificas'" style="margin-top: 16px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;">
          Selecciona las fichas a inhabilitar
        </label>
        <div class="fichas-check-grid">
          <label v-for="f in fichasList" :key="f._id" class="ficha-check-item">
            <input type="checkbox" :checked="diaFestivoForm.fichasSeleccionadas.includes(f._id)" @change="toggleFicha(f._id)" />
            <span>{{ f.codigoFicha }} - {{ f.nombrePrograma }} ({{ f.jornada }})</span>
          </label>
        </div>
      </div>

      <div style="margin-top: 16px; padding: 10px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 12.5px; color: #1e40af;">
        ℹ️ Al guardar, se inhabilitará la toma de asistencia para las fichas y jornadas seleccionadas en esta fecha tanto en el panel docente como en el reporte institucional SQLite.
      </div>

      <div class="btn-group" style="margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn-outline" @click="closeModal">Cancelar</button>
        <button class="btn btn-primary" @click="guardarDiaFestivo" :disabled="loading">
          {{ loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Guardar e Inhabilitar') }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="holidays-toast" :class="'holidays-toast-' + toast.type">{{ toast.message }}</div>
</template>

<style scoped>
.page-header { margin-bottom: 34px; }
.page-header h1 { font-size: 26px; font-weight: 600; letter-spacing: -.02em; color: #16210F; }
.page-header p { color: #7C857A; font-size: 14.5px; margin-top: 6px; }
.card { background: #ffffff; border-radius: 20px; padding: 32px 36px 34px; box-shadow: 0 1px 2px rgba(22,33,15,.04), 0 8px 32px rgba(57,169,0,.09); margin-bottom: 22px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
.card-header h3 { font-size: 16.5px; font-weight: 600; color: #16210F; }
.btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
.festivos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.festivo-card { display: flex; align-items: center; gap: 14px; padding: 14px; background: #F7F9F5; border-radius: 12px; border: 1px solid #E2E6DE; }
.festivo-hoy { border-color: #39A900; background: #F2F9ED; }
.festivo-fecha { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 50px; height: 50px; background: #E8F5E0; color: #1F5C00; border-radius: 8px; border: none; flex-shrink: 0; }
.festivo-dia { font-size: 20px; font-weight: 700; color: #1F5C00; line-height: 1; }
.festivo-mes { font-size: 10px; color: #1F5C00; text-transform: uppercase; font-weight: 600; }
.festivo-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.fichas-check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; max-height: 180px; overflow-y: auto; padding: 8px; background: #F7F9F5; border: 1px solid #E2E6DE; border-radius: 8px; }
.ficha-check-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #E2E6DE; border-radius: 6px; background: #fff; font-size: 13px; }
.toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; font-weight: 600; color: white; z-index: 9999; box-shadow: 0 2px 4px rgba(22,33,15,.03), 0 18px 48px rgba(22,33,15,.08); }
.toast-success { background: #2F8C00; }
.toast-error { background: #C4432B; }
</style>
