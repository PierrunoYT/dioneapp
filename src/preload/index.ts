import { clipboard, contextBridge, ipcRenderer } from "electron";

const on = <T>(channel: string, callback: (value: T) => void) => {
	const listener = (_event: Electron.IpcRendererEvent, value: T) =>
		callback(value);
	ipcRenderer.on(channel, listener);
	return () => ipcRenderer.removeListener(channel, listener);
};

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
	callBackend: (
		operation: string,
		params: Record<string, string>,
		init?: { headers?: Record<string, string>; body?: string },
	) => ipcRenderer.invoke("backend:call", operation, params, init),
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
	copyText: (text: string) => clipboard.writeText(text),
	updateDiscordPresence: (details: string, state: string) =>
		ipcRenderer.invoke("update-discord-presence", details, state),
});

contextBridge.exposeInMainWorld("dione", dione);
