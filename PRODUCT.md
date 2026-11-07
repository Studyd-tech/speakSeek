# SpeakSeek: evidence, decisions, and a token boundary

You gave an agent a task. Then you stepped away. What you need is not a stream of terminal output: it is a truthful account of what happened, a clear decision when permission is needed, and a limit on further token use.

SpeakSeek has **two pillars of equal importance**:

1. **Know, decide, continue:** ask about the task, hear the last reported work or blocker with time/source/freshness, approve one precise next action on the phone, and ask again after a cooperating runner reports what changed.
2. **Bound usage, then explicitly extend:** allocate a task allowance, refuse operations that cannot fit safely, and change that allowance only through a separate, exact confirmation.

The intended front door is voice—from Siri/AirPods or a home speaker. The current implementation is a local evidence-and-budget service with browser controls, generic cooperating adapters, and Notify decisions. Native assistant queries, arbitrary agent control and voice approval are not installed. **Agent X means a task or agent you named, not the X social network.**

## Pillar one: know, decide, continue

A useful answer separates three things:

- **Evidence:** which agent/session reported what, when, and with what freshness.
- **A proposed action:** one reviewable step with a fixed scope and expiry.
- **Permission:** a confirmed decision for that exact request, not an assumption inferred from the conversation.

The intended path is a platform front door → authenticated SpeakSeek service → fresh evidence supplied by cooperating adapters. A pending or newly requested decision becomes an exact Notify approval. A future integrated runner checks the result, retains its normal tool/OS protections, performs only that step, and records a new state. The next question is answered from that newer record.

### Vision conversation: an update while making dinner

> **VISION / hypothetical, not runnable.** Native Siri status queries and the cooperating runner below are future integrations. Times are illustrative UTC, not a captured run.
>
> **Owner:** “Siri, how far is Agent X's checkout task?”
>
> **Intended answer:** “The adapter reported passing checks at 18:42 UTC. It is waiting to run the next named validation step for revision R7. That evidence is one minute old; no task completion is recorded.”
>
> **Owner:** “Send me that decision.”
>
> The phone shows a Notify prompt for that task/revision/step, fixed parameters, nonce and expiry. **The owner taps Approve.** A future runner verifies the exact action-bound result and executes only the permitted step.
>
> **Owner, later:** “What's the latest?”
>
> **Intended answer:** “At 18:44 UTC, the adapter reported validation passed. That is a new recorded result, not a new inspection by me. Any different next step needs its own decision.”

If the evidence were stale, the answer would say current progress is unknown. If there were no events, it would say unknown. A quiet process is not proof it is working; a recorded completion is not proof the code is correct. SpeakSeek is a reporter of evidence, not a perfect progress estimator.

**What already exists:** per-session recorded state, persistent timeline, fresh/stale/unknown indicators, typed and speech-transcript question submission, deterministic answers, browser speech controls, pending decision cards, and a generic authenticated event adapter. The optional Cursor `stop` hook records loop outcomes, not a full task feed; live Cursor invocation is unverified. Browser microphone/read-aloud are not hardware-verified.

**What does not yet exist:** the native voice front door and execution adapter that follow a live Codex/Grok Bot/Cursor task and resume that task after a bounded phone decision. The existing timestamp action creates one file; it is not that runner.

## Pillar two: a boundary on the next operation

An owner can allocate 10,000 tokens to a task. A cooperating agent must establish measured usage, reserve a conservative maximum for each operation before running it, and reconcile the actual measured delta afterward. Requests that cannot fit are refused. The refusal is a concrete admission decision, not a dashboard claim that an unrelated process has been stopped.

This also makes a useful extension conversation possible: what exactly would the owner allow next, for which task and budget version, and what total would that produce?

### Vision conversation: more allowance does not mean more work is done

> **VISION / hypothetical, not an executable voice feature.** Assume the owner explicitly declared a 100,000-token daily pool for `2026-11-08T00:00:00.000Z` through `2026-11-09T00:00:00.000Z` (24 hours, UTC), and an adapter supplied fresh usage and progress evidence.
>
> **Intended notice:** “Agent X reached its 10,000-token allowance. The adapter separately estimated the work at 25% complete at 18:50 UTC. Cooperative admission is blocked.”
>
> **Owner, through a home speaker:** “Add 5% of my daily pool.”
>
> **Intended answer:** “That is an extra 5,000 tokens, raising this task's total to 15,000. Your daily share rises from 10% to 15%—five percentage points—and the task allowance increases by 50%. I will request confirmation for that exact change.”
>
> A phone prompt binds the task, version, extra 5,000, resulting total 15,000, nonce/hash and expiry. **An explicit matching approval** changes the permitted total. A cooperating runner may proceed only when a fitting next reservation, fresh usage and all other holds permit it.
>
> **Owner:** “Is it 50% complete now?”
>
> **Intended answer:** “No. The last reported work estimate is still 25%. I cannot derive work completion from token use or from your extension.”

The 25% statement requires actual agent-reported evidence; it is not inferred, seeded as live data, or a newly implemented progress field. Without fresh reported progress, the answer must say it is missing or stale.

### Four percentages people easily confuse

For an owner-declared **100,000-token** daily denominator and an initial **10,000-token** task allocation:

| Expression | Exact result |
| --- | --- |
| Add 5% **of the daily pool** | Add 5,000; new total 15,000 |
| Add five **percentage points of daily share** | 10% → 15%; also +5,000 while that denominator is unchanged |
| Increase the **task allowance by 5% relatively** | Add 500; new total 10,500 |
| Task has **used** 5,000 tokens | 5% of the daily pool, 50% of its initial task allowance; no work-completion implication |

