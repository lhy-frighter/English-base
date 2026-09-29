Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = appDir
WshShell.Run "cmd /c cd /d """ & appDir & """ && """ & appDir & "\node_modules\electron\dist\electron.exe"" .", 0, False
