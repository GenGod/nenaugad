# S4-001 — letters: private CRUD, editor, generation via GPT-6 Luna

**Result:** a signed-in user creates a letter from a job, generates a draft
via GPT-6 Luna (the full AI-guards stack), edits it, sees versions,
copies/downloads TXT, deletes. Everything ownership-scoped.

**Not included:** general mode (without a job), a side-by-side version
comparison, autosave with debounce (an explicit save by button), a repair
loop, needs_input detection (v1: the raw answer into the draft, the validator
is the next slice), the job-evidence panel «На чём основано», a tab conflict
(an If-Match stub).

**Context:** CL 1.0 in full; spec 4.1-4.3; SP 7 (the letter); AI-001/002.

## Acceptance
1. Migration 0010: `cover_letters` (owner, job_id, status, current_version)
   + `cover_letter_revisions` (letter FK, version, body, origin, model,
   content_hash, created_at). An ownership CHECK via FK to users.
2. POST `/api/v1/cover-letters` {jobId} → creation without an AI call; 409 if
   a letter for this user+job pair already exists.
3. POST `/api/v1/cover-letters/{id}/generations` → via executeGuardedOperation
   (reserve → dispatch → settlement); the model's answer is saved as a new
   revision (origin=generated); 402 when the budget is exhausted; an
   Idempotency-Key is mandatory (header).
4. PATCH `/api/v1/cover-letters/{id}/draft` {body, expectedVersion} →
   a new revision (origin=user_edited); 409 on a version conflict.
5. GET `/api/v1/cover-letters/{id}` → the document + revisions + current.
6. GET `/api/v1/cover-letters/{id}/export?format=txt` → text/plain.
7. DELETE → deletes the letter and the revisions.
8. UI `/letters/[id]`: an editor (textarea), the status (generated_checked/
   user_edited_unchecked), versions (a list + selection), «Скопировать»,
   «Сохранить TXT», «Создать черновик» (the AI-generation button with a notice
   about processing via OpenAI), deletion. In Atlas 1.1 style.
9. Entry from matching: the «Составить письмо» button on a /matched card.
10. Tests: integration (ownership, versions, 409, budget), e2e (creation →
    generation → editing → TXT).

**Risk:** high (paid AI + personal data). **Rollback:** do not roll back the
migration; the AI calls are controlled by the budget.
