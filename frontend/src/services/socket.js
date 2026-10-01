// ============================================================
// COMPATIBILIDAD: Re-exporta socket y funciones asociadas
// desde el servicio unificado (index.js).
// ============================================================
export {
  socket,
  reconectarConAuth,
  unirseASalaFicha,
  salirDeSalaFicha,
  iniciarAsistenciaRemota,
  cerrarAsistenciaRemota,
  default,
} from './index.js'
