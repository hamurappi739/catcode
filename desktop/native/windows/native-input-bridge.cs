using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;

/// <summary>
/// V6-INPUT-M6 production native input bridge (Windows).
/// Owns WH_KEYBOARD_LL / WH_MOUSE_LL in this EXE module.
/// Creates a per-run named-pipe server ACL'd to the current user SID,
/// requires a hello handshake before hooks/events, and never logs key contents.
/// </summary>
internal static class NativeInputBridge
{
    private const string HelperVersion = "2";
    private const int ProtocolVersion = 1;
    private const int WhKeyboardLl = 13;
    private const int WhMouseLl = 14;
    private const int WmKeyDown = 0x0100;
    private const int WmSysKeyDown = 0x0104;
    private const int WmMouseWheel = 0x020A;
    private const uint LlkhfInjected = 0x00000010;
    private const uint LlmhfInjected = 0x00000001;
    private const int MaxLineBytes = 512;

    private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookExW(
        int idHook,
        LowLevelProc lpfn,
        IntPtr hMod,
        uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandleW(string lpModuleName);

    [DllImport("kernel32.dll")]
    private static extern void SetLastError(uint dwErrCode);

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT
    {
        public int ptX;
        public int ptY;
        public uint mouseData;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    private static readonly object Gate = new object();
    private static readonly LowLevelProc KeyboardProc = OnKeyboard;
    private static readonly LowLevelProc MouseProc = OnMouse;

    private static StreamWriter PipeWriter;
    private static IntPtr KeyboardHook = IntPtr.Zero;
    private static IntPtr MouseHook = IntPtr.Zero;
    private static volatile bool Running;
    private static volatile bool EventsArmed;

    private static void WriteLine(string json)
    {
        lock (Gate)
        {
            if (PipeWriter == null) return;
            try
            {
                PipeWriter.WriteLine(json);
                PipeWriter.Flush();
            }
            catch
            {
                RequestExit();
            }
        }
    }

    private static void RequestExit()
    {
        Running = false;
        EventsArmed = false;
        try { PostQuitMessage(0); } catch { }
    }

    private static IntPtr OnKeyboard(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && Running && EventsArmed)
        {
            int msg = wParam.ToInt32();
            if (msg == WmKeyDown || msg == WmSysKeyDown)
            {
                KBDLLHOOKSTRUCT info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                if ((info.flags & LlkhfInjected) == 0)
                {
                    WriteLine("{\"v\":1,\"type\":\"key\"}");
                }
            }
        }
        return CallNextHookEx(KeyboardHook, nCode, wParam, lParam);
    }

    private static IntPtr OnMouse(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && Running && EventsArmed && wParam.ToInt32() == WmMouseWheel)
        {
            MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            if ((info.flags & LlmhfInjected) == 0)
            {
                short delta = (short)((info.mouseData >> 16) & 0xffff);
                if (delta != 0)
                {
                    int direction = delta > 0 ? 1 : -1;
                    WriteLine(
                        "{\"v\":1,\"type\":\"wheel\",\"direction\":" +
                        direction.ToString(CultureInfo.InvariantCulture) +
                        "}");
                }
            }
        }
        return CallNextHookEx(MouseHook, nCode, wParam, lParam);
    }

