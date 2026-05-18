#include <windows.h>
#include <gl/gl.h>
#include <cmath>
#include <string>

// CONFIGURATION
#define WINDOW_TITLE "CONSOLE OS // FLUX ENGINE"
#define BOX_SIZE 100.0f

// GLOBAL STATE
float boxX = 0.0f, boxY = 0.0f;
float targetX = 0.0f, targetY = 0.0f;
int screenW = 0, screenH = 0;

// INTERPOLATION HELPER (Makes the box "float" smoothly)
float lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

// WINDOW PROCEDURE
LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
    case WM_CLOSE:
        PostQuitMessage(0);
        return 0;
    case WM_MOUSEMOVE:
        // Update target position to mouse coordinates
        targetX = (float)LOWORD(lParam);
        targetY = (float)HIWORD(lParam);
        return 0;
    case WM_SIZE:
        screenW = LOWORD(lParam);
        screenH = HIWORD(lParam);
        glViewport(0, 0, screenW, screenH);
        return 0;
    case WM_KEYDOWN:
        if (wParam == VK_ESCAPE) PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

// SETUP OPENGL
void EnableOpenGL(HWND hwnd, HDC* hDC, HGLRC* hRC) {
    PIXELFORMATDESCRIPTOR pfd;
    ZeroMemory(&pfd, sizeof(pfd));
    pfd.nSize = sizeof(pfd);
    pfd.nVersion = 1;
    pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
    pfd.iPixelType = PFD_TYPE_RGBA;
    pfd.cColorBits = 24;
    pfd.cDepthBits = 16;
    pfd.iLayerType = PFD_MAIN_PLANE;

    *hDC = GetDC(hwnd);
    int iFormat = ChoosePixelFormat(*hDC, &pfd);
    SetPixelFormat(*hDC, iFormat, &pfd);
    *hRC = wglCreateContext(*hDC);
    wglMakeCurrent(*hDC, *hRC);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    // 1. REGISTER WINDOW CLASS
    WNDCLASS wc = { 0 };
    wc.style = CS_OWNDC;
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.lpszClassName = "ConsoleOS_Class";
    RegisterClass(&wc);

    // 2. CREATE WINDOW (Popup style for Console look)
    HWND hwnd = CreateWindow("ConsoleOS_Class", WINDOW_TITLE, 
        WS_POPUP | WS_VISIBLE | WS_MAXIMIZE, 
        0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN), 
        NULL, NULL, hInstance, NULL);

    // 3. INITIALIZE GRAPHICS
    HDC hDC;
    HGLRC hRC;
    EnableOpenGL(hwnd, &hDC, &hRC);

    // 4. HIGH PERFORMANCE LOOP
    MSG msg = { 0 };
    int frameCount = 0;
    DWORD lastTime = GetTickCount();

    while (msg.message != WM_QUIT) {
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        } else {
            // --- RENDER FRAME ---

            // Physics: Smoothly move box to mouse (Lerp factor 0.15)
            boxX = lerp(boxX, targetX - (BOX_SIZE / 2), 0.15f);
            boxY = lerp(boxY, targetY - (BOX_SIZE / 2), 0.15f);

            // Graphics Setup (2D Orthographic)
            glMatrixMode(GL_PROJECTION);
            glLoadIdentity();
            glOrtho(0, screenW, screenH, 0, -1, 1);
            glMatrixMode(GL_MODELVIEW);
            glLoadIdentity();

            // Clear Screen (Dark "Console" Grey)
            glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
            glClear(GL_COLOR_BUFFER_BIT);

            // Draw Grid Background
            glColor3f(0.2f, 0.2f, 0.25f);
            glBegin(GL_LINES);
            for (int x = 0; x < screenW; x += 100) { glVertex2f((float)x, 0); glVertex2f((float)x, (float)screenH); }
            for (int y = 0; y < screenH; y += 100) { glVertex2f(0, (float)y); glVertex2f((float)screenW, (float)y); }
            glEnd();

            // Draw Hover Box (Neon Blue)
            glColor3f(0.0f, 0.8f, 1.0f);
            glRectf(boxX, boxY, boxX + BOX_SIZE, boxY + BOX_SIZE);

            // Draw Border (White)
            glColor3f(1.0f, 1.0f, 1.0f);
            glLineWidth(2.0f);
            glBegin(GL_LINE_LOOP);
                glVertex2f(boxX, boxY);
                glVertex2f(boxX + BOX_SIZE, boxY);
                glVertex2f(boxX + BOX_SIZE, boxY + BOX_SIZE);
                glVertex2f(boxX, boxY + BOX_SIZE);
            glEnd();

            SwapBuffers(hDC);

            // --- FPS COUNTER ---
            frameCount++;
            if (GetTickCount() - lastTime >= 1000) {
                char title[256];
                sprintf_s(title, "%s | FPS: %d", WINDOW_TITLE, frameCount);
                SetWindowText(hwnd, title);
                frameCount = 0;
                lastTime = GetTickCount();
            }
        }
    }

    return 0;
}
