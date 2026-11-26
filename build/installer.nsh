; Custom NSIS hooks for BABA Tunnel installer & uninstaller
; On genuine uninstall (not update), cleanly remove the Windows Task Scheduler auto-start entry
; and any leftover IPv6 block firewall rule.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "BABA Tunnel AutoStart" /F'
    nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BBT-Tunnel-IPv6-Block"'
  ${endIf}
!macroend
