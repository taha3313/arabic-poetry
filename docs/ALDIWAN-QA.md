# Al-Diwan analysis QA · 2026-10-24

Tested the real **فحص أبياتي** form with six attributed classical poems across
five meters. Every case selected the expected meter and rawi, pasted the text
as `صدر * عجز`, submitted the form, inspected the API response and rendered
per-verse status, and opened the scansion. No Gemini/generation requests were
made. The initial source observations are retained, including failed checks.

## Source access and transformations

Direct requests to aldiwan.net returned Cloudflare HTTP 403. The test excerpts
were transcribed from the search tool's indexed Al-Diwan page text, not claimed
as fresh direct-page downloads. Source links, authors and dates are retained in
`backend/tests/fixtures/aldiwan.json`. This is a small excerpt fixture, not a
scraper or site import.

Three distinct input variants prevent confusing input quality with meter
accuracy:

- **As published in the retrieved index:** first two verses per poem; preserve
  the available partial vowel marks, with source button labels removed and the
  hemistich boundary represented by the form's required `*` separator.
- **Vocalized control:** the opening verse only, with editorially completed
  diacritics. All six preserve the source's underlying letters/words (verified
  after removing combining marks). These are labelled editorial controls, not
  verbatim copies or independent expert annotations.
- **Unvocalized:** the two source verses after removing Unicode combining marks.

Meter expectations follow standard classifications of these classical poems;
Al-Diwan's retrieved snippets explicitly supplied meter/rhyme labels for
Imru' al-Qais, the Wafer poem and Abu Tammam. The other classifications are
standard reference expectations, not a claim that every page's metadata was
retrieved. This is evaluation against selected meters, not automatic detection.

## Results

Counts are verses matching the selected meter. All source and control verses
matched the requested rawi; complete acceptance requires both conditions.

| Poem / source | Meter | Source text | Vocalized opening | Without diacritics |
| --- | --- | --- | --- | --- |
| [قفا نبك — امرؤ القيس](https://www.aldiwan.net/poem50.html) | الطويل | 0/2 | 1/1 | 0/2 |
| [على قدر أهل العزم — المتنبي](https://www.aldiwan.net/poem10524.html) | الطويل | 0/2 | 1/1 | 0/2 |
| [إذا الشعب يوما — الشابي](https://www.aldiwan.net/poem38947.html) | المتقارب | 0/2 | 1/1 | 0/2 |
| [إذا غامرت — المتنبي](https://www.aldiwan.net/poem10566.html) | الوافر | 0/2 | 1/1 | 0/2 |
| [السيف أصدق — أبو تمام](https://www.aldiwan.net/poem30591.html) | البسيط | 0/2 | 1/1 | 0/2 |
| [هل غادر الشعراء — عنترة](https://www.aldiwan.net/poem85.html) | الكامل | 2/2 | 1/1 | 0/2 |
| **Total** | **5 meters** | **2/12** | **6/6** | **0/12** |

The different denominators are intentional: two source verses versus one
vocalized control per poem. No untested full-poem or all-meter accuracy claim.

## Additional browser checks

- Wrong rawi rejects the fully vocalized opening while preserving its valid
  meter result.
- Wrong meter rejects the same verse.
- Added extraneous words break the previously accepted verse.
- Fully vocalized Wafer control works at phone width, with scansion visible.
- No horizontal overflow at 280, 320, 390, 414 or 1280px.
- **22 browser cases completed**, no browser page errors, **0 LLM requests**.
- Added six positive control and three negative regression cases. Entire backend
  suite: **27 passed**; Ruff passed.

Raw responses: `evals/aldiwan-browser.json`.
Screenshots: `aldiwan-source.png`, `aldiwan-vocalized.png`, `aldiwan-mobile.png`.

## Interpretation

The form, API and rendered meter/rhyme statuses agree. **Pasting partially
vocalized Al-Diwan text is not reliably analyzed as metrically valid.** The
failure does not establish that the original classical verse is broken. The
controlled vowel-completion result strongly demonstrates dependence on
vocalization for this sample; it does not establish the exact cause of every
individual mismatch or expert correctness of every editorial vowel.

PyArud is currently a scanner of the supplied pronunciation, not a reliable
unvocalized Arabic reader. Its numerical scores also include priority bonuses
and can exceed 1.0; they must not be interpreted as calibrated probabilities.
No engine thresholds, poem text or verdicts were changed to force this test to
pass. No automatic vocalization was added as part of this testing request.

## Reproduce

```bash
cd backend
uv run pytest tests/test_aldiwan.py
# With frontend and backend running, plus Playwright/Chromium installed:
cd ../frontend
node scripts/aldiwan.mjs
```

Playwright setup is described in `docs/VERIFICATION.md`. Browser execution
refreshes the report/screenshots and consumes no LLM quota.
