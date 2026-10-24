# Live Groq comparison — 2026-10-24

Four models returned by the authenticated live model catalog were tested:
`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`,
and `allam-2-7b`. Guard, speech and transcription models were excluded.

Each received the same production prompts for two two-verse requests:
concealed love for a woman from Aleppo on basit, and hope after hardship on
kamel, both requesting rawi م. Each had at most one revision. This small,
stochastic sample cannot establish a general ranking.

Initial evidence: `evals/groq-comparison-before.json`. Diagnostic GPT-OSS calls
returned HTTP 200 but `finish_reason=length`, empty content and 2,998 reasoning
tokens out of a 3,000 completion budget. This was not an invalid key.

The adapter now requests JSON object output for Groq, and low reasoning effort
for GPT-OSS models, keeping the existing 3,000-token cap. Other models do not
receive this model-specific parameter. Official parameter reference:
https://console.groq.com/docs/reasoning

Repeated evidence: `evals/groq-comparison.json`. Both GPT-OSS models and Qwen
returned drafts, but **no complete verse passed both meter and requested rawi**
in these cases. ALLAM returned one malformed/unusable run and a weak draft in
the other; GPT-OSS 20B also hit a quota during revision. Qwen matched rawi more
often, but its text included malformed wording and artificial stretching;
its higher scan similarity is not sufficient evidence of better poetry.

No alternative demonstrated acceptable metrical Arabic poetry. Keep the
current `openai/gpt-oss-120b` setting rather than claiming a successful upgrade.
Generation remains experimental and unresolved output is marked for review.
Provider transport success must not be confused with prosodic or literary quality.

Reproduce explicitly with `uv run --directory backend python scripts/compare_groq.py`.
This consumes live quota (up to 16 completion requests) and overwrites the latest
evidence file. Backend suite after the request-parameter change: 71 passed;
Ruff passed. No frontend change was needed.
