// S1-006: the Remote First Jobs source — policy, mapper, remote rule, window import
// and transport. Every record here is synthetic.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isJobSnapshot, isSourcePolicy, SNAPSHOT_ID_PATTERN, SNAPSHOT_SOURCE_IDS,
  SOURCE_POLICY_PERMISSIONS, type JobSnapshot,
} from "../../src/domain/source-contracts.ts";
import {
  mapRemoteFirstJobsFixture, mapRemoteFirstJobsRecord, remoteFirstJobsContractFixture,
  remoteFirstJobsExcerptOf, type RemoteFirstJobsRawRecord,
} from "../../src/server/import/remote-first-jobs-fixture.ts";
import {
  REMOTE_FIRST_JOBS_PAGE_SIZE, runRemoteFirstJobsImport,
} from "../../src/server/import/remote-first-jobs-adapter.ts";
import { AdapterInputError, mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { mapJobicyFixture } from "../../src/server/import/jobicy-fixture.ts";
import { createMemoryPersistence } from "../../src/server/import/himalayas-adapter.ts";
import { fetchRemoteFirstJobsPage, type FetchPageResult } from "../../src/server/import/fetcher.ts";
import {
  getSourcePolicy, maySendTextToProvider, permissionFor, remoteFirstJobsCandidatePolicy,
} from "../../src/server/source-policies.ts";
import { classifySnapshot, policyPublishes } from "../../src/domain/snapshot-projection.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import { parseManualProfileInput } from "../../src/domain/profile.ts";
import { parseEventBatch } from "../../src/domain/events.ts";

const NOW = "2026-11-02T12:00:00.000Z";
// The policy as activated 2026-11-02; tests derive the switched-off forms from it.
const activePolicy = remoteFirstJobsCandidatePolicy;
const [remoteJob, hybridJob, silentJob] = remoteFirstJobsContractFixture as
  readonly [RemoteFirstJobsRawRecord, RemoteFirstJobsRawRecord, RemoteFirstJobsRawRecord];

// Invisible characters and a ligature, from code points so the source shows what they are.
const [ZERO_WIDTH_SPACE, WORD_JOINER, FFI_LIGATURE] = [0x200b, 0x2060, 0xfb03].map(code => String.fromCodePoint(code));

function posting(title: string, description: string): JobSnapshot {
  return mapRemoteFirstJobsRecord({ ...silentJob, title, description: `<p>${description}</p>` }, NOW);
}

function rejectionOf(raw: RemoteFirstJobsRawRecord): string | null {
  try {
    mapRemoteFirstJobsRecord(raw, NOW);
    return null;
  } catch (error) {
    assert.ok(error instanceof AdapterInputError);
    return error.message;
  }
}

function geoRule(snapshot: JobSnapshot, residenceCountry: string) {
  const profile = parseManualProfileInput({
    residenceCountry, timezone: null, targetRoles: ["engineer"], skills: [],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
  });
  return evaluateJob(snapshot, profile).rules.find(rule => rule.ruleId === "GEO-01")?.outcome;
}

// A paged stand-in for the transport: answers page n with pages[n] and records the calls.
function pagedFeed(pages: readonly FetchPageResult[]) {
  const asked: number[] = [];
  return {
    asked,
    transport: async (page: number): Promise<FetchPageResult> => {
      asked.push(page);
      return pages[page] ?? { status: "ok", jobs: [], nextCursor: null };
    },
  };
}

// A full page of distinct synthetic jobs, so the walk does not stop early.
function fullPage(page: number): FetchPageResult {
  return {
    status: "ok", nextCursor: null,
    jobs: Array.from({ length: REMOTE_FIRST_JOBS_PAGE_SIZE }, (_, index) => {
      const id = `fixture-job-${page}-${index}`;
      return { ...remoteJob, id, url: `https://remotefirstjobs.com/companies/northwind-fixtures/jobs/${id}` };
    }),
  };
}

test("policy: approved and activated; rollback by enabled: false denies everything", () => {
  const policy = remoteFirstJobsCandidatePolicy;
  assert.equal(isSourcePolicy(policy), true);
  assert.equal(getSourcePolicy("remote_first_jobs"), policy);
  // Owner approval of the matrix and activation, both 2026-11-02.
  assert.equal(policy.status, "approved");
  assert.equal(policy.approved_by, "owner");
  assert.equal(policy.enabled, true);
  assert.equal(permissionFor(policy, "fetch", NOW), "allowed");
  assert.equal(policyPublishes(policy, NOW), true);
  // Active or not, its text never goes to the provider.
  assert.equal(maySendTextToProvider("remote_first_jobs", NOW), false);
  // Rollback without other code changes: a disabled or pending clone denies every operation.
  for (const off of [{ ...policy, enabled: false }, { ...policy, status: "pending" as const }]) {
    for (const permission of SOURCE_POLICY_PERMISSIONS) {
      assert.equal(permissionFor(off, permission, NOW), "denied", permission);
    }
    assert.equal(policyPublishes(off, NOW), false); // 0 cards in catalog and matching
  }
});

test("policy: the matrix holds the owner decisions of 2026-11-02", () => {
  const permissions = remoteFirstJobsCandidatePolicy.permissions;
  for (const permission of ["fetch", "cache", "store_full_text", "store_excerpt",
    "derive_fields", "publish_excerpt", "process_with_ml"] as const) {
    assert.equal(permissions[permission], "allowed", permission);
  }
  // Local ML only: provider transfer is not granted, and no clone of the policy can
  // send text out while it stays unknown.
  assert.equal(permissions.send_to_ai_provider, "unknown");
  assert.equal(permissionFor(activePolicy, "send_to_ai_provider", NOW), "unknown");
  // Google Jobs is named in the source's own rules.
  for (const permission of ["publish_full_text", "send_email", "index_web_page",
    "syndicate_google_jobs", "train_model", "direct_apply", "bulk_export"] as const) {
    assert.equal(permissions[permission], "denied", permission);
  }
  assert.equal(remoteFirstJobsCandidatePolicy.min_poll_interval_seconds, 21600);
  assert.equal(remoteFirstJobsCandidatePolicy.attribution.backlink_required, true);
  assert.equal(remoteFirstJobsCandidatePolicy.attribution.display_name, "Remote First Jobs");
  // Approved and enabled, it publishes; the expiry still applies.
  assert.equal(policyPublishes(activePolicy, NOW), true);
  assert.equal(permissionFor(activePolicy, "fetch", "2026-12-23T00:00:00.000Z"), "denied");
});

test("mapper: the fixture validates, ids are stable, and each work mode lands where decided", () => {
  const snapshots = mapRemoteFirstJobsFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true, snapshot.id);
  assert.deepEqual(snapshots.map(s => s.id), mapRemoteFirstJobsFixture("2026-11-03T00:00:00.000Z").map(s => s.id));

  const [remote, hybrid, silent] = snapshots as [JobSnapshot, JobSnapshot, JobSnapshot];
  assert.equal(remote.id, "remote_first_jobs:platform-engineer-synthetic-fixture-900101");
  assert.equal(remote.source_url, remoteJob.url);
  assert.equal(remote.apply_url, null);
  assert.equal(remote.workplace.verification_state, "confirmed");
  assert.equal(classifySnapshot(remote), "main_catalog");
  // The evidence quotes the posting's own words.
  assert.equal(remote.evidence.find(item => item.id.endsWith(":workplace"))?.quote, "Remote");

  assert.equal(hybrid.workplace.verification_state, "conflicting");
  assert.equal(hybrid.workplace.mandatory_onsite, "required");
  assert.deepEqual(hybrid.conflicts, ["remote-claim-vs-office-text"]);
  assert.equal(classifySnapshot(hybrid), "excluded");

  assert.equal(silent.workplace.verification_state, "unknown");
  assert.equal(classifySnapshot(silent), "needs_review");
});

