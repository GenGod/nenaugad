// One-page contract smoke for the Himalayas feed. Fetches limit=2, maps and
// validates the records, stores nothing. Owner-run tool: verifies the live
// contract (date units, field shapes) before/after activation.
import { fetchHimalayasPage } from "../src/server/import/fetcher.ts";
import {
  mapHimalayasRecord, AdapterInputError, type HimalayasRawRecord,
} from "../src/server/import/himalayas-fixture.ts";
import { isJobSnapshot } from "../src/domain/source-contracts.ts";

const page = await fetchHimalayasPage({ limit: 2 });
if (page.status !== "ok") {
  console.error(JSON.stringify({ result: "failed", status: page.status }));
  process.exit(1);
}
const now = new Date().toISOString();
const mapped = page.jobs.map(raw => {
  try {
    const snapshot = mapHimalayasRecord(raw as HimalayasRawRecord, now);
    return { id: snapshot.id, valid: isJobSnapshot(snapshot),
      pubDate: snapshot.dates.source_published_at,
      geography: snapshot.hiring_options[0]?.geography.scope ?? null,
      workplace: snapshot.workplace.type,
      salary: snapshot.compensation.original_text };
  } catch (error) {
    return { error: error instanceof AdapterInputError ? error.message : "UNKNOWN" };
  }
});
console.log(JSON.stringify({
  result: mapped.length > 0 && mapped.every(entry => "valid" in entry && entry.valid)
    ? "contract_ok" : "contract_violation",
  hasNextCursor: page.nextCursor !== null,
  records: mapped,
}, null, 1));
process.exit(0);
