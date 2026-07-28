# Dione Comprehensive Codebase Audit

**Audit date:** July 27, 2026

**Repository:** `pierrunoyt/dioneapp`

**Baseline health score:** **24/100 — high risk**

## Executive summary

This audit covered every tracked file in the repository—approximately 66,961 lines—including the Electron main process and preload, Express and Socket.IO backend, installation and process-management subsystem, renderer, AI/Ollama integration, Supabase routes, build and packaging configuration, CI/CD, scripts, translations, dependencies, and documentation.

The dominant problem is architectural: Dione exposes filesystem access, native command execution, software installation, database mutation, AI tools, and process management through an HTTP/Socket.IO control plane that has no authentication and permissive CORS. The server now binds to loopback, reducing network exposure without protecting it from local processes or malicious browser content. At the same time, the Electron renderer receives a broad generic IPC bridge, remote webviews receive powerful capabilities, and Chromium sandbox/web-security protections are weakened.

These weaknesses compound each other. A renderer compromise, malicious local website, local process, exposed tunnel client, prompt injection, or compromised script repository may be able to reach native operating-system capabilities.

### Consolidated finding count

| Severity | Count |
|---|---:|
| Critical | 8 |
| High | 23 |
| Medium | 22 |
| Low | 9 |
| **Total** | **62** |

Closely related endpoint- or installer-specific defects are consolidated under shared root causes rather than repeated as separate findings.

## Remediation update — July 27, 2026

The first 10 quick wins were implemented after the baseline audit. Six broader findings are resolved, four are partially remediated, and the release-blocking architectural risks remain open.

| Quick win | Status | Audit impact |
|---|---|---|
| Remove duplicate PTY command write | Resolved | H-02 resolved |
| Await the `end-session` IPC call | Resolved | M-20 resolved |
| Handle upload-dialog cancellation | Resolved | Renderer crash fixed |
| Bind the backend to `127.0.0.1` | Implemented; broader risk remains | C-01 partially remediated; authentication and CORS remain open |
| Remove per-install `process.exit(1)` | Resolved | H-04 resolved |
| Restrict external OS links to HTTPS | Implemented; broader risk remains | H-22 partially remediated; arbitrary `new-window` loading remains open |
| Preserve other apps' keyed state when stopping one app | Resolved | H-20 resolved |
| Preserve replacement dependency cancellation handles | Resolved | H-07 resolved |
| Acquire the single-instance lock before startup side effects | Resolved | M-02 resolved |
| Guard the featured carousel's empty/error state | Resolved | M-17 partially remediated; stale feed requests remain open |

The download workflow was also made awaitable through installation completion as part of removing `process.exit(1)`. Some download and validation failure branches still resolve rather than reject, so H-03 remains partially open.

## Low-severity remediation update — July 27, 2026

All nine low-severity findings from the baseline audit have been remediated:

| Finding | Status | Remediation |
|---|---|---|
| L-01 | Resolved | Removed dormant renderer authentication/token modules, inactive login UI and comments, and stale auth types. Active main-process security code was left intact. |
| L-02 | Resolved | Kept a single root `TranslationProvider` in `main.tsx`. |
| L-03 | Resolved | Added names, roles, focus handling, keyboard navigation, focus restoration, and visible focus states to the audited selects, toggles, menus, dialogs, icon controls, carousel controls, cards, toast controls, and settings actions. Interactive elements are no longer nested in the audited card and topbar controls. This is a remediation of the identified defects, not a claim of full WCAG certification. |
| L-04 | Resolved | Toast, onboarding, report-navigation, and AI redirect timers are tracked and cleared. The report flow also guards against scheduling a timer after an asynchronous submission finishes on an unmounted page. |
| L-05 | Resolved | Onboarding, carousel/video, Quick AI, and floating AI decoration now honor reduced-motion preferences. Automatic carousel rotation is disabled when reduced motion is requested. |
| L-06 | Resolved | `.editorconfig` now agrees with Biome's tab indentation policy. |
| L-07 | Resolved | README development commands now consistently use `npm ci` and `npm run ...`. |
| L-08 | Resolved | README repository, release, support, security, account-status, and maintenance-status copy was updated; stale renderer login entry points were removed. |
| L-09 | Resolved | Added a deterministic lockfile-derived `THIRD_PARTY_NOTICES.md`, explicit reviewed overrides for the three lock entries without license metadata, packaging rules, and a build-time freshness check. |

The **24/100 score remains the historical baseline score** and has not been recalculated. The unresolved critical and high findings continue to dominate current risk.

## Medium-severity remediation update — July 28, 2026

The code-level remediation for M-01 through M-21 is complete. M-02 and M-20 were already resolved in the July 27 quick-win pass; the remaining findings were addressed in this pass. M-22 is conditionally resolved at the code boundary, but deployment-side Supabase key classification and row-level security policies must be verified outside this repository before it can be closed unconditionally.