test("remote rule: the posting's own words confirm, contradict or leave it open", () => {
  const table: readonly (readonly [string, string, string])[] = [
    // Confirmed: a remote label in the title or a remote statement in the text.
    ["Analytics Engineer (Remote)", "Build models.", "main_catalog"],
    ["Analytics Engineer - Remote", "Build models.", "main_catalog"],
    ["Ads Manager (m/w/d) · Remote", "Build campaigns.", "main_catalog"],
    ["Sales Rep - 100% Remote - US", "Sell.", "main_catalog"],
    ["Analytics Engineer", "Location: Remote. Build models.", "main_catalog"],
    ["Analytics Engineer", "We are a fully-remote team.", "main_catalog"],
    ["Analytics Engineer", "Work from anywhere in the Netherlands.", "main_catalog"],
    ["Analytics Engineer", "This role is remote.", "main_catalog"],
    ["Hybrid Cloud Engineer (Remote)", "Design hybrid cloud networks.", "main_catalog"],
    ["Engineer (Remote)", "Set up your home office as you like.", "main_catalog"],
    // Open: nothing says remote, or "Remote" only starts a job name, or the company's
    // culture is the only remote statement.
    ["Analytics Engineer", "Build models with a great team.", "needs_review"],
    ["Remote Sensing Scientist", "Join our lab in Denver, CO.", "needs_review"],
    ["Remote Operations Center Technician", "Shift work at our control room in Houston.", "needs_review"],
    ["Analytics Engineer", "We are a remote-first company.", "needs_review"],
    // An office word blocks a confirmation; a human decides (review H1).
    ["Analytics Engineer", "Location: Remote / Hybrid (London).", "needs_review"],
    ["Analytics Engineer", "Location: Remote or hybrid.", "needs_review"],
    ["Analytics Engineer", "We are remote-first. Hybrid: 3 days onsite in Berlin.", "needs_review"],
    ["Analytics Engineer", "Remote-first. Work model: Hybrid.", "needs_review"],
    ["Analytics Engineer", "We are remote-first. Hybrid (2 days/week in office).", "needs_review"],
    ["Analytics Engineer", "Remote-first. Onsite 3 days per week at our Austin HQ.", "needs_review"],
    ["Analytics Engineer", "Remote-first. This role is office-based in Paris.", "needs_review"],
    ["Analytics Engineer", "Remote-first culture. This position requires you to be in our Munich office on Tuesdays and Thursdays.", "needs_review"],
    ["Analytics Engineer", "Fully remote company; this is a hybrid-remote position in Austin.", "needs_review"],
    ["Engineer (Remote)", "Work location: In person.", "needs_review"],
    ["Engineer (Remote)", "We meet for monthly in-person team days.", "needs_review"],
    // Any office vocabulary blocks it, however phrased (review H1, second pass).
    ["Engineer (Remote)", "Remote, but candidates must live within 50 miles of our Chicago office and come in weekly.", "needs_review"],
    ["Engineer", "This role is remote-eligible only for candidates within commuting distance.", "needs_review"],
    ["Engineer (Remote)", "Requires relocation to Berlin.", "needs_review"],
    ["Engineer (Remote)", "You'll work from our London office twice a week.", "needs_review"],
    ["Engineer (Remote)", "You are expected to come into the office regularly.", "needs_review"],
    ["Engineer (Remote)", "Team days at the office on Mondays and Fridays.", "needs_review"],
    ["Engineer (Remote)", "Flexible working: 2 days at the office.", "needs_review"],
    ["Engineer (Remote)", "Must be able to commute to our Seattle office.", "needs_review"],
    ["Engineer (Remote)", "Remote within the Netherlands; office attendance twice a month.", "needs_review"],
    ["Engineer (Remote)", "Location: Remote (Berlin office twice a month).", "needs_review"],
    ["Engineer", "This position is remote, but you'll be expected at our office in Lyon weekly.", "needs_review"],
    ["Engineer (Remote)", "Work from home 2 days per week.", "needs_review"],
    ["Engineer (Remote)", "Partially remote: Tuesdays and Thursdays at our Paris studio.", "needs_review"],
    ["Engineer (Remote)", "Our team meets at the Berlin HQ two days a week.", "needs_review"],
    ["Remote - Office Manager", "Run our Denver office day to day.", "needs_review"],
    // A compound that starts with "Remote" is not a label.
    ["Remote-First Company: Senior Engineer", "Build things.", "needs_review"],
    ["Remote-friendly Senior Engineer", "Build things.", "needs_review"],
    ["Remote - Senior Engineer", "Build things.", "main_catalog"],
    // Unicode hyphens and a soft hyphen read as "-" and nothing.
    ["Engineer (Remote)", "This is an on\u2011site role.", "excluded"],
    ["Engineer (Remote)", "This is an on\u00adsite role.", "excluded"],
    ["Engineer \u2013 Remote", "Build things.", "main_catalog"],
    // Errors run toward hiding: these are probably remote, and a human sees them.
    ["Frontend Lead (Remote)", "At least one year of work onsite in Germany.", "needs_review"],
    ["Sales Rep (Remote)", "Just don't ask to work in our office (we don't have one).", "needs_review"],
    // An office statement wins over a remote one: the contradiction is quarantined.
    ["Analytics Engineer (Remote)", "This is a hybrid role with Fridays together.", "excluded"],
    ["Engineer | hybrid", "Build models.", "excluded"],
    ["Engineer (on-site)", "Build models.", "excluded"],
    ["Software Engineer (Non-Remote)", "Build things in Austin.", "excluded"],
    ["Software Engineer - Not Remote", "Build things in Austin.", "excluded"],
    ["Sales Rep (Remote)", "Please note: this role is not 100% remote.", "excluded"],
    ["Analytics Engineer", "Fully remote, but you must work on-site during onboarding.", "excluded"],
    ["Analytics Engineer", "Expect 3 days a week in the Austin office.", "excluded"],
    ["Analytics Engineer", "Work from anywhere 4 weeks a year. Expect to join us in the office three days a week.", "excluded"],
    ["Analytics Engineer", "This is not a remote position.", "excluded"],
    ["Analytics Engineer", "Temporarily remote while the renovation runs; fully remote for now.", "excluded"],
    // B65: the residual gaps of the S1-006 final review, each beside a remote label or an
    // English remote phrase. (1) Office words in another language or inside a longer word.
    ["Engineer (Remote)", "Hybrides Arbeiten in Berlin.", "needs_review"],
    ["Engineer (Remote)", "Zusammenarbeit vor Ort in Berlin.", "needs_review"],
    ["Engineer (Remote)", "Unser Hybridmodell lässt dir Freiheit.", "needs_review"],
    ["Engineer (Remote)", "Vous travaillerez au bureau de Lyon.", "needs_review"],
    ["Engineer (Remote)", "Modalidad: presencial en Madrid.", "needs_review"],
    ["Analytics Engineer", "Fully remote team. Hybrides Arbeiten mit Präsenztagen.", "needs_review"],
    ["Engineer (Remote)", "Zwei Tage im Büro in München.", "needs_review"],
    ["Engineer (Remote)", "Präsenztage in Hamburg.", "needs_review"],
    ["Engineer (Remote)", "Zwei Tage pro Woche in München.", "needs_review"],
    ["Engineer (Remote)", "Poste en présentiel à Paris.", "needs_review"],
    ["Engineer (Remote)", "Travail sur site à Nantes.", "needs_review"],
    ["Engineer (Remote)", "Rejoignez nos bureaux à Lille.", "needs_review"],
    ["Engineer (Remote)", "Deux jours par semaine à Lille.", "needs_review"],
    ["Engineer (Remote)", "Modelo semipresencial.", "needs_review"],
    ["Engineer (Remote)", "Trabajo híbrido en Madrid.", "needs_review"],
    ["Engineer (Remote)", "Trabajo en nuestra oficina de Madrid.", "needs_review"],
    ["Engineer (Remote)", "Trabalho no escritório de Lisboa.", "needs_review"],
    ["Engineer (Remote)", "Lavoro ibrido a Milano.", "needs_review"],
    ["Engineer (Remote)", "Due giorni in sede a Milano.", "needs_review"],
    ["Engineer (Remote)", "Presenza in ufficio a Milano.", "needs_review"],
    ["Engineer (Remote)", "Twee dagen op kantoor in Utrecht.", "needs_review"],
    ["Engineer (Remote)", "Praca w biurze w Warszawie.", "needs_review"],
    ["Engineer (Remote)", "Praca hybrydowa w Krakowie.", "needs_review"],
    ["Engineer (Remote)", "Praca stacjonarna w Krakowie.", "needs_review"],
    ["Engineer (Remote)", "Dos días por semana en Madrid.", "needs_review"],
    ["Engineer (Remote)", "Twee dagen per week in Utrecht.", "needs_review"],
    ["Engineer (Remote)", "Bis zu 3 Tage Homeoffice, sonst in Köln.", "needs_review"],
    ["Engineer (Remote)", "Teilweise Homeoffice möglich.", "needs_review"],
    ["Engineer (Remote)", "Dein Büroarbeitsplatz in Köln.", "needs_review"],
    ["Engineer (Remote)", "Zwei Officetage in Köln.", "needs_review"],
    ["Engineer (Remote)", "Deux jours de télétravail.", "needs_review"],
    ["Engineer (Remote)", "Télétravail partiel.", "needs_review"],
    ["Engineer (Remote)", "Modalidad mixta en Bogotá.", "needs_review"],
    ["Engineer (Remote)", "Due giorni di smart working.", "needs_review"],
    ["Engineer (Remote)", "Deels thuiswerken.", "needs_review"],
    ["Engineer (Remote)", "Praca częściowo zdalna.", "needs_review"],
    ["Engineer (Remote)", "Två dagar på kontoret.", "needs_review"],
    // "Homeoffice" is working from home, not an office; "Bürokratie" is not an office.
    ["Engineer (Remote)", "Hochwertiges Homeoffice-Zubehör.", "main_catalog"],
    ["Engineer (Remote)", "Weniger Bürokratie, mehr Freiheit.", "main_catalog"],
    // (2) Workplace nouns other than office or HQ, and frequencies of presence.
    ["Engineer (Remote)", "Tuesdays and Thursdays at our Paris studio.", "needs_review"],
    ["Engineer (Remote)", "Pair with the team at our Paris studio.", "needs_review"],
    ["Engineer (Remote)", "Collaborate on our Austin campus.", "needs_review"],
    ["Engineer (Remote)", "You will visit our Austin facility weekly.", "needs_review"],
    ["Engineer (Remote)", "Expect to be at our Denver site three days a week.", "needs_review"],
    ["Engineer (Remote)", "Our Denver site three days a week, home otherwise.", "needs_review"],
    ["Engineer (Remote)", "Hands-on work in the lab twice a week.", "needs_review"],
    ["Engineer (Remote)", "Hands-on work in the lab.", "needs_review"],
    ["Engineer (Remote)", "Based at our Denver site.", "needs_review"],
    ["Engineer (Remote)", "This is a semi-remote role.", "needs_review"],
    ["Engineer (Remote)", "The lab twice a week, home otherwise.", "needs_review"],
    ["Engineer (Remote)", "WFH 2 days a week.", "needs_review"],
    ["Engineer (Remote)", "WFH on Mondays and Fridays.", "needs_review"],
    ["Engineer (Remote)", "This is a field-based role covering the Midwest.", "needs_review"],
    ["Engineer (Remote)", "Based at our Leeds plant.", "needs_review"],
    ["Engineer (Remote)", "Report to the warehouse in Reno each morning.", "needs_review"],
    ["Engineer (Remote)", "Work from one of our clinics in Ohio.", "needs_review"],
    ["Engineer (Remote)", "Shifts on the premises.", "needs_review"],
    ["Engineer (Remote)", "Work alongside the team at Acme's Lisbon hub.", "needs_review"],
    ["Engineer (Remote)", "Meet at the site in Tulsa.", "needs_review"],
    ["Engineer (Remote)", "Three days per week from the client site.", "needs_review"],
    ["Engineer (Remote)", "Team syncs in person 2x per week.", "needs_review"],
    ["Engineer (Remote)", "Must be local to Austin.", "needs_review"],
    ["Engineer (Remote)", "Must live within 30 miles of Austin.", "needs_review"],
    ["Engineer (Remote)", "Two days remote, the rest in Austin.", "needs_review"],
    ["Engineer (Remote)", "Join the team in Austin every Tuesday.", "needs_review"],
    ["Engineer (Remote)", "In Austin on Tuesdays.", "needs_review"],
    ["Engineer (Remote)", "Austin, Tuesdays and Thursdays.", "needs_review"],
    ["Engineer (Remote)", "Available Monday through Friday, 9-5 ET.", "main_catalog"],
    ["Engineer (Remote)", "Work on campus in Austin.", "needs_review"],
    ["Engineer (Remote)", "This is a lab-based role.", "needs_review"],
    ["Engineer (Remote)", "Meet the team at our Austin location.", "needs_review"],
    ["Engineer (Remote)", "Open to candidates in the following locations: US, Canada.", "main_catalog"],
    ["Engineer (Remote)", "We work in the plant-based food space.", "main_catalog"],
    // Travel to a workplace is B64's required travel, unless it is weekly presence.
    ["Engineer (Remote)", "Travel to our Austin facility weekly.", "needs_review"],
    ["Engineer (Remote)", "Weekly travel to our Austin facility.", "needs_review"],
    ["Engineer (Remote)", "Travel to the lab on Tuesdays.", "needs_review"],
    // Not a workplace: occasional travel to one, and products named like places.
    ["Engineer (Remote)", "Some travel to our Connecticut facility required.", "main_catalog"],
    ["Engineer (Remote)", "Experience with Site Reliability Engineering.", "main_catalog"],
    ["Engineer (Remote)", "Build apps in the Android Studio IDE.", "main_catalog"],
    ["Engineer (Remote)", "Merge into the main branch daily.", "main_catalog"],
    ["Engineer (Remote)", "Learn more on our web site.", "main_catalog"],
    ["Engineer (Remote)", "Hybrid cloud experience. Hours: 9 hours/day, 5 days/week.", "main_catalog"],
    // (3) An arrangement written into the title after the label.
    ["Engineer (Remote, 2 days/wk in Austin)", "Build things.", "needs_review"],
    ["Engineer | Remote | Austin, TX (2x/week)", "Build things.", "needs_review"],
    ["Engineer (Remote - Austin, TX weekly)", "Build things.", "needs_review"],
    ["Engineer (Remote, 1 week/month in Austin)", "Build things.", "needs_review"],
    ["Engineer (Remote, Austin 1x/mo)", "Build things.", "needs_review"],
    // Remote for a while is temporary, with or without a confirmation or an office word.
    ["Engineer (Remote for now)", "Build things.", "excluded"],
    ["Engineer - Remote", "Initially remote while we hire locally.", "excluded"],
    ["Engineer (Remote)", "Temporarily remote, then at our Austin campus.", "excluded"],
    ["Engineer", "We are temporarily remote.", "excluded"],
    ["Engineer (Remote, US)", "Build things.", "main_catalog"],
    // (4) Negations other than "not … remote" are statements: excluded.
    ["Engineer (Remote)", "No remote position available.", "excluded"],
    ["Engineer (Remote)", "Remote: No. Location: Austin, TX.", "excluded"],
    ["Engineer (Remote)", "Remote work possible? No.", "excluded"],
    ["Engineer (Remote)", "Remote work is not possible for this role.", "excluded"],
    ["Engineer (Remote)", "This role cannot be performed remotely.", "excluded"],
    ["Engineer (Remote)", "This job isn't remote.", "excluded"],
    ["Engineer (Remote)", "We are not open to remote candidates.", "excluded"],
    ["Engineer (Remote)", "Remote applicants will not be considered.", "excluded"],
    ["Engineer (Remote)", "We do not offer remote work for this position.", "excluded"],
    ["Engineer - No Remote", "Build things in Austin.", "excluded"],
    ["Engineer (Remote)", "Die Stelle ist nicht remote.", "excluded"],
    ["Engineer (Remote)", "Kein Homeoffice möglich.", "excluded"],
    ["Engineer (Remote)", "Pas de télétravail pour ce poste.", "excluded"],
    ["Engineer (Remote)", "Puesto sin teletrabajo.", "excluded"],
    ["Engineer (Remote)", "Este cargo não é remoto.", "excluded"],
    ["Engineer (Remote)", "Not eligible for remote work.", "excluded"],
    ["Engineer (Remote)", "Remote option not available.", "excluded"],
    ["Engineer (Remote)", "No WFH.", "excluded"],
    ["Engineer (Remote)", "Remote? Not at this time.", "excluded"],
    ["Engineer (Remote)", "Homeoffice: nein.", "excluded"],
    ["Engineer (Remote)", "Remote = no.", "excluded"],
    ["Engineer (Remote)", "This is not negotiable: we are fully remote.", "main_catalog"],
    ["Analytics Engineer", "Remote? No problem: work from anywhere.", "main_catalog"],
    ["Analytics Engineer", "Remote? Not a problem: work from anywhere.", "main_catalog"],
    // B65 review (cycle 1). (3) What a title attaches to its label must be a place, a time
    // zone, a contract type or travel; a count of days, a weekday or a frequency anywhere.
    ...[
      "Engineer (Remote, 2 days in Austin)", "Engineer (Remote, 3 days in Austin)", "Engineer (Remote) - Austin 2 days",
      "Engineer (Remote, Austin campus)", "Engineer (Remote, Austin lab)", "Engineer (Remote, Austin site)",
      "Engineer (Remote, Austin plant)", "Engineer (Remote, Austin studio)", "Engineer (Remote, Austin warehouse)",
      "Engineer (Remote, Austin store)", "Engineer (Remote - must be in Austin Tue/Thu)", "Engineer (Remote, Austin Tue-Thu)",
      "Engineer (Remote, Austin Tues & Thurs)", "Engineer (Remote, Austin Mondays)", "Engineer (Remote, Austin fortnightly)",
      "Engineer (Remote, Austin every 2 weeks)", "Engineer (Remote, 1 wk/qtr in Austin)", "Engineer (Remote, Berlin 2 Tage)",
      "Engineer (Remote, Austin wöchentlich)", "Engineer (Remote, Austin semanal)", "Engineer - Austin 2 days - Remote",
      "Controller (Remote, NetSuite)",
    ].map(title => [title, "Build things.", "needs_review"] as const),
    ...[
      "Principal Medical Writer (Remote - Canada)", "Case Coordinator (ABA Services) | EST Hours | Remote",
      "Software Engineer (Remote - Contractor)", "Sales Executive - Spain (Remote) - Part Time",
      "Logistics Manager (REMOTE) - #35363", "CRO Manager (m/w/d) · Remote", "Designer (Remote, Europe)",
      "Rep - 100% remote - ANZ", "Engineer (Contract, Remote)", "Engineer (Remote, US-based)", "Engineer (Remote, UTC+1 to UTC+3)",
      "Engineer (Remote, TX or CA)", "Engineer (Remote, Mon-Fri)",
    ].map(title => [title, "Build things.", "main_catalog"] as const),
    ["Inspector (Remote/Travel)", "Build things.", "main_catalog"],
    ["Triage RN - Every Weekend (Sat/Sun) (Remote)", "Night shifts.", "main_catalog"],
    // (2) Travel more often than weekly is presence; occasional travel stays B64's.
    ...["You'll travel to our Reno warehouse daily.", "Travel to our Reno warehouse every day.",
      "Travel to our Reno warehouse Monday through Thursday.", "Travel to our Reno warehouse each Monday.",
      "Travelling into our Austin campus most days.",
      // A real place named like an exemption.
      "You will work at the main branch in downtown Austin.", "Work at our corporate site in Austin.",
      "Work from the corporate site in Austin.", "Work at our company site in Austin.",
      // (1) Compounds with a prefix, the German dative, more office nouns.
      "Im Hauptbüro in Berlin.", "Arbeit im Großraumbüro.", "Werken op ons hoofdkantoor in Utrecht.",
      "Arbete på vårt huvudkontor i Stockholm.", "Praca biurowa w Krakowie.",
      "Mobiles Arbeiten an 2 Tagen pro Woche, sonst in München.", "Präsenz am Standort München.",
      "Arbeit in unserer Zentrale in Berlin.", "Arbeitsort: Hauptsitz Berlin.", "Poste basé au siège à Paris.",
      "Travail en agence à Lyon.", "Sur notre site de Lyon.", "2 jours de présence par semaine.",
      "Trabajo en la sede de Madrid.", "Trabajo en nuestras instalaciones de Madrid.", "Trabalho na sede em Lisboa.",
      "Lavoro presso la nostra sede di Milano.", "Praca w siedzibie firmy w Warszawie.",
      // (2) English workplaces and presence at a named place.
      "Work in our Austin store.", "This is an in-store role.", "Shifts at our distribution center in Reno.",
      "Based at our Austin call centre.", "Work at customer sites across Texas.", "You will work at client sites in Dallas.",
      "Work in the field across Ohio.", "Co-located with the team in Austin.", "Work from our Austin location.",
      "Work out of our Austin location.", "Austin, 3 days weekly.", "Every other week in Austin.",
      "Monday to Wednesday in Austin.", "Mon-Wed in Austin.", "Mondays in Austin.", "Fly to Austin biweekly.",
      "In Austin 3 out of 5 days.", "You will join colleagues in Austin most weeks.",
      // Invisible characters and compatibility forms cannot split an office word.
      `Work on${ZERO_WIDTH_SPACE}site in Austin.`,
      `Work on${WORD_JOINER}site in Austin.`, `Work at the O${FFI_LIGATURE}ce in Austin.`,
    ].map(text => ["Engineer (Remote)", text, "needs_review"] as const),
    ...["Hours: Monday to Friday, 9am - 5pm ET.", "Working hours: Monday – Friday, 4:00pm – 1:00am SAST.",
      "Our Benefits: “No Meeting” Fridays!", "Visa sponsorship: Not available Hires remotely in: United States.",
      "Never worked remotely before? We will teach you.", "Fully remote, no travel.",
      "Remote work is not for everyone, and that is fine.", "We are authorized to work from their home location.",
      "We communicate daily in English and meet weekly in Slack.", "Get paid every week: weekly payouts.",
    ].map(text => ["Engineer (Remote)", text, "main_catalog"] as const),
    // (4) A negation near a remote word, in either order, in the languages read.
    ...["Remote positions are not available.", "Working remotely is not possible.", "Remote—no.",
      "Remote - No. Location: Austin.", "Remote: N/A. Location: Austin.", "Remote: false",
      "Remote work is unavailable for this role.", "Remote work is impossible for this role.",
      "Remote work will not be possible.", "Remote is out of the question.", "No option for remote work.",
      "There is no option to work remotely.", "We don't do remote.", "We are not hiring remote engineers.",
      "We are not considering remote candidates.", "This role does not qualify for remote work.",
      "Remote workers need not apply.", "Never remote.", "No-remote policy.", "Telework is not available.",
      "No telework.", "Telecommuting is not permitted.", "Remote nicht möglich.", "Homeoffice ist nicht möglich.",
      "Remote-Arbeit ist leider nicht möglich.", "Le télétravail n'est pas possible.", "Pas de remote.",
      "No se permite el teletrabajo.", "Puesto no remoto.", "Niente smart working.", "Geen thuiswerken mogelijk.",
      "Brak pracy zdalnej.",
    ].map(text => ["Engineer (Remote)", text, "excluded"] as const),
    ["Analytics Engineer", "If you are looking for a remote role, this is not it.", "excluded"],
    // B65 re-review (cycle 2), beside "This is a fully remote position." (3) Every standalone
    // "remote" in a title, not only a label in its exact shape.
    ...["Engineer - Remote (Austin campus)", "Engineer – Remote (Austin studio)", "Engineer (Remote; Austin campus)",
      "Engineer (Remote: Austin studio)", "Engineer (Remote + Austin studio)", "Engineer (Remote w/ Austin studio days)",
      "Engineer (Remote US, Austin studio)", "Engineer - Remote US - Austin studio", "Engineer Remote, Austin campus",
      "Engineer (Remote*) Austin studio",
    ].map(title => [title, "This is a fully remote position.", "needs_review"] as const),
    // A leading "Remote" is followed by the job's name, an opportunity is not a qualifier,
    // a territory is a place, and a title too long to be a job's name waits for review.
    ...["Lead Network Engineer - Remote Opportunity", "Freelance Software Tester (Remote in Martinique)",
      "Remote Hospice Triage RN PT 3:30p-11p Rotating Sat/Sun", "Remote Document Review - Verdict Classification Attorney",
      "Engineer (Remote, Worldwide)", "Engineer (Remote, Ontario)", "Engineer (Remote, NSW)", "Engineer (Remote, US East Coast)",
      "Engineer (Remote, No Travel)", "Engineer (Remote, English)", "Engineer (Remote, Bilingual Spanish)",
      "Engineer (Remote, Night Shift)", "Engineer (Remote, $120k-$150k)", "Engineer (Remote) - Fridays Off",
    ].map(title => [title, "This is a fully remote position.", "main_catalog"] as const),
    [`Engineer (Remote, ${"tz".repeat(200)})`, "This is a fully remote position.", "needs_review"],
    // (4) More negations, and the languages read.
    ...["This role is ineligible for remote work.", "Remote work is prohibited.", "No possibility of remote work.",
      "There is no possibility of working remotely.", "We do not allow employees to work remotely.",
      "The role excludes remote work.", "Remote work cannot be accommodated.", "This is not a work-from-home job.",
      "Remote? Nope.", "Remote: Ineligible", "Remote (Y/N): N", "Remote: 0%", "El teletrabajo no es posible.",
      "Thuiswerken is niet mogelijk.", "Praca zdalna nie jest możliwa.", "Lavoro da remoto non previsto.",
    ].map(text => ["Engineer (Remote)", `This is a fully remote position. ${text}`, "excluded"] as const),
    // (2) Presence and workplaces; (1) office words.
    ...["Travel to our Austin plant five days a week.", "Travel to our plant on weekdays.",
      "Travelling to the plant every weekday.", "Work 5 days a week in Austin.", "Must be physically present in Austin.",
      "Physical presence in Austin required.", "You'll come in several days a week.", "You'll come in a few days each week.",
      "You'll come in a couple of days per week.", "You'll come in once a fortnight.", "Work at our Austin center.",
      "Work at our Austin centre.", "Work at our Austin shop.", "Work at our Austin building.", "Work at our Austin workplace.",
      "Work at our London base.", "Work on the jobsite.", "Must attend the Austin headquarter.",
      "Arbeit in unserer Niederlassung in Berlin.", "Arbeit in der Geschäftsstelle Köln.", "Arbeit im Betrieb in Ulm.",
      "Präsenz im Team in Köln.", "Lavoro presso la filiale di Milano.", "Lavoro in loco a Milano.",
      "Trabajo en la sucursal de Madrid.", "Praca w oddziale w Krakowie.", "Werken op het hoofdkwartier in Utrecht.",
    ].map(text => ["Engineer (Remote)", `This is a fully remote position. ${text}`, "needs_review"] as const),
    // Common remote wording is not a negation, a place or presence.
    ...["No remote experience required.", "Remote? No question about it.", "Never been remote? No worries.",
      "Without remote experience, you can still apply.", "We don't do remote halfway: we are fully remote.",
      "Remote work is not new to us.", "Remote is not optional for us.", "There is no remote stipend, but we cover internet.",
      "You'll code daily in Python.", "Report weekly to Product.", "Flexible hours local to your time zone.",
      "Years of experience working in the field.", "Willing to work overtime and remote Cannot be on any no fly list.",
      "You can work from the coffee shop, your home, or while waiting for class.",
    ].map(text => ["Engineer (Remote)", `This is a fully remote position. ${text}`, "main_catalog"] as const),
    // Without the invisible character this is the office statement "role is hybrid".
    ["Engineer (Remote)", `This role is hy${ZERO_WIDTH_SPACE}brid.`, "excluded"],
  ];
  // Every mismatch at once, not only the first.
  const wrong = table.flatMap(([title, description, expected]) => {
    const snapshot = posting(title, description);
    assert.equal(isJobSnapshot(snapshot), true, title);
    const actual = classifySnapshot(snapshot);
    return actual === expected ? [] : [`${title} | ${description}: ${actual}, expected ${expected}`];
  });
  assert.deepEqual(wrong, []);
});

