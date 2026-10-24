import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import mongoose from 'mongoose'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

async function backup() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('ERROR: No se encontró MONGODB_URI en .env')
    process.exit(1)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.resolve(__dirname, `../data/backup_${timestamp}`)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  console.log(`Conectando a MongoDB para backup en: ${backupDir}...`)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
  const db = mongoose.connection.db

  const collections = await db.listCollections().toArray()
  for (const colInfo of collections) {
    const colName = colInfo.name
    const docs = await db.collection(colName).find().toArray()
    const filePath = path.join(backupDir, `${colName}.json`)
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8')
    console.log(`Backup guardado: ${colName} (${docs.length} documentos) -> ${filePath}`)
  }

  await mongoose.disconnect()
  console.log(`\nBackup completo exitoso en carpeta: ${backupDir}`)
  return backupDir
}

backup().catch(err => {
  console.error('Error generando backup:', err)
  process.exit(1)
})
