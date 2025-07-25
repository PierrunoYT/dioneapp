import Background from "@renderer/components/first-time/background";
import SureNotLogin from "@renderer/components/first-time/login";
import LanguageSelector from "@renderer/components/first-time/onboarding/language-selector";
import ExecuteSound from "@renderer/components/first-time/sounds/sound";
import Icon from "@renderer/components/icons/icon";
import { getCurrentPort } from "@renderer/utils/getPort";
import { openLink } from "@renderer/utils/openLink";
import {
	saveExpiresAt,
	saveId,
	saveRefreshToken,
} from "@renderer/utils/secure-tokens";
import { useToast } from "@renderer/utils/useToast";
import { AnimatePresence, motion } from "framer-motion";
import { Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuthContext } from "../components/contexts/AuthContext";
import { useTranslation } from "../translations/translationContext";

export default function FirstTime() {
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const { user, setUser, setRefreshSessionToken } = useAuthContext();
	const firstLaunch = localStorage.getItem("firstLaunch");
	const isLogin = searchParams.get("login");
	// toast stuff
	const { addToast } = useToast();
	const showToast = (
		variant: "default" | "success" | "error" | "warning",
		message: string,
		fixed?: "true" | "false",
	) => {
		addToast({
			variant,
			children: message,
			fixed,
		});
	};

	const copyToClipboard = () => {
		navigator.clipboard.writeText("https://getdione.app/auth/login?app=true");
		showToast("success", t("firstTime.clipboard.success"));
	};

	// auth
	const [authToken, setAuthToken] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState<string | null>(null);

	// levels
	const [level, setLevel] = useState(1);
	const [_isTransitioning, setIsTransitioning] = useState(false);
	const [_prevLevel, setPrevLevel] = useState(1);

	// handle level changes with transitions
	const changeLevel = (newLevel) => {
		setPrevLevel(level);
		setIsTransitioning(true);
		setTimeout(() => {
			setLevel(newLevel);
			setTimeout(() => {
				setIsTransitioning(false);
			}, 50);
		}, 500);
	};

	useEffect(() => {
		function shouldRedirect() {
			if (user) {
				if (
					firstLaunch === "true" ||
					firstLaunch === null ||
					isLogin !== "true"
				) {
					changeLevel(3);
				} else {
					changeLevel(4);
				}
			}
		}
		shouldRedirect();
	}, []);

	useEffect(() => {
		const listenForAuthToken = () => {
			window.electron.ipcRenderer.on("auth-token", (_event, authToken) => {
				setAuthToken(authToken);
			});
			window.electron.ipcRenderer.on(
				"refresh-token",
				(_event, refreshToken) => {
					setRefreshToken(refreshToken);
				},
			);
		};
		listenForAuthToken();
	}, []);

	useEffect(() => {
		if (authToken && refreshToken) {
			async function setSessionAPI(token: string, refreshToken: string) {
				const port = await getCurrentPort();
				const response = await fetch(
					`http://localhost:${port}/db/set-session`,
					{
						headers: {
							accessToken: token,
							refreshToken: refreshToken,
							api_key: import.meta.env.LOCAL_API_KEY || "",
						},
					},
				);
				const data = await response.json();
				if (data.session) {
					window.electron.ipcRenderer.send("start-session", {
						user: data.user,
					});
					await saveExpiresAt(data.session.expires_at);
					await saveRefreshToken(data.session.refresh_token);
					setRefreshSessionToken(data.session.refresh_token);
					getUser(data.user.id);
					if (
						firstLaunch === "true" ||
						firstLaunch === null ||
						isLogin !== "true"
					) {
						changeLevel(3);
					} else {
						changeLevel(4);
					}
				}
			}

			setSessionAPI(authToken, refreshToken);
		}
	}, [authToken, refreshToken]);

	async function getUser(id: string) {
		const port = await getCurrentPort();
		const response = await fetch(`http://localhost:${port}/db/user/${id}`, {
			headers: {
				api_key: import.meta.env.LOCAL_API_KEY || "",
			},
		});
		const data = await response.json();
		setUser(data[0]);
		await saveId(data[0].id);
	}

	function onSelectLanguage() {
		changeLevel(4);
	}

	const getContainerClasses = () => {
		return "w-full h-full flex flex-col items-center justify-center z-50";
	};

	return (
		<div className="absolute w-screen h-screen inset-0 z-50 bg-[#080808]/5 overflow-hidden">
			<div className="absolute top-0 w-full h-6" id="titlebar" />
			<ExecuteSound firstLaunch={firstLaunch || "false"} />
			{/* background stuff */}
				<Background />
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1 }}
					className="absolute blur-sm bg-[#BCB1E7]/5 h-full w-full"
					style={{ zIndex: -1 }}
				/>
			<AnimatePresence mode="wait">
				{/* 1 - welcome */}
				{level === 1 && (
					<motion.div
						key={1}
						initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{
							opacity: 0,
							filter: "blur(20px)",
							y: -30,
							transition: { duration: 0.5, delay: 0.0 }
						}}
						transition={{ duration: 0.5, delay: 1 }}
						className={getContainerClasses()}
					>
						<div className="flex flex-col gap-4 justify-center items-center transition-all duration-500">
							<Icon name="Dio" className="w-20 h-20 mb-2" />
							<h1 className="text-6xl font-semibold flex">
								{t("firstTime.welcome.title") + " "}
								<div className="mx-2" />
								{Array.from("Dione").map((char, i) => (
									<motion.span
										key={i}
										initial={{
											opacity: 0,
											y: 30,
											filter: "blur(20px)",
											scale: 1.5,
										}}
										animate={{
											opacity: 1,
											y: 0,
											filter: "blur(0px)",
											scale: 1,
										}}
										transition={{
											delay: 1 + i * 0.1,
											duration: 0.5,
											ease: "easeOut",
										}}
										className="bg-clip-text text-transparent bg-gradient-to-t from-white/80 via-[#BCB1E7] to-[#BCB1E7] inline-block"
									>
										{char}
									</motion.span>
								))}
							</h1>
							<h2 className="text-neutral-400 text-balance text-center max-w-xl">
								{t("firstTime.welcome.subtitle")}
							</h2>
						</div>
						<motion.div className="mt-4 flex flex-col gap-4">
							<motion.button
								type="button"
								initial={{ scale: 0.8 }}
								animate={{ scale: 1 }}
								whileHover={{
									boxShadow: "0 0 50px rgba(188, 177, 231, 0.5)",
								}}
								whileTap={{ scale: 0.95 }}
								transition={{ type: "spring", stiffness: 400, damping: 20 }}
								className="bg-white/10 w-28 rounded-full p-1.5 text-sm text-neutral-300 hover:bg-white/20 transition-colors duration-300 cursor-pointer relative overflow-hidden"
								onClick={() => {
									// changeLevel(2);
									openLink("https://getdione.app/auth/login?app=true");
								}}
							>
								<motion.div
									initial={{ x: "-100%" }}
									animate={{ x: "100%" }}
									transition={{
										duration: 2,
										repeat: Number.POSITIVE_INFINITY,
										repeatDelay: 1.5,
									}}
									className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
								/>
								<span className="relative z-10">
									{t("firstTime.welcome.login")}
								</span>
							</motion.button>
							<button
								type="button"
								className="text-xs text-white opacity-50 flex items-center justify-center gap-1 hover:opacity-80 transition-opacity duration-300 cursor-pointer"
								onClick={copyToClipboard}
							>
								<span>
									<LinkIcon className="w-4 h-4" />
								</span>
								<span>{t("firstTime.welcome.copyLink")}</span>
							</button>
						</motion.div>
						<span
							onClick={() => {
								changeLevel(2);
							}}
							className="absolute bottom-12 text-xs text-white/70 hover:text-white cursor-pointer transition-all duration-300"
						>
							{t("firstTime.welcome.skipLogin")}
						</span>
					</motion.div>
				)}
				{/* 2 - logging in */}
				{/* {level === 2 && (
					<motion.div exit={{ opacity: 0, filter: "blur(20px)" }} transition={{ duration: 0.3 }} key={2} className={getContainerClasses()}>
						<div className="flex flex-col gap-4 justify-center items-center mt-12">
							<h1 className="text-6xl font-semibold">
								{t("firstTime.loggingIn.title")}
							</h1>
						</div>
						<div className="mt-6 flex flex-col gap-4">
							<div className="flex flex-col gap-2 items-center justify-center">
								<h3 className="text-white/50 text-xs">
									{t("firstTime.loggingIn.authError")}
								</h3>
								<button
									type="button"
									className="bg-white/10 w-28 rounded-full p-1.5 text-sm text-neutral-300 hover:bg-white/20 transition-colors duration-300 cursor-pointer"
									onClick={() => {
										changeLevel(1);
									}}
								>
									{t("firstTime.loggingIn.goBack")}
								</button>
							</div>
						</div>
					</motion.div>
				)} */}
				{level === 2 && (
					<motion.div
						className={getContainerClasses()}
					>
						<div className="flex flex-col gap-4 justify-center items-center">
							<SureNotLogin
								onSkip={() => {
									if (firstLaunch === "true" || firstLaunch === null) {
										changeLevel(3);
									} else {
										changeLevel(4);
									}
								}}
								onLogin={() => {
									openLink("https://getdione.app/auth/login?app=true");
								}}
							/>
						</div>
					</motion.div>
				)}
				{/* first time onboarding */}
				{level === 3 && (
					<motion.div
						initial={{ filter: "blur(20px)", y: 30, opacity: 0 }}
						animate={{ filter: "blur(0px)", y: 0, opacity: 1 }}
						exit={{
							opacity: 0,
							y: -30,
							filter: "blur(20px)",
						}}
						transition={{ duration: 0.5 }}
						key={3}
						className={getContainerClasses()}
					>
						<div className="flex flex-col gap-4 justify-center items-center">
							<LanguageSelector onSelectLanguage={onSelectLanguage} />
						</div>
					</motion.div>
				)}
				{/* 4 - ready */}
				{level === 4 && (
					<motion.div
						key={4}
						initial={{ opacity: 0, y: 30, filter: "blur(20px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{
							y: -30,
							filter: "blur(20px)",
							opacity: 0,
						}}
						transition={{ duration: 0.5, ease: [0.42, 0, 0.58, 1] }}
						className={getContainerClasses()}
					>
						<div className="flex flex-col gap-4 justify-center items-center">
							<Icon name="Dio" className="w-20 h-20 mb-2" />
							<h1 className="text-6xl font-semibold">
								{t("firstTime.ready.title")}
							</h1>
							<h2 className="text-neutral-400 text-balance text-center max-w-xl">
								{t("firstTime.ready.subtitle")} {user?.username}
							</h2>
						</div>
						<div className="mt-4 flex flex-col gap-4">
							<div className="flex flex-col items-center justify-center">
								<Link
									to="/?loginFinished=true"
									className="bg-white/10 w-28 rounded-full p-1.5 text-sm text-neutral-300 hover:bg-white/20 transition-colors duration-300 cursor-pointer"
								>
									<span className="text-center w-full flex items-center justify-center">
										{t("firstTime.ready.finish")}
									</span>
								</Link>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
			{/* progress bar */}
			{level !== 2 && (
				<motion.div className="absolute bottom-4 left-1/2 translate-x-[-50%]">
					<div className="flex gap-2">
						{[1, 2, 3, 4].map((lvl) => (
							<div key={lvl} className="py-1">
								<div
									className={`w-6 h-1 rounded-full ${lvl === level ? "bg-[#BCB1E7] w-10" : "bg-white/20"}`}
								/>
							</div>
						))}
					</div>
				</motion.div>
			)}
		</div>
	);
}
