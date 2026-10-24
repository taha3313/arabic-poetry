# Generation and targeted repair

The Arabic instructions in `backend/app/services/prompts.py` cover coherent
imagery, grammar, full diacritics, meter, permissible variations, and consistent
rawi. They prohibit artificial inflection, arbitrary sukun and filler used to
force a scan. Initial requests include a compatible pair of hemistich patterns
and named feet derived from the installed PyArud data for each of 16 meters.

Revision requests identify failing verses and editable hemistichs, supply scan
diagnostics and sound rhythm anchors, and ask for internally compared alternatives.
The backend enforces preservation of accepted verses and sound hemistichs;
it does not rely on the model obeying that instruction. A rawi mismatch unlocks
the ajuz. An incompatible pair with individually matching halves unlocks both.
Each revision starts from the strongest complete draft. Request budgets remain
bounded. The UI exposes a provider failure that interrupted revision.

## User-provided Aleppo regression

The exact four-verse draft is in `backend/tests/fixtures/aleppo-draft.json`.
PyArud accepts three verses; only the second sadr fails. Tests cover that
localization, preservation of seven sound hemistichs, compatible references for
all meters, and an end-to-end mocked repair that rejects unsolicited rewrites.

Live evidence in `evals/aleppo-targeted-repair.json` shows an actual Gemini
revision still at 3/4 accepted. Other calls failed at the provider. The final
prompt refinements have not demonstrated a successful live repair. This is not
a benchmark proving poetic quality or guaranteed meter compliance.

`evals/aleppo-manual-control.json` is explicitly a manually authored control,
not Gemini output. Replacing only the second sadr with
«يَا ظَبْيَةً هَاجَنِي مِنْ طِيبِهَا أَرَجٌ» yields 4/4 automated meter/rawi
matches, preserving the other seven hemistichs. Human literary and prosodic
review remains valuable. The city is still present in the original title.

An opt-in live reproduction is available with
`uv run --directory backend python scripts/repair_aleppo.py`.
It consumes provider requests and requires a configured key.