| Finding | Status | Remediation |
|---|---|---|
| M-01 | Resolved | Added a process-level idempotent shutdown coordinator with effective deadlines, failure-isolated cleanup, backend-dependent cleanup ordering, and coverage for window close, normal quit, restart, and updater paths. |
| M-02 | Previously resolved | The single-instance lock remains ahead of startup side effects. |
| M-03 | Resolved | The backend binds directly to loopback port `0`, rejects listen failures, and reads the assigned port from the listening socket; the race-prone port reservation helper was removed. |
| M-04 | Resolved | Configuration updates use a strict allowlist and types, canonicalize paths through existing ancestors, reject filesystem/application/system roots, and persist atomically with file and directory fsync. |
| M-05 | Resolved | Removed the generic environment-variable router and renderer editor. Runtime settings now use the typed configuration surface. |
| M-06 | Resolved | Tunnel operations are serialized, credentials are not logged, old close events cannot clear newer state, and only the actual backend port can be exposed. |
| M-07 | Resolved | Added request/history/context/output/tool-loop limits, model allowlisting, per-operation abortable Ollama clients, deadlines, concurrency and pull-rate limits, bounded tool reads, and a free-space-aware model pull budget. |
| M-08 | Resolved | AI logs now contain operational metadata such as IDs, sizes, models, outcomes, and timings rather than prompts, responses, reasoning, source context, or tool content. |
| M-09 | Resolved | Git cloning now accepts approved credential-free HTTPS GitHub URLs only, manually validates every redirect, atomically reserves and verifies a contained destination, and removes failed partial clones. |
| M-10 | Resolved | Elevated scripts are created exclusively in private temporary directories with restrictive permissions and are removed in `finally` cleanup. |
| M-11 | Resolved | Installer locks use owner tokens, PID and process-start identity, serialized heartbeats, liveness checks, in-process serialization, ownership-checked release, and stale-owner recovery. |
| M-12 | Resolved | CUDA removal uses promise-based filesystem APIs and deletes only manifest-proven Dione-owned paths and matching environment entries. |
| M-13 | Resolved | Automatic dependency updates require immutable inputs: hashed Python requirements or lockfiles, frozen Node lockfiles, and lifecycle-script suppression; unsafe mutable updates are refused. |
| M-14 | Resolved | Manifest discovery is asynchronous and iterative with cancellation, ignored heavy directories, and explicit depth and entry budgets. |
| M-15 | Resolved | Workspace tree/file requests use generations and abort signals; saves capture file identity and mark clean only when the saved content is still current. |
| M-16 | Resolved | Renderer AI submissions are serialized and use current-message references and pending state so stale snapshots cannot overwrite chat or loading state. |
| M-17 | Resolved | Feed and featured requests abort or ignore stale completions, and the carousel resets its index when an accepted slide set changes. |
| M-18 | Resolved | Audit-identified local-storage reads now use a shared parser with shape validation, invalid-value removal, and fresh defaults. |
| M-19 | Resolved | Settings use serialized partial PATCH operations; reset is in the same recovered queue, blocks later writes, clears only owned keys, and navigates only after confirmation. |
| M-20 | Previously resolved | Settings reset continues to await session termination before navigation. |
| M-21 | Resolved | Runtime translation lookup falls back to English, locale selection is validated, and CI checks every locale for invalid or unknown schema entries. |
| M-22 | **Conditionally resolved** | Build-time webhook and privileged API-token injection was removed. Bundled Supabase values are explicitly public URL/anonymous credentials; reports pass through the backend and privileged service access uses optional runtime-only `DIONE_API_KEY`. Confirm that the deployed key is truly anonymous and that RLS is enabled and tested for every reachable table before closing this finding. |

The **24/100 health score remains the historical audit baseline**; it has not been recalculated. This remediation does not certify the application as secure, and the unresolved critical and high findings still dominate overall risk. The medium-finding table below is retained as the original baseline evidence and recommendation record; current status is authoritative in this remediation update.

## Top 10 highest-impact issues

| Rank | Severity | Issue | Effort |
|---:|---|---|---|
| 1 | Critical | Unauthenticated native control plane | L |
| 2 | Critical | Script-name path traversal enables arbitrary writes and deletion | M |
| 3 | Critical | Generic renderer IPC bridge exposes privileged main-process operations | L |
| 4 | Critical | Chromium sandbox and Linux web security are disabled | M–L |
| 5 | Critical | File routes and AI tools can escape application roots | L |
| 6 | Critical | Database APIs trust spoofable identities and permit mass assignment | L |
| 7 | Critical | Remote unsigned `dione.json` files receive native shell execution | XL |
| 8 | High | Downloads return before completion and can terminate Electron | M |
| 9 | High | Global process/cancellation state causes cross-app races and orphan processes | L |
| 10 | High | Vulnerable Electron, updater, Socket.IO, systeminformation, and transitive runtime packages | M–L |

---

# Critical findings

## C-01 — Unauthenticated privileged HTTP and Socket.IO server

- **Severity:** Critical
- **Category:** Security, authentication, authorization, architecture
- **Files:** `src/main/server/server.ts:13-36`, `src/main/server/routes/setup.ts:16-50`, `src/main/socket/socket.ts:6-24`
- **Effort:** L

**Status:** Partially remediated. The HTTP server now binds to `127.0.0.1`; authentication, CORS, and Socket.IO authorization remain open.

**Description:** Express enables unrestricted `cors()` and mounts all privileged routers without authentication. Socket.IO accepts `origin: "*"` and lets clients select arbitrary application rooms. The explicit loopback bind reduces LAN exposure but does not protect the API from other local processes or malicious browser content.

**Why it matters:** Any local process, malicious website, or tunnel client that can reach the service may access configuration, environment variables, filesystem operations, dependency installation, native script execution, AI tools, process cancellation, and database mutation. Socket clients can subscribe to other applications' output.

**Recommended fix:**

1. Generate a high-entropy token per launch in the main process.
2. Require it on every HTTP and Socket.IO connection.
3. Restrict CORS to the exact renderer origin.
4. Have the server assign authorized rooms.
5. Treat remote tunnel exposure as a separate authenticated API.

```ts
app.use(cors({ origin: trustedRendererOrigin }));

app.use((req, res, next) => {
	const supplied = req.get("authorization")?.replace(/^Bearer /, "");
	return secureTokenMatch(supplied, serverToken)
		? next()
		: res.sendStatus(401);
});

server.listen(port, "127.0.0.1");

io.use((socket, next) => {
	next(
		secureTokenMatch(socket.handshake.auth.token, serverToken)
			? undefined
			: new Error("Unauthorized"),
	);
});
```

## C-02 — Script-name traversal escapes the applications directory

- **Severity:** Critical
- **Category:** Path traversal, arbitrary file write/deletion
- **Files:** `src/main/server/scripts/utils/paths.ts:14-49`, `src/main/server/scripts/delete.ts:7-40`, `src/main/server/scripts/local.ts:190-225`
- **Effort:** M

**Description:** `sanitizeScriptName()` only trims and replaces whitespace. It accepts `..`, path separators, absolute paths, drive-qualified paths, and control characters. The result is joined beneath `apps` without canonical containment validation.

