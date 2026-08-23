' .pbd / .json 블록도 파일을 특허 블록도 에디터로 여는 런처
' 사용: wscript open-pbd.vbs "C:\...\도면1.pbd"   (인자 없으면 빈 도면으로 실행)
Set sh = CreateObject("WScript.Shell")
appDir = "C:\Users\IPLAB\Desktop\patent-block-diagram"
sh.CurrentDirectory = appDir

cmd = """" & appDir & "\node_modules\.bin\electron.cmd"" """ & appDir & """"
If WScript.Arguments.Count > 0 Then
  cmd = cmd & " """ & WScript.Arguments(0) & """"
End If

sh.Run cmd, 0, False
