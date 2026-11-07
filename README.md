# SpeakSeek

SpeakSeek is a local dashboard answering “How is my coding agent/task doing?” from durable recorded events. It includes session selection, timestamps and freshness, a timeline, typed questions, optional browser voice input/read-aloud, Belweave evidence selection, and a fixed phone-approved demo action.

**Product story:** [PRODUCT.md](PRODUCT.md) explains the at-home vision in plain language, including a hypothetical “Hey Google” walkthrough, and separates that vision from what this MVP does.

The visible name is SpeakSeek. This application was imported from a Codex build named AgentPulse. Runtime identifiers are unchanged (`agentpulse` package name, `AGENTPULSE_*` environment variables, the SQLite filename, and the browser CSRF header) so existing adapters keep working.

**Import provenance:** the application source is the Codex allowlisted archive `agentpulse-source.tar.gz`, SHA-256 `0099603f418ca57de97efb1ac7e4472eb4ceaba8a81d2bf9edde94fd15fc0e7f`. The comparison production archive `agentpulse-production.tar.gz` is SHA-256 `8fa85da4e1a7f5f8417005114900b602ea65f8d3a051b1de7219400e71a78170`. Paths were relative, with no symlinks. No `.env`, token file, database, log, or `node_modules` tree was committed. `.env.example` has placeholders only.

**Prior Codex check, not this checkout:** that sandbox’s production build succeeded; 48 tests passed and 2 transport tests were skipped because sockets and subprocesses were denied. Typecheck, the live server, and browser launch were blocked there. See the Codex section of [VERIFICATION.md](VERIFICATION.md). Results from this SpeakSeek checkout are appended in that file when they are run. This is a local MVP, not a hosted service and not a verified phone or model integration.

## Run

Use Node **24.22.1 or newer** with built-in SQLite and TypeScript transformation. No runtime npm packages are required. Run commands from this directory.

```bash
npm run build
npm start
```

The server binds exclusively to `127.0.0.1`, preferring **http://127.0.0.1:5177**. If occupied it tries 5178–5190 without stopping any existing process. Use the exact URL printed at startup. Listening on loopback is required. Publishing this Git repository does not start a server.

Stop a foreground instance with **Ctrl+C**. Restart with `npm start`; SQLite data and the ingest token remain in `.local/`. To run in the background in a normal shell:

```bash
mkdir -p .local
npm start > .local/server.log 2>&1 &
agentpulse_pid=$!
# Stop only the instance just started in this shell:
kill "$agentpulse_pid"
```

For source development and full type checking, install development dependencies when npm is reachable:

```bash
npm install --cache .local/npm-cache
npm run typecheck
npm run dev
```

`dev` rebuilds and restarts on changes to `src/` or `web/`. `build` uses Node's bundled TypeScript transform and does **not** replace static type checking. The transform can emit an experimental-feature warning on Node 24.

| Command | Purpose |
| --- | --- |
| `npm start` | Run the existing production build |
| `npm run dev` | Watch, rebuild, and restart locally |
| `npm run build` | Produce `dist/src`, `dist/web`, and compiled tests |
| `npm run typecheck` | TypeScript strict checking; requires development dependencies |
| `npm test` | Build and run unit, worker concurrency, and transport tests |
| `npm run test:http` | Run the real loopback/restart smoke test separately |
| `npm run seed` | Seed sample sessions once; preserve existing samples |
| `npm run report-event` | Read one event JSON object from stdin |
| `npm run smoke:browser` | Playwright smoke and screenshots; requires Chrome and playwright-core |
| `npm run smoke:model` | One live Belweave request; no phone notification |
| `npm run package` | Create allowlisted source and production archives |

## Environment

Set values securely in the inherited shell or an ignored `.env` file. `.env.example` contains placeholders only. Never paste keys into chat, use them as command arguments, or add them to source control.

