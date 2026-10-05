# DOC-EN-001 — translate the project documentation into English (Claude Code handoff)

**Status: in progress, 2026-10-04.** Owner request: the whole documentation set must
be readable in English for a handoff to Claude Code.

## Scope

In scope — every project document that still contains Russian prose:
* root: `README.md`, `START_HERE.md`, `IMPLEMENTATION_STATUS.md` (`AGENTS.md` and
  `CLAUDE.md` are already English and stay untouched);
* `docs/**`: `ARCHITECTURE.md`, `DEPENDENCIES.md`, `OPEN_GAPS.md`, `SAFETY_GATES.md`,
  `TESTING.md`, `design/*.md`, `research/*.md`, `solo/**` (the solo pipeline, the
  task template, the technical spec and design-language context);
* `reports/**`: `DELIVERY.md`, `COVERAGE.md`; `src/server/ai/README.md`;
  `.github/pull_request_template.md`;
* `tasks/*.md` — all task records from S0-001 to C1-002 and the backlog.

Out of scope, deliberately:
* `Reference/**` — the designer's and the starter's original handoff material; it is
  source material, not this project's documentation;
* code and code comments (`src/`, `scripts/`, `tests/`) — the sources are written in
  English already except a handful of Russian comments in scripts, which are not
  documentation documents; reported as a possible follow-up;
* the product's Russian UI copy — the interface stays Russian by design.

## Method

Translation is executed in place (same paths, same file names) by parallel executor
subagents under one shared rule set: facts, numbers, dates, IDs, paths, commands,
links, table structures and heading levels are preserved exactly; code identifiers and
inline code stay untranslated; owner-decision quotes stay verbatim (Russian + a
bracketed English rendering); Russian product strings quoted in backticks stay as-is.
Nothing is added, removed or "fixed" — a mistake noticed in the text is translated
faithfully, not corrected here.

## Verification (mechanical, main session)

* `grep -P "[А-Яа-яЁё]"` per file: every remaining hit must be a verbatim quote, a
  product string or a proper name — listed with a reason;
* heading counts (`grep -c '^#'`) unchanged per file against `git show HEAD:<file>`;
* `git status` shows exactly the in-scope files;
* `npm run check` and `npm run guardrails` stay green (the guardrails `required` list
  checks file PATHS, not content; nothing in `tests/` or `scripts/` parses doc text —
  verified before starting).

## Rollback

`git checkout -- <path>` per file (docs only; no code, schema or data touched).

## Result (2026-10-04)

**Status: done (implemented).** 73 tracked markdown files (~9,500 lines of Russian
prose) were translated in place by 11 parallel subagents under one shared rule set.
The four files that were already English (`AGENTS.md`, `CLAUDE.md`,
`docs/EMBEDDING_PLAYBOOK.md`, `docs/PROMPT_EXECUTOR.md`) and `Reference/**` were
left untouched.

**Mechanical verification (main session, independent of the agents' own reports):**

* heading counts vs `git show HEAD:` — 0 mismatches across every file;
* markdown link-target sets — the only two deltas are this session's own
  pre-translation edits (`docs/OPEN_GAPS.md` lost the C1-001 link when its line was
  rewritten, `IMPLEMENTATION_STATUS.md` gained the C1-002 link); no link was lost
  by translation;
* remaining Cyrillic: 401 lines carry it across the set, and a document-level scan
  shows only 17 lines carry Cyrillic OUTSIDE «quotes», backticks and bracketed
  renderings — every one is a legitimate retention: brief item labels `(а)–(д)`,
  the document-list identifier `SP/ТЗ/Atlas/CL`, one preserved JSON key
  (`счётчик_cycles`), the Russian dictionary aliases and worklist tokens that are
  measurement data (`машинное обучение …`, `инженер(3), обучение(2) …`) and the
  design-language product sample line;
* `npm run check` (273/273 + lint + typecheck) and `npm run guardrails` stay green.
  Nothing in `tests/` or `scripts/` parses doc text (verified before starting;
  guardrails checks the required doc PATHS by existence only).

**Method note:** owner-decision quotes and licence quotes stay verbatim (Russian +
a bracketed English rendering); Russian product/UI strings cited in docs stay
Russian unchanged because they are the product's own copy; identifiers, commands,
paths, numbers, table values and links are byte-identical. Subagent usage is
visible in this session (≈24.2M subagent tokens across the 11 translators); the
monetary cost of that usage remains unknown.

**Not done, possible follow-ups:** `Reference/**` (the designer's and starter's
source material) intentionally excluded; a handful of Russian comments inside
`scripts/*.ts` are not documentation documents and were left as-is.

**Rollback:** `git checkout -- <path>` per file; nothing outside docs and task
files changed.
