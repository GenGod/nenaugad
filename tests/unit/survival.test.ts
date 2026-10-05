import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LONG_LISTED_NOTE,
  SURVIVAL_CONSTANTS,
  SURVIVAL_VERSION,
  availabilityNoteFor,
  survivalBucket,
  urgencyDemotion,
} from "../../src/domain/survival.ts";

// B6 (design item B6): the urgency/survival PROXY. The curve is provisional —
// the local catalog has zero observed disappearances (see the module header) —
// so these tests pin the STRUCTURE the brief asks for: monotone buckets on a
// synthetic age distribution (V4), the hazard window's shape, and honest copy
// (V2: no digits, no countdown, no promise).

// A synthetic "disappearance distribution": how often a posting of a given age
// has closed. Monotone in age by construction — the tests below assert that the
// bucket vocabulary and the demotion never contradict this ordering.
function syntheticClosureRateByAge(): ReadonlyMap<number, number> {
  const rates = new Map<number, number>();
  for (let age = 0; age <= 180; age += 1) {
    // Closures cluster in the first weeks (research part 2 B3): a placeholder
    // shape, used only to check that our buckets do not reverse it.
    rates.set(age, age <= 45 ? age / 45 : Math.max(0, 1 - (age - 45) / 90));
  }
  return rates;
}

test("V4: the bucket vocabulary is monotone on a synthetic age distribution", () => {
  // recent (< 2 weeks) -> weeks (< 2 months) -> long; no age ever moves back.
  const order = ["recent", "weeks", "long"] as const;
  let previous = -1;
  for (let age = 0; age <= 365; age += 1) {
    const bucket = survivalBucket(age);
    const rank = order.indexOf(bucket as (typeof order)[number]);
    assert.ok(rank >= previous, `age ${age}: bucket ${bucket} moved backwards`);
    previous = rank;
  }
  assert.equal(survivalBucket(null), "unknown");
  assert.equal(survivalBucket(0), "recent");
  assert.equal(survivalBucket(SURVIVAL_CONSTANTS.windowStartDays - 0.01), "recent");
  assert.equal(survivalBucket(SURVIVAL_CONSTANTS.windowStartDays), "weeks");
  assert.equal(survivalBucket(SURVIVAL_CONSTANTS.longListedDays), "long");
});

test("V4: the hazard window rises to the peak and decays — never a cliff, never positive", () => {
  const { windowStartDays, windowPeakDays, windowEndDays, windowMaxDemotion } = SURVIVAL_CONSTANTS;
  assert.equal(urgencyDemotion(null), 0, "unknown age is not suspicion, not urgency");
  assert.equal(urgencyDemotion(0), 0);
  assert.equal(urgencyDemotion(windowStartDays), 0);
  assert.equal(urgencyDemotion(windowEndDays), 0);
  assert.equal(urgencyDemotion(400), 0, "long-lived postings are evergreen, not urgent");
  assert.equal(urgencyDemotion(windowPeakDays), windowMaxDemotion, "the peak is the documented cap");
  let previous = 0;
  for (let age = windowStartDays; age <= windowPeakDays; age += 1) {
    const demotion = urgencyDemotion(age);
    assert.ok(demotion <= previous, `age ${age}: demotion rose (${demotion} > ${previous})`);
    assert.ok(demotion >= windowMaxDemotion && demotion <= 0, `age ${age}: out of bounds (${demotion})`);
    previous = demotion;
  }
  let after: number = windowMaxDemotion;
  for (let age = windowPeakDays; age <= windowEndDays; age += 1) {
    const demotion = urgencyDemotion(age);
    assert.ok(demotion >= after, `age ${age}: decay moved down (${demotion} < ${after})`);
    after = demotion;
  }
});

test("V4: the window's ordering follows the synthetic closure rates", () => {
  // Two postings of different ages, everything else equal: the one whose age
  // carries the higher synthetic closure rate must never be demoted less.
  const rates = syntheticClosureRateByAge();
  for (const [older, younger] of [[45, 5], [45, 80], [30, 90], [60, 90]] as const) {
    const olderRate = rates.get(older) ?? 0;
    const youngerRate = rates.get(younger) ?? 0;
    if (olderRate > youngerRate) {
      assert.ok(urgencyDemotion(older) <= urgencyDemotion(younger),
        `age ${older} (rate ${olderRate}) vs ${younger} (rate ${youngerRate})`);
    }
  }
});

test("V2 copy: the note never carries a number, a countdown or a promise", () => {
  const long = availabilityNoteFor("2026-06-21T08:00:00.000Z", "2026-10-04T08:00:00.000Z", null);
  assert.equal(long, LONG_LISTED_NOTE);
  const suspicious = availabilityNoteFor("2026-09-01T08:00:00.000Z", "2026-10-04T08:00:00.000Z", {
    consecutiveInactive: 1, lastResult: "inactive",
  });
  assert.ok(suspicious !== null && suspicious.length > 0);
  for (const note of [long, suspicious]) {
    assert.ok(note !== null);
    assert.doesNotMatch(note, /\d/u, `no digits in copy: "${note}"`);
    assert.doesNotMatch(note, /осталось|закроется|скоро|через/iu, `no countdown/promise: "${note}"`);
    assert.match(note, /возможно/iu, "a claim we cannot verify is stated as a possibility");
  }
});

test("the note picks the strongest fact and stays silent otherwise", () => {
  const now = "2026-10-04T08:00:00.000Z";
  // A failed check outranks the age caution (A10's fact is stronger than age).
  const suspicious = availabilityNoteFor("2026-06-21T08:00:00.000Z", now, {
    consecutiveInactive: 1, lastResult: "inactive",
  });
  assert.match(suspicious ?? "", /Возможно неактивна/u);
  // Weeks-old: the observed-date label already covers it — no invented copy.
  assert.equal(availabilityNoteFor("2026-09-20T08:00:00.000Z", now, null), null);
  // Fresh and unknown-age: nothing to say.
  assert.equal(availabilityNoteFor("2026-10-03T08:00:00.000Z", now, null), null);
  assert.equal(availabilityNoteFor(undefined, now, null), null);
  assert.equal(availabilityNoteFor("not-a-date", now, null), null);
  // An `unknown` check result is not suspicion (the closure-checks guard).
  assert.equal(availabilityNoteFor("2026-09-20T08:00:00.000Z", now, { consecutiveInactive: 0, lastResult: "unknown" }), null);
});

test("determinism: same inputs, same values; the version is named", () => {
  assert.equal(SURVIVAL_VERSION, "survival-l1");
  for (const age of [null, 0, 13, 14, 30, 45, 60, 89, 90, 200]) {
    assert.equal(urgencyDemotion(age), urgencyDemotion(age));
  }
});
