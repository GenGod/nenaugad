# B4-001 — NLI contradiction pre-check (brief card B4): model evaluation

**Status: done as an evaluation (evaluated), 2026-10-04 — a negative result:
the integration is NOT done, and this is a measured decision, not caution.** Basis:
brief card B4 §6 («NLI pre-check противоречий (опционально, решение владельца)»
["NLI pre-check of contradictions (optional, an owner decision)"]; research
part 2 A1). The card itself provides for both outcomes: a new model dependency
(an owner decision) and deferral to C2.

## What the card required

- the pairs «требование ↔ фрагмент профиля» ["requirement ↔ profile fragment"] → DeBERTa-mnli **locally**;
- contradiction → **a barrier in the explanation** (not in eligibility); neutral is NOT a contradiction;
- (V4) «требуется гражданство США» ["US citizenship required"] + a profile without it → contradiction in the explanation;
  «нужен Kubernetes» ["Kubernetes needed"] + "5 years of Docker" → neutral, not contradiction;
- (V2) the NLI result **never** changes the eligibility status.

## What was measured (a real model, locally, 2026-10-04)

Candidate: **MoritzLaurer/mDeBERTa-v3-base-mnli-xnli** — MIT, multilingual (including
ru), ONNX. The artifact was downloaded with a sha256 check (the same disciplinary
pattern as B1):
- revision `8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c`;
- `onnx/model_quantized.onnx` — 338 679 133 bytes, sha256
  `27c39e884c14b03cf46cfc5485971b6db70ff330220d93dfe729c63fde43af0e` — **VERIFIED**;
- `tokenizer.json` — 16 331 396 bytes, sha256
  `3aca3ce69a0a35aeb144a52c4f1d41c4246b8785f8f398315cc8fb6b24057810` — **VERIFIED**;
- machine: i5-13450HX, CPU; load ≈ 1.6 s, RSS ≈ 674 MB, one pair 11–21 ms (q8).

**Sanity check — the model works, the call is correct** (the standard format
`tokenizer(premise, text_pair=hypothesis)`, id2label {entailment, neutral,
contradiction}): «кошка на коврике / кошка не на коврике» ["the cat is on the mat /
the cat is not on the mat"] → contradiction 0.991; «играет на гитаре → играет на
инструменте» ["plays guitar → plays an instrument"] → entailment 0.871; «Эйфелева
башня в Париже / в Берлине» ["the Eiffel Tower in Paris / in Berlin"] → contradiction 0.826.

**Working pairs** (premise = the profile fragment, hypothesis = the requirement; q8):

| pair | entail | neutral | contra |
|---|---|---|---|
| V4-a «Требуется гражданство США» ["US citizenship required"] ↔ the profile (DE) | 0.104 | **0.817** | 0.079 |
| V4-a the same in English | 0.049 | **0.845** | 0.106 |
| V4-b "Kubernetes required" ↔ "5 years of Docker" | 0.041 | **0.845** | 0.115 |
| a hard conflict: «офис 5 дней» ["office 5 days"] ↔ «без обязательного присутствия» ["no mandatory presence"] | 0.008 | **0.961** | 0.032 |
| "10 years of Java" ↔ "Python, Docker" | 0.054 | 0.687 | 0.258 |
| «контрактор» ["contractor"] ↔ «полная занятость» ["full-time employment"] | 0.022 | **0.936** | 0.042 |
| RU language: «требуется свободный русский» ["fluent Russian required"] ↔ English/German | 0.016 | **0.954** | 0.029 |
| B2 German ↔ B1 German | 0.031 | **0.925** | 0.043 |
| "fluent in English" ↔ Languages: English | 0.051 | **0.921** | 0.028 |

The reverse order (premise = the requirement) — the better one for conflicts: the hard
presence conflict 0.392, V4-a 0.128, "job requires US citizenship" ↔ "candidate can work in
the US without a visa" 0.254 — but the last phrase is not derivable from our profile
facts (the profile has neither citizenship nor a visa).

## Conclusion: why the integration was not done

1. **V4-a of the card is not satisfied by the model**: "US citizenship required" + a
   profile without it gives neutral 0.817/0.845 with contradiction at 0.079/0.106.
   The prescription "absence → contradiction" is not confirmed.
2. **A threshold that would catch V4-a (~0.1) would start catching ABSENCE**: "Java" vs
   "Python" = 0.258, "Kubernetes" vs "Docker" = 0.115 — exactly the failure the
   research documents («тихие отрицания ненадёжны» ["silent negations are
   unreliable"]) and the card forbids.
3. **Even real conflicts are weak**: the hard contradiction "office 5 days" vs "no
   mandatory presence" — 0.032 in the working order (0.392 in the reverse), below
   any meaningful barrier. The layer would either never fire or would lie.
4. By the project's own rules **the absence of a fact in the profile is not proof of
   the opposite** («профиль — свидетельство подтверждённого, а не доказательство
   отсутствия» ["the profile is testimony to what is confirmed, not proof of
   absence"], `requirements.ts`): building a barrier on absence would mean inventing
   negative facts about the candidate.

**Decision: do not wire in the implementation; move the re-attempt to C2** (LLM
scoring covers the same task — the card explicitly allows this). The artifact pin is
preserved below; the artifact itself lives in `models/` (gitignored) — a re-measurement
will not require finding the model again. A different path (domain-specific NLI, another
pair format, the zero-shot template from the model card) — a new task with a new measurement.

## Checks

Product code was **not changed**: the measurement was done by temporary scripts in
`reports/local/` (gitignored: `fetch-nli.mjs`, `measure-nli.mjs`, `sanity-nli.mjs`).
On the same tree `npm run check` was re-run — green (see the task report);
`test:db`/`build`/`e2e` were not affected by the absence of changes in `src`/`tests` —
this is recorded honestly, not presented as run.

## Rollback

There is nothing to roll back in the product (no changes). The model artifact: delete
`models/MoritzLaurer/` if storing 339 MB is unwanted; the pin will remain in this task.
