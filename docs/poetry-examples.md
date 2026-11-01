# Learner poetry examples

The initial result is al-Mutanabbī’s “على قدر أهل العزم تأتي العزائم”, credited as an analyzed example, not as a Muʿallaqa or generated output. Its analysis is computed with PyArud and bundled in `frontend/src/data/default-analysis.json`, so it appears immediately even when the API is offline. It does not scroll the page on load.

The selector groups that poem separately from seven Muʿallaqāt openings. Each entry has one complete verse, poet, known meter/rawi, and an Al Diwan source link. Additional vowel marks complete the scansion readings; the text is not presented as a verbatim transcription of all source diacritics. Sources were verified through Al Diwan search-index excerpts on 2026-11-01; direct page access returned HTTP 403.

| Poet | Source | Meter | Rawi |
| --- | --- | --- | --- |
| المتنبي | https://www.aldiwan.net/poem10524.html | الطويل | م |
| امرؤ القيس | https://www.aldiwan.net/poem50.html | الطويل | ل |
| طرفة بن العبد | https://www.aldiwan.net/poem20973.html | الطويل | د |
| زهير بن أبي سلمى | https://www.aldiwan.net/poem25065.html | الطويل | م |
| عنترة بن شداد | https://www.aldiwan.net/poem85.html | الكامل | م |
| لبيد بن ربيعة | https://www.aldiwan.net/poem21196.html | الكامل | م |
| عمرو بن كلثوم | https://www.aldiwan.net/poem311.html | الوافر | ن |
| الحارث بن حلزة | https://www.aldiwan.net/poem375.html | الخفيف | ء |

Loading an example checks against its known targets in checking mode. Detection sends neither target. Automatic vocalization is disabled for these fully vocalized excerpts. A deliberate mismatch example chooses a different rawi without changing the poem.

Two upstream limitations are disclosed beside the affected excerpts and their results: PyArud may extract ه instead of م for Labīd, and flag the final foot of al-Ḥārith’s first half-line. The sourced verse and reference targets are retained.

After changing the default excerpt or prosody engine, run `uv run python scripts/refresh_poetry_example.py` from `backend`. The example tests compare the bundled analysis with the actual analysis endpoint and exercise all eight excerpts through checking and detection.

## Letter-level scansion

Both analysis and detection enrich each foot with `pronounced_segment` and `letters`: the pronounced character, its 1/0 symbol, and its zero-based position in the half-line. Shadda and tanween expansions are preserved. The mapping follows `arudi_text`, not offsets in the original spelling, and does not claim to recover exact vowels.

The alignment is emitted only when the prosodic-letter and binary-pattern counts agree and the concatenated foot segments reproduce the complete pattern. Missing feet consume no letters; extra sounds retain their actual positions. If the engine outputs disagree, `letter_alignment.available` is false and no letter mapping is fabricated. The UI explains the limitation while retaining the engine's original feet and pattern. The first foot is expanded by default.
