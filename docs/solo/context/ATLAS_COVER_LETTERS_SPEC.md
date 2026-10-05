# Atlas — cover letters
## Functional addendum CL 1.0 to the product technical spec and Atlas Design Language 1.1

**Purpose:** a task for implementing the generation and editing of cover letters based on an uploaded resume. The main scenario is a letter for a selected job; the additional one is a general draft based on a confirmed profile without a job. This is a compatible extension of Atlas, not a new visual concept.

**Delivery status:** specification, contract schemas, model instruction, synthetic examples, acceptance scenarios and a local interactive UI prototype. The backend, real CV uploads and the external AI model are not connected. UI checks do not confirm the quality of the generative model.

## 1. Context and document priority

Atlas is a service for a job seeker: fully remote jobs, availability under published conditions, matching against a confirmed profile and explainable results. The user approved Atlas Design Language 1.1. The warm background, white surfaces, blue accent, editorial Source Serif 4 headings and working Inter, clear unknown conditions, the «Карта условий» [Condition Map] and the visible search context are preserved.

The main spec `01_TECHNICAL_SPEC.md` governs source rights, privacy, profile confirmation, versions and budget. The design language `ATLAS_DESIGN_LANGUAGE.md` governs visual behaviour. This addendum extends them; it does not cancel the original invariants. The contracts of this package are exchange types for the new module, not a replacement of the existing CandidateProfile/JobSnapshot. Identifiers and versions must reference already existing entities.

**Value:** not to rewrite the CV in pretty words, but to choose 2–3 relevant grounds and connect them to a concrete job. The recommendation to adapt the letter to the organization and position is consistent with Harvard MCS [R1]. Promises of more interviews and of bypassing the ATS are not requirements or confirmed effects.

## 2. MVP boundaries

### Included
A letter from the selected job; a general draft from the profile; reuse of an already parsed CV; a confirmed choice of profile version; RU/EN; a neutral professional tone; two sizes; selection of confirmed examples; a manual editor; grounds for factual statements; comparison of a new generation with the current text; versions; copying; TXT export; deletion; correct errors and limits.

### Not included
Auto-applications, automatic sending to the employer, browser-based ATS filling, mass generation for the entire feed, public links to letters, training on CVs, «обход AI detector» [bypassing the AI detector], changing eligibility/ranking, invented achievements. PDF/DOCX export, history in a separate global section, additional languages and styles are later extensions. Plain TXT and the clipboard are sufficient for the first stage.

**Automatic** means: the system composes text on a user action; it does not generate and does not spend budget on every opening of the card, upload of a CV or saving of a job.

## 3. Modes and entry points

**Targeted:** in the job details, next to the primary action «Перейти к отклику» [Go to application] — a secondary button «Составить письмо» [Compose a letter]. From a saved job — the same entry. After the first draft the label changes to «Открыть письмо» [Open the letter]. In the job list, do not add another prominent primary button to every card.

**General:** in the profile, the block «Материалы для отклика» [Application materials] → «Общее письмо» [General letter]. A confirmed experience and a target role will be required. Invented employer, product, mission, industry, contact person or hiring policy do not appear in the text. Visible labelling: «Общий черновик — адаптируйте под вакансию» [General draft — adapt it to the job].

**Without a CV:** show upload, text pasting or manual profile creation. After confirmation, return to the original job. The presence of a file without a verified profile is not considered readiness for generation. Expiry of the original file's retention period does not prevent work on the saved permitted profile version.

Do not introduce a fourth main navigation item. A letter belongs to the bundle «пользователь — версия профиля — вакансия/целевая роль» [user — profile version — job/target role], not to a separate universal chatbot.

## 4. Main path

