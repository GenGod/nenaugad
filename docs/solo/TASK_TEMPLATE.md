# Nenaugad task template

Use the existing issue/tracker or a single task file. No new tool is needed.

## Result and boundaries
**ID / name:**  
**User result:** one verifiable action/scenario.  
**Not included:** 2–4 explicit boundaries.  
**Context:** real paths, the existing implementation, the needed sections of SP/ТЗ/Atlas/CL.  
**Risk:** low / ordinary / high; the reason.  
**Data:** synthetic / permitted real; what must not be read or transferred.

## Acceptance and implementation
3–7 observable conditions. For a private/paid feature — a negative check and a failure scenario.
A short plan; permissible areas of change; dependencies; a way to disable/roll back.
Expectations are fixed before the code, and are not adjusted to match the result.

## Approvals and limits
Local coding and tests — within the working environment.
Provider / model / purpose / data / budget — not approved until explicitly stated.
Live AI, paid sources, external CVs and deploy — disabled by default.
Coding-host spend: visible / not visible; an estimate is not passed off as the actual bill.
Repairs: at most two cycles with a new hypothesis. The limit is not reset by a new session.

## Checks and report
Take the commands from the repository. Unit/integration/E2E, the manual path, the needed SP-Txx, viewport for the UI.
High risk — a separate review.
Report: what works; files; commands + exit code; limitations; mock/live; costs/unknown; owner decision.

---

## Example: CL-CRUD-01 — private manual draft

**Result:** an authorized user creates, edits and reopens their letter draft.

**Not included:** AI, CV upload, PDF/DOCX export, sending, a new navigation section.

**Context:** find the real auth, profile, database and Nenaugad components. Do not create a second authorization. A confirmed manual profile is acceptable.

**Risk:** high because of personal text.

**Acceptance:**
1. The owner is taken from the server session; a passed foreign owner is not used.
2. The saved text opens after re-login; the save status appears after the server response.
3. User B does not read, change or delete A's draft by a known ID.
4. Two tabs do not silently overwrite changes: the expected version is checked.
5. Profile deletion deletes the derived draft according to the adopted policy.
6. There are no AI calls in the scenario; personal text does not get into the logs.
7. The editor is accessible from the keyboard and at 390 px, the Atlas 1.1 style is preserved.

**Approval:** local/test only on synthetic profiles; without new costs and deploy.
The criteria are not considered met until real checks are done.
