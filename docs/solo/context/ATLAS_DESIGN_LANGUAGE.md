# Atlas — product design language
## Version 1.1 · 23 September 2026

**Subject:** the visual language, interface behaviour and component contract of a service for selecting exclusively remote jobs for a resume. This is an evolution of the chosen Atlas concept, not a change to the product spec.

**Priority:** the invariants of `01_TECHNICAL_SPEC.md` → the semantics of this document → components → tokens → demonstration screens. A mockup does not cancel the employer's restriction, data uncertainty or source conditions.

**Status:** specification and a local UI-kit. All employers, jobs, salaries, counters and quotes in the prototype are synthetic examples. Matching, integrations, authorization and resume transfer are not connected. Design hypotheses require testing with users.

## 1. The idea: clarity of the next step

Atlas is a **calm, precise navigator of professional opportunities**. Not a travel service, not «AI, который знает всё о вас» [an AI that knows everything about you] and not an endless feed. At every point the person understands: what is known, what fits, what needs clarification and what will happen after an action.

Product promise: **«Удалённая работа. С понятными условиями.» [Remote work. With clear conditions.]** The emotional formulation for the home page: **«Работа, которая совпадает с жизнью.» [Work that matches life.]** The first explains the product; the second expresses the character. In matching, the first has priority.

Personality: attentive, adult, benevolent, evidence-based. Not familiar, not pompous, not bureaucratic. Atlas helps make a decision; it does not evaluate a person's worth.

### What we keep and improve

We keep the warm base, deep blue, editorial headings, the open catalog and the feeling of a personal professional space.

| Early concept | System 1.1 | Reason |
|---|---|---|
| Serif in almost all headings | Serif in the brand and intros; sans in cards | Separate character from fast reading |
| A large blue backdrop | Blue on the action, the selection and links | Demonstrate the content, not the fill |
| Generic match promises | Conclusion + reasons + the original wording | Give a checkable explanation |
| Tiny metadata | 14 px for secondary text | Do not hide conditions and source |
| «Каталог» [Catalog] and «Подбор» [Matching] compete | «Вакансии» [Jobs] → «Для вас / Все вакансии» [For you / All jobs] | One object and clear modes |
| Multicoloured statuses | Separate languages for conditions, freshness and personal progress | Do not confuse «подходит» [fits] with «откликнулся» [applied] |
| Compressed desktop on the phone | A self-contained mobile hierarchy | Preserve the task, not the geometry |

These changes are design decisions, not an already measured conversion growth.

## 2. Grounds and research boundaries

Himalayas highlights country and timezone as separate search parameters [R01]. Welcome to the Jungle formulates its promise through relevant recommendations, saving and company information [R02]. We take principles, we do not copy the appearance: the conditions are visible, browsing leads to a clear decision.

Progressive disclosure of secondary functions and recognition instead of recall are described by NN/g [R03, R04]. For Atlas: a brief condition map → grounds; the search context remains visible. Critical restrictions are not hidden.

WCAG/WAI set requirements for contrast, reflow, focus and interaction [R05–R11]. Carbon helps distinguish notification levels [R12]; GOV.UK — to link a general list of errors to fields [R13]. These are the grounds of the rules, not a conducted study of the Atlas audience.

Public pages do not give access to competitors' analytics and all their authenticated scenarios. We do not claim to know their conversion or effectiveness.

## 3. Six principles

**P1. Availability separate from relevance.** Geography, hours and hard requirements cannot be compensated with skills. Conditions and experience have different blocks. No «вероятности оффера» [offer probability].

**P2. Uncertainty is a full-fledged result.** «Не указано» [Not specified] does not mean «нет» [no]. Amber is the need for clarification, not a problem with the person. It is visible which answer will change the assessment.

**P3. The ground next to the conclusion.** Source, date and quote are available from the point of the conclusion. A generic shield icon does not replace verification.

**P4. The user controls changes.** Filters do not weaken by themselves. Profile corrections are visible. Deletion is available. A transition to the employer does not mean an application sent.

**P5. A calm brand, efficient work.** Intros are spacious; the feed does not consist of hero blocks. Hierarchy and lines are more important than decorative containers.

