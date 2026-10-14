import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * Genera un hash seguro con bcrypt (10 rondas de salt)
 * @param {string} plainText 
 * @returns {Promise<string>}
 */
export async function hashPassword(plainText) {
  if (!plainText) return ''
  return await bcrypt.hash(plainText, SALT_ROUNDS)
}

/**
 * Deriva la contraseña inicial de un instructor a partir de su número de documento.
 * Normalización: recorta espacios, elimina puntos y todo espacio en blanco, y conserva
 * ceros a la izquierda y letras (no se convierte a número).
 * @param {string} numeroDocumento
 * @returns {string}
 */
export function claveInicialInstructor(numeroDocumento) {
  return String(numeroDocumento ?? '').trim().replace(/[.\s]/g, '')
}

/**
 * Compara una contraseña en texto plano contra el hash almacenado.
 * Si el usuario tenía una contraseña en texto plano antigua, la valida y
 * la actualiza automáticamente a un hash bcrypt en la base de datos (migración transparente).
 * 
 * @param {Object} user Documento Mongoose del usuario
 * @param {string} inputPassword Contraseña ingresada por el usuario
 * @returns {Promise<boolean>}
 */
export async function verifyAndUpgradePassword(user, inputPassword) {
  if (!user || !user.password || !inputPassword) return false

  const storedPassword = String(user.password).trim()

  // 1. Si ya es un hash bcrypt ($2a$, $2b$ o $2y$)
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    return await bcrypt.compare(inputPassword, storedPassword)
  }

  // 2. Si es una contraseña en texto plano antigua (legada)
  if (storedPassword === inputPassword) {
    try {
      // Migración automática e instantánea al hash bcrypt
      const newHash = await hashPassword(inputPassword)
      user.password = newHash
      await user.save()
      console.log(`[Seguridad] Contraseña de ${user.correo || user.numeroDocumento || 'usuario'} migrada a bcrypt exitosamente.`)
    } catch (err) {
      console.error('[Seguridad] Error al migrar contraseña a bcrypt:', err.message)
    }
    return true
  }

  return false
}
