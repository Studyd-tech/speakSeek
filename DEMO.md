# SpeakSeek demos: safe defaults, explicit proof

SpeakSeek combines **voice-accessible agent status and bounded decisions (vision)** with **per-task token limits and exact extensions (cooperative foundations implemented)**. Agent X is a task/agent name, not the X social network. The two vision conversations in [README.md](README.md#two-pillars) and [PRODUCT.md](PRODUCT.md) are conceptual prose, not executable voice commands.

**Default: offline, mocked or model-off; no real notification or paid model call.** The optional live section below is separate authorization for a real request, never a step in an offline walkthrough. Do not press a real request button to find out whether Notify is configured. The November 8 cloud check did not run a device or live Notify test. The November 7 touch result remains inherited manual evidence.

## Offline terminal demo

From the project root with Node 24.22.1+, these commands use existing local test fixtures and mocked model/Notify transports. No CLI login, server socket, phone, model key or paid inference is required:

```bash
npm run build
node --test --test-isolation=none dist/tests/budget*.test.js dist/tests/phone-demo.test.js
npm run demo:phone -- --help
```

The terminal tests exercise:

1. A task with no baseline: usage/remaining are **unknown**, strict admission refused.
2. A 100-token task with real concurrent test workers: at most fitting maxima are reserved. Outstanding holds count before measured reconciliation.
3. Exact exhaustion, an operation too large for remaining headroom, stale usage and uncertain reservations: distinct reasons, no invented zero consumption.
4. 10% of an explicitly declared 100,000-token pool = 10,000. Usage 5,000 = 5% of that daily denominator and 50% of the task allocation.
5. **SIMULATED Agent X** at 10,000 used / 10,000 allowed, a **mocked** matching approval, and total 20,000 once. Denial, cancellation, expiry, timeout, malformed responses and replay leave permission unchanged.
6. Four concurrent mock-confirmed waits: one allowance/version update and one event, not four extensions.

This is mock-transport evidence, not a phone or AirPods round trip. There is no `--simulate` or `--offline` mode invented for the live CLI; the tests inject mocked transports through the existing test interface. Help and no-argument CLI invocation create no state and contact no service.

The full suite, including loopback HTTP and child-process transport checks, is:

```bash
npm test
```

On **November 8, 2026 (UTC)** that command passed **163 tests, 0 failed, 0 skipped**, including 47 tests in `phone-demo.test.js` and both transport checks. A prior local sandbox had pre-excluded those two transport tests and reported 161 available passes; that exclusion is not the default, and it is not this result. `npm run typecheck` is a separate static check and passed in the same cloud environment. Node’s build transform is not that typecheck. [Evidence](README.md#verification-and-source-status) separates this run, the November 7 records in [VERIFICATION.md](VERIFICATION.md), and the owner-confirmed touch approval.

## Offline dashboard walkthrough

Use only where normal local-preview permissions allow it. **Do not retry a known blocked browser/socket or change permissions, bind, firewall, tunnel or proxy to run this demo.** The terminal path above remains sufficient.

Ordinary server startup may check configured Notify authentication, and saved alert preferences persist. For an offline preview, the existing per-process environment settings can disable external integrations without editing saved credentials:

```bash
# This executable path must be absent. If it exists, stop and choose a different
# absent name; do not delete or overwrite an existing file.
test ! -e .local/notify-disabled-for-offline-demo && \
  BELWEAVE_API_KEY= NOTIFY_BIN=./.local/notify-disabled-for-offline-demo AGENTPULSE_NOTIFICATIONS=false npm start
```

Run the start command only if the absence check succeeds. The empty model key and absent Notify executable apply to this process only. They keep model calls and Notify requests out of the preview even if prior alert preferences exist. The resulting unconfigured/error integration display is intentional for this profile; it does not mean the owner's installed/authenticated Notify CLI is absent. Do not alter saved secrets or delete data.

Use the printed loopback URL, normally `http://127.0.0.1:5177`. Stop with Ctrl+C. The November 8 cloud check started this offline profile and `npm run smoke:browser`. That smoke typed questions and clicked sample controls. It did not use a microphone, play audio, or send Notify.

### A 90-second walkthrough using actual controls

All steps remain on **sample sessions**. Do not select a real phone action, enable real alerts, press Recheck, or run a live model smoke script.

| Time | Action | What the result means |
| --- | --- | --- |
| 0–15s | Select **Checkout recovery · SAMPLE**. | SIMULATED badge; four stored timeline events. Last observed state/time and freshness are evidence, not live agent activity. Samples may already be stale. |
| 15–30s | Keep **Use Belweave evidence selection** off. Type “How is this task doing?” and submit. | With its sample budget configured, the panel says **TOKEN LEDGER · READ ONLY** and includes recorded state plus allowance/usage/source/freshness. It is not a model response or permission. |
| 30–45s | Click **Ask about this token budget**. Inspect **Task token budget**. | Initial fixture is 8,835 used of 10,000, leaving 1,165 before holds. This is illustrative simulation data, never real provider usage or a work-completion percentage. If it was previously extended, its saved values remain. |
| 45–65s | Enter a bounded sample amount, click **SIMULATE extra tokens**, then **Approve sample**. On separate sample requests choose **Deny sample** and **Expire sample**. | Approval consumes one simulated extension and changes only that sample's allowance/version; denial/expiry do not. No phone push or timestamp file. Stale/uncertain holds can keep it paused even after an extension. |
| 65–80s | In the separate **Decisions** card, use **Try SIMULATED decision**, then Approve/Deny/Timeout on separate requests. | This is timestamp-action simulation: SIMULATED APPROVED/DENIED/EXPIRED; it does not write a file or extend a real task. Immediate Timeout illustrates expiry, not ten elapsed minutes. |
| 80–90s | Select **Search accessibility · SAMPLE**, then **No events yet (sample)**. | Completed evidence can be stale; no events means unknown. Sessions do not borrow each other's progress or token usage. |

There is no “make fresh” control or hidden simulation reset. Seeding/restarting preserves existing records; never delete them just to suggest new progress. An unknown budget is not zero use. The current progress bar is **token consumption**, not percent of work complete.

Browser voice recognition and Read aloud / Stop controls exist, but hardware behavior is unverified and recognition/voices may rely on browser-vendor services. Keep microphone/audio out of the guaranteed offline demonstration. A separate owner-authorized browser/device check may use the existing review-before-submit and manual playback controls; it is not performed or requested by this refresh.

## Recorded manual phone and AirPods proof

**Owner-confirmed, November 7, 2026 (CST):** one real Notify request for SIMULATED USAGE was accepted and a matching approval confirmed. AirPods Pro Siri asked whether to read the notification; the owner said to read it and heard the announcement. The owner then **opened Notify and tapped Approve**.

The isolated ledger changed 10,000 → 20,000 once, retained simulated usage 10,000, showed remaining 10,000 and version 1 → 2, and returned `CONSUMED`, `approvalConfirmed: true`, exit 0. Two earlier manual attempts timed out without changing allowance. No paid model tokens were used.

Selected result fields below are an anonymized shape consistent with that reported result, not a new execution or a raw account log:

```json
{
  "state": "CONSUMED",
  "approvalConfirmed": true,
  "before": {"allowed": 10000, "simulatedUsage": 10000},
  "after": {
    "allowed": 20000,
    "simulatedUsage": 10000,
    "simulatedRemaining": 10000,
    "budgetVersion": 2,
    "source": "simulation"
  }
}
```

This proves the specific real notification/announcement/**TOUCH approval**/simulated-ledger path. It does not prove spoken approval, spoken amount parsing, Siri task-status queries, browser microphone, actual provider spending or real agent pause/resume. The default runtime message that device verification needs the owner applies to new invocations; this dated observation does not auto-verify them.

## Optional real phone test

**REAL REQUEST — not part of the offline demo and not run during this refresh.** Every test needs a separate explicit owner decision. No further test is required to review these docs. Use the normal installed Notify CLI, the user's own authorization/phone account and notification settings; do not inspect credential files, create an account, auto-run login or send a probe to discover setup.

Before execution, replace **REVIEWED_ID** with a **fresh, unique invocation ID reviewed with the owner for this one test** (1–64 letters, numbers, underscores or hyphens). It is an explanatory placeholder, not a suggested ID to run literally. Do not replay any previous manual test ID. Do not use angle brackets in the shell command: they can be interpreted as redirection.

```bash
npm run demo:phone -- --live-phone --ack-simulated-usage --invocation REVIEWED_ID --wait-seconds 120
```

Both flags are required on every live invocation; nothing silently enables future sends. The demo is fixed at **+10,000 / new total 20,000** for its isolated simulated session, not the vision's +5,000 / total 15,000. It invokes no model, requires no model or ingest key, starts no web server, and uses ordinary outbound Notify create/wait calls without exposing loopback.

Read-only offline status uses the **existing** reviewed invocation ID, not a new one:

```bash
npm run demo:phone -- --status --invocation REVIEWED_ID
```

### Outcomes and one-use rules

| Output | Meaning |
| --- | --- |
| NOT SENT | No creation attempt; for example a normal unavailable/unconfigured Notify check |
| ACCEPTED / QUEUED | Provider receipt/queue only, not device delivery, audio or approval |
| UNCONFIRMED / CREATING | Creation may be in flight or uncertain; never automatically resend |
| PENDING | No settled approval; explicit opt-in may resume waiting on the existing interaction without a new request |
| DENIED / CANCELED / TIMED-OUT / EXPIRED / FAILED | No allowance change; no automatic resend or late application |
| CONSUMED and `approvalConfirmed: true` | Exact bound approval applied once; simulated total 20,000/version 2, no real-task permission |

At most one creation attempt occurs per invocation, with a persisted random idempotency key. Reusing a completed/failed invocation does not reset it or send again. A fresh ID is a different test, requiring fresh authorization. There is no automatic retry after uncertainty or timeout. The local window is ten minutes from creation. The example's 120-second wait is terminal if it times out, even while the remote prompt remains visible until expiry. Ctrl+C cancels locally and aborts only this command's own child; it does not promise remote withdrawal.

Approval binds scope/session, exact delta/result total/version, nonce/hash, interaction and expiry. Only the exact confirmed `approval` / `approved` / `approve` response qualifies. A voice/typed phrase, accepted notification, free-form yes, malformed/error response or replay is not approval. Once consumed, the allowance update and decision commit together atomically. Telemetry can still become stale while waiting; this does not start/resume an agent.

### Device observation checklist, if a later test is explicitly authorized

Record these separately; they are not implied by one ACCEPTED line. Apple's [announcement guidance](https://support.apple.com/en-us/102536) and [model-specific Siri controls](https://support.apple.com/guide/airpods/use-siri-devc2c0f438a/web) describe eligible device/app behavior; they do not establish a generic Siri mapping to Notify's approval buttons.

1. **Push received:** owner actually sees the request on the phone or in Notify.
2. **AirPods announcement:** if testing that condition, use paired/worn eligible headphones and a locked/dark phone with suitable app/Announce Notifications/Focus/privacy settings. Record what was heard; do not infer unreported device conditions from the prior result.
3. **Siri reply offered:** observe whether this particular notification offers supported replies; Notify eligibility/approval-button mapping is not established by Apple's general reply feature. Use model-appropriate Siri activation and keep reply confirmation enabled.
4. **Amount proposal received:** **not implemented here**. Saying “set the total to 20,000” is not a receiver or approval path. A future supported native/provider proposal bridge still needs exact confirmation.
5. **Explicit decision confirmed:** if the owner opens Notify and taps Approve, record **touch**. Do not substitute it for a claimed hands-free result.
6. **Ledger changes once:** inspect sanitized result/offline status for total 20,000/version 2 and no duplicate update.

The current evidence is announcement plus touch, not native Siri control. Google Home/HomePod/Alexa, Siri usage queries, custom AirPods double-tap microphone, native Shortcuts/App Intents and custom wake words remain future platform/service/adapter work, not merely missing hardware. [Roadmap](README.md#roadmap) explains those boundaries.

### Local data and teardown

The ordinary app uses `.local/agentpulse.sqlite`. The headless demo uses a separate `.local/phone-demo/REVIEWED_ID/ledger.sqlite`, possible `-wal`/`-shm` sidecars, and session `agent-x-simulated-phone-demo`. Private interaction metadata stays local/ignored; output omits raw device/account/interaction identifiers and request nonce/hash. Existing generic samples cannot use this special transport path by toggling a saved setting.

Let the command exit or cancel locally, and allow an outstanding remote prompt to expire. Keep the invocation history while checking the result. Only afterward may the owner remove that reviewed invocation directory if desired; do not delete the entire `.local/`, main database, another invocation, or any existing work to refresh a demo. No cleanup or new live test is performed here. Older release archives predate the token-budget and headless-phone additions and were not rebuilt.

## Adapter examples

These examples describe **existing interfaces**, not live telemetry to seed or commands to run against someone else's task. The [generic event adapter](scripts/report-event.mjs) accepts the exact seven JSON keys below; the timestamp is illustrative historical UTC and will be stale, not fresh, if posted later. There is no added completion-percentage field.

```json
{
  "agentId": "example-agent",
  "sessionId": "example-checkout-task",
  "eventId": "reported-validation-1",
  "type": "progress",
  "timestamp": "2026-11-07T18:42:00.000Z",
  "sequence": 1,
  "summary": "Agent-reported validation step finished"
}
```

Event intake uses `POST /api/events` or `npm run report-event` (one JSON object on stdin), with the existing securely configured ingest bearer token. The docs refresh does not post this example. Event sequences/order and source matter; the app does not inspect the code to verify the summary.

The budget adapter's current actions are `checkpoint`, `reserve`, `reconcile`, and `uncertain`, using `POST /api/budgets/:session/ACTION` or `npm run budget-adapter -- ACTION SESSION_ID` with JSON on stdin. Checkpoints are measured session-cumulative values; reconciliation is a per-reservation operation delta. IDs, agent/session ownership and budget version bind the request. Existing [adapter code](scripts/budget-adapter.mjs) and [accounting tests](tests/budget.test.ts) show the full contract. This is not automatic Codex/Grok Bot/Cursor telemetry.

Example measured usage object for that interface—not a measured run:

```json
{
  "unit": "tokens",
  "inputTokens": 4000,
  "outputTokens": 1000,
  "totalTokens": 5000,
  "cachedInputTokens": 1500,
  "reasoningOutputTokens": 400
}
```

Cached and reasoning counts are already included in input/output; adding them again would be invalid. For the declared 100,000-token daily denominator and initial 10,000 task allowance, the example is 5% of daily pool and 50% of task allowance, **not 50% of the work**. The pool is owner-declared with an explicit 24-hour UTC window, not discovered from credits. Normal extensions take absolute extra tokens; native spoken percentage/amount parsing is future work.

The original **Create a demo timestamp** real gate is a different action with a different one-use approval; it writes one timestamp file and cannot resume an agent or extend its token allowance. It is outside the default walkthrough. Samples only illustrate its decision states. Do not invoke either real gate to diagnose missing configuration.
