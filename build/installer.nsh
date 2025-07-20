!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\neolauncher-updater"
  ${endIf}
!macroend
