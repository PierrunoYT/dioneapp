export const openLink = (url: string) => {
	if (url.startsWith("/")) {
		window.location.href = url;
		return;
	}

	try {
		const externalUrl = new URL(url);
		if (externalUrl.protocol === "https:") {
			window.electron.ipcRenderer.invoke(
				"open-external-link",
				externalUrl.toString(),
			);
		}
	} catch {
		// Ignore malformed external URLs.
	}
};

export const openFolder = async (path: string) => {
	await window.electron.ipcRenderer.invoke("open-dir", path);
};
