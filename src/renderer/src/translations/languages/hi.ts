export const en = {
	// common actions and states
	common: {
		cancel: "रद्द करें",
		loading: "लोड हो रहा है...",
		error: "त्रुटि",
		success: "सफलता",
		pending: "लंबित",
		back: "वापस",
		unselectAll: "सभी का चयन रद्द करें",
		selectAll: "सभी का चयन करें",
	},

	// authentication and access related
	noAccess: {
		title: "Dione श्वेतसूची में शामिल हों",
		description:
			"Dione निर्माणाधीन है और केवल सीमित संख्या में उपयोगकर्ता ही इसे एक्सेस कर सकते हैं, हमारे ऐप के भविष्य के संस्करणों तक पहुंच प्राप्त करने के लिए अभी हमारी श्वेतसूची में शामिल हों।",
		join: "शामिल हों",
		logout: "लॉगआउट",
	},

	// first time user experience
	firstTime: {
		welcome: {
			title: "में आपका स्वागत है",
			subtitle:
				"इस यात्रा में हमें जल्दी शामिल करने के लिए धन्यवाद। शुरू करने के लिए अपने खाते में लॉग इन करें।",
			login: "लॉग इन करें",
			copyLink: "लिंक कॉपी करें",
			skipLogin: "लॉगिन के बिना जारी रखें",
		},
		loggingIn: {
			title: "लॉग इन हो रहा है...",
			authError: "प्रमाणीकरण नहीं हो सका?",
			goBack: "वापस जाएं",
		},
		languageSelector: {
			title: "अपनी भाषा चुनें",
		},
		ready: {
			title: "आप तैयार हैं!",
			subtitle: "हमें आपको यहां पाकर खुशी हुई",
			finish: "समाप्त करें",
		},
		clipboard: {
			success:
				"क्लिपबोर्ड पर सही ढंग से कॉपी किया गया, अब इसे अपने ब्राउज़र में पेस्ट करें!",
		},
		selectPath: {
			title: "स्थापना पथ चुनें",
			button: "पथ चुनें",
			success: "अगला",
		},
	},

	// error handling
	error: {
		title: "अप्रत्याशित त्रुटि हुई",
		description:
			"हमने एप्लिकेशन में एक अप्रत्याशित त्रुटि का पता लगाया है, हम असुविधा के लिए क्षमा चाहते हैं।",
		return: "वापस लौटें",
		report: {
			toTeam: "टीम को रिपोर्ट करें",
			sending: "रिपोर्ट भेजी जा रही है...",
			success: "रिपोर्ट भेजी गई!",
			failed: "रिपोर्ट भेजने में विफल",
		},
	},

	// account related
	account: {
		title: "खाता",
		logout: "लॉगआउट",
		stats: {
			timeSpent: {
				title: " बिताया गया समय",
				subtitle: "पिछले 7 दिनों में",
			},
			sessions: {
				title: "सत्र",
				subtitle: "पिछले 7 दिनों में",
			},
			shared: {
				title: "साझा",
				subtitle: "पिछले 7 दिनों में",
			},
			streak: {
				title: "लकीर",
				subtitle: "लगातार दिन",
				days: "दिन",
			},
		},
	},

	// toast notifications
	toast: {
		close: "बंद करें",
		install: {
			downloading: "%s डाउनलोड हो रहा है...",
			starting: "%s शुरू हो रहा है...",
			uninstalling: "%s अनइंस्टॉल हो रहा है...",
			reconnecting: "%s फिर से जुड़ रहा है...",
			retrying: "%s को फिर से स्थापित करने का प्रयास किया जा रहा है...",
			success: {
				stopped: "%s सफलतापूर्वक बंद हो गया।",
				uninstalled: "%s सफलतापूर्वक अनइंस्टॉल हो गया।",
				logsCopied: "लॉग सफलतापूर्वक क्लिपबोर्ड पर कॉपी किए गए।",
				depsInstalled: "निर्भरताएं सफलतापूर्वक स्थापित की गईं।",
				shared: "डाउनलोड लिंक क्लिपबोर्ड पर कॉपी किया गया!",
			},
			error: {
				download: "डाउनलोड शुरू करने में त्रुटि: %s",
				start: "%s शुरू करने में त्रुटि: %s",
				stop: "%s रोकने में त्रुटि: %s",
				uninstall: "%s अनइंस्टॉल करने में त्रुटि: %s",
				serverRunning: "सर्वर पहले से ही चल रहा है।",
				tooManyApps:
					"धीमे हो जाओ! आपके पास पहले से ही एक साथ 6 ऐप चल रहे हैं।",
			},
		},
	},

	// titlebar component
	titlebar: {
		closing: {
			title: "एप्लिकेशन बंद हो रहे हैं...",
			description:
				"सभी खुले एप्लिकेशन बंद होने के बाद Dione स्वचालित रूप से बंद हो जाएगा।",
		},
	},

	// sidebar component
	sidebar: {
		tagline: "खोजें, स्थापित करें, नवाचार करें — 1 क्लिक में।",
		activeApps: "सक्रिय ऐप",
		update: {
			title: "अपडेट उपलब्ध है",
			description:
				"Dione का नया संस्करण उपलब्ध है, कृपया अपडेट करने के लिए ऐप को पुनरारंभ करें।",
			tooltip: "नया अपडेट उपलब्ध है, कृपया अपडेट करने के लिए Dione को पुनरारंभ करें।",
		},
		tooltips: {
			library: "लाइब्रेरी",
			settings: "सेटिंग्स",
			account: "खाता",
			logout: "लॉगआउट",
			login: "लॉगिन",
		},
	},

	// home page
	home: {
		featured: "विशेष",
		explore: "खोजें",
	},

	// settings page
	settings: {
		applications: {
			title: "एप्लिकेशन",
			installationDirectory: {
				label: "स्थापना निर्देशिका",
				description:
					"चुनें कि नए एप्लिकेशन डिफ़ॉल्ट रूप से कहां स्थापित किए जाएंगे",
			},
			binDirectory: {
				label: "बिन निर्देशिका",
				description:
					"आसान पहुंच के लिए एप्लिकेशन बाइनरी कहां संग्रहीत किए जाएंगे, चुनें",
			},
			cleanUninstall: {
				label: "साफ अनइंस्टॉल",
				description:
					"एप्लिकेशन अनइंस्टॉल करते समय सभी संबंधित निर्भरताओं को हटा दें",
			},
			autoOpenAfterInstall: {
				label: "स्थापना के बाद स्वचालित रूप से खोलें",
				description:
					"स्थापना के बाद पहली बार स्वचालित रूप से एप्लिकेशन खोलें",
			},
			deleteCache: {
				label: "कैश हटाएं",
				description: "एप्लिकेशन से सभी कैश डेटा हटा दें",
				button: "कैश हटाएं",
				deleting: "हटाया जा रहा है...",
				deleted: "हटाया गया",
				error: "त्रुटि",
			},
		},
		interface: {
			title: "इंटरफ़ेस",
			displayLanguage: {
				label: "डिस्प्ले भाषा",
				description: "अपनी पसंदीदा इंटरफ़ेस भाषा चुनें",
			},
			helpTranslate: "🤔 अपनी भाषा नहीं दिख रही? हमें और जोड़ने में मदद करें!",
			compactView: {
				label: "कॉम्पैक्ट व्यू",
				description:
					"स्क्रीन पर अधिक सामग्री फिट करने के लिए अधिक संक्षिप्त लेआउट का उपयोग करें",
			},
		},
		notifications: {
			title: "सूचनाएं",
			systemNotifications: {
				label: "सिस्टम सूचनाएं",
				description: "महत्वपूर्ण घटनाओं के लिए डेस्कटॉप सूचनाएं दिखाएं",
			},
			installationAlerts: {
				label: "स्थापना अलर्ट",
				description: "एप्लिकेशन इंस्टॉलेशन पूरा होने पर सूचित हों",
			},
			discordRPC: {
				label: "Discord Rich Presence",
				description: "Discord स्थिति में अपनी वर्तमान गतिविधि दिखाएं",
			},
		},
		privacy: {
			title: "गोपनीयता",
			errorReporting: {
				label: "त्रुटि रिपोर्टिंग",
				description: "अनाम त्रुटि रिपोर्ट भेजकर Dione को बेहतर बनाने में मदद करें",
			},
		},
		other: {
			title: "अन्य",
			disableAutoUpdate: {
				label: "स्वचालित अपडेट अक्षम करें",
				description:
					"स्वचालित अपडेट अक्षम करता है। सावधानी: आपका एप्लिकेशन महत्वपूर्ण सुधार या सुरक्षा पैच से चूक सकता है। यह विकल्प अधिकांश उपयोगकर्ताओं के लिए अनुशंसित नहीं है।",
			},
			logsDirectory: {
				label: "लॉग निर्देशिका",
				description: "जहां एप्लिकेशन लॉग संग्रहीत किए जाते हैं",
			},
			submitFeedback: {
				label: "प्रतिक्रिया सबमिट करें",
				description: "आपके सामने आने वाले किसी भी मुद्दे या समस्याओं की रिपोर्ट करें",
				button: "रिपोर्ट भेजें",
			},
			showOnboarding: {
				label: "ऑनबोर्डिंग दिखाएं",
				description:
					"Dione को उसकी प्रारंभिक स्थिति में रीसेट करें और पुन: कॉन्फ़िगरेशन के लिए ऑनबोर्डिंग फिर से दिखाएं",
				button: "रीसेट",
			},
			variables: {
				label: "चर",
				description: "एप्लिकेशन चर और उनके मान प्रबंधित करें",
				button: "चर खोलें",
			},
		},
	},

	// report form
	report: {
		title: "समस्या का वर्णन करें",
		description:
			"कृपया इस बारे में विवरण प्रदान करें कि क्या हुआ और आप क्या करने का प्रयास कर रहे थे।",
		placeholder:
			"उदाहरण: मैं एक एप्लिकेशन स्थापित करने की कोशिश कर रहा था जब यह त्रुटि हुई...",
		systemInformationTitle: "सिस्टम जानकारी",
		disclaimer:
			"निम्नलिखित सिस्टम जानकारी और एक अनाम आईडी आपकी रिपोर्ट के साथ शामिल की जाएगी।",
		success: "रिपोर्ट सफलतापूर्वक भेजी गई!",
		error: "रिपोर्ट भेजने में विफल। कृपया पुनः प्रयास करें।",
		send: "रिपोर्ट भेजें",
		sending: "भेजा जा रहा है...",
		contribute: "हमें इस स्क्रिप्ट को सभी उपकरणों के साथ संगत बनाने में मदद करें",
	},

	// quick launch component
	quickLaunch: {
		title: "क्विक लॉन्च",
		addApp: "ऐप जोड़ें",
		tooltips: {
			noMoreApps: "जोड़ने के लिए कोई उपलब्ध ऐप नहीं",
		},
		selectApp: {
			title: "ऐप चुनें",
			description: "{count} ऐप उपलब्ध हैं। आप {max} तक चुन सकते हैं।",
		},
	},

	// missing dependencies modal
	missingDeps: {
		title: "कुछ निर्भरताएं गायब हैं!",
		installing: "निर्भरताएं स्थापित हो रही हैं...",
		install: "स्थापित करें",
		logs: {
			initializing: "निर्भरता डाउनलोड शुरू हो रहा है...",
			loading: "लोड हो रहा है...",
			connected: "सर्वर से जुड़ा",
			disconnected: "सर्वर से डिस्कनेक्ट हो गया",
			error: {
				socket: "सॉकेट स्थापित करने में त्रुटि",
				install: "❌ निर्भरताएं स्थापित करने में त्रुटि: {error}",
			},
			allInstalled: "सभी निर्भरताएं पहले से ही स्थापित हैं।",
		},
	},

	// delete loading modal
	deleteLoading: {
		uninstalling: {
			title: "अनइंस्टॉल हो रहा है",
			deps: "निर्भरताएं अनइंस्टॉल हो रही हैं",
			wait: "कृपया प्रतीक्षा करें...",
		},
		success: {
			title: "अनइंस्टॉल किया गया",
			subtitle: "सफलतापूर्वक",
			closing: "यह मोडाल बंद हो रहा है",
			seconds: "सेकंड में...",
		},
		error: {
			title: "एक अप्रत्याशित",
			subtitle: "त्रुटि",
			hasOccurred: "हुई है",
			deps: "Dione किसी भी निर्भरता को हटाने में सक्षम नहीं हुआ है, कृपया इसे मैन्युअल रूप से करें।",
			general: "कृपया बाद में पुनः प्रयास करें या अधिक जानकारी के लिए लॉग देखें।",
		},
		loading: {
			title: "लोड हो रहा है...",
			wait: "कृपया प्रतीक्षा करें...",
		},
	},

	// logs component
	logs: {
		loading: "लोड हो रहा है...",
		disclaimer:
			"दिखाए गए लॉग स्वयं ऐप के हैं। यदि आपको कोई त्रुटि दिखाई देती है, तो कृपया पहले मूल ऐप के डेवलपर्स को रिपोर्ट करें।",
		status: {
			success: "सफलता",
			error: "त्रुटि",
			pending: "लंबित",
		},
	},

	// loading states
	loading: {
		text: "लोड हो रहा है...",
	},

	// iframe component
	iframe: {
		back: "वापस",
		openFolder: "फ़ोल्डर खोलें",
		openInBrowser: "ब्राउज़र में खोलें",
		openNewWindow: "नई विंडो खोलें",
		fullscreen: "पूर्ण स्क्रीन",
		stop: "बंद करें",
		reload: "पुनः लोड करें",
		logs: "लॉग",
	},

	// actions component
	actions: {
		reconnect: "फिर से जुड़ें",
		start: "शुरू करें",
		uninstall: "अनइंस्टॉल करें",
		install: "स्थापित करें",
		publishedBy: "द्वारा प्रकाशित",
	},

	// promo component
	promo: {
		title: "यहां विशेष बनना चाहते हैं?",
		description: "हमारे समुदाय को अपना टूल दिखाएं",
		button: "विशेषता प्राप्त करें",
	},

	// installed component
	installed: {
		title: "आपकी लाइब्रेरी",
		empty: {
			title: "आपके पास कोई एप्लिकेशन स्थापित नहीं है",
			action: "अभी एक स्थापित करें",
		},
	},

	// local component
	local: {
		title: "स्थानीय स्क्रिप्ट",
		upload: "स्क्रिप्ट अपलोड करें",
		noScripts: "कोई स्क्रिप्ट नहीं मिली",
		deleting: "स्क्रिप्ट हटाई जा रही है, कृपया प्रतीक्षा करें...",
		uploadModal: {
			title: "स्क्रिप्ट अपलोड करें",
			selectFile: "फ़ाइल चुनने के लिए क्लिक करें",
			selectedFile: "चयनित फ़ाइल",
			scriptName: "स्क्रिप्ट का नाम",
			scriptDescription: "स्क्रिप्ट विवरण (वैकल्पिक)",
			uploadFile: "फ़ाइल अपलोड करें",
			uploading: "अपलोड हो रहा है...",
			errors: {
				uploadFailed: "स्क्रिप्ट अपलोड करने में विफल। कृपया पुनः प्रयास करें।",
				uploadError: "स्क्रिप्ट अपलोड करते समय एक त्रुटि हुई।",
			},
		},
	},

	// feed component
	feed: {
		noScripts: "कोई स्क्रिप्ट नहीं मिली",
		errors: {
			notArray: "प्राप्त डेटा एक ऐरे नहीं है",
			fetchFailed: "स्क्रिप्ट प्राप्त करने में विफल",
			notSupported: "दुर्भाग्य से %s आपके %s पर समर्थित नहीं है।",
			notSupportedTitle: "आपका उपकरण असंगत हो सकता है।",
		},
	},

	// search component
	search: {
		placeholder: "स्क्रिप्ट खोजें...",
		filters: {
			audio: "ऑडियो",
			image: "छवि",
			video: "वीडियो",
			chat: "चैट",
		},
	},
} as const;