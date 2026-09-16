// ============================================================
// useToast — notificación flotante reutilizable (éxito/error/
// advertencia/info) con auto-ocultado.
// ============================================================
import { reactive } from 'vue'

export function useToast(duration = 3000) {
  const toast = reactive({ show: false, message: '', type: 'success' })
  let timer = null

  function showToast(message, type = 'success') {
    if (timer) clearTimeout(timer)
    toast.show = true
    toast.message = message
    toast.type = type
    timer = setTimeout(() => {
      toast.show = false
    }, duration)
  }

  return { toast, showToast }
}
