; Prerrequisitos nativos instalados silenciosamente durante la instalación
; LIMPIA del huellero (solo x64):
;   1) Driver DigitalPersona U.are.U 4500 (HID Global, v4.1.0.217) — .msi
;   2) SDK DigitalPersona U.are.U (3.2.0.89) — setup.msi + Data1.cab + Setup.ini + 0x0409.ini
;   3) Visual C++ Redistributable x64 (Microsoft VC++ 2015-2022) — .exe
;
; Se ejecuta en el macro customInstall de electron-builder (NSIS), por lo que
; corre después de copiar los archivos de la app. Reglas:
;   - Solo en instalación limpia (${ifNot} ${isUpdated}): no se reinstalan en
;     cada actualización del huellero.
;   - Solo si el componente AÚN no está instalado (chequeo real de registro en
;     las vistas de 64 y 32 bits, WOW6432Node incluida), para evitar
;     reinstalaciones innecesarias.
;   - Tras cada instalación se verifica el código de salida: se aceptan 0
;     (éxito) y 3010 (éxito con reinicio pendiente); cualquier otro muestra un
;     aviso claro al usuario (no se continúa en silencio).

!include "x64.nsh"

; Devuelve "1" en $R1 si el ProductCode está instalado (vista de 64 bits o de
; 32 bits / WOW6432Node), o "" si no se encuentra en ninguna de las dos.
!macro IsProductInstalled _guid
  SetRegView 64
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${_guid}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $R1 "1"
  ${Else}
    SetRegView 32
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${_guid}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R1 "1"
    ${Else}
      StrCpy $R1 ""
    ${EndIf}
  ${EndIf}
  SetRegView 32
!macroend

; Ejecuta el MSI indicado y valida el código de salida.
;   _msiPath : ruta completa al .msi (junto a sus .cab si los tiene)
;   _label   : nombre legible del componente para los mensajes
!macro InstallMsiChecked _msiPath _label
  ExecWait 'msiexec /i "${_msiPath}" /qn /norestart' $R2
  ${If} $R2 == 0
    DetailPrint "${_label}: instalado correctamente."
  ${ElseIf} $R2 == 3010
    DetailPrint "${_label}: instalado; requiere reiniciar el equipo."
  ${Else}
    DetailPrint "${_label}: falló con código $R2."
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo instalar ${_label} (código $R2). El lector de huellas puede no funcionar hasta que este componente se instale correctamente." /SD IDOK
  ${EndIf}
!macroend

!macro customInstall
  ${ifNot} ${isUpdated}

    ; --- Driver DigitalPersona U.are.U 4500 (HID Global v4.1.0.217) ---------
    ; Detección en las vistas de 64 y 32 bits del registro (WOW6432Node).
    !insertmacro IsProductInstalled "{C3F09A11-1948-427D-B2D9-F172EFF931CF}"
    ${If} $R1 == ""
      ${If} ${RunningX64}
        File /oname=$PLUGINSDIR\setup-x64.msi "${BUILD_RESOURCES_DIR}\driver\setup-x64.msi"
        !insertmacro InstallMsiChecked "$PLUGINSDIR\setup-x64.msi" "Driver DigitalPersona U.are.U 4500"
      ${EndIf}
    ${EndIf}

    ; --- SDK DigitalPersona U.are.U (3.2.0.89) ------------------------------
    ; El MSI de InstallShield necesita junto a sí su Data1.cab (y los .ini), así
    ; que se extraen con su nombre original en una carpeta propia.
    !insertmacro IsProductInstalled "{77BDC578-CFA7-446D-AD36-4E75D7E463D2}"
    ${If} $R1 == ""
      ${If} ${RunningX64}
        CreateDirectory "$PLUGINSDIR\sdk"
        File /oname=$PLUGINSDIR\sdk\setup.msi "${BUILD_RESOURCES_DIR}\sdk\setup.msi"
        File /oname=$PLUGINSDIR\sdk\Data1.cab "${BUILD_RESOURCES_DIR}\sdk\Data1.cab"
        File /oname=$PLUGINSDIR\sdk\Setup.ini "${BUILD_RESOURCES_DIR}\sdk\Setup.ini"
        File /oname=$PLUGINSDIR\sdk\0x0409.ini "${BUILD_RESOURCES_DIR}\sdk\0x0409.ini"
        !insertmacro InstallMsiChecked "$PLUGINSDIR\sdk\setup.msi" "SDK DigitalPersona U.are.U"
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
        DetailPrint "Instalando el Visual C++ Redistributable x64..."
        File /oname=$PLUGINSDIR\vc_redist.x64.exe "${BUILD_RESOURCES_DIR}\vcredist\vc_redist.x64.exe"
        ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $2
        ${If} $2 == 0
          DetailPrint "Visual C++ Redistributable x64: instalado correctamente."
        ${ElseIf} $2 == 3010
          DetailPrint "Visual C++ Redistributable x64: instalado; requiere reiniciar el equipo."
        ${Else}
          DetailPrint "Visual C++ Redistributable x64: falló con código $2."
          MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo instalar el Visual C++ Redistributable x64 (código $2). La app de Asista puede no funcionar hasta que se instale correctamente." /SD IDOK
        ${EndIf}
      ${EndIf}
    ${EndIf}

    ; --- Certificado Digital de Confianza SENA -----------------------------
    ; Instala el certificado en el almacén de Entidades de Certificación Raíz
    ; de Confianza (Root) de la máquina local para que Windows reconozca al
    ; SENA como editor seguro y verificado en todos los componentes.
    DetailPrint "Registrando certificado de confianza SENA..."
    File /oname=$PLUGINSDIR\huellero-sena.cer "${BUILD_RESOURCES_DIR}\certs\huellero-sena.cer"
    ExecWait 'certutil.exe -addstore -f "Root" "$PLUGINSDIR\huellero-sena.cer"' $3
    DetailPrint "Certificado SENA registrado (código $3)"

  ${endIf}
!macroend
