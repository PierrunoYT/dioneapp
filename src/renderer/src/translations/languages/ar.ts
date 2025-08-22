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
		title: "انضم إلى القائمة البيضاء لـ Dione",
		description:
			"Dione قيد الإنشاء ويقتصر الوصول إليه على عدد محدود من المستخدمين، انضم إلى قائمتنا البيضاء الآن للحصول على إمكانية الوصول إلى الإصدارات المستقبلية لتطبيقنا.",
		join: "انضمام",
		logout: "تسجيل الخروج",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "مرحباً بك في",
			subtitle:
				"شكراً لانضمامك إلينا مبكراً في هذه الرحلة. قم بتسجيل الدخول إلى حسابك للبدء.",
			login: "تسجيل الدخول",
			copyLink: "نسخ الرابط",
			skipLogin: "متابعة بدون تسجيل دخول",
		},
		loggingIn: {
			title: "جارٍ تسجيل الدخول...",
			authError: "فشل المصادقة؟",
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
			success: "تم النسخ إلى الحافظة بنجاح، قم بلصقه الآن في متصفحك!",
		},
		selectPath: {
			title: "حدد مسار التثبيت",
			button: "تحديد مسار",
			success: "التالي",
		},
	},

	// error handling
	error: {
		title: "حدث خطأ غير متوقع",
		description: "لقد اكتشفنا خطأ غير متوقع في التطبيق، نعتذر عن الإزعاج.",
		return: "عودة",
		report: {
			toTeam: "الإبلاغ للفريق",
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
				title: "تمت المشاركة",
				subtitle: "في آخر 7 أيام",
			},
			streak: {
				title: "المتابعة",
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
				stopped: "تم إيقاف %s بنجاح.",
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
				tooManyApps: "تمهل! لديك بالفعل 6 تطبيقات قيد التشغيل في نفس الوقت.",
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
		tagline: "استكشف، ثبّت، ابتكر — بنقرة واحدة.",
		activeApps: "التطبيقات النشطة",
		update: {
			title: "يتوفر تحديث",
			description:
				"يتوفر إصدار جديد من Dione، يرجى إعادة تشغيل التطبيق للتحديث.",
			tooltip: "يتوفر تحديث جديد، يرجى إعادة تشغيل Dione للتحديث.",
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
				description: "اختر مكان تثبيت التطبيقات الجديدة افتراضيًا",
			},
			binDirectory: {
				label: "دليل الملفات الثنائية",
				description:
					"اختر مكان تخزين الملفات الثنائية للتطبيقات لسهولة الوصول إليها",
			},
			cleanUninstall: {
				label: "إلغاء تثبيت نظيف",
				description: "إزالة جميع التبعيات ذات الصلة عند إلغاء تثبيت التطبيقات",
			},
			autoOpenAfterInstall: {
				label: "الفتح التلقائي بعد التثبيت",
				description: "فتح التطبيقات تلقائيًا لأول مرة بعد التثبيت",
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
				label: "لغة العرض",
				description: "اختر لغة الواجهة المفضلة لديك",
			},
			helpTranslate: "🤔 هل لا ترى لغتك؟ ساعدنا في إضافة المزيد!",
			compactView: {
				label: "عرض مضغوط",
				description:
					"استخدام تخطيط أكثر تكثيفًا لملاءمة المزيد من المحتوى على الشاشة",
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
				description: "تلقي إشعارات عند اكتمال تثبيت التطبيقات",
			},
			discordRPC: {
				label: "Discord Rich Presence",
				description: "إظهار نشاطك الحالي في حالة Discord",
			},
		},
		privacy: {
			title: "الخصوصية",
			errorReporting: {
				label: "الإبلاغ عن الأخطاء",
				description:
					"المساعدة في تحسين Dione عن طريق إرسال تقارير أخطاء مجهولة",
			},
		},
		other: {
			title: "أخرى",
			disableAutoUpdate: {
				label: "تعطيل التحديثات التلقائية",
				description: "يعطل التحديثات التلقائية. تنبيه: قد يفوت التطبيق لديك إصلاحات مهمة أو تصحيحات أمان. هذا الخيار غير موصى به لمعظم المستخدمين.",
			},
			logsDirectory: {
				label: "دليل السجلات",
				description: "الموقع الذي يتم فيه تخزين سجلات التطبيقات",
			},
			submitFeedback: {
				label: "إرسال ملاحظات",
				description: "الإبلاغ عن أي مشاكل أو صعوبات تواجهها",
				button: "إرسال تقرير",
			},
			showOnboarding: {
				label: "عرض دليل المستخدم",
				description:
					"إعادة تعيين Dione إلى حالته الأولية وعرض دليل المستخدم مرة أخرى لإعادة التكوين",
				button: "إعادة تعيين",
			},
			variables: {
				label: "المتغيرات",
				description: "إدارة متغيرات التطبيقات وقيمها",
				button: "فتح المتغيرات",
			},
		},
	},

	// report form
	report: {
		title: "وصف المشكلة",
		description: "يرجى تقديم تفاصيل حول ما حدث وما كنت تحاول القيام به.",
		placeholder: "مثال: كنت أحاول تثبيت تطبيق عندما حدث هذا الخطأ...",
		systemInformationTitle: "معلومات النظام",
		disclaimer: "سيتم تضمين معلومات النظام التالية ومعرف مجهول مع تقريرك.",
		success: "تم إرسال التقرير بنجاح!",
		error: "فشل إرسال التقرير. يرجى المحاولة مرة أخرى.",
		send: "إرسال التقرير",
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
				socket: "خطأ في إعداد المقبس",
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
			wait: "الرجاء الانتظار...",
		},
		success: {
			title: "تم إلغاء التثبيت",
			subtitle: "بنجاح",
			closing: "سيتم إغلاق هذه النافذة في",
			seconds: "ثواني...",
		},
		error: {
			title: "حدث",
			subtitle: "خطأ",
			hasOccurred: "غير متوقع",
			deps: "لم يتمكن Dione من إزالة أي تبعيات، يرجى القيام بذلك يدويًا.",
			general:
				"يرجى المحاولة مرة أخرى لاحقًا أو التحقق من السجلات لمزيد من المعلومات.",
		},
		loading: {
			title: "جارٍ التحميل...",
			wait: "الرجاء الانتظار...",
		},
	},

	// logs component
	logs: {
		loading: "جارٍ التحميل...",
		disclaimer:
			"السجلات المعروضة تخص التطبيق نفسه. إذا رأيت خطأ، يرجى الإبلاغ عنه لمطوري التطبيق الأصلي أولاً.",
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
		logs: "السجلات",
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
		title: "هل تريد الظهور هنا؟",
		description: "اعرض أداتك لمجتمعنا",
		button: "احصل على ميزة",
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
			selectFile: "انقر لتحديد ملف",
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
			notSupported: "للأسف، %s غير مدعوم على %s الخاص بك.",
			notSupportedTitle: "قد يكون جهازك غير متوافق.",
		},
	},

	// search component
	search: {
		placeholder: "ابحث عن نصوص برمجية...",
		filters: {
			audio: "صوت",
			image: "صورة",
			video: "فيديو",
			chat: "دردشة",
		},
	},
} as const;