1. The user selects «Составить письмо» [Compose a letter].
2. The server checks ownership of the profile, its confirmation, versions, access to the job, source processing rights and budget.
3. A short form shows the job, the CV version, the recommended language, the size and the selected confirmed grounds. Nothing is sent to AI before an explicit start.
4. The user presses «Создать черновик» [Create draft]. An opaque animation with invented percentages is not used.
5. The system selects the permitted facts and requirements, composes the text, validates the structure, the statements and the restrictions.
6. The admitted draft opens in the editor. Next to it — «На чём основано» [Based on], the unknown conditions and what was not included.
7. The user edits, if necessary creates an alternative, compares and applies it.
8. Copies the text or saves TXT; the transition to the application is performed separately and along the permitted route.

A letter is not mandatory for an application. The external transition must not be closed with the condition «сначала создайте письмо» [create the letter first]. If the employer does not explicitly ask for a letter, a neutral hint may be shown; nothing is attached by itself.

## 5. Settings

| Parameter | Default | Rule |
|---|---|---|
| Profile | Active confirmed version | File name/date + version + the ability to change |
| Job | Current job variant | Keep the concrete version, company and role |
| Language | The explicit requirement of the job, otherwise the language of the description, otherwise the one chosen by the user | RU/EN in the MVP; an unsupported language requires a choice |
| Size | Standard | Suggested 150–250 words; short 80–140 |
| Tone | Professional, simple | Without a separate tone menu in the MVP |
| Grounds | Up to three relevant confirmed examples | May be excluded; the selected one does not have to appear in full |
| Signature | Not included | Name and contacts are added separately, only by the user's choice |
| Location, schedule, contract | Not included | Only relevant, confirmed ones, explicitly permitted by the user |
| Salary and sensitive data | Not included | Do not pull them into the letter from the search automatically |

Word ranges are product settings, not external norms. With an explicit ATS restriction, it prevails over the length setting. For a limit in characters, store the counter kind and the source of the limit. Do not cut the text in the middle of a sentence; reassemble/propose a manual shortening. If there are few safe facts, a short honest text is better than padding for volume.

Do not infer language proficiency from the chosen letter language. Do not determine the gender of Russian forms from the name: neutral formulations «В моём опыте…» [In my experience…], «Работаю…» [I work…], «Мои задачи включали…» [My tasks included…]. The recipient's name only from an explicit trusted field; otherwise «Здравствуйте, команда…» [Hello, team…] / «Hello, hiring team».

## 6. Facts, intentions and additional information

Separate:
- **Candidate fact:** experience, technology, result, position. A permitted candidate evidence is needed.
- **Employer fact:** a task, requirement or product description. Job evidence permitted for this operation is needed.
- **Intention:** interest in the role and a wish to discuss the tasks. A restrained formulation of the current goal is acceptable, but not an invented story of interest.
- **Link:** an explanation of the relevance of two confirmed facts, not a new qualification.
- **Ordinary text:** greeting and closing that require no proof.

«Шесть лет frontend» [Six years of frontend] does not turn into «шесть лет React» [six years of React]. «Участвовал в проекте» [Participated in a project] does not turn into «руководил командой» [led a team]. An optimization without published metrics does not become «ускорением на 40%» [a 40% speed-up]. Do not copy the full resume to the employer in the form of a letter.

If the candidate additionally writes «Я ещё работал с GraphQL» [I also worked with GraphQL], create a `user_confirmed_for_letter` fact after a separate explicit confirmation. It relates only to this letter and does not change the profile or the match. Changing the profile requires a separate operation, a version and a recalculation. The text of a previous generation and user drafts do NOT automatically become evidence.

A style-preferences field, if it appears later, does not permit the addition of unconfirmed facts. The request «сделай убедительнее» [make it more convincing] means to improve the selection and the formulation of the already known grounds.

## 7. Structure of a good result

Proposed structure: a short address; the role and the most relevant link; 1–2 concrete examples of experience; the connection to the tasks; an optional confirmed organizational condition; a calm closing.

Do not include automatically:
«идеально подхожу» [I am a perfect fit], «давно восхищаюсь вашей миссией» [I have long admired your mission], «уникальная возможность» [a unique opportunity], «эксперт во всех ваших технологиях» [an expert in all your technologies], «имею право работать в любой стране» [I have the right to work in any country], «готов к переезду» [ready to relocate], «свободный английский» [fluent English], invented percentages/scales/clients.

