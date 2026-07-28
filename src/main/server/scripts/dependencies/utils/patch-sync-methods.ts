interface UninstallResult {
	success: boolean;
	error?: unknown;
}

interface UninstallableDependency {
	uninstall: (binFolder: string) => Promise<void>;
}

export async function safeUninstall(
	entry: UninstallableDependency,
	binFolder: string,
): Promise<UninstallResult> {
	try {
		await entry.uninstall(binFolder);
		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}
