' iniciar-app.vbs - Alvo do atalho do CutCut na area de trabalho (D-432).
'
' Existe por um motivo unico: rodar o iniciar-app.ps1 SEM console. O
' -WindowStyle Hidden do PowerShell ainda pisca uma janela preta; o Run do
' WScript.Shell com janela 0 nao pisca nada. O False no fim diz "nao espere":
' o VBS morre na hora e quem segue de pe e o PowerShell.
Option Explicit

Dim shell, fso, base, comando
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
comando = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & base & "\iniciar-app.ps1"""

shell.Run comando, 0, False
