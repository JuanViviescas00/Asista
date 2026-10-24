import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Asistencia from '../models/Asistencia.js'
import Inasistencia from '../models/Inasistencia.js'
import Jornada from '../models/Jornada.js'
import Ficha from '../models/Ficha.js'
import DiaFestivo from '../models/DiaFestivo.js'
import { topeHorasPorJornada } from '../utils/jornadaUtils.js'
import { calcularEstadoCarga } from '../utils/inasistenciaEstado.js'
import { getHoyString } from '../services/asistenciaService.js'

dotenv.config()

async function migrar() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('❌ MONGODB_URI no definida en variables de entorno.')
    process.exit(1)
  }

  console.log('Conectando a MongoDB Atlas...')
  await mongoose.connect(uri)
  console.log('✓ Conectado a MongoDB Atlas.')

  const festivosDocs = await DiaFestivo.find().select('fecha')
  const festivosSet = new Set(festivosDocs.map(f => f.fecha))
  const hoyStr = getHoyString()

  const fichasDocs = await Ficha.find().select('_id jornada codigoFicha')
  const fichasMap = new Map(fichasDocs.map(f => [String(f._id), f]))

  const asistencias = await Asistencia.find().lean()
  console.log(`Analizando ${asistencias.length} registros en la colección asistencias...`)

  let presentesMigrados = 0
  let inasistenciasMigradas = 0
  let inhabilitadasMigradas = 0

  for (const a of asistencias) {
    if (!a.estudianteId || !a.fichaId || !a.fecha) continue

    const fichaIdStr = String(a.fichaId)
    const fichaDoc = fichasMap.get(fichaIdStr)
    const jornadaStr = fichaDoc?.jornada || ''

    if (a.estado === 'Presente') {
      // 1. Asegurar la Jornada
      const jornada = await Jornada.findOneAndUpdate(
        { fichaId: a.fichaId, fecha: a.fecha },
        {
          $setOnInsert: {
            fichaId: a.fichaId,
            fecha: a.fecha,
            instructorId: a.instructorId || null,
            origen: a.metodo === 'HUELLA' ? 'huellero' : 'manual',
            claseId: a.claseId || null,
          }
        },
        { upsert: true, new: true }
      )

      // 2. Agregar a presentes si no existe
      const yaPresente = (jornada.presentes || []).some(
        p => String(p.estudianteId) === String(a.estudianteId)
      )

      if (!yaPresente) {
        await Jornada.updateOne(
          { _id: jornada._id },
          {
            $push: {
              presentes: {
                estudianteId: a.estudianteId,
                hora: a.hora || '—',
                uuid: a.uuid || '',
                claseId: a.claseId || null,
                instructorId: a.instructorId || null,
                metodo: a.metodo === 'HUELLA' ? 'HUELLA' : 'MANUAL'
              }
            }
          }
        )
      }
      presentesMigrados++
    } else if (a.estado === 'Inhabilitada') {
      await Jornada.findOneAndUpdate(
        { fichaId: a.fichaId, fecha: a.fecha },
        {
          $set: {
            inhabilitada: true,
            motivoInhabilitacion: a.motivoInhabilitacion || 'Jornada inhabilitada'
          },
          $setOnInsert: {
            fichaId: a.fichaId,
            fecha: a.fecha,
            instructorId: a.instructorId || null,
            origen: 'manual'
          }
        },
        { upsert: true }
      )
      inhabilitadasMigradas++
    } else if (['Falta', 'Tardanza', 'Excusada'].includes(a.estado)) {
      const tope = topeHorasPorJornada(jornadaStr)
      const horas = a.estado === 'Tardanza' ? (a.horasTardanza || 1) : tope

      let estadoCarga = 'EN_ESPERA'
      if (a.subidoSofia === true) {
        estadoCarga = 'SUBIDA'
      } else {
        estadoCarga = calcularEstadoCarga({
          fecha: a.fecha,
          tipo: a.estado,
          jornada: jornadaStr,
          festivosSet,
          hoyStr
        })
      }

      const updateData = {
        tipo: a.estado,
        horas,
        hora: a.hora || '—',
        tiempoTardanza: a.tiempoTardanza || (a.estado === 'Tardanza' ? `${horas} horas` : '0 horas'),
        instructorId: a.instructorId || null,
        claseId: a.claseId || null,
        origen: a.metodo === 'HUELLA' ? 'huellero' : 'manual',
        estadoCarga,
        fechaSubidaSofia: a.fechaSubidaSofia || (a.subidoSofia ? new Date() : null)
      }

      if (a.uuid) updateData.uuid = a.uuid

      await Inasistencia.findOneAndUpdate(
        { estudianteId: a.estudianteId, fichaId: a.fichaId, fecha: a.fecha },
        { $set: updateData },
        { upsert: true }
      )
      inasistenciasMigradas++
    }
  }

  const totalJornadas = await Jornada.countDocuments()
  const totalInasistencias = await Inasistencia.countDocuments()

  console.log('\n=============================================')
  console.log('✓ MIGRACIÓN COMPLETADA EXITOSAMENTE')
  console.log(`  - Presentes procesados en Jornadas: ${presentesMigrados}`)
  console.log(`  - Novedades migradas a Inasistencias: ${inasistenciasMigradas}`)
  console.log(`  - Jornadas inhabilitadas procesadas: ${inhabilitadasMigradas}`)
  console.log(`  - Total documentos en colección "jornadas": ${totalJornadas}`)
  console.log(`  - Total documentos en colección "inasistencias": ${totalInasistencias}`)
  console.log('=============================================\n')

  await mongoose.disconnect()
  process.exit(0)
}

migrar().catch(err => {
  console.error('❌ Error en migración:', err)
  process.exit(1)
})
