using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace ConsoleBackend
{
    class Program
    {
        // SETTINGS
        const string FRONTEND_EXE = "DisplayCore.exe";

        static void Main(string[] args)
        {
            Console.Title = "SYSTEM KERNEL [BACKEND]";
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[KERNEL] Booting Xbox-Like OS Architecture...");

            // 1. Check for Frontend
            if (!File.Exists(FRONTEND_EXE))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"[ERROR] Visual Frontend ({FRONTEND_EXE}) not found!");
                Console.WriteLine("Please compile the C++ code and place it in this folder.");
                Console.Read();
                return;
            }

            // 2. Launch Graphics Engine
            Console.WriteLine("[KERNEL] Initializing Graphics Subsystem...");
            Process frontend = new Process();
            frontend.StartInfo.FileName = FRONTEND_EXE;
            frontend.StartInfo.UseShellExecute = false;
            
            try
            {
                frontend.Start();
                Console.WriteLine($"[KERNEL] Frontend PID: {frontend.Id}");
                Console.WriteLine("[KERNEL] Display Active. 120Hz Target Engaged.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CRITICAL FAIL] {ex.Message}");
                return;
            }

            // 3. Background Service Loop (The "Backend")
            // This loop runs independently of the graphics, ensuring logic never stutters the UI.
            while (!frontend.HasExited)
            {
                // Simulate background tasks (e.g., checking for game updates, controller connection)
                // In a real OS, you would use Named Pipes here to send data to the C++ window.
                Thread.Sleep(1000); 
                // Keep this process alive as long as the UI is running
            }

            Console.WriteLine("[KERNEL] Frontend closed. Shutting down system.");
            Thread.Sleep(1000);
        }
    }
}