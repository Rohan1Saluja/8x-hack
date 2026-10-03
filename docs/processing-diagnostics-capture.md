# Processing diagnostics capture handoff

This observability checkpoint uses the existing manual wrapped-session fallback.
No existing `.agent-logs/` entries were changed. No automatic hook is available.
The current prompt/final pair must be captured after the final response is delivered;
the actual selected model still requires user/UI confirmation. No draft response or
inferred model is recorded. Operator close-out is pending under `docs/agent-capture.md`.