**Why it matters:** Crafted names can direct installation, metadata writes, command execution, or recursive deletion outside Dione's application directory.

**Recommended fix:** Prefer immutable IDs or server-issued slugs. Reject unsafe names and verify containment after `path.resolve`. For existing paths, account for symlinks using `realpath`.

```ts
const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function resolveAppPath(appsRoot: string, name: string): string {
	if (!SCRIPT_NAME.test(name) || name === "." || name === "..") {
		throw new Error("Invalid application name");
	}

	const root = path.resolve(appsRoot);
	const target = path.resolve(root, name);
	const relative = path.relative(root, target);

	if (
		relative === "" ||
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("Application path escapes root");
	}

	return target;
}
```

## C-03 — Generic preload bridge exposes arbitrary IPC channels

- **Severity:** Critical
- **Category:** Electron trust boundary, IPC authorization
- **Files:** `src/preload/index.ts:36-61`, `src/preload/index.d.ts:29-38`, representative handlers in `src/main/index.ts:790-903,1058-1231`
- **Effort:** L

**Description:** The preload exposes Electron Toolkit's complete `electronAPI`, including generic `ipcRenderer.invoke`, `send`, and listener registration. Main-process handlers do not consistently verify `event.senderFrame`, origin, owning window, or payload schemas.

**Why it matters:** A renderer XSS or compromised remote webview can invoke filesystem, process, configuration, tunnel, window, URL, screenshot, and logging operations rather than a small allowlisted API.

**Recommended fix:** Remove `window.electron.ipcRenderer`. Expose a frozen, channel-specific API and validate the sender and payload in every handler.

```ts
contextBridge.exposeInMainWorld(
	"dione",
	Object.freeze({
		getConfig: () => ipcRenderer.invoke("config:get"),
		openHttpsLink: (url: string) =>
			ipcRenderer.invoke("link:open-https", url),
	}),
);

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
	if (event.sender !== mainWindow?.webContents) {
		throw new Error("Untrusted IPC sender");
	}
}
```

## C-04 — Chromium sandbox and web security are disabled

- **Severity:** Critical
- **Category:** Electron hardening
- **File:** `src/main/index.ts:211-270`
- **Effort:** M–L

**Description:** The main window uses `sandbox: false` and `webviewTag: true`. Linux additionally disables `webSecurity`, allows insecure content, and uses `no-sandbox`.

**Why it matters:** Renderer XSS, malicious webview content, dependency compromise, or mixed-content substitution receives substantially more power and fewer origin/process protections.

**Recommended fix:**

```ts
webPreferences: {
	contextIsolation: true,
	nodeIntegration: false,
	sandbox: true,
	webSecurity: true,
	webviewTag: false,
	allowRunningInsecureContent: false,
	preload: join(__dirname, "../preload/index.js"),
}
```

If remote previews are indispensable, isolate them in `WebContentsView` or a separately configured window with no preload, ephemeral storage, strict navigation, and default-deny permissions.

## C-05 — File routes and symlinks can escape application roots

- **Severity:** Critical
- **Category:** Filesystem isolation, path traversal
- **File:** `src/main/server/routes/files.ts:251-334,415-460,576-736`
- **Effort:** L

**Description:** Application-root candidates are resolved without proving they remain beneath the configured base. Later checks are mostly lexical. `readFile`, `writeFile`, `rename`, and `rm` follow symlinks.

**Why it matters:** Attackers can select an arbitrary existing directory as a workspace or use an in-root symlink to read, overwrite, rename, or delete external files.

**Recommended fix:** Resolve app roots only from server-enumerated direct children. Compare canonical `realpath` values, reject symlink traversal, and use no-follow/open-by-handle operations for sensitive mutation.

```ts
const baseReal = await fs.promises.realpath(appsRoot);
const candidateReal = await fs.promises.realpath(candidate);
const relative = path.relative(baseReal, candidateReal);

if (relative.startsWith("..") || path.isAbsolute(relative)) {
	throw new Error("Path escapes applications root");
}
```

## C-06 — AI file tool permits model-driven arbitrary local file reads

- **Severity:** Critical
- **Category:** AI security, prompt injection, information disclosure
- **File:** `src/main/server/routes/ai/ollama/tools.ts:24-61`
- **Effort:** M

**Description:** Model-controlled `project` and `file` values are joined into filesystem paths without canonical containment checks. Symlinks are followed, and entire file contents become model/tool output.

**Why it matters:** Prompt injection or direct API access can disclose source, credentials, configuration, SSH files, user documents, and other files readable by Electron.

**Recommended fix:** Require a server-selected project ID, canonicalize paths, reject absolute/traversing/symlink paths, enforce file-type and size limits, block sensitive names, and require explicit user approval before reading.

## C-07 — Supabase APIs trust spoofable identities and permit mass assignment

- **Severity:** Critical
- **Category:** Authentication, authorization, IDOR, data integrity
- **File:** `src/main/server/routes/database.ts:530-699`
- **Effort:** L

**Description:** Script updates accept the entire request body. Event identity and ownership come from caller-supplied `user` and `id` headers. Queries do not derive identity from verified authentication.

**Why it matters:** Reachable callers may mutate arbitrary script records, forge telemetry, read another user's event statistics, close arbitrary events, or assign ownership fields. Raw Supabase errors may expose backend details.

**Recommended fix:** Authenticate requests, derive user identity from the verified session, allowlist mutable fields, enforce ownership in every query, and add Supabase RLS as defense in depth.

```ts
const patch = UpdateScriptSchema.parse(req.body);

await supabase
	.from("scripts")
	.update(patch)
	.eq("id", req.params.id)
	.eq("owner_id", req.auth.userId);
```

## C-08 — Unsigned remote scripts receive unrestricted native execution

- **Severity:** Critical
- **Category:** Supply chain, remote code execution
- **Files:** `src/main/server/scripts/download.ts:18-53`, `src/main/server/scripts/execute.ts:93-193`, `src/main/server/scripts/process.ts:175-238`
- **Effort:** XL

**Description:** Remotely downloaded `dione.json` command strings are passed verbatim to `cmd.exe` or Bash. Content is not cryptographically signed or digest-pinned, and execution is not sandboxed.

