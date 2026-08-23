' .pbd / .json 블록도 파일을 특허 블록도 에디터로 여는 런처
' 사용: wscript open-pbd.vbs "C:\...\도면1.pbd"   (인자 없으면 빈 도면으로 실행)
' 앱 경로는 이 스크립트가 놓인 폴더로 자동 결정한다.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appDir

cmd = """" & appDir & "\node_modules\.bin\electron.cmd"" """ & appDir & """"
If WScript.Arguments.Count > 0 Then
  cmd = cmd & " """ & WScript.Arguments(0) & """"
End If

sh.Run cmd, 0, False
