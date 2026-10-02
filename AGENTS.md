# 8x agent capture protocol

Before any project work, read `docs/agent-capture.md` and `CAPTURE-TEST.md`.
Use the documented manual wrapped-session fallback; no automatic browser hook is installed.

- Capture each actual user message verbatim and each **delivered final** response verbatim.
- Log only the allowed content and confirmed model/timestamps. Never infer the actual
  model from planner/executor roles or generate historical text from memory summaries.
- Never collect system/developer messages, reasoning, commentary, tools, exports,
  file contents, diffs, retries or environment values as transcript events.
- At the next turn/session boundary, persist the preceding delivered exchange before
  feature work. The final exchange needs an explicit close-out handoff after delivery.
  A drafted answer is not a delivered answer. Never claim automatic or complete capture.
- Validate reviewed input with `scripts/agent_capture.py`; commit through connected
  GitHub tooling to a feature branch, never main. Read the current branch head first,
  preserve its tree, use SHA-aware file writes/non-force ref updates and read back.
- Existing `.agent-logs/` entries are immutable. Append exchanges in the same session
  file; only frontmatter aggregates may be refreshed. Never ignore/delete/clean logs.
- Block publication on secret/trace suspicion or unknown actual model/time; document
  the gap outside raw logs. Do not redact and then claim verbatim capture.
- Canary 1 and Canary 2 must be real user messages in two different conversations.
  A different UUID alone does not prove a fresh conversation. Never fabricate passes.
- Capture setup began after the assignment timer. Preserve this limitation.

This file is a workflow instruction, not a lifecycle hook or enforcement guarantee.