**P6. One meaning — one rule.** Blue — action/selection. Green — a condition met. Amber — clarification. Red — conflict or a destructive action. Neutral — ordinary information.

## 4. Two modes of one language

**Discover:** home, acquaintance, introduction to the profile. Large serif, free rhythm, one illustrative composition.

**Workspace:** matching, card, profile, saved. Sans, denser lines, stable columns, available filters.

These are not two themes: the palette, controls and behaviour are shared. Editorial character must not be paid for with extra scrolling on every working screen.

## 5. Identity and graphics

The working spelling is `atlas`, lowercase, serif. A small registration mark/direction is acceptable next to it. Do not make a globe the only means of recognition. The name remains text. The clear space is half the wordmark height. Minimum height — 24 px; normal 30–32. A trademark check was not performed.

The motif is **«поля, координаты, заметки» [fields, coordinates, notes]**: thin divisions, section numbers, a quote frame, a line where hours overlap. This is an atlas of knowledge, not of travel. A decorative map must not look like precise hiring geography.

Illustrations are optional on the home page: abstract paper shapes and lines, up to three colours. Without beaches with a laptop, a recruiter mascot, random AI gradients and 3D stickers. Errors, privacy and deletion do not need a decorative picture.

## 6. Colour

Production components use semantic tokens, not HEX. Hierarchy: reference → semantic → component aliases. The JSON is based on the published DTCG Format 2025.10; this is a Community Group format, not a W3C Recommendation [R14].

| Token | HEX | Purpose |
|---|---|---|
| `color.bg.canvas` | `#F7F5F0` | Warm paper |
| `color.bg.surface` | `#FFFFFF` | Cards and forms |
| `color.bg.subtle` | `#EFEEE8` | Nested areas |
| `color.text.primary` | `#202840` | Primary text |
| `color.text.secondary` | `#566074` | Explanations |
| `color.text.muted` | `#626B7D` | Tertiary captions |
| `color.action.primary` | `#3456D1` | Primary action |
| `color.action.hover` | `#2944AC` | Hover |
| `color.action.pressed` | `#223991` | Pressed |
| `color.action.subtle` | `#EBEFFE` | Selected |
| `color.border.subtle` | `#DCDDD6` | Decorative lines |
| `color.border.control` | `#7A8191` | Meaningful field outline |
| `color.status.success.text/bg` | `#24654F / #EAF4EE` | Condition met |
| `color.status.review.text/bg` | `#885619 / #FFF3DF` | Clarification |
| `color.status.danger.text/bg` | `#A63738 / #FCEDED` | Conflict / error |
| `color.status.neutral.text/bg` | `#586477 / #EEF0F4` | Technical status |

Guideline: 80–90% neutral environment, 5–10% structural blue, the rest — meaningful signals. This is not a pixel quota. Do not fill every matching card with green.

Contrast of normal text ≥4.5:1; large ≥3:1; meaningful control boundaries ≥3:1 [R05, R06]. Atlas applies 4.5:1 to secondary captions as well. White/primary ≈6.18:1; ink/paper ≈13.39:1; secondary/paper ≈5.80:1. The full calculation is in `qa/contrast.json`.

`border.subtle` is not used instead of `border.control` in fields. Translucent text is forbidden without checking the resulting pair.

The MVP is a verified light theme. Dark is not obtained by invert and is not enabled unverified. Semantic aliases allow adding it later. `forced-colors` preserves system outlines and distinguishability.

## 7. Typography

**Production:** Source Serif 4 for editorial headings; Inter for the interface. Source Serif includes Cyrillic [R15]; Inter documents tabular figures and interface settings [R16].

**Local demonstration:** `Source Serif 4, Georgia, Noto Serif, serif` and `Inter, system-ui, Arial, sans-serif`. Font files are not included; there are no external font/CDN requests. The production team connects the fonts separately with license verification and fallback metrics.

| Style | Desktop | Mobile | Family / weight |
|---|---|---|---|
| Display | 64/68 px | 40/44 px | Serif 400 |
| Page title | 40/48 px | 32/40 px | Serif 400 |
| Section title | 28/36 px | 24/32 px | Sans 600 |
| Job title | 20/28 px | 18/26 px | Sans 600 |
| Body | 16/24 px | 16/24 px | Sans 400 |
| Long-form | 17/28 px | 16/26 px | Sans 400 |
| Label/button | 14/20 px | 16/24 px | Sans 500–600 |
| Metadata | 14/20 px | 14/20 px | Sans 400 |
| Overline | 12/16 px | 12/16 px | Sans 600 |

