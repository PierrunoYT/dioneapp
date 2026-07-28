import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkDependencies } from "@/server/scripts/dependencies/dependencies";
import executeInstallation from "@/server/scripts/execute";
import { checkSystem } from "@/server/scripts/system";
import { consumeLocalApproval } from "@/server/scripts/trust";
import {
	getAppsRoot,
	resolveCanonicalAppPath,
	sanitizeScriptName,
} from "@/server/scripts/utils/paths";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";
import { log } from "./process";

const getAppFolder = () => {
	const folder = getAppsRoot();
	if (!fs.existsSync(folder)) {
		fs.mkdirSync(folder, { recursive: true });
	}
	return folder;
};

async function writeAppFileAtomic(destination: string, content: string) {
	const temporary = path.join(
		path.dirname(destination),
		`.${path.basename(destination)}.${randomUUID()}.tmp`,
	);
	const handle = await fs.promises.open(temporary, "wx", 0o600);
	try {
		await handle.writeFile(content, "utf8");
	} finally {
		await handle.close();
	}
	try {
		const existing = await fs.promises.lstat(destination).catch(() => null);
		if (existing?.isSymbolicLink())
			throw new Error("Destination symlink rejected");
		if (existing) await fs.promises.rm(destination);
		await fs.promises.rename(temporary, destination);
	} catch (error) {
		await fs.promises.rm(temporary, { force: true }).catch(() => {});
		throw error;
	}
}

export async function getAllLocalScripts() {
	const scriptsPath = getAppFolder();
	const scripts = fs.readdirSync(scriptsPath);
	const scriptsInfo: {
		id: string;
		name: string;
		description: string;
	}[] = [];
	for (const script of scripts) {
		const scriptPath = path.join(scriptsPath, script);
		const appInfoPath = path.join(scriptPath, "app_info.json");
		if (fs.existsSync(appInfoPath)) {
			const appInfo = JSON.parse(fs.readFileSync(appInfoPath, "utf-8"));
			scriptsInfo.push({
				id: appInfo.id,
				name: appInfo.name,
				description: appInfo.description,
			});
		}
	}
	return scriptsInfo || [];
}

// check if scripts are installed on APPS folder
export async function getInstalledLocalScript(name: string) {
	const sanitizedName = sanitizeScriptName(name);
	const scriptPath = path.join(getAppFolder(), sanitizedName);
	try {
		const files = await fs.promises.readdir(scriptPath);
		const filtered = files.filter(
			(f) => f !== "dione.json" && f !== "app_info.json",
		);
		return filtered.length > 0;
	} catch (error) {
		return false;
	}
}

// check script data on APPS folder
export async function getLocalApps(name: string) {
	const sanitizedName = sanitizeScriptName(name);
	const scriptPath = path.join(getAppFolder(), sanitizedName);
	const scriptInfo = JSON.parse(
		fs.readFileSync(path.join(scriptPath, "app_info.json"), "utf-8"),
	);

	return scriptInfo;
}

export async function getLocalScriptById(id: string) {
	const baseFolder = getAppFolder();
	const scripts = fs.readdirSync(baseFolder);
	for (const script of scripts) {
		const scriptPath = path.join(baseFolder, script);
		const appInfoPath = path.join(scriptPath, "app_info.json");
		if (fs.existsSync(appInfoPath)) {
			const appInfo = JSON.parse(fs.readFileSync(appInfoPath, "utf-8"));
			if (appInfo.id === id) {
				return appInfo;
			}
		}
	}
}

// install script on APPS folder
export async function loadLocalScript(
	name: string,
	io: Server,
	approvalNonce: string,
) {
	const appPath = await resolveCanonicalAppPath(name, { mustExist: true });
	const dioneConfigPath = path.join(appPath, "dione.json");
	await consumeLocalApproval(dioneConfigPath, approvalNonce);
	const scriptInfo = JSON.parse(
		fs.readFileSync(path.join(appPath, "app_info.json"), "utf-8"),
	);
	const id = scriptInfo.id;
	// check system requirements
	const systemCheck = await checkSystem(dioneConfigPath);
	if (systemCheck.success === false) {
		io.to(id).emit("installUpdate", {
			type: "log",
			content: "System requirements not met.\n",
		});
		io.to(id).emit("installUpdate", {
			type: "status",
			status: "error",
			content: "Error detected",
		});
		io.to(id).emit("notSupported", {
			reasons: systemCheck.reasons,
		});
		return;
	}
	log(io, id, "All system requirements are met.");
	// check deps
	const result = await checkDependencies(dioneConfigPath);
	if (result.success) {
		log(io, id, "All required dependencies are installed.");
		io.to(id).emit("installUpdate", {
			type: "status",
			status: "success",
			content: "Dependencies installed",
		});
		// checking dependencies finished, now executing installation
		io.to(id).emit("enableStop"); // this will enable the stop button
		await executeInstallation(dioneConfigPath, io, id).catch((error) => {
			console.error(`Unhandled error: ${error.message}`);
			process.exit(1);
		});
	} else if (result.error) {
		io.to(id).emit("installUpdate", {
			type: "log",
			content: `ERROR: ${result.error}\n`,
		});
		io.to(id).emit("installUpdate", {
			type: "status",
			status: "error",
			content: "Error detected",
		});
		logger.error(`Error downloading script: ${result.error}`);
	} else {
		io.to(id).emit("missingDeps", result.missing);
		const depsList = result.missing.map((dep) => dep.name).join(", ");
		io.to(id).emit("installUpdate", {
			type: "log",
			content: `Installing dependencies: ${depsList}\n`,
		});
		io.to(id).emit("installUpdate", {
			type: "status",
			status: "pending",
			content: "Installing dependencies...",
		});
		logger.warn(`Installing dependencies: ${depsList}`);
	}
}

// upload script to SCRIPTS folder
export async function uploadLocalScript(
	filePath: string,
	name: string,
	description: string,
) {
	const appInfoContent = {
		name: name || "Script",
		description: description || "",
		id: randomUUID(),
		trustClassification: "local-user-imported",
	};
	const sourceStats = await fs.promises.lstat(filePath);
	if (!sourceStats.isFile() || sourceStats.isSymbolicLink())
		throw new Error("Local manifest must be a regular, non-symbolic-link file");
	const dioneConfigContent = JSON.parse(
		await fs.promises.readFile(filePath, "utf-8"),
	);
	const sanitizedName = sanitizeScriptName(name);
	const id = appInfoContent.id;

	logger.info(`Uploading script '${name}' with ID '${id}'`);

	let scriptPath = await resolveCanonicalAppPath(sanitizedName);
	const existing = await fs.promises.lstat(scriptPath).catch(() => null);
	if (!existing) await fs.promises.mkdir(scriptPath);
	else
		scriptPath = await resolveCanonicalAppPath(sanitizedName, {
			mustExist: true,
		});
	await writeAppFileAtomic(
		path.join(scriptPath, "dione.json"),
		JSON.stringify(dioneConfigContent),
	);
	await writeAppFileAtomic(
		path.join(scriptPath, "app_info.json"),
		JSON.stringify(appInfoContent),
	);

	return appInfoContent;
}

// delete script from SCRIPTS folder
export async function deleteLocalScript(name: string) {
	const scriptPath = await resolveCanonicalAppPath(name, { mustExist: true });
	fs.rmSync(scriptPath, { recursive: true });
}
