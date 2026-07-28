import fs from "node:fs";
import os from "node:os";
import path, { join } from "node:path";
import { defaultConfig, deleteConfig, readConfig, writeConfig } from "@/config";
import {
	destroyPresence,
	initializeDiscordPresence,
	updatePresence,
} from "@/discord/presence";
// import {
// 	deleteExpiresAt,
// 	deleteId,
// 	deleteToken,
// 	getExpiresAt,
// 	getId,
// 	getToken,
// 	saveExpiresAt,
// 	saveId,
// 	saveToken,
// } from "@/security/secure-tokens";
import { initDefaultEnv } from "@/server/scripts/dependencies/environment";
import { createLocalApproval } from "@/server/scripts/trust";
import { resolveCanonicalAppPath } from "@/server/scripts/utils/paths";
import { createSocketTicket, getBackendToken } from "@/server/security";
import { start as startServer, stop as stopServer } from "@/server/server";
import { accountsEnabled } from "@/server/utils/features";
import logger, { getLogs } from "@/server/utils/logger";
import {
	exportDebugLogs,
	formatDebugExportPreview,
	prepareDebugExport,
} from "@/utils/export-logs";
import { getLocalNetworkIP } from "@/utils/network";
import {
	getCurrentTunnel,
	isTunnelActive,
	shortenUrl,
	startLocaltunnel,
	stopTunnel,
} from "@/utils/tunnel";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import macosIcon from "@resources/icon.icns?asset";
import icon from "@resources/icon.ico?asset";
import linuxIcon from "@resources/icon.png?asset";
import { config as dotenvConfig } from "dotenv";
import {
	BrowserWindow,
	Notification,
	Tray,
	app,
	clipboard,
	dialog,
	globalShortcut,
	ipcMain,
	session,
	shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import si from "systeminformation";
import {
	BackendCallRegistry,
	isExactTrustedSender,
	resolveBackendRequest,
} from "./backend-ipc";
import {
	resizeTerminal,
	stopAllActiveProcesses,
} from "./server/scripts/process";

dotenvConfig();

// Acquire the lock before registering protocols or starting application services.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	app.quit();
}

let shutdownHandler: (() => Promise<void>) | null = null;
let shutdownComplete = false;

async function requestShutdown(): Promise<void> {
	try {
		await shutdownHandler?.();
	} finally {
		shutdownComplete = true;
	}
}

app.on("before-quit", (event) => {
	if (!shutdownHandler || shutdownComplete) return;
	event.preventDefault();
	void requestShutdown().finally(() => app.quit());
});

// remove so we can register each time as we run the app.
if (gotSingleInstanceLock) {
	app.removeAsDefaultProtocolClient("dione");
}

// get icon path based on platform
function getIconPath(platform: string): string {
	try {
		switch (platform) {
			case "win32":
				return icon;
			case "darwin":
				return macosIcon;
			case "linux":
				return linuxIcon;
			default:
				return icon;
		}
	} catch (error) {
		logger?.error?.("Error getting icon path:", error) ||
			console.error("Error getting icon path:", error);
		// Fallback to a basic icon path
		const resourcesPath = app.isPackaged
			? path.join(process.resourcesPath)
			: path.join(__dirname, "../../resources");

		switch (platform) {
			case "win32":
				return path.join(resourcesPath, "icon.ico");
			case "darwin":
				return path.join(resourcesPath, "icon.icns");
			case "linux":
				return path.join(resourcesPath, "icon.png");
			default:
				return path.join(resourcesPath, "icon.ico");
		}
	}
}

// If we are running a non-packaged version of the app && on windows
if (
	gotSingleInstanceLock &&
	process.env.NODE_ENV === "development" &&
	process.platform === "win32"
) {
	// set the path of the app on node_modules/electron/electron.exe
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient("dione", process.execPath, [
			path.resolve(process.argv[1]),
		]);
	} else {
		app.setAsDefaultProtocolClient("dione");
	}
} else if (gotSingleInstanceLock) {
	app.setAsDefaultProtocolClient("dione");
}

// define main window
let mainWindow: BrowserWindow;
let port: number;
const pendingDeepLinks: string[] = [];
let dispatchDeepLink: ((url: string | undefined) => void) | undefined;
let rendererReadyForDeepLinks = false;
const backendCalls = new BackendCallRegistry<Electron.WebContents>();

const abortBackendCalls = (sender: Electron.WebContents) => {
	backendCalls.abortOwner(sender);
};

const isTrustedRenderer = (
	event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
) => {
	if (!mainWindow || mainWindow.isDestroyed()) return false;
	return isExactTrustedSender(
		event.sender,
		event.senderFrame,
		mainWindow.webContents,
		mainWindow.webContents.mainFrame,
	);
};

const secureHandle = (
	channel: string,
	listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
) => {
	ipcMain.handle(channel, (event, ...args) => {
		if (!isTrustedRenderer(event)) throw new Error("Untrusted IPC sender");
		return listener(event, ...args);
	});
};

const secureOn = (
	channel: string,
	listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
) => {
	ipcMain.on(channel, (event, ...args) => {
		if (!isTrustedRenderer(event)) return;
		listener(event, ...args);
	});
};

const dispatchOrQueueDeepLink = (url: string | undefined) => {
	if (!url) return;
	if (dispatchDeepLink && rendererReadyForDeepLinks) {
		dispatchDeepLink(url);
		return;
	}
	pendingDeepLinks.push(url);
};

