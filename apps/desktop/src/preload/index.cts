// Sandboxed preload script exposing the minimal desktop bridge to the renderer.
// Both loading.html and the Control Rod web app (http://localhost:<port>) receive this surface.
import electron = require("electron");
const { contextBridge, ipcRenderer } = electron;

interface DesktopStatusPayload {
  phase: "starting" | "ready" | "stopping" | "error";
  message?: string;
  title?: string;
  details?: string;
}

interface DesktopNotifyInput {
  title: string;
  body: string;
  route?: string;
}

const api = {
  isDesktop: true as const,
  platform: process.platform,
  onStatus(listener: (status: DesktopStatusPayload) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, status: DesktopStatusPayload) => listener(status);
    ipcRenderer.on("cr:status", wrapped);
    return () => ipcRenderer.removeListener("cr:status", wrapped);
  },
  requestStatus(): Promise<DesktopStatusPayload> {
    return ipcRenderer.invoke("cr:get-status") as Promise<DesktopStatusPayload>;
  },
  retryStart(): Promise<void> {
    return ipcRenderer.invoke("cr:retry-start") as Promise<void>;
  },
  notify(input: DesktopNotifyInput): Promise<boolean> {
    return ipcRenderer.invoke("cr:notify", input) as Promise<boolean>;
  },
  closeNotification(): Promise<void> {
    return ipcRenderer.invoke("cr:close-notification") as Promise<void>;
  },
  onOpenInbox(listener: (route: string) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, route: string) => listener(route);
    ipcRenderer.on("cr:open-inbox", wrapped);
    return () => ipcRenderer.removeListener("cr:open-inbox", wrapped);
  },
};

contextBridge.exposeInMainWorld("controlrodDesktop", api);
