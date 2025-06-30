import { createContext, useContext, useEffect, useState } from "react";

interface ThemeContextType {
	theme: "light" | "dark";
	setTheme: (theme: "light" | "dark") => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<"light" | "dark">("dark");

	useEffect(() => {
		// Load theme from localStorage on mount
		const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
		const config = localStorage.getItem("config");
		
		let themeToSet: "light" | "dark" = "dark"; // default
		
		// Priority: config > localStorage > default
		if (config) {
			try {
				const parsedConfig = JSON.parse(config);
				if (parsedConfig.theme) {
					themeToSet = parsedConfig.theme;
				}
			} catch (error) {
				console.error("Error parsing config for theme:", error);
			}
		} else if (savedTheme) {
			themeToSet = savedTheme;
		}
		
		setTheme(themeToSet);

		// Listen for config updates that might include theme changes
		const handleConfigUpdate = () => {
			const config = localStorage.getItem("config");
			if (config) {
				try {
					const parsedConfig = JSON.parse(config);
					if (parsedConfig.theme && parsedConfig.theme !== theme) {
						setTheme(parsedConfig.theme);
					}
				} catch (error) {
					console.error("Error parsing config for theme:", error);
				}
			}
		};

		window.addEventListener("config-updated", handleConfigUpdate);
		return () => window.removeEventListener("config-updated", handleConfigUpdate);
	}, []);

	useEffect(() => {
		// Apply theme to document root
		document.documentElement.classList.remove("light", "dark");
		document.documentElement.classList.add(theme);
		
		// Save theme to localStorage
		localStorage.setItem("theme", theme);
	}, [theme]);

	const toggleTheme = () => {
		setTheme(theme === "light" ? "dark" : "light");
	};

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}