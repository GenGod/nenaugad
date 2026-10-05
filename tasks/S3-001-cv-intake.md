# S3-001 — CV intake: text/txt/md/docx → private review → manual confirmation

**Result:** a signed-in user pastes text or uploads .txt/.md/.docx; a parser
without network extracts the text with limits and warnings; the file is stored
privately (ownership), can be reviewed and is deleted together with the
profile; filling the profile is done by hand from one's own text (no
auto-inference: draft ≠ fact, spec 9.3: deterministic first, AI optional and
later).

**Not included:** a PDF parser (the next slice; PDF is now honestly rejected
with a suggestion of the text form), OCR, AI extraction (before paid AI,
budgets/quotas/deadlines per AGENTS are mandatory), storing the original
binary (minimization: only the extracted text + metadata), auto-filling of
profile fields.

**Context:** spec 9.1–9.3 (limits 10 MB / 150k characters; DOCX — unpacking
limits; a parser without network, without execution; scan/unsupported →
text/manual form), 8 (files are private, ownership), 4.1 (before sending to
AI — a notice; we have no AI); SP 8.

## Acceptance
1. Intake: a text paste and a .txt/.md/.docx upload; PDF/other — an explicit
   refusal with an explanation and a suggestion of the text form; a signature
   check (PK for docx), not by extension.
2. Limits (fail-closed): a file ≤10 MB; DOCX: ≤200 entries, a cumulative
   decompressed ≤20 MB (maxOutputLength), encrypted entries — refusal; the
   extracted text ≤150 000 characters — otherwise a refusal with a clear error.
3. Parser: only node:zlib, no network and no execution of anything; the text
   from `word/document.xml` (w:t, paragraphs), XML-entity decode; empty text —
   a warning, not an empty success.
4. Privacy/ownership: list/review/delete only by the session owner;
   unauthorized → 401; someone else's id → 404; deleting the profile deletes
   the CV too.
5. UPLOADS_ENABLED: a local explicit flag (default false = routes disabled,
   503); e2e enables it only in the test environment.
6. Tests: unit (docx happy/zip-bomb/limits/pdf-refusal), integration
   (ownership, deletion), e2e (paste → review → delete; 401).
7. No AI calls; the text does not leave the local DB; logs without content.

**Risk:** high (upload, personal data) — a separate owner review; flag
activation is by their decision upon acceptance.
**Rollback:** UPLOADS_ENABLED=false; do not reset the table blindly.