Do not turn every gap into a letter of self-rejection. «GraphQL не подтверждён» [GraphQL is not confirmed] is shown to the user in the panel, but is not inserted automatically for the employer. With an explicit employer request about missing information, offer the user to answer; do not pass off the absence of a skill in the CV as the absence of a skill in the person.

Atlas's explanations, internal evidence IDs, quotes from the CV and the «сверено» [verified] mark are not included in the copyable text. The source's conditions for output distribution are still checked: interface-level cleaning of metadata does not cancel mandatory attribution or prohibitions.

## 8. Unknown and incompatible conditions

| Situation | Behaviour |
|---|---|
| Profile not confirmed | Do not generate; go to verification |
| Requirement not confirmed | Offer to confirm or skip; do not add to the text |
| Geography unknown | Visible amber; do not assert the possibility of hiring |
| There is a proven conflict | Warn and require a conscious continuation; do not hide the conflict and do not change eligibility |
| Remote/rights gate blocked | Closed data must not be used through the generator |
| Job closed | Keep the permitted personal history; stop new targeted generations and apply |
| Not checked for a long time | Warn; do not declare the permitted draft current |
| Profile/job changed | Do not overwrite the existing text; offer a new version |
| The employer prohibited AI letters | Warn; offer the manual editor without model generation |
| No safe relevant examples | Return `needs_input` and concrete questions, not invented text |

A needs_review cannot be turned into eligible by generating a letter. The user is entitled to write an honest question about the possibility of hiring, but not to turn it into a declaration of a confirmed right.

## 9. UI in Atlas

### Desktop
Workspace mode. Container up to 1248 px. On the left/in the main area the editor at 60–75 characters per line; on the right the grounds panel at roughly 304–344 px. One vertical page scroll, not three independent ones. The heading «Сопроводительное письмо» [Cover letter], the context «роль · компания · версия профиля» [role · company · profile version], a neutral draft status.

The editor uses Inter/system sans, 16–17 px. The brand and the introductory heading may be serif. A white flat surface, a restrained border; do not imitate a complex Word and do not use a decorative typewriter. Buttons and fields from Atlas 1.1, no new colours are needed.

The primary action of the editor is «Скопировать письмо» [Copy the letter]. Secondary ones: «Сделать короче» [Make it shorter], «Новый вариант» [New variant], «История» [History], «Сохранить TXT» [Save TXT]. On the job page the permitted transition to the application remains the main thing; the editor does not intercept it.

### Mobile
A full page, not a narrow modal window. First the context and a visible warning, then the editor. The grounds are disclosed in a separate block under the text; critical unknowns remain visible before disclosure. Version comparison is vertical.

On the letter page the bottom global-nav is hidden, as in a detail with an action bar. The field is not overlapped by the keyboard and pinned actions; an ordinary in-flow button is allowed. Minimum 320 px, input font ≥16, targets 48 px. Do not add a chatbot bubble, two bottom panels and a cookie banner at the same time.

### Four prototype states
A: entry from a job; B: settings; C: ready draft + grounds; D: comparison of a new variant. Each is available in desktop/mobile. These are states of one feature, not four navigation items.

## 10. Letter, generation and user review statuses

Do not mix the state of the operation and of the document.

**Operation:** queued → generating → validating → succeeded / needs_input / failed / cancelled. The UI shows the real stages, not false percentages. The model's response is not streamed into the working editor before validation; an unadmitted text is not available for copying.

**Document:** absent / has a draft / edited by the user / saving / saved on the server / save error / being deleted / deleted.

**Review:** generated_checked, user_edited_unchecked, user_reviewed. This is provenance/review state, not a certificate of truth. `generated_checked` means that certain defined checks were performed against the passed grounds, not an external verification of employers/education. Do not show «всё доказано» [everything is proven].

**Ground freshness:** current / inputs_changed / source_unavailable. It can coexist with any review state.

A letter, its generation and copying do not change «Сохранено/Откликнулся/Интервью» [Saved/Applied/Interview]. A substantive API-response cannot change job eligibility.