Overline — for a short number/category, not a salary. Do not lower meaningful text to 10–12 px for the sake of layout. Italic is allowed for one short display phrase. In job titles — sans, natural wraps; the full title is available without hover.

The description line length is about 60–75 characters, `max-width:70ch`. Serif is not used in amounts, buttons, fields, statuses and tables. `tabular-nums` — for salaries, time, counters. Sizes in CSS are rem; text enlargement is checked at 200%. Do not reduce the font-size of a long translation.

## 8. Grid, space and density

4 px scale: `4,8,12,16,20,24,32,40,48,64,80,96`. 2 px is acceptable for optical correction. A new value requires a reason.

**≥1280:** container up to 1248 px, margins from 32, 12 columns, gutter 24. Home 6/6; results — filters 240 px + list; job — reading + aside 304 px. Do not introduce three independent vertical scrolls.

**768–1279:** 8 columns, margins 24, gutter 20. Filters in a panel; aside under the summary.

**<768:** 4 columns, margins 16, gutter 16. Check 320 CSS px [R08]. Chips wrap; the main content does not require horizontal scrolling.

Comfortable by default; compact is optional on desktop only. Tighten the gaps, not the reading and action areas. Page padding 32–48 desktop/24 mobile. Between sections 32–48; within a group 12–16; label→input 8. Do not turn every field into a card.

## 9. Geometry, depth and icons

Radii: badge 6, button/field 10, card 12, panel 16, modal 20 px. Pill — for a filter, not for every object.

Cards without a regular shadow; hover changes the border, does not shift the position. Shadow 1 — popover; 2 — modal. Do not stack a strong shadow, a border and colour without a reason.

Icons: stroke 1.75, size 20/24 px; 16 only for metadata. A single outline style; a filled bookmark means saved. An icon-button has an accessible name and a 44/48 target. A flag does not replace language/work location. Emoji are not an icon library.

Set: search, filters, arrows, bookmark, document, clock, location, contract, check, question, conflict, external-link, close, delete. Decorative SVG has `aria-hidden`.

## 10. Statuses: three independent axes

### Conditions
| Domain | UI | Signal |
|---|---|---|
| `eligible` | «Условия совпадают» [Conditions match] | Green + check |
| `needs_review` | «Нужно уточнить» [Needs clarification] | Amber + question |
| `ineligible` | «Есть несовместимость» [There is an incompatibility] | Restrained red + conflict |
| `not_evaluated` | «Не оценено» [Not evaluated] | Neutral |

«Условия совпадают» [Conditions match] always means «по опубликованным условиям и подтверждённому профилю» [by the published conditions and the confirmed profile], not a guarantee. The separate `pass/fail/unknown/not_applicable` rules preserve the distinction. `Unknown` — not published/not confirmed; `not_applicable` — the condition does not apply.

### Lifecycle
`active` — a current observation of the source; `stale` — «Давно не подтверждалась» [Not confirmed for a long time]; `closed` — «Вакансия закрыта» [Job closed]; quarantine/rights block — outside the regular feed. An API error does not mean closure. A grey closed does not mean the person is incompatible.

### Personal progress
«Сохранено» [Saved], «Планирую» [Planning], «Откликнулся» [Applied], «Интервью» [Interview], «Архив» [Archive]. Neutral labels. Changed by the person or a confirmed event, not by pressing apply.

### Relevance
In the MVP, without a percentage on the card. «Совпадают TypeScript, React и опыт API» [TypeScript, React and API experience match]; «GraphQL не подтверждён» [GraphQL is not confirmed]. Even a future calibrated index is not a chance of an offer. Evidence completeness separately: «Два условия не опубликованы» [Two conditions are not published].

## 11. Signature component: Condition Map

Five groups: hiring country; hours; contract; compensation; mandatory requirements. In a row: label, outcome, a short reason, the «Основание» [Ground] disclosure. Inside: the quote, the source, the version date and the way the conclusion was drawn. A critical unknown is visible without disclosure.

