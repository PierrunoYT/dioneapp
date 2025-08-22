export const ru = {
	// common actions and states
	common: {
		cancel: "Отмена",
		loading: "Загрузка...",
		error: "Ошибка",
		success: "Успех",
		pending: "В ожидании",
		back: "Назад",
		unselectAll: "Снять выделение со всех",
		selectAll: "Выделить все",
	},

	// authentication and access related
	noAccess: {
		title: "Присоединяйтесь к списку Dione whitelist",
		description:
			"Dione находится в разработке, и доступ к нему имеют только ограниченное количество пользователей. Присоединяйтесь к нашему списку рассылки прямо сейчас, чтобы получить доступ к будущим версиям нашего приложения.",
		join: "Присоединиться",
		logout: "Выйти",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "Добро пожаловать в",
			subtitle:
				"Спасибо, что присоединились к нам на раннем этапе этого путешествия. Войдите в свою учетную запись, чтобы начать.",
			login: "Войти",
			copyLink: "Скопировать ссылку",
			skipLogin: "Продолжить без входа",
		},
		loggingIn: {
			title: "Вход...",
			authError: "Не удалось аутентифицироваться?",
			goBack: "Вернуться назад",
		},
		languageSelector: {
			title: "Выберите свой язык",
		},
		ready: {
			title: "Вы готовы!",
			subtitle: "Мы рады видеть вас здесь",
			finish: "Завершить",
		},
		clipboard: {
			success:
				"Успешно скопировано в буфер обмена, теперь вставьте его в свой браузер!",
		},
		selectPath: {
			title: "Выберите путь установки",
			button: "Выбрать путь",
			success: "Далее",
		},
	},

	// error handling
	error: {
		title: "Произошла непредвиденная ошибка",
		description:
			"Мы обнаружили непредвиденную ошибку в приложении, приносим извинения за неудобства.",
		return: "Вернуться",
		report: {
			toTeam: "Сообщить команде",
			sending: "Отправка отчета...",
			success: "Отчет отправлен!",
			failed: "Не удалось отправить отчет",
		},
	},

	// account related
	account: {
		title: "Аккаунт",
		logout: "Выйти",
		stats: {
			timeSpent: {
				title: "Время, проведенное",
				subtitle: "за последние 7 дней",
			},
			sessions: {
				title: "Сессии",
				subtitle: "за последние 7 дней",
			},
			shared: {
				title: "Поделено",
				subtitle: "за последние 7 дней",
			},
			streak: {
				title: "Серия",
				subtitle: "последовательных дней",
				days: "дней",
			},
		},
	},

	// toast notifications
	toast: {
		close: "Закрыть",
		install: {
			downloading: "Загрузка %s...",
			starting: "Запуск %s...",
			uninstalling: "Удаление %s...",
			reconnecting: "Переподключение %s...",
			retrying: "Повторная попытка установки %s...",
			success: {
				stopped: "%s успешно остановлен.",
				uninstalled: "%s успешно удален.",
				logsCopied: "Журналы успешно скопированы в буфер обмена.",
				depsInstalled: "Зависимости успешно установлены.",
				shared: "Ссылка для скачивания скопирована в буфер обмена!",
			},
			error: {
				download: "Ошибка при инициировании загрузки: %s",
				start: "Ошибка при запуске %s: %s",
				stop: "Ошибка при остановке %s: %s",
				uninstall: "Ошибка при удалении %s: %s",
				serverRunning: "Сервер уже запущен.",
				tooManyApps:
					"Замедляйся! У вас уже запущено 6 приложений одновременно.",
			},
		},
	},

	// titlebar component
	titlebar: {
		closing: {
			title: "Остановка приложений...",
			description:
				"Dione закроется автоматически после закрытия всех открытых приложений.",
		},
	},

	// sidebar component
	sidebar: {
		tagline: "Исследуйте, устанавливайте, внедряйте — в 1 клик.",
		activeApps: "Активные приложения",
		update: {
			title: "Доступно обновление",
			description:
				"Доступна новая версия Dione, пожалуйста, перезапустите приложение, чтобы обновиться.",
			tooltip:
				"Доступно новое обновление, перезапустите Dione, чтобы обновиться.",
		},
		tooltips: {
			library: "Библиотека",
			settings: "Настройки",
			account: "Аккаунт",
			logout: "Выйти",
			login: "Войти",
		},
	},

	// home page
	home: {
		featured: "Рекомендуемые",
		explore: "Исследовать",
	},

	// settings page
	settings: {
		applications: {
			title: "Приложения",
			installationDirectory: {
				label: "Каталог установки",
				description:
					"Выберите, куда будут устанавливаться новые приложения по умолчанию",
			},
			binDirectory: {
				label: "Каталог бинарных файлов",
				description:
					"Выберите, где будут храниться исполняемые файлы приложений для легкого доступа",
			},
			cleanUninstall: {
				label: "Чистая деинсталляция",
				description:
					"Удалять все связанные зависимости при удалении приложений",
			},
			autoOpenAfterInstall: {
				label: "Автоматическое открытие после установки",
				description:
					"Автоматически открывать приложения в первый раз после установки",
			},
			deleteCache: {
				label: "Удалить кеш",
				description: "Удалить все кешированные данные из приложений",
				button: "Удалить кеш",
				deleting: "Удаление...",
				deleted: "Удалено",
				error: "Ошибка",
			},
		},
		interface: {
			title: "Интерфейс",
			displayLanguage: {
				label: "Язык интерфейса",
				description: "Выберите предпочитаемый язык интерфейса",
			},
			helpTranslate: "🤔 Не видите свой язык? Помогите нам добавить больше!",
			compactView: {
				label: "Компактный вид",
				description:
					"Использовать более сжатую компоновку, чтобы разместить больше контента на экране",
			},
		},
		notifications: {
			title: "Уведомления",
			systemNotifications: {
				label: "Системные уведомления",
				description: "Показывать уведомления рабочего стола о важных событиях",
			},
			installationAlerts: {
				label: "Уведомления об установке",
				description: "Получать уведомления о завершении установки приложений",
			},
			discordRPC: {
				label: "Discord Rich Presence",
				description: "Показывать вашу текущую активность в статусе Discord",
			},
		},
		privacy: {
			title: "Конфиденциальность",
			errorReporting: {
				label: "Отчеты об ошибках",
				description:
					"Помогайте улучшать Dione, отправляя анонимные отчеты об ошибках",
			},
		},
		other: {
			title: "Прочее",
			logsDirectory: {
				label: "Каталог журналов",
				description: "Местоположение, где хранятся журналы приложений",
			},
			submitFeedback: {
				label: "Отправить отзыв",
				description:
					"Сообщайте о любых проблемах или неполадках, с которыми вы сталкиваетесь",
				button: "Отправить отчет",
			},
			showOnboarding: {
				label: "Показать онбординг",
				description:
					"Сбросить Dione до исходного состояния и снова показать онбординг для переконфигурации",
				button: "Сбросить",
			},
			variables: {
				label: "Переменные",
				description: "Управление переменными приложений и их значениями",
				button: "Открыть переменные",
			},
		},
	},

	// report form
	report: {
		title: "Опишите проблему",
		description:
			"Пожалуйста, предоставьте подробности о том, что произошло и что вы пытались сделать.",
		placeholder:
			"Пример: Я пытался установить приложение, когда произошла эта ошибка...",
		systemInformationTitle: "Информация о системе",
		disclaimer:
			"Следующая информация о системе и анонимный идентификатор будут включены в ваш отчет.",
		success: "Отчет успешно отправлен!",
		error: "Не удалось отправить отчет. Пожалуйста, попробуйте еще раз.",
		send: "Отправить отчет",
		sending: "Отправка...",
		contribute:
			"Помогите нам сделать этот скрипт совместимым со всеми устройствами",
	},

	// quick launch component
	quickLaunch: {
		title: "Быстрый запуск",
		addApp: "Добавить приложение",
		tooltips: {
			noMoreApps: "Нет доступных приложений для добавления",
		},
		selectApp: {
			title: "Выберите приложение",
			description: "Доступно {count} приложений. Вы можете выбрать до {max}.",
		},
	},

	// missing dependencies modal
	missingDeps: {
		title: "Отсутствуют некоторые зависимости!",
		installing: "Установка зависимостей...",
		install: "Установить",
		logs: {
			initializing: "Инициализация загрузки зависимостей...",
			loading: "Загрузка...",
			connected: "Подключено к серверу",
			disconnected: "Отключено от сервера",
			error: {
				socket: "Ошибка установки сокета",
				install: "❌ Ошибка установки зависимостей: {error}",
			},
			allInstalled: "Все зависимости уже установлены.",
		},
	},

	// delete loading modal
	deleteLoading: {
		uninstalling: {
			title: "Удаление",
			deps: "Удаление зависимостей",
			wait: "пожалуйста, подождите...",
		},
		success: {
			title: "Удалено",
			subtitle: "успешно",
			closing: "Это окно закроется через",
			seconds: "секунды...",
		},
		error: {
			title: "Произошла непредвиденная",
			subtitle: "ошибка",
			hasOccurred: "ошибка",
			deps: "Dione не смог удалить ни одной зависимости, пожалуйста, сделайте это вручную.",
			general:
				"Пожалуйста, попробуйте позже или проверьте журналы для получения дополнительной информации.",
		},
		loading: {
			title: "Загрузка...",
			wait: "Пожалуйста, подождите...",
		},
	},

	// logs component
	logs: {
		loading: "Загрузка...",
		disclaimer:
			"Отображаемые журналы относятся к самому приложению. Если вы видите ошибку, пожалуйста, сначала сообщите о ней разработчикам исходного приложения.",
		status: {
			success: "Успех",
			error: "Ошибка",
			pending: "В ожидании",
		},
	},

	// loading states
	loading: {
		text: "Загрузка...",
	},

	// iframe component
	iframe: {
		back: "Назад",
		openFolder: "Открыть папку",
		openInBrowser: "Открыть в браузере",
		openNewWindow: "Открыть в новом окне",
		fullscreen: "Полноэкранный режим",
		stop: "Стоп",
		reload: "Перезагрузить",
		logs: "Журналы",
	},

	// actions component
	actions: {
		reconnect: "Переподключиться",
		start: "Запустить",
		uninstall: "Удалить",
		install: "Установить",
		publishedBy: "Опубликовано",
	},

	// promo component
	promo: {
		title: "Хотите быть представлены здесь?",
		description: "Представьте свой инструмент нашему сообществу",
		button: "Получить возможность",
	},

	// installed component
	installed: {
		title: "Ваша библиотека",
		empty: {
			title: "У вас нет установленных приложений",
			action: "Установить одно сейчас",
		},
	},

	// local component
	local: {
		title: "Локальные скрипты",
		upload: "Загрузить скрипт",
		noScripts: "Скрипты не найдены",
		deleting: "Удаление скрипта, пожалуйста, подождите...",
		uploadModal: {
			title: "Загрузить скрипт",
			selectFile: "Нажмите, чтобы выбрать файл",
			selectedFile: "Выбранный файл",
			scriptName: "Имя скрипта",
			scriptDescription: "Описание скрипта (необязательно)",
			uploadFile: "Загрузить файл",
			uploading: "Загрузка...",
			errors: {
				uploadFailed:
					"Не удалось загрузить скрипт. Пожалуйста, попробуйте еще раз.",
				uploadError: "Произошла ошибка при загрузке скрипта.",
			},
		},
	},

	// feed component
	feed: {
		noScripts: "Скрипты не найдены",
		errors: {
			notArray: "Полученные данные не являются массивом",
			fetchFailed: "Не удалось получить скрипты",
			notSupported: "К сожалению, %s не поддерживается на вашем %s.",
			notSupportedTitle: "Ваше устройство может быть несовместимо.",
		},
	},

	// search component
	search: {
		placeholder: "Поиск скриптов...",
		filters: {
			audio: "Аудио",
			image: "Изображение",
			video: "Видео",
			chat: "Чат",
		},
	},
} as const;
