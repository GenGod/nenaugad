import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot, type JobSnapshot } from "../../src/domain/source-contracts.ts";
import { tombstoneSnapshot } from "../../src/domain/snapshot-projection.ts";
import { himalayasContractFixture, mapHimalayasRecord } from "../../src/server/import/himalayas-fixture.ts";
import { himalayasCandidatePolicy, sourcePublishesSnapshot } from "../../src/server/source-policies.ts";

const NOW = "2026-09-24T12:00:00.000Z";
const MARK = "PLANTED-SOURCE-TEXT";

// A mapped posting with the source's own words planted in every field the contract
// keeps them in (B62-001).
function snapshotWithTextEverywhere(): JobSnapshot {
  const base = mapHimalayasRecord(himalayasContractFixture[0]!, NOW);
  const option = base.hiring_options[0]!;
  return {
    ...base,
    title: `${MARK} title`,
    company_name: `${MARK} company`,
    description_text: `${MARK} description`,
    hiring_options: [{
      ...option,
      geography: { ...option.geography, region_text: `${MARK} region` },
      authorization: { ...option.authorization, original_text: `${MARK} authorization` },
      schedule: { ...option.schedule, original_text: `${MARK} schedule` },
    }],
    requirements: [{
      id: `req:${base.id}:1`, category: "skill", strength: "must",
      expression: { op: "atom", attribute: "skill", operator: "present", value: "go" },
      original_text: `${MARK} requirement`, evidence_ids: [],
    }],
    compensation: { ...base.compensation, original_text: `${MARK} salary` },
    evidence: base.evidence.map(item => ({ ...item, quote: `${MARK} quote` })),
  };
}

test("a tombstone keeps none of the source's words and still passes the contract (B62)", () => {
  const planted = snapshotWithTextEverywhere();
  assert.equal(isJobSnapshot(planted), true, "the planted posting is a valid snapshot");
  assert.ok(planted.evidence.length > 0, "the fixture carries evidence to blank");

  const tombstone = tombstoneSnapshot(planted);
  assert.equal(JSON.stringify(tombstone).includes(MARK), false);
  assert.equal(isJobSnapshot(tombstone), true);
  assert.equal(tombstone.lifecycle, "tombstoned");
});

test("a tombstone keeps identifiers, links, dates and the structured fields (B62)", () => {
  const planted = snapshotWithTextEverywhere();
  const tombstone = tombstoneSnapshot(planted);
  assert.equal(tombstone.id, planted.id);
  assert.equal(tombstone.source_record_id, planted.source_record_id);
  assert.equal(tombstone.source_url, planted.source_url);
  assert.equal(tombstone.apply_url, planted.apply_url);
  assert.deepEqual(tombstone.dates, planted.dates);
  assert.deepEqual(tombstone.workplace, planted.workplace);
  assert.deepEqual(tombstone.compensation.ranges, planted.compensation.ranges);
  assert.deepEqual(tombstone.evidence.map(item => item.id), planted.evidence.map(item => item.id));
  assert.deepEqual(tombstone.requirements.map(item => item.expression), planted.requirements.map(item => item.expression));
  const [kept, original] = [tombstone.hiring_options[0]!, planted.hiring_options[0]!];
  assert.deepEqual(kept.geography.allowed_countries, original.geography.allowed_countries);
  assert.equal(kept.geography.scope, original.geography.scope);
  assert.deepEqual(kept.schedule.accepted_utc_offsets_minutes, original.schedule.accepted_utc_offsets_minutes);
});

test("a private list asks the catalog's publish rule of the posting's source (B62)", () => {
  const validUntil = himalayasCandidatePolicy.valid_until;
  assert.ok(validUntil, "the himalayas policy carries a review date");
  assert.equal(sourcePublishesSnapshot("himalayas:jobs-fixture-h-001", NOW), true);
  // At its review date the policy lapses, and the source stops publishing.
  assert.equal(sourcePublishesSnapshot("himalayas:jobs-fixture-h-001", validUntil), false);
  // An unknown source, or an id without one, never publishes.
  assert.equal(sourcePublishesSnapshot("elsewhere:1", NOW), false);
  assert.equal(sourcePublishesSnapshot("himalayas", NOW), false);
  assert.equal(sourcePublishesSnapshot(":himalayas", NOW), false);
});
