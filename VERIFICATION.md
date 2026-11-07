# Observed verification — 2026-11-07

## Codex workspace record

The notes in this section are the original Codex execution record shipped with the source archive. They describe that sandbox, not the SpeakSeek GitHub checkout. This checkout’s results are appended below when local checks finish.

The implemented app in that Codex workspace was under `/workspace/hackathonB/agentpulse`. No existing AgentPulse checkout was present; a new local Git repository was initialized. The private and qa directories and T3 were not inspected or modified. No publishing, accounts, login changes, or pushes were performed.

| Check | Observed result |
| --- | --- |
| Node | v24.22.1 |
| Production build | **PASS** using Node's bundled TypeScript transform |
| Automated tests | **48 passed, 0 failed, 2 skipped**, 50 total |
| SQLite durability | **PASS**, close/reopen preserves events; separately checked across fresh Node invocations |
| Real loopback HTTP/restart test | **SKIPPED**: `listen EPERM: operation not permitted 127.0.0.1` |
| Actual child-process CLI transport test | **SKIPPED**: subprocess execution denied (`EPERM`); injected executor/JSON contract tests pass |
| Type check | **BLOCKED**: `tsc: not found`; npm installation failed with `EAI_AGAIN registry.npmjs.org` |
| Production server startup | **BLOCKED**: `AgentPulse could not start: EPERM`; no server is running |
| UI and health HTTP success | **UNVERIFIED** over a real socket; actual request handler returns 200 in in-process tests |
| Browser smoke | **BLOCKED** at Chromium launch; no browser checks or screenshots completed |
| Microphone / audible speech | **UNVERIFIED** |
| Belweave credentials | Key present, value never printed or written to artifacts |
| Belweave live smoke | One request attempted; failed and returned deterministic stored-event fallback; **not live-verified** |
| Notify installed CLI | Help and direct auth status inspected; local tools bundle 0.14.2; no token configured |
| Notify phone round trip | **UNVERIFIED**; no test pushes sent |
| Cursor hook | Current docs consulted; fixture conversion, generation isolation, replay timestamp persistence tested; actual Cursor invocation **UNVERIFIED** |

Automatic approval review rejected the request to run the loopback server with escalated execution because this session's granular policy disables sandbox escalation. No networking, tunnel, model/account settings, or unrelated processes were changed to work around that restriction.

## What the passing tests cover

- Persistent events, empty/stale sessions, session/agent isolation, sequences, duplicate and changed-payload replays, out-of-order arrivals, schema and clock skew checks.
- Actual HTTP handler authentication, malformed/oversize bodies, browser cookie/CSRF protections, Host/Origin checks, static asset allowlist, selected-session questions, and phone error states. These handler tests use real readable request streams without opening sockets.
- Mock Belweave success, minimal sanitized context, token budget, empty/truncated/malformed/ungrounded responses, HTTP errors, abort timeout, absent key, and model-off fallback.
- Approval success, denial, cancellation, expiry, timeout, service errors, missing credentials, malformed response, wrong interaction/kind/session/action, changed parameters, replay, duplicate consumption, restart uncertainty, and simulation isolation.
- Four simultaneous worker threads contend against the same SQLite decision and create exactly one file. This concurrency test actually ran; it is not a phone test.
- Notification opt-in, sample suppression, durable deduplication, rate limiting, sanitization, zero acceptance, and CLI argument-array/output parsing contracts.
- Cursor's documented stop-hook fixture and durable adapter replay behavior. No permission-changing hook is implemented.

## Remaining checks in an unrestricted local environment

```bash
cd /workspace/hackathonB/agentpulse
npm install --cache .local/npm-cache
npm run typecheck
npm test
npm run build
npm start
```

Use the startup URL; normally http://127.0.0.1:5177. In another terminal verify `/` and `/api/health`, then run `npm run smoke:browser`. Stop with Ctrl+C and restart with `npm start`; confirm the same recorded events remain. The production distribution needs Node only, while type checking and browser tooling require development dependencies.

The only user-only integration step is Notify sign-in/device authorization after local execution permissions are available. Run `notify auth login --client-name AgentPulse --no-open --json`, then use Recheck and deliberately trigger the real phone demo. Do not call the app fully integrated until an actual phone result and agent hook execution have been observed.

Artifacts are allowlisted source and production archives plus checksums; they exclude secrets, local data, logs, dependencies, and generated action output. `artifacts/model-smoke.json` and `artifacts/browser-smoke.json` retain sanitized attempted-smoke metadata. No screenshot exists.
