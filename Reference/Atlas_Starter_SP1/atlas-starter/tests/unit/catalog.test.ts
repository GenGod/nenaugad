import test from "node:test";
import assert from "node:assert/strict";
import { jobs } from "../../src/data/fixtures.ts";
import { isStarterJob, parseCatalogQuery, remoteGate, selectCatalog, visibleInCatalog } from "../../src/domain/job.ts";
import { fixtureRepository } from "../../src/server/storage/fixture.ts";

const first = jobs[0];
if (!first) throw new Error("Missing fixture");
const query = (text = "") => parseCatalogQuery(new URLSearchParams(text));

test("all eight fixtures satisfy the starter contract", () => {
  assert.equal(jobs.length, 8);
  assert.ok(jobs.every(isStarterJob));
});
test("catalog contains four active fully remote examples, not all seed records", () => {
  assert.equal(selectCatalog(jobs, query()).total, 4);
});
test("SP-T06 hybrid records are excluded", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, type: "hybrid" } }), false);
});
test("SP-T06 a remote tag cannot override mandatory attendance", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, mandatoryPresence: "required" } }), false);
});
test("temporary remote is excluded", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, permanent: false } }), false);
});
test("conflicting source evidence is excluded", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, conflict: true } }), false);
});
test("a positive remote assertion needs evidence", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, evidence: " " } }), false);
});
test("not-stated attendance does not negate explicit permanent remote", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, mandatoryPresence: "not_stated" } }), true);
});
test("unknown attendance is not silently approved", () => {
  assert.equal(remoteGate({ ...first, remote: { ...first.remote, mandatoryPresence: "unknown" } }), false);
});
test("closed and stale records are excluded", () => {
  assert.equal(visibleInCatalog({ ...first, lifecycle: "closed" }), false);
  assert.equal(visibleInCatalog({ ...first, lifecycle: "stale" }), false);
});
test("SP-T07 unknown geography remains unknown, not worldwide or excluded", () => {
  const orbit = selectCatalog(jobs, query("q=Orbit")).items[0];
  assert.equal(orbit?.geographyKnown, false);
  assert.equal(orbit?.geographyLabel, "Страны найма не указаны");
});
test("US-only remote appears in public catalog without personal eligibility", () => {
  const north = selectCatalog(jobs, query("q=North")).items[0];
  assert.equal(north?.geographyLabel, "Только США");
  assert.equal("eligibility" in (north ?? {}), false);
});
test("case-insensitive search does not resurrect excluded records", () => {
  const result = selectCatalog(jobs, query("q=rEaCt"));
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.id, "fern-frontend");
});
test("multiple search terms are AND, not hidden broadening", () => {
  assert.equal(selectCatalog(jobs, query("q=React+SQL")).total, 0);
});
test("empty results are explicit", () => {
  assert.equal(selectCatalog(jobs, query("q=unlisted-skill")).items.length, 0);
});
test("pagination is stable and does not mutate source data", () => {
  const copy = structuredClone(jobs);
  const a = selectCatalog(jobs, query("limit=2"));
  const b = selectCatalog(jobs, query("offset=2&limit=2"));
  assert.equal(a.total, 4);
  assert.equal(new Set([...a.items,...b.items].map(j => j.id)).size, 4);
  assert.deepEqual(jobs, copy);
});
test("query rejects oversize, duplicates, unsupported keys and invalid bounds", () => {
  for (const value of ["q="+"x".repeat(101), "q=a&q=b", "owner_id=a", "limit=0",
    "limit=51", "offset=-1", "offset=1001", "limit=1.2", "limit=02", "q=%00"]) {
    assert.throws(() => query(value), /INVALID_QUERY/u);
  }
});
test("query accepts boundary values and trims input", () => {
  assert.deepEqual(query("q=++React++&limit=50&offset=1000"), { q:"React", limit:50, offset:1000 });
});
test("unknown external records are not accepted as starter data", () => {
  assert.equal(isStarterJob({ ...first, sourceId:"himalayas" }), false);
  assert.equal(isStarterJob({ ...first, synthetic:false }), false);
  assert.equal(isStarterJob({ ...first, skills:[23] }), false);
  assert.equal(isStarterJob({ ...first, contentVersion:0 }), false);
  assert.equal(isStarterJob(null), false);
});
test("repository returns defensive copies", async () => {
  const a = await fixtureRepository.all();
  const b = await fixtureRepository.all();
  assert.notEqual(a, b);
  assert.notEqual(a[0], b[0]);
  assert.deepEqual(a, b);
});
