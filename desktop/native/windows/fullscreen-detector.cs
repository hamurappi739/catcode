using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class FullscreenDetector
{
    private const uint MonitorDefaultToNearest = 2;
    private const int DwmExtendedFrameBounds = 9;
    private const int EdgeTolerancePx = 2;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MonitorInfo
    {
        public int Size;
        public Rect Monitor;
        public Rect WorkArea;
        public uint Flags;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(
        IntPtr window,
        out uint processId
    );

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int GetClassName(
        IntPtr window,
        StringBuilder className,
        int maxCount
    );

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr window,
        int attribute,
        out Rect value,
        int valueSize
    );

    private static bool ParentIsRunning(int parentProcessId)
    {
        if (parentProcessId <= 0)
        {
            return true;
        }

        try
        {
            return !Process.GetProcessById(parentProcessId).HasExited;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsShellWindow(IntPtr window)
    {
        StringBuilder className = new StringBuilder(128);
        if (GetClassName(window, className, className.Capacity) <= 0)
        {
            return false;
        }

        string value = className.ToString();
        return value == "Progman"
            || value == "WorkerW"
            || value == "Shell_TrayWnd"
            || value == "Shell_SecondaryTrayWnd";
    }

    private static bool EdgesMatch(Rect window, Rect monitor)
    {
        return Math.Abs(window.Left - monitor.Left) <= EdgeTolerancePx
            && Math.Abs(window.Top - monitor.Top) <= EdgeTolerancePx
            && Math.Abs(window.Right - monitor.Right) <= EdgeTolerancePx
            && Math.Abs(window.Bottom - monitor.Bottom) <= EdgeTolerancePx;
    }

    private static bool IsForegroundWindowFullscreen(int catCodeProcessId)
    {
        IntPtr window = GetForegroundWindow();
        if (window == IntPtr.Zero || !IsWindowVisible(window) || IsIconic(window))
        {
            return false;
        }

        uint ownerProcessId;
        GetWindowThreadProcessId(window, out ownerProcessId);
        if (ownerProcessId == 0 || ownerProcessId == catCodeProcessId)
        {
            return false;
        }

        if (IsShellWindow(window))
        {
            return false;
        }

        IntPtr monitor = MonitorFromWindow(window, MonitorDefaultToNearest);
        if (monitor == IntPtr.Zero)
        {
            return false;
        }

        MonitorInfo monitorInfo = new MonitorInfo();
        monitorInfo.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (!GetMonitorInfo(monitor, ref monitorInfo))
        {
            return false;
        }

        Rect windowRect;
        int dwmResult = DwmGetWindowAttribute(
            window,
            DwmExtendedFrameBounds,
            out windowRect,
            Marshal.SizeOf(typeof(Rect))
        );
        if (dwmResult != 0 && !GetWindowRect(window, out windowRect))
        {
            return false;
        }

        return EdgesMatch(windowRect, monitorInfo.Monitor);
    }

    private static int ParseParentProcessId(string[] args)
    {
        for (int index = 0; index + 1 < args.Length; index++)
        {
            if (args[index] == "--parent-pid")
            {
                int processId;
                if (int.TryParse(args[index + 1], out processId))
                {
                    return processId;
                }
            }
        }

        return 0;
    }

    public static int Main(string[] args)
    {
        int parentProcessId = ParseParentProcessId(args);
        bool? previousState = null;

        while (ParentIsRunning(parentProcessId))
        {
            bool isFullscreen = IsForegroundWindowFullscreen(parentProcessId);
            if (!previousState.HasValue || previousState.Value != isFullscreen)
            {
                Console.WriteLine(isFullscreen ? "1" : "0");
                Console.Out.Flush();
                previousState = isFullscreen;
            }

            Thread.Sleep(750);
        }

        return 0;
    }
}
