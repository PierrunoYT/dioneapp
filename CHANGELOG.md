# Changelog

All notable changes to Dione are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Finding identifiers such as `C-01`, `H-06`, `M-04`, and `L-03` refer to the
[comprehensive codebase audit](AUDIT_REPORT.md), which remains the authoritative record of
scope, evidence, and residual risk.

## [Unreleased]

### Fixed

Regressions introduced by the July 28 hardening pass, found while running the app locally:

- **Renderer never mounted, leaving an empty black window.** The preload script imported
  `randomUUID` from `node:crypto`, but the main window now runs with `sandbox: true`
  (added in the C-04 remediation). Sandboxed preloads cannot require Node builtins, so the
  preload aborted with `module not found: node:crypto` and `window.dione` was never
  exposed. Every renderer entry point that touches the bridge — `rendererReady()` in
  `src/renderer/src/main.tsx` and `checkFirstLaunch()` in `src/renderer/src/App.tsx` —
  then threw, tearing down the React tree. Request identifiers are now generated from the
  Web Crypto API available in the preload context, with a `getRandomValues` fallback for
  non-secure contexts.
- **`window.dione.copyText()` threw at every call site.** Electron's `clipboard` module is
  likewise unavailable in a sandboxed preload, so copying install logs, share links, AI
  code blocks, and editor paths would have failed once the preload loaded. Clipboard
  writes now go through a sender-checked `clipboard:write-text` IPC handler in the main
  process. `copyText()` returns `Promise<void>` instead of `void`.
- **One invalid stored path discarded every other setting.** `readConfig()` validated the
  whole configuration file in a single `try`/`catch`, so a value rejected by the M-04 path
  rules — most often a `defaultInstallFolder` pointing at a drive root, which earlier
  releases allowed — made the entire file unreadable and silently fell back to
  `defaultConfig`. Theme, language, layout mode, compact mode, and update preferences were
  all lost as collateral damage, with only a repeated log line to explain it. Stored
  configuration is now recovered field by field: invalid values are dropped individually,
  named in a single warning, replaced with their defaults, and persisted so the file
  self-heals on the next launch. Runtime patches from the renderer still use the strict
  parser and are rejected outright rather than partially applied.
- **Every configuration write failed on Windows.** `writeConfig()` fsynced the containing
  directory after the atomic rename, which Windows rejects with `EPERM` on a directory
  handle. The error escaped after the rename had already succeeded, so the write landed on
  disk but the caller saw a failure — `readConfig()` then discarded the freshly repaired
  configuration and returned defaults anyway. The directory flush is now best effort and
  tolerates `EPERM`, `EINVAL`, and `ENOSYS`; the file fsync and atomic rename still prevent
  a torn or partial configuration.
- **The saved interface language was overwritten on every launch.** `TranslationProvider`
  seeded its state from `localStorage` — falling back to `en` when that key was absent or
  stale — and an effect keyed on the resulting value immediately `PATCH`ed `/config` with
  it. The cached value therefore won over the stored preference, so a config set to any
  non-English language silently reverted to English on startup and the user's real choice
  was overwritten on disk. The stored configuration is now authoritative and is adopted on
  mount; `localStorage` is kept only as a first-paint cache so the UI does not flash
  English while the config loads. A write happens only on a deliberate `setLanguage()`
  call, and an explicit selection is no longer clobbered by a config load still in flight.

### Security

Remediation of the baseline audit (62 findings: 8 critical, 23 high, 22 medium, 9 low).
The audit's post-remediation health score is **94/100**, up from a **24/100** baseline.

#### Critical

- **C-01** — The backend is loopback-only, requires a process-lifetime 256-bit bearer
  token on every HTTP request, restricts CORS to the renderer origin, and issues one-time,
  one-minute, app-bound Socket.IO tickets. The token stays in the main process and is
  never exposed to renderer JavaScript.
