# MODEL-002 — a local scoring spike on GPU (owner decision 2026-10-02)

**Status: measured 2026-10-14; the owner's marks on the letters recorded the same day.** The owner approved
all four recommendations below on 2026-10-13 (llama.cpp CUDA 13.4 with the Vulkan fallback;
Qwen3-VL-8B-Instruct then Qwen3-8B; the go thresholds as written; the letter leg with the
prompt extraction).

**Result, up front.** On the GPU, format, speed and memory stop being obstacles: both 8B
models answer the shipped rubric with valid JSON 39/39 at about 3.5 s a pair and 5.4 GB of
VRAM. **Local scoring is still a no-go by the thresholds fixed before measuring:** both
score two keyword-trap jobs (a recruiter and an instructor role that use the candidate's
skill words) at 75–85, and Qwen3-8B's Spearman is 0.597 against 0.6. **The letter leg
passes its criteria:** Qwen3-VL-8B-Instruct's six letters all pass the shipped validator,
and the owner marked all six usable as drafts. The implementer's reading is recorded
beside the marks: every letter describes experience the profile does not state, three
name skills it does not list, and all are in English. Scoring and letters stay closed:
switching either on is a separate task.
Basis: the owner decision of 2026-10-02 after MODEL-001 — on a CPU runtime, 1.5–1.7B
models do not serve the rubric (0/6 valid JSON without scaffolding; with prefill —
Spearman −0.156), so the GPU spike is split out into a separate task. Scoring and letters
stay closed until its report (AI-007; the personal-data boundary of 2026-10-01).

**Goal.** Measure whether a local **7–8B** model on an **RTX 5060 Laptop (8 GB)** with a
GPU runtime serves the scoring rubric — with MODEL-001's matrix (profile p-ru-ml, the
shipped rubric, JSON prefill; validity, tok/s, memory, Spearman against the manual
grades) — and, if decision 4 adds it, whether it writes letters the shipped validator
passes. A measurement, not a product path: nothing is switched on by it.

## Facts measured for this plan (2026-10-13, read-only)

