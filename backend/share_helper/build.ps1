# Compiles ShareHelper.exe with the in-box .NET Framework C# compiler against the
# OS WinRT metadata. No SDK or extra runtime required (.NET Framework 4.x ships
# with Windows 10/11). Invoked by the installer build and usable standalone.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64\v4.*\csc.exe" -ErrorAction SilentlyContinue |
       Sort-Object FullName -Descending | Select-Object -First 1
if (-not $csc) { $csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework\v4.*\csc.exe" | Sort-Object FullName -Descending | Select-Object -First 1 }
if (-not $csc) { Write-Error "csc.exe (.NET Framework 4.x) not found"; exit 1 }
$fw = Split-Path -Parent $csc.FullName
$wm = "C:\Windows\System32\WinMetadata"
$facade = (Get-ChildItem "C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.WindowsRuntime\*\System.Runtime.WindowsRuntime.dll" | Select-Object -First 1).FullName
$src = Join-Path $here "ShareHelper.cs"
$out = Join-Path $here "ShareHelper.exe"
if (Test-Path $out) { Remove-Item $out -Force }

& $csc.FullName /nologo /target:winexe /platform:x64 /out:$out `
  /r:"$wm\Windows.Foundation.winmd" /r:"$wm\Windows.Storage.winmd" /r:"$wm\Windows.ApplicationModel.winmd" `
  /r:"$facade" /r:"$fw\System.Runtime.dll" /r:"$fw\System.Runtime.InteropServices.WindowsRuntime.dll" `
  $src
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) { Write-Error "ShareHelper compile failed"; exit 1 }
Write-Output "Built $out ($((Get-Item $out).Length) bytes)"
