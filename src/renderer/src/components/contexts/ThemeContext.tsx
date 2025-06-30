import { getCurrentPort } from "@renderer/utils/getPort";
import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(() => {
		// Get initial theme from localStorage or default to dark
		const savedTheme = localStorage.getItem("theme") as Theme;
		return savedTheme && (savedTheme === "light" || savedTheme === "dark") ? savedTheme : "dark";
	});

	// Apply theme to document
	useEffect(() => {
		const root = document.documentElement;
		if (theme === "dark") {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}
	}, [theme]);

	// Update config when theme changes
	const updateThemeConfig = async (newTheme: Theme) => {
		try {
			const port = await getCurrentPort();
			const response = await fetch(`http://localhost:${port}/config`);
			const config = await response.json();
			
			const updateResponse = await fetch(`http://localhost:${port}/config/update`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ...config, theme: newTheme }),
			});

			if (!updateResponse.ok) throw new Error("Failed to update config");
			
			// Update local storage
			localStorage.setItem("theme", newTheme);
			localStorage.setItem("config", JSON.stringify({ ...config, theme: newTheme }));
			window.dispatchEvent(new Event("config-updated"));
		} catch (error) {
			console.error("Error updating theme config:", error);
		}
	};

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
		updateThemeConfig(newTheme);
	};

	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "light" : "dark";
		setTheme(newTheme);
	};

	// Load theme from config on mount
	useEffect(() => {
		const loadThemeFromConfig = async () => {
			try {
				const port = await getCurrentPort();
				const response = await fetch(`http://localhost:${port}/config`);
				const config = await response.json();
				
				if (config.theme && config.theme !== theme) {
					setThemeState(config.theme);
				}
			} catch (error) {
				console.error("Error loading theme from config:", error);
			}
		};

		loadThemeFromConfig();
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}