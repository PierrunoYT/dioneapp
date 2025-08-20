import { getCurrentPort } from "@renderer/utils/getPort";
import { useToast } from "@renderer/utils/useToast";
import { motion } from "framer-motion";
import { Check, Copy, Search, Trash, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Variable {
	[key: string]: any;
}

export default function VariablesModal({ onClose }: { onClose: () => void }) {
	const [variables, setVariables] = useState<Variable>({});
	const [loading, setLoading] = useState(true);
	const [copied, setCopied] = useState<{ [key: string]: boolean }>({});
	const [searchTerm, setSearchTerm] = useState("");
	const [newVariableModalOpen, setNewVariableModalOpen] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [saving, setSaving] = useState(false);
	const { addToast } = useToast();
	const [pendingRemove, setPendingRemove] = useState<null | {
		key: string;
		value?: string | null;
	}>(null);
	const showToast = (
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
	};

	// fetch variables (extracted so it can be reused after add/remove)
	const fetchVariables = async () => {
		setLoading(true);
		try {
			const port = await getCurrentPort();
			const response = await fetch(`http://localhost:${port}/variables`);
			const data = await response.json();
			setVariables(data);
		} catch (error) {
			console.error("Failed to fetch variables:", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchVariables();
	}, []);

	// add a new key/value
	const handleAddVariable = async () => {
		if (!newKey.trim() || !newValue.trim()) {
			showToast("error", "Key and value are required");
			return;
		}
		setSaving(true);
		try {
			const port = await getCurrentPort();
			const res = await fetch(`http://localhost:${port}/variables`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key: newKey, value: newValue }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(
					err?.error || res.statusText || "Failed to add variable",
				);
			}
			showToast("success", "Variable added");
			setNewKey("");
			setNewValue("");
			setNewVariableModalOpen(false);
			await fetchVariables();
		} catch (e) {
			console.error(e);
			showToast("error", "Failed to add variable");
		} finally {
			setSaving(false);
		}
	};

	// remove whole key
	const handleRemoveKey = async (key: string) => {
		try {
			const port = await getCurrentPort();
			const res = await fetch(
				`http://localhost:${port}/variables/${encodeURIComponent(key)}`,
				{
					method: "DELETE",
				},
			);
			if (!res.ok) throw new Error("Failed to remove key");
			showToast("success", "Variable removed");
			await fetchVariables();
		} catch (e) {
			console.error(e);
			showToast("error", "Failed to remove variable");
		}
	};

	// remove a specific value from a key (used for PATH components)
	const handleRemoveValue = async (key: string, value: any) => {
		try {
			const port = await getCurrentPort();
			const res = await fetch(
				`http://localhost:${port}/variables/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
				{
					method: "DELETE",
				},
			);
			if (!res.ok) throw new Error("Failed to remove value");
			showToast("success", "Value removed");
			await fetchVariables();
		} catch (e) {
			console.error(e);
			showToast("error", "Failed to remove value");
		}
	};

	// shortcut to close
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const handleCopy = async (key: any, value?: any) => {
		try {
			try {
				window.focus?.();
			} catch {}
			if (!value) {
				value = variables;
			}
			await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
			showToast("success", "Copied to clipboard!");
			setCopied({ [key]: true });
			setTimeout(() => setCopied({ [key]: false }), 1000);
		} catch (error) {
			console.error("Failed to copy:", error);
		}
	};

	// check if a variable is a PATH-like variable
	const isPathVariable = (key: string, value: any): boolean => {
		if (typeof value !== "string") return false;

		// path-like variable names
		const pathVariableNames = [
			"PATH",
			"CLASSPATH",
			"PYTHONPATH",
			"NODE_PATH",
			"LD_LIBRARY_PATH",
			"DYLD_LIBRARY_PATH",
			"PKG_CONFIG_PATH",
			"CMAKE_PREFIX_PATH",
		];
		if (pathVariableNames.some((pathKey) => key.toUpperCase() === pathKey)) {
			return true;
		}
		const delimiter = value.includes(";") ? ";" : ":";
		const parts = value.split(delimiter).filter((part) => part.trim() !== "");

		if (parts.length >= 3 && value.length > 50) {
			const pathLikeParts = parts.filter((part) => {
				const trimmed = part.trim();
				// check if looks like a path
				return (
					trimmed.includes("/") ||
					trimmed.includes("\\") ||
					trimmed.match(/^[A-Za-z]:[\\/]/) ||
					trimmed.startsWith("/")
				);
			});
			return pathLikeParts.length >= parts.length * 0.7;
		}

		return false;
	};

	// format path-like variables
	const formatPathVariable = (value: string): string[] => {
		// delimiter (windows ;, unix :)
		const delimiter = value.includes(";") ? ";" : ":";
		return value.split(delimiter).filter((path) => path.trim() !== "");
	};

	// filtered search
	const filteredVariables = searchTerm
		? Object.fromEntries(
				Object.entries(variables).filter(
					([key, value]) =>
						key.toLowerCase().includes(searchTerm.toLowerCase()) ||
						JSON.stringify(value)
							.toLowerCase()
							.includes(searchTerm.toLowerCase()),
				),
			)
		: variables;

	const renderVariableValue = (key: string, value: any) => {
		if (typeof value === "string" && isPathVariable(key, value)) {
			const paths = formatPathVariable(value);
			return (
				<div className="space-y-1">
					{paths.map((path, index) => (
						<div key={index} className="flex items-center gap-2 group">
							<span className="text-neutral-500 text-xs w-6 flex-shrink-0">
								{index + 1}.
							</span>
							<code className="flex-1 text-sm bg-white/5 px-2 py-1 rounded border border-white/10 break-all">
								{path}
							</code>
							<button
								onClick={() => handleCopy(index + 1, path)}
								className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-white transition-all flex-shrink-0"
								title="Copy path"
							>
								{copied[index + 1] ? (
									<Check className="w-3 h-3" />
								) : (
									<Copy className="w-3 h-3" />
								)}
							</button>
						</div>
					))}
				</div>
			);
		}

		if (typeof value === "string") {
			return <span className="break-all">{value}</span>;
		}

		return (
			<pre className="whitespace-pre-wrap">
				{JSON.stringify(value, null, 2)}
			</pre>
		);
	};

	return (
		<motion.div
			id="modal"
			className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center p-4 justify-center overflow-hidden"
			style={{
				isolation: "isolate",
				willChange: "backdrop-filter",
				zIndex: 2000,
			}}
			onClick={onClose}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{ duration: 0.2, ease: "easeInOut" }}
		>
			<div
				className="bg-neutral-900 rounded-xl max-w-5xl xl:max-w-7xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-white/10 pointer-events-auto"
				onClick={(e) => e.stopPropagation()}
				onWheel={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between p-6 border-b border-white/10">
					<div className="flex items-center gap-4">
						<h2 className="text-xl font-semibold text-white">
							Environment Variables
						</h2>
						<span className="text-sm text-neutral-400 bg-white/10 px-2 py-1 rounded-full">
							{Object.keys(filteredVariables).length} variables
						</span>
					</div>
					{/* remove alert */}
					{pendingRemove && (
						<div className="absolute inset-0 z-[2500] flex items-center justify-center bg-black/60">
							<div className="bg-neutral-800 border border-white/10 rounded-lg p-4 max-w-lg w-full mx-4">
								<p className="text-sm text-neutral-300 mb-3">
									Are you sure you want to remove{" "}
									{pendingRemove.value
										? "this value"
										: "the key and all its values"}{" "}
									from <span className="font-mono">{pendingRemove.key}</span>?
								</p>
								<div className="flex justify-end gap-2">
									<button
										onClick={() => setPendingRemove(null)}
										className="px-4 text-sm py-1 rounded-full bg-white/5"
									>
										Cancel
									</button>
									<button
										onClick={async () => {
											if (pendingRemove.value)
												await handleRemoveValue(
													pendingRemove.key,
													pendingRemove.value,
												);
											else await handleRemoveKey(pendingRemove.key);
											setPendingRemove(null);
										}}
										className="px-4 text-sm py-1 rounded-full bg-red-600/50 hover:bg-red-600/60 text-white"
									>
										Confirm
									</button>
								</div>
							</div>
						</div>
					)}
					<div className="flex items-center gap-2">
						<button
							onClick={() => setNewVariableModalOpen(!newVariableModalOpen)}
							className="w-full rounded-full bg-white/10 px-4 p-1 mr-2 flex justify-center items-center gap-2 hover:bg-white/20 cursor-pointer"
						>
							<span className="text-xs text-neutral-300">Add key</span>
						</button>
						<button
							onClick={() => handleCopy("general")}
							className="p-1 hover:text-white rounded-lg transition-colors text-neutral-400"
							title="Copy all to clipboard"
						>
							{copied["general"] ? (
								<Check className="w-4 h-4" />
							) : (
								<Copy className="w-4 h-4" />
							)}
						</button>
						<button
							onClick={onClose}
							className="p-1 rounded-lg transition-colors text-neutral-400 hover:text-white"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>
				<div className="p-4 border-b border-white/10">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
						<input
							type="text"
							placeholder="Search variables..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full bg-white/10 border border-white/5 text-white placeholder-neutral-400 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BCB1E7] focus:border-[#BCB1E7]/50"
						/>
					</div>
				</div>
				{newVariableModalOpen && (
					<div className="p-4 border-b border-white/10">
						<div className="w-full mx-auto space-y-3">
							<input
								type="text"
								placeholder="Key (e.g. MY_VAR)"
								value={newKey}
								onChange={(e) => setNewKey(e.target.value)}
								className="w-full bg-white/10 border border-white/10 text-white placeholder-neutral-400 px-3 py-2 rounded-lg focus:outline-none pointer-events-auto"
							/>
							<textarea
								placeholder="Value"
								value={newValue}
								onChange={(e) => setNewValue(e.target.value)}
								className="w-full bg-white/10 border border-white/10 text-white placeholder-neutral-400 px-3 py-2 rounded-lg focus:outline-none h-24 resize-none pointer-events-auto"
							/>
							<div className="flex justify-end gap-2">
								<button
									onClick={() => setNewVariableModalOpen(false)}
									className="px-4 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white text-sm disabled:opacity-60"
								>
									Cancel
								</button>
								<button
									onClick={handleAddVariable}
									disabled={saving}
									className="px-4 py-1 rounded-full bg-white hover:bg-white/80 text-black text-sm disabled:opacity-60"
								>
									{saving ? "Adding..." : "Add variable"}
								</button>
							</div>
						</div>
					</div>
				)}
				<div className="flex-1 overflow-auto p-6">
					{loading ? (
						<div className="flex items-center justify-center h-32">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
						</div>
					) : (
						<div className="space-y-4">
							{Object.entries(filteredVariables).map(([key, value]) => (
								<div
									key={key}
									className="bg-white/5 rounded-lg p-4 border border-white/10"
								>
									<div className="flex items-start justify-between gap-4 mb-3">
										<div className="flex items-center gap-2">
											<h3 className="text-sm font-medium text-[#BCB1E7]">
												{key}
											</h3>
										</div>
										<div className="flex items-center gap-2">
											<button
												onClick={() => handleCopy(key, value)}
												className="p-1 rounded text-neutral-400 hover:text-white flex-shrink-0"
												title="Copy full value"
											>
												{copied[key] ? (
													<Check className="w-3 h-3" />
												) : (
													<Copy className="w-3 h-3" />
												)}
											</button>
											<button
												onClick={() => setPendingRemove({ key })}
												className="p-1 rounded text-red-400 hover:text-red-200 flex-shrink-0"
												title="Delete key"
											>
												<Trash className="w-3 h-3" />
											</button>
										</div>
									</div>
									<div className="text-sm text-neutral-300 font-mono">
										{typeof value === "string" && isPathVariable(key, value) ? (
											<div className="space-y-1">
												{formatPathVariable(value).map((path, index) => (
													<div
														key={index}
														className="flex items-center gap-2 group"
													>
														<span className="text-neutral-500 text-xs w-6 flex-shrink-0">
															{index + 1}.
														</span>
														<>
															<code className="flex-1 text-sm bg-white/5 px-2 py-1 rounded border border-white/10 break-all">
																{path}
															</code>
															<div className="flex items-center gap-0 opacity-0 group-hover:opacity-100">
																<button
																	onClick={() =>
																		handleCopy(`${key}-${index}`, path)
																	}
																	className="p-1 rounded text-neutral-400 hover:text-white"
																>
																	<Copy className="w-3 h-3" />
																</button>
																<button
																	onClick={() =>
																		setPendingRemove({ key, value: path })
																	}
																	className="p-1 rounded text-red-400 hover:text-red-200"
																>
																	<Trash className="w-3 h-3" />
																</button>
															</div>
														</>
													</div>
												))}
											</div>
										) : (
											renderVariableValue(key, value)
										)}
									</div>
								</div>
							))}
							{Object.keys(filteredVariables).length === 0 && searchTerm && (
								<div className="text-center text-neutral-400 py-8">
									No variables found matching "{searchTerm}"
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
}
