// ShareHelper.exe — invokes the official Windows Share Contract for a Win32 host.
//
// The NJ India app runs inside WebView2 (pywebview), which does NOT expose the
// Web Share API (navigator.share is undefined there), so files can never be
// attached from JavaScript. This standalone helper performs the share natively:
// it creates a foreground window, gets the per-window DataTransferManager via
// IDataTransferManagerInterop, attaches the given files as real StorageItems on
// the DataPackage, and shows the same native Windows Share flyout. Target apps
// (WhatsApp, Mail, Teams) then receive actual PDF file objects.
//
// Usage:  ShareHelper.exe "Title text" file1.pdf file2.pdf ...
// Logs:   %LOCALAPPDATA%\NJ India Data\share_helper.log
//
// Compiled with the in-box .NET Framework csc.exe against the OS WinRT metadata
// (C:\Windows\System32\WinMetadata). No SDK or extra runtime required — .NET
// Framework 4.x ships with every Windows 10/11.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;
using Windows.Storage;

internal static class ShareHelper
{
    // ── IDataTransferManagerInterop: lets a Win32 (HWND) app reach the Share UI.
    [ComImport]
    [Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDataTransferManagerInterop
    {
        [return: MarshalAs(UnmanagedType.IInspectable)]
        object GetForWindow([In] IntPtr appWindow, [In] ref Guid riid);

        void ShowShareUIForWindow([In] IntPtr appWindow);
    }

    // IID of Windows.ApplicationModel.DataTransfer.IDataTransferManager
    private static Guid _iidDtm = new Guid("A5CAEE9B-8708-49D1-8D36-67D25A8DA00C");

    // ── Minimal Win32 interop to create + show a real top-level window. ─────────
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowExW(uint exStyle, string className, string windowName,
        uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);

    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetMessageW(out MSG msg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr DispatchMessageW(ref MSG msg);
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

    private const uint WM_QUIT = 0x0012;

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam;
        public uint time; public int x; public int y;
    }

    private const uint WS_POPUP = 0x80000000;
    private const uint WS_VISIBLE = 0x10000000;
    private const uint WS_EX_TOOLWINDOW = 0x00000080;
    private const uint WS_EX_TOPMOST = 0x00000008;

    private static readonly List<string> Files = new List<string>();
    private static readonly List<IStorageItem> Items = new List<IStorageItem>(); // preloaded StorageFiles
    private static string _title = "NJ India — Documents";
    private static volatile bool _dataSet;
    private static IntPtr _hwnd;
    private static uint _mainThreadId;
    private static string _logPath;

    // Kept alive for the whole process: if the DataTransferManager RCW or the
    // interop factory were collected, the native DataRequested subscription would
    // be dropped and the flyout would show nothing (intermittent, GC-timing bug).
    private static IDataTransferManagerInterop _interop;
    private static DataTransferManager _dtm;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string dataDir = Environment.GetEnvironmentVariable("NJ_DATA_DIR");
            if (string.IsNullOrEmpty(dataDir))
                dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NJ India Data");
            Directory.CreateDirectory(dataDir);
            _logPath = Path.Combine(dataDir, "share_helper.log");
        }
        catch { /* logging is best-effort */ }

        _mainThreadId = GetCurrentThreadId();

        if (args.Length >= 1) _title = args[0];
        for (int i = 1; i < args.Length; i++)
        {
            string f = args[i];
            bool exists = File.Exists(f);
            long size = exists ? new FileInfo(f).Length : -1;
            Log("arg file: " + f + " exists=" + exists + " size=" + size);
            if (exists) Files.Add(f);
        }

        if (Files.Count == 0)
        {
            Log("ERROR: no existing files to share; exiting.");
            return 2;
        }

        Log("Share starting. title=\"" + _title + "\" files=" + Files.Count);

        // A real, foreground top-level window is required: GetForWindow returns the
        // DataTransferManager bound to it, and ShowShareUIForWindow anchors the
        // flyout to it. A tiny topmost tool window centred on screen is enough.
        int sw = GetSystemMetrics(0), sh = GetSystemMetrics(1);
        _hwnd = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_TOPMOST, "STATIC", "NJ India — Share",
            WS_POPUP | WS_VISIBLE, sw / 2 - 1, sh / 2 - 1, 1, 1,
            IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (_hwnd == IntPtr.Zero)
        {
            Log("ERROR: CreateWindowExW failed err=" + Marshal.GetLastWin32Error());
            return 3;
        }
        ShowWindow(_hwnd, 5 /*SW_SHOW*/);
        ForceForeground(_hwnd);
        Log("foreground check: isForeground=" + (GetForegroundWindow() == _hwnd));

        try
        {
            _interop = (IDataTransferManagerInterop)System.Runtime.InteropServices.WindowsRuntime
                .WindowsRuntimeMarshal.GetActivationFactory(typeof(DataTransferManager));
            _dtm = (DataTransferManager)_interop.GetForWindow(_hwnd, ref _iidDtm);
            Log("GetForWindow OK");
        }
        catch (Exception ex)
        {
            Log("ERROR getting DataTransferManager: " + ex);
            DestroyWindow(_hwnd);
            return 4;
        }

        // Preload the files as StorageItems synchronously, on this STA thread,
        // BEFORE showing the share UI. Filling the package up-front (instead of
        // inside DataRequested via async callbacks on a thread-pool thread) means it
        // can be populated instantly and entirely on the UI thread when the flyout
        // asks — no deferral, no cross-thread COM, no race that could hand the target
        // an empty package.
        PreloadStorageItems();
        if (Items.Count == 0)
        {
            Log("ERROR: no StorageFiles could be loaded; nothing to share. Exiting.");
            DestroyWindow(_hwnd);
            return 6;
        }