test("geography: up to three countries are never the whole list; empty is unspecified", () => {
  const listed = mapRemoteFirstJobsRecord({ ...remoteJob, locations: ["United States", "Canada", "Atlantis"] }, NOW);
  assert.deepEqual(listed.hiring_options[0]!.geography, {
    scope: "restricted", allowed_countries: ["US", "CA"], excluded_countries: [],
    allowed_subdivisions: [], region_text: "United States, Canada, Atlantis", exhaustive: false,
    evidence_ids: [`ev:${listed.id}:geo`],
  });
  assert.equal(geoRule(listed, "US"), "pass");
  assert.equal(geoRule(listed, "DE"), "unknown"); // never "fail": the list is incomplete

  for (const locations of [[], [""], ["  "], null, undefined]) {
    const open = mapRemoteFirstJobsRecord({ ...remoteJob, locations }, NOW);
    assert.equal(open.hiring_options[0]!.geography.scope, "unspecified", JSON.stringify(locations));
    assert.equal(geoRule(open, "DE"), "unknown");
  }
  assert.equal(rejectionOf({ ...remoteJob, locations: "United States" as never }), "INVALID_LOCATIONS");
  assert.equal(rejectionOf({ ...remoteJob, locations: [42] as never }), "INVALID_LOCATIONS");
});

