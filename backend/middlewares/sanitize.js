/**
 * Protección contra inyección de operadores de MongoDB (NoSQL injection) y
 * contaminación de prototipos: elimina de body, query y params cualquier clave
 * que empiece por '$', contenga '.' o sea __proto__/constructor/prototype.
 * Ej.: GET /api/excusas?fichaId[$ne]=x  o  { "correo": { "$gt": "" } }
 */
const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])

function limpiar(valor, profundidad = 0) {
  if (profundidad > 20 || valor === null || typeof valor !== 'object') return valor
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i++) valor[i] = limpiar(valor[i], profundidad + 1)
    return valor
  }
  for (const clave of Object.keys(valor)) {
    if (clave.startsWith('$') || clave.includes('.') || CLAVES_PROHIBIDAS.has(clave)) {
      delete valor[clave]
    } else {
      valor[clave] = limpiar(valor[clave], profundidad + 1)
    }
  }
  return valor
}

export function sanitizarEntrada(req, res, next) {
  if (req.body) limpiar(req.body)
  if (req.query) limpiar(req.query)
  if (req.params) limpiar(req.params)
  next()
}
