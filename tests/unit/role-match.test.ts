import assert from "node:assert/strict";
import { test } from "node:test";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import {
  parseManualProfileInput, profileFromDocuments, buildProfileDocuments,
} from "../../src/domain/profile.ts";
import { rankJobs, RANKER_WEIGHTS } from "../../src/domain/match-ranker.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

// B6: the role boost used substring matching — it missed "Frontend Engineer"
// for the role "frontend developer" and fired inside longer words.
const NOW = "2026-09-24T12:00:00.000Z";

function profileWithRoles(targetRoles: readonly string[]) {
  const base = {
    residenceCountry: "DE", timezone: "Europe/Berlin",
    targetRoles: [...targetRoles], skills: [], employmentTypes: ["contractor"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
  };
  const documents = buildProfileDocuments({
    userId: "u_test", version: 1, input: parseManualProfileInput(base),
  });
  return profileFromDocuments(documents.candidate, documents.search).input;
}

function jobWithTitle(title: string): JobSnapshot {
  return { ...mapHimalayasFixture(NOW)[0]!, title };
}

function score(title: string, roles: readonly string[]): number {
  const ranked = rankJobs(
    [{ snapshot: jobWithTitle(title), status: "eligible" }], profileWithRoles(roles), NOW,
  );
  return ranked[0]!.score;
}

test("role boost: whole words with head synonymy, never substrings", () => {
  // The control profile carries a role that cannot match any of the titles.
  const control = ["backend developer"];
  const withRole = score("Senior Frontend Engineer (React)", ["frontend developer"]);
  const withoutRole = score("Senior Frontend Engineer (React)", control);
  assert.equal(withRole - withoutRole, RANKER_WEIGHTS.targetRoleInTitle,
    "«Frontend Engineer» must get the boost for the role «frontend developer»");

  assert.equal(
    score("Data Engineering Manager", ["data engineer"]),
    score("Data Engineering Manager", control),
    "«data engineer» must not match inside «Data Engineering Manager»",
  );
  assert.equal(
    score("QA Engineering Lead", ["qa engineer"]),
    score("QA Engineering Lead", control),
    "«engineer» must not match «engineering»",
  );
  assert.equal(
    score("Frontend Developer", ["frontend developer"]) - score("Frontend Developer", control),
    RANKER_WEIGHTS.targetRoleInTitle,
    "an exact phrase still matches",
  );
});
