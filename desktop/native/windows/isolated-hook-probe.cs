using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

/// <summary>
/// V6-INPUT-M2: isolated WH_KEYBOARD_LL / WH_MOUSE_LL install probe.
/// Installs each hook only long enough to measure SetWindowsHookExW + GetLastError,
/// then UnhookWindowsHookEx. Never inspects event payloads.
/// </summary>
internal static class IsolatedHookProbe
{
    private const string HelperVersion = "1";
    private const string ProbeId = "v6-input-m2-isolated-hooks";
    private const string ResultFileName = "v6-input-hook-isolated-m2.json";
    private const int WhKeyboardLl = 13;
    private const int WhMouseLl = 14;

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

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    // Keep a rooted delegate so the GC cannot collect the callback while a hook is installed.
    private static readonly LowLevelProc NoOpProc = OnLowLevel;

    private static IntPtr OnLowLevel(int nCode, IntPtr wParam, IntPtr lParam)
    {
        // Intentionally ignore nCode/wParam/lParam contents. Forward only.
        return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    private sealed class AttemptResult
    {
        public string kind;
        public string phase;
        public bool installSucceeded;
        public int lastError;
        public string lastErrorHex;
        public string lastErrorText;
        public bool? unhookSucceeded;
        public int? unhookLastError;
    }

    private static AttemptResult TryInstall(string kind, string phase, int idHook, IntPtr hMod)
    {
        SetLastError(0);
        IntPtr hook = SetWindowsHookExW(idHook, NoOpProc, hMod, 0);
        int err = Marshal.GetLastWin32Error();
        bool ok = hook != IntPtr.Zero;

        bool? unhookOk = null;
        int? unhookErr = null;
        if (ok)
        {
            SetLastError(0);
            unhookOk = UnhookWindowsHookEx(hook);
            unhookErr = Marshal.GetLastWin32Error();
        }

        return new AttemptResult
        {
            kind = kind,
            phase = phase,
            installSucceeded = ok,
            lastError = ok ? 0 : err,
            lastErrorHex = "0x" + (ok ? 0 : err).ToString("X", CultureInfo.InvariantCulture),
            lastErrorText = ok ? null : SafeErrorText(err),
            unhookSucceeded = unhookOk,
            unhookLastError = unhookOk == true ? 0 : unhookErr,
        };
    }

    private static string SafeErrorText(int code)
    {
        try
        {
            string msg = new Win32Exception(code).Message;
            if (string.IsNullOrEmpty(msg)) return null;
            if (msg.Length > 240) return msg.Substring(0, 240);
            return msg;
        }
        catch
        {
            return null;
        }
    }

    private static string JsonEscape(string value)
    {
        if (value == null) return "null";
        var sb = new StringBuilder();
        sb.Append('"');
        foreach (char ch in value)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < 0x20) sb.AppendFormat(CultureInfo.InvariantCulture, "\\u{0:x4}", (int)ch);
                    else sb.Append(ch);
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    private static string BoolJson(bool? value)
    {
        if (value == null) return "null";
        return value.Value ? "true" : "false";
    }

    private static string AttemptJson(AttemptResult a)
    {
        var sb = new StringBuilder();
        sb.Append("{");
        sb.Append("\"kind\":").Append(JsonEscape(a.kind)).Append(",");
        sb.Append("\"phase\":").Append(JsonEscape(a.phase)).Append(",");
        sb.Append("\"installSucceeded\":").Append(a.installSucceeded ? "true" : "false").Append(",");
        sb.Append("\"lastError\":").Append(a.lastError.ToString(CultureInfo.InvariantCulture)).Append(",");
        sb.Append("\"lastErrorHex\":").Append(JsonEscape(a.lastErrorHex)).Append(",");
        sb.Append("\"lastErrorText\":").Append(JsonEscape(a.lastErrorText)).Append(",");
        sb.Append("\"unhookSucceeded\":").Append(BoolJson(a.unhookSucceeded)).Append(",");
        if (a.unhookLastError == null) sb.Append("\"unhookLastError\":null");
        else sb.Append("\"unhookLastError\":").Append(a.unhookLastError.Value.ToString(CultureInfo.InvariantCulture));
        sb.Append("}");
        return sb.ToString();
    }

    private static bool IsElevated()
    {
        try
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }
        catch
        {
            return false;
        }
    }