test("dates: a time without an offset is UTC; an offset is honoured; anything else is refused", () => {
  const at = (published_at: string) =>
    mapRemoteFirstJobsRecord({ ...remoteJob, published_at }, NOW).dates.source_published_at;
  assert.equal(at("2026-11-01T13:30:55"), "2026-11-01T13:30:55.000Z");
  assert.equal(at("2026-11-01T13:30:55Z"), "2026-11-01T13:30:55.000Z");
  assert.equal(at("2026-11-01T13:30:55+02:00"), "2026-11-01T11:30:55.000Z");
  for (const bad of ["2026-11-01", "2026-11-01 13:30:55", "yesterday", "2026-13-01T00:00:00",
    "2026-02-30T00:00:00", "2026-11-01T24:00:00", "2026-11-01T13:60:00Z"]) {
    assert.equal(rejectionOf({ ...remoteJob, published_at: bad }), "INVALID_PUB_DATE", bad);
  }
  assert.equal(rejectionOf({ ...remoteJob, published_at: 1793520012 as never }), "INVALID_PUB_DATE");
});

test("salary: USD per year as converted by the source; 0 is none; nonsense is refused", () => {
  const paid = mapRemoteFirstJobsRecord(remoteJob, NOW);
  assert.deepEqual(paid.compensation.ranges.map(r => [r.min, r.max, r.currency, r.period]),
    [["120000", "150000", "USD", "annual"]]);
  assert.equal(paid.compensation.original_text, "120000–150000 USD / annual (converted by the source)");

  const none = mapRemoteFirstJobsRecord(hybridJob, NOW); // 0 and 0
  assert.deepEqual(none.compensation, { ranges: [], original_text: null, evidence_ids: [] });

  const floor = mapRemoteFirstJobsRecord({ ...remoteJob, salary_min: 90000, salary_max: 0 }, NOW);
  assert.equal(floor.compensation.original_text, "90000–? USD / annual (converted by the source)");
  assert.equal(isJobSnapshot(floor), true);

  assert.equal(rejectionOf({ ...remoteJob, salary_min: -1 }), "INVALID_SALARY");
  assert.equal(rejectionOf({ ...remoteJob, salary_max: "100k" as never }), "INVALID_SALARY");
});