- **C-02** — A single strict application-ID grammar rejects traversal, separators,
  absolute paths, control characters, and unsupported names. App directories must be
  canonical, direct, non-symlink children of the apps root, enforced identically across
  creation, download, local import, and deletion.
- **C-03** — Removed the generic `window.electron` / `window.api` / raw `ipcRenderer`
  bridge in favour of a frozen, typed `window.dione` surface with sender and main-frame
  checks. Backend calls use a closed operation allowlist mapped to fixed methods and route
  templates. Local native execution requires a main-process confirmation dialog.
- **C-04** — Main and preview web contents now run with Chromium sandboxing, context
  isolation, web security, no insecure-content allowance, and no webview tag. The dev
  command no longer passes `--noSandbox`; remote preview content has no preload.
- **C-05** — File workspaces are selected only from canonical server-enumerated app roots.
  Symlinks and path components are rejected, reads and writes are bounded to the canonical
  root, and sensitive leaf writes use no-follow handles or exclusive staging plus atomic
  replacement.
- **C-06** — AI file reads require a server-selected project ID, canonical non-symlink
  containment, an extension allowlist, sensitive-name blocking, a 32 KiB size cap, and
  reading through the validated open handle.
- **C-07** — Removed the renderer-triggered Supabase update and caller-identified event
  APIs along with the obsolete renderer telemetry utility. Remaining database routes are
  read-only.
- **C-08** — Remote manifests require a versioned schema, declared capabilities, SHA-256,
  an immutable commit, a trusted Ed25519 publisher key, and a signature binding hash,
  source, and commit. Downloads use private staging and execute only reverified bytes.
  **Remote installation is off by default and fails closed** until a real publisher trust
  store and signed frozen catalog are deployed and pass live attestation.

#### High

- **H-01, H-10, H-14** — Renderer-supplied replacement commands were removed; native
  execution consumes exact trusted manifest commands. Environment names, versions, and
  paths are validated, and installers use direct executable/argument arrays without
  `shell: true`.
- **H-02, H-03, H-04** — PTY commands are written exactly once; download, install,
  cancellation, unsupported-system, malformed-dependency, and start failures propagate as
  structured failures instead of resolving as success; per-install failures no longer call
  `process.exit(1)`.
- **H-05, H-07** — Module-global cancellation state was replaced with app/operation-scoped
  `AbortController` ownership, and controller cleanup is identity-checked.
- **H-06** — Owned Unix PTYs and Ollama processes use new sessions and process groups with
  re-enumeration, graceful stop, bounded wait, and escalation. Windows uses bounded
  CIM/ConPTY discovery and descendant cleanup, verified under Node 22 and Electron 41 in
  hosted-Windows CI. *Residual:* neither platform provides a kernel-enforced ownership
  boundary against deliberate detach/reparent or `setsid()` escape.
- **H-08, H-09** — Captured output is bounded to 1 MiB with a rate-limited 64 KiB socket
  queue and manifest-bounded deadlines. Shell-text `cd` parsing was removed in favour of
  structured, canonically contained working directories.
- **H-11** — Removed process-wide `fs` monkey-patching; uninstall deletions are explicit
  and awaited.
- **H-12, H-13** — Installer downloads use versioned metadata, exact host and redirect
  policies, size limits, private staging, SHA-256 verification before promotion, and
  exact-signer Authenticode where applicable. Archives are preflighted for traversal,
  links, malformed structures, encryption, overlap, and compression bombs, then extracted
  shell-free into private staging. *CUDA on Linux is intentionally disabled* because the
  vendor publishes only MD5 for the selected runfile.
- **H-15, H-16, H-22** — Preview content is loopback-restricted, sandboxed, and without
  preload capabilities or automatic media permissions; preview polling is keyed,
  abortable, deadline-bound, and cleaned up on unmount. External navigation is HTTPS-only.
