# S4-002 — the letter validator, needs_input, the evidence panel

**Result:** AI letter generation passes a deterministic check (forbidden
phrases, invented percentages/years, length) and is either admitted as
`generated_checked` or returns `needs_input` with concrete questions. The
user sees the «На чём основано» panel next to the letter.

**Not included:** a repair loop (one limited repeat), general mode (a letter
without a job), semantic verification of claims against evidence (a separate
model/annotation is needed), the CL4 accessibility audit.

**Context:** CL 1.0 §7–12; AI-001/002 (the gateway is already in place); S4-001.

## Acceptance
1. Validator (`src/server/letters/validator.ts`): deterministic checks without
   an LLM — forbidden phrases (§7), percentages not from the input, years of
   experience not from the profile, a length of 80–350 words, the absence of
   key elements (a greeting, the role, a closing).
2. Integration: the generation route, after the AI call, runs the validator;
   a failure → a revision with origin=`needs_input` and a list of questions;
   a success → origin=`generated_checked`.
3. The «На чём основано» panel: the letter page shows the profile fields
   (roles, country) and the job fields (title, company, geography) used in
   the prompt.
4. UI: if origin=`needs_input`, the editor shows the questions and a
   «Заполнить профиль» button instead of empty text.
5. Tests: unit — the validator for all the failure types; integration —
   generation with a mock transport returning text with a forbidden phrase →
   needs_input; e2e unchanged (AI is invisible on the fixture backend).

**Risk:** ordinary. **Rollback:** the validator can be disabled by a flag.
