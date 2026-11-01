# Editable preview: accessibility and responsive review

Reviewed 2026-11-01 in the local Qafiya worktree, including the editable preview, tashkeel suggestions, three modes, and default al-Mutanabbi result. The review used Chromium automation, axe-core, native keyboard interaction, and layout measurements. It is not a certification or a manual VoiceOver/NVDA test.

## Coverage

- **200 layout cases:** Arabic/English; compose/check/detect; initial and populated suggested-preview states for check/detect; each at 320, 360, 375, 390, 414, 540, 541, 640, 768, 820, 850, 851, 960, 1024, 1099, 1100, 1280, 1440, 1920 and 2560 CSS pixels. Heights: 844px below 640px width, otherwise 900px.
- **30 axe scans** across those states at 320, 768 and 1440px, using WCAG 2 A/AA, WCAG 2.1 AA, WCAG 2.2 AA and best-practice tags.
- **13 edge cases:** eight verses in both languages at 320/768/1440px; the same six configurations with text doubled to simulate text-only enlargement; and a long unbroken verse/result at 320px. This text-enlargement simulation complements the narrow-width reflow checks; it is not a claim of testing every browser's zoom implementation.
- **Four keyboard flows** at 375/1440px in both languages, with reduced motion enabled: skip link, help disclosure, error announcement/association, per-verse field names, tab sequence and focus indicators, analysis result focus, foot disclosures, suggestion action focus and restoring original text. Three additional axe scans per flow (12 total).
- **Four asynchronous-state axe scans:** suggestion loading/failure and analysis loading/failure at 320px. Progress announcements remain outside the busy result region.

## Findings fixed

1. Repeated named letter-scansion sections created duplicate landmarks. They are now ordinary content under their visible headings; the results have a single named region.
2. Validation errors were announced without marking or associating the source field. Invalid input now receives `aria-invalid`, points to the error, and returns keyboard focus to the source. Server failures focus their announced error message. Invalid individual halves have the same contextual association and unique per-verse names.
3. Completed analysis only scrolled the page. It now focuses the result heading after an explicit action; the default sample never takes focus or makes an unsolicited completion announcement.
4. Restoring original text removed the focused button. Focus now returns to the source. Requesting vowel marks retains keyboard focus while its action is temporarily aria-disabled and duplicate activation is guarded.
5. The English header could clip at 320px with doubled text. The mobile header and wordmark can wrap while retaining every label and control.
6. Preview fields did not grow when their fonts or available widths changed after rendering. A reusable auto-growing textarea responds to content, container resizing and font loading, without losing the cursor or creating resize loops.
7. The mode selector now has explicit group semantics; the skip link lands on a focusable workshop. Loading wording distinguishes composition from analysis, and progress is announced outside the result region's `aria-busy` boundary.

## Result

After fixes: no horizontal overflow, overlapping controls, clipped controls, or vertically clipped preview fields in the covered layout cases; zero axe violations in the covered scans; all four keyboard flows pass. The existing 64px desktop mode-navigation sizing waiver is unchanged.

Functional checks additionally verify real model suggestions, exact reviewed-text analysis, original restoration, blank-line and delimiter preservation, caret mapping, incomplete verse completion, late-response protection, and manual fallback after suggestion failure. Repository checks: seven frontend tests, 103 backend tests, production frontend build, Ruff and diff checks.

The release check also confirms that the same 240-character budget, excluding vowel marks, applies to suggestions, checking and detection; the larger 720-character serialized limit accommodates reviewed vocalization without accepting a longer plain verse.