    private static string ResolveResultPath()
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "CatCode", "logs", ResultFileName);
    }

    public static int Main(string[] args)
    {
        string helperPath = null;
        try
        {
            helperPath = Path.GetFullPath(Environment.GetCommandLineArgs()[0]);
        }
        catch
        {
            helperPath = "unknown";
        }

        // hMod strategy: GetModuleHandleW(NULL) returns the probe EXE module handle.
        // Valid for WH_*_LL when the callback lives in this process (same approach as
        // libuiohook's fallback when DllMain hInst is unset). We do not pass raw pointer values.
        SetLastError(0);
        IntPtr hMod = GetModuleHandleW(null);
        int hModError = Marshal.GetLastWin32Error();
        bool hModOk = hMod != IntPtr.Zero;

        AttemptResult keyboardOnly = null;
        AttemptResult mouseOnly = null;
        AttemptResult sequentialKeyboard = null;
        AttemptResult sequentialMouse = null;

        if (hModOk)
        {
            keyboardOnly = TryInstall("keyboard-ll", "keyboard-only", WhKeyboardLl, hMod);
            mouseOnly = TryInstall("mouse-ll", "mouse-only", WhMouseLl, hMod);
            sequentialKeyboard = TryInstall("keyboard-ll", "sequential-both", WhKeyboardLl, hMod);
            sequentialMouse = TryInstall("mouse-ll", "sequential-both", WhMouseLl, hMod);
        }

        string osVersion = Environment.OSVersion.VersionString;
        string osBuild = Environment.OSVersion.Version.ToString();
        string arch = Environment.Is64BitProcess ? "x64" : "x86";
        bool elevated = IsElevated();
        string timestamp = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);

        var json = new StringBuilder();
        json.Append("{\n");
        json.Append("  \"timestamp\": ").Append(JsonEscape(timestamp)).Append(",\n");
        json.Append("  \"probeId\": ").Append(JsonEscape(ProbeId)).Append(",\n");
        json.Append("  \"helperVersion\": ").Append(JsonEscape(HelperVersion)).Append(",\n");
        json.Append("  \"helperPath\": ").Append(JsonEscape(helperPath)).Append(",\n");
        json.Append("  \"platform\": \"win32\",\n");
        json.Append("  \"arch\": ").Append(JsonEscape(arch)).Append(",\n");
        json.Append("  \"osVersion\": ").Append(JsonEscape(osVersion)).Append(",\n");
        json.Append("  \"osBuild\": ").Append(JsonEscape(osBuild)).Append(",\n");
        json.Append("  \"elevated\": ").Append(elevated ? "true" : "false").Append(",\n");
        json.Append("  \"hModMethod\": ").Append(JsonEscape("GetModuleHandleW(NULL)")).Append(",\n");
        json.Append("  \"hModObtained\": ").Append(hModOk ? "true" : "false").Append(",\n");
        json.Append("  \"hModLastError\": ").Append(hModOk ? "0" : hModError.ToString(CultureInfo.InvariantCulture)).Append(",\n");
        json.Append("  \"attempts\": [\n");
        if (keyboardOnly != null)
        {
            json.Append("    ").Append(AttemptJson(keyboardOnly)).Append(",\n");
            json.Append("    ").Append(AttemptJson(mouseOnly)).Append(",\n");
            json.Append("    ").Append(AttemptJson(sequentialKeyboard)).Append(",\n");
            json.Append("    ").Append(AttemptJson(sequentialMouse)).Append("\n");
        }
        json.Append("  ],\n");
        json.Append("  \"summary\": {\n");
        if (keyboardOnly != null)
        {
            json.Append("    \"keyboardOnlySucceeded\": ").Append(keyboardOnly.installSucceeded ? "true" : "false").Append(",\n");
            json.Append("    \"mouseOnlySucceeded\": ").Append(mouseOnly.installSucceeded ? "true" : "false").Append(",\n");
            json.Append("    \"sequentialKeyboardSucceeded\": ").Append(sequentialKeyboard.installSucceeded ? "true" : "false").Append(",\n");
            json.Append("    \"sequentialMouseSucceeded\": ").Append(sequentialMouse.installSucceeded ? "true" : "false").Append(",\n");
            json.Append("    \"keyboardOnlyLastError\": ").Append(keyboardOnly.lastError.ToString(CultureInfo.InvariantCulture)).Append(",\n");
            json.Append("    \"mouseOnlyLastError\": ").Append(mouseOnly.lastError.ToString(CultureInfo.InvariantCulture)).Append("\n");
        }
        else
        {
            json.Append("    \"keyboardOnlySucceeded\": false,\n");
            json.Append("    \"mouseOnlySucceeded\": false,\n");
            json.Append("    \"sequentialKeyboardSucceeded\": false,\n");
            json.Append("    \"sequentialMouseSucceeded\": false,\n");
            json.Append("    \"keyboardOnlyLastError\": null,\n");
            json.Append("    \"mouseOnlyLastError\": null\n");
        }
        json.Append("  }\n");
        json.Append("}\n");

        string resultPath = ResolveResultPath();
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(resultPath));
            File.WriteAllText(resultPath, json.ToString(), new UTF8Encoding(false));
        }
        catch (Exception ex)
        {
            MessageBoxW(
                IntPtr.Zero,
                "Failed to write result JSON:\n" + ex.Message,
                "Isolated hook probe: error",
                0x00000010);
            return 2;
        }

        bool anySuccess = keyboardOnly != null &&
            (keyboardOnly.installSucceeded || mouseOnly.installSucceeded);
        string title = anySuccess
            ? "Isolated hook probe: partial/full success"
            : "Isolated hook probe: failed";
        string detail =
            "V6-INPUT-M2 finished.\n\n" +
            "Result file:\n" + resultPath + "\n\n" +
            (keyboardOnly == null
                ? "hMod could not be obtained.\n"
                : ("keyboard-only: " + (keyboardOnly.installSucceeded ? "OK" : ("FAIL " + keyboardOnly.lastErrorHex)) + "\n" +
                   "mouse-only: " + (mouseOnly.installSucceeded ? "OK" : ("FAIL " + mouseOnly.lastErrorHex)) + "\n"));

        MessageBoxW(IntPtr.Zero, detail, title, anySuccess ? 0x00000040u : 0x00000030u);
        return anySuccess ? 0 : 1;
    }
}
