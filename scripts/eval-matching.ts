// CLI for the matching golden-set evaluation (design item A1).
//
//   npm run eval:matching            table summary
//   npm run eval:matching -- --json  machine-readable report
//   npm run eval:matching -- --verbose  per-profile ranked list with grades
//
// Read-only: it scores fixtures, touches no database and no network. The
// ratcheted thresholds that actually gate the pipeline live in
// tests/unit/matching-eval.test.ts; this script is the human-facing report.
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { dictionaryWorklist } from "../src/domain/dictionary-coverage.ts";
import { runMatchingEval, type ProfileEval } from "../src/domain/matching-eval.ts";
import type { MetricValue } from "../src/domain/eval-metrics.ts";

function format(value: MetricValue): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printProfileRow(profile: ProfileEval): void {
  console.log([
    pad(profile.profileId, 18),
    pad(String(profile.shownIds.length), 6),
    pad(String(profile.shownIds.length - profile.unjudgedShown.length), 9),
    pad(String(profile.relevantShown.length), 9),
    pad(format(profile.recallAt5), 8),
    pad(format(profile.recallAt10), 8),
    pad(format(profile.ndcgAt5), 8),
    pad(format(profile.ndcgAt10), 8),
    format(profile.mrr),
  ].join(" "));
}

function printVerbose(reportProfiles: readonly ProfileEval[], gradesByProfile: ReadonlyMap<string, Readonly<Record<string, number>>>): void {
  for (const profile of reportProfiles) {
    const grades = gradesByProfile.get(profile.profileId) ?? {};
    console.log(`\n${profile.profileId} — ${profile.segment}`);
    profile.shownIds.forEach((id, index) => {
      const grade = grades[id] ?? -1;
      console.log(`  ${String(index + 1).padStart(2)}. ${id}  grade ${grade < 0 ? "?" : grade}`);
    });
  }
}

const report = runMatchingEval(GOLDEN_SET);
const gradesByProfile = new Map(GOLDEN_SET.judgments.map(judgment => [judgment.profileId, judgment.grades]));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (process.argv.includes("--verbose")) {
  printVerbose(report.profiles, gradesByProfile);
} else {
  console.log(`Matching golden-set evaluation — set ${report.setId} v${report.setVersion}, ruleset v${report.rulesetVersion}, ranker ${report.rankerVersion}`);
  console.log(`Grades: ${report.gradesLegend}\n`);
  console.log([
    pad("profile", 18), pad("shown", 6), pad("judged", 9), pad("relevant", 9),
    pad("R@5", 8), pad("R@10", 8), pad("NDCG@5", 8), pad("NDCG@10", 8), "MRR",
  ].join(" "));
  for (const profile of report.profiles) printProfileRow(profile);
  console.log("\nAggregate over " + report.aggregate.applicableProfiles + " profiles with applicable metrics:");
  console.log(`  R@5 ${format(report.aggregate.recallAt5)} · R@10 ${format(report.aggregate.recallAt10)} · NDCG@5 ${format(report.aggregate.ndcgAt5)} · NDCG@10 ${format(report.aggregate.ndcgAt10)} · MRR ${format(report.aggregate.mrr)}`);
  console.log(`Guards: unjudged shown ${report.guards.unjudgedShown} (must be 0) · relevant but hidden ${report.guards.relevantHidden} (must be 0)`);
  // Vocabulary worklist (item A3): candidates for the dictionary, reviewed by a
  // human before anything is added. Not a quality metric — see the module note.
  const worklist = dictionaryWorklist(GOLDEN_SET.jobs.map(job => `${job.snapshot.title} ${job.snapshot.description_text}`));
  console.log(`\nDictionary v${worklist.dictionaryVersion}: ${worklist.tokenCount} tokens in ${GOLDEN_SET.jobs.length} postings · ${worklist.distinctUnknownCount} distinct unknown (${worklist.unknownTokenCount} occurrences)`);
  const repeated = worklist.topUnknown;
  console.log(repeated.length === 0
    ? "No unknown token repeats — nothing to review."
    : `Worklist (human review, never auto-added): ${repeated.map(item => `${item.token}(${item.count})`).join(", ")}`);
}