| Variable | Default / behavior |
| --- | --- |
| `BELWEAVE_API_KEY` | Missing means unconfigured; deterministic answers still work |
| `BELWEAVE_BASE_URL` | `https://api.infer.belweave.ai/v1` |
| `BELWEAVE_MODEL` | `Belweave/Kai-4` |
| `AGENTPULSE_INGEST_TOKEN` | Optional secret of at least 32 characters; otherwise securely generated in `.local/ingest-token`, mode 0600 |
| `AGENTPULSE_PORT` | `5177`, with bounded fallback to a free port |
| `NOTIFY_BIN` | `notify` on PATH; accepts a fixed executable path |
| `AGENTPULSE_NOTIFICATIONS` | `false`; explicit opt-in for live terminal/decision event alerts |
| `AGENTPULSE_URL` | Adapter/browser tooling only; default `http://127.0.0.1:5177` |
| `CHROME_BIN` | Browser smoke only; default `/usr/bin/google-chrome` |

The dashboard never receives the ingest token or Belweave key. Notify manages its own credentials; the app does not read or display its credential file.

## Events

`POST /api/events` requires `Authorization: Bearer <AGENTPULSE_INGEST_TOKEN>` and JSON content type. Maximum request size is **8 KiB**. All eight fields below are required; extra fields are rejected. IDs contain 1–96 ASCII letters, numbers, underscores, or hyphens. Summary length is 1–500 characters before sanitization.

```json
{
  "agentId": "my-agent",
  "sessionId": "checkout-task-1",
  "eventId": "checkpoint-1",
  "type": "progress",
  "timestamp": "2026-11-07T12:00:00.000Z",
  "sequence": 1,
  "summary": "Recorded passing checks for the retry change"
}
```

Allowed types: `started`, `progress`, `decision`, `completed`, `failed`, `aborted`. Report an event from the app directory without printing the token:

```bash
node --input-type=module -e 'console.log(JSON.stringify({agentId:"manual",sessionId:"my-task",eventId:"first-observation",type:"started",timestamp:new Date().toISOString(),sequence:1,summary:"Started the task"}))' | npm run report-event
```

The adapter reads the token from its environment or the ignored local token file. It accepts only a local `http://127.0.0.1` target; set `AGENTPULSE_URL` if the server selected another port. For adapters in another project, provide the ingest token securely through that process's environment.

Session IDs are globally namespaced: another agent cannot reuse an existing session. Within each session, `(eventId, payload)` replays are idempotent; changed content under the same event ID returns 409. A sequence can identify only one event. The highest sequence determines the observed state, regardless of arrival order or client time. Lower-sequence arrivals enter the timeline without rolling state backward or sending obsolete alerts. Samples reject live telemetry. The latest 100 events are shown; all are retained in SQLite.

**Time rules:** timestamps must be valid UTC ISO times. More than 120 seconds in the future is rejected. Smaller positive clock skew is disclosed; freshness uses the earlier of event time and server receipt time. At most 120 seconds old is fresh; older is stale. An empty session is unknown. Old events can be stored but do not become fresh through replay or late arrival. No heartbeat or silence is interpreted as progress. A completion event means completion was recorded, not independently proven.

SQLite uses WAL, FULL synchronous writes, unique constraints, and a busy timeout. `.local/` persists across restarts. Back up SQLite through a proper SQLite backup or while the app is stopped, including any uncheckpointed WAL. Do not delete local data to refresh a demo.

## Questions and speech

The authoritative answer includes the selected session's last observed state, UTC timestamp, summary, missing-data disclosure, and freshness warning. It remains available with the model disabled or unavailable.

The optional Belweave request uses `/chat/completions`, `max_tokens: 512`, and a 20-second timeout. Empty, truncated, invalid, ungrounded, tool-bearing, HTTP-error, and timed-out responses fall back visibly. For this MVP the model **selects supplied sanitized evidence** through a constrained JSON response; visible wording comes from the deterministic record. Free-form model prose is not displayed. This prevents event or question instructions from inventing progress or authorizing an action. It also limits open-ended question answering: SpeakSeek reports recorded status, rather than inspecting code or predicting activity.