if (gotSingleInstanceLock) {
	app.on("second-instance", (_event, commandLine) => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}

		const deepLink = commandLine
			.find((argument) => argument.startsWith("dione://"))
			?.replace(/\/$/, "");
		dispatchOrQueueDeepLink(deepLink);
	});

	app.on("open-url", (event, url) => {
		event.preventDefault();
		dispatchOrQueueDeepLink(url);
	});

	secureOn("renderer-ready", (event) => {
		if (!mainWindow || event.sender !== mainWindow.webContents) return;
		rendererReadyForDeepLinks = true;
		for (const deepLink of pendingDeepLinks.splice(0)) {
			dispatchDeepLink?.(deepLink);
		}
	});
}

const openHttpsExternal = (value: unknown): boolean => {
	if (typeof value !== "string") return false;

	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return false;
		void shell.openExternal(url.toString()).catch((error) => {
			logger.warn("Failed to open external URL:", error);
		});
		return true;
	} catch (error) {
		logger.warn("Rejected malformed external URL:", error);
		return false;
	}
};

const updateBackendPortState = (
	nextPort: number,
	options?: { broadcast?: boolean },
) => {
	process.env.DIONE_BACKEND_PORT = String(nextPort);
	if (options?.broadcast && mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("backend-port-changed", nextPort);
	}
};

const buildWindowOpenHandler = (
	_targetContents: Electron.WebContents | null | undefined,
): ((
	details: Electron.HandlerDetails,
) => Electron.WindowOpenHandlerResponse) => {
	return (details: Electron.HandlerDetails) => {
		openHttpsExternal(details.url);
		return { action: "deny" };
	};
};

const allowedMediaPermissions = new Set([
	"media",
	"audioCapture",
	"videoCapture",
]);

const getPermissionRequestOrigin = (
	details?:
		| Electron.PermissionRequest
		| Electron.FilesystemPermissionRequest
		| Electron.MediaAccessPermissionRequest
		| Electron.OpenExternalPermissionRequest,
) => {
	if (!details) return undefined;
	if (
		"securityOrigin" in details &&
		typeof details.securityOrigin === "string"
	) {
		return details.securityOrigin;
	}
	return details.requestingUrl;
};

const isTrustedMediaRequest = (requestingUrl?: string) => {
	if (!requestingUrl) return true;
	try {
		const url = new URL(requestingUrl);
		return (
			url.protocol === "https:" ||
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1"
		);
	} catch (error) {
		logger.warn("Failed to parse requestingUrl for media permission:", error);
		return false;
	}
};

const configurePermissionHandlers = () => {
	const sessionsToConfigure = [
		session.defaultSession,
		session.fromPartition("persist:webview"),
	];

	for (const targetSession of sessionsToConfigure) {
		try {
			targetSession.setPermissionRequestHandler(
				(_webContents, permission, callback, details) => {
					if (
						allowedMediaPermissions.has(permission) &&
						isTrustedMediaRequest(getPermissionRequestOrigin(details))
					) {
						callback(true);
						return;
					}

					callback(false);
				},
			);
		} catch (error) {
			logger.warn("Failed to set permission handler for session:", error);
		}
	}
};