## 11. Editing and versions

The manual editor saves plain text with paragraphs; pasted HTML is not executed. Production autosave after a debounce with server confirmation. Before it — «Сохраняем» [Saving], on failure — «Изменения не сохранены» [Changes not saved]. The local prototype stores the text only in memory and calls it that.

A manual edit invalidates the check of the changed text. In the MVP it is acceptable to invalidate the entire link between the current body and the grounds, showing the original facts separately. Old green markers must not be left as if a new number or technology had been checked.

Every successful AI generation and explicit user save creates a revision. For autosave, keep an editing draft with optimistic concurrency; do not create endless immutable revisions for every keystroke. «Новый вариант» [New variant] creates a proposal separately. Application — only after comparison and explicit confirmation. On a version conflict, 409; do not overwrite two tabs.

Restoring an old version creates a new record with a reference to the source one. Versions viewed by the user are bound to the exact content hash; an edit removes the mark. Closing/returning must not lose text that was confirmedly saved. The prototype warns that a reload will clear it.

Do not edit the PDF/DOCX original of the CV for the sake of a letter. Only the letter's own versions may be in the letter, not implicit changes to the source profile.

## 12. Pipeline without an unnecessary agent

Authorization + ownership + version check
→ approved source-policy snapshot + processing purpose
→ budget reservation / idempotency
→ evidence selection (2–3 relevant examples)
→ composition plan (candidate facts ↔ job requirements)
→ provider-agnostic constrained generation
→ schema validation
→ claim/evidence, entities, numbers, scope, language and length checks
→ at most one bounded repair when allowed by budget
→ persisted private revision OR needs_input/failed
→ user edit/review/copy.

The generator is a bounded service, not an agent with a browser, email, payment and access to the whole DB. The CV is already parsed by the existing pipeline. Pass the selected facts, the permitted requirements, the settings and the known restrictions; not all documents and not the whole catalog.

The model returns paragraphs, atomic claims, evidence links and excluded requirements/questions. The mere presence of JSON and a real evidence ID does not prove that a claim follows from the evidence: «работал в команде» [worked in a team] does not confirm «руководил» [led]. The structural validator and the semantic check are different layers. An independent model can help with verification, but is not a guarantee; gold cases and human review are needed.

Definitely unsupported statements are rejected or removed during a bounded repair. If the result cannot be safely admitted — needs_input, not a beautiful letter with a small warning. User manual text is saved as user text, without a fictitious machine confirmation.

## 13. Contracts and API

Entities:
`cover_letters` — owner, mode, profile/job/role identity, current revision, lifecycle.
`cover_letter_revisions` — immutable version, body/paragraphs, input versions, model/prompt/validator version, content hash, claim map, review state.
`cover_letter_editing_drafts` — mutable user text + expected version.
`cover_letter_operations` — operation/idempotency/status/budget reservation.
`cover_letter_user_facts` — additions explicitly confirmed for the letter, scope and version.

Do not use title/filename as a primary key. External and internal IDs are strings. All input IDs are checked against the current user on the server; owner_id is not taken from the body.

| Endpoint under `/api/v1` | Purpose |
|---|---|
| POST `/cover-letters` | Create the resource after profile verification; without an AI call |
| GET `/cover-letters?job_id=…` | Only own letters, cursor |
| GET `/cover-letters/{id}` | Document, history, permitted grounds |
| POST `/cover-letters/{id}/generations` | 202 + operation ID; Idempotency-Key is mandatory |
| GET `/operations/{id}` | Status only to the owner |
| PATCH `/cover-letters/{id}/draft` | Autosave with If-Match / expected version |
| POST `/cover-letters/{id}/revisions/{revision_id}/apply` | Apply the proposal; expected current revision |
| POST `/cover-letters/{id}/review` | The user has viewed a specific hash, not a certificate |
| GET `/cover-letters/{id}/export?format=txt` | Only a permitted private export |
| DELETE `/cover-letters/{id}` | Cancellation of tasks and deletion of related data |

