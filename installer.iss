; ===========================================================================
;  NJ India System - Inno Setup script
;
;  Produces the Cursor-style "Setup - NJ India System" wizard.
;  Built automatically by build_installer.bat step [4/5] via:  iscc installer.iss
;
;  Per-user install (no admin / no UAC) to %LOCALAPPDATA%\NJ India.
;  Everything is bundled (embedded Python + app), so target PCs need nothing.
;  Output: dist_build\Output\NJ India Setup.exe
; ===========================================================================

#define AppName "NJ India System"
#define AppVersion "1.0"
#define AppPublisher "NJ India Trading"

[Setup]
; A stable AppId lets future versions upgrade/uninstall cleanly. Do not change.
AppId={{31205D20-92CE-4113-B198-AD2A53D3A80A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\NJ India
DefaultGroupName={#AppName}
; Per-user, NO admin / NO UAC prompt - works on locked-down PCs.
PrivilegesRequired=lowest
; Minimal wizard, like the Cursor installer: no folder picker / no extra pages.
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
OutputDir={#SourcePath}\dist_build\Output
OutputBaseFilename=NJ India Setup
SetupIconFile={#SourcePath}\installer\app.ico
UninstallDisplayIcon={app}\app.ico
UninstallDisplayName=NJ India Trading
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Files]
; Package the entire staged build as-is (includes ShareHelper.exe, routers,
; templates, built React dist, etc.).
Source: "dist_build\app\*";    DestDir: "{app}\app";    Flags: recursesubdirs createallsubdirs ignoreversion
Source: "dist_build\python\*"; DestDir: "{app}\python"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "installer\app.ico";   DestDir: "{app}";        Flags: ignoreversion

[Icons]
; Desktop + Start-menu shortcuts launch pythonw.exe directly => native window,
; no console window, no .bat flash. Uses the NJ icon (app.ico).
Name: "{userdesktop}\NJ India System"; Filename: "{app}\python\pythonw.exe"; Parameters: "run_app.py"; WorkingDir: "{app}\app"; IconFilename: "{app}\app.ico"
Name: "{group}\NJ India System";       Filename: "{app}\python\pythonw.exe"; Parameters: "run_app.py"; WorkingDir: "{app}\app"; IconFilename: "{app}\app.ico"
Name: "{group}\Uninstall NJ India System"; Filename: "{uninstallexe}"

[Run]
; Auto-launch after install (the "Finish" step), like Cursor.
Filename: "{app}\python\pythonw.exe"; Parameters: "run_app.py"; WorkingDir: "{app}\app"; Description: "Launch NJ India System"; Flags: nowait postinstall skipifsilent
