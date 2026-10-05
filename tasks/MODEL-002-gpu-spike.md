# MODEL-002 — a local scoring spike on GPU (owner decision 2026-10-02)

**Status: planned.** Basis: the owner decision of 2026-10-02 after MODEL-001 —
on a CPU runtime, 1.5–1.7B models do not serve the rubric (0/6 valid JSON
without scaffolding; with prefill — Spearman −0.156), so the GPU spike is
split out into a separate task. Scoring stays closed until its report.

**Goal.** Measure whether a local **7–8B** model on an **RTX 5060 Laptop
(8 GB)** with a GPU runtime serves the scoring rubric — **with the same
matrix** as MODEL-001: the p-ru-ml profile, 8 pairs, the shipped rubric and
JSON prefill, validity, tok/s, memory, Spearman against the manual scores.

**Dependency decision (part of the owner decision «спайк на CUDA» [a CUDA
spike]).** The GPU runtime is the only new dependency of this task; the
concrete variant is chosen and pinned in the report:
1. **Node WebGPU** — if the Node 26 runtime provides WebGPU, transformers.js
   works with `device: "webgpu"` **without new npm dependencies** (check first);
2. **llama.cpp (prebuilt CUDA, Windows)** + a GGUF q4 model — a proven path,
   an external binary, run via CLI/a local server;
3. onnxruntime CUDA EP — outside the `onnxruntime-node` npm package; it would
   require a separate build/wiring, considered last.

**Candidate models (check the licenses when choosing):** Qwen2.5-7B-Instruct /
Qwen3-8B (Apache-2.0), Llama-3.1-8B (Llama Community License — only if the
owner approves separately). q4 ≈ 4–5 GB — fits into 8 GB VRAM; the artifact
goes to `models/` (gitignore) with revision pins and sha256, as in B1/MODEL-001.

**Plan.**
1. A WebGPU probe in Node (zero dependencies) → otherwise llama.cpp CUDA.
2. Download a 7–8B q4 candidate; pins and hashes — into the report (the fetch
   script extended in a reviewed form; see the MODEL-001 caveat about the
   static scanner).
3. Extend `scripts/eval-local-llm.ts` with device/transport (modeled on
   `--model=`), run the same matrix; compare with the CPU numbers of MODEL-001.
4. Report: speed, VRAM/RAM, quality (validity + Spearman), the conclusion
   "local scoring: yes/no" and what that means for the fate of the batch and
   scoring.

**Boundaries.** Nothing in `src/` changes until the report — the spike remains
a measurement. Scoring and letters are closed (AI-007). No provider is called.

**Checks at execution:** a live measurement of the model; `check`/`guardrails`
for any changed scripts; honest numbers, including a negative result if one
comes out.