Copy in the browser also obtains a current permission for the output surface, if the rights could have changed after opening. `POST .../generations` does not accept an arbitrary job URL, an API key or instructions about changing rights.

Errors: PROFILE_UNCONFIRMED; INPUT_VERSION_CHANGED; EVIDENCE_INSUFFICIENT; JOB_CLOSED; SOURCE_USE_NOT_ALLOWED; MODEL_USE_NOT_ALLOWED; GENERATION_LIMIT; PROVIDER_UNAVAILABLE; OUTPUT_REJECTED; REVISION_CONFLICT. Private objects of another owner are not disclosed.

## 14. Rights to source data

Letter generation is a separate purpose: private candidate writing assistance. Before activation, verify the permissions: reading, processing/derivatives, sending to an external AI and delivering the derivative text to the user. Permission to show the card does not automatically permit all of this.

The policy distinguishes output surfaces: private editor, private storage, clipboard, TXT download. Do not call a copyable letter «неэкспортом» [a non-export] in order to bypass a restriction. If mandatory attribution is incompatible with a convenient letter, coordinate with the source or choose an independent permitted ground; do not remove the condition silently.

When rights are revoked, re-evaluate access to the text, claim-map, job-evidence, proposals and caches. Deduplication and paraphrasing do not remove the restrictions. General mode is not a bypass: blocked job facts do not transfer into it automatically.

Closing a job and revoking rights are different events. An ordinary closure does not have to delete a permitted personal draft; revocation of a storage right may require deletion/reassembly.

## 15. Privacy and security

Letters are personal derivatives of the CV. Private storage only; not public pages, not a shared cache by identical resume, not email by default. For a provider request, minimize name, email, phone, address; add the signature if needed by the server/client after generation, at the user's choice.

Do not use the letter/CV for training. The notice shows the actual AI provider and the actual processing mode; do not promise zero retention without a contract/technical basis.

The contents of the CV, the job, the evidence and free user input are untrusted. Instructions inside them cannot enable tools, reveal secrets, change the user, the policy or the assessment. OWASP describes the risk of indirect prompt injection in files and external text; a single system prompt is not a sufficient protective mechanism [R2]. Permitted fields, minimal rights, output validation and adversarial tests are mandatory.

Expiry of the retention period of the original file does not automatically delete the confirmed profile. An explicit request to delete the CV/profile deletes the derived letters and their versions according to the original deletion policy; the UI reports the consequences in advance. Account deletion includes draft/revisions, tasks, provider artifacts if any, caches and restoration from backup with the deletion ledger. Text must not be saved in telemetry/session replay.

An old queue does not resurrect a deleted letter. The result is written transactionally after a re-check of deletion/policy generation. Logs: IDs, duration, result code, billing, but not body/CV/prompt.

## 16. Budget and resilience

All real model calls are off until the provider, privacy and budget are configured. Before the request, atomically reserve the cost of input/output/check/repair. One click — one idempotent operation; an HTTP retry does not mean a new generation.

Proposed configurable pilot limits: 10 requests per user per day, one active request per letter, one repair. These are product defaults, not a purchased quota and not permission to spend money.

Cancellation stops display/writing where possible, but does not guarantee the absence of a charge with the external provider. A timeout may already be billed. Budget reconciliation and the uncertain state are inherited from the original spec.

On failure the manual editor is available. Do not show a pre-written fixture as a real AI result; the fallback template is labelled as a template. Successfully saved text does not disappear because of a generator failure.

## 17. Accessibility and texts

A label on the editor is mandatory. The word counter is not announced after every character; it updates visually. `aria-live=polite` announces the start/completion and the error summary, not every token. This behaviour relies on the purpose of WCAG status messages [R3].

Keyboard actions and focus return are mandatory. After generation, do not take focus if the user is busy with another field; show the status and the link «К черновику» [To the draft]. Comparison is available without colour and drag-and-drop. On clipboard failure, offer manual selection/copying; do not show a false toast «Скопировано» [Copied].