- **Node WebGPU (the plan's zero-dependency option 1): not available.** Node v26.7.0
  has `navigator` but no `navigator.gpu`, and no WebGPU flag.
- **GPU:** NVIDIA GeForce RTX 5060 Laptop, 8151 MiB, compute capability **12.0
  (Blackwell)**, driver 617.42. Blackwell needs CUDA 12.8 or later.
- **llama.cpp** (ggml-org/llama.cpp, MIT) publishes numbered builds as GitHub releases
  with sha256 digests. The newest (b11583, 2026-10-13) has for Windows x64:
  `llama-…-bin-win-cuda-13.4-x64.zip` 153 MB + `cudart-llama-bin-win-cuda-13.4-x64.zip`
  424 MB (the CUDA runtime DLLs; no CUDA toolkit install), and
  `llama-…-bin-win-vulkan-x64.zip` 32 MB (runs through the NVIDIA Vulkan driver, no
  CUDA runtime).
- **Candidate models** (official Qwen GGUF repositories, all Apache-2.0, Q4_K_M):

  | Model | Repository @ revision | File | Size |
  |---|---|---|---|
  | Qwen3-VL-8B-Instruct (2025-11; instruct, no thinking mode) | `Qwen/Qwen3-VL-8B-Instruct-GGUF` @ `f982a07559d4` | `Qwen3VL-8B-Instruct-Q4_K_M.gguf` (sha256 `67d1659b…`) | 5.03 GB |
  | Qwen3-8B (2025-05; hybrid thinking, `/no_think`) | `Qwen/Qwen3-8B-GGUF` @ `7c41481f57cb` | `Qwen3-8B-Q4_K_M.gguf` (sha256 `d98cdcbd…`) | 5.03 GB |
  | Qwen2.5-7B-Instruct (2024-09; MODEL-001's family) | `Qwen/Qwen2.5-7B-Instruct-GGUF` @ `bb5d59e06d95` | two parts (`dfce12e3…`, `539cf93f…`) | 4.68 GB |

  Text only: the VL model's vision projector (`mmproj-…`, 0.75–1.16 GB) is not
  downloaded. Weights ≈ 5.0 GB + context and buffers ≈ 1–1.5 GB at 4096 tokens: fits in 8
  GB with every layer on the GPU. Llama 3.1 and Gemma stay out (their licenses need a
  separate owner approval).
- **Data:** p-ru-ml has **39 graded pairs** in the golden set (grades 0/1/2/3: 5/26/5/3),
  not only MODEL-001's 8. Disk: 425 GB free; `models/` holds 4.1 GB.
- **The letter prompt** is built inline in `src/app/api/v1/cover-letters/[id]/generations/route.ts`
  and gives the model only the target roles, the country and a job excerpt: no confirmed
  experience, skills or CV text. Whatever model serves it, letters can only be generic; a
  letter grounded in the profile (CL 1.0's "2–3 confirmed grounds") is a separate task.

## Decisions for the owner

1. **Runtime: llama.cpp `llama-server`, prebuilt CUDA 13.4 for Windows** (recommended).
   An external binary, not an npm dependency: unpacked into `tools/llama.cpp/`
   (gitignored), started by hand on `127.0.0.1` only; the eval script talks to it over
   HTTP on loopback. **Download ≈ 577 MB** (153 + 424) from GitHub, the newest build at
   least 7 days old, pinned by its published sha256 and checked before unpacking.
   Fallback if CUDA fails on Blackwell: the Vulkan build (32 MB), same pinning.
   (onnxruntime's CUDA provider stays last: it is not in the `onnxruntime-node` package.)
2. **Models: Qwen3-VL-8B-Instruct, then Qwen3-8B** (recommended): **2 × 5.03 GB**, from
   Hugging Face at the revisions above, verified by sha256, into `models/` (gitignored).
   Qwen2.5-7B (4.68 GB) only if the first two disagree sharply.
3. **What "go" means, fixed before measuring** (recommended thresholds), on all 39 p-ru-ml
   pairs, under a condition the product could ship (the shipped rubric, or the rubric with
   llama.cpp's JSON-schema constraint):
   - valid JSON 39/39;
   - Spearman ≥ 0.6 against the manual grades;
   - no grade-0 posting (the design job, the recruiter keyword trap…) scored 50 or more;
   - median ≤ 15 s per pair.
   Anything short is a no-go for local scoring on this machine, reported as measured.
4. **Add a letter leg?** (recommended: yes, small). The same model and server; 3 synthetic
   golden-set profiles × 2 jobs; the shipped prompt and the shipped `validateLetter`;
   reported: validator pass rate, issue codes, length, language, tok/s. **You read the 6
   letters** and mark each usable as a draft or not (SP 1.0 §11: a human checks). It
   needs **one change in `src/`**: the prompt moves from the route into a pure
   `buildLetterPrompt` (`src/server/letters/prompt.ts`) that the route and the script both
   call, with a test that the route's prompt is unchanged. Go for letters: validator 5/6
   without repair, and you mark at least 4/6 usable.

## Plan (after approval)

1. `.gitignore` gets `tools/`. A reviewed fetch step pins and checks the llama.cpp zips
   and the GGUF files (sha256 and size, as `models-fetch-llm.ts` does), mindful of
   MODEL-001's static-scanner caveat (literal paths, no path built from an argument).
2. Probe: `llama-server --version`; load each model with every layer on the GPU (`-ngl
   99`, context 4096); record VRAM with `nvidia-smi` and the load time.
3. `scripts/eval-local-llm.ts`: a `--transport=llama-server` (a fixed loopback endpoint)
   beside the existing transformers.js path; greedy decoding with a fixed seed; the same
   conditions as MODEL-001 (shipped, strict, prefill) plus the JSON-schema constraint; first
   MODEL-001's 8 pairs for comparison, then all 39.
4. If decision 4 is yes: the prompt extraction with its test, then the letter leg.
5. Report in this file: speed, VRAM/RAM, quality (validity, Spearman, the grade-0 cases
   verbatim), the letters and your marks, against the thresholds; the conclusion "local
   scoring: yes/no", "local letters: yes/no", and what it means for the batch path,
   scoring and B9.

**Boundaries.** Scoring and letters stay closed whatever the result: switching them on is
a later task with its own review. Only synthetic golden-set profiles; no real CV; no
provider call; no spend. The server listens on 127.0.0.1 and is stopped after the run.
Apart from decision 4's prompt extraction, nothing in `src/` changes.

**Risk: normal** (a measurement with downloads, an external binary and scripts; no auth,
money or personal data). The prompt extraction is a refactor of a closed route, covered
by its test.

**Checks at execution:** the live measurement; `check`/`guardrails` for changed scripts;
`test:db` and the letter route's tests if the prompt moves; honest numbers, including a
negative result.

**Rollback:** delete `tools/llama.cpp/` (≈ 0.6 GB) and the downloaded `models/`
directories (≈ 5–10 GB); `git revert` removes the scripts (and the prompt extraction).

**Costs:** downloads only (≈ 5.6–10.7 GB); provider calls zero; coding-host spend not
visible.

## Result (2026-10-14)

### Runtime and artifacts

- llama.cpp **b11457** (2026-10-06, commit `5ad1c5da`), CUDA 13.4 build plus its CUDA
  runtime DLLs, unpacked into `tools/llama.cpp/b11457/cuda/`; `llama-server` on
  `127.0.0.1:8089`, every layer on the GPU (`-ngl 99`), context 4096, one slot, no web UI;
  stopped after the runs (port closed, VRAM back to 564 MiB). The CUDA build worked on
  Blackwell: the Vulkan fallback was not needed and not downloaded.
- Both models fetched at the pinned revisions and verified by sha256 and size
  (`npm run models:fetch-gpu`): 2 × 5.03 GB in `models/Qwen/`; tools 1.3 GB.
- **Repair cycle 1 (1 of 2):** the first model download was cut by the network after
  2.57 GB ("terminated", 25 minutes at about 1.7 MB/s; not a timeout, not a hash
  mismatch), and the script restarted from zero on every retry. Hypothesis: resuming the
  `.part` file with an HTTP Range request completes it, and the final hash still decides.
  `scripts/download-verified.ts` does that (tests with a local server that cuts the
  connection; a server that ignores the range; a wrong hash; a connection that keeps
  dropping). **Confirmed:** the download resumed from 2,572,663,196 bytes and verified;
  the second model downloaded in one go.

### Scoring (profile p-ru-ml, the shipped rubric, greedy decoding)

| Model | Pairs | Condition | Valid JSON | Spearman | Grade-0 scored 50+ | Median s/pair | tok/s |
|---|---|---|---|---|---|---|---|
| Qwen3-VL-8B-Instruct | 8 | shipped | 8/8 | 0.855 | j28 75 | 3.65 | 49.4 |
| | 8 | strict | 8/8 | 0.855 | j28 75 | 2.35 | 51.4 |
| | 8 | prefill | 8/8 | 0.855 | j28 75 | 3.2 | 47.9 |
| | **39** | **shipped** | **39/39** | **0.614** | **j28 75, j29 85** | **3.5** | 52.3 |
| | 39 | JSON schema | 39/39 | 0.614 | j28 75, j29 85 | 3.9 | 46.7 |
| Qwen3-8B (thinking off) | 8 | shipped | 8/8 | 0.900 | j28 80 | 3.2 | 46.8 |
| | 8 | strict | 8/8 | 0.855 | j28 80 | 2.1 | 54.0 |
| | 8 | prefill | 8/8 | 0.874 | j28 80 | 2.7 | 52.8 |
| | **39** | **shipped** | **39/39** | **0.597** | **j28 80, j29 85** | **3.3** | 47.0 |
| | 39 | JSON schema | 39/39 | 0.597 | j28 80, j29 85 | 3.5 | 44.0 |
| *MODEL-001, CPU, Qwen2.5-1.5B* | 8 | prefill | 8/8 | −0.156 | j18 85, j28 85 | ≈11 | 6.7 |

- **Memory:** 5.4 GB on the GPU with either model (505 → 5881 MiB; 564 → 5818 MiB);
  load 3–4 s. A 39-pair run takes about 2 minutes 10 seconds.
- **Against the go thresholds (39 pairs):** valid JSON 39/39 ✓ both; median ≤ 15 s ✓
  both; Spearman ≥ 0.6: 0.614 ✓ / 0.597 ✗; no grade-0 job at 50+: ✗ both. **No-go.**
- **The failure is specific.** `golden-j28` "Technical Recruiter (Python, SQL)" and
  `golden-j29` "Data Science Instructor" are the golden set's keyword traps: their text
  names Python, SQL and Machine Learning, but neither is an ML engineer or data scientist
  role. Both models score the skill overlap and ignore the role, as the rubric asks
  ("how well the candidate's confirmed skills and target roles match"). The design job
  (`golden-j18`) that the CPU model scored 85 is 10 / 0 here. The JSON-schema constraint
  changes nothing: the shipped rubric already gives valid JSON every time.

### Letters (3 synthetic profiles × their 2 best-graded jobs, the shipped prompt and validator)

| Model | Validator | Words | Language | s/letter | Claims a skill not in the profile | Invents experience |
|---|---|---|---|---|---|---|
| Qwen3-VL-8B-Instruct | 6/6 | 136–151 | all English | 4.1–4.5 | 3 of 6 (PyTorch, Hugging Face Transformers, GraphQL) | 6 of 6 |
| Qwen3-8B | 6/6 | 158–177 | all English | 4.6–5.1 | 4 of 6 (the same, and "product experimentation") | 6 of 6 |

The letters and a reading of each: [reports/MODEL-002-letters.md](../reports/MODEL-002-letters.md).
The prompt gives the model only the target roles, the country and a job excerpt, so the
model takes the job's requirements and writes them as the candidate's history ("My
professional experience has focused on building and maintaining scalable payment
platform services"). The validator checks numbers, years, work rights and relocation, not
claimed skills or experience, so it passes all 12. A Russian-language job and a
"Russian-first" profile still get English letters: the prompt names no language.

**The owner's marks (2026-10-14),** usable as a draft or not, decision 4's second
condition, for Qwen3-VL-8B-Instruct's six letters: **all six usable** ("1. ok … 6. ok").
With the validator at 6/6, the letter leg meets both conditions. Qwen3-8B's letters were
not marked (optional).

### Conclusions

1. **Local scoring: no-go as measured** — but not for MODEL-001's reasons: format, speed
   and memory are solved on this GPU. The remaining defect is the rubric's blindness to
   role fit. Scoring stays closed (AI-007); the batch path stays closed (AI-006).
2. **Local letters: pass on quality** — Qwen3-VL-8B-Instruct writes letters in about 5 s
   that the validator passes (6/6) and the owner marked usable as drafts (6/6). Known risk
   for any task that switches letters on: the shipped prompt gives the model no confirmed
   experience, so it describes some anyway (6/6), and three letters name skills the
   profile does not list, which the prompt itself forbids ("Do NOT invent … skills not
   mentioned"); the validator does not check either. Letters stay closed (the
   personal-data boundary until a local model serves them is now a wiring and review
   task, not a quality question). B9 (the repair loop) stays deferred: it needs a
   validator that can see those claims.
3. **Proposed next tasks** (separate, for the owner):
   a. A rubric that judges role fit before skill overlap, measured on the same 39 pairs
      and the other profiles with Qwen3-VL-8B-Instruct (the runtime is in place; a run is
      about 2 minutes).
   b. A grounded letter: the prompt gets only confirmed facts (CL 1.0's 2–3 grounds) and
      the candidate's language; the validator refuses a named skill or technology that is
      not in the profile.

### Limitations

One profile for scoring (39 pairs; Spearman on 39 pairs moves by several hundredths from
one or two scores); greedy decoding, one machine; the letter readings are the
implementer's, not the owner's. The model artifacts stay on disk (about 10 GB) for the
next measurement; nothing in `src/` loads them.

### Changed files

- `scripts/models-fetch-gpu.ts` (new), `scripts/download-verified.ts` (new),
  `package.json` (`models:fetch-gpu`), `.gitignore` (`tools/`).
- `scripts/eval-local-llm.ts`: `--transport=llama-server`, `--pairs=all`,
  `--json-schema`, `--task=letters`; the answer parser shared by both transports (the CPU
  path is otherwise unchanged).
- `src/server/letters/prompt.ts` (new) and the generation route, which now calls it (the
  prompt is word for word the same).
- Tests: `tests/unit/letter-prompt.test.ts`, `tests/unit/download-verified.test.ts`.
- `reports/MODEL-002-letters.md` (new); this file; `IMPLEMENTATION_STATUS.md`.

### Checks

`npm run check` exit 0 (349 unit tests); `npm run test:db` exit 0 (120); `npm run
test:coverage` exit 0 (469; 84.24 / 87.28 / 92.93 against 82 / 86 / 91, thresholds
unchanged); `npm run build` exit 0; `npm run test:e2e` exit 0 (123 of 123). The live
measurement as above. No provider call, no spend; downloads about 10.6 GB; coding-host
spend not visible.

**Rollback:** delete `tools/llama.cpp/` and `models/Qwen/`; `git revert` removes the
scripts, the prompt extraction and the tests.