Example: **«Рабочие часы совпадают: минимум 7 часов за год, нужно 4» [Working hours match: a minimum of 7 hours per year, 4 are needed].** You: 12:00–20:00 Asia/Tbilisi. The team: 09:00–17:00 Europe/Berlin. Seven hours in summer, eight in winter; holidays/vacation are not counted. This is a synthetic example, not the current conditions of a real company.

No conclusion about a country from a timezone. Do not write «Вы можете легально работать» [You can legally work] or «Работодатель вас примет» [The employer will accept you].

## 12. Signature component: Search context

**Full-stack · Грузия [Georgia] · 12:00–20:00 Тбилиси [Tbilisi] · Подряд [Contract] · от €65 000/год [from €65,000/year].**

These are confirmed settings, not guesses from the CV. The «Изменить» [Change] button opens the same values. An unknown is labelled «Не задано» [Not set]. Mobile — two lines, not a horizontal strip of chips.

Keyword and «с опубликованной зарплатой» [with a published salary] are feed filters. Country and schedule are the search profile. Changing it starts a new calculation and shows «Результаты пересчитываются» [Results are being recalculated], but does not rewrite experience.

## 13. Component contract

Full catalog: `atlas.components.json`. Every component has props, states, accessibility, implementation status.

**Button:** primary/secondary/tertiary/destructive; default/hover/pressed/focus/disabled/loading. One primary per local task. Height ≥44, mobile ≥48. Loading preserves the width. Disabled is accompanied by a reason.

**Link:** a transition is a link, a change is a button. Underlined in text. An external transition has a purpose; a new tab is indicated.

**Input/Select/Combobox:** a permanent label, helper, value, error. Placeholder — an example. Height ≥48; mobile font ≥16. The error is linked by `aria-describedby`, the field `aria-invalid`. The value is not lost.

**Checkbox/Switch/Radio:** checkbox — selection/consent; switch — an immediate binary change; radio — one option. A switch is not used in a form that expects «Применить» [Apply].

**Chip:** an informational label and a removable filter are distinguished. Accessible name of removal: «Убрать фильтр: React» [Remove filter: React]. A badge does not pretend to be a button.

**Tabs:** of one area, not global navigation. Arrows/Home/End, focus, tab↔panel. During a long load, manual activation with Enter/Space [R11].

**Dialog/Sheet:** one task, a heading, close, submit/cancel; focus trap, Escape, return to the initiator [R10]. Mobile — a sheet/full page, not a narrow popover.

**Toast:** a brief reversible action, `role=status`. A critical error remains in context. The error summary links errors to fields [R13].

**Disclosure:** a specific label «Основание по стране» [Ground for the country]. An incompatibility or a salary must not be hidden in a tooltip.

**JobCard:** a separate title-link and save-button. Without a card-click with nested buttons. Order: role/company → salary → geography/contract → verdict/reason → source/dates. Up to three skill-chips.

**SourceLine:** «Источник: Himalayas · Проверен 2 часа назад» [Source: Himalayas · Checked 2 hours ago]; publication separately. The CTA route is determined by the license. Demo attribution is not a real publication.

**OverlapBand:** interval labels and min/required; the graphics has a text equivalent. Sizes are calculated from data, not from the composition.

**SavedItem:** role, personal status, lifecycle, action. Changing the status is available via select/button, not only drag-and-drop.

## 14. Navigation

**Desktop:** atlas → home; «Вакансии» [Jobs], «Сохранённое» [Saved], «Профиль» [Profile]. Settings/help in the account. In «Вакансии» [Jobs] the modes «Для вас / Все вакансии» [For you / All jobs]; inside the personal mode — «Условия совпадают / Нужно уточнить» [Conditions match / Needs clarification]. Do not mix these axes into four equal tabs. Without a profile, the catalog and the public card are available.

**Mobile:** three bottom items: «Вакансии» [Jobs], «Сохранённое» [Saved], «Профиль» [Profile], about 64 px + safe-area. On a detail with sticky apply the bottom global-nav is removed; back and apply remain. A long form is not covered by the bottom panel. Do not stack bottom nav, cookie bar, apply bar and chat. `scroll-padding` accounts for pinned elements [R09].

