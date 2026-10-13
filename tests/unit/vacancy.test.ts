import assert from "node:assert/strict";
import { test } from "node:test";
import { isTalentPoolTitle } from "../../src/domain/vacancy.ts";
import { classifySnapshot } from "../../src/domain/snapshot-projection.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";

// B40 (owner decision 2026-10-13): an invitation to a candidate pool is not a vacancy.
// The five titles are the local catalog's on 2026-10-13; the near misses are real
// titles from the same catalog that must stay.
test("talent-pool titles are told apart from vacancies (B40)", () => {
  for (const title of [
    "Join Our Talent Community", "Talent Pool", "Case Manager - TALENT POOL",
    "Talent Network Application - Contract Public Relations & Communications Professi",
    "General Application - CMMC Services", "Open Application", "talent network",
  ]) {
    assert.equal(isTalentPoolTitle(title), true, title);
  }
  for (const title of [
    "Talent Acquisition Partner, Riyadh (Remote, SAU)", "Talent Sourcer",
    "Mobile Application Developer - AI Finance Agent", "Staff Application Security Engineer",
    "Product Manager – Business Applications", "Head of Talent & Performance (Fractional)",
    "Open Source Engineer", "General Manager", "",
  ]) {
    assert.equal(isTalentPoolTitle(title), false, title);
  }
});

test("a talent-pool posting leaves the catalog and the matched feed (B40)", () => {
  const [template] = mapHimalayasFixture("2026-10-13T12:00:00.000Z");
  assert.ok(template);
  const vacancy = { ...template, workplace: { ...template.workplace, verification_state: "confirmed" as const } };
  assert.equal(classifySnapshot(vacancy), "main_catalog", "the fixture is a publishable vacancy");
  assert.equal(classifySnapshot({ ...vacancy, title: "Join Our Talent Community" }), "excluded");
});
