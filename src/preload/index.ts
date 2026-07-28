import { contextBridge, ipcRenderer } from "electron";
import { createBackendCaller } from "./backend-call";

// Sandboxed preloads cannot require Node builtins, so request identifiers come
// from the Web Crypto API exposed in the renderer context.
const randomUUID = (): string => {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const on = <T>(channel: string, callback: (value: T) => void) => {
	const listener = (_event: Electron.IpcRendererEvent, value: T) =>
		callback(value);
	ipcRenderer.on(channel, listener);
	return () => ipcRenderer.removeListener(channel, listener);
};

const callBackend = createBackendCaller(ipcRenderer, randomUUID);

const dione = Object.freeze({
	runtime: Object.freeze({
		platform: process.platform,
		versions: Object.freeze({
			node: process.versions.node,
			electron: process.versions.electron,
			chrome: process.versions.chrome,
		}),
	}),
	rendererReady: () => ipcRenderer.send("renderer-ready"),
	getBackendPort: () => ipcRenderer.invoke("backend:get-port"),
	callBackend,
	getSocketCredentials: (appId: string) =>
		ipcRenderer.invoke("backend:get-socket-credentials", appId),
	onBackendPortChanged: (callback: (port: number) => void) =>
		on("backend-port-changed", callback),
	checkFirstLaunch: () => ipcRenderer.invoke("check-first-launch"),
	initializeEnvironment: () => ipcRenderer.invoke("init-env"),
	getLocale: () => ipcRenderer.invoke("get-locale"),
	chooseDirectory: (defaultPath?: string) =>
		ipcRenderer.invoke("save-dir", defaultPath),
	chooseConfigFile: () => ipcRenderer.invoke("select-file", ""),
	approveLocalScript: (name: string) =>
		ipcRenderer.invoke("local-script:approve", name),
	checkDirectory: (directory: string) =>
		ipcRenderer.invoke("check-dir", directory),
	updateConfig: (value: Record<string, unknown>) =>
		ipcRenderer.invoke("update-config", value),
	closeApp: () => ipcRenderer.invoke("app:close"),
	minimizeApp: () => ipcRenderer.invoke("app:minimize"),
	toggleMaximize: () => ipcRenderer.invoke("app:toggle-maximize"),
	isFullscreen: () => ipcRenderer.invoke("app:is-fullscreen"),
	onFullscreenChanged: (callback: (fullscreen: boolean) => void) =>
		on("app:fullscreen-changed", callback),
	getVersion: () => ipcRenderer.invoke("get-version"),
	checkForUpdates: () => ipcRenderer.invoke("check-update"),
	checkForUpdatesAndNotify: () => ipcRenderer.invoke("check-update-and-notify"),
	installUpdate: () => ipcRenderer.send("quit_and_install"),
	onUpdateAvailable: (callback: () => void) => on("update_available", callback),
	onUpdateDownloaded: (callback: () => void) =>
		on("update_downloaded", callback),
	notify: (title: string, body: string, toastXml?: string) =>
		ipcRenderer.invoke("notify", title, body, toastXml),
	resizeTerminal: (id: string, cols: number, rows: number) =>
		ipcRenderer.send("terminal:resize", { id, cols, rows }),
	openPath: (targetPath: string) => ipcRenderer.invoke("open-dir", targetPath),
	openExternal: (url: string) => ipcRenderer.invoke("open-external-link", url),
	getCacheSize: () => ipcRenderer.invoke("check-folder-size"),
	deleteCache: () => ipcRenderer.invoke("delete-folder"),
	exportDebugLogs: () => ipcRenderer.invoke("export-debug-logs"),
	getSystemUsage: () => ipcRenderer.invoke("get-system-usage"),
	getNetworkAddress: () => ipcRenderer.invoke("get-network-address"),
	startTunnel: () => ipcRenderer.invoke("start-tunnel"),
	stopTunnel: () => ipcRenderer.invoke("stop-tunnel"),
	getCurrentTunnel: () => ipcRenderer.invoke("get-current-tunnel"),
	isTunnelActive: () => ipcRenderer.invoke("is-tunnel-active"),
	shortenUrl: (url: string) => ipcRenderer.invoke("shorten-url", url),
	openPreview: (url: string) => ipcRenderer.send("new-window", url),
	closePreview: () => ipcRenderer.send("close-preview-window"),
	captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),
	copyText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text),
	updateDiscordPresence: (details: string, state: string) =>
		ipcRenderer.invoke("update-discord-presence", details, state),
});

contextBridge.exposeInMainWorld("dione", dione);