**Why it matters:** Compromise of the script service, repository, publisher account, mutable branch, DNS/CDN, or dependency source becomes native execution as the user.

**Recommended fix:**

- Use immutable commit URLs.
- Require publisher signatures and trusted keys.
- Pin SHA-256 in independently trusted metadata.
- Validate strict manifest schemas.
- Display exact commands and capabilities before execution.
- Move execution to a restricted helper or sandbox.
- Long term, replace free-form shell strings with typed operations.

---

# High-severity findings

## H-01 — Unauthenticated endpoints accept replacement shell commands

- **Category:** Command injection, authorization
- **Files:** `src/main/server/routes/scripts.ts:93-123`, `src/main/server/scripts/execute.ts:399-417`
- **Description:** `replaceCommands` can override trusted startup commands and reach a shell.
- **Why it matters:** A reachable caller can substitute arbitrary command text into application startup.
- **Fix:** Remove the field from the public API; expose only server-defined command-option IDs.
- **Effort:** M

## H-02 — Every PTY command is written twice

- **Status:** Resolved on July 27, 2026. Each command is now written once.
- **Category:** Logic, process execution
- **File:** `src/main/server/scripts/process.ts:218-238`
- **Description:** Two consecutive blocks write the same command to the PTY.
- **Why it matters:** Install, delete, migration, and startup commands can execute twice, causing corruption, duplicate servers, lock races, and repeated elevation prompts.
- **Fix:** Delete the duplicate block and add an exactly-once execution test.
- **Effort:** S

## H-03 — Download failure outcomes can still be reported as success

- **Status:** Partially remediated on July 27, 2026. The workflow now returns a Promise through installation completion, but several HTTP/file/system/dependency failure branches resolve rather than reject.
- **Category:** Async race, error handling
- **File:** `src/main/server/scripts/download.ts:113-286`
- **Description:** `downloadFile()` is now awaitable, but non-200 responses, request/file errors, unsupported systems, and malformed dependency outcomes can still resolve the Promise after emitting an error event.
- **Why it matters:** The HTTP route can return success despite a failed download or validation outcome, allowing renderer state to diverge from installation state.
- **Fix:** Reject or return a structured failure for every unsuccessful terminal branch; use atomic temporary-file writes and return success only after installation completes.
- **Effort:** M

## H-04 — Installation failure can terminate the entire Electron app

- **Status:** Resolved on July 27, 2026. Per-install failures no longer terminate Electron; complete failure propagation remains tracked under H-03.
- **Category:** Availability, error handling
- **File:** `src/main/server/scripts/download.ts:217-227`
- **Description:** A per-install failure invokes `process.exit(1)`.
- **Why it matters:** One malformed or failing install kills the UI and every unrelated operation.
- **Fix:** Propagate a structured operation failure; never terminate the process from a per-job helper.
- **Effort:** S

## H-05 — Global cancellation state races across applications

- **Category:** Concurrency, synchronization
- **File:** `src/main/server/scripts/process.ts:154-173,331-362`
- **Description:** One module-global cancellation flag is shared by every application and operation.
- **Why it matters:** Stopping app A can cancel app B; starting app B can clear A's cancellation; one command failure affects unrelated work.
- **Fix:** Store an `AbortController` and cancellation state per operation/app.
- **Effort:** M

## H-06 — Child processes may survive cancellation and shutdown

- **Category:** Resource leak, process lifecycle
- **Files:** `src/main/server/scripts/process.ts:112-173`, `src/main/server/routes/ai/ollama/ollama.ts:78-124`
- **Description:** Shells are interrupted or killed without reliably awaiting and terminating owned descendants. Ollama is not registered in the PTY process manager used by its stop route.
- **Why it matters:** Grandchildren, elevated installers, or Ollama can continue holding ports/files and consuming resources after the UI reports success.
- **Fix:** Track owned PID trees, await graceful exit, escalate after a timeout, and clear state only after confirmed termination.
- **Effort:** L

## H-07 — Dependency replacement race loses cancellation handles

- **Status:** Resolved on July 27, 2026. Cleanup now verifies controller identity before deleting the map entry.
- **Category:** Concurrency
- **File:** `src/main/server/routes/dependencies.ts:39-80`
- **Description:** An old request's `finally` unconditionally deletes the map entry by ID after a replacement controller has been installed.
- **Why it matters:** Cancellation of the newer operation returns 404 while it continues running.
- **Fix:** Delete only if the map still contains that exact controller.
- **Effort:** S

```ts
if (activeInstallations.get(id) === controller) {
	activeInstallations.delete(id);
}
```

## H-08 — Process output and duration are unbounded

- **Category:** Performance, denial of service
- **File:** `src/main/server/scripts/process.ts:175-187,274-318`
- **Description:** PTY commands have no deadline, and output is appended to an unbounded string and broadcast without rate limiting.
- **Why it matters:** A noisy or hung command can consume unbounded main-process memory and keep requests open indefinitely.
- **Fix:** Add per-command deadlines, cancellation, a bounded ring buffer, and socket-output rate limiting.
- **Effort:** M

## H-09 — `cd` parsing allows workspace escape and changes shell semantics

- **Category:** Command execution, path traversal
- **File:** `src/main/server/scripts/process.ts:423-462`
- **Description:** A regex extracts `cd`, accepts absolute paths and `..`, and rewrites the remaining command.
- **Why it matters:** Later commands can operate outside the app root, and valid quoted/compound shell expressions may be changed incorrectly.
- **Fix:** Represent working directories structurally rather than parsing shell text; enforce canonical containment.
- **Effort:** M

## H-10 — Environment fields are interpolated into nested shells

- **Category:** Command injection
- **Files:** `src/main/server/scripts/execute.ts:108-155`, `src/main/server/scripts/dependencies/env-utils.ts:79-185`
- **Description:** Environment names, versions, paths, and command bodies are interpolated into `cmd` and nested `bash -c` strings.
- **Why it matters:** Quotes and shell metacharacters can alter command structure; valid unusual paths also break installations.
- **Fix:** Validate identifiers and versions; use `spawn`/`execFile` argument arrays and `conda run`.
- **Effort:** M–L