test("validation: identity, URL and required text", () => {
  const cases: readonly (readonly [Partial<RemoteFirstJobsRawRecord>, string])[] = [
    [{ id: "Upper-Case-1" }, "INVALID_ID"],
    [{ id: "x".repeat(121) }, "INVALID_ID"],
    [{ id: 900101 as never }, "INVALID_ID"],
    [{ url: "not a url" }, "INVALID_URL"],
    [{ url: "http://remotefirstjobs.com/companies/a/jobs/platform-engineer-synthetic-fixture-900101" }, "INVALID_URL_HOST"],
    [{ url: "https://evil.example/companies/a/jobs/platform-engineer-synthetic-fixture-900101" }, "INVALID_URL_HOST"],
    [{ url: "https://remotefirstjobs.com:8443/companies/a/jobs/platform-engineer-synthetic-fixture-900101" }, "INVALID_URL_HOST"],
    // The URL must name this record, not another listing on the same host.
    [{ url: "https://remotefirstjobs.com/companies/a/jobs/another-job-1" }, "INVALID_URL_PATH"],
    [{ url: "https://remotefirstjobs.com/go/platform-engineer-synthetic-fixture-900101" }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}?next=https://evil.example` }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}#apply` }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}?` }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}#` }, "INVALID_URL_PATH"],
    [{ title: "  " }, "EMPTY_TITLE"],
    [{ company_name: "" }, "EMPTY_COMPANY"],
    [{ description: "<p> </p>" }, "EMPTY_DESCRIPTION"],
    [{ description: null as never }, "EMPTY_DESCRIPTION"],
  ];
  for (const [patch, code] of cases) {
    assert.equal(rejectionOf({ ...remoteJob, ...patch }), code, JSON.stringify(patch));
  }
  // The longest accepted slug still gives evidence ids inside the contract's bound.
  const longest = "a".repeat(120);
  const snapshot = mapRemoteFirstJobsRecord({
    ...remoteJob, id: longest, url: `https://remotefirstjobs.com/companies/northwind/jobs/${longest}`,
  }, NOW);
  assert.equal(isJobSnapshot(snapshot), true);
  assert.equal(SNAPSHOT_ID_PATTERN.test(snapshot.id), true);
});

