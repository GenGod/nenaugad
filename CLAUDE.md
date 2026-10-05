@AGENTS.md

# Claude Code notes

AGENTS.md (imported above, so it loads with every session) is the single shared
rulebook. This file adds only Claude Code mechanics and does not override it.

- Iterate with `npm run check:agent`: the same checks as `npm run check`, with
  passing tests left out of the output. Run the full `npm run check` once before
  the handoff report.
- Start each new task in a fresh context (`/clear`). `tasks/current.json` and the
  task file carry the state between sessions.
- `.ignore` keeps `Reference/` out of Grep results: archived source bundles whose
  live copies are under `docs/`. `Reference/Nenaugad/` stays searchable. Read a
  file there by path only when the task names it.
- Superpowers skills: the task file and its short plan replace `brainstorming`
  and `writing-plans`. Use `systematic-debugging` inside a repair cycle (record
  the hypothesis with `npm run task -- repair` first) and
  `verification-before-completion` before claiming that a check passed.

## Models and effort (owner decision 2026-10-05)

- The main session runs Opus. The delegation rule in AGENTS.md maps to these agents:
  `executor` (Sonnet) for well-specified edits, boilerplate and test runs; Explore
  for searches across many files; `reviewer` (Opus, fresh context) for the
  independent review of a high-risk diff. Other subagents default to Sonnet through
  `CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`.
- Effort follows the task's Risk: low → `medium`, normal → `high`, high → `xhigh`
  plus a `reviewer` pass before owner acceptance. `max` is only for a repair cycle
  that is stuck. If the session's effort does not match the task's Risk at the
  start, say so in one line, so the owner can switch with `/effort` before work
  begins.
