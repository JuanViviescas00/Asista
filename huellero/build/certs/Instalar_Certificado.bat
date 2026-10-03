@echo off
title Instalador de Certificado de Confianza - SENA Huellero
echo ============================================================
echo   INSTALACION DE CERTIFICADO DE CONFIANZA - SENA
echo ============================================================
echo.
echo Registrando entidad certificadora del SENA en Windows...

:: Ejecutar certutil para agregarlo a Entidades de Certificacion Raiz de Confianza
certutil -addstore -f "Root" "%~dp0huellero-sena.cer"

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   [EXITO] Certificado SENA instalado correctamente.
    echo   Windows ahora reconoce la aplicacion como confiable.
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo   [AVISO] Si la instalacion fallo, por favor haz clic derecho
    echo   sobre este archivo y elige: "Ejecutar como Administrador".
    echo ============================================================
)
echo.
pause
