import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const srcDir = path.join(rootDir, 'frontend', 'dist')
const destDir = path.join(rootDir, 'backend', 'public')

console.log(`[build:prod] Copiando frontend desde ${srcDir} hacia ${destDir}...`)

if (!fs.existsSync(srcDir)) {
  console.error(`Error: No se encontro la carpeta ${srcDir}. Asegurate de compilar el frontend primero.`)
  process.exit(1)
}

// Limpiar o crear carpeta destino
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true })
}
fs.mkdirSync(destDir, { recursive: true })

// Copiar archivos recursivamente (Node 16.7+)
fs.cpSync(srcDir, destDir, { recursive: true })

console.log('Frontend copiado exitosamente a backend/public!')
