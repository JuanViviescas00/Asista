import { execFileSync } from 'child_process'

// Lee el MachineGuid de Windows (identificador único y estable de ESA instalación
// de SO, no del hardware físico). Se obtiene vía `reg query` (child_process puro,
// sin binding nativo), cumpliendo la regla del proyecto de JS puro.
//
// Devuelve el GUID en minúsculas, o null si no se pudo leer (nunca lanza):
// un fallo aquí no debe tumbar el arranque del huellero.
const GUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

let cachedGuid = undefined

export function obtenerHardwareFingerprint() {
  if (cachedGuid !== undefined) return cachedGuid

  try {
    const salida = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    const match = salida.match(GUID_RE)
    cachedGuid = match ? match[0].toLowerCase() : null
  } catch {
    cachedGuid = null
  }

  return cachedGuid
}
