# Nenaugad — design language 2.0 «Сигнал» (Signal)

**Status:** chosen by the owner 2026-11-02; being applied in DS-002 (slice 1, the
foundation, implemented). Replaces the visual sections of
[Atlas 1.1](ATLAS_DESIGN_LANGUAGE.md) (§5–§9 and the colours of §10). Atlas's behaviour,
semantics, states, voice, accessibility and privacy rules stay in force.
**Grounds:** [the design research](../../../reports/Distinctive%20UI%20language%20for%20Nenaugad.md)
(why 1.3 read as an AI default, the job-board landscape, the three directions).

## 1. The idea

An instrument board that reads conditions out. Cyan is the act of verification: it marks
the words each conclusion rests on, so the brand colour and the evidence are the same thing.
Distinctiveness comes from components no template has (the honest unknown, the overlap
ribbon, the label), not from decoration.

## 2. Colour

Tokens live in `nenaugad.tokens.json` (2.0.0) → `src/app/tokens.css`. Components use the
semantic layer, never hex. `globals.css` contains no hex and no `rgb()`.

| Token | Hex | Role | Key pair (WCAG 2.x) |
|---|---|---|---|
| `bg.canvas` (paper) | #F1F8F9 | Canvas: cool, not cream | ink 16.78 |
| `bg.surface` | #FFFFFF | Panels, lists, fields | ink 18.04 |
| `bg.subtle` (mist) | #E3EEF0 | Nested areas | secondary 5.97 |
| `bg.inverse` (petrol) | #004250 | Deep bands: demo strip, «Об этой вакансии» | white 11.08 |
| `text.primary` (ink) | #04191F | Text, 2px outlines, rules, focus ring | — |
| `text.secondary` | #465C64 | Explanations | 6.57 on paper |
| `text.muted` | #4D6168 | Tertiary captions | 6.06 on paper |
| `text.link` | #005F75 | Links, always underlined | 6.75 on paper |
| `action.primary` (signal) | #22DEE6 | Header band, primary button fill (with ink outline), selected count, `<mark>` | ink 10.88 |
| `action.hover` / `pressed` | #14C9D1 / #0FB2BA | Button states | ink 8.85 / 6.96 |
| `action.subtle` | #D1F3F4 | Hover and selected rows | link 6.16 |
| status success text/bg/solid | #146D34 / #DAF8DF / #229944 | Pass | 5.65; glyph 3.68 |
| status review text/bg | #04191F / #FFFFFF | Unknown: drawn, not coloured | 18.04 |
| status danger text/bg/solid | #B7191C / #FFE6E5 / #DB2C2B | Fail, destructive | 5.59; glyph 4.76 |
| status neutral text/bg | #565E69 / #EAEDF1 | Technical | 5.59 |

Rules:
- Cyan is a **surface with ink on it**. Never white on cyan (1.66), never cyan text, never
  cyan on a dark ground (it becomes the AI "neon" tell). Cyan vs paper is 1.54, so a cyan
  control always carries a 2px ink outline.
- The brand hue (~200°) stays outside the status families (green 140–155°, amber 65–85°,
  red 20–35°). Brand colour never appears inside the Condition Map as a verdict.
- A unit test checks 16 text pairs against AA (`tests/unit/design-system.test.ts`).

## 3. The status grammar

Each outcome carries four cues, so it survives greyscale, colour blindness and forced colours.

| Outcome | Fill | Outline | Glyph | Word |
|---|---|---|---|---|
| Pass | solid green (or green tint on badges) | solid | ✓ | подходит / условия совпадают |
| Unknown | ink hatch (`--hatch`) beside white | **dashed ink** | ? | не указано в источнике / нужно уточнить |
| Fail | solid red (or red tint) | solid, notched top-right corner | ✕ | не подходит / есть несовместимость |
| Not applicable | none | none | — | не применяется |

Amber is retired as the colour of "unknown": it reads as "probably" and, on job boards, as a
paid row. Grey is not used for unknown either (it reads as disabled). Text never sits on the
hatch: the hatch is a strip or a cell, the words are on white.

## 4. Typography

Self-hosted OFL fonts in `public/fonts/` (Latin + Cyrillic subsets, licences beside them);
CSP `font-src 'self'`.

