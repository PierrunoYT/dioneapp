interface TunnelInfo {
	url: string;
	type: "localtunnel";
	status: "active" | "connecting" | "error";
	shortUrl?: string;
}

interface DialogResult {
	canceled: boolean;
	filePaths: string[];
}

interface DioneAPI {
	readonly runtime: {
		readonly platform: NodeJS.Platform;
		readonly versions: Readonly<{
			node: string;
			electron: string;
			chrome: string;
		}>;
	};
	rendererReady(): void;
	getBackendPort(): Promise<number>;
	callBackend(
		operation: string,
		params: Record<string, string>,
		init?: { headers?: Record<string, string>; body?: string },
	): Readonly<{
		response: Promise<{
			status: number;
			statusText: string;
			headers: [string, string][];
			body: string;
		}>;
		cancel(): void;
	}>;
	getSocketCredentials(
		appId: string,
	): Promise<{ port: number; ticket: string }>;
	onBackendPortChanged(callback: (port: number) => void): () => void;
	checkFirstLaunch(): Promise<boolean>;
	initializeEnvironment(): Promise<void>;
	getLocale(): Promise<string>;
	chooseDirectory(defaultPath?: string): Promise<DialogResult>;
	chooseConfigFile(): Promise<DialogResult>;
	approveLocalScript(name: string): Promise<string | null>;
	checkDirectory(directory: string): Promise<boolean>;
	updateConfig(
		value: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
	closeApp(): Promise<void>;
	minimizeApp(): Promise<void>;
	toggleMaximize(): Promise<boolean>;
	isFullscreen(): Promise<boolean>;
	onFullscreenChanged(callback: (fullscreen: boolean) => void): () => void;
	getVersion(): Promise<string>;
	checkForUpdates(): Promise<void>;
	checkForUpdatesAndNotify(): Promise<void>;
	installUpdate(): void;
	onUpdateAvailable(callback: () => void): () => void;
	onUpdateDownloaded(callback: () => void): () => void;
	notify(title: string, body: string, toastXml?: string): Promise<void>;
	resizeTerminal(id: string, cols: number, rows: number): void;
	openPath(targetPath: string): Promise<void>;
	openExternal(url: string): Promise<boolean>;
	getCacheSize(): Promise<string>;
	deleteCache(): Promise<boolean>;
	exportDebugLogs(): Promise<{
		success: boolean;
		canceled?: boolean;
		path?: string;
		error?: string;
	}>;
	getSystemUsage(): Promise<{
		cpu: number;
		ram: { percent: number; usedGB: number };
		disk: number;
	}>;
	getNetworkAddress(): Promise<{
		ip: string;
		port: number;
		url: string;
	} | null>;
	startTunnel(): Promise<TunnelInfo>;
	stopTunnel(): Promise<boolean>;
	getCurrentTunnel(): Promise<TunnelInfo | null>;
	isTunnelActive(): Promise<boolean>;
	shortenUrl(url: string): Promise<string | null>;
	openPreview(url: string): void;
	closePreview(): void;
	captureScreenshot(): Promise<string | null>;
	copyText(text: string): void;
	updateDiscordPresence(details: string, state: string): Promise<void>;
}

declare global {
	interface Window {
		readonly dione: Readonly<DioneAPI>;
	}
}

export {};
