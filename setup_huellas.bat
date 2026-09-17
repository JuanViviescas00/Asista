@echo off
setlocal enabledelayedexpansion
title Instalador y Verificador de Dependencias - SENA Huellero

echo ========================================================
echo   INSTALADOR Y CONFIGURADOR INTEGRAL - SENA HUELLERO
echo ========================================================
echo.

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

:: 1. Verificar Node.js
echo [1/5] Verificando entorno Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Node.js no esta instalado o no se encuentra en el PATH.
    echo     Por favor instala Node.js version 22 o superior desde https://nodejs.org/
    goto :error
)
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo    Node.js detectado: !NODE_VER! (Recomendado: v22+)
echo.

:: 2. Instalar dependencias Backend
echo [2/5] Instalando dependencias del Backend (Express, Mongoose, SQLite)...
cd /d "%ROOT_DIR%\backend"
call npm install
if %errorlevel% neq 0 (echo ERROR instalando dependencias del backend && goto :error)
echo    Dependencias del backend instaladas correctamente.
echo.

:: 3. Instalar dependencias Frontend
echo [3/5] Instalando dependencias del Frontend (Vue 3, Vite, Tailwind/CSS)...
cd /d "%ROOT_DIR%\frontend"
call npm install
if %errorlevel% neq 0 (echo ERROR instalando dependencias del frontend && goto :error)
echo    Dependencias del frontend instaladas correctamente.
echo.

:: 4. Instalar dependencias Huellero Desktop
echo [4/5] Instalando dependencias del Huellero Electron (Kiosco DigitalPersona)...
cd /d "%ROOT_DIR%\huellero"
call npm install
if %errorlevel% neq 0 (echo ERROR instalando dependencias de huellero desktop && goto :error)
echo    Dependencias de huellero desktop instaladas correctamente.
echo.

:: 5. Verificación de archivos y dependencias nativas
echo [5/5] Verificando configuracion y motores nativos...

:: Verificar .env del Backend
if not exist "%ROOT_DIR%\backend\.env" (
    if exist "%ROOT_DIR%\backend\.env.example" (
        echo [!] AVISO: No se encontro backend\.env. Creando copia desde backend\.env.example...
        copy "%ROOT_DIR%\backend\.env.example" "%ROOT_DIR%\backend\.env" >nul
        echo     Archivo backend\.env creado. Recuerda configurar tus credenciales de MongoDB Atlas y SMTP.
    ) else (
        echo [!] AVISO: Recuerda crear el archivo backend\.env con tus credenciales.
    )
) else (
    echo    backend\.env detectado: OK
)

:: Verificar DLLs en huellero\dll
if exist "%ROOT_DIR%\huellero\dll\dpfj.dll" (
    echo    Librerias DigitalPersona en huellero\dll: OK
) else (
    echo [!] ATENCION: No se encontro huellero\dll\dpfj.dll.
)

:: Verificación de FFI nativo en huellero
cd /d "%ROOT_DIR%\huellero"
node -e "import('koffi').then(() => console.log('   koffi (FFI nativo C++): OK')).catch(e => console.log('   koffi: ERROR - ' + e.message))"

:: Verificación de SQLite en backend
cd /d "%ROOT_DIR%\backend"
node -e "import('better-sqlite3').then(() => console.log('   better-sqlite3 (Motor SQLite): OK')).catch(e => console.log('   better-sqlite3: ERROR - ' + e.message))"

echo.
echo ========================================================
echo   ¡INSTALACION Y CONFIGURACION COMPLETADA CON EXITO!
echo ========================================================
echo.
echo   Opciones para ejecutar el sistema:
echo.
echo   A. Con Docker (Recomendado):
echo      - Desarrollo:  docker compose -f docker-compose.dev.yml up -d
echo      - Produccion:  docker compose up -d
echo.
echo   B. En Local (Terminales):
echo      - Todo:        npm run dev
echo      - Kiosco USB:  cd huellero ^&^& npm run dev
echo.
pause
goto :eof

:error
echo.
echo ========================================================
echo   ERROR DURANTE LA INSTALACION
echo ========================================================
echo Revisa los mensajes de error anteriores.
pause
exit /b 1

