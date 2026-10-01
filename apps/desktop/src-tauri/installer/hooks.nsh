; Extra steps for the installer and the uninstaller. Tauri's NSIS template calls these macros.

!include "WinVer.nsh"
!include "nsDialogs.nsh"

; The terminal command (ADR 0021): a small console program, built before the installer, that is
; installed as bin\arden-code.exe next to the app.
!define ARDEN_CLI "${__FILEDIR__}\..\..\..\..\target\release\arden-cli.exe"

Var ArdenPathCheckbox
; "0" when the person cleared the box. Anything else means the command goes on the PATH.
Var ArdenAddToPath

; A question before the installer starts: put the command on the PATH? It is not asked when nobody is
; there to answer (a silent or passive install), or when the app is being updated, which leaves the
; PATH as the person had it.
Page custom ArdenOptionsCreate ArdenOptionsLeave

Function ArdenOptionsCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/P" $0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/UPDATE" $0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "$(terminalCommandTitle)" "$(terminalCommandSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 36u "$(terminalCommandText)"
  Pop $0
  ${NSD_CreateCheckbox} 0 44u 100% 12u "$(addCommandToPath)"
  Pop $ArdenPathCheckbox
  ${NSD_Check} $ArdenPathCheckbox
  nsDialogs::Show
FunctionEnd

Function ArdenOptionsLeave
  ${NSD_GetState} $ArdenPathCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ArdenAddToPath "1"
  ${Else}
    StrCpy $ArdenAddToPath "0"
  ${EndIf}
FunctionEnd

; Arden Code needs Windows 11. Windows 10 gets a message and nothing is installed.
!macro NSIS_HOOK_PREINSTALL
  ${IfNot} ${AtLeastBuild} 22000
    MessageBox MB_OK|MB_ICONSTOP "$(windows11Required)" /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$INSTDIR\bin"
  File "/oname=$INSTDIR\bin\arden-code.exe" "${ARDEN_CLI}"

  ; On the PATH unless the box was cleared, /NOPATH was given, or this is an update.
  StrCpy $R9 1
  ${If} $ArdenAddToPath == "0"
    StrCpy $R9 0
  ${EndIf}
  ${GetOptions} $CMDLINE "/NOPATH" $R8
  ${IfNot} ${Errors}
    StrCpy $R9 0
  ${EndIf}
  ${If} $UpdateMode = 1
    StrCpy $R9 0
  ${EndIf}
  ${If} $R9 == 1
    nsExec::ExecToLog '"$INSTDIR\bin\arden-code.exe" --add-to-path'
    Pop $R8
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Off the PATH, unless this is an update, which puts the new version in the same place.
  ${If} $UpdateMode <> 1
    nsExec::ExecToLog '"$INSTDIR\bin\arden-code.exe" --remove-from-path'
    Pop $R8
  ${EndIf}
  Delete "$INSTDIR\bin\arden-code.exe"
  RmDir "$INSTDIR\bin"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
