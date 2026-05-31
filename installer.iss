; ============================================================================
;  NJ India System — Inno Setup installer script
;  Compile with Inno Setup 6 (iscc.exe). The build_installer.bat script
;  prepares dist_build\app and dist_build\python before this runs.
;
;  Optional: place a 256x256 icon at installer\app.ico and uncomment the
;  SetupIconFile / IconFilename lines below for branded shortcuts.
; ============================================================================

[Setup]
AppName=NJ India System
AppVersion=1.0
AppPublisher=NJ India
DefaultDirName={autopf}\NJ India
DefaultGroupName=NJ India
DisableProgramGroupPage=yes
OutputDir=dist_build\Output
OutputBaseFilename=NJ India Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
; SetupIconFile=installer\app.ico
; UninstallDisplayIcon={app}\app\app.ico

[Files]
Source: "dist_build\app\*";    DestDir: "{app}\app";    Flags: recursesubdirs createallsubdirs ignoreversion
Source: "dist_build\python\*"; DestDir: "{app}\python"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\NJ India System";        Filename: "{app}\app\Start NJ India.bat"; WorkingDir: "{app}\app"
Name: "{commondesktop}\NJ India System"; Filename: "{app}\app\Start NJ India.bat"; WorkingDir: "{app}\app"
; To use a custom icon, add:  IconFilename: "{app}\app\app.ico"   to the lines above.

[Run]
Filename: "{app}\app\Start NJ India.bat"; Description: "Launch NJ India System now"; WorkingDir: "{app}\app"; Flags: nowait postinstall skipifsilent shellexec

[UninstallDelete]
; Remove only the program files. User data (%LOCALAPPDATA%\NJ India) and
; backups (Documents\NJ India Backups) are intentionally LEFT IN PLACE so the
; seller never loses data on uninstall/reinstall.
Type: filesandordirs; Name: "{app}\app\__pycache__"
