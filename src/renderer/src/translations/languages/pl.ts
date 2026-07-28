export const pl = {
	// common actions and states
	common: {
		cancel: "Anuluj",
		loading: "Ładowanie...",
		error: "Błąd",
		success: "Sukces",
		pending: "Oczekujące",
		back: "Wstecz",
		unselectAll: "Odznacz wszystko",
		selectAll: "Zaznacz wszystko",
	},

	// authentication and access related
	noAccess: {
		title: "Dołącz do wait listy Dione",
		description:
			"Dione jest w trakcie budowy i tylko ograniczona liczba użytkowników ma do niej dostęp. Dołącz do naszej wait listy teraz, aby uzyskać dostęp do przyszłych wersji naszej aplikacji.",
		join: "Dołącz",
		logout: "Wyloguj",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "Witamy w",
			subtitle:
				"Dziękujemy za dołączenie do nas na wczesnym etapie tej podróży. Zaloguj się na swoje konto, aby rozpocząć.",
			login: "Zaloguj się",
			copyLink: "Kopiuj link",
			skipLogin: "Kontynuuj bez logowania",
		},
		loggingIn: {
			title: "Logowanie...",
			authError: "Nie udało się uwierzytelnić",
			goBack: "Wróć",
		},
		languageSelector: {
			title: "Skonfiguruj Dione",
			description: "Wybierz język i ścieżkę instalacji",
			languageSection: "Język",
			installationPathSection: "Ścieżka instalacji",
			pathDescription:
				"Ten folder będzie zawierał wszystkie zainstalowane skrypty, zależności i pliki projektów. Wybierz lokalizację, która jest łatwo dostępna i ma wystarczająco dużo miejsca.",
			selectFolder: "Wybierz folder",
			changeFolder: "Zmień folder",
			proceedButton: "Wybierz język i ścieżkę",
			error: {
				spaces:
					"Wybrana ścieżka nie może zawierać spacji. Proszę wybrać inny folder.",
				updateConfig:
					"Wystąpił błąd podczas aktualizacji konfiguracji. Spróbuj ponownie.",
				samePath:
					"Aby uniknąć błędów przy nowych aktualizacjach, wybierz inną ścieżkę niż plik wykonywalny Dione.",
				general: "Wystąpił błąd podczas wybierania ścieżki. Spróbuj ponownie.",
			},
			success: "Ścieżka skonfigurowana pomyślnie!",
		},
		ready: {
			title: "Wszystko gotowe!",
			subtitle: "Witamy w Dione",
			finish: "Zakończ",
		},
		clipboard: {
			success: "Skopiowano do schowka, teraz wklej to w przeglądarce!",
		},
		navigation: {
			back: "Wstecz",
		},
	},

	// error handling
	error: {
		title: "Wystąpił nieoczekiwany błąd",
		description:
			"Wykryliśmy nieoczekiwany błąd w aplikacji, przepraszamy za niedogodności.",
		return: "Powrót",
		report: {
			toTeam: "Zgłoś zespołowi",
			report: "Zgłoś",
			submit: "Wyślij zgłoszenie",
			sending: "Wysyłanie zgłoszenia...",
			success: "Zgłoszenie wysłane!",
			failed: "Nie udało się wysłać zgłoszenia",
			badContent: "Zgłoś nieodpowiednią treść",
			badContentDescription: "Następnie dodaj informacje o swoim zgłoszeniu do",
		},
	},

	// account related
	account: {
		title: "Konto",
		logout: "Wyloguj",
		stats: {
			timeSpent: {
				title: "Spędzony czas",
				subtitle: "w ostatnich 7 dniach",
			},
			sessions: {
				title: "Sesje",
				subtitle: "w ostatnich 7 dniach",
			},
			shared: {
				title: "Udostępnione",
				subtitle: "w ostatnich 7 dniach",
			},
			streak: {
				title: "Seria",
				subtitle: "kolejne dni",
				days: "dni",
			},
		},
	},

	// toast notifications
	toast: {
		close: "Zamknij",
		install: {
			downloading: "Pobieranie %s...",
			starting: "Uruchamianie %s...",
			uninstalling: "Odinstalowywanie %s...",
			reconnecting: "Ponowne łączenie %s...",
			retrying: "Próba ponownej instalacji %s...",
			success: {
				stopped: "%s zatrzymano pomyślnie.",
				uninstalled: "%s odinstalowano pomyślnie.",
				logsCopied: "Pomyślnie skopiowano logi do schowka.",
				depsInstalled: "Zależności zainstalowane pomyślnie.",
				shared: "Link do pobrania został skopiowany do schowka!",
			},
			error: {
				download: "Błąd podczas inicjowania pobierania: %s",
				start: "Błąd podczas inicjowania %s: %s",
				stop: "Błąd podczas zatrzymywania %s: %s",
				uninstall: "Błąd podczas odinstalowywania %s: %s",
				serverRunning: "Serwer jest już uruchomiony.",
				tooManyApps: "Zwolnij! Masz już uruchomione 6 aplikacji jednocześnie.",
			},
		},
	},

	// titlebar component
	titlebar: {
		closing: {
			title: "Zatrzymywanie aplikacji...",
			description:
				"Dione zamknie się automatycznie po zamknięciu wszystkich otwartych aplikacji.",
		},
	},

	// sidebar component
	sidebar: {
		tagline: "Eksploruj, Instaluj, Innowuj - jednym kliknięciem.",
		activeApps: "Aktywne aplikacje",
		app: "aplikacja",
		apps: "aplikacje",
		running: "uruchomione",
		update: {
			title: "Dostępna aktualizacja",
			description:
				"Dostępna jest nowa wersja Dione, uruchom ponownie aplikację, aby zaktualizować.",
			tooltip:
				"Dostępna nowa aktualizacja, uruchom ponownie Dione, aby zaktualizować.",
		},
		login: {
			title: "Witaj ponownie!",
			description:
				"Zaloguj się na swoje konto Dione, aby uzyskać dostęp do wszystkich funkcji, synchronizować projekty i spersonalizować swoje doświadczenie.",
			loginButton: "Zaloguj się przez Dione",
			later: "Może później",
			waitingTitle: "Oczekiwanie na zalogowanie...",
			waitingDescription: "Dokończ logowanie w przeglądarce aby kontynuować.",
			cancel: "Anuluj",
		},
		tooltips: {
			library: "Biblioteka",
			settings: "Ustawienia",
			account: "Konto",
			logout: "Wyloguj",
			login: "Zaloguj",
			capture: "Zrzut",
		},
	},

	// home page
	home: {
		title: "Strona główna",
		featured: "Polecane",
		explore: "Eksploruj",
	},

	// settings page
	settings: {
		applications: {
			title: "Aplikacje",
			installationDirectory: {
				label: "Katalog instalacyjny",
				description:
					"Wybierz, gdzie domyślnie będą instalowane nowe aplikacje.",
			},
			binDirectory: {
				label: "Katalog binarny",
				description:
					"Wybierz, gdzie będą przechowywane pliki binarne aplikacji dla łatwego dostępu.",
			},
			cleanUninstall: {
				label: "Czyste odinstalowanie",
				description:
					"Usuń wszystkie powiązane zależności podczas odinstalowywania aplikacji.",
			},
			autoOpenAfterInstall: {
				label: "Automatyczne otwieranie po instalacji",
				description:
					"Automatycznie otwieraj aplikacje po raz pierwszy po instalacji.",
			},
			deleteCache: {
				label: "Usuń pamięć podręczną",
				description: "Usuń wszystkie dane z pamięci podręcznej aplikacji.",
				button: "Usuń pamięć podręczną",
				deleting: "Usuwanie...",
				deleted: "Usunięto",
				error: "Błąd",
			},
		},
		interface: {
			title: "Interfejs",
			displayLanguage: {
				label: "Język wyświetlania",
				description: "Wybierz preferowany język interfejsu.",
			},
			helpTranslate: "🤔 Nie widzisz swojego języka? Pomóż nam dodać więcej!",
			theme: {
				label: "Motyw",
				description: "Wybierz motyw kolorystyczny dla aplikacji.",
				themes: {
					default: "Fioletowy Sen",
					midnight: "Północny Błękit",
					ocean: "Morska Głębia",
					forest: "Leśna Noc",
					sunset: "Zachód Słońca",
					royal: "Królewski Fiolet",
				},
			},
			layoutMode: {
				label: "Układ nawigacji",
				description:
					"Wybierz między nawigacją boczną a górną. Tryb paska górnego jest lepszy dla małych ekranów.",
				sidebar: "Pasek boczny",
				topbar: "Pasek górny",
			},
			intenseBackgrounds: {
				label: "Intensywne kolory tła",
				description:
					"Użyj bardziej żywych kolorów tła zamiast subtelnych odcieni.",
			},
			compactView: {
				label: "Widok kompaktowy",
				description:
					"Użyj bardziej skondensowanego układu, aby zmieścić więcej treści na ekranie.",
			},
		},
		notifications: {
			title: "Powiadomienia",
			systemNotifications: {
				label: "Powiadomienia systemowe",
				description: "Pokazuj powiadomienia na pulpicie o ważnych zdarzeniach.",
			},
			installationAlerts: {
				label: "Alerty instalacji",
				description:
					"Otrzymuj powiadomienia po zakończeniu instalacji aplikacji.",
			},
			discordRPC: {
				label: "Discord Rich Presence",
				description: "Pokazuj swoją obecną aktywność w statusie Discord.",
			},
			successSound: {
				label: "Włącz dźwięk sukcesu",
				description:
					"Włącz dźwięk odtwarzany po zakończeniu instalacji aplikacji.",
			},
		},
		privacy: {
			title: "Prywatność",
			errorReporting: {
				label: "Raportowanie błędów",
				description:
					"Pomóż ulepszyć Dione, wysyłając anonimowe raporty o błędach.",
			},
		},
		other: {
			title: "Inne",
			disableAutoUpdate: {
				label: "Wyłącz automatyczne aktualizacje",
				description:
					"Wyłącza automatyczne aktualizacje. Uwaga: twoja aplikacja może przegapić ważne poprawki lub łatki bezpieczeństwa. Ta opcja nie jest zalecana dla większości użytkowników.",
			},
			logsDirectory: {
				label: "Katalog logów",
				description: "Lokalizacja, w której przechowywane są logi aplikacji.",
			},
			exportLogs: {
				label: "Eksportuj logi debugowania",
				description:
					"Eksportuj wszystkie logi i informacje o systemie w pliku zip do debugowania.",
				button: "Eksportuj logi",
			},
			submitFeedback: {
				label: "Wyślij opinię",
				description: "Zgłoś wszelkie problemy, które napotkasz.",
				button: "Wyślij zgłoszenie",
			},
			showOnboarding: {
				label: "Pokaż wprowadzenie",
				description:
					"Zresetuj Dione do stanu początkowego i pokaż ponownie wprowadzenie do konfiguracji.",
				button: "Resetuj",
			},
			variables: {
				label: "Zmienne",
				description: "Zarządzaj zmiennymi aplikacji i ich wartościami.",
				button: "Otwórz zmienne",
			},
			checkUpdates: {
				label: "Sprawdź aktualizacje",
				description:
					"Sprawdź dostępność aktualizacji i powiadom o nowej wersji.",
				button: "Sprawdź aktualizacje",
			},
		},
	},

	// report form
	report: {
		title: "Opisz problem",
		description:
			"Podaj szczegóły dotyczące tego, co się stało i co próbowałeś zrobić.",
		placeholder:
			"Przykład: Próbowałem zainstalować aplikację, gdy wystąpił ten błąd...",
		systemInformationTitle: "Informacje o systemie",
		disclaimer:
			"Poniższe informacje o systemie oraz anonimowy identyfikator zostaną dołączone do Twojego zgłoszenia.",
		success: "Zgłoszenie wysłane pomyślnie!",
		error: "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.",
		send: "Wyślij zgłoszenie",
		sending: "Wysyłanie...",
		contribute:
			"Pomóż nam uczynić ten skrypt kompatybilnym ze wszystkimi urządzeniami",
	},

	// quick launch component
	quickLaunch: {
		title: "Szybkie uruchamianie",
		addApp: "Dodaj aplikację",
		tooltips: {
			noMoreApps: "Brak dostępnych aplikacji do dodania",
		},
		selectApp: {
			title: "Wybierz aplikację",
			description:
				"{count} aplikacji dostępnych. Możesz wybrać maksymalnie {max}.",
		},
	},

	// missing dependencies modal
	missingDeps: {
		title: "Brakuje niektórych zależności!",
		installing: "Instalowanie zależności...",
		install: "Zainstaluj",
		logs: {
			initializing: "Inicjowanie pobierania zależności...",
			loading: "Ładowanie...",
			connected: "Połączono z serwerem",
			disconnected: "Rozłączono z serwerem",
			error: {
				socket: "Błąd konfiguracji gniazda",
				install: "❌ Błąd instalacji zależności: {error}",
			},
			allInstalled: "Wszystkie zależności są już zainstalowane.",
		},
	},

	// install AI modal
	installAI: {
		step1: {
			title: "Poznaj Dio AI",
			description:
				"Twój inteligentny asystent zintegrowany bezpośrednio z Dione. Doświadcz nowego sposobu interakcji z aplikacjami.",
		},
		step2: {
			title: "Funkcje",
			description: "Wszystko, czego potrzebujesz, właśnie tutaj.",
			features: {
				free: {
					title: "Darmowe użycie",
					description: "Brak subskrypcji i ukrytych opłat.",
				},
				local: {
					title: "Przetwarzanie lokalne",
					description: "Działa w całości na twoim sprzęcie.",
				},
				private: {
					title: "Prywatne i bezpieczne",
					description: "Twoje dane nigdy nie opuszczają urządzenia.",
				},
			},
		},
		step3: {
			title: "Zainstaluj Ollama",
			description:
				"Dio AI używa Ollama do pracy z modelami LLM w twoim systemie.",
			installing: "Instalowanie...",
			startingDownload: "Rozpoczynanie pobierania...",
			installNow: "Zainstaluj teraz",
		},
		back: "Wstecz",
		next: "Dalej",
	},

	// delete loading modal
	deleteLoading: {
		confirm: {
			title: "Potwierdź odinstalowanie",
			subtitle: "Wybierz co usunąć",
		},
		dependencies: "Zależności",
		depsDescription: "Wybierz zależności do odinstalowania wraz z aplikacją:",
		uninstall: {
			title: "Odinstaluj",
			deps: "Odinstaluj zależności",
			wait: "proszę czekać...",
		},
		uninstalling: {
			title: "Odinstalowywanie",
			deps: "Odinstalowywanie zależności",
			wait: "Proszę czekać...",
		},
		processing: "Przetwarzanie...",
		success: {
			title: "Odinstalowano",
			subtitle: "pomyślnie",
			closing: "Zamykanie tego okna za",
			seconds: "sekund...",
		},
		autoClosing: "Zamykanie automatyczne...",
		error: {
			title: "Wystąpił",
			subtitle: "nieoczekiwany błąd",
			hasOccurred: "has occurred",
			deps: "Dione nie był w stanie usunąć żadnej zależności, proszę zrobić to ręcznie.",
			general:
				"Spróbuj ponownie później lub sprawdź logi, aby uzyskać więcej informacji.",
		},
		loading: {
			title: "Ładowanie...",
			wait: "Proszę czekać...",
		},
	},

	// logs component
	logs: {
		loading: "Ładowanie...",
		openPreview: "Otwórz podgląd",
		copyLogs: "Kopiuj logi",
		stop: "Zatrzymaj",
		disclaimer:
			"Pokazane logi pochodzą z samej aplikacji. Jeśli widzisz błąd, zgłoś go najpierw twórcom oryginalnej aplikacji.",
		status: {
			success: "Sukces",
			error: "Błąd",
			pending: "Oczekujące",
		},
	},

	// loading states
	loading: {
		text: "Ładowanie...",
	},

	// iframe component
	iframe: {
		back: "Wstecz",
		openFolder: "Otwórz folder",
		openInBrowser: "Otwórz w przeglądarce",
		openNewWindow: "Otwórz w nowym oknie",
		fullscreen: "Pełny ekran",
		stop: "Zatrzymaj",
		reload: "Odśwież",
		logs: "Logi",
	},

	// actions component
	actions: {
		reconnect: "Połącz ponownie",
		start: "Start",
		uninstall: "Odinstaluj",
		install: "Zainstaluj",
		publishedBy: "Opublikowane przez",
		installed: "Zainstalowane",
		notInstalled: "Niezainstalowane",
	},

	// promo component
	promo: {
		title: "Chcesz być tutaj wyróżniony?",
		description: "Zaprezentuj swoje narzędzie naszej społeczności",
		button: "Zostań wyróżniony",
	},

	// installed component
	installed: {
		title: "Twoja biblioteka",
		empty: {
			title: "Nie masz zainstalowanych żadnych aplikacji",
			action: "Zainstaluj teraz jedną",
		},
	},

	// local component
	local: {
		title: "Lokalne skrypty",
		upload: "Prześlij skrypt",
		noScripts: "Nie znaleziono skryptów",
		deleting: "Usuwanie skryptu, proszę czekać...",
		uploadModal: {
			title: "Prześlij skrypt",
			selectFile: "Kliknij, aby wybrać plik",
			selectedFile: "Wybrany plik",
			scriptName: "Nazwa skryptu",
			scriptDescription: "Opis skryptu (opcjonalny)",
			uploadFile: "Prześlij plik",
			uploading: "Przesyłanie...",
			errors: {
				uploadFailed: "Nie udało się przesłać skryptu. Spróbuj ponownie.",
				uploadError: "Wystąpił błąd podczas przesyłania skryptu.",
			},
		},
	},

	// feed component
	feed: {
		noScripts: "Nie znaleziono skryptów",
		loadingMore: "Ładowanie więcej...",
		reachedEnd: "Dotarłeś do końca.",
		notEnoughApps: "Jeśli uważasz, że jest za mało aplikacji,",
		helpAddMore: "proszę pomóż nam dodać więcej",
		viewingCached:
			"Jesteś offline. Wyświetlanie treści z pamięci podręcznej. Funkcje instalacji są wyłączone.",
		errors: {
			notArray: "Pobrane dane nie są tablicą",
			fetchFailed: "Nie udało się pobrać skryptów",
			notSupported: "Niestety %s nie jest obsługiwany na twoim %s.",
			notSupportedTitle: "Twoje urządzenie może być niekompatybilne.",
		},
	},

	// search component
	search: {
		placeholder: "Szukaj skryptów...",
		filters: {
			audio: "Audio",
			image: "Obraz",
			video: "Wideo",
			chat: "Czat",
		},
	},

	// network share modal
	networkShare: {
		title: "Udostępnij",
		modes: {
			local: "Lokalnie",
			public: "Publicznie",
			connecting: "Łączenie...",
		},
		warning: {
			title: "Dostęp publiczny",
			description:
				"Tworzy publiczny adres URL dostępny zewsząd. Udostępniaj tylko zaufanym osobom.",
		},
		local: {
			shareUrl: "Udostępnij URL",
			urlDescription: "Udostępnij ten URL urządzeniom w sieci lokalnej",
			localNetwork: "Sieć lokalna:",
			description:
				"Ten URL działa na urządzeniach podłączonych do tej samej sieci.",
		},
		public: {
			shareUrl: "Publiczny URL",
			urlDescription: "Udostępnij ten URL każdemu, gdziekolwiek na świecie",
			passwordTitle: "Hasło jednorazowe",
			visitorMessage:
				"Odwiedzający mogą musieć wpisać je raz na urządzenie, aby uzyskać dostęp.",
			stopSharing: "Zatrzymaj udostępnianie",
		},
		errors: {
			noAddress: "Nie można pobrać adresu sieciowego. Sprawdź połączenie.",
			loadFailed: "Nie udało się załadować informacji o sieci.",
			noUrl: "Brak URL do skopiowania.",
			copyFailed: "Nie udało się skopiować do schowka.",
			tunnelFailed: "Nie udało się uruchomić tunelu",
		},
	},

	// login features modal
	loginFeatures: {
		title: "Brakuje ci funkcji",
		description: "Zaloguj się do Dione, aby nie przegapić tych funkcji.",
		login: "Zaloguj się",
		skip: "Pomiń",
		features: {
			customReports: {
				title: "Wysyłaj własne zgłoszenia",
				description:
					"Wysyłaj własne zgłoszenia z poziomu aplikacji, co przyspieszy pomoc w przypadku błędów.",
			},
			createProfile: {
				title: "Utwórz profil",
				description:
					"Utwórz profil dla społeczności Dione, aby dać się poznać.",
			},
			syncData: {
				title: "Synchronizuj dane",
				description: "Synchronizuj dane na wszystkich swoich urządzeniach.",
			},
			earlyBirds: {
				title: "Otrzymuj wczesne aktualizacje",
				description:
					"Otrzymuj wczesne aktualizacje i nowe funkcje przed wszystkimi innymi.",
			},
			giveOutLikes: {
				title: "Dawaj polubienia",
				description:
					"Zostawiaj polubienia aplikacjom, które lubisz najbardziej, aby więcej osób z nich korzystało!",
			},
			publishScripts: {
				title: "Publikuj skrypty",
				description: "Publikuj swoje skrypty i dziel się nimi ze światem.",
			},
			achieveGoals: {
				title: "Osiągaj cele",
				description:
					"Osiągaj cele, takie jak używanie Dione przez 7 dni, aby otrzymać darmowe prezenty",
			},
			getNewswire: {
				title: "Otrzymuj newsletter",
				description:
					"Otrzymuj aktualizacje e-mailem, aby nie przegapić nowych funkcji.",
			},
		},
	},

	// editor component
	editor: {
		selectFile: "Wybierz plik, aby rozpocząć edycję",
		previewNotAvailable: "Podgląd niedostępny dla tego pliku.",
		mediaNotSupported:
			"Podgląd dla tego typu multimediów nie jest jeszcze obsługiwany.",
		previewOnly: "Tylko podgląd",
		unsaved: "Niezapisane",
		retry: "Spróbuj ponownie",
		editorLabel: "Edytor",
	},

	// sidebar links
	links: {
		discord: "Discord",
		github: "GitHub",
		dione: "Dione",
		builtWith: "zbudowane z",
	},

	// update notifications
	updates: {
		later: "Później",
		install: "Zainstaluj",
	},

	// iframe actions
	iframeActions: {
		shareOnNetwork: "Udostępnij w sieci",
	},

	// version info
	versions: {
		node: "Node",
		electron: "Electron",
		chromium: "Chromium",
	},

	// connection messages
	connection: {
		retryLater: "Mamy problemy z połączeniem, spróbuj ponownie później.",
	},

	// variables modal
	variables: {
		title: "Zmienne środowiskowe",
		addKey: "Dodaj klucz",
		searchPlaceholder: "Szukaj zmiennych...",
		keyPlaceholder: "Klucz (np. MOJA_ZMIENNA)",
		valuePlaceholder: "Wartość",
		copyAll: "Kopiuj wszystko do schowka",
		confirm: "Potwierdź",
		copyPath: "Kopiuj ścieżkę",
		copyFullValue: "Kopiuj pełną wartość",
		deleteKey: "Usuń klucz",
	},

	// custom commands modal
	customCommands: {
		title: "Uruchom z własnymi parametrami",
		launch: "Uruchom",
	},

	// context menu
	contextMenu: {
		copyPath: "Kopiuj ścieżkę",
		open: "Otwórz",
		reload: "Odśwież",
		rename: "Zmień nazwę",
		delete: "Usuń",
	},

	// file tree
	fileTree: {
		noFiles: "Nie znaleziono plików w tym obszarze roboczym.",
		media: "Media",
		binary: "Binarny",
	},

	// entry name dialog
	entryDialog: {
		name: "Nazwa",
		createFile: "Utwórz plik",
		createFolder: "Utwórz folder",
		renameFile: "Zmień nazwę pliku",
		renameFolder: "Zmień nazwę folderu",
		createInRoot: "To zostanie utworzone w katalogu głównym obszaru roboczego.",
		createInside: "To zostanie utworzone w {path}.",
		currentLocation: "Obecna lokalizacja: {path}.",
		currentLocationRoot:
			"Obecna lokalizacja: katalog główny obszaru roboczego.",
		rename: "Zmień nazwę",
		placeholderFile: "przyklad.ts",
		placeholderFolder: "Nowy Folder",
	},

	// workspace editor
	workspaceEditor: {
		newFile: "Nowy plik",
		newFolder: "Nowy folder",
		retry: "Spróbuj ponownie",
		back: "Wstecz",
		save: "Zapisz",
		openInExplorer: "Otwórz w eksploratorze",
		resolvingPath: "Rozwiązywanie ścieżki...",
		workspace: "Obszar roboczy",
	},

	// header bar
	headerBar: {
		back: "Wstecz",
		openInExplorer: "Otwórz w eksploratorze",
		save: "Zapisz",
	},

	// settings page footer
	settingsFooter: {
		builtWithLove: "zbudowane z ♥",
		getDioneWebsite: "getdione.app",
		version: "Wersja",
		port: "Port",
	},

	// notifications
	notifications: {
		enabled: {
			title: "Powiadomienia włączone",
			description: "Będziesz otrzymywać powiadomienia o ważnych zdarzeniach.",
		},
		learnMore: "Dowiedz się więcej",
	},

	// language selector
	languageSelector: {
		next: "Dalej",
	},

	// onboarding - select path
	selectPath: {
		chooseLocation: "Wybierz lokalizację instalacji",
		changePath: "Zmień ścieżkę",
	},

	// browser compatibility
	browserCompatibility: {
		audioNotSupported: "Twoja przeglądarka nie obsługuje elementu audio.",
		videoNotSupported: "Twoja przeglądarka nie obsługuje elementu video.",
	},

	// library card
	library: {
		official: "Oficjalne",
	},
};
