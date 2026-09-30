; Extra steps for the installer and the uninstaller. Tauri's NSIS template calls these macros.

!include "WinVer.nsh"

; Arden Code needs Windows 11. Windows 10 gets a message and nothing is installed.
!macro NSIS_HOOK_PREINSTALL
  ${IfNot} ${AtLeastBuild} 22000
    MessageBox MB_OK|MB_ICONSTOP "$(windows11Required)" /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
