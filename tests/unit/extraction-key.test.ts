// The paid extraction is recognized by its input, not by the posting version
// (docs/OPEN_GAPS.md B28): a re-map that leaves title, company and description alone
// must find the record it already paid for, and any change to them must not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractionKey } from "../../src/server/ai/extraction-service.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

const posting = mapHimalayasFixture("2026-10-06T12:00:00.000Z")[0]!;

test("extraction key: a new posting version with the same input keeps its key (B28)", () => {
  const option = posting.hiring_options[0]!;
  const geographyOnly: JobSnapshot = {
    ...posting, version: posting.version + 1,
    hiring_options: [{ ...option, geography: { ...option.geography, scope: "restricted", allowed_countries: ["US"] } }],
    conflicts: ["geography-source-vs-text"],
  };
  assert.equal(extractionKey(geographyOnly), extractionKey(posting));
});

test("extraction key: a changed title, company or description is a new input (B28)", () => {
  const key = extractionKey(posting);
  for (const changed of [
    { ...posting, title: `${posting.title} II` },
    { ...posting, company_name: `${posting.company_name} Ltd` },
    { ...posting, description_text: `${posting.description_text} Updated requirements.` },
  ]) {
    assert.notEqual(extractionKey(changed), key);
  }
  // Text moved between two fields is another input, not the same concatenation.
  assert.notEqual(
    extractionKey({ ...posting, title: "Engineer\nNorthwind", company_name: "Labs" }),
    extractionKey({ ...posting, title: "Engineer", company_name: "Northwind\nLabs" }));
  // Another posting with the same text keeps its own record.
  assert.notEqual(extractionKey({ ...posting, id: "himalayas:jobs-other" }), key);
});
