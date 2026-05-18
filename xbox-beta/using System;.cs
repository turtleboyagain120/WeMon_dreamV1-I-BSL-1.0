using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Threading;
using System.Collections.Generic;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
using System.Text.Json; // Used for passing JSON game data strings directly to HTML5 layers

namespace ConsoleOSScanner
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Thread backendThread = new Thread(() => {
                Console.Title = "OS AUTO-DISCOVERY SUB-SYSTEM";
                while (true)
                {
                    Console.Clear();
                    Console.ForegroundColor = ConsoleColor.Magenta;
                    Console.WriteLine("====================================================");
                    Console.WriteLine("         AUTOMATED LIBRARY SCANNER ENGINE           ");
                    Console.WriteLine("====================================================");
                    Console.ForegroundColor = ConsoleColor.White;
                    Console.WriteLine("Scanner Status : Monitoring Target Directories...");
                    Console.WriteLine($"System Clock   : {DateTime.Now.ToLongTimeString()}");
                    Thread.Sleep(2000);
                }
            });
            backendThread.IsBackground = true;
            backendThread.Start();

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainWindow());
        }
    }

    public class MainWindow : Form
    {
        private WebView2 webView;

        public MainWindow()
        {
            this.Text = "Dynamic Game Matrix Console";
            this.FormBorderStyle = FormBorderStyle.None;
            this.WindowState = FormWindowState.Maximized;
            this.BackColor = Color.FromArgb(10, 10, 12);
            this.KeyPreview = true;
            this.KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) Application.Exit(); };

            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            webView = new WebView2 { Dock = DockStyle.Fill };
            this.Controls.Add(webView);

            var env = await CoreWebView2Environment.CreateAsync(null, null, 
                new CoreWebView2EnvironmentOptions("--disable-gpu-vsync --enable-hardware-overlays"));
            
            await webView.EnsureCoreWebView2Async(env);

            // HOOKING NATIVE ACTIONS (Listens to clicking events sent from HTML)
            webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            // INJECT HTML/CSS WITH REFRESH-PROOF CODE DATA
            string htmlContent = @"
            <!DOCTYPE html>
            <html lang='en'>
            <head>
                <meta charset='UTF-8'>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body, html { width: 100vw; height: 100vh; overflow: hidden; background-color: #040406; font-family: sans-serif; }
                    #fpsCounter { position: absolute; top: 20px; left: 20px; color: #00ff66; font-size: 18px; font-weight: bold; z-index: 100; font-family: monospace; }
                    .dashboard-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; z-index: 10; }
                    
                    /* The Responsive Tile Matrix Flex layout */
                    .tile-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; width: 85%; max-width: 1400px; }

                    /* TRANSFORMING THE PLACEHOLDERS IN REALTIME */
                    .console-tile {
                        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.05) 100%);
                        border: 3px solid rgba(255, 255, 255, 0.08);
                        aspect-ratio: 1 / 1;
                        border-radius: 14px;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        color: #ffffff;
                        font-size: 1.3rem;
                        font-weight: bold;
                        text-align: center;
                        padding: 20px;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
                        transform: scale(1);
                        transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s, box-shadow 0.2s;
                        will-change: transform;
                    }

                    /* Smooth bouncing dynamic color transitions on hover pointers */
                    .console-tile:hover {
                        transform: scale(1.12);
                        background: rgba(0, 230, 64, 0.08);
                        border-color: #00e640;
                        box-shadow: 0 12px 35px rgba(0, 230, 64, 0.35);
                    }
                    
                    .game-sub { font-size: 0.8rem; color: rgba(255, 255, 255, 0.4); margin-top: 8px; font-weight: normal; font-family: monospace; }
                    #gridCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
                </style>
            </head>
            <body>
                <div id='fpsCounter'>FPS: 0</div>
                <canvas id='gridCanvas'></canvas>

                <div class='dashboard-container'>
                    <div class='tile-grid' id='mainGrid'>
                        <!-- DATA MODULES WILL BE GENERATED AND REPLACED AUTOMATICALLY HERE -->
                    </div>
                </div>

                <script>
                    const canvas = document.getElementById('gridCanvas');
                    const ctx = canvas.getContext('2d');
                    const fpsDisplay = document.getElementById('fpsCounter');
                    const grid = document.getElementById('mainGrid');

                    let frames = 0, lastTime = performance.now();

                    // LISTENING FOR AUTODISCOVERED LOGS DROPPED FROM C# NATIVE CODE
                    window.chrome.webview.addEventListener('message', event => {
                        const gamesList = event.data;
                        grid.innerHTML = ''; // Clear default placeholders immediately

                        gamesList.forEach(game => {
                            const tile = document.createElement('div');
                            tile.className = 'console-tile';
                            tile.innerHTML = `<div>${game.Name}</div><div class='game-sub'>READY TO BOOT</div>`;
                            
                            // Send execution instructions back to the main C# wrapper when clicked
                            tile.onclick = () => {
                                window.chrome.webview.postMessage({ action: 'LAUNCH', path: game.Path });
                            };

                            grid.appendChild(tile);
                        });
                    });

                    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
                    window.addEventListener('resize', resize); resize();

                    function drawBg() {
                        ctx.fillStyle = '#040406'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.012)'; ctx.lineWidth = 1;
                        for(let i=0; i<canvas.width; i+=90) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
                        for(let j=0; j<canvas.height; j+=90) { ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(canvas.width,j); ctx.stroke(); }
                        frames++; const now = performance.now();
                        if (now >= lastTime + 1000) { fpsDisplay.textContent = 'FPS: ' + frames; frames = 0; lastTime = now; }
                        requestAnimationFrame(drawBg);
                    }
                    requestAnimationFrame(drawBg);
                </script>
            </body>
            </html>";

            webView.CoreWebView2.NavigateToString(htmlContent);

            // KICKSTART DISCOVERY SUB-ROUTINE SCANNING INTERFACE AFTER LOADING COMPLETED
            webView.NavigationCompleted += (s, e) => { AutoDiscoverLocalLibrary(); };
        }

        private void AutoDiscoverLocalLibrary()
        {
            var discoveredGames = new List<object>();

            // Setup common default target directory directories for standard installs
            string[] scanPaths = new string[]
            {
                @"C:\Program Files (x86)\Steam\steamapps\common", // Default Steam path
                @"D:\SteamLibrary\steamapps\common",             // Secondary Drive Steam path
                @"C:\Program Files\Epic Games",                   // Epic Games directory path
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Games") // Local Users folder
            };

            foreach (var path in scanPaths)
            {
                if (Directory.Exists(path))
                {
                    string[] folders = Directory.GetDirectories(path);
                    foreach (var folder in folders)
                    {
                        string gameName = Path.GetFileName(folder);
                        
                        // Drill down inside folder to fetch standard primary executables
                        string[] exeFiles = Directory.GetFiles(folder, "*.exe", SearchOption.TopDirectoryOnly);
                        if (exeFiles.Length > 0)
                        {
                            discoveredGames.Add(new { Name = gameName.ToUpper(), Path = exeFiles[0] });
                        }
                    }
                }
            }

            // Fallback generation logic to avoid empty grids if zero folders map correctly
            if (discoveredGames.Count == 0)
            {
                discoveredGames.Add(new { Name = "XBOX CLOUD CLIENT", Path = "cmd.exe" });
                discoveredGames.Add(new { Name = "MINECRAFT WIN10", Path = "cmd.exe" });
                discoveredGames.Add(new { Name = "SYSTEM SETTINGS CORE", Path = "explorer.exe" });
                discoveredGames.Add(new { Name = "RETROARCH EMULATOR", Path = "cmd.exe" });
            }

            // Pack structured metrics into JSON data string payload
            string jsonPayload = JsonSerializer.Serialize(discoveredGames);
            
            // Fire message pipeline downward into JavaScript interface scope
            webView.CoreWebView2.PostWebMessageAsJson(jsonPayload);
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // Parse instruction payload fired up from JavaScript window space
            string jsonString = e.WebMessageAsJson;
            using (JsonDocument doc = JsonDocument.Parse(jsonString))
            {
                JsonElement root = doc.RootElement;
                if (root.GetProperty("action").GetString() == "LAUNCH")
                {
                    string launchPath = root.GetProperty("path").GetString();
                    
                    try
                    {
                        // Execute native app thread safely outside browser security containers
                        Process.Start(new ProcessStartInfo { FileName = launchPath, UseShellExecute = true });
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Boot Fail: {ex.Message}");
                    }
                }
            }
        }
    }
}