## H-11 — Process-wide filesystem API monkey-patching

- **Category:** Concurrency, filesystem correctness
- **File:** `src/main/server/scripts/dependencies/utils/patch-sync-methods.ts:8-72`
- **Description:** Uninstall temporarily replaces process-global synchronous `fs` functions with asynchronous, unawaited, error-suppressing wrappers.
- **Why it matters:** Concurrent code receives invalid return values, operations report success too early, and overlapping restores may leave the global API corrupted.
- **Fix:** Remove monkey-patching and convert uninstallers to explicit `fs.promises` operations.
- **Effort:** L

## H-12 — Downloaded installers and archives lack integrity verification

- **Category:** Supply chain
- **Files:** Dependency installers under `src/main/server/scripts/dependencies/files/`
- **Description:** UV, pnpm, Ollama, Node, Git, Git LFS, FFmpeg, CUDA, Conda, and Build Tools artifacts are executed or extracted without pinned digests or vendor-signature checks.
- **Why it matters:** Upstream, CDN, redirect, account, or proxy compromise becomes native execution; some installers elevate privileges.
- **Fix:** Centralize downloads; pin versions and SHA-256 values; verify Authenticode/vendor signatures before execution or elevation.
- **Effort:** L–XL

## H-13 — Archive extraction lacks traversal, link, and bomb controls

- **Category:** Archive security
- **Files:** `dependencies/files/uv.ts:152-203`, `node.ts:203-255`, `git.ts:183-260`, `git-lfs.ts:155-234`, `ffmpeg.ts:177-229`, `ollama.ts:111-166`
- **Description:** Archives are passed directly to `tar`, `unzip`, or PowerShell without preflighting member names, links, count, or expanded size.
- **Why it matters:** Malicious archives may exploit path traversal, symlinks, special entries, decompression bombs, or vulnerable parsers.
- **Fix:** Verify digest first, inspect archive members, reject links/traversal/special entries, enforce limits, and extract into private staging directories.
- **Effort:** L

## H-14 — Installer subprocesses unnecessarily enable shell parsing

- **Category:** Command injection, platform compatibility
- **Files:** Multiple installers under `src/main/server/scripts/dependencies/files/`, including `cuda.ts:188-241`
- **Description:** Commands already represented as executable/argument arrays also set `shell: true` or enable shell mode on Windows.
- **Why it matters:** Metacharacters in configurable paths and arguments are interpreted and can change behavior.
- **Fix:** Invoke executables directly with `shell: false` and argument arrays.
- **Effort:** M

## H-15 — Remote preview webview is overprivileged

- **Category:** Renderer security, permissions
- **File:** `src/renderer/src/components/features/install/iframe.tsx:147-207`
- **Description:** An insufficiently validated URL receives persistent storage, popups, mixed-content support, and automatic camera/microphone permission.
- **Why it matters:** Redirected or attacker-controlled preview content can gain privacy-sensitive capabilities and persistent state.
- **Fix:** Restrict to validated loopback origins and ports, use ephemeral storage, remove popups/insecure content, deny media by default, and block navigation away from the allowed origin.
- **Effort:** M–L

## H-16 — Preview polling is unbounded and permits concurrent loops

- **Category:** Performance, lifecycle, race condition
- **File:** `src/renderer/src/components/contexts/scripts-context.tsx:258-293`
- **Description:** Polling has no timeout or abort signal, and the in-flight guard is set only after polling succeeds.
- **Why it matters:** A preview that never starts polls forever; duplicate events can start multiple loops and open stale ports.
- **Fix:** Set the guard before the first `await`, add operation-scoped abort, a deadline, generation token, and cleanup.
- **Effort:** M

## H-17 — Renderer treats HTTP failures as success

- **Category:** API correctness, error handling
- **Files:** `src/renderer/src/pages/install.tsx:387-533`, `src/renderer/src/components/features/editor/workspace-editor.tsx:148-266,403-521`
- **Description:** Critical calls use `fetch` semantics without checking `response.ok` and update state immediately.
- **Why it matters:** Failed installs, starts, saves, renames, and deletes can appear successful and diverge from disk/backend state.
- **Fix:** Centralize a typed helper that throws on non-2xx and mutate state only after confirmed success.
- **Effort:** M

## H-18 — Failed uninstall removes renderer state anyway

- **Category:** Destructive operation, state integrity
- **File:** `src/renderer/src/pages/install.tsx:584-635`
- **Description:** Stop, local-list removal, and quick-launch reload execute after caught deletion/uninstall failures.
- **Why it matters:** An application may remain installed while disappearing from local state and quick launch.
- **Fix:** Return immediately on failure and refresh authoritative state from the backend.
- **Effort:** S

## H-19 — Socket state captures stale data and leaks connections

- **Category:** React lifecycle, concurrency
- **Files:** `src/renderer/src/components/contexts/scripts-context.tsx:335-454`, `src/renderer/src/components/contexts/scripts/setup-socket.ts:135-143`
- **Description:** Long-lived callbacks capture stale application data. Disconnect removes a ref but does not disable reconnection or fully update React state.
- **Why it matters:** Multiple sockets may reconnect and emit duplicate events; callbacks can operate on the wrong application or old settings.
- **Fix:** Use one multiplexed socket, stable keyed refs, explicit cleanup, and synchronized React/ref state.
- **Effort:** M

## H-20 — Stopping one app erases other apps' state

- **Status:** Resolved on July 27, 2026. Keyed state updates now merge with prior state.
- **Category:** Logic, multi-app state
- **File:** `src/renderer/src/components/contexts/scripts-context.tsx:524-560`
- **Description:** State setters replace whole keyed objects with a single app entry.
- **Why it matters:** Stopping one app discards completion, catch, and view state for every other app.
- **Fix:** Use functional merges rather than replacing keyed objects.
- **Effort:** S

## H-21 — Diagnostic reporting leaks logs and persistent device identity

