# Agent capture: manual wrapped-session fallback

## Verified environment and decision (2026-10-02 UTC)

Repository inspected at main `28538ed8ebe031024e4053d6fd85746256d588ca`.
Its recursive tree contained no AGENTS.md, .codex hooks, .github workflow or prior
agent logs. `.gitignore` ignores env files, credentials, recordings and `*.log`;
it does not exclude `.agent-logs/*.md`. Existing exclusions remain unchanged.

The exposed tool registry was checked for lifecycle hooks, prompt/response callbacks,
chat transcript export and current-session APIs. None was exposed for this chat.
GitHub tools expose repository operations, not ChatGPT message events. Library
upload sessions, scheduled automations and Vercel agent traces are unrelated.
The accessible workspace and user `.codex` configuration had no hooks configuration,
hooks.json, history.jsonl, sessions directory or rollout.jsonl at those locations.
Only configuration key names were inspected; credentials were not collected.
No runtime actual-model identity accessor was exposed. The workflow's named executor
does not establish which model served this exchange.

Official documentation checked:
- https://learn.chatgpt.com/docs/hooks (managed hooks/cloud orchestration section)
- https://learn.chatgpt.com/docs/plugins (surface-specific hook support)

Those docs distinguish local Codex hooks from cloud orchestration: local/plugin
hooks are unsupported in the latter; enterprise-managed remote hooks require a
supported admin setup. No such callback/configuration is exposed here. We did not
install a pretend hook, scrape internal chat state or start a paid API wrapper.
This is a scoped finding about this environment, not a claim that all OpenAI products
lack hooks or that no user-facing account export exists.

An optional read-only HTTPS clone failed because the sandbox proxy was unreachable.
Repository inspection continued through the GitHub connector; a small local snapshot
of the inspected configuration was used for recorder checks. All remote writes use
the connected GitHub tooling. No attempt at automatic capture succeeded or was claimed.

## Protocol

1. Assign a random UUID to the actual browser conversation (retain it for subsequent
   exchanges). This is a wrapper ID, not a claimed ChatGPT internal thread ID.
2. Confirm the actual selected model using visible UI/user confirmation or trustworthy
   runtime metadata. Record that exact project label for each exchange. Never default
   to ASTRA just because it is the planned executor. If model changes, entries carry
   their own labels and the header becomes `mixed (see entries)`.
3. Retain only the complete user-authored message as visible in the conversation.
   Do not include injected project instructions, memory, system/developer text or tool
   output. Do not reconstruct old prompts from summaries. Attachments are outside this
   text-only recorder; document any unsupported content as a gap.
4. Once the final answer has actually been delivered, copy its exact Markdown source.
   Persist the completed exchange at the beginning of the next turn, before new work,
   or have the user/operator close the session using the delivered text. The last answer
   cannot be automatically written after this agent has stopped. Do not pre-log a draft
   as a delivered response. A close-out prompt/answer is itself another exchange to
   account for; operator-side finalization avoids an endless chain of assistant turns.
5. Use true message event UTC times if exposed. Otherwise record UTC times when each
   visible message is observed/copied, and explicitly describe that timing basis in
   CAPTURE-TEST.md. Never invent precise send times or backdate a delayed observation.
6. Review text and confirm metadata before publication. Submit JSON on stdin to
   `python scripts/agent_capture.py record --reviewed-public-text`.
   The input has exactly `session_id` (UUID string) and `exchanges` (nonempty array).
   Each exchange has exactly `prompt`, `response`, `prompt_time`, `response_time`,
   and `model` (all strings). Times use ISO UTC ending `Z`. Supported model labels:
   `GPT-5.6 Sol`, `GPT-6 ASTRA`, `GPT-6.1 Sol`. New labels require an explicit code update.
   Input must contain the entire session-to-date on append. The recorder will reject
   any modification to existing entry text, timestamps, ordering or models.
7. Run `python scripts/agent_capture.py check --base <previous-branch-head>` and
   `python scripts/check_secrets.py`. Review the exact files to publish. Use connector
   create/update-file with current blob SHA, or a base-tree commit plus non-force branch
   update. Never overwrite a stale head: on divergence read the new head and regenerate
   against it. Read back and compare exact bytes after committing.
8. Commit completed logs interleaved with work, never only as an end-of-hackathon dump.
   Do not merge/squash away capture history. The next session must explicitly read this
   protocol from the branch until merged; AGENTS.md is not automatically loaded by all
   browser workflows. Keep both canaries pending until their delivered pairs are saved
   and byte-checked, and the fresh-conversation condition is confirmed by the user.

## Publication safety and limits

The recorder does not read env variables, dotenv files, transcript exports, network
responses or model internals. It accepts only allowlisted input fields and emits only
the required log envelope and prompt/response bodies. It rejects common secret formats,
environment assignments, trace signatures and ambiguous real log delimiters. Rejection
errors never echo the input. Unit tests generate synthetic fixtures only in temporary
directories, never as `.agent-logs/` evidence.

Pattern checks are not proof that arbitrary prose has no secrets or was faithfully
copied. Manual review is mandatory; never feed raw transcript exports into this tool.
If a message contains sensitive material, stop publication, preserve the public log
unchanged and report the capture gap. Do not silently redact or claim full capture.
The filesystem lock guards local writers; GitHub SHA checks guard remote writes.
Git history checking detects alteration/deletion against a selected base. This is not
a server-side guarantee against a maintainer bypassing checks. No CI is installed:
validation is run locally and must be repeated before each connector commit.

No code can enforce every future browser conversation from this repository. Reliable
use requires the wrapper protocol and a final operator close-out. Assessment acceptance
of this fallback is not asserted until the real tests and reviewer requirements are met.

## Checks

`python -m unittest discover -s scripts -p 'test_agent_capture.py' -v`

`python scripts/agent_capture.py check --base <previous-branch-head>`

Frontend/backend production code is untouched; product builds are not evidence of
capture correctness. Run the capture tests and existing secret check for this change.


## Delayed observation timing (2026-10-03 clarification)

A final response copied during a later close-out can have an observation timestamp
later than the next prompt's known submission timestamp. Those values describe
different events; requiring one to precede the other discarded valid exchanges.
The recorder now checks prompt timestamps in conversation order and response
observation timestamps in copy order independently. Each response must still be
at or after its own prompt and at or before the current UTC time. Secret/trace,
model-confirmation, canonical-format, and append-only checks are unchanged.

Always document which values are submission events versus observations in
CAPTURE-TEST.md. Never present a copy timestamp as delivery time. This correction
does not change any existing raw log bytes or reconstruct historical omitted
exchanges. No hooks or automatic capture are introduced.
