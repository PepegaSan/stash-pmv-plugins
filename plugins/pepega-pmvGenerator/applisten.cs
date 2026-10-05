// PMV Generator – "live" helper: hears ONE app on this PC (e.g. Spotify) and hands its sound to the
// generator in the browser. Games, Discord and everything else stay out: Windows' process loopback
// (Windows 10 build 20348+ / Windows 11) captures only the audio of that app and its child processes.
//
// backend.py compiles this file with the C# compiler that ships with Windows (.NET Framework 4) –
// so it's C# 5 – and starts it. It listens only on 127.0.0.1, every request needs the token:
//   GET /status?t=TOKEN  → {"app":"Spotify","running":true,"title":"Artist - Song","sound":true,"rate":48000}
//   GET /pcm?t=TOKEN     → endless stream of raw audio: 16-bit little-endian, mono, 48000 Hz
// It exits by itself when nobody has asked for a while (--idle seconds).
//
//   applisten.exe --port 51234 --token abc… --app Spotify [--idle 90] [--pid 1234]

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class AppListen
{
    const int Rate = 48000;
    static string token = "", app = "Spotify";
    static int port = 0, idleSec = 90, fixedPid = 0;
    static long lastAsk = DateTime.UtcNow.Ticks;
    static long lastSound = 0;
    static volatile bool running = false;
    static readonly List<Client> clients = new List<Client>();

    [MTAThread]
    static int Main(string[] args)
    {
        for (int i = 0; i + 1 < args.Length; i += 2)
        {
            if (args[i] == "--port") port = int.Parse(args[i + 1]);
            else if (args[i] == "--token") token = args[i + 1];
            else if (args[i] == "--app") app = args[i + 1];
            else if (args[i] == "--idle") idleSec = int.Parse(args[i + 1]);
            else if (args[i] == "--pid") fixedPid = int.Parse(args[i + 1]);
        }
        if (port <= 0 || token.Length < 16) { Console.Error.WriteLine("usage: --port N --token T --app NAME"); return 2; }
        var listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        new Thread(CaptureLoop) { IsBackground = true }.Start();
        new Thread(() =>
        {
            for (;;)
            {
                Thread.Sleep(2000);
                bool anyone;
                lock (clients) anyone = clients.Count > 0;
                if (!anyone && (DateTime.UtcNow.Ticks - Interlocked.Read(ref lastAsk)) / TimeSpan.TicksPerSecond > idleSec) Environment.Exit(0);
            }
        }) { IsBackground = true }.Start();
        for (;;)
        {
            TcpClient c = listener.AcceptTcpClient();
            new Thread(() => Serve(c)) { IsBackground = true }.Start();
        }
    }

    // ---------- HTTP (tiny: GET only) ----------

    static void Serve(TcpClient c)
    {
        try
        {
            c.NoDelay = true;
            NetworkStream ns = c.GetStream();
            ns.ReadTimeout = 5000;
            string line = ReadLine(ns);
            while (ReadLine(ns).Length > 0) { } // headers
            string[] parts = line.Split(' ');
            if (parts.Length >= 2 && parts[0] == "OPTIONS")
            {
                // Chrome asks first when the page comes from a network address (Private Network Access)
                byte[] pre = Encoding.ASCII.GetBytes("HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET\r\n" +
                    "Access-Control-Allow-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                ns.Write(pre, 0, pre.Length);
                c.Close();
                return;
            }
            if (parts.Length < 2 || parts[0] != "GET") { Reply(ns, 405, "text/plain", "GET only"); c.Close(); return; }
            string path = parts[1], query = "";
            int q = path.IndexOf('?');
            if (q >= 0) { query = path.Substring(q + 1); path = path.Substring(0, q); }
            if (Param(query, "t") != token) { Reply(ns, 403, "text/plain", "token"); c.Close(); return; }
            Interlocked.Exchange(ref lastAsk, DateTime.UtcNow.Ticks);
            if (path == "/status") { Reply(ns, 200, "application/json", Status()); c.Close(); return; }
            if (path == "/pcm") { Stream(c, ns); return; }
            Reply(ns, 404, "text/plain", "not found");
            c.Close();
        }
        catch (Exception) { try { c.Close(); } catch (Exception) { } }
    }

    static string ReadLine(NetworkStream ns)
    {
        var sb = new StringBuilder();
        for (;;)
        {
            int b = ns.ReadByte();
            if (b < 0 || b == '\n') break;
            if (b != '\r') sb.Append((char)b);
            if (sb.Length > 8192) throw new IOException("line too long");
        }
        return sb.ToString();
    }

    static string Param(string query, string key)
    {
        foreach (string kv in query.Split('&'))
        {
            int e = kv.IndexOf('=');
            if (e > 0 && kv.Substring(0, e) == key) return Uri.UnescapeDataString(kv.Substring(e + 1));
        }
        return "";
    }

    static void Reply(NetworkStream ns, int code, string type, string body)
    {
        byte[] b = Encoding.UTF8.GetBytes(body);
        byte[] h = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " X\r\nContent-Type: " + type + "; charset=utf-8\r\nContent-Length: " + b.Length +
            "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        ns.Write(h, 0, h.Length);
        ns.Write(b, 0, b.Length);
    }

    static string Json(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char ch in s ?? "")
        {
            if (ch == '"' || ch == '\\') sb.Append('\\').Append(ch);
            else if (ch < ' ') sb.Append("\\u").Append(((int)ch).ToString("x4"));
            else sb.Append(ch);
        }
        return sb.Append('"').ToString();
    }

    // The app's window title ("Artist - Song" in Spotify). All its windows, hidden ones too: closed to
    // the tray, the main window is hidden and has no "main window title" – but the title is still set.
    static string AppTitle()
    {
        var pids = new HashSet<int>();
        try { foreach (Process p in Process.GetProcessesByName(app)) pids.Add(p.Id); }
        catch (Exception) { }
        if (pids.Count == 0) return "";
        string best = "", any = "";
        EnumWindows((h, l) =>
        {
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (!pids.Contains((int)pid)) return true;
            int n = GetWindowTextLengthW(h);
            if (n <= 0 || n > 1000) return true;
            var sb = new StringBuilder(n + 1);
            GetWindowTextW(h, sb, sb.Capacity);
            string t = sb.ToString().Trim();
            if (t.Length == 0 || t == "GDI+ Window" || t.StartsWith("Default IME") || t == "MSCTFIME UI") return true;
            if (t.Contains(" - ")) { if (best.Length == 0) best = t; }
            else if (any.Length == 0) any = t;
            return true;
        }, IntPtr.Zero);
        return best.Length > 0 ? best : any;
    }

    static string Status()
    {
        string title = "";
        try { title = AppTitle(); }
        catch (Exception) { }
        bool sound = (DateTime.UtcNow.Ticks - Interlocked.Read(ref lastSound)) < TimeSpan.TicksPerSecond;
        return "{\"app\":" + Json(app) + ",\"running\":" + (running ? "true" : "false") + ",\"title\":" + Json(title) +
            ",\"sound\":" + (sound ? "true" : "false") + ",\"rate\":" + Rate + "}";
    }

    class Client
    {
        public readonly Queue<byte[]> Q = new Queue<byte[]>();
        public readonly AutoResetEvent Ev = new AutoResetEvent(false);
    }

    static void Stream(TcpClient c, NetworkStream ns)
    {
        var me = new Client();
        lock (clients) clients.Add(me);
        try
        {
            byte[] h = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
            ns.Write(h, 0, h.Length);
            for (;;)
            {
                me.Ev.WaitOne(1000);
                for (;;)
                {
                    byte[] chunk = null;
                    lock (me.Q) if (me.Q.Count > 0) chunk = me.Q.Dequeue();
                    if (chunk == null) break;
                    ns.Write(chunk, 0, chunk.Length);
                }
                Interlocked.Exchange(ref lastAsk, DateTime.UtcNow.Ticks);
            }
        }
        catch (Exception) { }
        finally
        {
            lock (clients) clients.Remove(me);
            try { c.Close(); } catch (Exception) { }
        }
    }

    static void Broadcast(byte[] chunk)
    {
        lock (clients)
        {
            foreach (Client cl in clients)
            {
                lock (cl.Q)
                {
                    if (cl.Q.Count > 500) cl.Q.Clear(); // a stuck reader: drop, don't pile up
                    cl.Q.Enqueue(chunk);
                }
                cl.Ev.Set();
            }
        }
    }

    // ---------- Capture ----------

    static void CaptureLoop()
    {
        for (;;)
        {
            int pid = fixedPid > 0 ? fixedPid : RootPid(app);
            if (pid <= 0) { running = false; Thread.Sleep(1000); continue; }
            try { Capture(pid); }
            catch (Exception e) { Console.Error.WriteLine("capture: " + e.Message); }
            running = false;
            Thread.Sleep(1000);
        }
    }

    // The app's first process (its children – Spotify plays sound in one of them – are included)
    static int RootPid(string name)
    {
        string exe = name.ToLowerInvariant() + ".exe";
        var parent = new Dictionary<int, int>();
        var names = new Dictionary<int, string>();
        IntPtr snap = CreateToolhelp32Snapshot(2, 0);
        if (snap == new IntPtr(-1)) return 0;
        try
        {
            var e = new PROCESSENTRY32W();
            e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
            if (Process32FirstW(snap, ref e))
            {
                do
                {
                    parent[(int)e.th32ProcessID] = (int)e.th32ParentProcessID;
                    names[(int)e.th32ProcessID] = (e.szExeFile ?? "").ToLowerInvariant();
                } while (Process32NextW(snap, ref e));
            }
        }
        finally { CloseHandle(snap); }
        foreach (var kv in names)
        {
            if (kv.Value != exe) continue;
            int pp;
            string pn;
            if (!parent.TryGetValue(kv.Key, out pp) || !names.TryGetValue(pp, out pn) || pn != exe) return kv.Key;
        }
        return 0;
    }

    static void Capture(int pid)
    {
        Process proc = null;
        try { proc = Process.GetProcessById(pid); } catch (Exception) { return; }

        // Activation parameters: process loopback, this process and its children
        IntPtr ap = Marshal.AllocHGlobal(12);
        Marshal.WriteInt32(ap, 0, 1);     // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
        Marshal.WriteInt32(ap, 4, pid);
        Marshal.WriteInt32(ap, 8, 0);     // PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
        IntPtr pv = Marshal.AllocHGlobal(24); // PROPVARIANT with a BLOB
        for (int i = 0; i < 24; i += 4) Marshal.WriteInt32(pv, i, 0);
        Marshal.WriteInt16(pv, 0, 65);    // VT_BLOB
        Marshal.WriteInt32(pv, 8, 12);
        Marshal.WriteIntPtr(pv, 16, ap);
        IntPtr fmt = Marshal.AllocHGlobal(18); // WAVEFORMATEX: PCM 16-bit stereo 48 kHz
        Marshal.WriteInt16(fmt, 0, 1);
        Marshal.WriteInt16(fmt, 2, 2);
        Marshal.WriteInt32(fmt, 4, Rate);
        Marshal.WriteInt32(fmt, 8, Rate * 4);
        Marshal.WriteInt16(fmt, 12, 4);
        Marshal.WriteInt16(fmt, 14, 16);
        Marshal.WriteInt16(fmt, 16, 0);
        IAudioClient client = null;
        var ev = new AutoResetEvent(false);
        try
        {
            var done = new Handler();
            IActivateAudioInterfaceAsyncOperation op;
            ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, pv, done, out op);
            if (!done.Done.WaitOne(5000)) throw new Exception("activation timed out");
            int hr;
            object iface;
            op.GetActivateResult(out hr, out iface);
            if (hr != 0) throw new Exception("activation failed 0x" + hr.ToString("x8"));
            client = (IAudioClient)iface;
            // LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
            hr = client.Initialize(0, 0x88060000u, 2000000, 0, fmt, IntPtr.Zero);
            if (hr != 0) throw new Exception("initialize failed 0x" + hr.ToString("x8"));
            hr = client.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle());
            if (hr != 0) throw new Exception("event failed 0x" + hr.ToString("x8"));
            Guid capId = typeof(IAudioCaptureClient).GUID;
            object capObj;
            hr = client.GetService(ref capId, out capObj);
            if (hr != 0) throw new Exception("capture client failed 0x" + hr.ToString("x8"));
            var cap = (IAudioCaptureClient)capObj;
            hr = client.Start();
            if (hr != 0) throw new Exception("start failed 0x" + hr.ToString("x8"));
            running = true;
            var tick = Stopwatch.StartNew();
            for (;;)
            {
                ev.WaitOne(100);
                uint packet;
                while (cap.GetNextPacketSize(out packet) == 0 && packet > 0)
                {
                    IntPtr data;
                    uint frames, flags;
                    ulong devPos, qpc;
                    if (cap.GetBuffer(out data, out frames, out flags, out devPos, out qpc) != 0) break;
                    byte[] mono = new byte[frames * 2];
                    bool silent = (flags & 2) != 0; // AUDCLNT_BUFFERFLAGS_SILENT
                    bool loud = false;
                    if (!silent && frames > 0)
                    {
                        short[] st = new short[frames * 2];
                        Marshal.Copy(data, st, 0, st.Length);
                        for (int i = 0; i < frames; i++)
                        {
                            int m = (st[2 * i] + st[2 * i + 1]) / 2;
                            if (m > 64 || m < -64) loud = true;
                            mono[2 * i] = (byte)(m & 0xff);
                            mono[2 * i + 1] = (byte)((m >> 8) & 0xff);
                        }
                    }
                    cap.ReleaseBuffer(frames);
                    if (loud) Interlocked.Exchange(ref lastSound, DateTime.UtcNow.Ticks);
                    if (frames > 0) Broadcast(mono);
                }
                if (tick.ElapsedMilliseconds > 1000)
                {
                    tick.Restart();
                    proc.Refresh();
                    if (proc.HasExited) break; // Spotify closed – wait for it to come back
                }
            }
        }
        finally
        {
            running = false;
            if (client != null) { try { client.Stop(); } catch (Exception) { } Marshal.ReleaseComObject(client); }
            Marshal.FreeHGlobal(fmt);
            Marshal.FreeHGlobal(pv);
            Marshal.FreeHGlobal(ap);
        }
    }

    // ---------- Windows ----------

    class Handler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) { Done.Set(); }
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path, [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        IntPtr activationParams, IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")]
    static extern int GetWindowTextLengthW(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int max);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32W e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32W e);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32W
    {
        public uint dwSize, cntUsage, th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID, cntThreads, th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }
}

[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient
{
    [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
    [PreserveSig] int GetBufferSize(out uint frames);
    [PreserveSig] int GetStreamLatency(out long latency);
    [PreserveSig] int GetCurrentPadding(out uint padding);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
    [PreserveSig] int GetMixFormat(out IntPtr format);
    [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr handle);
    [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient
{
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint frames);
}

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceCompletionHandler
{
    void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op);
}

[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceAsyncOperation
{
    void GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object activated);
}

[ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAgileObject { }
