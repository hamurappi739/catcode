using System;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class CursorWarp
{
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    private static bool TryMove(string xText, string yText)
    {
        int x;
        int y;
        if (!int.TryParse(xText, NumberStyles.Integer, CultureInfo.InvariantCulture, out x) ||
            !int.TryParse(yText, NumberStyles.Integer, CultureInfo.InvariantCulture, out y))
        {
            return false;
        }
        return SetCursorPos(x, y);
    }

    public static int Main(string[] args)
    {
        if (args.Length >= 2)
        {
            return TryMove(args[0], args[1]) ? 0 : 1;
        }

        string line;
        while ((line = Console.ReadLine()) != null)
        {
            string[] parts = line.Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                TryMove(parts[0], parts[1]);
            }
        }
        return 0;
    }
}