    private static string JsonEscape(string value)
    {
        if (value == null) return "";
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "")
            .Replace("\n", " ");
    }

    private static string ErrorText(int code)
    {
        if (code == 0) return "";
        try
        {
            string msg = new Win32Exception(code).Message;
            if (msg == null) return "";
            if (msg.Length > 200) return msg.Substring(0, 200);
            return msg;
        }
        catch
        {
            return "";
        }
    }

    private static int ParseArgs(
        string[] args,
        out string pipeName,
        out string token,
        out int durationMs)
    {
        pipeName = null;
        token = null;
        durationMs = 0;
        for (int i = 0; i < args.Length; i++)
        {
            if ((args[i] == "--pipe" || args[i] == "-p") && i + 1 < args.Length)
            {
                pipeName = args[++i];
            }
            else if ((args[i] == "--token" || args[i] == "-t") && i + 1 < args.Length)
            {
                token = args[++i];
            }
            else if ((args[i] == "--duration-ms" || args[i] == "-d") && i + 1 < args.Length)
            {
                int.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out durationMs);
            }
        }
        if (string.IsNullOrEmpty(pipeName)) return 2;
        if (string.IsNullOrEmpty(token) || token.Length < 16) return 2;
        if (durationMs < 0) durationMs = 0;
        if (durationMs > 3600000) durationMs = 3600000;
        return 0;
    }

    private static bool LooksLikeHello(string line, string expectedToken)
    {
        if (string.IsNullOrEmpty(line) || line.Length > MaxLineBytes) return false;
        // Minimal allowlisted hello: {"v":1,"type":"hello","token":"..."}
        if (line.IndexOf("\"type\":\"hello\"", StringComparison.Ordinal) < 0 &&
            line.IndexOf("\"type\": \"hello\"", StringComparison.Ordinal) < 0)
        {
            return false;
        }
        if (line.IndexOf("\"v\":1", StringComparison.Ordinal) < 0 &&
            line.IndexOf("\"v\": 1", StringComparison.Ordinal) < 0)
        {
            return false;
        }
        string needle = "\"token\":\"" + expectedToken + "\"";
        string needleSpaced = "\"token\": \"" + expectedToken + "\"";
        return line.IndexOf(needle, StringComparison.Ordinal) >= 0
            || line.IndexOf(needleSpaced, StringComparison.Ordinal) >= 0;
    }

    private static bool LooksLikeShutdown(string line)
    {
        if (string.IsNullOrEmpty(line) || line.Length > MaxLineBytes) return false;
        return (line.IndexOf("\"type\":\"shutdown\"", StringComparison.Ordinal) >= 0
                || line.IndexOf("\"type\": \"shutdown\"", StringComparison.Ordinal) >= 0)
            && (line.IndexOf("\"v\":1", StringComparison.Ordinal) >= 0
                || line.IndexOf("\"v\": 1", StringComparison.Ordinal) >= 0);
    }

    private static NamedPipeServerStream CreateAclServer(string pipeName)
    {
        // ACL: current user SID only (FullControl). No world/Everyone ACE.
        // Pipe is local (".") — not exposed as a remote SMB named pipe endpoint.
        PipeSecurity security = new PipeSecurity();
        SecurityIdentifier userSid = WindowsIdentity.GetCurrent().User;
        if (userSid == null)
        {
            throw new InvalidOperationException("current user SID unavailable");
        }
        security.AddAccessRule(new PipeAccessRule(
            userSid,
            PipeAccessRights.FullControl,
            AccessControlType.Allow));

        return new NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            4096,
            4096,
            security);
    }

    [STAThread]
    public static int Main(string[] args)
    {
        string pipeName;
        string token;
        int durationMs;
        int parse = ParseArgs(args, out pipeName, out token, out durationMs);
        if (parse != 0) return parse;

        const string prefix = @"\\.\pipe\";
        if (pipeName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            pipeName = pipeName.Substring(prefix.Length);
        }
        if (!pipeName.StartsWith("catcode-m6-", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }

        NamedPipeServerStream pipe = null;
        StreamReader reader = null;
        try
        {
            pipe = CreateAclServer(pipeName);
            // Wait for the Electron parent (only expected local client).
            IAsyncResult wait = pipe.BeginWaitForConnection(null, null);
            if (!wait.AsyncWaitHandle.WaitOne(15000))
            {
                return 6;
            }
            pipe.EndWaitForConnection(wait);

            reader = new StreamReader(pipe, new UTF8Encoding(false), false, 1024, true);
            PipeWriter = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true)
            {
                AutoFlush = true,
                NewLine = "\n",
            };

            // Handshake before any hooks or events.
            string helloLine = reader.ReadLine();
            if (!LooksLikeHello(helloLine, token))
            {
                return 7;
            }
            WriteLine(
                "{\"v\":" + ProtocolVersion.ToString(CultureInfo.InvariantCulture) +
                ",\"type\":\"hello-ack\",\"helperVersion\":\"" + HelperVersion +
                "\",\"injectedEventsSkipped\":true}");

            IntPtr hMod = GetModuleHandleW(null);
            if (hMod == IntPtr.Zero)
            {
                int err = Marshal.GetLastWin32Error();
                WriteLine(
                    "{\"v\":1,\"type\":\"status\",\"helperVersion\":\"" + HelperVersion +
                    "\",\"keyboardOk\":false,\"mouseOk\":false,\"keyboardError\":" +
                    err.ToString(CultureInfo.InvariantCulture) +
                    ",\"mouseError\":" + err.ToString(CultureInfo.InvariantCulture) +
                    ",\"keyboardErrorText\":\"" + JsonEscape(ErrorText(err)) +
                    "\",\"mouseErrorText\":\"" + JsonEscape(ErrorText(err)) +
                    "\",\"hModObtained\":false}");
                return 3;
            }

            SetLastError(0);
            KeyboardHook = SetWindowsHookExW(WhKeyboardLl, KeyboardProc, hMod, 0);
            int keyboardError = KeyboardHook != IntPtr.Zero ? 0 : Marshal.GetLastWin32Error();

            SetLastError(0);
            MouseHook = SetWindowsHookExW(WhMouseLl, MouseProc, hMod, 0);
            int mouseError = MouseHook != IntPtr.Zero ? 0 : Marshal.GetLastWin32Error();

            bool keyboardOk = KeyboardHook != IntPtr.Zero;
            bool mouseOk = MouseHook != IntPtr.Zero;

            WriteLine(
                "{\"v\":1,\"type\":\"status\",\"helperVersion\":\"" + HelperVersion +
                "\",\"keyboardOk\":" + (keyboardOk ? "true" : "false") +
                ",\"mouseOk\":" + (mouseOk ? "true" : "false") +
                ",\"keyboardError\":" + keyboardError.ToString(CultureInfo.InvariantCulture) +
                ",\"mouseError\":" + mouseError.ToString(CultureInfo.InvariantCulture) +
                ",\"keyboardErrorText\":\"" + JsonEscape(ErrorText(keyboardError)) +
                "\",\"mouseErrorText\":\"" + JsonEscape(ErrorText(mouseError)) +
                "\",\"hModObtained\":true,\"injectedEventsSkipped\":true}");

            if (!keyboardOk && !mouseOk)
            {
                CleanupHooks();
                return 4;
            }

            Running = true;
            EventsArmed = true;

            if (durationMs > 0)
            {
                Thread timer = new Thread(() =>
                {
                    try { Thread.Sleep(durationMs); }
                    catch { }
                    RequestExit();
                });
                timer.IsBackground = true;
                timer.Start();
            }

            Thread readerThread = new Thread(() =>
            {
                try
                {
                    while (Running)
                    {
                        string line = reader.ReadLine();
                        if (line == null)
                        {
                            RequestExit();
                            break;
                        }
                        if (LooksLikeShutdown(line))
                        {
                            RequestExit();
                            break;
                        }
                    }
                }
                catch
                {
                    RequestExit();
                }
            });
            readerThread.IsBackground = true;
            readerThread.Start();

            MSG msg;
            while (Running && GetMessage(out msg, IntPtr.Zero, 0, 0))
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            EventsArmed = false;
            WriteLine("{\"v\":1,\"type\":\"bye\"}");
            CleanupHooks();
            return (keyboardOk || mouseOk) ? 0 : 4;
        }
        catch
        {
            CleanupHooks();
            return 5;
        }
        finally
        {
            EventsArmed = false;
            Running = false;
            try
            {
                if (PipeWriter != null) PipeWriter.Dispose();
            }
            catch { }
            PipeWriter = null;
            try
            {
                if (reader != null) reader.Dispose();
            }
            catch { }
            try
            {
                if (pipe != null) pipe.Dispose();
            }
            catch { }
        }
    }

    private static void CleanupHooks()
    {
        if (KeyboardHook != IntPtr.Zero)
        {
            try { UnhookWindowsHookEx(KeyboardHook); } catch { }
            KeyboardHook = IntPtr.Zero;
        }
        if (MouseHook != IntPtr.Zero)
        {
            try { UnhookWindowsHookEx(MouseHook); } catch { }
            MouseHook = IntPtr.Zero;
        }
    }
}
