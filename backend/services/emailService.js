import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
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

export default {
  enviarCorreoRecuperacion,
  enviarCorreoConfirmacionCambioPassword,
}
