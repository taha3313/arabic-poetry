# Editable poetry preview

Checking and detection retain `*` as the input shortcut. Every non-empty line is previewed as labeled صدر and عجز fields; a missing separator leaves a visible empty second half that can be completed in place. Multiple separators are flagged without silently discarding text. Editing either field updates the same source draft, preserving blank lines and cursor position. There are at most eight verses and 240 non-diacritic characters per half; reviewed vocalized halves can contain up to 720 characters.

With automatic vowel marks enabled, a complete input triggers `/api/tashkeel` after 900 ms of idle typing. This endpoint completes marks using the existing local model, without analyzing or selecting a meter. Suggestions are labeled in the preview. Only vowels may change; spaces, blank lines, letters, punctuation and the delimiter layout are preserved. The exact pre-suggestion source remains available for comparison and restoration.

Editing the preview cancels pending suggestions and protects manual corrections. Further suggestions require an explicit request or new input in the shortcut area. Requests carry a revision guard and an abort signal; delayed responses cannot replace more recent edits. Suggestion failures leave the draft editable and allow analysis without the model.

Analysis submits the reviewed preview with `auto_tashkeel=false`, so no second vocalization rewrites the learner's corrections. Existing API clients may still request automatic vocalization through the analysis endpoint. A previous analysis is marked stale when the draft changes.

The UI uses native textareas instead of contenteditable, including Arabic direction, stable row keys, labels, focus states, and adjustable field heights. On sufficiently wide screens the two halves are side by side; narrow screens stack them.

`npm test` in `frontend` verifies incomplete verses, input limits, separator handling, whitespace preservation, word-preserving suggestions, and cursor mapping. Backend tests verify suggestions, preservation of supplied marks, recoverable failures, and analysis of reviewed vocalized text. Browser QA covers Arabic/English at 375px and 1440px, real model suggestions, preview edits, exact analysis payloads, restoration, delayed responses and offline fallback.
