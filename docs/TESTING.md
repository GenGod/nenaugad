# What to check and how to name the result

| Command | What it checks | What it does not prove |
|---|---|---|
| `npm run check:offline` | Node unit, tokens, limited source tripwires | Next/React build, SQL, real-CV privacy |
| `npm run lint` | Biome rules | the app's runtime and security |
| `npm run typecheck` | All types with real npm dependencies | business meaning and runtime |
| `npm run build` | Next production compilation | the right and readiness for a public launch |
| `npm run test:db` | An isolated real PostgreSQL | RLS/auth of future personal entities |
| `npm run test:e2e` | A real local Next + Chromium at 3 widths | full accessibility/all browsers |
| A future live benchmark | Real usage receipts + independent labelling | unlimited safety and universal accuracy |

SP-T03/06/07 have small starting checks; this is not full coverage of the requirements
of the whole Nenaugad. The SP cases ownership, budgeting, deletion, restore, DST and letters remain
in the scope of later stages and must pass BEFORE the features are enabled.

Fixtures with no office/evidence are test data, not proof of parser quality.
For a real source, check the full allowed text and the conflict at the end.
Small tests cannot be used to claim 98–99.9% accuracy.

## After installation
Run all the commands, save the actual exit codes/versions in reports/local
(do not commit large browser traces with potential personal data).
Into a public report — the minimum of safe metadata. Local tests — synthetic only.

## A separate non-automated check
Keyboard, zoom/reflow, VoiceOver/NVDA, long RU/EN strings, DB failure, preservation of
the search state. In S0 the browser actions are simple and GET-only.
