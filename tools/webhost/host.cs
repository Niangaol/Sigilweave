// Sigilweave 桌面宿主：WinForms + WebView2
// 目标：最小体积（约 1 MB 宿主 + 网页资源），复用系统自带 WebView2 运行时
using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Sigilweave
{
        public static class Log
        {
            private static readonly string PathFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "sigilweave-web.log");
            public static bool On = true;
            public static void Init() { try { System.IO.File.WriteAllText(PathFile, ""); } catch { } }
            public static void Write(string msg)
            {
                if (!On) return;
                try { System.IO.File.AppendAllText(PathFile, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + Environment.NewLine); } catch { }
            }
        }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool created;
            Mutex mutex = new Mutex(true, "Sigilweave.WebHost.8f3a1c", out created);
            if (!created)
            {
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Log.Init();
            Log.Write("start " + Environment.OSVersion.VersionString + " 64bit=" + Environment.Is64BitProcess);
            Application.ThreadException += delegate(object s, System.Threading.ThreadExceptionEventArgs ea) { Log.Write("ThreadException " + ea.Exception); };
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs ea) { Log.Write("UnhandledException " + ea.ExceptionObject); };
            bool dev = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], "--dev", StringComparison.OrdinalIgnoreCase)) dev = true;
            }
            try { Application.Run(new MainForm(dev)); } catch (Exception ex) { Log.Write("Run failed " + ex); throw; }
            Log.Write("exit ok");
            GC.KeepAlive(mutex);
        }
    }

    public class MainForm : Form
    {
        private const int WM_SETTINGCHANGE = 0x001A;
        private static readonly Color BgColor = Color.FromArgb(13, 10, 23);
        private static readonly string AppTitle = "共振法阵 Sigilweave";

        private WebView2 web;
        private bool fullscreen;
        private Rectangle restoreBounds;
        private FormWindowState restoreState = FormWindowState.Normal;
        private bool devMode;

        private static readonly string UserDataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sigilweave");
        private static readonly string StateFile = Path.Combine(UserDataRoot, "window-state.txt");

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        public MainForm(bool dev)
        {
            devMode = dev;
            Text = AppTitle;
            BackColor = BgColor;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1280, 760);
            MinimumSize = new Size(960, 600);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BgColor;
            Controls.Add(web);

            Log.Write("form ctor");
            ApplyWindowState();
            StartWebView();
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int dark = 1;
                DwmSetWindowAttribute(Handle, 20, ref dark, 4); // DWMWA_USE_IMMERSIVE_DARK_MODE
            }
            catch { }
        }

        private async void StartWebView()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string wwwDir = Path.Combine(baseDir, "www");
            string userDataDir = Path.Combine(UserDataRoot, "WebView2");
            string portableData = Path.Combine(baseDir, "data");
            string envData = Environment.GetEnvironmentVariable("SIGILWEAVE_DATA");
            if (!string.IsNullOrEmpty(envData))
            {
                userDataDir = envData;
            }
            else
            {
                try
                {
                    Directory.CreateDirectory(portableData);
                    string probe = Path.Combine(portableData, ".write-test");
                    File.WriteAllText(probe, "1");
                    File.Delete(probe);
                    userDataDir = portableData;
                }
                catch { }
            }
            Log.Write("StartWebView baseDir=" + baseDir + " www=" + Directory.Exists(wwwDir));
            try { Directory.CreateDirectory(userDataDir); } catch { }
            try
            {
                System.IO.File.WriteAllText(System.IO.Path.Combine(userDataDir, "probe.txt"), "ok");
                Log.Write("probe write ok -> " + userDataDir);
            }
            catch (Exception ex) { Log.Write("probe write FAIL " + ex.GetType().Name + ": " + ex.Message); }

            if (!Directory.Exists(wwwDir) || !File.Exists(Path.Combine(wwwDir, "index.html")))
            {
                MessageBox.Show("找不到游戏资源目录 www\\index.html。\n请把 exe 与 www 文件夹放在同一目录下。",
                    AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            CoreWebView2Environment env;
            try
            {
                CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions();
                options.Language = "zh-CN";
                env = await CoreWebView2Environment.CreateAsync(null, userDataDir, options);
            }
            catch (Exception ex)
            {
                Log.Write("CreateAsync failed " + ex.GetType().Name + ": " + ex.Message);
                MessageBox.Show("未能启动 WebView2 运行时。\n\n" + ex.Message +
                    "\n\n本程序依赖系统自带的「Microsoft Edge WebView2 运行时」：\n" +
                    "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
                    AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            try
            {
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                Log.Write("EnsureCoreWebView2Async failed " + ex.GetType().Name + ": " + ex.Message);
                MessageBox.Show("初始化 WebView2 失败：\n" + ex.Message, AppTitle,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            Log.Write("EnsureCoreWebView2 ok");
            CoreWebView2 core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = devMode;
            core.Settings.AreDefaultContextMenusEnabled = devMode;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = devMode;
            core.Settings.IsSwipeNavigationEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.SetVirtualHostNameToFolderMapping("sigilweave.local", wwwDir, CoreWebView2HostResourceAccessKind.Allow);

            core.WebMessageReceived += OnWebMessage;
            string js =
                "(function(){" +
                "  if (window.__sigilFsHooked) return; window.__sigilFsHooked = true;" +
                "  window.__sigilFs = false;" +
                "  window.addEventListener('message', function(e){" +
                "    if (e && e.data === 'fs:1') window.__sigilFs = true;" +
                "    else if (e && e.data === 'fs:0') window.__sigilFs = false;" +
                "  }, true);" +
                "  window.addEventListener('keydown', function(e){" +
                "    var k = e.key;" +
                "    if (k === 'F11' || (e.altKey && k === 'Enter')) {" +
                "      e.preventDefault(); e.stopPropagation();" +
                "      window.chrome.webview.postMessage('toggle-fullscreen');" +
                "    } else if (k === 'Escape' && window.__sigilFs) {" +
                "      e.preventDefault(); e.stopPropagation();" +
                "      window.chrome.webview.postMessage('toggle-fullscreen');" +
                "    }" +
                "  }, true);" +
                "})();";
            await core.AddScriptToExecuteOnDocumentCreatedAsync(js);

            Log.Write("settings done, navigating");
            core.Navigate("https://sigilweave.local/index.html");
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg;
            try { msg = e.TryGetWebMessageAsString(); } catch { return; }
            if (msg == "toggle-fullscreen")
            {
                ToggleFullscreen();
                try { web.CoreWebView2.PostWebMessageAsString(fullscreen ? "fs:1" : "fs:0"); } catch { }
            }
        }

        private void ToggleFullscreen()
        {
            if (!fullscreen)
            {
                restoreBounds = Bounds;
                restoreState = WindowState;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Normal;
                Bounds = Screen.FromControl(this).Bounds;
                fullscreen = true;
            }
            else
            {
                FormBorderStyle = FormBorderStyle.Sizable;
                Bounds = restoreBounds;
                WindowState = restoreState;
                fullscreen = false;
            }
        }

        private void ApplyWindowState()
        {
            try
            {
                if (!File.Exists(StateFile)) return;
                string text = File.ReadAllText(StateFile);
                string[] parts = text.Split(',');
                if (parts.Length < 5) return;
                int x = int.Parse(parts[0], CultureInfo.InvariantCulture);
                int y = int.Parse(parts[1], CultureInfo.InvariantCulture);
                int w = int.Parse(parts[2], CultureInfo.InvariantCulture);
                int h = int.Parse(parts[3], CultureInfo.InvariantCulture);
                bool max = parts[4].Trim() == "1";
                Rectangle bounds = new Rectangle(x, y, w, h);
                if (w > 400 && h > 300 && Screen.AllScreens.Length > 0)
                {
                    bool visible = false;
                    for (int i = 0; i < Screen.AllScreens.Length; i++)
                    {
                        if (Screen.AllScreens[i].WorkingArea.IntersectsWith(bounds)) visible = true;
                    }
                    if (visible)
                    {
                        StartPosition = FormStartPosition.Manual;
                        Bounds = bounds;
                    }
                }
                if (max) WindowState = FormWindowState.Maximized;
            }
            catch { }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            try
            {
                Rectangle b = fullscreen ? restoreBounds : RestoreBounds;
                FormWindowState st = fullscreen ? restoreState : WindowState;
                Directory.CreateDirectory(UserDataRoot);
                File.WriteAllText(StateFile, string.Format(CultureInfo.InvariantCulture, "{0},{1},{2},{3},{4}",
                    b.X, b.Y, b.Width, b.Height, st == FormWindowState.Maximized ? 1 : 0));
            }
            catch { }
            base.OnFormClosing(e);
        }
    }
}