test("excerpt: the start of the text, cut at a word", () => {
  const short = mapRemoteFirstJobsRecord(remoteJob, NOW);
  assert.equal(remoteFirstJobsExcerptOf(short), short.description_text);
  const long = posting("Engineer (Remote)", `${"word ".repeat(200)}end`);
  const excerpt = remoteFirstJobsExcerptOf(long);
  assert.ok(excerpt.length <= 301, String(excerpt.length));
  assert.ok(excerpt.endsWith("word…"), excerpt.slice(-10));
});

test("window import: a disabled or unapproved policy refuses before any request", async () => {
  for (const policy of [{ ...activePolicy, enabled: false }, { ...activePolicy, status: "revoked" as const },
    { ...activePolicy, status: "pending" as const }]) {
    const feed = pagedFeed([fullPage(0)]);
    const persistence = createMemoryPersistence();
    const report = await runRemoteFirstJobsImport({ transport: feed.transport, persistence, policy, now: NOW });
    assert.equal(report.result, "refused_disabled");
    assert.deepEqual(feed.asked, []);
    assert.equal(persistence.state, null);
  }
});

test("window import: pages in order until a short page; always partial, idempotent, poll-gated", async () => {
  const persistence = createMemoryPersistence();
  const feed = pagedFeed([fullPage(0), { status: "ok", jobs: [...remoteFirstJobsContractFixture], nextCursor: null }]);
  const first = await runRemoteFirstJobsImport({ transport: feed.transport, persistence, policy: activePolicy, now: NOW });
  assert.equal(first.result, "partial");
  assert.equal(first.traversal, "complete");
  assert.deepEqual(feed.asked, [0, 1]);
  assert.equal(first.recordsMapped, REMOTE_FIRST_JOBS_PAGE_SIZE + 3);
  assert.equal(first.recordsRejected, 0);
  const stored = await persistence.loadStore();
  assert.equal(Object.keys(stored.store.records).length, REMOTE_FIRST_JOBS_PAGE_SIZE + 3);
  assert.equal(stored.excerpts[`remote_first_jobs:${remoteJob.id}`], remoteFirstJobsExcerptOf(mapRemoteFirstJobsRecord(remoteJob, NOW)));

  // Inside the 6-hour interval: refused, nothing requested.
  const early = await runRemoteFirstJobsImport({
    transport: feed.transport, persistence, policy: activePolicy, now: "2026-11-02T15:00:00.000Z",
  });
  assert.equal(early.result, "refused_poll_interval");
  assert.equal(early.nextEligibleAt, "2026-11-02T18:00:00.000Z");
  assert.equal(feed.asked.length, 2);

  // After it: the same window changes nothing, and a job that left the window is
  // neither closed nor counted as missed.
  const later = "2026-11-02T18:30:00.000Z";
  const again = await runRemoteFirstJobsImport({
    transport: pagedFeed([{ status: "ok", jobs: [remoteJob], nextCursor: null }]).transport,
    persistence, policy: activePolicy, now: later,
  });
  assert.equal(again.result, "partial");
  assert.deepEqual(again.changes, [{ id: `remote_first_jobs:${remoteJob.id}`, change: "seen", version: 1 }]);
  const after = (await persistence.loadStore()).store.records;
  const absent = after[`remote_first_jobs:${hybridJob.id}`]!;
  assert.equal(absent.snapshot.lifecycle, "active");
  assert.equal(absent.fullPassMisses, 0);
});