// Creates the main application window with specific configurations.
function createWindow() {
	let trafficLightPosition: { x: number; y: number } | undefined;
	try {
		logger.info("Creating main window...");
		const currentConfig = readConfig();
		const useCustomTopbarOnMac =
			process.platform === "darwin" && currentConfig?.layoutMode === "topbar";
		trafficLightPosition =
			process.platform === "darwin" && useCustomTopbarOnMac
				? { x: 16, y: 12 }
				: undefined;

		mainWindow = new BrowserWindow({
			width: 1200,
			height: 800,
			minWidth: 1200,
			minHeight: 800,
			show: false,
			center: true,
			autoHideMenuBar: true,
			titleBarStyle:
				process.platform === "darwin"
					? useCustomTopbarOnMac
						? "hidden"
						: "default"
					: "hidden",
			fullscreenable: true,
			maximizable: true,
			fullscreen: false,
			frame: process.platform === "darwin" ? !useCustomTopbarOnMac : true,
			// vibrancy: "fullscreen-ui", // macos
			backgroundColor: "rgba(0, 0, 0, 0.88)",
			...(process.platform === "win32"
				? { backgroundMaterial: "acrylic" }
				: {}),
			...(process.platform === "win32" ? { icon: getIconPath("win32") } : {}),
			...(process.platform === "linux"
				? { icon: getIconPath("linux"), vibrancy: "hud", roundedCorners: true }
				: {}),
			...(process.platform === "darwin"
				? { icon: getIconPath("darwin"), vibrancy: "hud" }
				: {}),
			...(trafficLightPosition ? { trafficLightPosition } : {}),
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				webviewTag: false,
				preload: join(__dirname, "../preload/index.js"),
				sandbox: true,
				webSecurity: true,
				allowRunningInsecureContent: false,
			},
		});
		logger.info("Main window created successfully");
	} catch (error) {
		logger.error("Error creating main window:", error);
		// Try to create a simpler window without icons
		mainWindow = new BrowserWindow({
			width: 1200,
			height: 800,
			show: false,
			...(trafficLightPosition ? { trafficLightPosition } : {}),
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				preload: join(__dirname, "../preload/index.js"),
				sandbox: true,
				webSecurity: true,
				allowRunningInsecureContent: false,
				webviewTag: false,
			},
		});
		logger.info("Fallback window created");
	}

	// Remove default menu from the window
	mainWindow.removeMenu();
	mainWindow.center();
	const renderer = mainWindow.webContents;
	const abortRendererBackendCalls = () => abortBackendCalls(renderer);
	renderer.on("did-navigate", abortRendererBackendCalls);
	renderer.on("render-process-gone", abortRendererBackendCalls);
	renderer.on("destroyed", abortRendererBackendCalls);
	mainWindow.webContents.once("did-fail-load", () => {
		logger.error("Failed to load the main window content.");
		dialog.showErrorBox("Error", "Failed to load the main window content.");
	});

	// show the window when its ready
	mainWindow.once("ready-to-show", () => {
		logger.info("Main window ready to show");
		try {
			mainWindow.show();
			mainWindow.focus();
			logger.info("Main window shown and focused");
		} catch (error) {
			logger.error("Error showing main window:", error);
		}

		// check for updates
		autoUpdater.checkForUpdates();

		autoUpdater.on("update-available", () => {
			logger.info("New update available");
			mainWindow.webContents.send("update_available");
		});
		autoUpdater.on("update-downloaded", () => {
			logger.info("New update downloaded");
			mainWindow.webContents.send("update_downloaded");
		});
		autoUpdater.on("error", (err) => {
			logger.error("Error in autoUpdater", err);
		});

		const config = readConfig();
		const root = app.isPackaged
			? path.join(path.dirname(app.getPath("exe")))
			: path.join(process.cwd());

		if (config?.defaultBinFolder.toLowerCase() === root.toLowerCase()) {
			logger.warn(
				"Default bin folder is set to the current working directory. This may cause issues.",
			);
			dialog.showMessageBox({
				type: "warning",
				title: "Warning!",
				message:
					"To avoid potential errors when updating, please do not use on defaultBinFolder the same path as the Dione executable.",
			});
		}

		if (config?.defaultInstallFolder.toLowerCase() === root.toLowerCase()) {
			logger.warn(
				"Default install folder is set to the current working directory. This may cause issues.",
			);
			dialog.showMessageBox({
				type: "warning",
				title: "Warning!",
				message:
					"To avoid potential errors when updating, please do not use on defaultInstallFolder the same path as the Dione executable.",
			});
		}
	});

	const handleDeepLink = (url: string | undefined) => {
		try {
			if (!url) {
				logger.error("No url received");
				return;
			}

			const queryString = `?${url.replace(/^dione:\/\//, "")}`;
			const params = new URLSearchParams(queryString);

			// Accounts are disabled, so auth and refresh tokens in a deep link are
			// ignored rather than forwarded to the renderer.
			if (accountsEnabled) {
				const authToken = params.get("auth");
				if (authToken) {
					mainWindow.webContents.send("auth-token", authToken);
				} else {
					logger.error("Not found auth token in deep link");
				}

				const refreshToken = params.get("refresh");
				if (refreshToken) {
					mainWindow.webContents.send("refresh-token", refreshToken);
				} else {
					logger.error("Not found refresh token in deep link");
				}
			} else if (params.has("auth") || params.has("refresh")) {
				logger.warn(
					"Ignoring auth tokens in deep link: account features are disabled",
				);
			}

			const downloadUrl = params.get("download");
			if (downloadUrl) {
				mainWindow.webContents.send("download", downloadUrl);
			} else {
				logger.error("No download param in deep link");
			}
		} catch (error) {
			alert("Error handling deep link, please report this error.");
			logger.error("Error handling deep link:", error);
		}
	};
	dispatchDeepLink = handleDeepLink;

	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (url !== mainWindow.webContents.getURL()) {
			event.preventDefault();
			openHttpsExternal(url);
		}
	});

	mainWindow.webContents.setWindowOpenHandler(
		buildWindowOpenHandler(mainWindow.webContents),
	);

	mainWindow.on("enter-full-screen", () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		mainWindow.webContents.send("app:fullscreen-changed", true);
	});

	mainWindow.on("leave-full-screen", () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		mainWindow.webContents.send("app:fullscreen-changed", false);
	});

	// Load renderer content (URL in development, HTML file in production)
	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}

	// add ipc handler for maximize/restore
	secureHandle("app:toggle-maximize", () => {
		if (!mainWindow) return false;
		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize();
			return false;
		}
		mainWindow.maximize();
		return true;
	});

	secureHandle("app:is-fullscreen", () => {
		if (!mainWindow) return false;
		return mainWindow.isFullScreen();
	});
}