- **Category:** Privacy, secrets
- **Files:** `src/renderer/src/utils/discord-webhook.ts:42-108`, `src/main/utils/export-logs.ts:13-184`
- **Description:** Reports include full logs, stack traces, application details, and a stable computer identifier without a centralized redaction pass.
- **Why it matters:** Commands, paths, prompts, environment values, tunnel details, source, or credentials can be sent to a third party and correlated over time.
- **Fix:** Require preview/consent, remove stable hardware identifiers, recursively redact secrets and paths, cap output, and use a safe-field allowlist.
- **Effort:** M

## H-22 — External URL schemes and arbitrary windows are accepted

- **Status:** Partially remediated on July 27, 2026. Renderer and main-process OS link flows now permit HTTPS only; the separate renderer-controlled `new-window` IPC still requires an origin allowlist.
- **Category:** Electron/OS integration
- **Files:** `src/renderer/src/utils/open-link.ts:1-10`, `src/main/index.ts:895-903,1290-1314`
- **Description:** OS external-link paths now reject malformed and non-HTTPS URLs. However, the renderer can still request a new Electron window for an arbitrary URL without an explicit host allowlist.
- **Why it matters:** Attacker-controlled remote content may still be loaded into an Electron window, even though dangerous OS protocol handlers are no longer reached through the corrected link flows.
- **Fix:** Allowlist exact HTTPS origins for every secondary-window flow and configure those windows with explicit sandboxed `webPreferences`.
- **Effort:** S–M

## H-23 — Runtime dependency vulnerabilities

- **Category:** Dependencies, supply chain
- **Files:** `package.json`, `package-lock.json`
- **Description:** Lockfile audit reports 28 production vulnerabilities: 1 critical, 14 high, 9 moderate, and 4 low.
- **Why it matters:** Reachable high-risk paths include Electron, updater, Socket.IO/Engine.IO/`ws`, and `systeminformation`. Critical `protobufjs` vulnerabilities remain in the production graph even though the likely parent is translation tooling.
- **Fix:** Upgrade direct parents and verify the resulting lockfile, including:
  - Electron to a supported fixed release.
  - `electron-updater` resolving `builder-util-runtime >= 9.7.0`.
  - Socket.IO resolving `engine.io >= 6.6.7` and `ws >= 8.21.0`.
  - `systeminformation > 5.31.6`.
  - Current React Router.
  - Remove unnecessary production `@google/genai` and `node-vibrant` topology.
- **Effort:** M–L

---

# Medium-severity findings

| ID | Category and files | Description and impact | Recommended fix | Effort |
|---|---|---|---|---|
| M-01 | Lifecycle — `src/main/index.ts:717-737,1213-1225` | `Promise.race([await cleanup(), timeout])` awaits cleanup before racing, making timeouts ineffective. A failed Ollama stop can skip later cleanup. | Race an unawaited `Promise.allSettled(...)` against a timer; centralize idempotent shutdown. | M |
| M-02 | **Resolved July 27, 2026.** Startup — `src/main/index.ts` | The single-instance lock is now acquired before protocol registration, tray, Discord, backend, and window startup. | No further action for this finding. | — |
| M-03 | Server startup — `src/main/server/server.ts:18-35`, `utils/get-port.ts` | The server now binds to loopback, but port discovery still has a release-before-bind race and `listen()` errors may not reject startup. | Listen on port `0`, add an `error` rejection handler, then read the assigned port. | S |
| M-04 | Configuration — `src/main/config.ts:68-183`, `routes/config.ts:14-63` | Arbitrary fields and weakly validated paths are merged, logged, and written non-atomically. | Strict schema, approved root paths, secret redaction, temporary file + fsync + rename. | M |
| M-05 | Environment API — `src/main/server/routes/variables.ts:9-55` | Generic GET/POST/DELETE may disclose or modify process/system environment data. | Remove the generic API; expose only allowlisted non-secret settings. | M |
| M-06 | Tunneling — `src/main/index.ts:1077-1119`, `src/main/utils/tunnel.ts:23-115` | The renderer selects an arbitrary local port; credentials are logged; lifecycle calls race and old close handlers can clear new state. | Tunnel only the known backend port, serialize lifecycle, and avoid logging credentials. | M |
| M-07 | AI resource limits — `src/main/server/routes/ai/ollama/ollama.ts:176-385` | Arbitrary models, unbounded histories, pulls, output, and a `while (true)` tool loop permit disk/CPU/RAM exhaustion. | Add a model allowlist, body/output/concurrency/time/iteration limits, and abort on disconnect. | M |
| M-08 | AI logging — `ollama.ts:242-340` | Full prompts, system context, responses, reasoning, and source context are persisted in logs. | Log IDs, timings, sizes, and model names only; redact content. | M |
| M-09 | Git cloning — `src/main/server/utils/use-git.ts:12-110` | Arbitrary URLs permit SSRF and destination folders can escape the working root. | Host/protocol allowlist, private-address rejection, redirect revalidation, and path containment. | M |
| M-10 | Temporary files — `dependencies/utils/build-tools-manager.ts:49-96` | A predictable shared temporary batch file is not created exclusively and may remain after failure. | Private `mkdtemp`, exclusive creation, restrictive permissions, cleanup in `finally`. | S |
| M-11 | Installer locking — `dependencies/utils/build-tools.ts:492-564` | Locks older than 30 minutes are stolen without proving that the owner is dead. | PID/start-time metadata, heartbeat, liveness check, and OS lock. | M |
| M-12 | CUDA uninstall — `dependencies/files/cuda.ts:263-343` | Callback-style `rmdir` is incorrectly awaited and a potentially shared installation may be deleted. | Use `fs.promises.rm` only on manifest-proven app-owned paths. | M |
| M-13 | Update supply chain — `src/main/server/scripts/update.ts:99-209` | Updates run mutable `pip install -U`, `npm install`, `pnpm install`, and lifecycle hooks immediately after `git pull`. | Frozen lockfiles, Python hashes, `--ignore-scripts` where possible, and explicit approval. | M |
| M-14 | Synchronous scanning — `src/main/server/scripts/update.ts:8-76` | Recursive synchronous scans block Electron's event loop without depth or entry budgets. | Async iterative traversal with limits and cancellation. | M |
| M-15 | Workspace editor — `workspace-editor.tsx:124-480` | Out-of-order reads can overwrite newer file/tree state and potentially save under stale selection. | Request generations or `AbortController`; verify identity before committing. | M |
| M-16 | AI renderer state — `ai-context.tsx:152-210` | Concurrent prompts use stale message snapshots and one loading boolean. | Serialize or key requests; use current-message refs and a pending counter. | M |
| M-17 | **Partially remediated July 27, 2026.** Feed/carousel — `feed.tsx:34-145`, `featured-carrousel.tsx` | The carousel now renders an empty/error state safely. Old feed requests can still overwrite newer results. | Abort stale requests and ignore obsolete request generations. | M |
| M-18 | Local storage — `App.tsx`, scripts context, sidebar, library, sound, error page | Multiple unguarded `JSON.parse` calls can crash startup or major UI sections. | Central schema-validating parser with defaults and invalid-value removal. | M |
| M-19 | Settings races — `pages/settings.tsx:89-222` | Full-object writes can resolve out of order; reset clears all local storage before server confirmation. | Field-level PATCH/versioning; clear only owned keys after confirmed success. | M |
| M-20 | **Resolved July 27, 2026.** IPC mismatch — `pages/settings.tsx`, `src/main/index.ts` | Settings reset now awaits `ipcRenderer.invoke("end-session")` before navigation. | Migrate the remaining generic IPC call to a typed preload method during C-03 remediation. | — |
| M-21 | Translation schema — all locale files and `translation-context.tsx:95-132` | Every non-English locale is missing English keys; missing values display raw dotted keys because no English fallback exists. | Type locales against `typeof en`, add CI key-set validation, and fall back to English. | M |
| M-22 | Build secrets — `electron.vite.config.ts:12-32`, `.env.example`, build workflow | Supabase, webhook, and service values are compiled into distributed JavaScript. | Treat client values as public; use a Supabase anonymous key with RLS and move privileged operations server-side. | L |

