import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
})

/**
 * Envía el código de recuperación de contraseña de forma segura al correo del usuario
 */
export async function enviarCorreoRecuperacion(correo, codigo) {
  return transporter.sendMail({
    from: `"Sistema Asista SENA" <${process.env.GMAIL_USER}>`,
    to: correo,
    subject: 'Código de recuperación de contraseña — Sistema Asista SENA',
    text: `Tu código de verificación es: ${codigo}\n\nEste código expira en 10 minutos. Si no solicitaste este cambio, por favor ignora este mensaje.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
        <h2 style="color:#16210f;margin-bottom:8px">Recuperación de Contraseña</h2>
        <p style="color:#4a5344;font-size:14px;line-height:1.5">Usa el siguiente código de verificación para restablecer tu contraseña en el Sistema Asista SENA:</p>
        <div style="background:#f2f9ed;border:1px solid #e8f5e0;border-radius:8px;padding:18px;text-align:center;margin:20px 0">
          <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#1f5c00">${codigo}</span>
        </div>
        <p style="color:#7c857a;font-size:12px;line-height:1.4">Este código expira en 10 minutos. Si no solicitaste este cambio, por favor ignora este correo.</p>
      </div>
    `,
  })
}

/**
 * Envía una notificación de confirmación cuando la contraseña ha sido actualizada
 */
export async function enviarCorreoConfirmacionCambioPassword(correo, nombre = 'Usuario') {
  const fechaHora = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return transporter.sendMail({
    from: `"Sistema Asista SENA" <${process.env.GMAIL_USER}>`,
    to: correo,
    subject: 'Confirmación: Contraseña modificada exitosamente — Sistema Asista SENA',
    text: `Hola ${nombre},\n\nTe confirmamos que la contraseña de tu cuenta en el Sistema Asista SENA fue actualizada exitosamente el ${fechaHora}.\n\nSi realizaste este cambio, no es necesario realizar ninguna acción.\n\nIMPORTANTE: Si NO realizaste este cambio, ponte en contacto de inmediato con la administración del centro o restablece tu contraseña para proteger tu cuenta.`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
        <h2 style="color:#16210f;margin-bottom:12px">Contraseña Actualizada</h2>
        <p style="color:#4a5344;font-size:14px;line-height:1.5">Hola <strong>${nombre}</strong>,</p>
        <p style="color:#4a5344;font-size:14px;line-height:1.5">Te confirmamos que la contraseña de tu cuenta en el <strong>Sistema Asista SENA</strong> fue actualizada con éxito el <strong>${fechaHora}</strong>.</p>
        <div style="background:#f2f9ed;border-left:4px solid #1f5c00;border-radius:4px;padding:12px 16px;margin:20px 0">
          <p style="margin:0;color:#1f5c00;font-size:13px;font-weight:600">✓ Cambio completado de forma segura</p>
        </div>
        <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:14px;margin:20px 0">
          <p style="margin:0;color:#92400e;font-size:13px;line-height:1.4">
            <strong>¿No reconoces esta actividad?</strong><br>
            Si tú no realizaste este cambio, por favor contacta de inmediato al administrador del sistema o solicita una recuperación de contraseña para proteger tu cuenta.
          </p>
        </div>
        <p style="color:#7c857a;font-size:12px;line-height:1.4;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:12px">
          Este es un correo automático de seguridad generado por el Sistema Asista SENA.
        </p>
      </div>
    `,
  })
}

/**
 * Envía la notificación del reporte de un aprendiz en ruta de deserción.
 * `para` = coordinador y bienestar, `cc` = equipo docente de la ficha
 * (ambos ya calculados por el controlador, usando los valores de la BD con
 * respaldo en las variables de entorno).
 */
export async function enviarReporteRutaDesercion({ destinatarios, para, cc, estudiante, ficha, fechasFallas, reportadoPor }) {
  const limpiar = (valor) => {
    const fuente = Array.isArray(valor) ? valor : String(valor || '').split(',')
    return [...new Set(
      fuente
        .map((c) => String(c || '').trim().toLowerCase())
        .filter((c) => c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))
    )]
  }

  const lista = limpiar(destinatarios)
  let to = limpiar(para)
  let copiaCc = limpiar(cc)

  // Retrocompatibilidad: si no llegan `para`/`cc`, se derivan del env como antes.
  if (!to.length && !copiaCc.length) {
    const principales = new Set([...limpiar(process.env.CORREO_COORDINADOR), ...limpiar(process.env.CORREO_BIENESTAR)])
    to = lista.filter((c) => principales.has(c))
    copiaCc = lista.filter((c) => !principales.has(c))
  }

  const finalTo = to.length ? to : lista
  const finalCc = copiaCc.length ? copiaCc : undefined

  const nombre = estudiante?.nombre || ''
  const documento = `${estudiante?.tipoDocumento || ''} ${estudiante?.numeroDocumento || ''}`.trim()
  const codigoFicha = ficha?.codigoFicha || ''
  const programa = ficha?.nombrePrograma || ''

  const filasFechas = (fechasFallas || [])
    .map((f) => `<li style="margin:4px 0">${f}</li>`)
    .join('') || '<li style="margin:4px 0;color:#7c857a">Sin fechas registradas</li>'

  const fechaHora = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return transporter.sendMail({
    from: `"Sistema Asista SENA" <${process.env.GMAIL_USER}>`,
    to: finalTo,
    cc: finalCc,
    subject: `Reporte de ruta de deserción — Ficha ${codigoFicha} — ${nombre}`,
    text: `Se reportó al aprendiz ${nombre} (${documento}) de la ficha ${codigoFicha} (${programa}) en la ruta de deserción.\n\nFechas de falla injustificada (${(fechasFallas || []).length}):\n${(fechasFallas || []).map((f) => `- ${f}`).join('\n') || 'Sin fechas registradas'}\n\nReportado por: ${reportadoPor || 'Sistema Asista SENA'}\nFecha: ${fechaHora}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
        <h2 style="color:#16210f;margin-bottom:8px">Reporte de Ruta de Deserción</h2>
        <p style="color:#4a5344;font-size:14px;line-height:1.5">Se reportó al siguiente aprendiz por acumular faltas injustificadas en la ruta de deserción:</p>
        <div style="background:#f2f9ed;border:1px solid #e8f5e0;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 6px;color:#1f5c00;font-size:16px;font-weight:700">${nombre}</p>
          <p style="margin:0;color:#4a5344;font-size:14px">${documento}</p>
          <p style="margin:6px 0 0;color:#4a5344;font-size:14px">Ficha ${codigoFicha} · ${programa}</p>
        </div>
        <h3 style="color:#16210f;font-size:14px;margin:20px 0 8px">Fechas de falla injustificada (${(fechasFallas || []).length})</h3>
        <ul style="margin:0;padding:0 0 0 18px;color:#4a5344;font-size:14px;line-height:1.5">${filasFechas}</ul>
        <p style="color:#7c857a;font-size:12px;line-height:1.4;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:12px">
          Reportado por ${reportadoPor || 'Sistema Asista SENA'} · ${fechaHora}<br>
          Este es un correo automático generado por el Sistema Asista SENA.
        </p>
      </div>
    `,
  })
}

export default {
  enviarCorreoRecuperacion,
  enviarCorreoConfirmacionCambioPassword,
  enviarReporteRutaDesercion,
}
