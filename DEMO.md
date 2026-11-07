# SpeakSeek — 90-second demo

Prerequisite: Node 24.22.1+ in an environment permitting local sockets. From the source checkout, run `npm run build && npm start` and use the printed local URL (normally http://127.0.0.1:5177). Samples seed once and remain durable; their freshness naturally ages. The original Codex sandbox blocked the server, so that run did not browser-verify this walkthrough. Results for this checkout are in [VERIFICATION.md](VERIFICATION.md).

| Time | Action | What to explain |
| --- | --- | --- |
| 0–15s | Select **Checkout recovery · SAMPLE**. | The SIMULATED badge is visible. Timeline records start → reproduction → retry/check evidence → review decision. These are sample observations, not a live agent. |
| 15–30s | Uncheck **Use Belweave evidence selection**. Type “How is this task doing?” and click **Ask SpeakSeek**. | The fallback answer reports the selected session's last state/time. If stale it explicitly says current progress is unknown. Model-off mode is deterministic and works offline. |
| 30–40s | Click **Read aloud**, then **Stop / mute**. Optionally use the voice button to capture and review a question when recognition is supported. | Browser speech only; typing remains available after microphone denial. Audible speech and microphone behavior are not verified in this environment. |
| 40–55s | Click **Try SIMULATED decision**, then **Approve**. | It becomes SIMULATED APPROVED. No phone push or real timestamp operation occurs. |
| 55–65s | Create another simulation and choose **Deny**; create another and choose **Timeout**. | SIMULATED DENIED and EXPIRED are explicit outcomes. The Timeout control illustrates expiry immediately; it does not pretend ten real minutes passed. |
| 65–75s | Select **Search accessibility · SAMPLE**, then **No events yet (sample)**. | One session's events do not appear in another. Completed evidence can be stale. Empty means unknown, not “working.” |
| 75–90s | Select **Local phone-gate demo**. Check Connections; if Notify is unconfigured, deliberately click **Request real phone approval**. | A persisted FAILED decision explains missing authentication. No file is written. Only perform this click as a real phone test when authentication is configured. |

## Optional real integration demonstration

This is separate from the 90-second offline walkthrough. No real phone round trip has been verified here.

1. Install the Notify phone app through the official quickstart, sign in with the same account used for CLI authorization, and allow notifications.
2. In their own terminal, the user completes `notify auth login --client-name AgentPulse --no-open --json`, then checks `notify auth status`. Do not paste credentials into chat.
3. In SpeakSeek, click **Recheck**, select **Local phone-gate demo**, and explicitly click **Request real phone approval**.
4. Read the precise timestamp action on the phone. Approve once. A matching, timely, server-confirmed response changes the decision to CONSUMED and confirms one timestamp file. Duplicate/replayed responses cannot create a second file.
5. Create a new request and deny it. No file is written. For real timeout/expiry, leave a new request unanswered for ten minutes. Late approval remains blocked. Local cancel blocks execution even if a remote prompt stays visible.
6. Real event alerts are a separate explicit opt-in. Enable the toggle and report a completion/failure/decision through the generic adapter. Accepted or queued does not mean a person saw the alert. Never send unsolicited test pushes.

With Belweave configured and network available, enable evidence selection and ask once. The app sends sanitized minimal evidence with a 512-token budget and 20-second timeout. Visible wording remains constrained to the stored record. Empty/truncated/error responses visibly fall back. The attempted live call here failed; no live verification is claimed.

Samples are seeded once, never reset on restart, and never send notifications. `npm run seed` is safe to repeat. For a newly fresh, real local timeline, use the generic adapter with a new session ID and increasing sequences; do not relabel sample events as real telemetry.