// Sets up the application when ready.
app.whenReady().then(async () => {
	let shutdownPromise: Promise<void> | null = null;
	if (!gotSingleInstanceLock) return;

	logger.info("Starting app...");
	configurePermissionHandlers();

	autoUpdater.autoInstallOnAppQuit = false;
	// autoUpdater.forceDevUpdateConfig = true;
	autoUpdater.logger = logger;
	autoUpdater.setFeedURL({
		provider: "github",
		owner: "dioneapp",
		repo: "dioneapp",
		private: false,
	});

	const config = readConfig();
	if (!config?.disableAutoUpdates) {
		autoUpdater.autoDownload = true;
		autoUpdater.autoRunAppAfterInstall = true;
	}

	// initialize rpc safety
	try {
		await initializeDiscordPresence();
	} catch (error) {
		logger.error("Failed to initialize Discord presence:", error);
	}

	// set tray icon safety
	app.setName("Dione");
	let appIcon: Tray | null = null;
	try {
		const iconPath = getIconPath(os.platform());
		appIcon = new Tray(iconPath);
		electronApp.setAppUserModelId("Dione");
		appIcon.setToolTip("Dione");
	} catch (error) {
		logger.error("Failed to create tray icon:", error);
	}

	// start backend
	port = await startServer();
	updateBackendPortState(port);

	// create window
	await createWindow();

	// Register global shortcuts
	globalShortcut.register("Control+R", () => {
		if (mainWindow.isFocused()) {
			console.log("Ctrl+R shortcut triggered");
			mainWindow.reload();
		}
	});

	if (!app.isPackaged) {
		globalShortcut.register("Control+Shift+I", () => {
			console.log("Ctrl+Shift+I shortcut triggered");
			if (BrowserWindow.getFocusedWindow()?.webContents.isDevToolsOpened()) {
				BrowserWindow.getFocusedWindow()?.webContents.closeDevTools();
			} else {
				BrowserWindow.getFocusedWindow()?.webContents.openDevTools({
					mode: "undocked",
				});
			}
		});
	}

	// Automatically manage development shortcuts and production optimizations
	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	// Set up IPC handlers
	secureHandle("check-first-launch", () => {
		let config = readConfig();
		if (!config) {
			logger.warn("First time using Dione");
			writeConfig(defaultConfig);
			return true;
		}
		if (config.defaultBinFolder !== config.defaultInstallFolder) {
			writeConfig({
				...config,
				defaultBinFolder: config.defaultInstallFolder,
				defaultInstallFolder: config.defaultInstallFolder,
			});
		}
		config = readConfig();
		return false;
	});

	secureHandle("get-codename", () => {
		return readConfig().codename;
	});

	secureHandle("delete-config", () => {
		deleteConfig();
	});

	// remove temp files on exit
	app.on("before-quit", () => {
		try {
			logger.info("Removing temp files on exit...");
			const config = readConfig();
			const binFolder = path.join(
				config?.defaultBinFolder || path.join(app.getPath("userData")),
				"bin",
			);
			const tempFolder = path.join(binFolder, "temp");
			if (fs.existsSync(tempFolder)) {
				fs.rmSync(tempFolder, {
					recursive: true,
					force: true,
				});
			}
		} catch (error) {
			logger.error("Error removing temp files on exit:", error);
		}
	});

	secureOn("ping", () => console.log("pong"));
	secureHandle("backend:get-port", () => port);
	secureHandle("backend:get-socket-credentials", (_event, appId: unknown) => {
		if (
			typeof appId !== "string" ||
			!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(appId)
		)
			throw new Error("Invalid socket application ID");
		return { port, ticket: createSocketTicket(appId) };
	});
	secureHandle(
		"backend:call",
		async (
			event,
			requestId: unknown,
			operation: unknown,
			params: any,
			init: any,
		) => {
			if (
				typeof requestId !== "string" ||
				!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
					requestId,
				) ||
				typeof operation !== "string" ||
				!params ||
				typeof params !== "object" ||
				Array.isArray(params)
			)
				throw new Error("Invalid backend operation");
			const { method, path: requestPath } = resolveBackendRequest(
				operation,
				params,
			);
			if (
				init?.body !== undefined &&
				(typeof init.body !== "string" || init.body.length > 2_000_000)
			)
				throw new Error("Invalid backend request body");
			const contentType =
				init?.headers?.["content-type"] || init?.headers?.["Content-Type"];
			if (contentType !== undefined && typeof contentType !== "string")
				throw new Error("Invalid backend Content-Type");
			const call = backendCalls.begin(requestId, event.sender);
			try {
				const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, {
					method,
					headers: {
						Authorization: `Bearer ${getBackendToken()}`,
						...(contentType ? { "Content-Type": contentType } : {}),
					},
					body: method === "GET" ? undefined : init?.body,
					signal: call.controller.signal,
				});
				const body = await response.text();
				if (body.length > 16_000_000)
					throw new Error("Backend response is too large");
				return {
					status: response.status,
					statusText: response.statusText,
					headers: [...response.headers.entries()],
					body,
				};
			} finally {
				backendCalls.finish(requestId, call);
			}
		},
	);
	secureOn("backend:cancel", (event, requestId: unknown) => {
		if (typeof requestId !== "string") return;
		backendCalls.cancel(requestId, event.sender);
	});

	secureOn("terminal:resize", (_event, payload) => {
		const { id, cols, rows } = payload ?? {};
		if (
			typeof id === "string" &&
			/^[A-Za-z0-9_-]{1,128}$/.test(id) &&
			Number.isInteger(cols) &&
			cols >= 1 &&
			cols <= 500 &&
			Number.isInteger(rows) &&
			rows >= 1 &&
			rows <= 300
		) {
			resizeTerminal(id, cols, rows);
		}
	});

	secureHandle("get-locale", () => {
		return app.getLocale();
	});

	secureHandle("local-script:approve", async (_event, name: unknown) => {
		if (typeof name !== "string") throw new Error("Invalid local script name");
		const appPath = await resolveCanonicalAppPath(name, { mustExist: true });
		const manifestPath = path.join(appPath, "dione.json");
		const result = await dialog.showMessageBox(mainWindow, {
			type: "warning",
			buttons: ["Cancel", "Run unverified script"],
			defaultId: 0,
			cancelId: 0,
			noLink: true,
			title: "Run unverified local script?",
			message: `Allow “${name}” to run native commands?`,
			detail:
				"This local script is not publisher verified. Only continue if you trust its source. Approval is bound to the current manifest and expires after one minute.",
		});
		if (result.response !== 1) return null;
		return createLocalApproval(manifestPath);
	});

	secureHandle("app:close", async () => {
		mainWindow.hide();
		try {
			await requestShutdown();
		} catch (error) {
			logger.error("Error during shutdown:", error);
		} finally {
			app.quit();
		}
	});

	secureHandle("app:minimize", () => {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			win.minimize();
			win.webContents.send("app:minimized");
		}
	});

	// emit restore event
	if (mainWindow) {
		mainWindow.on("restore", () => {
			mainWindow.webContents.send("app:restored");
		});
	}

	secureHandle("get-version", () => app.getVersion());

	// The clipboard module is unavailable in sandboxed preloads, so writes are
	// performed here on behalf of the renderer.
	secureHandle("clipboard:write-text", (_event, text: unknown) => {
		if (typeof text !== "string") throw new TypeError("Invalid clipboard text");
		clipboard.writeText(text);
	});

	// Add Discord presence update handler
	secureHandle(
		"update-discord-presence",
		(_event, details: string, state: string) => {
			updatePresence(details, state);
		},
	);

	// notifications
	secureHandle(
		"notify",
		(_event, title: string, body: string, xml?: string) => {
			if (
				typeof title !== "string" ||
				title.length > 200 ||
				typeof body !== "string" ||
				body.length > 2000 ||
				(xml !== undefined && (typeof xml !== "string" || xml.length > 10_000))
			)
				throw new TypeError("Invalid notification payload");
			const settings = readConfig();
			const options: Electron.NotificationConstructorOptions = {
				title,
				body,
				icon: getIconPath(os.platform()),
				timeoutType: "default",
				toastXml: xml ? xml : undefined,
			};

			if (settings?.enableDesktopNotifications) {
				const notification = new Notification(options);

				notification.show();
			} else {
				logger.warn(
					`Notification attempt... Notifications are disabled. enableDesktopNotifications: ${settings?.enableDesktopNotifications}`,
				);
			}
		},
	);

	// save dir
	secureHandle("save-dir", async (_event, requestedPath: unknown) => {
		const fs = require("node:fs");
		let selectedPath =
			typeof requestedPath === "string" && requestedPath.length <= 4096
				? requestedPath
				: app.getPath("downloads");

		if (selectedPath) {
			// Check if path exists, if not use downloads as fallback
			try {
				if (!fs.existsSync(selectedPath)) {
					console.log(
						`Path does not exist: ${selectedPath}, using downloads as fallback`,
					);
					selectedPath = app.getPath("downloads");
				}
			} catch (err) {
				console.error(`Error checking path: ${err}`);
				selectedPath = app.getPath("downloads");
			}
		}

		console.log(`Opening folder picker with defaultPath: ${selectedPath}`);

		const result = await dialog.showOpenDialog({
			defaultPath: selectedPath,
			properties: ["openDirectory"],
			title: "Select a directory",
			message: "Select a directory",
			securityScopedBookmarks: true,
		});

		console.log(`Folder picker result: ${JSON.stringify(result)}`);

		return result;
	});

	// select file
	secureHandle("select-file", async (_event, requestedPath: unknown) => {
		const selectedPath =
			typeof requestedPath === "string" && requestedPath.length <= 4096
				? requestedPath
				: "";
		const result = await dialog.showOpenDialog({
			defaultPath: selectedPath,
			properties: ["openFile"],
			title: "Select a file",
			message: "Select a file",
			filters: [{ name: "Dione Config File", extensions: ["json"] }],
			securityScopedBookmarks: true,
		});

		return result;
	});

	// check dir
	secureHandle("check-dir", async (_event, dirValue: string) => {
		if (
			typeof dirValue !== "string" ||
			!path.isAbsolute(dirValue) ||
			dirValue.length > 4096
		)
			return false;
		const root = app.isPackaged
			? path.join(path.dirname(app.getPath("exe")))
			: path.join(process.cwd());

		// reject paths that contain whitespace characters
		if (typeof dirValue === "string" && /\s/.test(dirValue)) {
			logger.warn("Directory contains whitespace which is not allowed.");
			return false;
		}

		if (dirValue.toLowerCase() === root.toLowerCase()) {
			logger.warn(
				"Directory is set to the current working directory. This may cause issues.",
			);
			return false;
		}

		return true;
	});

	// update config
	secureHandle("update-config", (_event, newValue: any) => {
		if (!newValue || typeof newValue !== "object" || Array.isArray(newValue)) {
			throw new TypeError("Invalid config payload");
		}
		let currentConfig = readConfig();
		if (!currentConfig) {
			logger.warn("No config found, creating a new one");
			writeConfig(defaultConfig);
			currentConfig = defaultConfig;
		}
		const updatedConfig = { ...currentConfig, ...newValue };

		if (!fs.existsSync(path.join(updatedConfig.defaultInstallFolder, "apps"))) {
			fs.mkdirSync(path.join(updatedConfig.defaultInstallFolder, "apps"), {
				recursive: true,
			});
		}

		if (!fs.existsSync(path.join(updatedConfig.defaultBinFolder, "bin"))) {
			console.log("not exists");
			fs.mkdirSync(path.join(updatedConfig.defaultBinFolder, "bin"), {
				recursive: true,
			});
		}

		writeConfig(updatedConfig);
		logger.info("Config updated successfully");
		return updatedConfig;
	});

	secureHandle("init-env", () => {
		logger.info("Starting with default env...");
		initDefaultEnv();
	});

	// open dir
	secureHandle("open-dir", async (_event, targetPath: unknown) => {
		if (
			typeof targetPath !== "string" ||
			!path.isAbsolute(targetPath) ||
			targetPath.length > 4096
		) {
			throw new TypeError("Invalid path");
		}
		const resolved = path.resolve(targetPath);
		const config = readConfig();
		const roots = [config?.defaultInstallFolder, config?.defaultBinFolder]
			.filter((root): root is string => typeof root === "string")
			.map((root) => path.resolve(root));
		if (
			!roots.some(
				(root) =>
					resolved === root || resolved.startsWith(`${root}${path.sep}`),
			)
		) {
			throw new Error("Path is outside managed directories");
		}
		await shell.openPath(resolved);
	});

	// Open external links
	secureHandle("open-external-link", (_event, url) => {
		return openHttpsExternal(url);
	});

	secureHandle("check-update", () => {
		autoUpdater.checkForUpdates();
	});

	secureHandle("check-update-and-notify", () => {
		autoUpdater.checkForUpdatesAndNotify();
	});

	// export debug logs
	secureHandle("export-debug-logs", async () => {
		try {
			const diagnostics = await prepareDebugExport();
			const consent = await dialog.showMessageBox({
				type: "warning",
				title: "Review Debug Export",
				message: "Review and approve the diagnostic data to export",
				detail: formatDebugExportPreview(diagnostics),
				buttons: ["Cancel", "Continue to Save"],
				defaultId: 0,
				cancelId: 0,
				noLink: true,
			});
			if (consent.response !== 1) {
				return { success: false, canceled: true };
			}

			// show save dialog
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const result = await dialog.showSaveDialog({
				title: "Save Redacted Debug Report",
				defaultPath: `dione-debug-${timestamp}.txt`,
				filters: [
					{ name: "Text Files", extensions: ["txt"] },
					{ name: "All Files", extensions: ["*"] },
				],
			});

			// if user cancelled, return
			if (result.canceled || !result.filePath) {
				return { success: false, canceled: true };
			}

			// export logs to the selected path
			const zipPath = await exportDebugLogs(result.filePath, diagnostics);

			// show the file in explorer/finder
			shell.showItemInFolder(zipPath);

			return { success: true, path: zipPath };
		} catch (error) {
			logger.error("Error exporting debug logs:", error);
			return { success: false, error: String(error) };
		}
	});

	secureOn("restart_app", async () => {
		await requestShutdown();
		autoUpdater.quitAndInstall();
	});

	secureOn("quit_and_install", async () => {
		await requestShutdown();
		autoUpdater.quitAndInstall();
	});

	secureOn("download_and_restart", async () => {
		await autoUpdater.downloadUpdate();
		await requestShutdown();
		autoUpdater.quitAndInstall();
	});

	secureOn("restart", async () => {
		await requestShutdown();
		app.relaunch();
		app.exit();
	});

	function shutdown(): Promise<void> {
		if (shutdownPromise) return shutdownPromise;

		shutdownPromise = (async () => {
			const logFailures = (results: PromiseSettledResult<unknown>[]) => {
				for (const result of results) {
					if (result.status === "rejected") {
						logger.warn("Shutdown cleanup failed:", result.reason);
					}
				}
			};
			const cleanup = (async () => {
				const backendCleanup = Promise.allSettled([
					port
						? fetch(`http://localhost:${port}/ai/ollama/stop`, {
								method: "POST",
								headers: {
									Authorization: `Bearer ${getBackendToken()}`,
								},
							})
						: Promise.resolve(),
				]);
				let backendTimer: ReturnType<typeof setTimeout> | undefined;
				const backendResults = await Promise.race([
					backendCleanup,
					new Promise<null>((resolve) => {
						backendTimer = setTimeout(() => resolve(null), 5000);
					}),
				]);
				if (backendTimer) clearTimeout(backendTimer);
				if (backendResults) logFailures(backendResults);

				logFailures(
					await Promise.allSettled([
						stopAllActiveProcesses(),
						destroyPresence(),
						stopTunnel(),
						stopServer(),
					]),
				);
			})();
			let timeout: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					cleanup,
					new Promise<void>((resolve) => {
						timeout = setTimeout(() => {
							logger.warn("Shutdown cleanup timed out after 10 seconds");
							resolve();
						}, 10000);
					}),
				]);
			} finally {
				if (timeout) clearTimeout(timeout);
			}
		})();
		return shutdownPromise;
	}
	shutdownHandler = shutdown;

	// handle protocols
	if (process.env.NODE_ENV !== "development") {
		app.setAsDefaultProtocolClient("dione");
	}

	// Handle reactivation of the app (e.g., clicking the dock icon on macOS)
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});

	// Get network address for sharing
	secureHandle("get-network-address", async () => {
		const networkIP = getLocalNetworkIP();

		if (!networkIP || !port) {
			return null;
		}

		return {
			ip: networkIP,
			port,
			url: `http://${networkIP}:${port}`,
		};
	});

	// Start tunnel (Localtunnel)
	secureHandle("start-tunnel", async () => {
		try {
			if (!port) {
				throw new Error("Server port not available");
			}

			logger.info("Starting Localtunnel...");
			const tunnelInfo = await startLocaltunnel(port);

			logger.info(`Tunnel started: ${tunnelInfo.url}`);
			return tunnelInfo;
		} catch (error) {
			logger.error("Failed to start tunnel:", error);
			throw error;
		}
	});

	// Stop tunnel
	secureHandle("stop-tunnel", async () => {
		try {
			await stopTunnel();
			logger.info("Tunnel stopped successfully");
			return true;
		} catch (error) {
			logger.error("Failed to stop tunnel:", error);
			throw error;
		}
	});

	// Get current tunnel info
	secureHandle("get-current-tunnel", () => {
		return getCurrentTunnel();
	});

	// Check if tunnel is active
	secureHandle("is-tunnel-active", () => {
		return isTunnelActive();
	});

	// Shorten URL
	secureHandle("shorten-url", async (_event, url: string) => {
		try {
			if (
				typeof url !== "string" ||
				url.length > 2048 ||
				new URL(url).protocol !== "https:"
			)
				return null;
			return await shortenUrl(url);
		} catch (error) {
			logger.error("Failed to shorten URL:", error);
			return null;
		}
	});

	secureHandle("get-logs", async () => {
		return getLogs();
	});

	// removed auth stuff to avoid security risks, read more in README.md
	// handle secure token
	// secureHandle("secure-token:save", (_event, token: string) => {
	// 	return saveToken(token);
	// });

	// secureHandle("secure-token:get", () => {
	// 	return getToken();
	// });

	// secureHandle("secure-token:delete", () => {
	// 	return deleteToken();
	// });

	// secureHandle("secure-token:save-expiresAt", (_event, expiresAt: number) => {
	// 	return saveExpiresAt(expiresAt);
	// });

	// secureHandle("secure-token:get-expiresAt", () => {
	// 	return getExpiresAt();
	// });

	// secureHandle("secure-token:delete-expiresAt", () => {
	// 	return deleteExpiresAt();
	// });

	// secureHandle("secure-token:save-id", (_event, id: string) => {
	// 	return saveId(id);
	// });

	// secureHandle("secure-token:get-id", () => {
	// 	return getId();
	// });

	// secureHandle("secure-token:delete-id", () => {
	// 	return deleteId();
	// });

	// restart backend
	secureHandle("restart-backend", async () => {
		try {
			logger.info("Restarting backend...");
			const stopBackend = Promise.allSettled([stopTunnel(), stopServer()]).then(
				(results) => {
					for (const result of results) {
						if (result.status === "rejected") throw result.reason;
					}
				},
			);
			let restartTimer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					stopBackend,
					new Promise((_, reject) => {
						restartTimer = setTimeout(
							reject,
							10000,
							new Error("Server stop timeout"),
						);
					}),
				]);
			} finally {
				if (restartTimer) clearTimeout(restartTimer);
			}
			port = await startServer();
			updateBackendPortState(port, { broadcast: true });
			logger.info(`Backend restarted successfully on port ${port}`);
			return port;
		} catch (error) {
			logger.error("Error restarting backend:", error);
			throw error;
		}
	});

	// system usage monitoring
	secureHandle("get-system-usage", async () => {
		try {
			try {
				// get cpu usage
				const cpuLoad = await si.currentLoad();
				const cpuUsage = cpuLoad.currentLoad;

				// get memory usage
				const mem = await si.mem();
				const ramUsage = {
					percent: (mem.used / mem.total) * 100,
					usedGB: mem.used / (1024 * 1024 * 1024),
				};

				// get disk usage
				const diskUsage = await si.fsSize();
				const diskUsagePercent = diskUsage[0].used / diskUsage[0].size;

				const result = {
					cpu: cpuUsage,
					ram: ramUsage,
					disk: diskUsagePercent,
				};

				return result;
			} catch (siError) {
				logger.warn(
					"Error getting system usage, returning only ram usage:",
					siError,
				);

				// get memory usage
				const totalMem = os.totalmem();
				const freeMem = os.freemem();
				const usedMem = totalMem - freeMem;
				const ramUsage = {
					percent: (usedMem / totalMem) * 100,
					usedGB: usedMem / (1024 * 1024 * 1024),
				};

				const result = {
					cpu: 0,
					ram: ramUsage,
					disk: 0,
				};

				return result;
			}
		} catch (error) {
			return {
				cpu: 0,
				ram: { percent: 0, usedGB: 0 },
				disk: 0,
			};
		}
	});
});

