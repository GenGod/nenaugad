# B72-001 — wording about the company, not the role, waits for review instead of excluding

**Status: implemented and tested locally 2026-11-10, two repair cycles (the limit) after the
independent review, final review: criteria 1–4 met with recorded residual risk; accepted by
the owner 2026-11-10 with that residual risk ("Accept B72-001", given in this session);
committed as `f74c661`, merged into main as `0cc51d3` and pushed, CI green (run 42776194322);
not activated (the worker's image still runs the old rule), not re-mapped.**
Started 2026-11-09. Found by [S1-007](S1-007-remotejobs-org-source.md)
on the first live RemoteJobs.org run ("The exclusions read by their trigger"), recorded as B72
in [OPEN_GAPS](../docs/OPEN_GAPS.md). Started from the session that closed B73, at the owner's
request to implement B72. Previous task: [B73-001](B73-001-failed-page-reason.md), merged and
pushed, CI green, not accepted.

## Problem

The office-vocabulary veto (`readOfficeVocabulary` in
`src/server/import/remote-first-jobs-fixture.ts`, shared by Remote First Jobs and
RemoteJobs.org) excludes a posting on the first **office statement** in its text: an
unresolved contradiction is quarantined (spec 10.3, B65). The statement patterns read a
phrase, not who it is about. On the first live RemoteJobs.org run 18 postings were excluded
this way (24 by 2026-11-09), and at least 8 of them are remote roles hidden by a sentence
about the company or other roles:

- "Remote and hybrid work options" in a perks list (Machinify);
- "Flexible work models, including remote and hybrid work arrangements, where possible"
  (Amgen, title "… - U.S. Remote");
- "This is a 100% remote position …, with an opportunity to work a hybrid schedule for
  candidates who live near our global headquarters" (Keeper Security);
- "Competitive compensation, hybrid work model, and strong career growth … Fully remote
  setup" (Tabby);
- 1Password's "Remote-first work environment *Some roles in our GTM team are currently being
  hired for in-person hybrid work in Toronto and Austin" (4 postings).

Two exclusions are right (an in-person nurse role; Qualtrics' "we all gather in the office
three days a week"). False hides are the allowed direction, but these should wait for review
(`unknown`), not leave the catalog's review queue for good.

## Result and boundaries

**User result:** a remote posting whose only office statement is about the company, about
some other roles, a condition, an option, a perk or a preference is stored as needs-review
(`verification_state: unknown`, `mandatory_onsite: unknown`) with that sentence's words as
the evidence quote, instead of excluded. A statement about the role's own arrangement still
excludes it. Nothing reaches the main catalog on this text.

**Not included:**
- the title and the negations (`NEGATED_REMOTE`): unchanged. A false negation seen in the
  same data ("Relocation Assistance Provided: No - This is a remote position") is a separate
  gap, recorded as B74;
- tier 2 (office words → review) and tier 3 (confirmation): unchanged;
- a review UI or a model-based reading (a new owner decision);
- B70, B71 (travel form field, "X or nearby").

**Context:** the rule's comment block and `readOfficeVocabulary`; RemoteJobs.org's
`remoteJobsOrgWorkplace` takes `office`/`officeWord` from it unchanged; B65-001 for the
measurement and re-map precedent; `classifySnapshot` (`src/domain/snapshot-projection.ts`)
shows only `main_catalog` publicly and in matching, so needs-review and excluded are both
hidden from candidates today.

**Risk: high.** The remote-only veto of two sources, and the first change to it that moves
postings out of exclusion (toward needs-review). Effort `xhigh`; a fresh-context `reviewer`
pass before owner acceptance; at most two repair cycles (`npm run task -- repair`).

**Data:** stored public job postings, read locally; synthetic test texts modelled on them; no
personal data; nothing leaves the machine. **Spend:** none.

## Acceptance (fixed before the code)

1. **Company-level wording waits for review.** For both sources (a Remote First Jobs posting
   with a remote label, a RemoteJobs.org posting with the source's remote field), each of
   these synthetic texts lands in needs-review — not excluded, not the main catalog — with
   `mandatory_onsite: unknown` and the office statement's words as the quote:
   - remote work named beside it: "Remote and hybrid work options" in a benefits list;
     "Flexible work models, including remote and hybrid work arrangements, where possible";
     "whether they are working on-site, in a hybrid model, or fully remotely"; "This is a
     remote or hybrid position";
   - an option: "a 100% remote position, with an opportunity to work a hybrid schedule for
     candidates who live near our headquarters"; "optional in-office days";
   - other roles or a condition: "Some roles in our GTM team are being hired for in-person
     hybrid work in Toronto"; "If this role is hybrid, you will live within commutable
     distance"; "If this role is remote, there will be in-office events that require
     travel"; "if you are based within 35 miles of our office, you will be expected to be
     in-office 2 days / week";
   - negated or a preference: "Positions that are not required to be onsite may offer …";
     "You might not be a fit if you prefer an in-person role over remote";
   - the company's model or a perk, for a bare "hybrid work / working / model / …" phrase:
     "In our hybrid work environment, we provide flexibility"; "Learn more about Acme's
     hybrid working model and benefits"; "Competitive compensation, hybrid work model, and
     strong career growth"; "Benefits: Hybrid working model, 25 days' holiday".
2. **A statement about the role still excludes**, for both sources: "This is an in-person
   role"; "This is a hybrid role"; "The role is hybrid"; "Expect 3 days a week in the
   office"; "candidates based in Dublin for our hybrid working model"; a perk that names
   presence ("Hybrid working (3 days in our Cardiff office)", "Our hybrid work model: we all
   gather in the office three days a week"); a menu without remote ("an on-site or hybrid
   role"); a title statement; every negation. A company-level sentence beside a role
   statement anywhere in the text still excludes.
3. **Nothing moves toward the main catalog.** Every row of (1) stays needs-review with a
   strong remote statement added ("This is a fully remote position."); the demoted quote is
   an office word, so it blocks confirmation even when the text has no other office word.
   Temporary remote work still excludes.
4. **Every existing row** of both sources' unit tables keeps its outcome.
5. **Measured** on the stored postings of both sources (main / needs-review / excluded, before
   and after) by a read-only replay that first reproduces every stored workplace and quote:
   the only transitions are excluded → needs-review; every RemoteJobs.org mover and the
   Remote First Jobs movers are read by the words that moved them and listed here.
6. **Re-map decision recorded** with its reason (below), and the counts per source.
7. `npm run check` exit 0; `PG_TOOLS_CONTAINER=nenaugad-db-1 npm run test:coverage` exit 0;
   a fresh-context `reviewer` pass.

## Plan

1. Test rows first in `tests/unit/remote-first-jobs.test.ts` and
   `tests/unit/remotejobs-org.test.ts`; they fail.
2. In `remote-first-jobs-fixture.ts`: split the arrangement statements from the negations;
   read every occurrence of an arrangement statement in its sentence; one about the company,
   other roles, a condition, an option, a perk or a preference becomes an office word (its
   quote kept); the first other statement still excludes. Patterns themselves unchanged, and
   the old first-match order kept, so unaffected postings keep their stored quote.
3. Replay on the stored postings (read-only, scratchpad); read the movers.
4. Checks, coverage, reviewer; docs.

**Re-map.** Decided in the result, after the measurement.

**Rollback:** revert the diff (no migration, no stored data written by the change).

## Result (2026-11-09)

### The rule

`readOfficeVocabulary` reads tier 1 in the text through `readStatements`: every occurrence
of the eight arrangement statements (`ARRANGEMENT_STATEMENTS`, the patterns unchanged, now
global), in the order they were always read, then the negations (`NEGATED_REMOTE`, unchanged,
first match). The first occurrence that is about the role excludes, as before. An occurrence
that `aboutTheCompany` reads as company-level is kept as an office word: it comes after the
title's office words and before the text's, so it is the quote, and the posting is
needs-review with `mandatory_onsite: unknown`. The sentence is the text up to 160 characters
before the statement and 120 after, cut at ". ", "! ", "? ", "; " or a line break. As
repaired in cycles 1 and 2 (below), company-level means, in that sentence:

- always (whatever the sentence's subject):
  - remote work beside it (`REMOTE_BEFORE`, `REMOTE_AFTER`): "remote and hybrid work",
    "remotely or in a hybrid arrangement", "on-site, in a hybrid model, or fully remotely";
    not a menu without remote work ("an on-site or hybrid role"), not a remote culture
    ("remote-first", "remote-friendly"), and not a hybrid week's breakdown: a day count, a
    weekday, "twice / once / most days / some days / alternate / every other / half the /
    occasionally" within 40 characters after the remote word ("a hybrid role, remote 2 days
    a week", `NOT_A_BREAKDOWN`);
  - a condition (`CONDITIONS`, `IF_THIS`): "if this role is …", "if you are based / located
    / live / reside within / near / in …" (not "when you are in the office"), "for employees
    / candidates / those … near / within …", "if this " right before "role is hybrid";
  - the candidate's preference (`PREFERENCE_BEFORE`): "you / candidates / applicants (who)
    (…) prefer (a)" — not the employer's ("We prefer a hybrid schedule");
  - a negation (`NEGATED_BEFORE`: "not (be) (a)", "n't") unless presence follows ("This is
    not a hybrid role; it is fully on-site");
- unless the sentence's subject is this role (`ROLE_SUBJECT`: "this / the / your role /
  position / job is / will / requires / follows / …", not after "if / when / whether /
  unless") and that sentence does not state the role remote (`ROLE_IS_REMOTE`: "This
  position is 100% remote, with an opportunity to …"):
  - some other roles (`SOME_ROLES`): "some / many / certain / select roles / positions /
    jobs / openings", or a sentence that starts "Positions / Roles / Jobs that / which" —
    with no contrast between it and the statement ("but", "however", "whereas", "yet",
    "this is / this one / this role", "you will": "Many of our roles are remote, but this is
    a hybrid role", `CONTRAST`);
  - an option (`OPTION_BEFORE`, `OPTION_AFTER`): "an opportunity / option / choice /
    possibility to work a", "optional", "… options", "…, where possible", unless the
    sentence requires it ("requires / required to / must / needs to / expected to /
    mandatory", `REQUIREMENT`; a bare "No relocation required" is not one);
  - only for a bare "hybrid work / working / schedule / model / setup / arrangement / policy
    / opportunity" phrase: the company's model ("our / its / their / Acme's (flexible)
    hybrid … model / environment / policy / approach / culture / …"; not "for / follows /
    of / to / under / with / within / per / join(ing) our …", not "role's / position's /
    job's"), or a perk (a "Benefits / Perks / What we offer / We offer / What's in it for
    you / We provide" header in the sentence, or a perk word next to it across a list
    separator) — in both cases only when no office word appears within 60 characters before
    or in the raw 160 characters after (across sentence ends: presence, "Hybrid working (3
    days in our Cardiff office)", "We offer a hybrid work schedule; you'll be in the office
    …"), and not on the role's own location or work-model line in the raw 50 characters
    before ("Location: …", "Location London,", "Location: Washington, D.C. (our hybrid work
    model)", "Work model", "Work arrangement", `ROLE_LOCATION`).

Title statements, negations, tiers 2 and 3, travel and temporary remote work are unchanged.
A demoted statement is always an office word, so it blocks confirmation by construction.

### Tests

`tests/support/company-wording-cases.ts`: 21 company-level texts (needs-review, with the
quote: 17 written before the code, 4 from the re-review of cycle 1) and 53 role statements
(excluded, with the quote where it is fixed: 13 written before the code, 22 from the review of
cycle 0, 18 from the re-review of cycle 1), modelled on the live postings and paraphrased, some
flattened as the source's text arrives (no full stops between list items). Both sources run
every text alone and after "This is a fully remote position."; plus the workplace fields
(`unknown`, `unknown`, no conflict, confidence 0.5), a title statement (both sources) and the
source's own hybrid field (RemoteJobs.org) still excluding. Written first: before the code all
17 company-level texts were excluded on both sources and the 3 "company wording beside a role
statement" rows quoted the company sentence; each review's rows were added before its repair,
failed on the code before it, and pass on the code after it.

### Measured (read-only replay of the stored postings, 2026-11-09; repeated after each repair, the numbers are the final rule's)

The replay (scratchpad, not in the repo) exported the 2,718 active stored postings of both
sources from the local database, rebuilt each workplace with the rule (Remote First Jobs:
`remoteFirstJobsWorkplace`; RemoteJobs.org: `readOfficeVocabulary` with the mapper's state
logic, none of the stored rows has a source-field conflict) and classified it. Before the
change it reproduced every stored state and quote (0 mismatches of 2,718).

| | main catalog | needs-review | excluded |
|---|---|---|---|
| RemoteJobs.org before | 231 | 295 | 24 |
| RemoteJobs.org after | 231 | 315 | 4 |
| Remote First Jobs before | 331 | 1,352 | 485 |
| Remote First Jobs after | 331 | 1,474 | 363 |

142 postings move, all excluded → needs-review (20 RemoteJobs.org, 122 Remote First Jobs);
nothing else changes state; 10 Remote First Jobs postings stay excluded with a statement
about the role as the new quote ("In office position", "in-office days", "will be on-site",
"hybrid model"), which a re-map would write although their outcome is the same. (Cycle 0's
rule moved 2 more Remote First Jobs postings, "Take advantage of our flexible hybrid working
model, combining remote delivery with occasional client or hub-based …": cycle 1 reads "of
our" as adopting the model and keeps them excluded.)

**RemoteJobs.org, the 20 that move** (read by their sentence): Samsara ×3 "whether they are
working on-site, in a hybrid model, or fully remotely"; 1Password ×5 "*Some roles in our GTM
team are currently being hired for in-person hybrid work in Toronto and Austin"; Machinify
"Remote and hybrid work options" (perks list); Amgen "Flexible work models, including remote
and hybrid work arrangements, where possible" (title "… - U.S. Remote"); Keeper "100% remote
position …, with an opportunity to work a hybrid schedule for candidates who live near our
global headquarters"; Tabby "Competitive compensation, hybrid work model, and strong career
growth … Fully remote setup"; Gartner "In our hybrid work environment"; Zscaler "Learn more
about Zscaler's hybrid working model and benefits here" (title "… - NYC"); NTT DATA "many
positions offer remote or hybrid work options … For employees near an NTT DATA office …
in-office attendance may be required" (quote now "Frisco", the title's qualifier); Ensono
"Positions that are not required to be onsite … may offer the ability to work remotely or
hybrid"; "You might not be a great fit if: … You prefer an in-person role over remote";
PointClickCare ×2 "For Remote Roles: If this role is remote, there will be in-office events
…" and "For Hybrid Roles: If this role is Hybrid, …"; "if you are based within 35 miles of
our Oakland … office, you will be expected to be in-office 2 days / week" (otherwise "remote
within the United States").

**RemoteJobs.org, the 4 that stay excluded:** the in-person nurse practitioner role (right);
Qualtrics "we all gather in the office three days a week" (right); "Relocation Assistance
Provided: No - This is a remote position" (a false negation, recorded as B74, out of scope);
Maven "Hybrid work, in office meals, and work together days" (a perk that names the office:
ambiguous, kept excluded).

**Remote First Jobs, the 122 that move** (34 distinct sentences): 68 Samsara's boilerplate
as above; 17 other menus with remote work ("Remote or Remote / Hybrid work options based on
position", "we offer both remote and hybrid working options", "This is a REMOTE or HYBRID
position", "this role will be remote or hybrid working, subject to the … location", "can be
performed remotely or in a hybrid arrangement", "Remote or Hybrid work setup (3 days/week in
office)"); 23 bare perks ("Pension contribution Hybrid working model (role dependant)" ×6,
"Benefits: Hybrid working model with some flexible working 25 days' holiday" ×7, "Flexible
hybrid working model – to support your work-life balance" ×2, "We offer hybrid working, a
positive working environment", "We offer a hybrid work environment. Most US-based positions
can also be performed remotely", …); 9 other roles or a condition ("Some roles offer a hybrid
schedule of 2–3 days in-office per week" ×4, PointClickCare ×4, "Some positions are fully
remote, while others follow a hybrid model for employees near an office"); 3 options ("hybrid
work options" ×2, "optional in-office days"); 2 the company's model ("For further details on
our hybrid work approach", and "Keep Okta and Entra ID working together in our hybrid setup",
a technical setup). None is a statement about the role. Many of the bare perks are UK employers
whose roles are probably hybrid: they now wait for review rather than being excluded, as the
expected shape asks (judgment call for the owner, below).

### Review of cycle 0 (fresh-context `reviewer`)

Criterion 2 **not met**: realistic statements about the role were demoted to review (always
excluded → needs-review, never toward the main catalog). (1) High: "other teams", "select
teams", "most roles", "other roles" read as other roles, also across a flattened bullet list
("Collaborate with other teams … Expect 3 days a week in the Austin office"), and "Some roles
… , and this role is a hybrid role" in one sentence; (2) high: a requirement read as an option
("requires the ability to work a hybrid schedule", "the flexibility to work a hybrid
schedule"); (3) high: the role adopting the company's model ("This role follows our hybrid
work model", "subject to Acme's hybrid work policy", "part of our", "This role's"); (4)
medium: a hybrid week's breakdown read as a menu ("a hybrid role, remote 2 days a week");
(5) medium-low: a location or work-model heading without a colon, and presence after ";";
(6) low: "This is not a hybrid role; it is fully on-site"; (7) info: quote changes on rows
that stay excluded (counted above). Clean: nothing can reach the main catalog (by
construction, and a 60,000-case fuzz against HEAD's rule found no other move); unaffected
postings keep their quote byte for byte (same read order); regex cost at most 44 ms on a
100,000-character worst case (HEAD 10 ms). Test gaps: no flattened text, no negative rows for
the markers, the location guard not pinned, no RemoteJobs.org title statement with company
wording.

### Repair cycle 1 (hypothesis recorded with `npm run task -- repair`)

Hypothesis: the markers' vocabulary was too wide, not the rule; narrowing each and letting a
sentence about this role win makes every review row exclude while the 17 company-level rows
and the 20 RemoteJobs.org movers stay. Changes: `SOME_ROLES` without most / other / teams,
plus a sentence-initial "Positions that"; `CONDITIONS` split out; `ROLE_SUBJECT` blocks
some-roles, option, company-model and perk demotions; `OPTION_BEFORE` without ability /
flexibility / chance / freedom, and `REQUIREMENT`; `COMPANY_OWNER` refuses adopting verbs and
"role's"; `NOT_A_BREAKDOWN` on `REMOTE_AFTER`; presence read in the raw 160 characters after
and also for a negation; `ROLE_LOCATION` without a colon. Result: the 22 review rows were
added first (all failed), then pass; both sources' tests 42/42; the replay confirmed the
prediction (RemoteJobs.org 20 movers, Remote First Jobs 122, all excluded → needs-review).

### Re-review of cycle 1 (the same `reviewer`, its context kept)

All 22 earlier rows exclude; criterion 3 holds (a 500-case fuzz against HEAD's rule found no
move other than excluded → needs-review). Criterion 2 still **not met**: (1) high: a contrast
after a subset ("Many of our roles are remote, but this is a hybrid role", "While many
positions are remote, this one requires 3 days a week in the Austin office"); (2) medium: a
breakdown in words ("remote twice a week", "remote most days", "remote on alternate weeks");
(3) medium-low: "remote-first culture" read as a mode; (4) medium-low: the employer's
preference ("We prefer an in-person role"), "When you are in the office" as a condition,
"remote work is allowed occasionally"; (5) low: joining the company's model ("You'll join our
hybrid work environment"); (6) low: an abbreviation cutting the location line ("Location:
Washington, D.C. (our hybrid work model)"); (7) info, accepted: an option is not checked for
presence ("the opportunity to work a hybrid schedule from our London office", the Keeper
shape). And four company-level cases cycle 1 wrongly excluded: "This position is 100%
remote, with an opportunity to work a hybrid schedule …", "This role is fully remote, with
the option to work a hybrid schedule …", "The role is remote-first with optional in-office
days", "No relocation required, with optional in-office days".

### Repair cycle 2 (hypothesis recorded; the last one allowed)

Hypothesis: a subset phrase counts only with no contrast between it and the statement, and a
sentence that states the role remote keeps its option; plus the narrowings (1)–(6). Changes:
`CONTRAST` and `someOtherRoles`; `ROLE_IS_REMOTE`; `NOT_A_BREAKDOWN` with frequency words;
`REMOTE_MODE` refuses -first/-friendly; `PREFERENCE_BEFORE` needs the candidate; `CONDITIONS`
need "based / located / live / reside"; `COMPANY_OWNER` refuses join(ing); `REQUIREMENT`
keeps "required to" only; `ROLE_LOCATION` reads the raw 50 characters before. Result: the 22
re-review rows were added first (all failed), then pass; both sources' tests 42/42; the
replay is identical to cycle 1's (no stored posting has these shapes): the prediction held.

### Re-map: not applied before acceptance

The stored rows were **not** re-mapped. Reasons: the change is high risk and needs the
reviewer and the owner's acceptance before it is activated; the Docker worker runs the image
built before this change (`build: .`, no source mount), so its next Remote First Jobs or
RemoteJobs.org import would re-map any row it still carries back to the old reading; and
nothing a candidate sees changes either way (needs-review and excluded are both hidden). On
acceptance: rebuild the image (`docker compose up -d --build`); each import then re-maps the
rows its feed still carries. Rows no feed carries any more keep the old, excluded reading
until they leave (the allowed direction), unless the owner wants B65's guarded one-off re-map
for them.

### Checks

Cycle 0: `npm run check` exit 0 (unit 496/496); `test:coverage` exit 0 (654/654; 88.58 /
90.17 / 95.29). Cycle 1: `check:agent` exit 0; `test:coverage` exit 0 (654/654; 88.60 / 90.19 /
95.30). Cycle 2 (final code): `npm run check` exit 0 (unit 496/496: the two B72 tests; lint,
typecheck); `PG_TOOLS_CONTAINER=nenaugad-db-1 npm run test:coverage` exit 0 (654/654 unit and
DB tests, 0 skipped; 88.62 / 90.20 / 95.30 above the 88 / 89 / 95 ratchet, not raised: no
whole point gained; both mapper files at 100 % lines); the replay above. Not run: `npm run
build`, `npm run test:e2e` (no page changed; the e2e fixture backend has no posting with
company wording), a live import, the re-map. Two repair cycles of two. **Spend:** none;
nothing left the machine; coding-host spend unknown (the reviewer's own runs included).

### Final review (after cycle 2)

Criteria 1, 3, 4 met; criterion 2 met for every listed case and every case the three
review rounds reported (about 90 probes rerun; a 500-case fuzz against HEAD's rule: no move
other than excluded → needs-review, unchanged outcomes keep their quote). **Residual risk
(not repaired: the cycle limit is reached).** Role statements that still wait for review
instead of excluding — never shown to candidates:

1. by design, a condition on local candidates: "If you are based in Austin, this is an
   on-site role", "If you live in London, you will be expected to work in the office 3 days
   a week" (medium; the same shape as the "within 35 miles" case of criterion 1);
2. a contrast the list lacks: "Although / Though / Unlike many of our roles …, the
   successful candidate / the Senior Engineer / it / this team …" (medium-low; needs a "some
   / many / certain / select roles" phrase in the same sentence);
3. a breakdown in other words: "a hybrid role, remote the rest of / part of the week",
   "remote when you are not in the Austin office" (medium-low);
4. a heading read as an option: "Hybrid work options: on-site Tuesday through Thursday in
   Austin" (low-medium);
5. "Candidates who strongly prefer an in-person role will love this team" (low);
6. a requirement after the statement: "with an option to work a hybrid schedule required
   for the first 6 months" (low).

Company-level wording that still excludes (the allowed direction): an option or a condition
written after the statement ("Hybrid work is available for those near our Austin hub", "with
a hybrid schedule available to those in New York", "Employees near our offices can choose a
hybrid schedule", "You can choose to work a hybrid schedule if you live near Toronto";
medium-high, probably the largest group B72 still hides); "most teams work remotely, and a
few work a hybrid schedule in Berlin" (medium; most / few / teams left out on purpose in
cycle 1); "This role is remote. Our hybrid work model means teams gather in the office
quarterly" (medium-low: an office gathering counts as presence). If B72 is reopened, the
first group is the place to start; it would need its own role-subject guard.

### Judgment calls for the owner

1. Bare perks and the company's model go to review, as the expected shape says, although for
   Remote First Jobs (a mixed feed) many such employers are probably hybrid.
2. PointClickCare's "For Hybrid Roles: If this role is Hybrid, …" is read as a condition
   (review), not as the role's statement: the same block says "For Remote Roles: If this role
   is remote". S1-007's first reading counted it as a right exclusion.
3. A perk that names presence stays excluded ("Hybrid working (3 days in our Cardiff
   office)", Maven's "in office meals").
4. A condition on local candidates waits for review ("If you are based within 35 miles …,
   you will be expected to be in-office 2 days / week"), as does the same shape stated as
   the role ("If you are based in Austin, this is an on-site role"): the posting is remote
   for everyone else, so for a candidate elsewhere it is unknown, not excluded.
5. Accept the residual risk above, or reopen B72 later with a model-based reading.
6. Not re-mapped before acceptance (above).

**Owner acceptance:** 2026-11-10, "Accept B72-001", given in this session in answer to "Do
you accept B72-001 with its recorded residual risk?". The judgment calls above stand as
implemented. Acceptance is not a commit, a push or an activation: each waits for its own word.

**Merge and CI (2026-11-10):** committed as `f74c661` on `fix/b72-company-wording-veto`,
merged into main as `0cc51d3` and pushed ("Commit the working tree changes", "Merge into
main", "Push main"). CI run 42776194322 on `0cc51d3`: Build, Code quality and Tests green;
unit and DB tests with the coverage ratchet 654/654 (88.59 / 90.29 / 95.30); e2e 126/126. CI
runs on fixtures and makes no request to either source.

**Next.** Rebuild the Docker image so the worker runs the rule
(its imports re-map the rows each feed still carries); decide whether the rows no feed
carries any more need B65's guarded one-off re-map. Then B74 (the false negation), B70, B71.