test("window import: the five-page cap, a failed first page and a failed later page", async () => {
  const capped = pagedFeed([0, 1, 2, 3, 4, 5].map(fullPage));
  const report = await runRemoteFirstJobsImport({
    transport: capped.transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
  });
  assert.equal(report.traversal, "page_cap");
  assert.deepEqual(capped.asked, [0, 1, 2, 3, 4]); // never page 5: the documented maximum is 4
  // A caller cannot raise the cap past the documented last page.
  const asked = pagedFeed([0, 1, 2, 3, 4, 5, 6].map(fullPage));
  await runRemoteFirstJobsImport({
    transport: asked.transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
    maxPages: 50,
  });
  assert.deepEqual(asked.asked, [0, 1, 2, 3, 4]);

  const failedFirst = createMemoryPersistence();
  const refused = await runRemoteFirstJobsImport({
    transport: pagedFeed([{ status: "server_error" }]).transport,
    persistence: failedFirst, policy: activePolicy, now: NOW,
  });
  assert.equal(refused.result, "retry_scheduled");
  assert.equal(failedFirst.state, null); // the window is not used
  assert.deepEqual((await failedFirst.loadStore()).store.records, {});

  const failedLater = createMemoryPersistence();
  const interrupted = await runRemoteFirstJobsImport({
    transport: pagedFeed([fullPage(0), { status: "rate_limited" }]).transport,
    persistence: failedLater, policy: activePolicy, now: NOW,
  });
  assert.equal(interrupted.result, "partial");
  assert.equal(interrupted.traversal, "interrupted");
  assert.equal(interrupted.pagesFetched, 1);
  assert.equal(Object.keys((await failedLater.loadStore()).store.records).length, REMOTE_FIRST_JOBS_PAGE_SIZE);
  assert.equal(failedLater.state?.lastRunAt, NOW);
});

