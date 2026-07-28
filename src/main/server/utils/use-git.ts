import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import type {
	GitHttpRequest,
	GitHttpResponse,
	HttpClient,
} from "isomorphic-git";
import type { Server } from "socket.io";

const ALLOWED_GIT_HOSTS = new Set(["github.com"]);

function validateGitUrl(value: string): URL {
	const parsed = new URL(value);
	if (
		parsed.protocol !== "https:" ||
		parsed.username ||
		parsed.password ||
		parsed.port ||
		!ALLOWED_GIT_HOSTS.has(parsed.hostname.toLowerCase())
	) {
		throw new Error("Git request is not an approved public HTTPS URL");
	}
	return parsed;
}

async function collectBody(
	body: GitHttpRequest["body"],
	signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
	if (!body) return undefined;
	const chunks: Uint8Array[] = [];
	let length = 0;
	for await (const chunk of body) {
		if (signal?.aborted) throw signal.reason;
		chunks.push(chunk);
		length += chunk.byteLength;
	}
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

const createRestrictedHttp = (signal?: AbortSignal): HttpClient => ({
	request: async (request): Promise<GitHttpResponse> => {
		let currentUrl = validateGitUrl(request.url);
		let method = request.method ?? "GET";
		let body = await collectBody(request.body, signal);

		for (let redirects = 0; redirects <= 5; redirects++) {
			if (signal?.aborted) throw signal.reason;
			const response = await fetch(currentUrl, {
				method,
				headers: request.headers,
				body: body as BodyInit | undefined,
				redirect: "manual",
				signal,
			});
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				const location = response.headers.get("location");
				await response.body?.cancel();
				if (!location || redirects === 5) {
					throw new Error("Git request exceeded the redirect limit");
				}
				currentUrl = validateGitUrl(new URL(location, currentUrl).href);
				if (
					response.status === 303 ||
					((response.status === 301 || response.status === 302) &&
						method === "POST")
				) {
					method = "GET";
					body = undefined;
				}
				continue;
			}

			return {
				url: currentUrl.href,
				method,
				statusCode: response.status,
				statusMessage: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				body: response.body
					? (response.body as unknown as AsyncIterableIterator<Uint8Array>)
					: undefined,
			};
		}
		throw new Error("Git request exceeded the redirect limit");
	},
});

export async function useGit(
	command: string,
	workingDir: string,
	io: Server,
	id: string,
	signal?: AbortSignal,
) {
	if (signal?.aborted) throw signal.reason;
	const isCloneCommand = /^git\s+clone(?:\s|$)/.test(command.trim());

	if (isCloneCommand) {
		// Dione application manifests are currently hosted on GitHub. Keep this
		// list deliberately explicit; add a host only after reviewing its redirect
		// behavior and confirming that Dione actually distributes apps from it.
		const args = command.trim().split(/\s+/).slice(2);
		let url: string | undefined;
		let folder: string | undefined;
		let branch: string | undefined;

		for (let i = 0; i < args.length; i++) {
			if (args[i].startsWith("https://")) {
				const parsed = validateGitUrl(args[i]);
				url = parsed.href;
				// the folder is the next argument (if it exists and is not a flag)
				if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
					folder = args[i + 1];
				}
				break;
			}
		}
		if (!url) throw new Error("A valid HTTPS Git clone URL is required");
		const approvedUrl = url;
		if (
			folder &&
			(folder.startsWith("-") ||
				path.isAbsolute(folder) ||
				path.basename(folder) !== folder)
		) {
			throw new Error("Invalid Git clone destination");
		}

		const root = path.resolve(workingDir);
		const repositoryName = path.posix
			.basename(new URL(approvedUrl).pathname)
			.replace(/\.git$/, "");
		const destination = path.resolve(root, folder || repositoryName);
		const relativeDestination = path.relative(root, destination);
		if (
			!repositoryName ||
			relativeDestination === "" ||
			relativeDestination === ".." ||
			relativeDestination.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relativeDestination)
		) {
			throw new Error("Git clone destination escapes the working directory");
		}
		const canonicalRoot = await fs.promises.realpath(root);
		const canonicalParent = await fs.promises.realpath(
			path.dirname(destination),
		);
		const canonicalRelative = path.relative(canonicalRoot, canonicalParent);
		if (
			canonicalRelative === ".." ||
			canonicalRelative.startsWith(`..${path.sep}`)
		) {
			throw new Error(
				"Git clone destination parent escapes the working directory",
			);
		}
		try {
			await fs.promises.mkdir(destination);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") {
				throw new Error("Git clone destination already exists");
			}
			throw error;
		}
		const reservedDestination = await fs.promises.realpath(destination);
		const reservedRelative = path.relative(canonicalRoot, reservedDestination);
		if (
			reservedRelative === ".." ||
			reservedRelative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(reservedRelative)
		) {
			await fs.promises.rm(destination, { recursive: true, force: true });
			throw new Error(
				"Reserved Git clone destination escaped the working directory",
			);
		}

		// search for branch
		const branchIndex = args.findIndex(
			(arg) => arg === "--branch" || arg === "-b",
		);
		if (branchIndex !== -1 && branchIndex + 1 < args.length) {
			branch = args[branchIndex + 1];
		}

		// clone the repository
		io.to(id).emit("installUpdate", {
			type: "log",
			content: `Cloning repository ${approvedUrl} ${folder ? `to ${workingDir}/${folder}` : ""}${branch ? ` on branch ${branch}` : ""}\n`,
		});

		let lastError: any = null;
		let refToTry = branch ? branch : "main";
		let result = false;
		let lastProgressEmit = 0;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				if (signal?.aborted) throw signal.reason;
				await git.clone({
					fs,
					http: createRestrictedHttp(signal),
					dir: destination,
					url: approvedUrl,
					singleBranch: true,
					ref: refToTry,
					batchSize: 10,
					onProgress: (progress) => {
						if (signal?.aborted) throw signal.reason;
						const now = Date.now();
						if (now - lastProgressEmit > 100) {
							lastProgressEmit = now;
							const total = progress.total ? `/${progress.total}` : "";
							const percentage = progress.total
								? ` (${Math.round((progress.loaded / progress.total) * 100)}%)`
								: "";
							io.to(id).emit("installUpdate", {
								type: "log",
								content: `\rCloning repository... ${progress.loaded}${total}${percentage}`,
							});
						}
					},
				});
				result = true;
				io.to(id).emit("installUpdate", {
					type: "log",
					content: "\n",
				});
				break;
			} catch (err: any) {
				lastError = err;
				if (
					!branch &&
					refToTry === "main" &&
					attempt === 0 &&
					(err.message?.includes("not found") ||
						err.message?.includes("does not exist") ||
						err.message?.includes("Could not find"))
				) {
					io.to(id).emit("installUpdate", {
						type: "log",
						content: `\nBranch 'main' not found, trying 'master'...`,
					});
					refToTry = "master";
					await fs.promises.rm(destination, { recursive: true, force: true });
					await fs.promises.mkdir(destination);
				} else {
					break;
				}
			}
		}

		if (!result) {
			await fs.promises.rm(destination, { recursive: true, force: true });
			io.to(id).emit("installUpdate", {
				type: "error",
				content: `\nFailed to clone repository: ${lastError?.message || lastError}`,
			});
			throw lastError;
		}

		return true;
	}

	return false;
}