- **H-17, H-18, H-19, H-20** — Renderer mutations pass through a typed boundary that throws
  on non-2xx before state changes; failed uninstalls no longer clear local state; script
  sockets disable automatic reconnection and use generation/identity ownership; keyed
  app-state updates merge instead of replacing other apps' state.
- **H-21** — Diagnostic reports require a server-generated sanitized preview and explicit
  per-send consent, with safe-field allowlists, recursive secret and path redaction, and
  size caps. Stable machine identifiers were removed and debug export is a bounded text
  report rather than a broad ZIP.
- **H-23** — React Router was replaced by a tested `wouter` hash-router compatibility
  layer, and runtime and dev dependency chains were upgraded. Both `npm audit` and
  `npm audit --omit=dev` report **0 vulnerabilities** (down from 44 and 28).

#### Medium

- **M-01, M-02, M-03** — Added an idempotent shutdown coordinator with effective deadlines
  and failure-isolated cleanup; the single-instance lock precedes all startup side effects;
  the backend binds directly to loopback port `0` and rejects listen failures.
- **M-04** — Configuration updates use a strict allowlist and types, canonicalize paths
  through existing ancestors, **reject filesystem, application, and system roots**, and
  persist atomically with file and directory `fsync`. See the upgrade note below.
- **M-05, M-06** — Removed the generic environment-variable router and renderer editor.
  Tunnel operations are serialized, credentials are no longer logged, and only the actual
  backend port can be exposed.
- **M-07, M-08** — AI requests have history, context, output, and tool-loop limits, model
  allowlisting, per-operation abortable clients, deadlines, concurrency and pull-rate
  limits, and a free-space-aware pull budget. Logs record operational metadata rather than
  prompts, responses, reasoning, or tool content.
- **M-09, M-10, M-11** — Git cloning accepts only credential-free HTTPS GitHub URLs with
  manual redirect validation and contained destinations. Elevated scripts live in private
  temporary directories with `finally` cleanup. Installer locks use owner tokens, PID and
  process-start identity, heartbeats, and ownership-checked release.
- **M-12, M-13, M-14** — CUDA removal deletes only manifest-proven Dione-owned paths;
  automatic dependency updates require immutable inputs (hashed Python requirements, frozen
  lockfiles, lifecycle-script suppression) and refuse unsafe mutable updates; manifest
  discovery is async and iterative with depth and entry budgets.
- **M-15 – M-19** — Workspace, AI, feed, local-storage, and settings state handling now use
  generations, abort signals, shape-validated parsing, and serialized partial writes so
  stale responses cannot overwrite newer state.
- **M-21** — Runtime translation lookup falls back to English, locale selection is
  validated, and CI checks every locale for invalid or unknown schema entries.
- **M-22** — *Conditionally resolved; live attestation required.* Build-time webhook and
  privileged API-token injection was removed, and a versioned Supabase migration revokes
  broad grants and enforces exact anonymous privileges and RLS policy shape. The deployed
  key classification and policy state must still be verified outside this repository.

#### Low

- **L-01 – L-09** — Removed dormant renderer auth/token code; consolidated to a single root
  `TranslationProvider`; added names, roles, focus handling, and keyboard navigation to the
  audited controls; made UI timers lifecycle-safe; honoured reduced-motion preferences;
  aligned `.editorconfig` with Biome's tab policy; standardised README commands on
  `npm ci` / `npm run …`; refreshed repository, support, and security documentation; and
  added a deterministic `THIRD_PARTY_NOTICES.md` with a build-time freshness check.

### Added

- `npm test` — 47 deterministic tests covering authentication, Socket.IO ticket
  expiry/replay/scope, middleware ordering, renderer-to-main capabilities, request
  cancellation ownership, manifest trust and tampering, privacy boundaries, path
  containment, deadlines, and real Linux process-group termination.
- `npm run check` — aggregates tests, typechecking, comprehensive Biome enforcement,
  license freshness, and malicious-installer fixtures.
