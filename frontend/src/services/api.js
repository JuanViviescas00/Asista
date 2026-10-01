// ============================================================
// COMPATIBILIDAD: Re-exporta el cliente API REST desde el
// servicio unificado (index.js) para evitar código duplicado.
// ============================================================
import api from './index.js'

export { api }
export default api
