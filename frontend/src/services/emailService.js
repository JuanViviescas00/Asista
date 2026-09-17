export async function enviarCodigoRecuperacion(correoDestino, codigo) {
  const response = await fetch('http://localhost:3000/api/enviar-codigo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      correo: correoDestino,
      codigo: codigo,
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Error al enviar el correo')
  }

  return true
}
