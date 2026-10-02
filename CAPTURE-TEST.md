# 8x Agent Capture Setup — acceptance pending

Assignment work started before capture setup was correctly applied. This setup was
added after the official timer started. Historical exchanges have not been fabricated.

## Tool and models

- Tool: ChatGPT browser with connected GitHub tooling; repository writes via connector.
- Planned planner: GPT-5.6 Sol. Planned executor: GPT-6 ASTRA.
- GPT-6.1 Sol may also be used; thinking effort may vary (not logged).
- Actual setup-turn model: unverified; the runtime exposes no model identity accessor.
  User/UI confirmation is required before creating its raw session entry.

## Mechanism and timing

Manual wrapped-session fallback; no automatic hook installed or verified. See
`docs/agent-capture.md` for the exact availability checks and post-delivery protocol.
Only explicit reviewed prompt/final text and required metadata are accepted. Event
timestamps are used if available; otherwise UTC observation/copy times must be disclosed
here for each session. Final response capture requires a subsequent turn or operator
close-out. The setup final response has now been delivered, but that exchange is not yet
logged because its actual model has not been confirmed retrospectively. This is a bootstrap gap, not a pass.

## Files/configuration changed

- `AGENTS.md`: wrapper instructions for future agents.
- `docs/agent-capture.md`: checks, procedure, safety limits and close-out requirements.
- `scripts/agent_capture.py`: strict recorder, format validator and history guard.
- `scripts/test_agent_capture.py`: synthetic safety/integrity tests.
- `.agent-logs/README.md`: tracked public directory bootstrap, no invented exchanges.
- `CAPTURE-TEST.md`: this pending evidence register.

No product code, environment configuration, gitignore or runtime hook configuration
was changed. No canary file is present merely to make the checks appear complete.

## Infrastructure verification

- 14 recorder unit tests passed using synthetic temporary fixtures.
- Format/history/ignore check passed with zero real session logs (not a canary pass).
- Existing secret checker passed on the local capture/configuration verification snapshot.
- `git diff --cached --check` passed. Frontend/backend builds were not run because
  no product source or dependency configuration changed.

## Attempts and limitations

The tool registry, relevant local configuration and official hook documentation were
checked. No usable browser callback/export/session store or actual-model accessor was
exposed. No lifecycle hook was invented. A read-only HTTPS clone failed due to an
unreachable sandbox proxy; connector reads worked. See the protocol for details.
Pattern scanning plus human review is a publication safeguard, not a mathematical
guarantee against secrets or a guarantee that all future exchanges will be captured.

## Canary Session 1 — RECEIVED; FINALIZATION PENDING

- Conversation/wrapper ID: `338a3504-61ea-422d-90bf-02d2cb44d506` (current conversation).
- Actual model for the model-confirmed canary: `GPT-6 ASTRA`, based on the user's
  explicit `GPT-6 Astra (High)` message. This does not independently verify runtime
  routing or retrospectively establish the setup-turn model.
- Prompt event time: `2026-10-02T21:15:01Z`, converted from the message submission
  time supplied for this turn (`2026-10-03T02:45:01+05:30`).
- Intended log path (not yet created):
  `.agent-logs/2026-10-02_21-15-01_338a3504-61ea-422d-90bf-02d2cb44d506.md`.
- Result: NOT PASSED. The final response must first be delivered, then copied and
  committed unchanged in a subsequent turn or operator close-out. Do not mark a
  receipt record as a completed raw prompt/response pair.

Actual model-confirmed user message, verbatim (including backticks):

````text
GPT-6 Astra (High)
`CAPTURE TEST — 8x assignment, Rohan Saluja`
````

A separate preceding user message arrived at `2026-10-02T21:14:36Z` without a
delivered assistant final response between the two messages. Preserve it below;
do not invent a response, combine it into the later prompt, or count it as a
second canary session. The current pair-based recorder cannot represent an
unanswered prompt as a complete exchange; this remains a documented capture gap.

Preceding user message, verbatim:

````text
`CAPTURE TEST — 8x assignment, Rohan Saluja`
````

Raw completed PROMPT/RESPONSE entries: pending post-delivery finalization.

## Canary Session 2 — PENDING

Expected real user prompt: `CAPTURE TEST 2 — 8x assignment, Rohan Saluja`

- Must be sent in a completely fresh ASTRA conversation; UUID uniqueness alone does
  not establish this. The user must confirm the fresh conversation.
- Conversation/wrapper ID: pending actual session.
- Confirmed actual model and timing basis: pending.
- Committed log path: pending.
- Raw PROMPT and RESPONSE entries: absent until the actual exchange is delivered,
  persisted and verified byte-for-byte against the visible conversation.
- Result: NOT RUN.

After each real canary, append the two raw entries here unchanged, with its committed
log path and verification result. Do not replace pending fields with invented evidence.