---

# Low-severity and maintainability findings

| ID | Finding | Recommended fix | Effort |
|---|---|---|---|
| L-01 | **Resolved July 27, 2026.** Dormant renderer authentication and token code was removed. | Keep security documentation tied to active, tested controls. | — |
| L-02 | **Resolved July 27, 2026.** A single root translation provider remains. | Keep provider ownership in `main.tsx`. | — |
| L-03 | **Resolved July 27, 2026.** The identified custom controls now have keyboard, focus, and ARIA behavior. | Include accessibility interaction checks when adding controls. | — |
| L-04 | **Resolved July 27, 2026.** Identified UI timers are lifecycle-safe. | Continue tracking every stateful timer and asynchronous continuation. | — |
| L-05 | **Resolved July 27, 2026.** Identified decorative infinite animations honor reduced motion. | Apply the same policy to new animation surfaces. | — |
| L-06 | **Resolved July 27, 2026.** EditorConfig and Biome both specify tabs. | Keep formatting configuration synchronized. | — |
| L-07 | **Resolved July 27, 2026.** README uses npm's reproducible install workflow. | Keep examples aligned with CI and the lockfile. | — |
| L-08 | **Resolved July 27, 2026.** Project-status, account, download, support, and security documentation is current. | Review external links during releases. | — |
| L-09 | **Resolved July 27, 2026.** A deterministic dependency-license inventory is generated, checked, and packaged. | Regenerate notices after every lockfile change. | — |

---

# Dependency and supply-chain assessment

## Audit results

Lockfile-based `npm audit` results at audit time:

- **All dependencies:** 44 reported vulnerabilities
  - 2 critical
  - 26 high
  - 11 moderate
  - 5 low
- **Production graph:** 28 reported vulnerabilities
  - 1 critical
  - 14 high
  - 9 moderate
  - 4 low

Some advisories are build-only or affect unused methods, but the following are directly or plausibly reachable:

| Dependency | Risk | Reachability |
|---|---|---|
| `electron@37.10.3` | Memory-safety, permission, origin, and switch-injection advisories | Core runtime |
| `electron-updater` / `builder-util-runtime@9.5.1` | Cross-origin redirect credential leakage | Active updater |
| `socket.io` / `engine.io@6.6.6` / `ws@8.20.0` | Connection and memory exhaustion | Active local server/client |
| `systeminformation@5.31.5` | Linux command-injection advisories | Package actively used; affected network method not observed |
| `protobufjs` | Critical code-generation and parsing advisories | Transitive and apparently avoidable in production |
| `react-router` | High advisories, primarily SSR/RSC/data-router paths | CSR use lowers current exploitability |
| `sharp`, `tar`, `postcss`, `vite` | Parsing, traversal, and build-server risks | Primarily build/tooling |

## Dependency architecture issues

- `@google/genai` is used by translation generation but is in production dependencies.
- `node-vibrant` appears unused in source and adds image-processing topology.
- `localtunnel` is runtime code but is declared in `devDependencies`.
- `react` and `react-dom` are application runtime fundamentals but are declared as dev dependencies.
- Broad `node_modules/**/*` packaging may ship unnecessary code and licenses.
- The Axios override pins an old vulnerable release.
- Duplicate builder configurations make it unclear which dependency/file policy is authoritative.

---

# CI, release, packaging, and documentation

## CI/CD

- GitHub Actions use mutable major tags rather than pinned commit SHAs.
- Release jobs have broad write permissions.
- AI-generated translation TypeScript is committed directly without schema or AST validation.
- Gemini keys are unnecessarily passed on command lines.
- Release version input is not verified against `package.json`.
- Formatting CI uses `|| true`, suppressing failures, and stages with `git add .`.

## Packaging

- `package.json#build` and `electron-builder.yml` conflict on app ID, targets, notarization, artifact names, protocols, files, and publishing.
- macOS notarization is explicitly disabled and signing is not evident.
- Windows code-signing configuration is not evident.
- Broad resources are unpacked or included.
- Release artifacts have no evident checksums or attestations.