Microcopy:
«Создать черновик» / «Create draft».
«На чём основано» / «Based on».
«Не добавлено: GraphQL не подтверждён в резюме» [Not added: GraphQL is not confirmed in the resume].
«Изменено вами. Основания нового текста не проверены» [Edited by you. The grounds of the new text have not been checked].
«Профиль обновился. Этот вариант использует предыдущую версию» [The profile has been updated. This variant uses the previous version].
«Письмо не отправляется работодателю автоматически» [The letter is not sent to the employer automatically].
«Новый вариант готов. Текущий текст не изменён» [The new variant is ready. The current text has not been changed].

## 18. Implementation plan

**CL0:** profile/rights dependencies, input/output schema, fixtures, feature flag, threats and rights.
**CL1:** UI, editor, private CRUD, versions, autosave, TXT/copy, user ownership, deletion.
**CL2:** provider abstraction, evidence selection, generation, validation, budget/idempotency.
**CL3:** job-specific integration of detail/saved and general mode from the profile; unknown/closed/conflict.
**CL4:** evaluation, accessibility, regression, rollout to a small group.

Do not multiply services. Add `packages/cover-letters` (domain/contracts/rules), API routes and a separate worker task type into the existing modular system. The presence of UI does not mean CL2 is ready.

## 19. Acceptance and quality evaluation

`acceptance-cases.json` — the specification of future backend/model checks; the actually run prototype smoke-tests are listed separately in `qa/report.json`.

For the model, assemble at least 100 permitted or synthetic CV–job pairs, including both locales, general mode, unknown skills, different professions, junior/career change, false numbers, country conflict, a remote profile, source blocks and prompt injection. This is the starting volume of the experiment, not a mathematical safety guarantee.

For critical fixtures: zero added unconfirmed achievements, unauthorized disclosures, eligibility changes and cross-user leaks. For real texts: independent annotation of atomic claims and supporting evidence; record precision, unsupported claim rate, loss of important relevant grounds, correction rate. Do not measure quality only by LLM self-assessment.

Evaluate usefulness and the need for edits with users. Copying does not mean sending or an interview. Do not promise «увеличивает шанс на N%» [increases the chance by N%] before suitable research.

## 20. Instruction to the AI developer

First read the original product spec and Atlas 1.1, then this addendum and the contract. Do not rewrite the whole product. Create a requirement → module → test map for CL0–CL4. Check the original repository; do not invent a structure that does not exist.

Implement the UI and private CRUD before the model. Connect the confirmed profile and job variants, not a repeated arbitrary CV parser. Write real tests, log only safe metadata. The mock provider and real responses are clearly distinguished.

For production it is necessary to separately verify the source, the AI provider and the limits. Do not buy subscriptions and do not enable external sends on behalf of the owner. If there is no key, local fixtures and manual mode must work, and live generation is marked unavailable.

Do not declare ready the APIs, statement validation, rights, protection and tests that are only described. In `IMPLEMENTATION_STATUS.md` separate implemented, executed, designed and blocked.

## Sources and grounds

[D1] `01_TECHNICAL_SPEC.md`, version 1.0: sections 3, 4, 6, 9, 13, 15, 16, 19, 22.
[D2] `ATLAS_DESIGN_LANGUAGE.md`, version 1.1: sections 3, 10, 13–20. Both documents are attached in the `context` folder without changes.

[R1] Harvard FAS, Mignone Center for Career Success, HES: Create Impactful Resumes and Cover Letters. Only the principle of concrete relevant examples and adaptation to the organization/role was used.
`https://careerservices.fas.harvard.edu/resources/hes-create-impactful-resumes-and-cover-letters/`

[R2] OWASP Gen AI Security Project, LLM01:2025 Prompt Injection.
`https://genai.owasp.org/llmrisk/llm01-prompt-injection/`

[R3] W3C WAI, Understanding SC 4.1.3 Status Messages, WCAG 2.2.
`https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html`

The public sources were checked during preparation. The numerical limits, architecture, behaviour and stages are proposed requirements of Atlas, not results of external research.
