// Control Rod desktop shell entrypoint (Electron main process).
// Patterned on anomalyco/opencode (MIT) desktop shell architecture.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, shell, type MenuItemConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopLifecycle, type LifecycleState } from "./lifecycle.js";
import { DesktopNotifier, type DesktopNotificationPayload } from "./notifications.js";

const mainDir = dirname(fileURLToPath(import.meta.url));
const desktopPkgDir = resolve(mainDir, "..", "..");

function resolveRuntimeRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "app-runtime");
  }
  return resolve(desktopPkgDir, "..", "..");
}

function resolveDaemonBin(runtimeRoot: string): string | undefined {
  if (!app.isPackaged) return undefined;
  const binName = process.platform === "win32" ? "controlrod.exe" : "controlrod";
  const candidate = join(runtimeRoot, "bin", binName);
  return existsSync(candidate) ? candidate : undefined;
}

function resolveLoadingHtml(): string {
  return join(desktopPkgDir, "renderer", "loading.html");
}

function resolvePreloadScript(): string {
  return join(mainDir, "..", "preload", "index.cjs");
}

function resolveIconPath(): string {
  return join(desktopPkgDir, "assets", "icon.png");
}

app.setName("Control Rod");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  const runtimeRoot = resolveRuntimeRoot();
  const daemonBin = resolveDaemonBin(runtimeRoot);
  let mainWindow: BrowserWindow | null = null;
  let currentUrl: string | null = null;
  let isQuitting = false;

  const focusWindow = (route?: string): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
      if (currentUrl) {
        void mainWindow.loadURL(route ? new URL(route, currentUrl).toString() : currentUrl);
      }
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (route) {
      mainWindow.webContents.send("cr:open-inbox", route);
    }
  };

  const notifier = new DesktopNotifier(
    {
      isSupported: () => Notification.isSupported(),
      create: (opts) => new Notification(opts),
    },
    (route) => focusWindow(route),
  );

  const pushState = (state: LifecycleState): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("cr:status", state);
  };

  const lifecycle = new DesktopLifecycle({
    runtimeRoot,
    packaged: app.isPackaged,
    nodeExecPath: app.isPackaged ? process.execPath : "node",
    ...(daemonBin ? { daemonBin } : {}),
    onStateChange: (state) => {
      pushState(state);
      if (state.phase === "ready") {
        currentUrl = state.url;
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.loadURL(state.url);
        }
      }
    },
  });

  function isLocalControlRodUrl(target: string): boolean {
    if (!currentUrl) return false;
    try {
      const targetOrigin = new URL(target).origin;
      const appOrigin = new URL(currentUrl).origin;
      return targetOrigin === appOrigin;
    } catch {
      return false;
    }
  }

  function createMainWindow(): BrowserWindow {
    const iconPath = resolveIconPath();
    const win = new BrowserWindow({
      title: "Control Rod",
      width: 1440,
      height: 920,
      minWidth: 960,
      minHeight: 640,
      backgroundColor: "#0A0A0C",
      show: false,
      ...(existsSync(iconPath) ? { icon: iconPath } : {}),
      webPreferences: {
        preload: resolvePreloadScript(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.once("ready-to-show", () => {
      win.show();
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    win.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("file://") || isLocalControlRodUrl(url)) return;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });

    win.on("closed", () => {
      if (mainWindow === win) {
        mainWindow = null;
      }
    });

    return win;
  }

  function buildAppMenu(): void {
    const isMac = process.platform === "darwin";
    const template: MenuItemConstructorOptions[] = [
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                {
                  label: "Open in Browser",
                  accelerator: "CmdOrCtrl+Shift+O",
                  click: () => {
                    if (currentUrl) void shell.openExternal(currentUrl);
                  },
                },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          ...(!isMac
            ? [
                { type: "separator" as const },
                {
                  label: "Open in Browser",
                  accelerator: "CmdOrCtrl+Shift+O",
                  click: () => {
                    if (currentUrl) void shell.openExternal(currentUrl);
                  },
                },
              ]
            : []),
          { role: "close" },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  ipcMain.handle("cr:get-status", () => lifecycle.getState());
  ipcMain.handle("cr:retry-start", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadFile(resolveLoadingHtml());
    }
    void lifecycle.start();
  });
  ipcMain.handle("cr:notify", (_event, payload: DesktopNotificationPayload) => {
    if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") {
      return false;
    }
    return notifier.notify(payload);
  });
  ipcMain.handle("cr:close-notification", () => {
    notifier.close();
  });

  app.on("second-instance", () => {
    focusWindow();
  });

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
      if (currentUrl) {
        void mainWindow.loadURL(currentUrl);
      } else {
        void mainWindow.loadFile(resolveLoadingHtml());
      }
    } else {
      focusWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (isQuitting) return;
    isQuitting = true;
    notifier.close();
    if (!lifecycle.ownsServices()) return;
    event.preventDefault();
    void lifecycle.stop().finally(() => {
      app.exit(0);
    });
  });

  const handleSignal = () => {
    if (isQuitting) return;
    isQuitting = true;
    notifier.close();
    void lifecycle.stop().finally(() => {
      app.exit(0);
    });
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  void app.whenReady().then(async () => {
    if (process.platform === "darwin" && app.dock) {
      const iconPath = resolveIconPath();
      if (existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) app.dock.setIcon(icon);
      }
    }

    buildAppMenu();
    mainWindow = createMainWindow();
    await mainWindow.loadFile(resolveLoadingHtml());
    void lifecycle.start();
  });
}