Returning from a detail restores the tab, filters and scroll-position. The URL does not contain the CV and unnecessary personal parameters.

## 15. Screen templates

### T01 Home
The promise + «Подобрать по резюме» [Match by resume] / «Смотреть вакансии» [Browse jobs]. Next to it, one demonstration of the condition map, labelled as an example. No invented scale numbers and client logos. Under the CTA: «Вы подтвердите профиль перед подбором. Резюме не отправляется работодателям автоматически» [You will confirm the profile before matching. The resume is not sent to employers automatically]. Privacy copy matches the implementation.

Mobile: promise → action → open catalog → compact example. Decoration does not push the CTA to the third screen.

### T02 Profile
Separate «Опыт из резюме» [Experience from the resume] and «Условия поиска» [Search conditions]. After parsing — fact checking, sources, correction. First pass: document → experience check → conditions. A repeat edit — a form, not a mandatory wizard.

The country and hours are confirmed by the person. The English level is not inferred from the CV language. Fallback: text/manual profile. Factual data and preferences are not mixed.

### T03 Matching
Heading → context → search/filters → compatibility-tabs → list. One main reason per card. The clarifications tab is visible even if there are more results.

Clarifications are divided into «Можно подтвердить в профиле» [Can be confirmed in the profile] and «Нужно уточнить у работодателя» [Needs to be clarified with the employer]. The user is entitled to confirm a skill, but not the company's unknown hiring policy.

### T04 Detail
First screen: role, company, salary, remote/geography, source/freshness, verdict and condition map. Then experience, the original text, the company. The CTA «Перейти к отклику» [Go to application] with a purpose.

Desktop aside: action/schedule; on mobile the action is pinned, the schedule is in flow. The personal explanation does not replace the original; a translation is labelled.

### T05 Saved
A working list, not a mandatory Kanban board. The person changes the statuses. Closed ones do not disappear silently; keeping the text depends on the license. After an external transition, one may ask «Удалось отправить отклик? Да / Пока нет» [Did you manage to send the application? Yes / Not yet], without automatic assignment.

### T06 Settings and data
Language, notifications, versions, export, deletion. Deleting the file and the extracted profile are named separately. The confirmation contains the object and the consequences. Account-delete — a two-step confirmation; a long magic phrase is not the default.

### T07 Admin
The same components, a compact table. Sources, rights, quarantine, dedup, cost. «API работает» [The API works] does not equal «права одобрены» [the rights are approved]. A bulk action shows the scope; undo where possible. A job moderator does not see CVs.

## 16. Language of states

| State | Show | Do not |
|---|---|---|
| Initial loading | A skeleton of the future list, the operation | Fake progress |
| Background refresh | Old data + «Обновляем» [Updating] | Lose the position |
| Empty eligible | The reason and the clarifications tab | «Работы нет» [There is no work], enabling hybrid |
| Empty keyword | The query and reset | Change the country without a reason |
| Critical unknown | The question and who can answer it | Turn it into a fail |
| Parsing failed | Text pasting/manual profile | Silent OCR |
| Partial source | The data is available, the source is unavailable | Present the partial as the complete |
| Stale job | The last check | Substitute today's date |
| Closed | Closed, history, disabled apply | An active apply |
| Profile changed | An outdated calculation, recalculate | The old green result |
| Offline | The connection and the available data | A false «сохранено на сервере» [saved on the server] |
| Service limit | The feature limitation, baseline | Reveal keys/bills |
| Rights revoked | A permissible placeholder | Keep the forbidden text |
| Deletion requested | The object, status, real timelines | Promise instant erasure of backups |

The funnel is built only from real counters. Demo numbers are labelled.

## 17. Product voice

«Вы» [You], short sentences, a concrete action. Do not explain infrastructure instead of the person's task.

