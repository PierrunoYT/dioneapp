import { apiFetch } from "@/utils/api";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScriptsContext } from "./scripts-context";
import type { AIContextType } from "./types/context-types";

const defaultModel = "gemma3:12b";
const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIContextProvider({ children }: { children: React.ReactNode }) {
	const [messages, setMessages] = useState<{ role: string; content: string }[]>(
		[],
	);
	const [messageLoading, setMessageLoading] = useState(false);
	const messagesRef = useRef<{ role: string; content: string }[]>([]);
	const queueRef = useRef<Promise<void>>(Promise.resolve());
	const generationRef = useRef(0);
	const pendingRef = useRef(0);
	const controllersRef = useRef(new Set<AbortController>());
	const mountedRef = useRef(true);
	const [redirecting, setRedirecting] = useState(false);
	const [usingTool, setUsingTool] = useState({ name: "", message: "" });
	const [ollamaStatus, setOllamaStatus] = useState("");
	const [ollamaInstalled, setOllamaInstalled] = useState(false);
	const [ollamaRunning, setOllamaRunning] = useState(false);
	const [ollamaModel, setOllamaModel] = useState("");
	const [ollamaSupport, setOllamaSupport] = useState<string[]>([]);
	const [showInstallModal, setShowInstallModal] = useState<boolean | string>(
		false,
	);
	const [showModelHub, setShowModelHub] = useState(false);
	const [installStep, setInstallStep] = useState<number>(1);
	const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// contexts
	const { sockets, connectApp, disconnectApp } = useScriptsContext();
	const navigate = useNavigate();

	// if you want to start ollama when the app starts, uncomment the following code
	// useEffect(() => {
	//     checkOllama();

	//     return () => {
	//         handleStopOllama();
	//     };
	// }, []);

	useEffect(() => {
		if (showModelHub && ollamaInstalled && !ollamaRunning) {
			handleStartOllama();
		}
	}, [showModelHub]);

	useEffect(() => {
		if (ollamaModel) {
			localStorage.setItem("quick-ai-model", ollamaModel);
		}
	}, [ollamaModel]);

	const checkOllama = async () => {
		const response = await apiFetch(`/ai/ollama/isinstalled`, {
			method: "GET",
		});
		const data = await response.json();
		setOllamaInstalled(data?.installed);
		if (!data?.installed) {
			setOllamaStatus("not installed");
			setShowInstallModal(true);
		} else {
			const model = localStorage.getItem("quick-ai-model");
			if (!model) {
				setOllamaModel(defaultModel);
			}
			setOllamaModel(model || defaultModel);
			setOllamaInstalled(true);
			setOllamaStatus("starting");
			const response = await handleStartOllama();
			const result = await response?.json();
			if (result?.message.includes("Ollama server started")) {
				setOllamaStatus("running");
				setOllamaRunning(true);
			} else {
				setOllamaStatus("error");
			}
		}
		return data;
	};

	async function downloadOllama() {
		const isInstalled = await apiFetch("/ai/ollama/isinstalled", {
			method: "GET",
		});
		const data = await isInstalled.json();
		if (data?.installed) {
			console.log("Ollama is already installed");
			return;
		}

		setOllamaStatus("installing");
		if (!sockets["ollama"]) {
			await connectApp("ollama", true);
			await new Promise((resolve) => setTimeout(resolve, 500)); // wait for socket to connect
		}

		window.electron.ipcRenderer.invoke(
			"notify",
			"Downloading...",
			`Starting download of Ollama`,
		);
		await apiFetch("/ai/ollama/install", {
			method: "POST",
		});
		setOllamaStatus("installed");
		setOllamaInstalled(true);
		setShowInstallModal(false);
	}

	async function handleStopOllama() {
		if (!ollamaRunning) return;
		await apiFetch("/ai/ollama/stop", {
			method: "POST",
		});

		if (sockets["ollama"]) {
			await disconnectApp("ollama");
			await new Promise((resolve) => setTimeout(resolve, 500)); // wait for socket to disconnect
		}

		setOllamaRunning(false);
		setShowModelHub(false);
	}

	async function handleStartOllama() {
		const response = await apiFetch("/ai/ollama/start", {
			method: "POST",
		});
		if (response.status === 200) {
			setOllamaRunning(true);
			// Connect ollama socket if not already connected
			if (!sockets["ollama"]) {
				await connectApp("ollama", true);
				console.log("Ollama socket connected");
			}
		}
		return response;
	}

	const runChat = async (
		prompt: string,
		quickAI?: boolean,
		code?: {
			context: string;
			name: string;
			path: string;
			workspaceName: string;
			workspaceFiles: any;
			workspacePath: string;
		},
		generation = generationRef.current,
	) => {
		if (generation !== generationRef.current || !mountedRef.current) return;
		const userMessage = { role: "user", content: prompt };
		const newMessages = [...messagesRef.current, userMessage];
		messagesRef.current = newMessages;
		setMessages(newMessages);

		if (!ollamaRunning) {
			await handleStartOllama();
			await new Promise((resolve) => setTimeout(resolve, 500)); // wait for ollama to start
			if (generation !== generationRef.current) return;
		}

		const controller = new AbortController();
		controllersRef.current.add(controller);
		try {
			pendingRef.current++;
			setMessageLoading(true);
			if (quickAI === undefined || quickAI === null) {
				quickAI = true;
			}
			const response = await apiFetch(`/ai/ollama/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messages: newMessages,
					model: ollamaModel,
					support: ollamaSupport,
					quickAI: quickAI,
					code: {
						context: code?.context,
						name: code?.name,
						path: code?.path,
						workspaceName: code?.workspaceName,
						workspaceFiles: code?.workspaceFiles,
					},
				}),
				signal: controller.signal,
			});

			const data = await response.json();
			if (generation !== generationRef.current || !mountedRef.current) return;

			if (data?.error && !redirecting) {
				console.error(data?.message);
				setOllamaStatus(data?.error);
				// setMessages((prev) => [
				//     ...prev,
				//     { role: "assistant", content: data?.message },
				// ]);
				return;
			}

			setUsingTool({ name: "", message: "" });
			const responseMessage = {
				role: "assistant",
				content: data?.message?.content,
			};
			messagesRef.current = [...messagesRef.current, responseMessage];
			setMessages(messagesRef.current);
		} catch (error) {
			if (
				controller.signal.aborted ||
				generation !== generationRef.current ||
				!mountedRef.current
			)
				return;
			const errorMessage = {
				role: "assistant",
				content: "An error occurred while fetching data. Please try again.",
			};
			messagesRef.current = [...messagesRef.current, errorMessage];
			setMessages(messagesRef.current);
		} finally {
			controllersRef.current.delete(controller);
			pendingRef.current = Math.max(0, pendingRef.current - 1);
			if (mountedRef.current) setMessageLoading(pendingRef.current > 0);
		}
	};

	const chat: AIContextType["chat"] = (prompt, quickAI, code) => {
		const generation = generationRef.current;
		const queued = queueRef.current.then(() =>
			runChat(prompt, quickAI, code, generation),
		);
		queueRef.current = queued.catch(() => undefined);
		return queued;
	};

	const clearChat = () => {
		generationRef.current++;
		for (const controller of controllersRef.current) controller.abort();
		controllersRef.current.clear();
		messagesRef.current = [];
		pendingRef.current = 0;
		setMessages([]);
		setMessageLoading(false);
		setUsingTool({ name: "", message: "" });
	};

	useEffect(() => {
		return () => {
			mountedRef.current = false;
			generationRef.current++;
			for (const controller of controllersRef.current) controller.abort();
			controllersRef.current.clear();
		};
	}, []);

	useEffect(() => {
		const socket = sockets["ollama"]?.socket;
		if (socket) {
			console.log("Socket connected");
			socket.on(
				"ollama:navigate-to-app",
				(data: { id: string; action: "navigate" | "start" | "install" }) => {
					if (redirectTimeoutRef.current !== null) {
						clearTimeout(redirectTimeoutRef.current);
					}
					setRedirecting(true);
					console.log("Navigating to app", data);
					navigate(`/install/${data.id}?action=${data.action}`);
					redirectTimeoutRef.current = setTimeout(() => {
						redirectTimeoutRef.current = null;
						setRedirecting(false);
					}, 500);
				},
			);

			socket.on(
				"ollama:using-tool",
				(data: { name: string; message: string; icon: string }) => {
					setUsingTool(data);
				},
			);
		}

		return () => {
			if (redirectTimeoutRef.current !== null) {
				clearTimeout(redirectTimeoutRef.current);
				redirectTimeoutRef.current = null;
			}
			if (socket) {
				socket.off("ollama:navigate-to-app");
				socket.off("ollama:using-tool");
			}
		};
	}, [sockets, navigate]);

	return (
		<AIContext.Provider
			value={{
				messages,
				clearChat,
				messageLoading,
				redirecting,
				setRedirecting,
				usingTool,
				setUsingTool,
				ollamaStatus,
				setOllamaStatus,
				ollamaInstalled,
				setOllamaInstalled,
				ollamaRunning,
				setOllamaRunning,
				ollamaModel,
				setOllamaModel,
				ollamaSupport,
				setOllamaSupport,
				showInstallModal,
				setShowInstallModal,
				showModelHub,
				setShowModelHub,
				installStep,
				setInstallStep,
				chat,
				downloadOllama,
				handleStopOllama,
				handleStartOllama,
				checkOllama,
			}}
		>
			{children}
		</AIContext.Provider>
	);
}

export function useAIContext() {
	const context = useContext(AIContext);
	if (!context) {
		throw new Error("useAIContext must be used within an AIContextProvider");
	}
	return context;
}
