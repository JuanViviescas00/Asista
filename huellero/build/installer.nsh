; Prerrequisitos nativos instalados silenciosamente durante la instalación
; LIMPIA del huellero:
;   1) Driver DigitalPersona U.are.U 4500 (HID Global, v4.1.0.217) — .msi
;   2) Visual C++ Redistributable x64 (Microsoft VC++ 2015-2022) — .exe
;
; Se ejecuta en el macro customInstall de electron-builder (NSIS), por lo que
; corre después de copiar los archivos de la app. Reglas:
;   - Solo en instalación limpia (${ifNot} ${isUpdated}): no se reinstalan en
;     cada actualización del huellero.
;   - Solo si el componente AÚN no está instalado (chequeo real de registro),
;     para evitar reinstalaciones innecesarias: en el driver, una entrada
;     duplicada en "Programas y características" (Known Issue 5.1 del Readme
;     del driver); en el redistributable, un prompt de reparación/desinstalación.

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

    ; --- Visual C++ Redistributable x64 (Microsoft VC++ 2015-2022) ---------
    ; vc_redist.x64.exe es un bootstrapper .exe de Microsoft (no un .msi), por
    ; lo que su sintaxis silenciosa oficial es: /install /quiet /norestart
    ; (https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist).
    ; Solo x64: la app y sus DLLs nativas (koffi) son de 64 bits, así que un
    ; sistema x86 no es un destino válido para el huellero.
    ${If} ${RunningX64}
      ; El redistributable x64 registra su instalación en la vista 64-bit del
      ; registro, con el valor DWORD "Installed" = 1. Clave verificada en
      ; máquina real (no asumida):
      ;   HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64
      SetRegView 64
      ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
      SetRegView 32

      ${If} $1 != 1
        ; No está instalado: instalarlo silenciosamente. Códigos de salida
        ; típicos de este bootstrapper (se ignoran a propósito; 1638 = ya hay
        ; una versión igual o más nueva, 3010 = éxito pero requiere reinicio).
        DetailPrint "Instalando el Visual C++ Redistributable x64..."
        File /oname=$PLUGINSDIR\vc_redist.x64.exe "${BUILD_RESOURCES_DIR}\vcredist\vc_redist.x64.exe"
        ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $2
        DetailPrint "vc_redist.x64.exe terminó con código $2"
      ${EndIf}
    ${EndIf}

  ${endIf}
!macroend