The daily denominator is an owner declaration, distinct from measured usage and its source. The implemented percentage allocation requires an explicit valid 24-hour ISO UTC window and floors to whole tokens; an unknown denominator or credits/plan branding is not usable. The current extension control accepts an absolute extra-token amount, not a spoken percentage. Daily period expiry does not reset counts, renew permission, or enforce a shared pool across tasks.

### A refusal needs a reason

“Paused” should never hide the difference between:

- **Exhausted:** measured usage reached the allowance.
- **Not enough headroom for this operation:** 1,165 tokens remain but the next maximum is 2,000. A smaller operation could still fit.
- **Reserved in flight:** those maxima are already held, even before all actual usage is measured.
- **Unknown or stale usage:** no fresh, trustworthy baseline; do not substitute zero.
- **Uncertainty or another hold:** an interrupted reservation, regression, bound violation, version mismatch, or expired period requires appropriate resolution.

The current SQLite gate persists counters, holds and decisions; reconciles idempotently; protects concurrent admission; and retains uncertain reservations across restart. The allowance extension is one-time and version-bound. It does not reclaim spent/in-flight tokens or clear independent holds. Measured exhaustion has a deduplicated, opt-in alert path; not every refused operation automatically creates a phone extension request.

The integration contract matters. Callers must actually use the gate, supply a valid input upper bound including overhead, enforce a supported inclusive output/reasoning cap, and report measured usage without double-counting cached input or reasoning output. No universal provider quota/tokenizer adapter or universal stop guarantee is shipped. An unintegrated agent is monitoring-only, regardless of its product name.

## What the owner actually observed

**Manual evidence, November 7, 2026 (CST):** a real Notify request for **SIMULATED USAGE** was announced through AirPods Pro after Siri asked whether to read it and the owner asked it to do so. The owner then **opened Notify and tapped Approve**.

The matching bound approval produced `CONSUMED`, `approvalConfirmed: true`, exit 0. An isolated simulated ledger recorded allowance **10,000 → 20,000 once**, usage still 10,000, remaining 10,000 and version **1 → 2**. Two earlier timed-out attempts changed nothing. No paid model tokens or real provider allowance were involved, and old invocations must not be replayed.

This is a meaningful connection between a real notification, an audible announcement, a human touch decision and an auditable state change. It is **not voice approval**. It does not demonstrate Siri task-status queries, spoken amount parsing, a browser microphone, or a real coding agent pausing/resuming. The CLI alone cannot verify what was heard; the audio result is owner-confirmed.

The isolated demo is fixed at +10,000 / total 20,000. The vision's +5,000 / total 15,000 conversation is not a parameter or voice mode of that CLI. Generic offline sample approval remains simulated and cannot substitute for a real bound response.

## Who might use the foundation

These are illustrative applications, not shipped connectors or verified customer outcomes:

- **Coding:** hear the last reported checks/blocker, approve a reviewable next validation step, and bound that task's model use. A real agent runner/telemetry integration is still required.
- **Research:** learn which sources were processed and whether review is needed before authorizing more token use. Reporting progress does not certify research accuracy.
- **Long-running data jobs:** follow reported batch results and decide on a specific retry. Token limits cover model-using steps, not all CPU, storage or financial cost.
- **Multiple agents:** keep tasks and ledgers isolated so one task's approval is not another task's allowance. Shared provider-pool enforcement and orchestration are not implemented.

The benefit being pursued is less terminal checking and more deliberate boundaries when stepping away—not a promise of a particular savings, customer result or competition outcome.

## What must be built next

A full voice-to-agent loop needs supported platform APIs/native capabilities, authenticated access to status, a real cooperating agent/provider adapter, trustworthy usage bounds, a narrow execution contract, explicit confirmation, expiry/replay controls and device testing. It must retain existing tool/OS protections.

Native Siri/iPhone Shortcuts/App Intents, Google Home, HomePod and Alexa connectors do not exist here. Neither does a custom AirPods microphone double-click gesture, “Hey Agent X” wake word, Siri usage query, spoken amount receiver or spoken approve action. Standard system announcement in one observed setup does not supply those features. A hypothetical amount transcript could only be a proposal until supported capture and exact confirmation were implemented; no undocumented public reply-submit endpoint is assumed.

No voice platform can simply reach the current loopback backend from another device. Future integration design must solve supported authenticated access on its own terms, not bypass the intentional local browser restriction with a tunnel or wider bind. Missing hardware is not the only remaining work.

## Review the current slice

[README.md](README.md) stands alone with architecture, capability matrix, setup, accounting rules, current evidence and publication status. [DEMO.md](DEMO.md) defaults to offline/model-off or mocked examples and isolates any optional real phone test behind per-run owner authorization.

Fresh cloud evidence on **November 8, 2026 (UTC)** is **163 tests passed, 0 failed, 0 skipped**, including 47 phone-demo tests and the two transport checks a prior local preflight had excluded. `npm run typecheck` passed. Production build passed. Loopback health and a headless browser smoke passed. Microphone, audible playback, live Notify, and live model calls were not part of that run. Those checks are not a security audit.

[VERIFICATION.md](VERIFICATION.md) remains the November 7 record of the earlier MVP (including its 50-test checkout note and the Codex sandbox note). A prior local preflight of 161 available tests, with transport checks pre-excluded and `tsc` unavailable, is a baseline only.

These documents describe the source in this pull request. They do not mean published `main` already contains it. `main` at branch time was `4b28691ac86b235d5376bfc3aeec76546aa61818`. Source on GitHub is separate from a running hosted service. Older archives predate the token-budget and headless-phone additions and were not rebuilt.
