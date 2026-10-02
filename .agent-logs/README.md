# Raw agent session logs

This directory is public and must remain tracked. No real session entries have
been fabricated for bootstrap. See `docs/agent-capture.md` for the manual wrapped-session
protocol and `CAPTURE-TEST.md` for the pending two-session acceptance test.

Only real user prompts, delivered final responses, UTC timestamps and confirmed
model labels belong in session files, using the required 8x metadata envelope.
Never add hidden reasoning, tools, commentary, environment values or exports.
Never edit, truncate or delete an existing entry. The recorder permits append-only
entries and recalculates only the frontmatter summary. Do not squash capture history
when interleaved commits are required by the assessment.
