import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

// Clave fija que usaban versiones anteriores cuando no había variables de entorno.
// Se conserva SOLO para descifrar datos antiguos; nunca se usa para cifrar en producción.
const LEGACY_SECRET = 'sena_huellero_rpa_master_key_2026_biometria'

function derivarClave(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest()
}

/**
 * Obtiene la clave de 32 bytes (256 bits) para AES-256 derivada mediante SHA-256.
 * En producción exige SOFIA_ENCRYPTION_KEY (o, por compatibilidad, JWT_SECRET).
 */
function getKey() {
  const secret = process.env.SOFIA_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SOFIA_ENCRYPTION_KEY no configurada')
    }
    return derivarClave(LEGACY_SECRET)
  }
  return derivarClave(secret)
}

function descifrarConClave(key, iv, authTag, encryptedHex) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
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
    // Nunca devolver el texto plano: es preferible fallar a guardar la clave sin cifrar.
    console.error('Error al cifrar texto:', err.message)
    throw err
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
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    try {
      return descifrarConClave(getKey(), iv, authTag, encryptedHex)
    } catch (_) {
      // Compatibilidad: datos cifrados con la clave fija de versiones anteriores
      return descifrarConClave(derivarClave(LEGACY_SECRET), iv, authTag, encryptedHex)
    }
  } catch (err) {
    console.error('Error al descifrar texto:', err.message)
    return ''
  }
}

export default {
  encrypt,
  decrypt
}
