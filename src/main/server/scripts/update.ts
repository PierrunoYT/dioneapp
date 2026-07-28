import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Server } from "socket.io";
import { createVirtualEnvCommands } from "./dependencies/env-utils";
import { executeCommand, executeCommands, log } from "./process";
import { loadTrustedManifest } from "./trust";

const SCAN_MAX_DEPTH = 8;
const SCAN_MAX_ENTRIES = 10_000;
const SCAN_IGNORED = new Set([
	"node_modules",
	".git",
	".venv",
	"dist",
	"build",
	"__pycache__",
]);

async function findDirWithFile(
	rootDir: string,
	fileName: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const queue = [{ directory: rootDir, depth: 0 }];
	let visitedEntries = 0;
	while (queue.length > 0) {
		if (signal?.aborted) throw new Error("Aborted");
		const current = queue.shift();
		if (!current) break;
		let entries: fs.Dirent[];
		try {
			entries = await fsp.readdir(current.directory, { withFileTypes: true });
		} catch {
			continue;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		visitedEntries += entries.length;
		if (visitedEntries > SCAN_MAX_ENTRIES) {
			throw new Error(`Manifest scan exceeded ${SCAN_MAX_ENTRIES} entries`);
		}
		if (entries.some((entry) => entry.isFile() && entry.name === fileName)) {
			return current.directory;
		}
		if (current.depth >= SCAN_MAX_DEPTH) continue;
		for (const entry of entries) {
			if (entry.isDirectory() && !SCAN_IGNORED.has(entry.name)) {
				queue.push({
					directory: path.join(current.directory, entry.name),
					depth: current.depth + 1,
				});
			}
		}
	}
	return null;
}

function getProjectEnv(dione: any) {
	const fromInstall = Array.isArray(dione.installation)
		? dione.installation.find((s: any) => s.env)?.env
		: null;

	const fromStart = Array.isArray(dione.start)
		? dione.start.find((s: any) => s.env)?.env
		: null;

	return fromInstall || fromStart || null;
}

export async function updateScript(
	workingDir: string,
	dioneFile: any,
	io: Server,
	id: string,
	signal?: AbortSignal,
) {
	const dione = await loadTrustedManifest(dioneFile);
	const dependencies = Object.keys(dione.dependencies || {});
	const projectDir = workingDir;

	log(io, id, "INFO: Starting update process...");

	// Update git repository
	if (dependencies.includes("git")) {
		log(
			io,
			id,
			"ERROR: Mutable git pull is disabled. Install an upstream release pinned to a signed commit instead.",
		);
		return false;
	}

	const projectEnv = getProjectEnv(dione);

	const envName = projectEnv?.name ?? "env";
	const envType = projectEnv?.type ?? "uv";
	const pythonVersion = projectEnv?.version ?? "";

	// Update Python dependencies
	const pyReqDir = await findDirWithFile(
		projectDir,
		"requirements.txt",
		signal,
	);
	const pyTomlDir = await findDirWithFile(projectDir, "pyproject.toml", signal);
	const pyEnvDir = await findDirWithFile(projectDir, "environment.yml", signal);

	const pythonFilesDir = pyReqDir || pyTomlDir || pyEnvDir;
	const pythonCommands: string[] = [];
	let refusedUnsafeUpdate = false;

	let executionCwd = pythonFilesDir || workingDir;

	if (pythonFilesDir) {
		const envInRoot = fs.existsSync(path.join(workingDir, envName));

		if (envInRoot) {
			executionCwd = workingDir;
		} else {
			executionCwd = pythonFilesDir;
		}

		const relPath = path.relative(executionCwd, pythonFilesDir);

		const reqPath = path.join(relPath, "requirements.txt");
		const tomlPath = relPath === "" ? "." : relPath;
		const envYmlPath = path.join(relPath, "environment.yml");

		const absReq = path.join(pythonFilesDir, "requirements.txt");
		const absToml = path.join(pythonFilesDir, "pyproject.toml");
		const absEnvYml = path.join(pythonFilesDir, "environment.yml");

		if (fs.existsSync(absReq)) {
			const requirements = await fsp.readFile(absReq, "utf8");
			const unhashed = requirements
				.split(/\r?\n/)
				.filter((line) => line.trim() && !line.trim().startsWith("#"))
				.some((line) => !line.includes("--hash="));
			if (unhashed) {
				refusedUnsafeUpdate = true;
				log(
					io,
					id,
					"WARN: Refusing mutable Python update: requirements.txt is not fully hash-locked.",
				);
			} else {
				pythonCommands.push(
					`${envType === "uv" ? "uv pip" : "pip"} install --require-hashes -r "${reqPath}"`,
				);
			}
		}
		if (fs.existsSync(absToml) && envType === "uv") {
			if (fs.existsSync(path.join(pythonFilesDir, "uv.lock"))) {
				pythonCommands.push(`uv sync --frozen --project "${tomlPath}"`);
			} else {
				refusedUnsafeUpdate = true;
				log(
					io,
					id,
					"WARN: Refusing mutable Python update: pyproject.toml has no uv.lock.",
				);
			}
		}
		if (fs.existsSync(absEnvYml) && envType === "conda") {
			const condaLock = path.join(pythonFilesDir, "conda-lock.yml");
			if (fs.existsSync(condaLock)) {
				pythonCommands.push(
					`conda-lock install --name "${envName}" "${path.join(relPath, "conda-lock.yml")}"`,
				);
			} else {
				refusedUnsafeUpdate = true;
				log(
					io,
					id,
					`WARN: Refusing mutable Python update from ${envYmlPath}: conda-lock.yml is required.`,
				);
			}
		}
	}

	if (pythonCommands.length > 0) {
		log(
			io,
			id,
			`INFO: Updating Python dependencies (Context: ${executionCwd})...`,
		);
		try {
			const wrappedCommands = await createVirtualEnvCommands(
				envName,
				pythonCommands,
				executionCwd,
				pythonVersion,
				envType,
			);

			const result = await executeCommands(
				wrappedCommands,
				executionCwd,
				io,
				id,
				false,
			);

			if (result.cancelled) {
				log(io, id, "INFO: Update cancelled.");
				return false;
			}
		} catch (error: any) {
			log(io, id, `ERROR: Python dependency update failed: ${error.message}`);
			return false;
		}
	}

	// Update Node dependencies
	const nodeDir = await findDirWithFile(projectDir, "package.json", signal);
	const nodeCommands: string[] = [];

	if (nodeDir) {
		const lockfiles = [
			"package-lock.json",
			"npm-shrinkwrap.json",
			"pnpm-lock.yaml",
		].filter((file) => fs.existsSync(path.join(nodeDir, file)));
		if (lockfiles.length !== 1) {
			refusedUnsafeUpdate = true;
			log(
				io,
				id,
				`WARN: Refusing Node update: expected exactly one supported lockfile, found ${lockfiles.length}.`,
			);
		} else if (
			lockfiles[0] === "pnpm-lock.yaml" &&
			dependencies.includes("pnpm")
		) {
			nodeCommands.push("pnpm install --frozen-lockfile --ignore-scripts");
		} else if (
			lockfiles[0] !== "pnpm-lock.yaml" &&
			dependencies.includes("node")
		) {
			nodeCommands.push("npm ci --ignore-scripts");
		} else {
			refusedUnsafeUpdate = true;
			log(
				io,
				id,
				"WARN: Refusing Node update: the lockfile package manager is not declared by this app.",
			);
		}
	}

	if (nodeCommands.length > 0 && nodeDir) {
		log(io, id, `INFO: Updating Node dependencies in ${nodeDir}...`);
		try {
			const result = await executeCommands(
				nodeCommands,
				nodeDir,
				io,
				id,
				false,
			);

			if (result.cancelled) {
				log(io, id, "INFO: Update cancelled.");
				return false;
			}
		} catch (error: any) {
			log(io, id, `ERROR: Node dependency update failed: ${error.message}`);
			return false;
		}
	}

	// Update git large files
	if (dependencies.includes("git_lfs")) {
		await executeCommand("git lfs pull", io, projectDir, id);
	}

	if (refusedUnsafeUpdate) {
		log(
			io,
			id,
			"ERROR: Dependency update was refused because no safe immutable update mode was available.",
		);
		return false;
	}

	if (pythonCommands.length === 0 && nodeCommands.length === 0) {
		log(
			io,
			id,
			"INFO: No standard dependency files found. Skipping dependency update.",
		);
		return true;
	}

	log(io, id, "INFO: Dependencies updated successfully.");
	return true;
}
