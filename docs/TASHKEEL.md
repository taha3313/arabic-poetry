# Lightweight tashkeel · 2026-10-24

## Decision and the 512 MB requirement

Use **libtashkeel's 4,788,213-byte ONNX model** with a small Python/NumPy CPU
adapter. This is the upstream model and token/hint maps, not the Rust Python
binding. The weights, MIT license, commit and SHA-256 hashes are bundled under
`backend/app/assets/libtashkeel`; runtime never downloads models.

Runtime requires CPU ONNX Runtime and NumPy. No PyTorch, TensorFlow, CUDA,
Transformers, external LLM calls or additional model server. One lazily loaded
session, one intra-op thread, serialized inference, a bounded 128-text cache,
and guarded singleton initialization keep memory bounded. Docker explicitly
uses one Uvicorn worker and one BLAS/OMP thread.

The budget is **the whole backend's RAM**, not a 512 MB model-file allowance.
Render's current [Free compute plan](https://render.com/docs/compute-plans)
lists 512 MB RAM and 0.1 CPU. No Render deployment or account change was made.

## Fine-Tashkeel ONNX assessment

Yes, [Fine-Tashkeel has a ready ONNX export](https://huggingface.co/onnx-community/Fine-Tashkeel-ONNX).
The original [model](https://huggingface.co/basharalrfooh/Fine-Tashkeel) stores a
2,878,863,954-byte PyTorch checkpoint. ONNX removes the PyTorch runtime but not
the model's parameter footprint.

From the published export's file metadata:

| CPU Q4 component | Bytes |
| --- | ---: |
| `encoder_model_q4.onnx` | 348,019,761 |
| `decoder_model_merged_q4.onnx` | 107,221,431 |
| **Total** | **455,241,192** |

These are weight-file sizes, not measured RAM. Given the remaining web/runtime
and activation overhead, this is an unsafe default for a total 512 MB cap.
Fine-Tashkeel Q4 was **not downloaded or benchmarked**, so no exact peak-RAM or
quality claim is made for it. We did not install its PyTorch/Transformers stack.

## Candidate evidence

- **libtashkeel:** compact ready ONNX model; approximately 93 MiB peak RSS in the
  isolated adapter experiment. Its README says training was mainly MSA, so its
  suitability for poetry must be measured rather than assumed.
- **Mishkal 0.4.1:** evaluated outside application dependencies, cache disabled.
  Raw library output passed meter on 6/12 partial-source verses, in about
  0.76 seconds for the corpus, with approximately 111 MiB peak RSS. Some outputs
  overwrote supplied vowels or produced contradictory marks. This was a
  diagnostic baseline, not a controlled general-purpose DER ranking.
- **CATT:** source recommends encoder-decoder for accuracy and encoder-only for
  speed. Its pip metadata currently requires `onnxruntime-gpu`; that dependency
  was not added. Its 85.9 MB ED ONNX archive download was incomplete and stopped;
  CATT was not executed or scored. This does not mean CATT cannot run on CPU.
- **Token-classification Tashkeel:** reviewed its published benchmark/model link;
  the model metadata link was unavailable during inspection. Not executed.
- **KSAA Fine-Tashkeel benchmark:** a useful source, but its small speech-dictation
  dataset is not a poetry benchmark; rankings were not treated as poetry scores.

This is the best verified fit among the options actually tested under the
current lightweight requirement, not a claim of universal state of the art.

Sources:

- https://github.com/mush42/libtashkeel
- https://github.com/linuxscout/mishkal
- https://github.com/abjadai/catt
- https://github.com/abderrahmanskiredj/Tashkeel
- https://github.com/HasanBGit/KSAA2026-Fine-Tashkeel

## Analysis behavior

`POST /api/analyze` accepts `auto_tashkeel` (default **true**). The browser has
an “إكمال التشكيل تلقائيًا” checkbox.

1. Scan the supplied text first. Verses already matching the selected meter are
   preserved exactly, even if their requested rawi does not match.
2. For the other verses, use the supplied vowel marks as model hints. Preserve
   supplied vowels/sukun/shadda while allowing predicted missing shadda/vowels.
3. Do not change letters, words, punctuation, digits or whitespace. No search
   over vowels using meter scores, no invented case-ending substitutions.
4. Scan the completed text. The manuscript displays **the actual analyzed
   text**; the textarea and response's `tashkeel.original_verses` retain the input.
5. Disclose when completion changed the text. With the checkbox off, scan the
   original input without loading the model. Errors return controlled 503s.

Generated-poem validation remains against the model's supplied vocalized poem;
this feature is currently for the analysis endpoint, not an invisible rewrite
of generation benchmark results. The input limit stays 240 serialized
characters per hemistich; internal completed output allows up to 720 because
inserted vowel marks can increase length. The memory test caught and fixed an
initial output-bound error for long valid inputs.

## Al-Diwan real-browser results

Same six source-linked poems and five meters as `ALDIWAN-QA.md`. No LLM calls.

| Input | Completion off | Completion on |
| --- | ---: | ---: |
| Partially vocalized source excerpts | 2/12 meter matches | **10/12** |
| Completely unvocalized excerpts | 0/12 | **2/12** |

With completion on, both verses passed for Imru' al-Qais, the “على قدر أهل
العزم” excerpt, Shabbi, Abu Tammam and Antara. Both Wafer verses in “إذا غامرت”
still failed. All 12 source rawi checks matched. Six fully vocalized opening
controls still pass and are not rewritten. No claim of reliable bare-text
poetry reading is justified by these results.

The isolated model with hint preservation/merge reached 9/12 before integration;
keeping the already-valid original Antara verse avoids that model's regression,
bringing the integrated result to 10/12. This distinction is intentional.

18 real-form browser cases checked on/off switching, original input retention,
disclosure, displayed/analyzed text equality and scansion. No browser page
errors, no LLM requests, no horizontal overflow at 280/320/390/414/1280px.
Screenshots: `tashkeel-desktop.png`, `tashkeel-mobile.png`.
Raw results: `evals/tashkeel-browser.json` and candidate diagnostic JSON files.

## Hard-constrained memory test

Ran the **full ASGI application** with Uvicorn imported inside a Docker
container limited to **512 MiB RAM / 0.1 CPU**, networking disabled. Mounted the
same application and Python 3.12 native dependencies read-only. Workload:

- All six two-verse Al-Diwan excerpts through the actual `/api/analyze` route.
- Four concurrent requests of eight near-maximum-length verses each, with
  distinct inputs to force inference rather than cache-only replay.

Result: **exit 0, OOMKilled=false**, about **144.89 MiB peak process RSS**,
13.601 seconds for the workload after imports. The cgroup reported a
109,469,696-byte peak; cgroup accounting and process maximum RSS measure
memory differently, so both readings are retained. Either is well below the
cap; neither is a promise about arbitrary traffic or a live Render deployment.

Evidence: `evals/tashkeel-memory.json`. Temporary container was removed.
This tests the same dependency/application files, not a built production image;
production-image and live-platform checks remain part of future deployment.

## Verification and repeatability

- 38 backend tests pass; Ruff passes.
- TypeScript/Vite production build passes.
- The application wheel includes the ONNX model, maps and license.
- New tests cover preserved text/vowels, CPU provider, explicit opt-out, failure
  handling, original/analyzed output separation, cache bounds, concurrent calls,
  asset integrity, padding tokens and output growth beyond input character count.

```bash
cd backend
uv run pytest
# Same Python/native dependencies inside the 512 MiB Docker environment:
# run scripts/memory_smoke.py, as described above.
cd ../frontend
node scripts/tashkeel-smoke.mjs
```

The browser script needs both servers running and Playwright/Chromium available
as described in `VERIFICATION.md`. Analysis works without a Gemini key and does
not consume provider quota.

## Production-image follow-up

Deployment preparation built and checked the actual backend Docker image. The
same offline full-ASGI workload passed at **142.55 MiB peak process RSS** under
512 MiB / 0.1 CPU, no OOM. See `evals/deployment-container-memory.json` and
`DEPLOYMENT.md`. The prior mounted-dependency result remains historical evidence;
no live Render deployment has occurred.
