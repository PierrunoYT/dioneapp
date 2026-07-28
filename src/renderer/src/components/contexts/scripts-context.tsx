import { setupSocket } from "@/components/contexts/scripts/setup-socket";
import type {
	DependencyDiagnosticsState,
	ProgressState,
	ScriptSocketConnection,
	ScriptsContextType,
	ScriptsLogContextType,
} from "@/components/contexts/types/context-types";
import { useTranslation } from "@/translations/translation-context";
import { apiFetch, apiRequest, getBackendPort } from "@/utils/api";
import { isArray, readStoredJson } from "@/utils/local-storage";
import { useLocation, useNavigate } from "@/utils/router";
import { useToast } from "@/utils/use-toast";
import type { Terminal } from "@xterm/xterm";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Socket } from "socket.io-client";

const AppContext = createContext<ScriptsContextType | undefined>(undefined);
const LogContext = createContext<ScriptsLogContextType | undefined>(undefined);
const PREVIEW_POLL_INTERVAL_MS = 3_000;
const PREVIEW_POLL_DEADLINE_MS = 60_000;

const waitForPreviewPoll = (delay: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason ?? new Error("Preview polling aborted"));
			return;
		}
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", handleAbort);
			resolve();
		}, delay);
		const handleAbort = () => {
			clearTimeout(timeout);
			reject(signal.reason ?? new Error("Preview polling aborted"));
		};
		signal.addEventListener("abort", handleAbort, { once: true });
	});

const isLocalAvailable = async (
	port: number,
	signal: AbortSignal,
): Promise<boolean> => {
	try {
		const response = await fetch(`http://localhost:${port}`, { signal });
		if (!response.ok) return false;
		const text = await response.text();
		return text.toLowerCase().includes("<html");
	} catch (error) {
		if (signal.aborted) throw error;
		return false;
	}
};

