# EDEC-002 — follow-ups on decision batch No. 4 (owner decisions 2026-10-02)

**Result:** five owner decisions recorded and executed; two next tasks registered.

## Decisions and what was done

1. **Local scoring → a CUDA spike.** Registered
   [MODEL-002](MODEL-002-gpu-spike.md): a measurement on the RTX 5060 (8 GB) with
   a 7–8B model using the same matrix as MODEL-001; the GPU runtime is the only
   new dependency (the options: Node WebGPU without dependencies → llama.cpp CUDA
   → onnxruntime CUDA), the choice is fixed in the task report.
2. **E.5 (the filters «не показывать компанию X» ["do not show company X"]) →
   leave as is.** Hiding a job + the weighted demotion of the neighborhood
   (A6-002) already work; a revisit when data accumulates.
3. **E.6 (ESCO) → the conditions were read verbatim; the decision — to wire in the
   skills part.** Source: the official ESCO Handbook (PDF), §5 "Legal conditions
   applying to the ESCO service" + the copyright notice; extracted 2026-10-02 with
   the `src/server/cv/pdf.ts` primitives in a one-off script (no changes in the
   repository; the CV parser left with its 30-page limit). Quotes:
   - «© European Union, 2019. Reuse is authorised provided the source is
     acknowledged. The reuse policy of European Commission documents is regulated
     by Decision 2011/833/EU»;
   - «When using ESCO, end users need to acknowledge its use by publishing the
     statement below: "This service uses the ESCO classification of the European
     Commission."»;
   - «Any modified or adapted version of ESCO must be clearly indicated as such.»;
   - the occupations part: ISCO-08, «© International Labour Organization 2012 …
     can be adapted and reproduced with permission» — outside this task;
   - the Commission's general policy (commission.europa.eu/legal-notice_en):
     CC BY 4.0, attribution + indicating changes.
   Registered [ESCO-001](ESCO-001-import-skills.md).
4. **E.7 (email) → stays in-app.** `send_email` denied in all matrices; the email
   channel — a separate task later.
5. **A minor interface edit → the buttons removed, the badges marked.** A reason,
   not taste: scoring is closed by the personal data boundary (AI-007) and by the
   MODEL-001 measurement, so both AI-analysis buttons always answered 503.
   Changed: `src/components/relevance-buttons.tsx` — `RelevanceButton` and
   `BatchAnalyzeButton` deleted (dead handlers), `ScoreBadge` marked
   «AI-оценка (справочно): N/100» ["AI judgment (for reference): N/100"];
   `src/app/matched/page.tsx` — instead of the line with the button, the honest
   note «новые не считаются — скоринг закрыт до локальной модели» ["new ones are
   not scored — scoring is closed until a local model"], the badge renders only
   when a cached score exists. The guarded route `/api/v1/relevance` untouched —
   it remains the connection point for the local model.

## Checks (2026-10-02)

`npm run check` → exit 0 (**241/241**, biome, tsc clean); `npm run build` → exit 0;
`npm run test:e2e` → **96 passed** (the matching page on the fixture backend does
not render the tabs — the baselines untouched); `npm run check:offline` → exit 0.
The provider was not called; the network — reading the public ESCO pages/PDF and
the Commission legal notice.

**Limitations, stated honestly:** the interface edit itself is covered by types,
build and the e2e baselines, but not by a click e2e — on the fixture backend
matching is honestly empty (the same caveat as in A6-001); the visual check of the
page is done by the owner.

**Rollback:** `git revert` of the commit — the buttons and the former labels
return; the route and the score cache were not changed the whole time.