Token-like text, paths, URLs, and command-like text are redacted before external context; only short evidence and the sanitized question are sent. Redaction is heuristic, so event producers should report short task outcomes rather than sensitive contents. Model configuration is server-side. Automated model tests use mocks.

Browser recognition is feature-detected and push-to-talk. Captured speech is reviewable before submission. Permission denial and unsupported browsers retain typed input. Recognition may use the browser vendor's service; no paid speech API is required by SpeakSeek. Read aloud uses `speechSynthesis`, with Stop / mute. Microphone capture and audible playback were not verified in the original Codex run, and this repository does not claim them unless [VERIFICATION.md](VERIFICATION.md) records a later check.

## Notify setup and live phone testing

In the original Codex workspace, the supplied [Notify quickstart](https://notify.belweave.tech/docs/quickstart) was unreachable. That workspace consulted the official [quickstart](https://notify.belweave.ai/docs/quickstart), [decision guide](https://notify.belweave.ai/docs/ask-decision), [OpenAPI](https://notify.belweave.ai/openapi.json), installed CLI help, and an installed 0.14.2 command source. That CLI did not support `--version`; the local release bundle identified its version. Those notes are historical. This repository does not repeat that login or phone test.

Notify is an optional external CLI. This repository does not ship a Notify login, a phone credential, or a Belweave key. A Notify CLI check or test push performed outside this app is not an end-to-end approval test. Installing or publishing this source does not log in, send a push, install a permission hook, or contact a phone.

After completing local checks, the user-only step is:

```bash
notify auth login --client-name AgentPulse --no-open --json
notify auth status
```

Install the Notify phone app through the beta link in the official quickstart, sign in with the same account used for CLI authorization, and allow notifications. The iOS beta requires iOS 16 or newer.

Use **Recheck** in Connections after sign-in. Real event alerts default off and require the dashboard toggle or explicit environment opt-in. Only completion, failure, and decision events qualify. Samples never send. Event alert reservations and deduplication keys persist; admission is limited to three per rolling minute. Suppressed or failed attempts are not retried automatically. Push text contains a fixed event-category summary, with hashed idempotency keys; no raw event text, commands, paths, or credentials. The latest alert result is shown in Connections. Accepted/queued is never described as seen or approved.

Select **Local phone-gate demo**, then deliberately click **Request real phone approval**. That is an explicit real phone test, separate from alert opt-in. Never run it as an unsolicited automated smoke test.

## Fixed approval gate

The only gated action creates `demo-output/<decision-nonce>.txt` containing an ISO timestamp. It uses filesystem APIs, never shell commands. There is no arbitrary-action API or inbound approval callback. A model, browser, simulation, event, or free-form phone text cannot approve it.

Each durable decision binds a random 256-bit nonce/idempotency key, session, constant action ID, SHA-256 of canonical fixed parameters, creation time, and a local expiry of ten minutes. Phone text includes the session fingerprint, action, parameter hash, nonce, and expiry. Creation uses `notify send ask ... --approval --idempotency-key ... --expires-in 10m`; the returned `interaction.id` is persisted before `notify interaction wait ... --timeout <remaining>s`.

Only a successful CLI result for the exact bound interaction, kind `approval`, status `approved`, response `approve`, and timely `respondedAt` can reach consumption. No accepted/queued devices, malformed output, service errors, missing login, timeout, denial, cancellation, mismatched binding, expiry, or late reply blocks execution. Pending is never approval.

Consumption is a single durable conditional SQLite update before filesystem I/O. The output uses exclusive file creation, rejects a symlink output directory, and is never retried after consumption. Four simultaneous worker threads are tested against the same decision. A crash after consumption can leave execution uncertain; it stays consumed and never runs again. On startup, pending/approved requests fail closed. A new request needs a new phone decision. Local cancel prevents local execution but may leave the phone prompt visible until expiry.

Simulations are prominently **SIMULATED**, persist separately, and never execute the real action. Sample sessions permit simulation only. States include pending, approved (simulation), denied, expired, failed, and consumed; consumed plus `executed` distinguishes confirmed file creation from an uncertain outcome. Real phone requests are limited to three per minute and one pending request per session.

## Optional Cursor hook

The [current Cursor hook reference](https://cursor.com/docs/agent/hooks) documents common `conversation_id`, `generation_id`, `hook_event_name`, etc., and `stop` fields `status: completed|aborted|error` plus `loop_count`. The fixture in `tests/fixtures/cursor-stop.json` follows those fields. The adapter uses only these documented values, excludes workspace paths/transcripts, and emits `{}` without changing permissions.

For this project, inspect `scripts/cursor-hooks.example.json`, then copy its contents into `.cursor/hooks.json` in a trusted Cursor workspace. It runs `node scripts/cursor-stop.mjs` from the project root. If used elsewhere, copy the two standalone adapter scripts, adjust the documented project-relative command, and securely provide the ingest token and URL to Cursor's environment. No hook was installed automatically here.

Cursor's `stop` event proves an agent loop outcome, not task completion. Generations are separate hashed sessions because no lifetime sequence is documented. Within a generation, `loop_count` orders events. A tiny local SQLite cache stabilizes timestamps for replays. Failed sends are not automatically retried; a repeated hook invocation reuses the cached event. This is limited stop telemetry, not a full Cursor progress feed. Actual Cursor invocation is **unverified**. No before-shell hook, Codex integration, T3 integration, tunnel, or MCP dependency is used.

## Deployment

This GitHub repository publishes source. It is not a running server, and there is no live deployment URL.

The supported demo is local. Install Node **24.22.1 or newer**, run `npm run build`, then `npm start`, and open the printed `http://127.0.0.1` URL. Deterministic answers need no API key. `npm install` is only for development dependencies used by `npm run typecheck` and `npm run smoke:browser`.

GitHub Pages cannot host this app. The server is a Node process with built-in SQLite, and it rejects foreign Host and Origin headers. Do not disable those checks, bind a public address, or open a tunnel in order to expose it.

A full hosted deployment is not provided. It would require an authenticated backend and persistent storage that you operate, plus your own Notify and model credentials for those optional paths. Until that exists, the honest demo is the local loopback server.

## Security and artifacts

The server rejects foreign Host/Origin headers and cross-site browser requests. Browser mutations need an HttpOnly SameSite cookie plus CSRF header. Event intake uses its separate bearer credential. Browser text is rendered with `textContent`; a restrictive CSP prevents inline scripts. Request bodies are bounded and schemas checked. This is a single-user loopback app, not a remotely authenticated service; do not expose it through a public tunnel.

`npm run package` uses explicit file allowlists. Archives exclude `.env`, generated tokens, databases, logs, dependencies, Git metadata, generated action output, unrelated workspace files, and their own output. `artifacts/SHA256SUMS` records hashes.

- `artifacts/agentpulse-source.tar.gz`: source, tests, standalone adapters, and documentation. Build/run requires Node 24.22.1+; type checking requires `npm install`.
- `artifacts/agentpulse-production.tar.gz`: compiled server/UI, standalone adapters, minimal package metadata, and docs. Extract, enter `agentpulse/`, run `npm start`. No npm installation is needed for runtime. Notify CLI and user authentication are optional external requirements for real phone functions.
- `artifacts/browser-smoke.json` and `artifacts/model-smoke.json`: actual attempted verification results. No screenshot was produced because browser launch was blocked.

See [DEMO.md](DEMO.md) for a repeatable 90-second walkthrough and [VERIFICATION.md](VERIFICATION.md) for observed results and exact limitations.
