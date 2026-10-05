# S3-003 — the PDF parser: the text layer offline with honest degradation

**Result:** a `.pdf` upload extracts the text layer through the same private
pipeline (limits/warnings/minimization); scan/encryption/no layer → a clear
refusal with a suggestion of the text form — not silent garbage.

**Not included:** OCR, rendering, layouts (columns/tables — a line-by-line
heuristic), LibreOffice-class accuracy; replacing it with pdfjs-dist is a
separate owner decision if the DIY quality proves insufficient on real CVs.

**Context:** spec 9.1 (30 PDF pages; a scan → text/manual form), 9.3
(deterministic first); S3-001 (parse.ts, the limits).

## Acceptance
1. Guards: the %PDF signature; `/Encrypt` → PDF_ENCRYPTED; more than 30 pages
   → PDF_TOO_MANY_PAGES (a count of /Type /Page; 0 — without a count, but with
   a character limit); FlateDecode decompression with a ceiling
   (maxOutputLength).
2. Text: the Tj/TJ/' operators from content streams (escape sequences,
   octal); the ToUnicode CMap (beginbfchar/beginbfrange, 2-byte codes) for
   subset fonts — the "printable ASCII directly, otherwise the map" heuristic;
   uncovered codes → a replacement, with >30% garbage the stream is discarded.
3. Quality: 0 characters → PDF_NO_TEXT_LAYER (a scan?) with the text form; a
   thin layer (<200) and unusual characters — warnings as in S3-001.
4. Integration: parseUploadedFile routes PDFs into the parser; human-readable
   errors; the existing limits (10 MB / 150k) on top.
5. Tests: programmatic PDF fixtures (simple ASCII; Cyrillic via a CMap;
   encrypted; 31 pages; image-only → NO_TEXT_LAYER; an inflate bomb); e2e —
   uploading a .pdf with text.
6. No new dependencies; nothing is executed; the PDF remains an
   unprivileged input.

**Risk:** ordinary (the parser is a pure function over a buffer).
**Rollback:** return PDF_NOT_SUPPORTED in the routing.
