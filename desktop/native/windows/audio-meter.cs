using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

internal enum EDataFlow
{
    Render = 0,
    Capture = 1,
    All = 2
}

internal enum ERole
{
    Console = 0,
    Multimedia = 1,
    Communications = 2
}

[Flags]
internal enum ClsCtx : uint
{
    InprocServer = 0x1,
    InprocHandler = 0x2,
    LocalServer = 0x4,
    RemoteServer = 0x10,
    All = InprocServer | InprocHandler | LocalServer | RemoteServer
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    int Activate(ref Guid iid, ClsCtx clsCtx, IntPtr activationParams,
        [MarshalAs(UnmanagedType.IUnknown)] out object interfaceObject);
    int OpenPropertyStore(uint access, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out uint state);
}

[ComImport]
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioMeterInformation
{
    int GetPeakValue(out float peak);
    int GetMeteringChannelCount(out int channelCount);
    int GetChannelsPeakValues(int channelCount, [Out] float[] peaks);
    int QueryHardwareSupport(out int hardwareSupportMask);
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumerator
{
}

internal static class AudioMeter
{
    private static IAudioMeterInformation OpenDefaultMeter()
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice device;
        object meterObject;
        Guid meterId = typeof(IAudioMeterInformation).GUID;
        int result = enumerator.GetDefaultAudioEndpoint(
            EDataFlow.Render,
            ERole.Multimedia,
            out device
        );
        if (result != 0) Marshal.ThrowExceptionForHR(result);
        result = device.Activate(ref meterId, ClsCtx.All, IntPtr.Zero, out meterObject);
        if (result != 0) Marshal.ThrowExceptionForHR(result);
        return (IAudioMeterInformation)meterObject;
    }

    public static int Main()
    {
        Console.Out.Flush();
        IAudioMeterInformation meter = null;
        while (true)
        {
            try
            {
                if (meter == null) meter = OpenDefaultMeter();
                float peak;
                int result = meter.GetPeakValue(out peak);
                if (result != 0) Marshal.ThrowExceptionForHR(result);
                Console.WriteLine(peak.ToString("0.0000", CultureInfo.InvariantCulture));
                Console.Out.Flush();
                Thread.Sleep(80);
            }
            catch
            {
                if (meter != null && Marshal.IsComObject(meter))
                {
                    try { Marshal.FinalReleaseComObject(meter); } catch { }
                }
                meter = null;
                Console.WriteLine("0.0000");
                Console.Out.Flush();
                Thread.Sleep(1000);
            }
        }
    }
}
