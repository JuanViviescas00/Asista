<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../services/index.js'
import '../styles/diasFestivos.css'

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
  if (motivo === 'Festivo') return 'holidays-badge-primary'
  if (motivo === 'Inhabilitado Institucional' || motivo === 'Inhabilitado') return 'holidays-badge-danger'
  if (motivo === 'Jornada Pedagogica' || motivo === 'Jornada Pedagógica') return 'holidays-badge-warning'
  return 'holidays-badge-special'
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
  <div class="holidays-page-header">
    <h1>Días Festivos e Inhabilitados</h1>
    <p>Inhabilita automáticamente las clases de la institución por festivos, jornadas o fichas seleccionadas</p>
  </div>

  <div class="holidays-card">
    <div class="holidays-card-header">
      <h3>Calendario de Días No Laborables / Inhabilitados</h3>
      <div class="holidays-button-group">
        <button class="holidays-button holidays-button-outline" @click="sincronizarAPI" :disabled="sincronizandoAPI" title="Sincronizar Festivos">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="holidays-button holidays-button-primary" @click="openCreate" title="Agregar Día Festivo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>

    <div v-if="diasOrdenados.length === 0" class="holidays-empty-state">
      <p>No hay días festivos ni inhabilitaciones registradas.</p>
    </div>

    <div v-else>
      <div v-if="diasFuturos.length > 0" class="holidays-upcoming-section">
        <h4 class="holidays-section-title">Próximos Días Inhabilitados / Festivos</h4>
        <div class="holidays-grid">
          <div v-for="d in diasFuturos" :key="d._id" class="holidays-card-item" :class="{ 'holidays-card-today': esHoy(d.fecha) }">
            <div class="holidays-date-box">
              <span class="holidays-date-day">{{ d.fecha.slice(8) }}</span>
              <span class="holidays-date-month">{{ new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short' }) }}</span>
            </div>
            <div class="holidays-item-info">
              <strong>{{ d.descripcion || d.motivo }}</strong>
              <div class="holidays-badge-row">
                <span class="holidays-badge" :class="motivoBadge(d.motivo)">{{ d.motivo }}</span>
              </div>
              <span class="holidays-item-fiches">{{ getFichasNombres(d) }}</span>
            </div>
            <div class="holidays-button-group">
              <button class="holidays-button holidays-button-outline holidays-button-small" @click="openEdit(d)" title="Editar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
              <button class="holidays-button holidays-button-danger holidays-button-small" @click="eliminarDiaFestivo(d._id)" title="Eliminar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="diasPasados.length > 0">
        <h4 class="holidays-section-title holidays-section-title-past">Días Anteriores ({{ diasPasados.length }})</h4>
        <div class="holidays-table-container">
          <table class="holidays-table">
            <thead><tr><th>Fecha</th><th>Motivo</th><th>Descripción</th><th>Alcance</th><th>Acciones</th></tr></thead>
            <tbody>
              <tr v-for="d in diasPasados" :key="d._id">
                <td>{{ formatFecha(d.fecha) }}</td>
                <td><span class="holidays-badge" :class="motivoBadge(d.motivo)">{{ d.motivo }}</span></td>
                <td>{{ d.descripcion || '—' }}</td>
                <td class="holidays-fiches-cell">{{ getFichasNombres(d) }}</td>
                <td>
                  <div class="holidays-button-group">
                    <button class="holidays-button holidays-button-outline holidays-button-small" @click="openEdit(d)" title="Editar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                    <button class="holidays-button holidays-button-danger holidays-button-small" @click="eliminarDiaFestivo(d._id)" title="Eliminar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showModal" class="holidays-modal-overlay" @click.self="closeModal">
    <div class="holidays-modal">
      <h2>{{ editingId ? 'Editar' : 'Registrar' }} Día Festivo / Inhabilitación</h2>
      <div class="holidays-form-grid">
        <div class="holidays-form-group"><label>Fecha *</label><input v-model="diaFestivoForm.fecha" type="date" /></div>
        <div class="holidays-form-group">
          <label>Motivo *</label>
          <select v-model="diaFestivoForm.motivo">
            <option value="Festivo">Festivo Oficial</option>
            <option value="Inhabilitado Institucional">Inhabilitado Institucional</option>
            <option value="Jornada Pedagogica">Jornada Pedagógica</option>
            <option value="Receso">Receso / Vacaciones</option>
            <option value="Actividad Especial">Actividad Especial</option>
          </select>
        </div>
        <div class="holidays-form-group"><label>Descripción (Opcional)</label><input v-model="diaFestivoForm.descripcion" type="text" placeholder="Ej: Día festivo nacional, Día cívico, Reunión..." /></div>
        <div class="holidays-form-group">
          <label>Inhabilitar Clases</label>
          <select v-model="diaFestivoForm.fichasAplicables">
            <option value="todas">Todas las clases y jornadas</option>
            <option value="jornada">Por jornadas específicas</option>
            <option value="especificas">Por fichas específicas</option>
          </select>
        </div>
      </div>

      <!-- Selección de Jornadas -->
      <div v-if="diaFestivoForm.fichasAplicables === 'jornada'" class="holidays-selection-section">
        <label class="holidays-selection-label">
          Selecciona las jornadas a inhabilitar
        </label>
        <div class="holidays-jornadas-row">
          <label class="holidays-fiche-check-item">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Mañana')" @change="toggleJornada('Mañana')" />
            <span>Mañana</span>
          </label>
          <label class="holidays-fiche-check-item">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Tarde')" @change="toggleJornada('Tarde')" />
            <span>Tarde</span>
          </label>
          <label class="holidays-fiche-check-item">
            <input type="checkbox" :checked="diaFestivoForm.jornadasSeleccionadas.includes('Noche')" @change="toggleJornada('Noche')" />
            <span>Noche</span>
          </label>
        </div>
      </div>

      <!-- Selección de Fichas Específicas -->
      <div v-if="diaFestivoForm.fichasAplicables === 'especificas'" class="holidays-selection-section">
        <label class="holidays-selection-label">
          Selecciona las fichas a inhabilitar
        </label>
        <div class="holidays-fiches-check-grid">
          <label v-for="f in fichasList" :key="f._id" class="holidays-fiche-check-item">
            <input type="checkbox" :checked="diaFestivoForm.fichasSeleccionadas.includes(f._id)" @change="toggleFicha(f._id)" />
            <span>{{ f.codigoFicha }} - {{ f.nombrePrograma }} ({{ f.jornada }})</span>
          </label>
        </div>
      </div>

      <div class="holidays-info-note">
        ℹ Al guardar, se inhabilitará la toma de asistencia para las fichas y jornadas seleccionadas en esta fecha tanto en el panel docente como en el reporte institucional SQLite.
      </div>

      <div class="holidays-modal-actions">
        <button class="holidays-button holidays-button-outline" @click="closeModal" title="Cancelar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <button class="holidays-button holidays-button-primary" @click="guardarDiaFestivo" :disabled="loading" title="Guardar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
      </div>
    </div>
  </div>

  <div v-if="toast.show" class="holidays-toast" :class="'holidays-toast-' + toast.type">{{ toast.message }}</div>
</template>

