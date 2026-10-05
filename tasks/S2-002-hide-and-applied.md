# S2-002 — hiding jobs with reasons and a manual applied mark

**Result:** the user hides a job from matching with an irrelevance reason (a
fixed code), sees and returns the hidden ones on the «Сохранённое» page; on
the saved ones they manually mark that an application was sent (a click on
the external link marks nothing — spec 4.3).

**Not included:** a free-text reason (a privacy minimum, v1 — codes only),
hiding in the public catalog (it is not personalized), application reminders,
send auto-detection.

**Context:** spec 4.3; SP 8 (ownership); S2-001 (saved_jobs, matched).

## Acceptance
1. Migration 0008: `hidden_jobs` (PK user+snapshot, FK cascade, a reason-code
   CHECK) + `saved_jobs.marked_applied_at timestamptz NULL`.
2. The reasons — a fixed set of codes (salary/geography/level/stack/company/
   unclear conditions/other); an invalid code → 400.
3. Hiding: from a matching card (an inline reason selection → hide); the
   hidden job disappears from eligible and needs_review; returning — from the
   «Скрытые» section on /saved. A non-saved job can be hidden too.
4. The applied mark: a button on the saved ones, «Отклик отправлен ✓ (дата)»;
   removal — by pressing again; it is set only by a user action.
5. Ownership: all operations via the session; B does not see/return/change
   A's data (negative tests); someone else's/nonexistent snapshot → 404.
6. e2e: hide from /matched with a reason → gone from matching → visible in
   the «Скрытых» with the reason → return → back in matching; mark applied →
   a badge with the date; 401 anonymously.

**Risk:** ordinary. **Rollback:** do not roll back the migration blindly; a UI
feature does not break the existing scenarios.
