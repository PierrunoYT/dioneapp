export const bn = {
	// common actions and states
	common: {
		cancel: "বাতিল করুন",
		loading: "লোড হচ্ছে...",
		error: "ত্রুটি",
		success: "সফল",
		pending: "বিচারাধীন",
		back: "পিছনে",
		unselectAll: "সব নির্বাচন বাতিল করুন",
		selectAll: "সব নির্বাচন করুন",
	},

	// authentication and access related
	noAccess: {
		title: "Dione হোয়াইটলিস্টে যোগ দিন",
		description:
			"Dione নির্মাণাধীন এবং সীমিত সংখ্যক ব্যবহারকারী এটি অ্যাক্সেস করতে পারে, আমাদের অ্যাপের ভবিষ্যতের সংস্করণগুলিতে অ্যাক্সেস পেতে এখনই আমাদের হোয়াইটলিস্টে যোগ দিন।",
		join: "যোগ দিন",
		logout: "লগ আউট",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "স্বাগতম",
			subtitle:
				"এই যাত্রায় আমাদের সাথে আগে যুক্ত হওয়ার জন্য আপনাকে ধন্যবাদ। শুরু করতে আপনার অ্যাকাউন্টে লগ ইন করুন।",
			login: "লগ ইন",
			copyLink: "লিঙ্ক কপি করুন",
			skipLogin: "লগইন ছাড়াই চালিয়ে যান",
		},
		loggingIn: {
			title: "লগ ইন হচ্ছে...",
			authError: "প্রমাণীকরণ করা যায়নি?",
			goBack: "পিছনে যান",
		},
		languageSelector: {
			title: "আপনার ভাষা নির্বাচন করুন",
		},
		ready: {
			title: "আপনি প্রস্তুত!",
			subtitle: "আপনাকে এখানে পেয়ে আমরা আনন্দিত",
			finish: "শেষ করুন",
		},
		clipboard: {
			success:
				"ক্লিপবোর্ডে সফলভাবে কপি করা হয়েছে, এখন আপনার ব্রাউজারে পেস্ট করুন!",
		},
		selectPath: {
			title: "ইনস্টলেশন পাথ নির্বাচন করুন",
			button: "একটি পাথ নির্বাচন করুন",
			success: "পরবর্তী",
		},
	},

	// error handling
	error: {
		title: "একটি অপ্রত্যাশিত ত্রুটি ঘটেছে",
		description:
			"আমরা অ্যাপ্লিকেশনটিতে একটি অপ্রত্যাশিত ত্রুটি সনাক্ত করেছি, অসুবিধার জন্য আমরা দুঃখিত।",
		return: "ফেরত",
		report: {
			toTeam: "টিমের কাছে রিপোর্ট করুন",
			sending: "রিপোর্ট পাঠানো হচ্ছে...",
			success: "রিপোর্ট পাঠানো হয়েছে!",
			failed: "রিপোর্ট পাঠাতে ব্যর্থ",
		},
	},

	// account related
	account: {
		title: "অ্যাকাউন্ট",
		logout: "লগ আউট",
		stats: {
			timeSpent: {
				title: "ব্যয়িত সময়",
				subtitle: "গত ৭ দিনে",
			},
			sessions: {
				title: "সেশন",
				subtitle: "গত ৭ দিনে",
			},
			shared: {
				title: "শেয়ার করা",
				subtitle: "গত ৭ দিনে",
			},
			streak: {
				title: "ধারা",
				subtitle: "ধারাবাহিক দিন",
				days: "দিন",
			},
		},
	},

	// toast notifications
	toast: {
		close: "বন্ধ করুন",
		install: {
			downloading: "%s ডাউনলোড হচ্ছে...",
			starting: "%s শুরু হচ্ছে...",
			uninstalling: "%s আনইনস্টল হচ্ছে...",
			reconnecting: "%s পুনরায় সংযোগ করছে...",
			retrying: "%s আবার ইনস্টল করার চেষ্টা করা হচ্ছে...",
			success: {
				stopped: "%s সফলভাবে বন্ধ হয়েছে।",
				uninstalled: "%s সফলভাবে আনইনস্টল হয়েছে।",
				logsCopied: "লগ সফলভাবে ক্লিপবোর্ডে কপি করা হয়েছে।",
				depsInstalled: "ডিপেন্ডেন্সি সফলভাবে ইনস্টল হয়েছে।",
				shared: "ডাউনলোড লিঙ্ক ক্লিপবোর্ডে কপি করা হয়েছে!",
			},
			error: {
				download: "ডাউনলোড শুরু করতে ত্রুটি: %s",
				start: "%s শুরু করতে ত্রুটি: %s",
				stop: "%s বন্ধ করতে ত্রুটি: %s",
				uninstall: "%s আনইনস্টল করতে ত্রুটি: %s",
				serverRunning: "সার্ভার ইতিমধ্যেই চলছে।",
				tooManyApps:
					"ধীর গতি! আপনি একই সময়ে ইতিমধ্যে ৬টি অ্যাপ চালাচ্ছেন।",
			},
		},
	},

	// titlebar component
	titlebar: {
		closing: {
			title: "অ্যাপ্লিকেশন বন্ধ হচ্ছে...",
			description:
				"সমস্ত খোলা অ্যাপ্লিকেশন বন্ধ করার পরে Dione স্বয়ংক্রিয়ভাবে বন্ধ হয়ে যাবে।",
		},
	},

	// sidebar component
	sidebar: {
		tagline: "অন্বেষণ করুন, ইনস্টল করুন, উদ্ভাবন করুন — ১ ক্লিকে।",
		activeApps: "সক্রিয় অ্যাপ",
		update: {
			title: "আপডেট উপলব্ধ",
			description:
				"Dione-এর একটি নতুন সংস্করণ উপলব্ধ, আপডেট করতে অ্যাপটি রিস্টার্ট করুন।",
			tooltip: "নতুন আপডেট উপলব্ধ, আপডেট করতে Dione রিস্টার্ট করুন।",
		},
		tooltips: {
			library: "লাইব্রেরি",
			settings: "সেটিংস",
			account: "অ্যাকাউন্ট",
			logout: "লগ আউট",
			login: "লগ ইন",
		},
	},

	// home page
	home: {
		featured: "বৈশিষ্ট্যযুক্ত",
		explore: "অন্বেষণ করুন",
	},

	// settings page
	settings: {
		applications: {
			title: "অ্যাপ্লিকেশন",
			installationDirectory: {
				label: "ইনস্টলেশন ডিরেক্টরি",
				description:
					"নতুন অ্যাপ্লিকেশনগুলি ডিফল্টরূপে কোথায় ইনস্টল করা হবে তা চয়ন করুন",
			},
			binDirectory: {
				label: "বিন ডিরেক্টরি",
				description:
					"সহজ অ্যাক্সেসের জন্য অ্যাপ্লিকেশন বাইনারিগুলি কোথায় সংরক্ষণ করা হবে তা চয়ন করুন",
			},
			cleanUninstall: {
				label: "পরিষ্কার আনইনস্টল",
				description:
					"অ্যাপ্লিকেশনগুলি আনইনস্টল করার সময় সমস্ত সম্পর্কিত ডিপেন্ডেন্সি সরান",
			},
			autoOpenAfterInstall: {
				label: "ইনস্টলের পরে স্বয়ংক্রিয়ভাবে খুলুন",
				description:
					"ইনস্টলেশনের পরে প্রথমবার অ্যাপ্লিকেশনগুলি স্বয়ংক্রিয়ভাবে খুলুন",
			},
			deleteCache: {
				label: "ক্যাশ মুছুন",
				description: "অ্যাপ্লিকেশন থেকে সমস্ত ক্যাশেড ডেটা সরান",
				button: "ক্যাশ মুছুন",
				deleting: "মুছে ফেলা হচ্ছে...",
				deleted: "মুছে ফেলা হয়েছে",
				error: "ত্রুটি",
			},
		},
		interface: {
			title: "ইন্টারফেস",
			displayLanguage: {
				label: "ডিসপ্লে ভাষা",
				description: "আপনার পছন্দের ইন্টারফেস ভাষা চয়ন করুন",
			},
			helpTranslate: "🤔 আপনার ভাষা দেখতে পাচ্ছেন না? আরও যোগ করতে আমাদের সাহায্য করুন!",
			compactView: {
				label: "কম্প্যাক্ট ভিউ",
				description:
					"স্ক্রিনে আরও বেশি কন্টেন্ট ফিট করার জন্য একটি সংক্ষিপ্ত লেআউট ব্যবহার করুন",
			},
		},
		notifications: {
			title: "বিজ্ঞপ্তি",
			systemNotifications: {
				label: "সিস্টেম বিজ্ঞপ্তি",
				description: "গুরুত্বপূর্ণ ইভেন্টগুলির জন্য ডেস্কটপ বিজ্ঞপ্তি দেখান",
			},
			installationAlerts: {
				label: "ইনস্টলেশন সতর্কতা",
				description: "অ্যাপ্লিকেশন ইনস্টলেশন সম্পন্ন হলে অবহিত হন",
			},
			discordRPC: {
				label: "ডিসকর্ড রিচ উপস্থিতি",
				description: "ডিসকর্ডে আপনার বর্তমান কার্যকলাপ স্ট্যাটাসে দেখান",
			},
		},
		privacy: {
			title: "গোপনীয়তা",
			errorReporting: {
				label: "ত্রুটি প্রতিবেদন",
				description: "বেনামী ত্রুটি প্রতিবেদন পাঠিয়ে Dione উন্নত করতে সাহায্য করুন",
			},
		},
		other: {
			title: "অন্যান্য",
			disableAutoUpdate: {
				label: "স্বয়ংক্রিয় আপডেট অক্ষম করুন",
				description:
					"স্বয়ংক্রিয় আপডেটগুলি অক্ষম করে। সতর্কতা: আপনার অ্যাপ্লিকেশনটি গুরুত্বপূর্ণ ফিক্স বা নিরাপত্তা প্যাচগুলি মিস করতে পারে। বেশিরভাগ ব্যবহারকারীদের জন্য এই বিকল্পটি সুপারিশ করা হয় না।",
			},
			logsDirectory: {
				label: "লগ ডিরেক্টরি",
				description: "যেখানে অ্যাপ্লিকেশন লগগুলি সংরক্ষণ করা হয়",
			},
			submitFeedback: {
				label: "প্রতিক্রিয়া জমা দিন",
				description: "আপনি যে কোনও সমস্যা বা সমস্যাগুলি রিপোর্ট করুন",
				button: "রিপোর্ট পাঠান",
			},
			showOnboarding: {
				label: "অনবোর্ডিং দেখান",
				description:
					"Dione কে তার প্রাথমিক অবস্থায় রিসেট করুন এবং পুনঃকনফিগার করার জন্য অনবোর্ডিং আবার দেখান",
				button: "রিসেট",
			},
			variables: {
				label: "ভেরিয়েবল",
				description: "অ্যাপ্লিকেশন ভেরিয়েবল এবং তাদের মানগুলি পরিচালনা করুন",
				button: "ভেরিয়েবল খুলুন",
			},
		},
	},

	// report form
	report: {
		title: "সমস্যা বর্ণনা করুন",
		description:
			"কী ঘটেছিল এবং আপনি কী করার চেষ্টা করছিলেন তার বিবরণ দয়া করে দিন।",
		placeholder:
			"উদাহরণ: আমি একটি অ্যাপ্লিকেশন ইনস্টল করার চেষ্টা করছিলাম যখন এই ত্রুটিটি ঘটেছিল...",
		systemInformationTitle: "সিস্টেম তথ্য",
		disclaimer:
			"নিম্নলিখিত সিস্টেম তথ্য এবং একটি বেনামী আইডি আপনার প্রতিবেদনের সাথে অন্তর্ভুক্ত করা হবে।",
		success: "রিপোর্ট সফলভাবে পাঠানো হয়েছে!",
		error: "রিপোর্ট পাঠাতে ব্যর্থ। অনুগ্রহ করে আবার চেষ্টা করুন।",
		send: "রিপোর্ট পাঠান",
		sending: "পাঠানো হচ্ছে...",
		contribute: "সমস্ত ডিভাইসের সাথে এই স্ক্রিপ্টটিকে সামঞ্জস্যপূর্ণ করতে আমাদের সাহায্য করুন",
	},

	// quick launch component
	quickLaunch: {
		title: "কুইক লঞ্চ",
		addApp: "অ্যাপ যোগ করুন",
		tooltips: {
			noMoreApps: "যোগ করার জন্য কোনও অ্যাপ উপলব্ধ নেই",
		},
		selectApp: {
			title: "একটি অ্যাপ নির্বাচন করুন",
			description: "{count} টি অ্যাপ উপলব্ধ। আপনি {max} পর্যন্ত বেছে নিতে পারেন।",
		},
	},

	// missing dependencies modal
	missingDeps: {
		title: "কিছু ডিপেন্ডেন্সি অনুপস্থিত!",
		installing: "ডিপেন্ডেন্সি ইনস্টল হচ্ছে...",
		install: "ইনস্টল করুন",
		logs: {
			initializing: "ডিপেন্ডেন্সি ডাউনলোড শুরু হচ্ছে...",
			loading: "লোড হচ্ছে...",
			connected: "সার্ভারের সাথে সংযুক্ত",
			disconnected: "সার্ভার থেকে বিচ্ছিন্ন",
			error: {
				socket: "সকেট সেটআপ করতে ত্রুটি",
				install: "❌ ডিপেন্ডেন্সি ইনস্টল করতে ত্রুটি: {error}",
			},
			allInstalled: "সমস্ত ডিপেন্ডেন্সি ইতিমধ্যেই ইনস্টল করা হয়েছে।",
		},
	},

	// delete loading modal
	deleteLoading: {
		uninstalling: {
			title: "আনইনস্টল হচ্ছে",
			deps: "ডিপেন্ডেন্সি আনইনস্টল হচ্ছে",
			wait: "অনুগ্রহ করে অপেক্ষা করুন...",
		},
		success: {
			title: "আনইনস্টল করা হয়েছে",
			subtitle: "সফলভাবে",
			closing: "এই মোডাল বন্ধ হচ্ছে",
			seconds: "সেকেন্ড...",
		},
		error: {
			title: "একটি অপ্রত্যাশিত",
			subtitle: "ত্রুটি",
			hasOccurred: "ঘটেছে",
			deps: "Dione কোনো ডিপেন্ডেন্সি সরাতে পারেনি, অনুগ্রহ করে ম্যানুয়ালি করুন।",
			general: "অনুগ্রহ করে পরে আবার চেষ্টা করুন অথবা আরও তথ্যের জন্য লগগুলি পরীক্ষা করুন।",
		},
		loading: {
			title: "লোড হচ্ছে...",
			wait: "অনুগ্রহ করে অপেক্ষা করুন...",
		},
	},

	// logs component
	logs: {
		loading: "লোড হচ্ছে...",
		disclaimer:
			"লগগুলি অ্যাপ থেকেই দেখানো হচ্ছে। যদি আপনি কোনো ত্রুটি দেখতে পান, অনুগ্রহ করে প্রথমে মূল অ্যাপের ডেভেলপারদের কাছে রিপোর্ট করুন।",
		status: {
			success: "সফল",
			error: "ত্রুটি",
			pending: "বিচারাধীন",
		},
	},

	// loading states
	loading: {
		text: "লোড হচ্ছে...",
	},

	// iframe component
	iframe: {
		back: "পিছনে",
		openFolder: "ফোল্ডার খুলুন",
		openInBrowser: "ব্রাউজারে খুলুন",
		openNewWindow: "নতুন উইন্ডো খুলুন",
		fullscreen: "ফুলস্ক্রিন",
		stop: "বন্ধ করুন",
		reload: "পুনরায় লোড করুন",
		logs: "লগ",
	},

	// actions component
	actions: {
		reconnect: "পুনরায় সংযোগ করুন",
		start: "শুরু করুন",
		uninstall: "আনইনস্টল করুন",
		install: "ইনস্টল করুন",
		publishedBy: "দ্বারা প্রকাশিত",
	},

	// promo component
	promo: {
		title: "এখানে বৈশিষ্ট্যযুক্ত হতে চান?",
		description: "আমাদের সম্প্রদায়ের কাছে আপনার টুল প্রদর্শন করুন",
		button: "বৈশিষ্ট্যযুক্ত হন",
	},

	// installed component
	installed: {
		title: "আপনার লাইব্রেরি",
		empty: {
			title: "আপনার কোনও অ্যাপ্লিকেশন ইনস্টল করা নেই",
			action: "এখনই একটি ইনস্টল করুন",
		},
	},

	// local component
	local: {
		title: "লোকাল স্ক্রিপ্ট",
		upload: "স্ক্রিপ্ট আপলোড করুন",
		noScripts: "কোনও স্ক্রিপ্ট পাওয়া যায়নি",
		deleting: "স্ক্রিপ্ট মুছে ফেলা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...",
		uploadModal: {
			title: "স্ক্রিপ্ট আপলোড করুন",
			selectFile: "ফাইল নির্বাচন করতে ক্লিক করুন",
			selectedFile: "নির্বাচিত ফাইল",
			scriptName: "স্ক্রিপ্টের নাম",
			scriptDescription: "স্ক্রিপ্টের বিবরণ (ঐচ্ছিক)",
			uploadFile: "ফাইল আপলোড করুন",
			uploading: "আপলোড হচ্ছে...",
			errors: {
				uploadFailed: "স্ক্রিপ্ট আপলোড করতে ব্যর্থ। অনুগ্রহ করে আবার চেষ্টা করুন।",
				uploadError: "স্ক্রিপ্ট আপলোড করার সময় একটি ত্রুটি ঘটেছে।",
			},
		},
	},

	// feed component
	feed: {
		noScripts: "কোনও স্ক্রিপ্ট পাওয়া যায়নি",
		errors: {
			notArray: "প্রাপ্ত ডেটা একটি অ্যারে নয়",
			fetchFailed: "স্ক্রিপ্ট আনতে ব্যর্থ",
			notSupported: "দুর্ভাগ্যবশত %s আপনার %s-এ সমর্থিত নয়।",
			notSupportedTitle: "আপনার ডিভাইসটি অসঙ্গত হতে পারে।",
		},
	},

	// search component
	search: {
		placeholder: "স্ক্রিপ্ট অনুসন্ধান করুন...",
		filters: {
			audio: "অডিও",
			image: "ছবি",
			video: "ভিডিও",
			chat: "চ্যাট",
		},
	},
} as const;