export function ScriptsContext({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation();
	// socket ref
	const [sockets, setSockets] = useState<
		Record<string, ScriptSocketConnection>
	>({});
	const socketsRef = useRef<Record<string, ScriptSocketConnection>>({});
	const connectingRef = useRef<
		Record<string, { generation: number; promise: Promise<void> } | undefined>
	>({});
	const socketGenerationRef = useRef<Record<string, number>>({});
	const socketRef = useRef<any>(null);
	const terminalStatesRef = useRef<Record<string, Terminal>>({});
	const [exitRef, setExitRef] = useState<boolean>(false);
	const pathname = useLocation().pathname;
	const [installedApps, setInstalledApps] = useState<{ name: string }[]>([]);
	const [socket] = useState<any>(null);
	const [logs, setLogs] = useState<Record<string, string>>({});
	const [statusLog, setStatusLog] = useState<
		Record<string, { status: string; content: string }>
	>({});
	const [isServerRunning, setIsServerRunning] = useState<
		Record<string, boolean>
	>({});
	const [shouldCatch, setShouldCatch] = useState<Record<string, boolean>>({});
	// toast stuff
	const { addToast } = useToast();
	const showToast = useCallback(
		(
			variant: "default" | "success" | "error" | "warning",
			message: string,
			fixed?: "true" | "false",
			button?: boolean,
			buttonText?: string,
			buttonAction?: () => void,
			removeAfter?: number,
		) => {
			addToast({
				variant,
				children: message,
				fixed,
				button,
				buttonText,
				buttonAction,
				removeAfter,
			});
		},
		[addToast],
	);
	// navegation stuff
	const navigate = useNavigate();
	// errors stuff
	const [error, setError] = useState<boolean>(false);
	const errorRef = useRef<Record<string, boolean>>({});
	useEffect(() => {
		if (error === true) {
			showToast(
				"error",
				"We are having connection problems, please try again later.",
				"true",
			);
		}
	}, [error]);
	// missing dependencies stuff
	const [missingDependencies, setMissingDependencies] = useState<
		Record<string, any[]>
	>({});
	const [dependencyDiagnostics, setDependencyDiagnostics] =
		useState<DependencyDiagnosticsState>({});
	// iframe stuff
	const [catchPort, setCatchPort] = useState<Record<string, number>>({});
	const [iframeSrc, setIframeSrc] = useState<Record<string, string>>({});
	const [iframeAvailable, setIframeAvailable] = useState<
		Record<string, boolean>
	>({});
	// data stuff
	const [data, setData] = useState<any | undefined>(undefined);
	const appDataRef = useRef<Record<string, any>>({});
	// show
	const [show, setShow] = useState<Record<string, string>>({});
	// sidebar
	const [apps, setApps] = useState<any[]>([]);
	const [localApps, setLocalApps] = useState<any[]>([]);
	// delete logs
	const [deleteLogs, setDeleteLogs] = useState<any[]>([]);
	// active apps
	const [activeApps, setActiveApps] = useState<any[]>([]);
	const [removedApps, setRemovedApps] = useState<any[]>(() => {
		return readStoredJson("quickLaunchRemovedApps", () => [], isArray);
	});
	const [availableApps, setAvailableApps] = useState<any[]>([]);
	const [appFinished, setAppFinished] = useState<{ [key: string]: boolean }>(
		{},
	);
	// not supported stuff
	const [notSupported, setNotSupported] = useState<
		Record<string, { reasons: string[] }>
	>({});
	// autoopen
	const [wasJustInstalled, setWasJustInstalled] = useState<boolean>(false);
	// progress state
	const [progress, setProgress] = useState<Record<string, ProgressState>>({});
	const lastContentLength = useRef(0);
	const [currentCommand, setCurrentCommand] = useState<Record<string, string>>(
		{},
	);
	const shouldCatchRef = useRef(shouldCatch);
	const previewPollsRef = useRef<
		Record<
			string,
			{ generation: number; controller: AbortController } | undefined
		>
	>({});
	const previewGenerationRef = useRef<Record<string, number>>({});

	useEffect(() => {
		shouldCatchRef.current = shouldCatch;
	}, [shouldCatch]);

	useEffect(() => {
		if (data?.id) appDataRef.current[data.id] = data;
	}, [data]);

	useEffect(() => {
		setData(null);
	}, [pathname]);

	// if app is active show logs instead of actions
	useEffect(() => {
		if (!data?.id) return;
		const isActive = activeApps.some((app) => app.appId === data.id);
		const currentView = show[data.id];
		if (
			isActive &&
			currentView !== "logs" &&
			currentView !== "iframe" &&
			currentView !== "editor"
		) {
			setLogs((prev) => ({
				...prev,
				[data.id]: "",
			}));
			setShow({ [data.id]: "logs" });
		}
	}, [activeApps, data?.id, show]);

	// Initialize installedApps on mount (needed for topbar layout which doesn't render QuickLaunch)
	const initializedRef = useRef(false);
	useEffect(() => {
		if (initializedRef.current) return;
		initializedRef.current = true;
		handleReloadQuickLaunch();
	}, []);

	const handleReloadQuickLaunch = useCallback(async () => {
		try {
			// get all installed apps
			const installedResponse = await apiFetch("/scripts/installed");
			if (!installedResponse.ok) {
				throw new Error(t("runningApps.failedToFetchInstalledApps"));
			}

			const installedData = await installedResponse.json();
			const installedAppNames = Array.isArray(installedData?.apps)
				? installedData.apps
				: [];

			// get details of each app
			const appDetailsPromises = installedAppNames
				.slice(0, 6)
				.map(async (appName: string) => {
					try {
						const existingLocalApp = localApps.find(
							(app) => app.name?.toLowerCase() === appName.toLowerCase(),
						);
						if (existingLocalApp) {
							return {
								...existingLocalApp,
							};
						}

						// try to get from db
						const dbResponse = await apiFetch(
							`/db/search/name/${encodeURIComponent(appName)}`,
						);

						if (dbResponse.ok) {
							const dbData = await dbResponse.json();
							const appData = Array.isArray(dbData) ? dbData[0] : dbData;

							if (appData) {
								return {
									...appData,
									isLocal: false,
								};
							}
						}

						// if not in db, assume it's local
						const localResponse = await apiFetch(
							`/local/get_app/${encodeURIComponent(appName)}`,
						);

						if (localResponse.ok) {
							const localData = await localResponse.json();
							const addIsLocal = {
								...localData,
								isLocal: true,
							};
							setLocalApps((prev) => [...prev, addIsLocal]);
							return addIsLocal;
						}

						console.warn(`No details found for ${appName}`);
						return null;
					} catch (error) {
						console.error(`Error getting details of ${appName}:`, error);
						return null;
					}
				});
			const results = (await Promise.all(appDetailsPromises)).filter(
				(app): app is NonNullable<typeof app> =>
					app !== null && typeof app === "object" && "name" in app,
			);
			setAvailableApps(results);
			setInstalledApps(installedAppNames.map((name) => ({ name })));
			setApps(
				results
					.filter(
						(app) => !removedApps.some((removed) => removed.id === app.id),
					)
					.slice(0, 6),
			);
		} catch (error) {
			console.error("Error in handleReloadQuickLaunch:", error);
			showToast("error", t("runningApps.failedToReloadQuickLaunch"));
		}
	}, [localApps, removedApps, t]);

	const cancelPreviewPolling = useCallback((appId: string) => {
		previewGenerationRef.current[appId] =
			(previewGenerationRef.current[appId] ?? 0) + 1;
		const operation = previewPollsRef.current[appId];
		operation?.controller.abort();
		delete previewPollsRef.current[appId];
	}, []);

	const loadIframe = useCallback(
		async (appId: string, localPort: number) => {
			if (
				!appId ||
				!Number.isInteger(localPort) ||
				localPort < 1 ||
				localPort > 65_535 ||
				previewPollsRef.current[appId]
			) {
				return;
			}

			const generation = (previewGenerationRef.current[appId] ?? 0) + 1;
			previewGenerationRef.current[appId] = generation;
			const controller = new AbortController();
			const operation = { generation, controller };
			previewPollsRef.current[appId] = operation;
			const ownsOperation = () =>
				previewPollsRef.current[appId] === operation &&
				previewGenerationRef.current[appId] === generation;
			const deadlineTimer = setTimeout(() => {
				if (ownsOperation()) {
					controller.abort(new Error("Preview polling deadline exceeded"));
				}
			}, PREVIEW_POLL_DEADLINE_MS);

			setIframeAvailable((prev) => ({ ...prev, [appId]: false }));
			try {
				let available = false;
				while (!available && !controller.signal.aborted) {
					available = await isLocalAvailable(localPort, controller.signal);
					if (!available) {
						await waitForPreviewPoll(
							PREVIEW_POLL_INTERVAL_MS,
							controller.signal,
						);
					}
				}
				if (!available || !ownsOperation()) return;

				const appData = appDataRef.current[appId];
				const appName = appData?.name || "Script";
				setIframeSrc((prev) => ({
					...prev,
					[appId]: `http://localhost:${localPort}`,
				}));
				setShow((prev) => ({ ...prev, [appId]: "iframe" }));
				setIframeAvailable((prev) => ({ ...prev, [appId]: true }));
				showToast("default", `${appName} has opened a preview.`);
				window.dione.notify("Preview...", `${appName} has opened a preview.`);
			} catch (error) {
				if (ownsOperation() && !controller.signal.aborted) {
					console.warn(`Preview polling failed for ${appId}:`, error);
				}
			} finally {
				clearTimeout(deadlineTimer);
				if (ownsOperation()) delete previewPollsRef.current[appId];
			}
		},
		[showToast],
	);

	// multiple logs
	const addLog = useCallback((appId: string, message: string) => {
		setLogs((prevLogs) => ({
			...prevLogs,
			[appId]: (prevLogs[appId] || "") + message,
		}));
	}, []);

	const addLogLine = useCallback(
		(appId: string, message: string) => {
			const finalMessage =
				message.endsWith("\n") || message.endsWith("\r\n")
					? message
					: `${message}\n`;
			addLog(appId, finalMessage);
		},
		[addLog],
	);

	const clearLogs = useCallback((appId: string) => {
		setLogs((prev) => ({ ...prev, [appId]: "" }));
		setStatusLog((prev) => ({
			...prev,
			[appId]: { status: "", content: "" },
		}));
		lastContentLength.current = 0;
		const term = terminalStatesRef.current[appId];
		if (term) {
			term.clear();
			term.reset();
		}
	}, []);

	const getAllAppLogs = useCallback(() => {
		const ansiRegex = /\x1b\[[0-9;?]*[a-zA-Z]/g;
		return Object.values(logs)
			.flat()
			.map((log) => log.replace(ansiRegex, ""));
	}, [logs]);

	const getAppData = useCallback(
		(appId: string) => appDataRef.current[appId],
		[],
	);

	const handleSocketDisconnect = useCallback(
		(appId: string, socket: Socket) => {
			const connection = socketsRef.current[appId];
			if (!connection || connection.socket !== socket) return;
			connection.dispose();
			delete socketsRef.current[appId];
			setSockets({ ...socketsRef.current });
			cancelPreviewPolling(appId);
			setActiveApps((prev) => prev.filter((app) => app.appId !== appId));
			delete errorRef.current[appId];
		},
		[cancelPreviewPolling],
	);

	const connectApp = useCallback(
		async (appId: string, isLocal?: boolean) => {
			const connecting = connectingRef.current[appId];
			if (connecting) return connecting.promise;

			errorRef.current[appId] = false;
			const generation = (socketGenerationRef.current[appId] ?? 0) + 1;
			socketGenerationRef.current[appId] = generation;

			const connectPromise = (async () => {
				const existing = socketsRef.current[appId];
				if (existing) {
					if (existing.socket.connected) return;
					existing.dispose();
					delete socketsRef.current[appId];
					setSockets({ ...socketsRef.current });
				}

				const port = await getBackendPort();
				if (socketGenerationRef.current[appId] !== generation) return;
				const connection = setupSocket({
					appId,
					addLog,
					port,
					setMissingDependencies,
					setDependencyDiagnostics,
					setIframeAvailable,
					setCatchPort,
					loadIframe,
					errorRef,
					showToast,
					setStatusLog,
					setDeleteLogs,
					getAppData,
					shouldCatchRef,
					onDisconnect: handleSocketDisconnect,
					setAppFinished,
					setNotSupported,
					setWasJustInstalled,
					setProgress,
					setShouldCatch,
					setCurrentCommand,
				});
				if (socketGenerationRef.current[appId] !== generation) {
					connection.dispose();
					return;
				}
				socketsRef.current[appId] = {
					...connection,
					isLocal,
				};
				setSockets({ ...socketsRef.current });
			})();

			connectingRef.current[appId] = { generation, promise: connectPromise };
			try {
				await connectPromise;
			} finally {
				if (connectingRef.current[appId]?.generation === generation) {
					delete connectingRef.current[appId];
				}
			}
		},
		[addLog, getAppData, handleSocketDisconnect, loadIframe, showToast],
	);

	const disconnectApp = useCallback(
		(appId: string) => {
			socketGenerationRef.current[appId] =
				(socketGenerationRef.current[appId] ?? 0) + 1;
			delete connectingRef.current[appId];
			cancelPreviewPolling(appId);
			const socketToClose = socketsRef.current[appId];
			if (socketToClose) {
				socketToClose.dispose();
				delete socketsRef.current[appId];
				setSockets({ ...socketsRef.current });
			}
			setIframeAvailable((prev) => ({ ...prev, [appId]: false }));
			setIframeSrc((prev) => {
				if (!prev[appId]) return prev;
				const next = { ...prev };
				delete next[appId];
				return next;
			});

			setDependencyDiagnostics((prev) => {
				if (!prev[appId]) return prev;
				const next = { ...prev };
				delete next[appId];
				return next;
			});

			setActiveApps((prev) => prev.filter((app) => app.appId !== appId));
			delete errorRef.current[appId];
		},
		[cancelPreviewPolling],
	);

	useEffect(
		() => () => {
			for (const operation of Object.values(previewPollsRef.current)) {
				operation?.controller.abort();
			}
			previewPollsRef.current = {};
			for (const connection of Object.values(socketsRef.current)) {
				connection.dispose();
			}
			socketsRef.current = {};
			connectingRef.current = {};
		},
		[],
	);

	// get info about active apps
	useEffect(() => {
		async function fetchAppInfo() {
			const appIds = Object.keys(sockets);
			if (appIds.length === 0) return;

			// get app info
			Promise.all(
				appIds
					.filter((appId) => appId !== "ollama")
					.map((appId) => {
						const isLocal = sockets[appId]?.isLocal || false;
						const endpoint = isLocal
							? `/local/get_id/${encodeURIComponent(appId)}`
							: `/db/search/${encodeURIComponent(appId)}`;

						return apiFetch(endpoint)
							.then((res) => {
								if (!res.ok) throw new Error(`Error getting app info ${appId}`);
								return res.json();
							})
							.then((data) => ({
								appId,
								data,
								isLocal,
							}))
							.catch((error) => {
								console.error(error);
								return {
									appId,
									data: null,
									isLocal,
								};
							});
					}),
			)
				.then((results) => {
					for (const result of results) {
						if (result.data) appDataRef.current[result.appId] = result.data;
					}
					setActiveApps(results);
				})
				.catch((error) => {
					console.error("Error fetching app info for active apps:", error);
				});
		}
		fetchAppInfo();
	}, [sockets]);

	useEffect(() => {
		if (!pathname.includes("/install") && isServerRunning[data?.id]) {
			showToast(
				"default",
				t("runningApps.thereIsAnAppRunningInBackground"),
				"false",
				true,
				"Return",
				() => {
					navigate(
						`/install/${
							sockets[data.id]?.isLocal
								? encodeURIComponent(data.name)
								: data.id
						}?isLocal=${sockets[data.id]?.isLocal}`,
					);
				},
				5000,
			);
		}
	}, [pathname.includes("/install"), isServerRunning[data?.id]]);

	const handleStopApp = useCallback(
		async (appId: string, appName: string) => {
			try {
				await apiRequest(`/scripts/stop/${appName}/${appId}`, {
					method: "GET",
				});

				setShow((prev) => ({ ...prev, [appId]: "actions" }));
				if (!wasJustInstalled) {
					window.dione.notify(
						"Stopping...",
						`${appName} stopped successfully.`,
					);
					showToast("success", `Successfully stopped ${appName}`);
				}
				clearLogs(appId);
				setIsServerRunning((prev) => ({ ...prev, [appId]: false }));
			} catch (error) {
				showToast("error", `Error stopping ${appName}: ${error}`);
				window.dione.notify("Error...", `Error stopping ${appName}: ${error}`);
				addLogLine(appId, `Error stopping ${appName}: ${error}`);
			} finally {
				disconnectApp(appId);
				setAppFinished((prev) => ({ ...prev, [appId]: false }));
				setShouldCatch((prev) => ({ ...prev, [appId]: false }));
				// setCatchPort({ [appId]: 0 });
				handleReloadQuickLaunch();
			}
		},
		[
			catchPort,
			wasJustInstalled,
			clearLogs,
			addLogLine,
			disconnectApp,
			handleReloadQuickLaunch,
		],
	);

	useEffect(() => {
		localStorage.setItem("quickLaunchRemovedApps", JSON.stringify(removedApps));
	}, [removedApps]);

	const mainContextValue = useMemo(
		() => ({
			setInstalledApps,
			installedApps,
			socket,
			isServerRunning,
			setIsServerRunning,
			setData,
			data,
			error,
			setError,
			setIframeAvailable,
			iframeAvailable,
			setMissingDependencies,
			missingDependencies,
			dependencyDiagnostics,
			setDependencyDiagnostics,
			show,
			setShow,
			showToast,
			iframeSrc,
			setIframeSrc,
			catchPort,
			setCatchPort,
			exitRef,
			setExitRef,
			apps,
			setApps,
			socketRef,
			handleReloadQuickLaunch,
			removedApps,
			setRemovedApps,
			availableApps,
			setAvailableApps,
			connectApp,
			disconnectApp,
			sockets,
			activeApps,
			handleStopApp,
			appFinished,
			setAppFinished,
			loadIframe,
			setLocalApps,
			localApps,
			setNotSupported,
			notSupported,
			wasJustInstalled,
			setWasJustInstalled,
			shouldCatch,
			setShouldCatch,
			terminalStatesRef,
			setActiveApps,
			lastContentLength,
			currentCommand,
			setCurrentCommand,
		}),
		[
			installedApps,
			socket,
			isServerRunning,
			data,
			error,
			iframeAvailable,
			missingDependencies,
			dependencyDiagnostics,
			show,
			iframeSrc,
			catchPort,
			exitRef,
			apps,
			handleReloadQuickLaunch,
			removedApps,
			availableApps,
			connectApp,
			disconnectApp,
			sockets,
			activeApps,
			handleStopApp,
			appFinished,
			loadIframe,
			localApps,
			notSupported,
			wasJustInstalled,
			shouldCatch,
			terminalStatesRef,
			setActiveApps,
			lastContentLength,
			currentCommand,
			setCurrentCommand,
		],
	);

	const logContextValue = useMemo(
		() => ({
			logs,
			setLogs,
			addLog,
			addLogLine,
			clearLogs,
			getAllAppLogs,
			statusLog,
			setStatusLog,
			progress,
			setProgress,
			deleteLogs,
			setDeleteLogs,
			lastContentLength,
		}),
		[
			logs,
			addLog,
			addLogLine,
			clearLogs,
			getAllAppLogs,
			statusLog,
			progress,
			deleteLogs,
			lastContentLength,
		],
	);

	return (
		<AppContext.Provider value={mainContextValue}>
			<LogContext.Provider value={logContextValue}>
				{children}
			</LogContext.Provider>
		</AppContext.Provider>
	);
}

export function useScriptsContext() {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("Context must be used within an provider");
	}
	return context;
}

export function useScriptsLogsContext() {
	const context = useContext(LogContext);
	if (!context) {
		throw new Error("Context must be used within an provider");
	}
	return context;
}