test("window import: an invalid record is counted and skipped, the rest imported", async () => {
  const report = await runRemoteFirstJobsImport({
    transport: pagedFeed([{ status: "ok", nextCursor: null,
      jobs: [remoteJob, { ...hybridJob, url: "https://evil.example/x" }, { nope: true }, null, 7, []] }]).transport,
    persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
  });
  // A null, a scalar or an array in the page is one rejected record, not a failed run.
  assert.equal(report.result, "partial");
  assert.equal(report.recordsMapped, 1);
  assert.equal(report.recordsRejected, 5);
});

test("fetcher: pinned to remotefirstjobs.com, no redirects, page 0–4 only", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const seen: { url: string; redirect: RequestRedirect | undefined }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), redirect: init?.redirect });
    return new Response(JSON.stringify({ _README_: "synthetic", page: 0, jobs_count: 0, jobs: [] }), {
      status: 200, headers: { "content-type": "application/json; charset=utf-8" },
    });
  }) as typeof fetch;
  const ok = await fetchRemoteFirstJobsPage({ page: 2 });
  assert.deepEqual(ok, { status: "ok", jobs: [], nextCursor: null });
  const url = new URL(seen[0]!.url);
  assert.equal(url.origin, "https://remotefirstjobs.com");
  assert.equal(url.pathname, "/api/search-jobs");
  assert.deepEqual([...url.searchParams], [["page", "2"]]); // no query or category filter
  assert.equal(seen[0]!.redirect, "error");
  for (const page of [-1, 5, 1.5, Number.NaN]) {
    assert.equal((await fetchRemoteFirstJobsPage({ page })).status, "network_error", String(page));
  }
  assert.equal(seen.length, 1);
});

test("snapshot ids: the new source passes the shared id checks; other prefixes do not", () => {
  assert.deepEqual([...SNAPSHOT_SOURCE_IDS], ["himalayas", "jobicy", "remote_first_jobs"]);
  const id = mapRemoteFirstJobsRecord(remoteJob, NOW).id;
  assert.equal(SNAPSHOT_ID_PATTERN.test(id), true);
  assert.deepEqual(parseEventBatch({ type: "click", items: [{ snapshotId: id, position: 0 }] }),
    [{ snapshotId: id, position: 0 }]);
  for (const other of ["remotive:123", "remote-first-jobs:abc", "remote_first_jobs:Bad", "remote_first_jobs:"]) {
    assert.equal(SNAPSHOT_ID_PATTERN.test(other), false, other);
  }
});

test("cross-source: the fixture never collides with the himalayas and jobicy fixtures", () => {
  const ids = [
    ...mapHimalayasFixture(NOW).map(s => s.id),
    ...mapJobicyFixture(NOW).map(s => s.id),
    ...mapRemoteFirstJobsFixture(NOW).map(s => s.id),
  ];
  assert.equal(new Set(ids).size, ids.length);
});
