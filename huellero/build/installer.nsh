; Instalación silenciosa del driver DigitalPersona U.are.U 4500 (HID Global,
; v4.1.0.217) durante la instalación LIMPIA del huellero.
;
; Se ejecuta en el macro customInstall de electron-builder (NSIS), por lo que
; corre después de copiar los archivos de la app. Reglas:
;   - Solo en instalación limpia (${ifNot} ${isUpdated}): no se reinstala el
;     driver en cada actualización del huellero.
;   - Solo si el driver AÚN no está instalado (vía la clave de desinstalación
;     MSI), para evitar una entrada duplicada en "Programas y características"
;     (Known Issue 5.1 del Readme del driver).

!include "x64.nsh"

!macro customInstall
  ${ifNot} ${isUpdated}

    ; El MSI del driver se registra en la vista 64-bit del registro.
    SetRegView 64
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{C3F09A11-1948-427D-B2D9-F172EFF931CF}" "UninstallString"
    SetRegView 32

    ${If} $0 == ""
      ; No está instalado: elegir el MSI según la arquitectura del SO y
      ; ejecutarlo silenciosamente (msiexec /qn /norestart).
      ${If} ${RunningX64}
        File /oname=$PLUGINSDIR\setup-x64.msi "${BUILD_RESOURCES_DIR}\driver\setup-x64.msi"
        ExecWait 'msiexec /i "$PLUGINSDIR\setup-x64.msi" /qn /norestart'
      ${Else}
        File /oname=$PLUGINSDIR\setup-x86.msi "${BUILD_RESOURCES_DIR}\driver\setup-x86.msi"
        ExecWait 'msiexec /i "$PLUGINSDIR\setup-x86.msi" /qn /norestart'
      ${EndIf}
    ${EndIf}

  ${endIf}
!macroend