let previewWindow: BrowserWindow | null = null;

const parseLoopbackPreviewUrl = (value: unknown): string | null => {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "http:" ||
			(url.hostname !== "localhost" && url.hostname !== "127.0.0.1") ||
			!url.port
		)
			return null;
		return url.toString();
	} catch {
		return null;
	}
};

secureOn("new-window", (_event, value) => {
	const url = parseLoopbackPreviewUrl(value);
	if (!url) return;
	if (previewWindow && !previewWindow.isDestroyed()) {
		previewWindow.focus();
		return;
	}

	previewWindow = new BrowserWindow({
		width: 600,
		height: 400,
		autoHideMenuBar: true,
		closable: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			allowRunningInsecureContent: false,
			webviewTag: false,
		},
		...(process.platform === "win32" ? { icon: getIconPath("win32") } : {}),
		...(process.platform === "linux" ? { icon: getIconPath("linux") } : {}),
		...(process.platform === "darwin" ? { icon: getIconPath("darwin") } : {}),
	});

	previewWindow.loadURL(url);
	const previewOrigin = new URL(url).origin;
	previewWindow.webContents.on("will-navigate", (event, target) => {
		const parsed = parseLoopbackPreviewUrl(target);
		if (!parsed || new URL(parsed).origin !== previewOrigin)
			event.preventDefault();
	});
	previewWindow.webContents.on("will-redirect", (event, target) => {
		const parsed = parseLoopbackPreviewUrl(target);
		if (!parsed || new URL(parsed).origin !== previewOrigin)
			event.preventDefault();
	});
	previewWindow.maximize();
	previewWindow.focus();

	previewWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

	previewWindow.on("close", () => {
		console.log("Closing preview window...");
		previewWindow?.destroy();
	});

	previewWindow.on("closed", () => {
		previewWindow = null;
		console.log("Preview window destroyed");
	});
});

