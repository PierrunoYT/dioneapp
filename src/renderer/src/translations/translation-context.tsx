import { ar } from "@/translations/languages/ar";
import { bn } from "@/translations/languages/bn";
import { de } from "@/translations/languages/de";
import { en } from "@/translations/languages/en";
import { es } from "@/translations/languages/es";
import { fr } from "@/translations/languages/fr";
import { hi } from "@/translations/languages/hi";
import { id } from "@/translations/languages/id";
import { it } from "@/translations/languages/it";
import { ja } from "@/translations/languages/ja";
import { ko } from "@/translations/languages/ko";
import { nl } from "@/translations/languages/nl";
import { pl } from "@/translations/languages/pl";
import { pt } from "@/translations/languages/pt";
import { ru } from "@/translations/languages/ru";
import { sv } from "@/translations/languages/sv";
import { th } from "@/translations/languages/th";
import { tr } from "@/translations/languages/tr";
import { uk } from "@/translations/languages/uk";
import { vi } from "@/translations/languages/vi";
import { zh } from "@/translations/languages/zh";
import { apiJson } from "@/utils/api";
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

// available languages
export const languages = {
	en: "English",
	es: "Spanish",
	ar: "Arabic",
	bn: "Bengali",
	de: "German",
	fr: "French",
	hi: "Hindi",
	id: "Indonesian",
	ja: "Japanese",
	pt: "Portuguese",
	pl: "Polish",
	ru: "Russian",
	zh: "Chinese",
	it: "Italian",
	ko: "Korean",
	tr: "Turkish",
	nl: "Dutch",
	vi: "Vietnamese",
	th: "Thai",
	uk: "Ukrainian",
	sv: "Swedish",
} as const;

type Language = keyof typeof languages;

// context type
type TranslationContextType = {
	t: (key: string) => string;
	language: Language;
	setLanguage: (lang: Language) => void;
};

// create context
const TranslationContext = createContext<TranslationContextType | undefined>(
	undefined,
);

// translations object
const translations = {
	en,
	es,
	ar,
	bn,
	de,
	fr,
	hi,
	id,
	it,
	ja,
	ko,
	nl,
	pt,
	pl,
	ru,
	sv,
	th,
	tr,
	uk,
	vi,
	zh,
} as const;

const mergeLocale = (fallback: unknown, locale: unknown): unknown => {
	if (typeof fallback === "string") {
		return typeof locale === "string" && locale.length > 0 ? locale : fallback;
	}
	if (!fallback || typeof fallback !== "object" || Array.isArray(fallback)) {
		return fallback;
	}
	const source =
		locale && typeof locale === "object" && !Array.isArray(locale)
			? (locale as Record<string, unknown>)
			: {};
	return Object.fromEntries(
		Object.entries(fallback).map(([key, value]) => [
			key,
			mergeLocale(value, source[key]),
		]),
	);
};

const safeTranslations = Object.fromEntries(
	Object.entries(translations).map(([language, locale]) => [
		language,
		mergeLocale(en, locale),
	]),
) as Record<Language, typeof en>;

// helper to get nested translation
const getNestedTranslation = (
	obj: unknown,
	path: string,
): string | undefined => {
	const keys = path.split(".");
	let result: unknown = obj;

	for (const key of keys) {
		if (!result || typeof result !== "object" || !(key in result)) {
			return undefined;
		}
		result = (result as Record<string, unknown>)[key];
	}
	return typeof result === "string" ? result : undefined;
};

// provider component
export function TranslationProvider({ children }: { children: ReactNode }) {
	// Local storage is only a first-paint cache so the UI does not flash English while
	// the configuration loads. The stored configuration is authoritative and replaces it.
	const [language, setLanguageState] = useState<Language>(() => {
		const cached = localStorage.getItem("language") as Language;
		return cached && languages[cached] ? cached : "en";
	});
	// An explicit choice must survive a configuration load that is still in flight.
	const selectedByUser = useRef(false);

	// translation function
	const t = (key: string): string => {
		return (
			getNestedTranslation(safeTranslations[language], key) ??
			getNestedTranslation(en, key) ??
			""
		);
	};

	// Persist only a deliberate selection. Writing on every render of the provider would
	// push the cached value back over the stored preference on startup.
	const setLanguage = useCallback((next: Language) => {
		if (!languages[next]) return;
		selectedByUser.current = true;
		setLanguageState(next);
		localStorage.setItem("language", next);
		apiJson<Record<string, unknown>>("/config", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ language: next }),
		}).catch((error) => {
			console.error("Failed to save language preference: ", error);
		});
	}, []);

	// adopt the stored preference on startup
	useEffect(() => {
		let cancelled = false;
		apiJson<Record<string, unknown>>("/config")
			.then((config) => {
				const stored = config.language as Language;
				if (cancelled || selectedByUser.current) return;
				if (!stored || !languages[stored]) return;
				setLanguageState(stored);
				localStorage.setItem("language", stored);
			})
			.catch((error) => {
				console.error("Failed to load language preference: ", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<TranslationContext.Provider value={{ t, language, setLanguage }}>
			{children}
		</TranslationContext.Provider>
	);
}

// hook to use translations
export function useTranslation() {
	const context = useContext(TranslationContext);
	if (context === undefined) {
		throw new Error("useTranslation must be used within a TranslationProvider");
	}
	return context;
}
