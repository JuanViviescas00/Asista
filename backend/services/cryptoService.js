import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

/**
 * Obtiene la clave de 32 bytes (256 bits) para AES-256 derivada mediante SHA-256
 */
function getKey() {
  const secret = process.env.SOFIA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'sena_huellero_rpa_master_key_2026_biometria'
  return crypto.createHash('sha256').update(String(secret)).digest()
}

/**
 * Cifra un texto en texto plano usando AES-256-GCM.
 * Si ya viene cifrado (prefijo enc:v1:) o está vacío, lo retorna tal cual.
 * @param {string} text Texto en plano
 * @returns {string} Cadena cifrada con formato enc:v1:<iv_hex>:<authTag_hex>:<cipher_hex>
 */
export function encrypt(text) {
  if (!text || typeof text !== 'string') return ''
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith(PREFIX)) return trimmed

  try {
    const key = getKey()
    const iv = crypto.randomBytes(12) // 96 bits recomendado por NIST para GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(trimmed, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`
  } catch (err) {
    console.error('Error al cifrar texto:', err.message)
    return text
  }
}

/**
 * Descifra una cadena previamente cifrada con encrypt().
 * Si no está cifrada (no tiene el prefijo enc:v1:) o está vacía, la retorna tal cual.
 * @param {string} cipherText Cadena cifrada
 * @returns {string} Texto original descifrado
 */
export function decrypt(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return ''
  const trimmed = cipherText.trim()
  if (!trimmed.startsWith(PREFIX)) return trimmed

  try {
    const parts = trimmed.slice(PREFIX.length).split(':')
    if (parts.length !== 3) return trimmed

    const [ivHex, authTagHex, encryptedHex] = parts
    const key = getKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (err) {
    console.error('Error al descifrar texto:', err.message)
    return ''
  }
}

export default {
  encrypt,
  decrypt
}