secureOn("close-preview-window", () => {
	if (previewWindow) {
		previewWindow.destroy();
	}
});

secureHandle("check-folder-size", async (_event, folderPath) => {
	const config = readConfig();
	const defaultFolder =
		config?.defaultBinFolder ||
		config?.defaultInstallFolder ||
		path.join(app.getPath("userData"));

	const targetFolder = folderPath || path.join(defaultFolder, "bin", "cache");

	if (!fs.existsSync(targetFolder)) {
		console.warn(`Folder does not exist: ${targetFolder}`);
		return "0.00";
	}

	async function getFolderSize(folderPath: string): Promise<number> {
		let totalSize = 0;

		async function walk(dir: string) {
			let files: string[];
			try {
				files = await fs.promises.readdir(dir);
			} catch (err) {
				// Directory might have been deleted between readdir and stat
				console.warn(`Failed to read directory: ${dir}`, err);
				return;
			}

			for (const file of files) {
				const filePath = path.join(dir, file);
				let stat: Awaited<ReturnType<typeof fs.promises.stat>>;
				try {
					stat = await fs.promises.stat(filePath);
				} catch (err) {
					// File might have been deleted between readdir and stat
					console.warn(`Failed to stat file: ${filePath}`, err);
					continue;
				}

				if (stat.isDirectory()) {
					await walk(filePath);
				} else {
					totalSize += stat.size;
				}
			}
		}

		await walk(folderPath);
		return totalSize;
	}

	try {
		const sizeBytes = await getFolderSize(targetFolder);
		const sizeGB = sizeBytes / (1024 * 1024 * 1024);
		return `${sizeGB.toFixed(2)}`;
	} catch (err) {
		console.error("Error occurred in handler for 'check-folder-size':", err);
		return "0.00";
	}
});