        _dtm.DataRequested += OnDataRequested;
        _dtm.TargetApplicationChosen += (s, e) =>
        {
            // Do NOT quit here. This fires the instant the user clicks a target tile
            // — long before that target has actually pulled the files (they still
            // have to pick a chat/recipient and press send). Exiting now tears down
            // the DataPackage and the share arrives empty / "file not found". We wait
            // for DataPackage.Destroyed (target finished) or the safety timeout.
            Log("Target chosen: " + e.ApplicationName);
        };
        Log("DataRequested handler subscribed");

        // Overall safety net: only used if the user dismisses the flyout without
        // choosing a target (no Destroyed event). Generous, because this process
        // must outlive a slow target (e.g. WhatsApp Desktop) reading the files. The
        // temp files persist regardless.
        ScheduleQuit(240000);

        try
        {
            _interop.ShowShareUIForWindow(_hwnd);
            Log("ShowShareUIForWindow invoked");
        }
        catch (Exception ex)
        {
            Log("ERROR ShowShareUIForWindow: " + ex);
            DestroyWindow(_hwnd);
            return 5;
        }

        // STA message pump — required for the flyout + DataRequested to fire.
        MSG msg;
        while (GetMessageW(out msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }

        Log("Exiting. dataSet=" + _dataSet);
        GC.KeepAlive(_dtm);
        GC.KeepAlive(_interop);
        try { DestroyWindow(_hwnd); } catch { }
        return _dataSet ? 0 : 1;
    }

    // The package is filled synchronously from the already-loaded StorageItems (see
    // PreloadStorageItems). No deferral and no async work inside the handler: the
    // flyout receives a fully-populated package the moment it asks, which is what
    // guarantees the files are actually attached.
    private static void OnDataRequested(DataTransferManager sender, DataRequestedEventArgs e)
    {
        Log("DataRequested fired");
        DataRequest request = e.Request;
        try
        {
            DataPackage data = request.Data;
            data.Properties.Title = _title;
            data.Properties.Description = Items.Count == 1
                ? Path.GetFileName(Files[0])
                : Items.Count + " documents from NJ India";
            data.SetStorageItems(Items);
            _dataSet = true;
            Log("SetStorageItems OK — attached " + Items.Count + " file(s).");

            // Destroyed is the genuine "target is done with the data" signal. The
            // shared StorageItems are owned by THIS process, so we stay alive until
            // then — exiting earlier is what made shares arrive empty.
            data.Destroyed += (s, a) =>
            {
                Log("DataPackage Destroyed — target finished; scheduling exit.");
                ScheduleQuit(3000);
            };
            data.OperationCompleted += (s, a) => Log("OperationCompleted — share reported complete.");
        }
        catch (Exception ex)
        {
            Log("ERROR in DataRequested: " + ex);
        }
    }

    // Load every file as a StorageFile, blocking on the projected async op via a
    // reset event (the winmd-projected IAsyncOperation does not bind to the
    // GetAwaiter extension under csc, so we cannot await it). Done once, up-front,
    // before the share UI is shown.
    private static void PreloadStorageItems()
    {
        foreach (string path in Files)
        {
            try
            {
                StorageFile loaded = null;
                using (var done = new ManualResetEventSlim(false))
                {
                    IAsyncOperation<StorageFile> op = StorageFile.GetFileFromPathAsync(path);
                    op.Completed = (asyncOp, status) =>
                    {
                        try
                        {
                            if (status == AsyncStatus.Completed) loaded = asyncOp.GetResults();
                            else Log("StorageFile FAILED (" + status + "): " + path);
                        }
                        catch (Exception ex) { Log("StorageFile EXCEPTION for " + path + ": " + ex); }
                        finally { done.Set(); }
                    };
                    if (!done.Wait(15000)) { Log("StorageFile TIMEOUT loading: " + path); continue; }
                }
                if (loaded != null)
                {
                    Items.Add(loaded);
                    Log("StorageFile preloaded: " + path);
                }
            }
            catch (Exception ex)
            {
                Log("StorageFile load error for " + path + ": " + ex);
            }
        }
    }

    // The Share flyout only raises DataRequested once its anchor window is the
    // genuine foreground window. A process launched in the background is normally
    // blocked from stealing foreground, so attach to the current foreground
    // thread's input queue first — the standard way to bypass that lock.
    private static void ForceForeground(IntPtr hWnd)
    {
        try
        {
            uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
            uint thisThread = GetCurrentThreadId();
            bool attached = fgThread != 0 && fgThread != thisThread && AttachThreadInput(thisThread, fgThread, true);
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
            ShowWindow(hWnd, 5 /*SW_SHOW*/);
            if (attached) AttachThreadInput(thisThread, fgThread, false);
        }
        catch { SetForegroundWindow(hWnd); }
    }

    private static void ScheduleQuit(int millis)
    {
        var t = new Thread(() =>
        {
            Thread.Sleep(millis);
            try { PostThreadMessageW(_mainThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero); } catch { }
        });
        t.IsBackground = true;
        t.Start();
    }

    private static void Log(string message)
    {
        try
        {
            if (_logPath == null) return;
            File.AppendAllText(_logPath,
                string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}{2}", DateTime.Now, message, Environment.NewLine));
        }
        catch { /* never let logging break sharing */ }
    }
}