| Must not | Must |
|---|---|
| «AI оценил вас на 96%» [AI rated you at 96%] | «Совпадают TypeScript, React и опыт API» [TypeScript, React and API experience match] |
| «Вы не подходите» [You are not suitable] | «Работодатель рассматривает только кандидатов из США» [The employer considers only candidates from the US] |
| «У вас нет GraphQL» [You do not have GraphQL] | «GraphQL не подтверждён в резюме» [GraphQL is not confirmed in the resume] |
| «Гарантированная удалёнка» [Guaranteed remote work] | «В описании указан полностью удалённый формат» [The description states a fully remote format] |
| «Ошибка 503» [Error 503] | «Не удалось обновить источник. Сохранённые результаты доступны» [Could not update the source. The saved results are available] |
| «Отклик отправлен» [Application sent] after a redirect | «Открыта страница отклика» [The application page has been opened] |
| «Не упустите шанс!» [Do not miss the chance!] | The real publication date |

A CTA is usually 2–4 words, but accuracy matters more than the limit. «Перейти к отклику» [Go to application] is better than a false «Откликнуться» [Apply]. A long localized caption wraps, the height grows.

RU/EN copy — a separate JSON. Production uses ICU/Intl plurals, not concatenation «5 вакансия» [5 job]. Source titles and quotes are preserved.

«€72 000–90 000 / год, до налогов» [€72,000–90,000 / year, before taxes] is one semantic group. No salary → «Зарплата не опубликована» [Salary not published], not zero. An ambiguous Georgia is not corrected with a flag. The IANA zone remains in the data.

## 18. Motion

120 ms hover, 180 ms disclosure, 240 ms panel; easing `cubic-bezier(.2,0,0,1)`. Without bounce, parallax, autoplay and AI pulse. Cards do not slide in as a cascade after a filter.

`prefers-reduced-motion:reduce` removes geometric transitions and shimmer. Information does not exist only in motion.

## 19. Accessibility

The implementation goal is WCAG 2.2 AA, not a claim of achieved conformance. Keyboard, screen reader and real browsers are needed [R05–R11].

Atlas action targets ≥44×44, mobile ≥48×48 CSS px. This is an internal standard: WCAG 2.2 AA defines 24×24 with exceptions, not universal 44 [R07]. Inline links are treated separately.

Focus: 3 px blue + offset 3; on blue — a white separator. No `outline:none` without a replacement. Sticky does not cover focus [R09].

Semantic landmarks, one H1, skip-link, sequential headings. Actions — buttons; navigation — links. SVG decorative or named.

Form: a summary of errors with links and focus after submit [R13]. A permanent label. `aria-live=polite` for status, without spam. Colour is not the only carrier of meaning.

Reflow 320 CSS px, text 200%, zoom up to the equivalent of 320 [R08]. `overflow-x:hidden` is not used to mask losses. Long URLs wrap. A table may become a list.

Modal: background inert, focus trap, Escape/cancel, return to the opener, accessible name [R10]. Tabs — arrow/Home/End and tab-panel relation [R11].

Check separately VoiceOver+Safari, NVDA+Firefox/Chrome, iOS Safari, Android Chrome. A Chromium smoke-test does not replace these checks.

## 20. Privacy and trust

Before sending a document to AI, show the actual processor, the purpose and the mode. Without «100% конфиденциально» [100% confidential] and an unconfirmed zero-retention. The CV does not end up in the URL, session replay and analytics events.

Mailings are opt-in; there is no auto-apply; the public card does not require consent to optional tracking. The source line and apply route correspond to the license.

The UI-kit has no network requests, server upload and analytics. Saves live in memory and are reset after a reload.

## 21. Handoff and governance

The hierarchy `ref.blue.600` → `color.action.primary` → `component.button.primary.background`. The domain `eligible` is not tied to HEX; the component performs the mapping. A brand change does not change pass/fail.

Figma: 01 Cover, 02 Foundations, 03 Components, 04 Patterns, 05 Desktop, 06 Mobile, 07 States/A11y, 08 Archive. Variables: Reference, Semantic Light, Layout, Motion. Auto Layout instead of fixed-height. Variant props `state/size/tone/density`, not «final 2».

There is no native `.fig` in the package. CSS, JSON and HTML are the basis of the transfer. DTCG import depends on the tool; compatibility with a specific plugin is not claimed.

Frontend: typed props, without arbitrary colors. Stories for a long title, unknown salary, unknown reason, focus/busy/error, 320 px, reduced motion. The public card and the personal overlay are distinguished.

A pattern change is agreed by design, engineering and product/domain. Patch — a fix; minor — a compatible addition; major — removal/reassignment of semantics. A deprecated token has a replacement. Screen-local new colours and radii are forbidden without review.

