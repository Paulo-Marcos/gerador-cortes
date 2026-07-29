' parar-app.vbs - Encerra os servicos deste checkout, sem console (D-432).
'
' Contrapartida do iniciar-app.vbs: rodando escondido nao ha Ctrl+C para dar.
' Chama o clean-dev.ps1, que so mata processo casado pelo caminho absoluto
' deste checkout (D-370) - o PROD e o DEV do lado nao sao tocados.
Option Explicit

Dim shell, fso, base, comando
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
comando = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & base & "\clean-dev.ps1"""

shell.Run comando, 0, False
