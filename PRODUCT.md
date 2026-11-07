# SpeakSeek

SpeakSeek is a status check for a coding task you already named. You pick the task — call it Agent X, a checkout fix, or whatever you call that piece of work. Agent X means your task or agent name. It is not the X social network. Later, that name might point at a Grok Bot or Codex task. Today it points at a session of recorded events.

The problem is simple. The work is on a computer. You are not. You want a straight answer: what was last observed, whether anything needs a yes or no, and whether the task is actually done. You do not want a guess that it is “still going” because a process is quiet, and you do not want “almost done.”

## How the pieces fit

Three different things have to stay separate.

**Status** comes only from events that were recorded for that session: a type, a time, a sequence, and a short summary. SpeakSeek reports the latest recorded state and how fresh that evidence is. A spoken or typed answer describes that record. The answer does not start work, resume work, or approve anything.

**Voice** is how you ask. In the intended at-home experience, you would ask out loud and hear the recorded status back. In this MVP, you ask in the browser: type the question, or use the browser’s own speech recognition when that browser offers it, then read the text before you submit. Read-aloud uses the browser’s speech synthesis. None of that is a phone approval.

**Phone approval** is a separate, explicit decision about one exact action. The phone message has to describe that action. Approving it can allow only that action, once, while it is still in time. A status reply never counts as approval. Denying, ignoring until expiry, or hitting an error leaves the action blocked.

Freshness is part of the answer:

- **Fresh** means the newest evidence is at most two minutes old, counting from the earlier of the event time and the time the server stored it.
- **Stale** means older evidence is on record. SpeakSeek can tell you what was last observed and when. It will not pretend the task is still making progress.
- **Unknown** means this session has no events. Empty is unknown, not “working.”

Silence is not progress. A late or replayed old event does not become fresh. A completion counts only when a completion event is stored. That means completion was recorded. It does not mean SpeakSeek re-ran the task and proved the result.

## A walkthrough at home

This dialogue is a **hypothetical future experience**. Google Assistant, Hey Google, and any speaker integration are **not implemented and not verified**. Nothing here claims a particular Google mechanism. The names and lines are the product vision, so a judge can hear what “done” is supposed to feel like.

You are at home, away from the computer. Your task is named Agent X.

> **You:** Hey Google, give me a status update on Agent X.
>
> **Intended reply:** Agent X last recorded “checks passed for the retry change” at 6:42 PM CST (an example time). That evidence is stale, so current progress is unknown. Nothing in this status reply approves or starts work.

You go back to what you were doing. Later the task reaches a point that needs a decision. Your phone gets a Notify approval. The message names the session, the exact action, the parameter fingerprint, a one-time nonce, and the expiry. It is not a vague “Agent X wants to continue.”

> **Phone (intended Notify prompt, example time):** Create one demo timestamp file for Agent X. That is the only action in this request. It expires at 6:58 PM CST.

You approve on the phone, put it down, and return to your own activity. You do not sit at the computer. Later you ask again.

> **You:** Hey Google, give me a status update on Agent X.
>
> **Intended reply:** The timestamp action was approved in time and consumed once. The task itself has no completion event. I can’t call it done.

A second decision shows up. It is a different action, with its own nonce and expiry. The first approval does not cover it. You handle that second request on its own: approve it, deny it, or let it expire. Denial, expiry, a wrong or late reply, or an error stays blocked. The action does not run.

> **You:** Hey Google, is Agent X done?
>
> **Intended reply, if no completion was stored:** No. The last recorded state is not a completion. I won’t say it is almost done.
>
> **Intended reply, if a completion event was stored:** A completion was recorded at 7:16 PM CST (an example time), with this summary. That confirms the recorded event, not a new inspection of the work. A second, different approval still needs its own phone decision. The first yes does not cover it.

If the evidence is stale at that last question, the reply still says so. If the session is empty, the reply is unknown.

## Available in this MVP vs intended integrations

**Available in this MVP**

- A local loopback dashboard for one person. It stores events in SQLite and shows the selected session’s timeline, last observed state, time, and fresh / stale / unknown label.
- Typed questions. With the model off, the answer is deterministic and comes from the stored record. It works without an API key.
- Optional browser speech: push-to-talk when the browser supports recognition, review the text, then submit. Read aloud and Stop / mute use the browser. Microphone and audible playback are not a verified product integration.
- Optional Belweave evidence selection. The model may only pick from supplied sanitized evidence. Wording still comes from the record. If the model is missing or fails, the dashboard shows a stored-event fallback. A live model call is not claimed as verified.
- Sample sessions, marked **SIMULATED SAMPLE**. They are not live telemetry and they do not send notifications.
- A **SIMULATED** approval practice path: Approve, Deny, and Timeout. Those states stay labelled SIMULATED. They do not write the demo file and they do not contact a phone.
- One real gate, and only this gate: create a single timestamp file under `demo-output/`. It runs only after a matching, timely, one-use phone approval for that exact action. The decision is bound to the session, the fixed action, a hash of the fixed parameters, a random nonce, and a ten-minute expiry. Consumption happens once. Denial, expiry, timeout, cancellation, a mismatched reply, a malformed result, missing login, or a service error does not create the file. Restart leaves pending requests fail-closed.
- A generic event adapter for posting recorded events to the local server, and an optional Cursor `stop` hook example. The hook is limited stop telemetry. It is not a native Codex connector, not a Grok Bot connector, and not a full progress feed. Actually running it inside Cursor is unverified.

**Intended, not in this MVP**

- Asking from another room with “Hey Google,” Google Assistant, or a speaker, and hearing SpeakSeek answer. That integration is not built and not verified.
- A native connection that follows a live Codex task or Grok Bot as “Agent X.” The generic adapter and the optional Cursor stop script are not those connectors.
- Starting, resuming, or driving an arbitrary coding agent. That execution path is not implemented.
- Approving arbitrary commands, shell actions, or a second kind of file change. Voice output cannot authorize execution. Only the fixed timestamp demo is wired to the real gate.
- Treating a Notify CLI login check, or a push that succeeded outside this app, as proof the app’s approval flow works end to end. It does not. No in-app phone round trip is claimed here.

Samples and simulations stay labelled. A judge can walk the local dashboard without secrets. The at-home dialogue above is the direction, not a feature that ships in this repository.
