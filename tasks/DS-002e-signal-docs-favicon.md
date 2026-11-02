# DS-002e — Signal slice 5: the favicon and the documents that still describe 1.3

**Status: implemented 2026-11-02; owner acceptance of DS-002 pending.** Owner request: "Start DS-002e" after DS-002d
(`9fa8839`) on `feature/ds-002-signal`. The last slice before owner review of DS-002.

## Result and boundaries

- **Favicon:** `public/brand/favicon.svg` becomes the Signal mark (two ink bars and their
  white overlap on cyan), replacing the 1.3 blue mark. Same path, so `layout.tsx` and the
  e2e asset check are unchanged.
- **Active documents** say Signal 2.0 is the appearance and Atlas 1.1 keeps its behaviour
  rules: `README.md` (intro and the Design section: fonts are now self-hosted),
  `docs/solo/ATLAS_SOLO_PIPELINE.md` (§2 priority list, the "design is approved" rule),
  `docs/solo/TASK_TEMPLATE.md` (the CL editor check), and a superseding note in
  `docs/solo/context/ATLAS_COVER_LETTERS_SPEC.md` (its visual lines describe Atlas 1.1; its
  behaviour stands).
- **Archived bundle** `Reference/Nenaugad/`: an English "superseded for visuals" banner on
  `NENAUGAD_DESIGN_SYSTEM.md` and `START_HERE.md`; the bundle is not rewritten.

**Left as they are, on purpose:**
- `START_HERE.md` (the archived day-one record), `docs/history/`, and the dated design brief
  `docs/design/2026-09-27-matching-implementation-brief.md`: records of their time.
- `reports/context-sha256.json`: hashes of the context documents as received on day one
  (nothing enforces them; two of those documents now carry superseding notes).
- `public/brand/wordmark.png`: no longer used by the app, but the 1.3 brandbook describes
  it as the preserved original logo — deleting a brand master is the owner's call.

**Risk:** low: documents and one SVG.

## Changes

- `public/brand/favicon.svg`: the Signal mark (rendered and checked at 16, 32, 64 px).
- `README.md`: intro and Design section (self-hosted OFL fonts, the AA token test).
- `docs/solo/ATLAS_SOLO_PIPELINE.md`: §2 priority list, the "design is approved" rule, and
  the context file list (Signal doc and tokens added; Atlas 1.1 = behaviour; the original
  tokens marked historical).
- `docs/solo/TASK_TEMPLATE.md`: the CL editor check names the Signal style.
- `docs/solo/context/ATLAS_COVER_LETTERS_SPEC.md`: a "visuals superseded" note.
- `Reference/Nenaugad/NENAUGAD_DESIGN_SYSTEM.md`, `Reference/Nenaugad/START_HERE.md`: an
  English "superseded" banner each; the archived Russian text is untouched.
- `docs/solo/context/NENAUGAD_SIGNAL.md`: the status line lists all five slices.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 377/377, lint, typecheck, guardrails, tokens) |
| e2e design-system: brand assets, header lockup | 6/6 (favicon served, lockup) |
| `build`, full `test:e2e`, `test:db` | not re-run: no application code changed (documents and one SVG; the favicon path is the same) |