- `npm run attest-deployment` / `check-deployment-readiness` — release attestation binding
  public configuration to the exact release commit, plus a Supabase live-attestation RPC.
- `npm run check-process-ownership` and hosted-Windows Node 22 / Electron 41 PTY cleanup
  checks in CI.

### Changed

- **Account, login, and database-backed features are now disabled by default.** Two build
  switches gate them, both defaulting to off, so an unconfigured build behaves like one
  with the features deliberately turned off:
  - `VITE_PUBLIC_ACCOUNTS_ENABLED` gates the account surface. While false, `auth` and
    `refresh` tokens carried in a `dione://` deep link are ignored and logged rather than
    forwarded to the renderer. This path was already inert — neither channel was exposed
    in the preload bridge and no renderer code subscribed — so nothing regressed; the
    tokens now simply stop being sent. The misleading `alert("Not found any data for
    login…")` on a malformed deep link was removed, since a deep link with no URL has
    nothing to do with logging in.
  - `VITE_PUBLIC_DATABASE_ENABLED` gates the Supabase client, which is no longer created
    at all when false. The three features that used it degrade instead of failing:
    tag-filtered search (`/search/type/:name/:type`) falls back to the same Dione catalog
    API the name-only route already used and returns the same result shape; shared tunnel
    URLs return unshortened, which callers already handled since `shortenUrl()` has always
    been able to return `null`; report submission is refused up front with `503
    {"disabled": true}` before consent is examined, rather than returning a generic
    connection error after collecting one.

  No code was deleted — flipping either switch to `true` restores the previous behaviour.
- Supabase sessions are no longer persisted or auto-refreshed (`persistSession` and
  `autoRefreshToken` are now false). Dione has no user accounts, so nothing ever signed in
  and there was never a session to keep alive; the anonymous key remains the only
  credential and access is still enforced with RLS.
- `getScripts()` no longer imports the Supabase client. It checked whether the client
  existed and logged a warning, then never used it — the script catalog has been fetched
  over HTTP since remote installs became fail-closed.
- React Router replaced by a `wouter`-based hash-router compatibility layer (H-23).
- `window.dione` is now the only renderer bridge; `window.electron` and `window.api` are
  gone (C-03).
- This changelog is now written by hand and tracked in git. `auto-changelog` was dropped
  from `npm run deploy`, which no longer regenerates `CHANGELOG.md` from commit history,
  and the file was removed from `.gitignore`. The tool was invoked through `npx` and was
  never a declared dependency, so nothing needed uninstalling and the rest of the release
  flow is unchanged.

### Known limitations

Carried over from the audit; none are regressions:

- Remote installation and production release fail closed until the publisher trust store
  and signed frozen catalog are deployed and attested (C-08).
- Deployed Supabase grants and RLS policies require live attestation (M-22).
- Windows cannot provide race-free suspended creation with Job Object assignment, so rapid
  detach/reparent can still escape snapshot-based cleanup (H-06).
- CUDA on Linux remains disabled pending a qualifying vendor checksum or signature (H-12).
- No launched packaged-Electron end-to-end suite exists yet.

### Upgrade notes

The M-04 configuration hardening rejects filesystem roots for `defaultInstallFolder`,
`defaultBinFolder`, and `defaultLogsPath`. A config pointing at a bare drive root (for
example `D:\`) logs `Unsafe filesystem root for configuration field: …`; that field is
discarded, reset to the user-data directory, and the repaired file is written back, so the
warning appears once rather than on every read. Other settings are unaffected. If you had
apps installing to a drive root, repoint the setting at a subdirectory (`D:\Dione`) — the
in-app picker rejects the root as well — and move any existing `apps` and `bin`
directories, since the app appends those names to whatever parent you choose.

## [1.1.3]

Baseline release preceding the audit remediation above. Release history before this point
is available in the [commit log](https://github.com/dioneapp/dioneapp/commits/main/).
