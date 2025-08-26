export const ar = {
	// common actions and states
	common: {
		cancel: "إلغاء",
		loading: "جارٍ التحميل...",
		error: "خطأ",
		success: "نجاح",
		pending: "قيد الانتظار",
		back: "رجوع",
		unselectAll: "إلغاء تحديد الكل",
		selectAll: "تحديد الكل",
	},

	// authentication and access related
	noAccess: {
		title: "انضم إلى قائمة الانتظار لـ Dione",
		description:
			"Dione قيد الإنشاء ويمكن لعدد محدود فقط من المستخدمين الوصول إليه، انضم إلى قائمة الانتظار الخاصة بنا الآن للوصول إلى الإصدارات المستقبلية من تطبيقنا.",
		join: "انضمام",
		logout: "تسجيل الخروج",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "مرحبًا بك في",
			subtitle:
				"شكرًا لانضمامك إلينا مبكرًا في هذه الرحلة. قم بتسجيل الدخول إلى حسابك للبدء.",
			login: "تسجيل الدخول",
			copyLink: "نسخ الرابط",
			skipLogin: "متابعة بدون تسجيل الدخول",
		},
		loggingIn: {
			title: "جارٍ تسجيل الدخول...",
			authError: "هل تعذر المصادقة؟",
			goBack: "العودة",
		},
		languageSelector: {
			title: "اختر لغتك",
		},
		ready: {
			title: "أنت جاهز!",
			subtitle: "يسعدنا وجودك هنا",
			finish: "إنهاء",
		},
		clipboard: {
			success:
				"تم النسخ إلى الحافظة بنجاح، قم بلصقه الآن في متصفحك!",
		},
		selectPath: {
			title: "اختر مسار التثبيت",
			button: "اختر مسارًا",
			success: "التالي",
		},
	},

	// error handling
	error: {
		title: "حدث خطأ غير متوقع",
		description:
			"لقد اكتشفنا خطأ غير متوقع في التطبيق، نعتذر عن الإزعاج.",
		return: "عودة",
		report: {
			toTeam: "إبلاغ الفريق",
			sending: "جارٍ إرسال التقرير...",
			success: "تم إرسال التقرير!",
			failed: "فشل إرسال التقرير",
		},
	},

	// account related
	account: {
		title: "الحساب",
		logout: "تسجيل الخروج",
		stats: {
			timeSpent: {
				title: "الوقت المستغرق",
				subtitle: "في آخر 7 أيام",
			},
			sessions: {
				title: "الجلسات",
				subtitle: "في آخر 7 أيام",
			},
			shared: {
				title: "المشاركة",
				subtitle: "في آخر 7 أيام",
			},
			streak: {
				title: "سلسلة",
				subtitle: "أيام متتالية",
				days: "أيام",
			},
		},
	},

	// toast notifications
	toast: {
		close: "إغلاق",
		install: {
			downloading: "جارٍ تنزيل %s...",
			starting: "جارٍ بدء %s...",
			uninstalling: "جارٍ إلغاء تثبيت %s...",
			reconnecting: "جارٍ إعادة الاتصال بـ %s...",
			retrying: "جارٍ محاولة تثبيت %s مرة أخرى...",
			success: {
				stopped: "توقف %s بنجاح.",
				uninstalled: "تم إلغاء تثبيت %s بنجاح.",
				logsCopied: "تم نسخ السجلات بنجاح إلى الحافظة.",
				depsInstalled: "تم تثبيت التبعيات بنجاح.",
				shared: "تم نسخ رابط التنزيل إلى الحافظة!",
			},
			error: {
				download: "خطأ في بدء التنزيل: %s",
				start: "خطأ في بدء %s: %s",
				stop: "خطأ في إيقاف %s: %s",
				uninstall: "خطأ في إلغاء تثبيت %s: %s",
				serverRunning: "الخادم قيد التشغيل بالفعل.",
				tooManyApps:
					"أبطئ! لديك بالفعل 6 تطبيقات قيد التشغيل في نفس الوقت.",
			},
		},
	},

	// titlebar component
	titlebar: {
		closing: {
			title: "جارٍ إيقاف التطبيقات...",
			description:
				"سيتم إغلاق Dione تلقائيًا بعد إغلاق جميع التطبيقات المفتوحة.",
		},
	},

	// sidebar component
	sidebar: {
		tagline: "استكشف، قم بالتثبيت، ابتكر — بنقرة واحدة.",
		activeApps: "التطبيقات النشطة",
		update: {
			title: "تحديث متاح",
			description:
				"إصدار جديد من Dione متاح، يرجى إعادة تشغيل التطبيق للتحديث.",
			tooltip: "تحديث جديد متاح، يرجى إعادة تشغيل Dione للتحديث.",
		},
		tooltips: {
			library: "المكتبة",
			settings: "الإعدادات",
			account: "الحساب",
			logout: "تسجيل الخروج",
			login: "تسجيل الدخول",
		},
	},

	// home page
	home: {
		featured: "مميز",
		explore: "استكشاف",
	},

	// settings page
	settings: {
		applications: {
			title: "التطبيقات",
			installationDirectory: {
				label: "دليل التثبيت",
				description:
					"اختر مكان تثبيت التطبيقات الجديدة افتراضيًا",
			},
			binDirectory: {
				label: "دليل bin",
				description:
					"اختر مكان تخزين ملفات التطبيق الثنائية لسهولة الوصول",
			},
			cleanUninstall: {
				label: "إلغاء تثبيت نظيف",
				description:
					"إزالة جميع التبعيات ذات الصلة عند إلغاء تثبيت التطبيقات",
			},
			autoOpenAfterInstall: {
				label: "الفتح التلقائي بعد التثبيت",
				description:
					"افتح التطبيقات تلقائيًا لأول مرة بعد التثبيت",
			},
			deleteCache: {
				label: "حذف ذاكرة التخزين المؤقت",
				description: "إزالة جميع البيانات المخزنة مؤقتًا من التطبيقات",
				button: "حذف ذاكرة التخزين المؤقت",
				deleting: "جارٍ الحذف...",
				deleted: "تم الحذف",
				error: "خطأ",
			},
		},
		interface: {
			title: "الواجهة",
			displayLanguage: {
				label: "لغة الواجهة",
				description: "اختر لغة الواجهة المفضلة لديك",
			},
			helpTranslate: "🤔 لا ترى لغتك؟ ساعدنا في إضافة المزيد!",
			compactView: {
				label: "عرض مدمج",
				description:
					"استخدم تخطيطًا أكثر تكثيفًا لتناسب المزيد من المحتوى على الشاشة",
			},
		},
		notifications: {
			title: "الإشعارات",
			systemNotifications: {
				label: "إشعارات النظام",
				description: "عرض إشعارات سطح المكتب للأحداث الهامة",
			},
			installationAlerts: {
				label: "تنبيهات التثبيت",
				description: "احصل على إشعار عند اكتمال تثبيت التطبيقات",
			},
			discordRPC: {
				label: "Discord Rich Presence",
				description: "عرض نشاطك الحالي في حالة Discord",
			},
		},
		privacy: {
			title: "الخصوصية",
			errorReporting: {
				label: "الإبلاغ عن الأخطاء",
				description: "ساعد في تحسين Dione عن طريق إرسال تقارير أخطاء مجهولة",
			},
		},
		other: {
			title: "أخرى",
			disableAutoUpdate: {
				label: "تعطيل التحديثات التلقائية",
				description:
					"يعطل التحديثات التلقائية. تحذير: قد يفتقد تطبيقك الإصلاحات الهامة أو التصحيحات الأمنية. لا يُنصح بهذا الخيار لمعظم المستخدمين.",
			},
			logsDirectory: {
				label: "دليل السجلات",
				description: "الموقع الذي يتم فيه تخزين سجلات التطبيق",
			},
			submitFeedback: {
				label: "إرسال ملاحظات",
				description: "الإبلاغ عن أي مشاكل أو صعوبات تواجهها",
				button: "إرسال تقرير",
			},
			showOnboarding: {
				label: "عرض دليل البدء",
				description:
					"إعادة تعيين Dione إلى حالته الأولية وعرض دليل البدء مرة أخرى لإعادة التكوين",
				button: "إعادة تعيين",
			},
			variables: {
				label: "المتغيرات",
				description: "إدارة متغيرات التطبيق وقيمها",
				button: "فتح المتغيرات",
			},
		},
	},

	// report form
	report: {
		title: "صف المشكلة",
		description:
			"يرجى تقديم تفاصيل حول ما حدث وما كنت تحاول القيام به.",
		placeholder:
			"مثال: كنت أحاول تثبيت تطبيق عندما حدث هذا الخطأ...",
		systemInformationTitle: "معلومات النظام",
		disclaimer:
			"سيتم تضمين معلومات النظام التالية ومعرف مجهول مع تقريرك.",
		success: "تم إرسال التقرير بنجاح!",
		error: "فشل إرسال التقرير. يرجى المحاولة مرة أخرى.",
		send: "إرسال تقرير",
		sending: "جارٍ الإرسال...",
		contribute: "ساعدنا في جعل هذا البرنامج النصي متوافقًا مع جميع الأجهزة",
	},

	// quick launch component
	quickLaunch: {
		title: "تشغيل سريع",
		addApp: "إضافة تطبيق",
		tooltips: {
			noMoreApps: "لا توجد تطبيقات متاحة للإضافة",
		},
		selectApp: {
			title: "اختر تطبيقًا",
			description: "تتوفر {count} تطبيقات. يمكنك اختيار ما يصل إلى {max}.",
		},
	},

	// missing dependencies modal
	missingDeps: {
		title: "بعض التبعيات مفقودة!",
		installing: "جارٍ تثبيت التبعيات...",
		install: "تثبيت",
		logs: {
			initializing: "جارٍ تهيئة تنزيل التبعيات...",
			loading: "جارٍ التحميل...",
			connected: "متصل بالخادم",
			disconnected: "غير متصل بالخادم",
			error: {
				socket: "خطأ في إعداد socket",
				install: "❌ خطأ في تثبيت التبعيات: {error}",
			},
			allInstalled: "جميع التبعيات مثبتة بالفعل.",
		},
	},

	// delete loading modal
	deleteLoading: {
		uninstalling: {
			title: "جارٍ إلغاء التثبيت",
			deps: "جارٍ إلغاء تثبيت التبعيات",
			wait: "يرجى الانتظار...",
		},
		success: {
			title: "تم إلغاء التثبيت",
			subtitle: "بنجاح",
			closing: "سيتم إغلاق هذه النافذة في",
			seconds: "ثواني...",
		},
		error: {
			title: "حدث خطأ",
			subtitle: "غير متوقع",
			hasOccurred: "لقد حدث",
			deps: "لم يتمكن Dione من إزالة أي تبعية، يرجى القيام بذلك يدويًا.",
			general: "يرجى المحاولة مرة أخرى لاحقًا أو التحقق من السجلات لمزيد من المعلومات.",
		},
		loading: {
			title: "جارٍ التحميل...",
			wait: "يرجى الانتظار...",
		},
	},

	// logs component
	logs: {
		loading: "جارٍ التحميل...",
		disclaimer:
			"السجلات المعروضة هي من التطبيق نفسه. إذا رأيت خطأ، يرجى الإبلاغ عنه لمطوري التطبيق الأصلي أولاً.",
		status: {
			success: "نجاح",
			error: "خطأ",
			pending: "قيد الانتظار",
		},
	},

	// loading states
	loading: {
		text: "جارٍ التحميل...",
	},

	// iframe component
	iframe: {
		back: "رجوع",
		openFolder: "فتح المجلد",
		openInBrowser: "فتح في المتصفح",
		openNewWindow: "فتح نافذة جديدة",
		fullscreen: "ملء الشاشة",
		stop: "إيقاف",
		reload: "إعادة تحميل",
		logs: "سجلات",
	},

	// actions component
	actions: {
		reconnect: "إعادة الاتصال",
		start: "بدء",
		uninstall: "إلغاء التثبيت",
		install: "تثبيت",
		publishedBy: "نشر بواسطة",
	},

	// promo component
	promo: {
		title: "ترغب في أن يتم عرضك هنا؟",
		description: "اعرض أداتك لمجتمعنا",
		button: "احصل على تمييز",
	},

	// installed component
	installed: {
		title: "مكتبتك",
		empty: {
			title: "ليس لديك أي تطبيقات مثبتة",
			action: "قم بتثبيت واحد الآن",
		},
	},

	// local component
	local: {
		title: "نصوص برمجية محلية",
		upload: "تحميل نص برمجي",
		noScripts: "لم يتم العثور على نصوص برمجية",
		deleting: "جارٍ حذف النص البرمجي، يرجى الانتظار...",
		uploadModal: {
			title: "تحميل نص برمجي",
			selectFile: "انقر لاختيار ملف",
			selectedFile: "الملف المحدد",
			scriptName: "اسم النص البرمجي",
			scriptDescription: "وصف النص البرمجي (اختياري)",
			uploadFile: "تحميل الملف",
			uploading: "جارٍ التحميل...",
			errors: {
				uploadFailed: "فشل تحميل النص البرمجي. يرجى المحاولة مرة أخرى.",
				uploadError: "حدث خطأ أثناء تحميل النص البرمجي.",
			},
		},
	},

	// feed component
	feed: {
		noScripts: "لم يتم العثور على نصوص برمجية",
		errors: {
			notArray: "البيانات المستلمة ليست مصفوفة",
			fetchFailed: "فشل جلب النصوص البرمجية",
			notSupported: "للأسف %s غير مدعوم على %s الخاص بك.",
			notSupportedTitle: "قد يكون جهازك غير متوافق.",
		},
	},

	// search component
	search: {
		placeholder: "البحث عن نصوص برمجية...",
		filters: {
			audio: "صوت",
			image: "صورة",
			video: "فيديو",
			chat: "دردشة",
		},
	},
} as const;