| Role | Face and setting |
|---|---|
| Display: page titles, wordmark, big numerals («6 ч») | Tektur 800, `font-stretch: 85%` |
| UI and body | Geologica 400/600; body 16px, dense lists 15px |
| Quotes (Ground) | Geologica, `font-style: oblique 8deg` |
| Times, UTC offsets, sources, dates | Martian Mono, `font-stretch: 87.5%` |

Not used as the primary face: Inter, Geist, Montserrat, Manrope, Unbounded (defaults by
usage rank). Section titles stay sans (Geologica 600). No tracked all-caps eyebrows.

## 5. Geometry, depth, ornament

- Radii: 2px for data objects (badges, cards, panels, lists), 6px for controls and dialogs;
  pill only for filters.
- 2px ink outlines on every interactive element; 1px rules between rows; a 4px ink rule
  under a label title.
- No shadows. Elevation comes from outline weight and the cyan fill.
- The 24-tick ruler (an hour scale) is the only ornament: under the header, in the overlap
  ribbon's scale, in empty states.
- Logo: two bars (your hours, the team's) and their overlap; the wordmark is live text.

## 6. Layout

- Results are rows in one ruled list, not floating cards.
- Feed cards (DS-002b, implemented): the five-cell condition strip (fixed order: страна ·
  часы · договор · оплата · навыки = GEO-01, TIME-01, CONTRACT-01, SAL-01, SKILL-01; an index,
  never a meter, never "4/5"). Per-option cells come from the hiring option that decides
  the status, never mixed across options. Below it, when the job publishes accepted UTC
  offsets, the **time-zone strip**: a −12…+14 axis with the accepted zones filled (petrol),
  the candidate's zone marked (ink caret), a long tick at UTC±0 and a text line.
  **Deviation from the mockups:** the mockups show an hours overlap («6 ч»); the imported
  data has no team hours (Himalayas gives offsets, Jobicy nothing), so drawing hours would
  invent data. The overlap micro-strip and ribbon wait for real hours.
- Job detail (DS-002c, implemented on the synthetic catalog's detail page — real snapshots
  link to their source and have no detail page yet): the condition map as a **label** — a
  ruled panel titled «Карта условий» (the established term, Atlas §11; the mockups said
  «Условия вакансии»), a mono source line, a 4px rule, the rows, and the footer «Это сверка
  с текстом объявления, а не гарантия найма или юридической допустимости». The Ground is a
  **receipt**: the quote on an ink rule, its provenance in an outlined mono stamp (on
  synthetic records it says so; «сверено с объявлением» is for real, checked postings).
  Absences are drawn: unpublished hours get an **empty ribbon** (a hatched, dashed bar),
  unknown countries an **empty receipt** (a hatched band and what to ask the employer).
- Still waiting for data: the overlap ribbon («Лента пересечения») needs team hours;
  `<mark>` on the decisive words needs evidence spans, not whole quotes.
- Home (DS-002d): the search and live rows; no floating example card, no feature strip.

## 7. Motion

One 240ms cyan sweep across the decisive words when a Ground opens; one 300ms fill of the
overlap band on first paint of a job. Nothing else moves; everything is static under
`prefers-reduced-motion`. Never celebrate a "pass" (no confetti, no mascot).

## 8. Never do

- Purple/indigo gradients, gradient text, mesh or aurora backgrounds, glassmorphism.
- Cream paper with a serif display or an italic accent word; terracotta.
- Floating hero card, three icon cards, 01/02/03 steps, stat rows, eyebrow chips, black
  pill CTAs.
- One radius and a soft shadow everywhere; cards in cards.
- Match percentages, gauges, A–G grades, "4/5", strips that fill up.
- Unknown shown grey, blank, amber or behind a paywall; colour-only status.
- Yellow or peach row highlights (read as paid listings).
- Dice imagery; «проверено», «одобрено», «гарантировано» on stamps.
- Deep fuchsia near #C800A1 (a registered colour mark in Russia); cyan on near-black.

## 9. Governance

A new colour, radius or face needs a token change and a note here. AI-assisted changes
drift back to Inter, cream and blue: check every visual change against §8.
