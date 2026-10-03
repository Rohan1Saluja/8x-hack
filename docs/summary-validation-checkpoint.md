# Summary validation checkpoint

The reported response identifies validation failure, but does not identify the rule or contain the rejected output. The user confirmed Generate summary. No exact production rejection cause is claimed without a safe reason log.

Confirmed contract defects addressed:
- The provider schema previously accepted arbitrary citation strings. It now uses a shared enum of the current meeting's stored segment IDs. Local validation remains authoritative.
- The generation instructions omitted the validator's text/item/citation limits and exact-source action metadata requirements. Those rules are now explicit.
- Unknown, reformatted or placeholder optional owners/deadlines previously rejected an otherwise valid summary. The generation adapter now conservatively omits unverifiable metadata (null), then applies the existing strict validation. It never invents metadata, repairs unknown citations, removes invalid facts or substitutes fake summaries.
- Expected validation failures previously produced no diagnostic reason. Allowlisted reasons now distinguish schema mismatch, truncated/incomplete output, invalid/missing evidence, oversized summaries, metadata and unknown segment references. Warnings contain meeting ID, stage and reason only; no exception message, transcript, model output, URL or secret.

No extra provider calls, automatic repair retries, model changes or budget changes. Input-size and output-token limits remain enforced; reservation includes the actual schema payload. Existing HTTP error shape and status remain unchanged. Saved earlier stages are preserved.

Verification: 21 focused tests pass, including actual HTTP error mapping with isolated dependencies, schema ID isolation, conservative metadata normalization, strict citation rejection, safe logs and free-plan/provider quota gates. Existing pure evidence-validation tests pass. Groq production generation and database integration are not tested here; retry summary once after merge/deploy and use the safe reason if it still fails.

Capture: existing raw logs are untouched. The preceding delivered exchanges remain pending selected-model confirmation; this final exchange additionally needs post-delivery close-out under docs/agent-capture.md. No historical entries or inferred model labels were fabricated.
