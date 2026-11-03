# B65-001 — close the residual gaps of the Remote First Jobs remote rule

**Status: implemented, re-mapped and tested locally 2026-11-02; committed in `b7d1e82`
and merged into main 2026-11-03 at the owner's word, the 5 false hides accepted by the owner; pushed 2026-11-03, CI green on the merge.** Started
from the S1-006 follow-up: the final
independent review of S1-006's cycle 2 named phrasings that still reach the main catalog
with a remote label or an English remote phrase. The repair limit of S1-006 was reached,
so they were recorded as residual risk ("Final review of cycle 2" in
[S1-006](S1-006-remote-first-jobs-source.md)); this task closes them.

## Problem

Remote First Jobs mixes hybrid and on-site jobs with remote ones. By owner decision
(S1-006, 2026-11-02) a posting reaches the main catalog only when its own words say remote
and no office vocabulary appears. With a remote label or an English remote phrase, these
still reach it:

1. office words in another language or inside a longer word ("Hybrides Arbeiten … vor
   Ort", "au bureau", "presencial", "Hybridmodell");
2. workplace nouns other than office/HQ ("at our Paris studio", "on our Austin campus",
   "our Austin facility weekly", "our Denver site three days a week", "the lab twice a
   week", "WFH 2 days a week", "field-based");
3. an arrangement written into the title after the label ("Engineer (Remote, 2 days/wk in
   Austin)", "Engineer | Remote | Austin, TX (2x/week)");
4. negations other than "not … remote" ("No remote position available", "Remote: No").

The first live import stored 498 postings; 102 reach the catalog, and a hand check found
no office arrangement among them, so this is hardening, not a live defect. Required travel
(the review's fifth item) is handled by B64-001 and stays out of this task.

## Acceptance (fixed before the code)

1. Every phrasing above is a row of the unit table (`tests/unit/remote-first-jobs.test.ts`)
   with a remote label or an English remote phrase, and lands in needs-review or excluded.
   Variants beyond the literal examples (German, French, Spanish/Portuguese, Italian,
   Dutch, Polish office words; more workplace nouns; frequencies in the title; more
   negations) are rows too.
2. Every existing row keeps its outcome; the confirmed rows still confirm.
3. Errors only run toward hiding: the change only adds patterns, and on the stored
   postings no posting moves into the main catalog or from excluded to needs-review.
   Explicit negations are office statements (excluded); everything else is office
   vocabulary (needs-review).
4. Required travel stays with B64: "travel to our Connecticut facility" is not made an
   office word (a weekly visit is).
5. Measured on the 498 stored Remote First Jobs postings (main / needs-review / excluded,
   before and after); every posting that leaves the main catalog is read by hand and
   listed here with the words that moved it.
6. The stored postings are re-mapped with the guarded one-off pattern of
   `backups/remap-2026-11-02/`: dry run, `--apply --expect=<n>`, a backup without posting
   text, rollback proven on the real rows, a re-import reads `seen`; nothing outside the
   workplace, its evidence item and `conflicts` changes.
7. `npm run check` and `npm run test:coverage` green; a fresh-context `reviewer` pass.

## Plan

1. Export the rule's workplace function (no behaviour change) and prove that it rebuilds
   all 498 stored workplaces byte-identically, so the re-map reads the rule, not a copy.
2. Probe rows first (they fail), then the patterns in `remote-first-jobs-fixture.ts`.
3. Measure before/after on the stored postings; read the leavers.
4. One-off re-map in the gitignored `backups/` folder; rollback proof; apply again.
5. Checks, coverage, reviewer.

**Risk: high** (catalog visibility of a source's postings under the remote-only
invariant). Effort `xhigh`; at most two repair cycles (`npm run task -- repair`); a
`reviewer` pass before owner acceptance.
**Rollback:** revert the change and run the re-map's `rollback.mjs`.
**Data:** stored public job postings; no personal data; nothing leaves the machine.
**Spend:** none.

**Not included:** required travel (B64-001); a model-based check; the other two sources
(Himalayas and Jobicy carry the source's own remote flag, not this rule).

## Result (2026-11-02)

**Implemented, re-mapped on the local database and tested locally; reviewed twice
(fresh-context `reviewer`); both repair cycles used (2/2, the project's limit); committed
2026-11-03 and merged into main; the owner accepted the 5 false hides 2026-11-03.** The cycle-2 diff was checked by both reviews'
probes and an old-against-new comparison, not by a third review.

### First pass (cycle 0)

Patterns appended after the existing ones (so stored quotes keep their words): explicit
negations as office statements; office words in seven more languages and inside longer
words; workplaces other than office/HQ with a preposition and an owner ("at our Paris
studio"); "N days a week", "twice a week", fixed weekdays; frequencies in the title;
temporariness read with or without a confirmation. All the review's phrasings and about
100 variants became table rows.

**Review (fresh-context `reviewer`, 2026-11-02).** The invariant held: on 2,952 inputs no
posting moved toward showing. But many phrasings in the four classes still reached the
catalog: titles with a qualifier the prose patterns did not fit ("(Remote, 2 days in
Austin)", "(Remote, Austin campus)", "(Remote, Austin Tue/Thu)"); travel more often than
weekly ("travel to our Reno warehouse daily"); exemptions that also covered real places
("the main branch in downtown Austin", "our corporate site"); compounds with a prefix
("Hauptbüro", "hoofdkantoor", "huvudkontor"); German "an 2 Tagen"; more office nouns
(Standort, Zentrale, siège, sede, instalaciones, siedziba; store, call centre, client sites,
"in the field", co-located); presence at a named place ("every other week in Austin",
"Mon-Wed in Austin", "fly to Austin biweekly"); about 30 negations ("Remote work is
unavailable", "Remote—no.", "We are not hiring remote engineers", "No telework",
"Homeoffice ist nicht möglich", "Brak pracy zdalnej"); invisible characters ("hy<U+200B>brid",
"on<U+2060>site"). Medium: one pattern took quadratic time (about 3 s on 99,000 characters);
the stored rows lagged the last rule edit by one row; the rollback trusted the version
number alone and checked the table only after committing.

### Repair cycle 1 (hypothesis recorded with `npm run task -- repair`)

Root cause: the rule listed phrasings instead of reading structures. 101 review probes
reproduced, then:

- **Titles: a whitelist, not a list.** What a title attaches to its remote label (the
  label's own bracket and everything after it) must be a country, a region or US state, a
  time zone, a contract type or seniority, travel (B64's), a full working week ("Mon-Fri"),
  a gender marker or a requisition number. Anything else blocks the confirmation. Anywhere
  in the title, a count of days or weeks, a weekday (not Mon–Fri) or a frequency word does
  too. The synthetic contract fixture's title became "Platform Engineer - synthetic
  fixture (Remote)" (the old "(Remote, synthetic fixture)" now waits for review).
- **Negations: a negator near a remote word, both orders.** A negator (no, not, never,
  cannot, without, nicht, kein, pas de, sin, niente, geen, brak, …) within four words of a
  closed list ("hiring", "option", "to", "work", …) before a remote word (remote, remotely,
  telework, telecommuting, WFH, Homeoffice, télétravail, teletrabajo, remoto, smart
  working, thuiswerken, praca zdalna, …), or a remote word followed by such words and "not
  / never / nicht / pas", "unavailable", "impossible", "out of the question", "N/A",
  "false", "need not apply", or a bare "no" that ends the clause ("Remote—no."). Not "no
  travel", "not just", "not for everyone", "never worked remotely before?", or a "Not
  available" of another field.
- **Presence:** workplace nouns gained store (not app stores), the call/distribution/…
  centres, a bank's main branch, "our corporate site"; owner-less client sites; "in the
  field", co-located, in-store; "at/from/out of our Austin location" (not "their home
  location"); frequencies, weekday ranges and "N out of 5 days" next to a capitalised place
  name ("every other week in Austin", "fly to Austin biweekly"), never a language, a day, a
  month or a tool ("daily in English", "weekly in Slack", "Monday to Friday"); travel to a
  workplace counts when daily, on weekdays, most days or weekly.
- **Words:** compounds with any prefix (Hauptbüro, Großraumbüro, hoofdkantoor,
  huvudkontor, biurowa); "an 2 Tagen"; Standort (after am/im/an unserem), Zentrale,
  Hauptsitz, siège, en agence, notre site, présence, sede, instalaciones, siedziba.
- **Normalised copy:** tiers 1 and 2 also read the text with NFKC compatibility folding and
  zero-width characters removed; tier 3 never does, so this can only hide.
- **Linear time:** owner and modifier tokens are bounded (40 characters); 99,000 characters
  of any repeated unit now take about 20–40 ms (was about 3 s); the 498 stored postings
  take 0.8 s in all.
- **Re-map guard:** the apply records the digest of each row it wrote (`rows-after.json`);
  the rollback restores a row only while it still has exactly that digest (an import that
  touched it, even without a new version, is refused) and checks the whole table against
  the start state inside its transaction, committing nothing on a difference. A dry run
  writes `plan.json`, never the applied record.
- **Table:** every review probe is a row (101), with controls that must stay in the
  catalog (Monday to Friday, "No Meeting Fridays", "Fully remote, no travel", "Never worked
  remotely before?", "(Remote - Canada)", "| EST Hours | Remote", "(Remote, UTC+1 to
  UTC+3)", "(Remote/Travel)", "Every Weekend (Sat/Sun)", …). The table reports every
  mismatch at once. One expectation was stricter than written: "This role is hy<U+200B>brid."
  is the office statement "role is hybrid" once the invisible character is gone, so it is
  excluded, not needs-review.

### Re-review (fresh-context `reviewer`, cycle 1)

The invariant held (409,600 old-against-new title × text pairs, none toward showing;
required-travel postings stay in the catalog). Found: **H1** the title check ran only when
"remote" had the label's exact shape ("Engineer - Remote (Austin campus)", "(Remote; Austin
campus)", "Remote US, Austin studio" passed with a remote phrase in the text); **H2** more
negations ("ineligible for remote work", "Remote work is prohibited", "No possibility of
remote work", "Remote: 0%", "El teletrabajo no es posible", "Thuiswerken is niet mogelijk");
**H3** more presence ("five days a week", "on weekdays" — claimed but not read, "physically
present", "several days a week", "once a fortnight", "our Austin center/shop/building/
workplace/base", "the jobsite", "headquarter"); **M1** quadratic time in title parsing (9.8 s
for a 99,000-character title — the "linear" claim was false for titles); **M2** the stored
rows were not yet re-mapped (the apply was held until the rule was final); **M3** common
remote wording now excluded ("No remote experience required", "Remote? No question about
it", "Remote work is not new to us", "There is no remote stipend") or hidden ("code daily in
Python", "report weekly to Product", "local to your time zone", "(Remote, Worldwide)" — a
bug); **M4** office words in the listed languages (Niederlassung, filiale, sucursal,
oddział, hoofdkwartier); low: title quotes not verbatim, lookalike letters.

### Repair cycle 2 (hypothesis recorded; the last one allowed)

- **Titles:** every standalone "remote" not at the start is read (not "remote-first/
  -friendly"); what stands around it must pass the whitelist, now also with words that only
  describe the remote work ("Remote Opportunity"), territories (Martinique, Réunion, Monaco,
  Puerto Rico…), Canadian provinces, Australian states, "in <Place>", place words one by one
  ("US East Coast"), languages, shifts, pay, "Fridays Off", "No Travel". After a leading
  "Remote" the job's name follows in as many parts as it takes ("Remote Document Review -
  Verdict Classification Attorney"), so a leading one is not read (see "Not closed").
  Separators gained ";", ":", "*", " + ". Titles over 300 characters are not parsed and wait
  for review; affixes are stripped one anchored pass at a time: a 99,000-character title
  now takes about 15 ms. The quote is the title's own words.
- **Negations:** ineligible, excludes, prohibits, forbids, disallows before a remote word;
  prohibited, forbidden, ineligible, excluded, "nope", "remote work cannot be …", Spanish
  "no es posible", Dutch "niet", Polish "nie", Italian "non" after it; "work-from-home";
  "Remote (Y/N): N", "Remote: 0%"; fillers "possibility", "employees", "staff", "you". Not a
  negation: a remote word naming a perk or a skill ("No remote experience required",
  "remote stipend"), "not new / optional / negotiable / temporary / a buzzword", "No
  question", "don't do remote halfway", "never been remote?", and "cannot" right after a
  remote word in a list without punctuation ("…overtime and remote Cannot be on any no fly
  list", a live posting).
- **Presence:** weekdays, "N days a week" up to seven next to a named place or after a
  workplace, "every two weeks", "once a fortnight", "several / a few / a couple of days a
  week", physical presence; centre, shop (not a coffee shop), building, workplace and base
  with a modifier (not "code base", "customer base"; not "to" them: "we sell to the auto
  repair shops" is a customer); jobsite; "headquarter". Teams, programming languages and
  tools are not places ("daily in Python", "weekly to Product"); "to" after a frequency is
  not read; "local to your time zone" and "experience working in the field" are not
  presence; a word ending a sentence cannot join a place ("their own. Intelligence Center").
- **Words:** Niederlassung, Geschäftsstelle, im Betrieb, Präsenz im, filiale, in loco,
  sucursal, oddział, hoofdkwartier.
- **Table:** every re-review probe is a row (76, beside "This is a fully remote position."),
  with controls from the review and from the live postings (Testlio's "work from the coffee
  shop", the inspector's bullet list, "Remote Opportunity", "(Remote in Martinique)").

**Checks of cycle 2:** all 101 first-review probes and all 76 re-review probes reach their
outcome except one I added and disclose ("Remote Engineer, Austin campus", below); HEAD's
rule against the final one on 568,516 pairs of the table's and both reviews' strings: 0 move
toward showing.

### Measured (the 498 stored Remote First Jobs postings)

| | main catalog | needs-review | excluded |
|---|---|---|---|
| before (2026-11-02, after S1-006 and B64) | 102 | 314 | 82 |
| after B65 (final rule, re-mapped) | 97 | 319 | 82 |

14 rows change; 5 leave the main catalog; 0 move toward showing (the re-map refuses a move
into the catalog or from excluded to needs-review). Read by hand — all five are **false
hides**, in the allowed direction, and wait for review:

- `product-designer-878022` (Wave), on "based in one of our hiring hubs": "This is a fully
  remote role. Candidates must be based in one of our hiring hubs (US, UK, Spain, Kenya,
  Ghana, Canada) or in one of our operating markets…". The hubs are hiring countries.
- `controller-remote-netsuite-878239`, title "Controller (Remote, NetSuite)": "NetSuite"
  is a skill, attached to the label.
- `senior-software-engineer-remote-ai-saas-software-rol…` (three postings), title "Senior
  Software Engineer | Remote | AI SaaS Software Role": a description, attached to the label.

Nine needs-review postings keep their state with a new quote: "2x/week" ("WFH Benefits:
Lunch on us 2x/week"), "at the project site", "at Stanford's social algorithm laboratory",
"every Friday", "to the Call Center", "hoofdkantoor", "Camp Nunavut" and "Legalization
Coordinator" (title words after "Remote"), "on the customer side and building". The
catalog's own card path (`readSnapshotCards`) shows 93 Remote First Jobs cards after dedup,
without the Wave posting.

**Re-map** (one-off scripts in the gitignored `backups/remap-2026-11-02-b65/`, copied to the
main checkout's `backups/`; B64's pattern with `conflicts` restored too): a dry run before any
rule change planned 0 changes (the rebuild reproduces all 498 stored workplaces byte for
byte); the final rule: dry run 14, `--apply --expect=14` (14 changed, 4,066 rows
byte-identical, a re-import reads `seen`); the rollback **refused** a re-mapped row whose
`full_pass_misses` had been bumped (what an import would do, without a new version) and
committed nothing; with the bump undone it restored all 14 and the 4,080 rows matched the
recorded start; applied again with the same result; the final dry run plans 0. Gates:
nothing outside the workplace, its evidence item and `conflicts` changes, travel is read as
stored, no move toward showing, the backup holds no posting text. `remap.mjs` imports the
rule by a relative path: run it only from a checkout that has B65's code; `rollback.mjs`
does not depend on the rule. The rollback is exact only until the next import of any source
moves a row (it then refuses); after that, reverting the code and importing again re-maps
the rows through the pipeline.

**Known costs (hiding direction):** a harmless title qualifier after the label ("(Remote,
NetSuite)", "(Remote, CET +/- 2)"); customers named as places ("we sell to the hospitals");
meetings by the calendar ("meet with your manager once a week", "Every Friday we hold a demo
day", "no meetings on Fridays"); "mostly remote"; a four-day week; an airport radius
("within 50 miles of an airport"); "local candidates"; and, **excluded** rather than
reviewed, a negation limited to a place ("we do not hire remote employees in California").
Among the 97 that stay, none has these.

**Not closed (a regex reading of free text cannot be; two reviews kept finding more):** the
vocabulary is not complete in any language — an arrangement in other words passes ("you'll
be expected around the Austin team a lot", "work from our Austin coworking space", "join our
in-house team in Austin"), and so do synonyms the lists lack in English, German, French,
Spanish, Portuguese, Italian, Dutch, Polish and the Scandinavian "kontor", and every other
language; a title whose leading "Remote" is followed by the job's name and then a qualifier
("Remote Engineer, Austin campus" with a remote phrase in the text); a place name in all
capitals ("MONDAYS IN AUSTIN"; lowercase "in austin every tuesday" is read by "every
Tuesday"); lookalike letters ("Оffice" with a Cyrillic О, "0ffice"); images and
attachments. The live catalog postings were hand-checked against these classes in S1-006 and
none was found; a model-based check is the only route to closing the class, and would be a
new owner decision.

**Checks (final code):** `npm run check` exit 0 (408 unit tests, lint, typecheck);
`npm run test:coverage` exit 0 (532 unit and DB tests, 0 skipped; 85.63 / 88.92 / 93.87,
above the 85 / 88 / 93 ratchet; not raised, no whole point gained). Not run: `npm run
test:e2e` and `npm run build` (no page changed; the e2e fixture backend has no Remote First
Jobs records). The worktree has no `.env`: the database commands read the main checkout's
with `--env-file`, never printed. **Spend:** none; nothing left the machine.
**Rollback:** revert the change, then `node --experimental-strip-types --env-file=<.env>
backups/remap-2026-11-02-b65/rollback.mjs` before the next import (afterwards an import
re-maps the rows itself).
