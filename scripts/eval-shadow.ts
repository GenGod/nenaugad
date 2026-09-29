// CLI for shadow ranker comparison (design item A9).
//
//   npm run eval:shadow                                  champion = the feed's default order, all other versions as candidates
//   npm run eval:shadow -- --candidate=v0-status-skills-role
//   npm run eval:shadow -- --json
//
// Read-only: golden-set fixtures only, no database, no network. Exit code 1 if a
// candidate trips a guardrail — that is the gate a ranker must pass before it is
// allowed anywhere near the read path (item A10 switches the feed only behind it).
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { dedupKey } from "../src/domain/dedup.ts";
import { evaluateJob } from "../src/domain/matching.ts";
import { RANKER_VERSION, type RankableJob } from "../src/domain/match-ranker.ts";
import { FEED_DEFAULT_ORDER_ID, REGISTERED_RANKERS, rankerById } from "../src/domain/ranker-registry.ts";
import { computeRankerShadow, type RankerShadowReport } from "../src/server/ranker-shadow-service.ts";

/** The postings one golden profile can see, with the flags the guardrails check. */
function visibleFor(profileIndex: number) {
  const golden = GOLDEN_SET.profiles[profileIndex]!;
  const jobs: RankableJob[] = [];
  const items: { id: string; closed: boolean; duplicate: boolean; approvedSource: boolean }[] = [];
  const seenKeys = new Set<string>();
  for (const job of GOLDEN_SET.jobs) {
    const evaluation = evaluateJob(job.snapshot, golden.profile);
    if (evaluation.status !== "eligible" && evaluation.status !== "needs_review") continue;
    const key = dedupKey(job.snapshot);
    const duplicate = seenKeys.has(key);
    seenKeys.add(key);
    jobs.push({ snapshot: job.snapshot, status: evaluation.status, firstSeenAt: job.firstSeenAt });
    items.push({
      id: job.snapshot.id,
      closed: job.snapshot.lifecycle !== "active",
      duplicate,
      // The golden fixtures are the product's own synthetic data: they carry no
      // source policy, so approval cannot be evaluated here. That guardrail is
      // enforced (and tested) on the live path, where every posting comes from a
      // policy-checked source.
      approvedSource: true,
    });
  }
  return { golden, jobs, items };
}

function requestedCandidates(): readonly string[] {
  const requested = process.argv.find(argument => argument.startsWith("--candidate="))?.slice("--candidate=".length);
  if (requested !== undefined) {
    if (!rankerById(requested)) {
      console.error(`Unknown candidate ranker: ${requested}. Known: ${REGISTERED_RANKERS.map(r => r.id).join(", ")}`);
      process.exitCode = 1;
      return [];
    }
    return [requested];
  }
  return REGISTERED_RANKERS
    .map(ranker => ranker.id)
    .filter(id => id !== RANKER_VERSION && id !== FEED_DEFAULT_ORDER_ID);
}

const candidates = requestedCandidates();
if (candidates.length > 0) {
  const reports: { profileId: string; report: RankerShadowReport }[] = [];
  for (const [index, golden] of GOLDEN_SET.profiles.entries()) {
    const { jobs, items } = visibleFor(index);
    for (const candidate of candidates) {
      reports.push({
        profileId: golden.id,
        report: computeRankerShadow({
          jobs, items, profile: golden.profile, now: GOLDEN_SET.evaluatedAt,
          poolSize: GOLDEN_SET.jobs.length,
          championId: FEED_DEFAULT_ORDER_ID,
          candidateId: candidate,
        }),
      });
    }
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(reports.map(entry => ({
      profile: entry.profileId,
      candidate: entry.report.diff.candidateId,
      moved: entry.report.diff.moved,
      top10Changed: entry.report.diff.top10Changed,
      maxShift: entry.report.diff.maxShift,
      guardrails: entry.report.guardrails,
    })), null, 2));
  } else {
    console.log(`Ranker shadow over the golden set (${GOLDEN_SET.jobs.length} postings × ${GOLDEN_SET.profiles.length} profiles)`);
    console.log(`Champion: ${FEED_DEFAULT_ORDER_ID} (what candidates get today)\n`);
    let failed = false;
    for (const candidate of candidates) {
      const rows = reports.filter(entry => entry.report.diff.candidateId === candidate);
      const moved = rows.reduce((sum, entry) => sum + entry.report.diff.moved, 0);
      const compared = rows.reduce((sum, entry) => sum + entry.report.diff.compared, 0);
      const top10 = rows.reduce((sum, entry) => sum + entry.report.diff.top10Changed, 0);
      const maxShift = Math.max(0, ...rows.map(entry => entry.report.diff.maxShift));
      const violations = rows.flatMap(entry =>
        entry.report.guardrails.violations.map(
          violation => `${entry.profileId}:${violation.metric}=${violation.value.toFixed(3)}>${violation.limit}`));
      if (violations.length > 0) failed = true;
      console.log(candidate);
      console.log(`  positions moved ${moved}/${compared} · top-10 changed ${top10} · max shift ${maxShift}`);
      console.log(`  guardrails: ${violations.length === 0 ? "pass" : violations.join(", ")}`);
    }
    if (failed) {
      console.error("\nGUARDRAIL_FAILURE: a candidate ranker is not safe to switch on.");
      process.exitCode = 1;
    }
  }
}
