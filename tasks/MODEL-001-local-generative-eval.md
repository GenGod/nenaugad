# MODEL-001 — local generative model evaluation (owner decision No. 4, item 2)

**Result, honestly and up front:** on this machine, with the already installed CPU
runtime, a local generative model of size 1.5–1.7B **cannot serve the shipped
scoring rubric**. Both candidates without special scaffolding "narrate" instead of
answering in JSON (0 valid out of 6 runs), and with scaffolding that pre-fills the
JSON the syntax appears, but the quality is unfit: Spearman(scores vs manual
judgments) = **−0.156** over 8 pairs, including 85 points for an irrelevant design
job and 85 points for a recruiter keyword trap. Scoring stays closed; below — the
numbers and the options.

## Hardware (measured 2026-10-02, this machine)

- CPU: Intel i5-13450HX, 16 threads; RAM 31.6 GB (12.7 GB free at measurement time).
- GPU: **NVIDIA RTX 5060 Laptop, 8 GB VRAM** — the installed runtime does not
  use it: `onnxruntime-node` (the package inside `@huggingface/transformers`) ships
  CPU providers only. CUDA/DirectML is a new dependency, that is, a separate
  owner decision, not an implementer optimization.

## Candidates and artifacts

| Candidate | License | Quant | File | sha256 (head) |
|---|---|---|---|---|
| `onnx-community/Qwen3-1.7B-ONNX` @ `cc6a06a2` | Apache-2.0 (Qwen/Qwen3-1.7B) | q8 | `onnx/model_quantized.onnx` 1 742 387 852 B | `202ed819…feb427` |
| `onnx-community/Qwen2.5-1.5B-Instruct` @ `6287331f` | Apache-2.0 (Qwen/Qwen2.5-1.5B-Instruct) | q8 | `onnx/model_quantized.onnx` 1 578 954 293 B | `ee836437…650787` |

Both artifacts were downloaded at pinned revisions and **verified by sha256 at
download time** (Qwen3 — via the committed `scripts/models-fetch-llm.ts`; Qwen2.5 —
via an inline command with the same checks: hashes and file sizes, including
`tokenizer.json` `a8506e71…`, `config.json` `215eb99c…`,
`tokenizer_config.json` `7e88129d…`, `generation_config.json` `f7e7ce45…`,
`vocab.json` `ca10d7e9…`, `merges.txt` `8831e4f1…`). They live in `models/`
(gitignored); `models/` now totals 3.7 GB. Generalizing the fetch script to the two
candidates is blocked by the static scanner (a false "path traversal" on the
dynamic directory selection); writing it anew is a separate reviewed step at
adoption time; the Qwen2.5 pins are recorded here.

**Runtime:** `@huggingface/transformers` 4.3.0 + `onnxruntime-node` 1.30.0 —
already installed (B1), no new dependencies were added. Loading is local,
`allowRemoteModels=false`, network only for downloading the artifact.

## Measurement matrix (profile p-ru-ml, 8 judgment pairs from the golden set)

| Candidate | Condition | Valid JSON | tok/s | Seconds per pair | Notes |
|---|---|---|---|---|---|
| Qwen3-1.7B q8 | shipped rubric, 260–400 tokens | **0/2** | 5.3–5.4 | 48–76 (cut off by the limit) | reasons in text, `/no_think` and an empty think block ignored |
| Qwen3-1.7B q8 | + "JSON only", 400 | **0/1** | 5.3 | 76 (cut off) | the same picture |
| Qwen3-1.7B q8 | JSON pre-fill, 150 | 1/1 | 5.3 | 28 | valid; the explanation truncated by the limit |
| Qwen2.5-1.5B q8 | shipped rubric, 400 | **0/3** | 7.0–7.4 | 11–57 | 2 cut off mid-narrative, 1 short invalid |
| Qwen2.5-1.5B q8 | JSON pre-fill, 200 | **8/8** | 6.7 | 4.7–13.2 (mean ≈11) | **Spearman −0.156**; some answers with foreign field names; one is garbage parsed as score 0 |

Memory: RSS after load 2.0–2.2 GB, peak 3.2–4.0 GB per model — both fit.

**Verbatim quality examples** (pre-fill, Qwen2.5): job
`golden-j18` (product design, manual judgment **0** for the ML profile) → **85** with
the invented "matched_skills: Product Design, User Experience, Wireframing" —
the job's terms passed off as the candidate's skills; `golden-j28` (a recruiter
keyword trap, judgment **0**) → **85**; `golden-j25` (judgment 2) → 100.

## Conclusion and recommendation

1. **Scoring stays closed** (AI-007 stands) — this is not "let's wait until we
   switch it on" but a measured fact: 1.5–1.7B q8 on this machine's CPU cannot
   serve the rubric, neither on format stability nor on ranking quality.
2. If local scoring is needed — the next step requires a **new owner decision
   on the runtime**: a CUDA provider for onnxruntime (or llama.cpp) on the
   RTX 5060 (8 GB) + a 7–8B model in a 4-bit quant, then a re-measurement with
   this same matrix (the script and the pairs are already ready). The "10–30x
   faster" expectation rests on the hardware class, not on a measurement — it is
   the hypothesis of the next spike.
3. The "cloud" option remains rejected: personal data does not leave the
   contour (the decision of 2026-10-01), and the number above is an argument
   for, not against.

## Limitations, stated honestly

- The sample is small: one profile, 8 pairs; the "shipped" and "strict" runs are
  1–3 pairs each. This is the first honest cut, not a benchmark of models.
- JSON pre-fill is a measured **scaffolding**, not a property of the shipped rubric;
  the scaffolding saves the syntax, not the quality.
- The speed is this machine's CPU; the GPU is not engaged (see above).
- Quality is judged by two numbers: the valid-JSON share and Spearman; the manual
  judgments of the set are a human judgment (A1), and on 8 pairs ±0.1 of
  correlation means nothing. The direction of the effect (≈0/negative) is
  robust to that error.

## Checks (2026-10-02)

`npm run check` → exit 0 (**241/241**, biome, tsc clean — the new scripts
are included); `npm run guardrails` → pass; `npm run eval:local-llm` — the runs
above (live models, no cache); `models:fetch-llm` for Qwen3 → all files verified.
Network: only artifact downloads from HF (pinned revisions) — following the B1
pattern. Costs: coding-host — `unknown`; provider calls — zero (everything local).

**Rollback:** delete `models/onnx-community/Qwen3-1.7B-ONNX` and
`models/onnx-community/Qwen2.5-1.5B-Instruct` (≈3.3 GB); `git revert` of the commit
removes the scripts. Nothing in `src/` reads these artifacts.