## Documentation

- README uses pnpm while the repository uses npm.
- `.env.example` does not match actual variable names.
- Download and support links are acknowledged as obsolete but still recommended.
- Repository metadata points to a different GitHub owner than the audited checkout.
- Security-sensitive architecture—local server exposure, remote scripts, tunnel behavior, and report data—is not documented.

---

# Testing assessment

The repository has no configured automated test framework, no `test` script, and no test/spec files. Type checking and builds cannot verify security boundaries, concurrency, lifecycle, or cross-process contracts.

## Highest-priority tests to add

1. **HTTP and Socket.IO security**
   - Loopback-only binding.
   - Authentication required for every privileged route.
   - CORS rejection.
   - Room authorization and event isolation.

2. **Filesystem containment**
   - `..`, absolute paths, mixed separators, encoded traversal.
   - Windows drive and UNC paths.
   - Symlink and reparse-point escapes.
   - Delete operations never escape configured roots.

3. **Exactly-once execution**
   - One command request executes once.
   - Download response matches actual terminal completion.
   - One job failure never exits Electron.

4. **Concurrency**
   - App A cancellation cannot affect app B.
   - Replacement installs preserve the new cancellation controller.
   - Stop/delete/update/start serialize per application.

5. **Electron IPC**
   - Only allowlisted preload methods exist.
   - Sender origin/window validation.
   - Runtime payload schemas.
   - `send`/`invoke` contract consistency.

6. **Database authorization**
   - Cross-user reads and writes fail.
   - Supabase RLS tests.
   - Mass-assignment fields are rejected.

7. **Lifecycle**
   - The single-instance loser starts no resources.
   - Quit/restart cleans HTTP, Socket.IO, tunnels, PTYs, Ollama, and timers.
   - Timeouts genuinely bound shutdown.

8. **AI safety**
   - File tools remain project-contained.
   - Tool loops and model pulls are bounded.
   - Client disconnect aborts work.

---

# Prioritized remediation plan

## Phase 0 — Emergency containment, 1–3 days

1. Bind HTTP/Socket.IO to `127.0.0.1`.
2. Add a per-launch authentication token.
3. Restrict CORS and Socket.IO origins.
4. Remove the duplicate PTY write.
5. Fix script-name containment.
6. Remove `process.exit(1)` from installation failure.
7. Disable tunnels until authenticated.
8. Remove arbitrary `replaceCommands`.

## Phase 1 — Electron and filesystem boundary, 1–2 weeks

1. Replace generic IPC with a narrow typed bridge.
2. Validate IPC sender and payloads.
3. Enable sandbox and web security.
4. Disable or isolate webviews.
5. Harden all filesystem routes against canonical and symlink escape.
6. Restrict URL schemes and BrowserWindow destinations.
7. Fix AI file-tool containment.

## Phase 2 — Process and installer correctness, 2–4 weeks

1. Introduce per-operation state and `AbortController`.
2. Implement owned process-tree shutdown.
3. Make downloads fully awaitable and atomic.
4. Add time, output, size, and concurrency limits.
5. Remove global `fs` monkey-patching.
6. Replace shell interpolation with argument arrays.
7. Centralize secure downloads and archive staging.

## Phase 3 — Trust and supply chain, 3–8 weeks

1. Design signed publisher manifests.
2. Pin scripts and installers by immutable digest.
3. Verify vendor signatures before elevation.
4. Sandbox native script execution.
5. Make updates reproducible with frozen lockfiles and hash-locked Python requirements.
6. Upgrade vulnerable dependencies and remove unnecessary production packages.

## Phase 4 — Database, CI/CD, and testing, 2–5 weeks

1. Implement verified request identity and ownership checks.
2. Review and test Supabase RLS.
3. Add security and integration tests.
4. Pin GitHub Actions by SHA.
5. Add signing, notarization, checksums, and attestations.
6. Consolidate builder configuration.
7. Validate AI-generated translations as inert JSON through reviewable PRs.

---

# Quick-win status — top 10 completed July 27, 2026

1. [x] Remove the duplicate PTY write.
2. [x] Change the settings `end-session` call from `send` to `invoke`.
3. [x] Guard upload-dialog cancellation before using `filePaths[0]`.
4. [x] Bind the Express server explicitly to `127.0.0.1`.
5. [x] Remove `process.exit(1)` from per-install failure.
6. [x] Validate external links as HTTPS-only.
7. [x] Fix per-app state setters to merge rather than replace.
8. [x] Delete a dependency controller only if it is still the active controller.
9. [x] Acquire the single-instance lock before backend/tray initialization.
10. [x] Add an empty-state guard to the featured carousel.
11. [ ] Remove command-line Gemini secrets from CI.
12. [ ] Align `.editorconfig` and Biome indentation.
13. [ ] Update README commands from pnpm to npm.
14. [ ] Add `response.ok` checks to critical install/start/uninstall calls.
15. [ ] Stop logging tunnel passwords and full AI prompt/response content.

---

# Verification status and limitations

- The repository was fully inventoried, and subsystem reviews covered all tracked source and configuration files.
- Translation files were structurally compared against the English schema.
- Dependency findings were evaluated from `package-lock.json` and `npm audit`.
- The baseline audit was read-only. The subsequent top-10 quick-win remediation modified the files identified in the remediation table.
- `npm run typecheck` passed for both main and renderer after installing the locked dependencies with lifecycle scripts disabled.
- `npm run build` passed, including main, preload, and renderer production bundles.
- Targeted Biome formatting completed successfully. Targeted linting still reports pre-existing diagnostics in large touched files; those unrelated diagnostics were not suppressed or broadened into this remediation.
- No test suite exists.
- Dynamic security tests were not run because they would require executing downloaded installers, scripts, or destructive filesystem/process operations.
- Binary assets were inventoried but are not behaviorally auditable like source code.

The immediate release-blocking items are **C-01 through C-08**, especially unauthenticated native control-plane access, path traversal, broad IPC exposure, disabled Electron protections, and unsigned remote shell execution.
