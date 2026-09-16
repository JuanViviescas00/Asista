# ============================================================
# Limpieza post-reorganización del frontend.
#
# Las páginas ya están en src/views/, las hojas en src/styles/ y
# los servicios unificados en src/services/index.js. Este script
# ELIMINA los archivos duplicados/obsoletos de la estructura vieja.
#
# Ejecutar desde la carpeta frontend:
#   powershell -ExecutionPolicy Bypass -File reorganizar.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'

# 1. Páginas antiguas en components/ (ya duplicadas en views/)
$paginas = @(
  'Login.vue',
  'Dashboard.vue',
  'AdminPerfil.vue',
  'Instructores.vue',
  'Fichas.vue',
  'Estudiantes.vue',
  'ImportarUsuarios.vue',
  'Reportes.vue',
  'DiasFestivos.vue',
  'PanelDispositivos.vue',
  'PanelInstructor.vue',
  'PanelEstudiante.vue',
  'KioscoAsistencia.vue'
)
foreach ($f in $paginas) {
  $path = Join-Path $src "components\$f"
  if (Test-Path -LiteralPath $path) {
    Remove-Item -Force -LiteralPath $path
    Write-Host "eliminado: components\$f" -ForegroundColor Yellow
  }
}

# 2. Hojas de estilo antiguas en components/ (ya en styles/)
$hojas = @(
  'login.css',
  'adminPerfil.css',
  'consultaEstudiante.css',
  'diasFestivos.css',
  'fichas.css',
  'importarUsuarios.css',
  'panelEstudiante.css'
)
foreach ($f in $hojas) {
  $path = Join-Path $src "components\$f"
  if (Test-Path -LiteralPath $path) {
    Remove-Item -Force -LiteralPath $path
    Write-Host "eliminado: components\$f" -ForegroundColor Yellow
  }
}

# 3. Servicios viejos (ahora todo vive en services/index.js)
$servicios = @('services\api.js', 'services\socket.js', 'services\emailService.js')
foreach ($f in $servicios) {
  $path = Join-Path $src $f
  if (Test-Path -LiteralPath $path) {
    Remove-Item -Force -LiteralPath $path
    Write-Host "eliminado: $f" -ForegroundColor Yellow
  }
}

# 4. Hoja de estilo global antigua (ahora styles/main.css)
$styleCss = Join-Path $src 'style.css'
if (Test-Path -LiteralPath $styleCss) {
  Remove-Item -Force -LiteralPath $styleCss
  Write-Host 'eliminado: style.css' -ForegroundColor Yellow
}

Write-Host ""
Write-Host 'Limpieza completada.' -ForegroundColor Cyan
Write-Host 'Verifica con: npm run build' -ForegroundColor Cyan