const warnFolders = [
	"Desktop",
	"Downloads",
	"Documents",
	"Windows",
	"System",
	"Program Files",
	"Program Files (x86)",
	"ProgramData",
	"Users",
	"WindowsApps",
];

secureHandle("delete-folder", async (_event, folderPath) => {
	const config = readConfig();

	if (
		!(!folderPath && (config?.defaultBinFolder || config?.defaultInstallFolder))
	) {
		return false;
	}
	const targetFolder = path.join(
		config?.defaultBinFolder || path.join(config?.defaultInstallFolder, "bin"),
		"cache",
	);

	if (!fs.existsSync(targetFolder)) {
		console.warn(`Folder does not exist: ${targetFolder}`);
		return true;
	}

	if (warnFolders.includes(path.basename(targetFolder))) {
		dialog.showErrorBox(
			"Warning",
			`You are trying to delete a protected folder: ${targetFolder}`,
		);
		return false;
	}

	try {
		await fs.promises.rm(targetFolder, { recursive: true, force: true });
		return true;
	} catch (error) {
		console.error("Error deleting folder:", error);
		return false;
	}
});

secureHandle("capture-screenshot", async (event, options = {}) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return;

	const image = await win.webContents.capturePage(options?.rect);
	const buffer = image.toJPEG(100);
	const name = `screenshot_${Date.now()}.jpg`;

	const { canceled, filePath } = await dialog.showSaveDialog(win, {
		defaultPath: name,
		filters: [{ name: "JPEG", extensions: ["jpg", "jpeg"] }],
	});

	if (canceled || !filePath) return null;

	await fs.promises.writeFile(filePath, buffer);
	return filePath;
});

// Quit the application when all windows are closed, except on macOS.
app.on("window-all-closed", async () => {
	if (process.platform !== "darwin") {
		await requestShutdown();
		app.quit();
	}
});

// Ensure global shortcuts are released on quit
app.on("will-quit", () => {
	try {
		globalShortcut.unregisterAll();
		logger.info("All global shortcuts unregistered");
	} catch (e) {
		logger.warn("Failed to unregister shortcuts on quit", e);
	}
});

autoUpdater.on("update-available", () => {
	mainWindow.webContents.send("update_available");
});
autoUpdater.on("update-downloaded", () => {
	mainWindow.webContents.send("update_downloaded");
});