## 22. Demonstration and implementation boundaries

`atlas-ui-kit.html` is a standalone showcase: overview, foundations, components, home, matching, detail, profile, saved, states. Local interactions are listed in the README and the QA report. Five updated user templates are shown in desktop/mobile.

This is a reference for the appearance and individual interactions, not an application and not a domain engine. The production combobox, secure upload, live deletion, full RU/EN runtime, real matching, server persistence and the admin are described but not fully implemented. Statuses are in `atlas.components.json`.

## 23. Acceptance and user testing

Visual acceptance: three levels of reading — role/verdict; conditions/amounts; source/dates. Serif does not get into dense cards. One primary per task. A critical unknown is visible. Unified desktop/mobile tokens.

Behavioural acceptance: the keyboard reaches filters, tabs, the card, save/apply. Cancelling a filter does not change the feed. Returning preserves the state. Apply does not change the personal status. Closed/stale do not look like fresh recommendations.

### User test plan — an experiment not performed
Two iterations of 6–8 people: developers and other professions, different countries of work, some mobile-first; separately include assistive-tech users. This is a qualitative check, not a statistical validation of the market.

Tasks: find a job without registration; explain the difference between a match and a clarification; find the ground for geography; check the hours in winter; correct a skill from the CV; save and go to the application without confusion with sending; explain an empty feed; distinguish deleting a file from deleting an account.

Initial targets: 0 critical misinterpretations of a hiring guarantee; ≥80% of key tasks without a hint; every participant finds the reason for an unknown. 80% is a proposed product threshold, not an external norm. With a small sample, publish absolute numbers and observations.

Measure the time to a useful decision, comprehension errors, returns due to geography, profile corrections, task completion. Do not maximize the CTR of unsuitable jobs. Analytics without CVs.

Release: contrast, keyboard/screen reader, 320/390/768/1024/1440/1920, long RU/EN strings, reduced motion, visible limitations, attribution, truthful privacy copy, recovery states. Do not declare WCAG conformance based on one palette.

## 24. Instruction to the next implementer

Read the product spec and this document. Do not change the meaning of compatibility for the sake of styling. Use the tokens and the contract. Recreate templates with components, do not stretch PNGs.

Order: foundations → buttons/fields/tabs/dialog → JobCard/ConditionMap/SourceLine → results/detail → profile/saved → states. After each layer keyboard/mobile. Do not connect real resumes to the demo.

On a conflict of a screenshot with a domain rule, choose the rule and record the correction. Separately mark what is implemented, verified and designed.

## 25. Sources

Checked on 23.09.2026. The application to Atlas is our decision, not the authors' statements.

[R01] Himalayas, timezone search/API.
`https://himalayas.app/jobs/timezones`
`https://himalayas.app/api`

[R02] Welcome to the Jungle, public proposition.
`https://global.welcometothejungle.com/`

[R03] NN/g, Progressive Disclosure.
`https://www.nngroup.com/articles/progressive-disclosure/`

[R04] NN/g, Memory Recognition and Recall.
`https://www.nngroup.com/articles/recognition-and-recall/`

[R05] W3C WAI, WCAG 2.2 SC 1.4.3.
`https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html`

[R06] W3C WAI, SC 1.4.11.
`https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html`

[R07] W3C WAI, SC 2.5.8.
`https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html`

[R08] W3C WAI, SC 1.4.10.
`https://www.w3.org/WAI/WCAG22/Understanding/reflow.html`

[R09] W3C WAI, SC 2.4.11.
`https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html`

[R10] WAI-ARIA APG, Modal.
`https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/`

[R11] WAI-ARIA APG, Tabs.
`https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`

[R12] IBM Carbon, Notifications.
`https://carbondesignsystem.com/components/notification/usage/`

[R13] GOV.UK, Error summary.
`https://design-system.service.gov.uk/components/error-summary/`

[R14] DTCG Format 2025.10.
`https://www.designtokens.org/tr/2025.10/format/`

[R15] Adobe, Source Serif.
`https://github.com/adobe-fonts/source-serif`

[R16] Rasmus Andersson, Inter.
`https://github.com/rsms/inter`
