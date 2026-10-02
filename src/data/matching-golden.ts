// Golden set for the matching evaluation harness (design item A1).
//
// What this is: a SYNTHETIC, hand-written benchmark that answers "does the
// matching pipeline order and filter jobs the way a candidate would?".
// Nothing here comes from real users, real resumes or real job boards; every
// company, URL and posting is invented (example.invalid).
//
// How relevance grades were written (judgment, NOT computed from the rules —
// grading by the same logic the ranker uses would measure nothing):
//   3 — same specialisation, matching conditions: apply first.
//   2 — same specialisation, minor gaps or unclear conditions (one unfamiliar
//       tool inside an otherwise matching stack): worth applying.
//   1 — a neighbouring software-engineering specialisation, or a same-field
//       role blocked by the candidate's own stated hard conditions.
//   0 — outside software engineering (design, games, internships) or a level
//       the candidate is not looking for.
// Grades of 2-3 always describe a job the candidate should be able to see
// (shown = eligible or needs_review), which makes "relevant but hidden" a real
// gate-bug signal in src/domain/matching-eval.ts.
//
// How to extend: add a job, judge it for every profile (the harness fails the
// "unjudged shown" guard otherwise), then re-baseline the ratcheted thresholds
// in tests/unit/matching-eval.test.ts and record why in the task file.
//
// Language is intentionally NOT part of the grades: the profile model does not
// carry candidate languages yet (a known gap, dictionary work item A3), so
// Russian-language postings are judged on stack and conditions only.
import type { GoldenJob, GoldenJudgment, GoldenProfile, GoldenSet } from "../domain/matching-eval.ts";
import type { CompensationRange, Geography, HiringOption, Schedule, Workplace } from "../domain/source-contracts.ts";

type OptionEmployment = HiringOption["employment_types"][number];

// --- Contract builders ---------------------------------------------------
const remoteWorkplace = (mandatoryOnsite: Workplace["mandatory_onsite"]): Workplace => ({
  type: "remote", permanence: "permanent", mandatory_onsite: mandatoryOnsite,
  mandatory_travel: "not_stated", optional_offsites: null,
  verification_state: "confirmed", evidence_ids: [],
});

const worldwide = (): Geography => ({
  scope: "worldwide", allowed_countries: [], excluded_countries: [],
  allowed_subdivisions: [], region_text: null, exhaustive: true, evidence_ids: [],
});

const restricted = (countries: readonly string[], regionText: string | null = null): Geography => ({
  scope: "restricted", allowed_countries: countries, excluded_countries: [],
  allowed_subdivisions: [], region_text: regionText, exhaustive: true, evidence_ids: [],
});

// Geography the source did not state at all (the A2 coverage gap): GEO-01 must
// stay unknown — neither worldwide nor a refusal.
const unspecifiedGeography = (): Geography => ({
  scope: "unspecified", allowed_countries: [], excluded_countries: [],
  allowed_subdivisions: [], region_text: null, exhaustive: false, evidence_ids: [],
});

const scheduleNotStated = (): Schedule => ({
  status: "not_stated", timezone: null, zone_semantics: "not_stated", mode: "not_stated",
  local_windows: [], required_overlap_minutes: null, accepted_utc_offsets_minutes: [],
  original_text: null, evidence_ids: [],
});

const scheduleOffsets = (offsets: readonly number[], originalText: string | null = null): Schedule => ({
  status: "explicit", timezone: null, zone_semantics: "fixed_utc_offset", mode: "within_offset_set",
  local_windows: [], required_overlap_minutes: null, accepted_utc_offsets_minutes: offsets,
  original_text: originalText, evidence_ids: [],
});

const scheduleAmbiguous = (): Schedule => ({
  status: "unknown", timezone: null, zone_semantics: "ambiguous", mode: "unknown",
  local_windows: [], required_overlap_minutes: null, accepted_utc_offsets_minutes: [],
  original_text: null, evidence_ids: [],
});

const annualGross = (min: string, max: string | null, currency: string): CompensationRange => ({
  min, max, currency, period: "annual", tax_basis: "gross", component: "base",
  applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null, evidence_ids: [],
});

const monthlyGross = (min: string, max: string | null, currency: string): CompensationRange => ({
  ...annualGross(min, max, currency), period: "monthly",
});

const hourlyGross = (min: string, max: string | null, currency: string): CompensationRange => ({
  ...annualGross(min, max, currency), period: "hourly",
});

const dailyGross = (min: string, max: string | null, currency: string): CompensationRange => ({
  ...annualGross(min, max, currency), period: "daily",
});

function option(
  id: string,
  geography: Geography,
  employmentTypes: readonly OptionEmployment[],
  schedule: Schedule,
): HiringOption {
  return {
    id, geography, employment_types: employmentTypes, schedule,
    authorization: {
      requirement: "none_stated", authorization_type: "none_stated",
      any_of_countries: [], original_text: null, evidence_ids: [],
    },
    evidence_ids: [],
  };
}

function snapshot(spec: Readonly<{
  id: string;
  title: string;
  company: string;
  description: string;
  language?: string;
  geography: Geography;
  employmentTypes?: readonly OptionEmployment[];
  schedule?: Schedule;
  mandatoryOnsite?: Workplace["mandatory_onsite"];
  ranges?: readonly CompensationRange[];
  secondOption?: Readonly<{
    geography: Geography;
    employmentTypes: readonly OptionEmployment[];
    schedule?: Schedule;
  }>;
}>): GoldenJob["snapshot"] {
  const employment = spec.employmentTypes ?? ["employment_full_time"];
  const schedule = spec.schedule ?? scheduleNotStated();
  const hiringOptions: HiringOption[] = [option(`opt-${spec.id}-a`, spec.geography, employment, schedule)];
  if (spec.secondOption) {
    hiringOptions.push(option(
      `opt-${spec.id}-b`, spec.secondOption.geography, spec.secondOption.employmentTypes,
      spec.secondOption.schedule ?? scheduleNotStated(),
    ));
  }
  return {
    kind: "job_snapshot", schema_version: "1.0.0",
    id: spec.id, version: 1, source_record_id: `${spec.id}-source`,
    title: spec.title, company_name: spec.company, company_domain: null,
    source_url: `https://example.invalid/jobs/${spec.id}`,
    apply_url: null,
    description_text: spec.description,
    description_language: spec.language ?? "en",
    workplace: remoteWorkplace(spec.mandatoryOnsite ?? "not_stated"),
    hiring_options: hiringOptions,
    requirements: [],
    compensation: { ranges: spec.ranges ?? [], original_text: null, evidence_ids: [] },
    dates: {
      source_published_at: null,
      fetched_at: "2026-09-27T08:00:00Z",
      last_seen_at: "2026-09-27T08:00:00Z",
      expires_at: null,
    },
    lifecycle: "active", conflicts: [], evidence: [],
  };
}

// --- Jobs ----------------------------------------------------------------
// Coverage cells: stack families (backend/frontend/mobile/data/ML/devops/QA/
// design/games), languages (en/ru), geography (worldwide/restricted/unspecified,
// allowed and excluded), contract types, salary shapes (annual/monthly/hourly/
// daily, absent, non-comparable currency), schedules (not stated/offset set/
// ambiguous), mandatory onsite, one two-option posting (OR path), two freshness
// pairs at different ages, and two cross-lingual semantic postings (no Latin
// tokens) that lexical legs cannot match by design of the case.
export const GOLDEN_JOBS: readonly GoldenJob[] = [
  { note: "backend core stack, worldwide, salary present", snapshot: snapshot({
    id: "golden-j01", title: "Senior Node.js Engineer", company: "Nordwind Labs",
    description: "Payment platform services on Node.js, TypeScript, PostgreSQL, Docker and Redis, with a REST API layer.",
    geography: worldwide(), ranges: [annualGross("90000", "120000", "EUR")],
  }) },
  { note: "backend Go, Kubernetes platform signals (devops 2)", snapshot: snapshot({
    id: "golden-j02", title: "Backend Developer (Go)", company: "Kestrel Systems",
    description: "Backend services in Go with PostgreSQL, Kubernetes, Docker and a microservices architecture.",
    geography: worldwide(), ranges: [annualGross("80000", "95000", "EUR")],
  }) },
  { note: "backend Rust — unfamiliar language for the Node profile", snapshot: snapshot({
    id: "golden-j03", title: "Senior Rust Backend Engineer", company: "Ferrite Tools",
    description: "Systems programming in Rust on Linux, with PostgreSQL and AWS deployment.",
    geography: worldwide(), ranges: [annualGross("100000", "130000", "EUR")],
  }) },
  { note: "blocked by geography (US only) + US-hour offsets", snapshot: snapshot({
    id: "golden-j04", title: "Backend Engineer, US Hours", company: "Copperline",
    description: "Node.js and PostgreSQL backend for a US team, with AWS infrastructure. Working hours follow US time zones.",
    geography: restricted(["US"]), employmentTypes: ["contractor"],
    schedule: scheduleOffsets([-480, -420, -360, -300]),
    ranges: [hourlyGross("70", "90", "USD")],
  }) },
  { note: "full-stack (backend+frontend overlap), monthly USD", snapshot: snapshot({
    id: "golden-j05", title: "Full-Stack Engineer (Node.js + React)", company: "Bright Harbor",
    description: "Full-stack product work with Node.js, React, TypeScript, PostgreSQL and Tailwind CSS.",
    geography: worldwide(), ranges: [monthlyGross("6000", "8000", "USD")],
  }) },
  { note: "frontend core stack, salary in EUR (incomparable for USD floor)", snapshot: snapshot({
    id: "golden-j06", title: "Senior Frontend Engineer (React)", company: "Lumen Studio",
    description: "Design system and product interface in React, TypeScript and Redux, HTML/CSS layout, GraphQL data layer.",
    geography: worldwide(), ranges: [annualGross("70000", "90000", "EUR")],
  }) },
  { note: "mobile — adjacent to frontend, freelance contract", snapshot: snapshot({
    id: "golden-j07", title: "React Native Developer", company: "Appwave",
    description: "Cross-platform mobile application in React Native, JavaScript and TypeScript for iOS and Android.",
    geography: worldwide(), employmentTypes: ["freelance"], ranges: [monthlyGross("5000", "6500", "USD")],
  }) },
  { note: "same specialisation, different framework (Angular vs React)", snapshot: snapshot({
    id: "golden-j08", title: "Angular Frontend Developer", company: "Mirage Digital",
    description: "Enterprise interface in Angular with TypeScript and HTML/CSS.",
    geography: worldwide(), ranges: [annualGross("60000", "75000", "EUR")],
  }) },
  { note: "data engineering core, worldwide, monthly USD", snapshot: snapshot({
    id: "golden-j09", title: "Data Engineer (Python/SQL)", company: "Bluegrid",
    description: "Data pipelines in Python and SQL: Data Engineering with Airflow, loading into PostgreSQL.",
    geography: worldwide(), ranges: [monthlyGross("5500", "7000", "USD")],
  }) },
  { note: "ML/NLP core, worldwide, monthly USD", snapshot: snapshot({
    id: "golden-j10", title: "Machine Learning Engineer (NLP)", company: "Cortexa",
    description: "NLP and Machine Learning models in Python: Deep Learning with PyTorch and transformers.",
    geography: worldwide(), ranges: [monthlyGross("7000", "9000", "USD")],
  }) },
  { note: "salary absent — SAL-01 not_applicable path", snapshot: snapshot({
    id: "golden-j11", title: "Data Scientist", company: "Quantiva",
    description: "Product experimentation: Python, SQL, Data Science and Machine Learning for Analytics.",
    geography: worldwide(),
  }) },
  { note: "two hiring options (worldwide full-time OR EU contractor) — OR path", snapshot: snapshot({
    id: "golden-j12", title: "Big Data Platform Engineer", company: "Ironstream",
    description: "Streaming platform: Kafka and Hadoop for Big Data, Spark for Data Engineering, Scala services on Linux.",
    geography: worldwide(), ranges: [annualGross("85000", "105000", "EUR")],
    secondOption: { geography: restricted(["DE", "PL"], "EU"), employmentTypes: ["contractor"] },
  }) },
  { note: "devops core, worldwide, EUR above the devops floor", snapshot: snapshot({
    id: "golden-j13", title: "DevOps Engineer (AWS/K8s)", company: "Northgate Cloud",
    description: "Cloud platform on AWS with Kubernetes, Terraform, CI/CD, Docker and Linux.",
    geography: worldwide(), ranges: [annualGross("95000", "115000", "EUR")],
  }) },
  { note: "SRE with explicit offset set (EU-compatible)", snapshot: snapshot({
    id: "golden-j14", title: "Site Reliability Engineer", company: "Helioscale",
    description: "Reliability work: Kubernetes and Docker platforms, Monitoring with Prometheus, Terraform, Linux and Go services.",
    geography: worldwide(), schedule: scheduleOffsets([0, 60, 120]),
    ranges: [annualGross("90000", "110000", "EUR")],
  }) },
  { note: "QA junior, RU-language text, restricted CIS, below the qa-us hard floor", snapshot: snapshot({
    id: "golden-j15", title: "Junior QA Automation (Python)", company: "Softline Test",
    description: "Автоматизация тестов на Python, Automated Testing и Manual Testing, SQL для тестовых данных.",
    language: "ru", geography: restricted(["RU", "KZ", "BY"]),
    ranges: [annualGross("18000", "25000", "USD")],
  }) },
  { note: "QA automation core for the qa-us profile, above its floor", snapshot: snapshot({
    id: "golden-j16", title: "Senior QA Automation Engineer (Playwright)", company: "Vertex Labs",
    description: "Test automation with Playwright, Automated Testing, TypeScript, CI/CD and Python.",
    geography: worldwide(), ranges: [annualGross("100000", "130000", "USD")],
  }) },
  { note: "manual QA, hourly contractor (incomparable with an annual floor)", snapshot: snapshot({
    id: "golden-j17", title: "Manual QA Analyst", company: "Harborline",
    description: "Manual Testing of web products, test cases in SQL, Jira tracking.",
    geography: worldwide(), employmentTypes: ["contractor"], ranges: [hourlyGross("25", "35", "USD")],
  }) },
  { note: "outside software engineering — design (zero-overlap SKILL-01 fail path)", snapshot: snapshot({
    id: "golden-j18", title: "Product Designer", company: "Studio Fern",
    description: "Product design: UI/UX Design in Figma and Prototyping.",
    geography: worldwide(), ranges: [annualGross("55000", "70000", "EUR")],
  }) },
  { note: "outside software engineering — games", snapshot: snapshot({
    id: "golden-j19", title: "Unity Game Developer", company: "Pixel Forge",
    description: "Game client in C# and C++, graphics with WebGL.",
    geography: worldwide(), employmentTypes: ["contractor"], ranges: [monthlyGross("4000", "5500", "USD")],
  }) },
  { note: "Russian text with Latin skill names, non-comparable KZT salary", snapshot: snapshot({
    id: "golden-j20", title: "Разработчик Node.js (удалённо)", company: "Цифровой Контур",
    description: "Разработка сервисов на Node.js, TypeScript, PostgreSQL, Docker и REST API.",
    language: "ru", geography: worldwide(), ranges: [annualGross("12000000", "15000000", "KZT")],
  }) },
  { note: "Russian analytics text; Russian skill words are not in the dictionary yet (A3 gap)", snapshot: snapshot({
    id: "golden-j21", title: "Аналитик данных", company: "Датабридж",
    description: "Аналитика продукта: Python, SQL и машинное обучение для прогнозов.",
    language: "ru", geography: worldwide(), ranges: [annualGross("9000000", "12000000", "KZT")],
  }) },
  { note: "EU-only contractor platform role (contractor path for devops)", snapshot: snapshot({
    id: "golden-j22", title: "Platform Engineer (Contractor, EU)", company: "Baltic Mesh",
    description: "Platform work on Kubernetes, Terraform, AWS, CI/CD and Linux.",
    geography: restricted(["DE", "PL", "LT", "LV", "EE"], "EU"), employmentTypes: ["contractor"],
    schedule: scheduleOffsets([0, 60, 120]), ranges: [dailyGross("500", "650", "EUR")],
  }) },
  { note: "blocked by geography (US/CA) though the stack matches exactly", snapshot: snapshot({
    id: "golden-j23", title: "Senior Backend Engineer (Node.js/PostgreSQL)", company: "Meridian Pay",
    description: "Backend for a payments product: Node.js, PostgreSQL, Docker and AWS.",
    geography: restricted(["US", "CA"]), ranges: [annualGross("150000", "180000", "USD")],
  }) },
  { note: "internship — blocked by contract preference for every profile", snapshot: snapshot({
    id: "golden-j24", title: "Frontend Engineering Intern", company: "Campus Lab",
    description: "Internship on the web team: React, JavaScript and HTML/CSS.",
    geography: worldwide(), employmentTypes: ["internship"], ranges: [annualGross("12000", "15000", "EUR")],
  }) },
  { note: "unknown contract type — CONTRACT-01 unknown, not fail", snapshot: snapshot({
    id: "golden-j25", title: "Senior Data Engineer", company: "Polarmetrics",
    description: "Python and SQL data pipelines: Data Engineering with Airflow on AWS.",
    geography: worldwide(), employmentTypes: ["unknown"], ranges: [annualGross("80000", "100000", "EUR")],
  }) },
  { note: "ambiguous schedule — TIME-01 unknown, not fail", snapshot: snapshot({
    id: "golden-j26", title: "Analytics Engineer", company: "Vector Data",
    description: "SQL and Python Analytics, with Data Engineering support for the warehouse.",
    geography: worldwide(), schedule: scheduleAmbiguous(), ranges: [annualGross("70000", "85000", "EUR")],
  }) },
  { note: "mandatory onsite — REMOTE-01 fail caps the status to needs_review", snapshot: snapshot({
    id: "golden-j27", title: "Backend Engineer (Onsite Berlin)", company: "Werksoft",
    description: "Backend services in Node.js, TypeScript and PostgreSQL on Kubernetes, from our Berlin office.",
    geography: restricted(["DE"]), mandatoryOnsite: "required",
    ranges: [annualGross("85000", "100000", "EUR")],
  }) },
  // Adversarial pair: heavy skill keywords in a posting that is not an
  // engineering role at all. This encodes the documented failure mode from the
  // research (part 1, "keyword stuffing / gamed postings"): a ranker that only
  // counts overlapping skills will surface these above real matches, and the
  // golden metrics must show that cost instead of hiding it.
  { note: "keyword trap — recruiting role stuffed with Python/SQL/ML keywords", snapshot: snapshot({
    id: "golden-j28", title: "Technical Recruiter (Python, SQL)", company: "Admetric",
    description: "Sourcing for data teams: you will read Python, SQL and Machine Learning job requirements daily, with Data Engineering vocabulary.",
    geography: worldwide(), ranges: [annualGross("60000", "75000", "USD")],
  }) },
  { note: "keyword trap — teaching role stuffed with Python/SQL/ML keywords", snapshot: snapshot({
    id: "golden-j29", title: "Data Science Instructor", company: "Skillbeam",
    description: "Teach Python, SQL and Machine Learning to career changers; the curriculum uses Data Science projects.",
    geography: worldwide(), ranges: [annualGross("70000", "90000", "USD")],
  }) },
  // Requirement-decomposition pair (item A2). j30 and j31 are the same kind of
  // backend role, but j30 states a must-have the backend profile does not have
  // while j31's must-have is covered. A ranker that only counts skills puts j30
  // first (5 matches vs 4); the grades say otherwise (2 vs 3) — that gap is the
  // measured value of the requirement layer.
  { note: "requirement pair — must-have Kubernetes (uncovered for p-backend-eu)", snapshot: snapshot({
    id: "golden-j30", title: "Senior Node.js Engineer", company: "Cloudmere",
    description: "Requirements: must have Kubernetes. You will work with Node.js, TypeScript, PostgreSQL, Docker and Redis.",
    geography: worldwide(), ranges: [annualGross("85000", "105000", "EUR")],
  }) },
  { note: "requirement pair — must-have Node.js (covered for p-backend-eu)", snapshot: snapshot({
    id: "golden-j31", title: "Backend Engineer (Node.js)", company: "Flowbase",
    description: "Requirements: must have Node.js. We use TypeScript, PostgreSQL and Docker.",
    geography: worldwide(), ranges: [annualGross("80000", "95000", "EUR")],
  }) },
  { note: "Russian must-have marker ('обязательно'), must-have Python covered for the data profiles", snapshot: snapshot({
    id: "golden-j32", title: "Инженер данных", company: "Датамост",
    description: "Требования: обязательно Python. Работаем с SQL и Airflow.",
    language: "ru", geography: worldwide(), ranges: [annualGross("18000000", "22000000", "KZT")],
  }) },
  // Freshness pair (item A5): two identical postings, one first seen by our
  // pipeline 45 days before the evaluation, one seen that same day. Without the
  // freshness term they tie and the stale one wins on id order; the grades say
  // the fresh listing is the better one to apply to (an old syndication is less
  // likely to still be live). This pair is what makes the freshness layer
  // measurable instead of assumed.
  { note: "freshness pair — stale copy (first seen 45 days before the evaluation)", snapshot: snapshot({
    id: "golden-j33", title: "Senior Data Engineer", company: "Oldport Systems",
    description: "Batch pipelines with Python, SQL, Airflow and Data Engineering on AWS.",
    geography: worldwide(), ranges: [annualGross("80000", "100000", "EUR")],
  }), firstSeenAt: "2026-08-15T08:00:00.000Z" },
  { note: "freshness pair — fresh copy (first seen on the evaluation day)", snapshot: snapshot({
    id: "golden-j34", title: "Senior Data Engineer", company: "Tidalwave",
    description: "Batch pipelines with Python, SQL, Airflow and Data Engineering on AWS.",
    geography: worldwide(), ranges: [annualGross("80000", "100000", "EUR")],
  }), firstSeenAt: "2026-09-29T08:00:00.000Z" },
  // Coverage additions of 2026-10-02 (the deferred-measurement gaps of the audit,
  // docs/OPEN_GAPS.md section D): the geography-unknown path measured by a metric
  // (A2 п.4), two cross-lingual semantic cases lexical legs cannot match at all
  // (B1/B2), and a second freshness pair at a different age for a different
  // profile (A5 п.2).
  { note: "geography NOT stated — GEO-01 unknown (not worldwide): honest review material, graded 2 for devops", snapshot: snapshot({
    id: "golden-j35", title: "Platform Engineer (Kubernetes)", company: "Northwind Systems",
    description: "Platform work with Kubernetes, Terraform, Go, PostgreSQL and CI/CD pipelines.",
    geography: unspecifiedGeography(), ranges: [monthlyGross("5500", "7000", "USD")],
  }) },
  { note: "cross-lingual semantic case: Russian-only ML posting, no Latin tokens for lexical legs", snapshot: snapshot({
    id: "golden-j36", title: "Инженер по машинному обучению", company: "Синтезлаб",
    description: "Разработка рекомендательных моделей и обработка естественного языка, обучение нейронных сетей, эксперименты и внедрение в продакшен.",
    language: "ru", geography: worldwide(), ranges: [monthlyGross("500000", "650000", "KZT")],
  }) },
  { note: "cross-lingual semantic case #2: Russian-only QA automation posting, no Latin tool names", snapshot: snapshot({
    id: "golden-j37", title: "Инженер по автоматизации тестирования", company: "ТестПолис",
    description: "Автотесты для веб-приложений: написание и поддержка тестов, регрессии, работа с требованиями и отчётность.",
    language: "ru", geography: worldwide(), ranges: [monthlyGross("400000", "500000", "KZT")],
  }) },
  { note: "freshness pair #2 — stale copy (first seen 100 days before the evaluation)", snapshot: snapshot({
    id: "golden-j38", title: "Senior React Developer", company: "Beacon Interfaces",
    description: "Product interface in React, TypeScript and Redux, HTML/CSS layout, GraphQL data layer.",
    geography: worldwide(), ranges: [annualGross("70000", "90000", "EUR")],
  }), firstSeenAt: "2026-06-21T08:00:00.000Z" },
  { note: "freshness pair #2 — fresh copy (first seen two days before the evaluation)", snapshot: snapshot({
    id: "golden-j39", title: "Senior React Developer", company: "Northline Studio",
    description: "Product interface in React, TypeScript and Redux, HTML/CSS layout, GraphQL data layer.",
    geography: worldwide(), ranges: [annualGross("70000", "90000", "EUR")],
  }), firstSeenAt: "2026-09-27T08:00:00.000Z" },
];

// --- Profiles ------------------------------------------------------------
export const GOLDEN_PROFILES: readonly GoldenProfile[] = [
  { id: "p-backend-eu", segment: "backend / EU / hard EUR floor / full-time+contractor", profile: {
    residenceCountry: "DE", timezone: "Europe/Berlin",
    targetRoles: ["backend developer", "node.js developer"],
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "REST API", "Redis"],
    employmentTypes: ["employment_full_time", "contractor"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
    zeroMandatoryAttendance: true,
    minimumCompensation: { amount: "80000", currency: "EUR", period: "annual", taxBasis: "gross", component: "base", hard: true },
    showNeedsReview: true,
  } },
  { id: "p-frontend-latam", segment: "frontend / LATAM / soft USD floor / full-time+freelance", profile: {
    residenceCountry: "BR", timezone: "America/Sao_Paulo",
    targetRoles: ["frontend developer", "react developer"],
    skills: ["React", "TypeScript", "JavaScript", "HTML/CSS", "Tailwind CSS", "Redux"],
    employmentTypes: ["employment_full_time", "freelance"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
    zeroMandatoryAttendance: true,
    minimumCompensation: { amount: "4000", currency: "USD", period: "monthly", taxBasis: "gross", component: "base", hard: false },
    showNeedsReview: true,
  } },
  { id: "p-data-asia", segment: "data engineering / APAC / no salary floor / no attendance constraint", profile: {
    residenceCountry: "ID", timezone: "Asia/Jakarta",
    targetRoles: ["data engineer", "data scientist"],
    skills: ["Python", "SQL", "Data Engineering", "Machine Learning", "Big Data"],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "16:00" }],
    zeroMandatoryAttendance: false,
    minimumCompensation: null,
    showNeedsReview: true,
  } },
  { id: "p-devops-eu", segment: "devops / EU / hard EUR floor / full-time+contractor", profile: {
    residenceCountry: "PL", timezone: "Europe/Warsaw",
    targetRoles: ["devops engineer", "platform engineer"],
    skills: ["Docker", "Kubernetes", "Terraform", "AWS", "CI/CD", "Linux", "Monitoring"],
    employmentTypes: ["employment_full_time", "contractor"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
    zeroMandatoryAttendance: true,
    minimumCompensation: { amount: "90000", currency: "EUR", period: "annual", taxBasis: "gross", component: "base", hard: true },
    showNeedsReview: true,
  } },
  { id: "p-qa-us", segment: "qa automation / US / hard USD floor / contractor+full-time", profile: {
    residenceCountry: "US", timezone: "America/New_York",
    targetRoles: ["qa engineer", "automation engineer"],
    skills: ["Automated Testing", "Manual Testing", "Load Testing", "Python", "SQL"],
    employmentTypes: ["contractor", "employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
    zeroMandatoryAttendance: false,
    minimumCompensation: { amount: "90000", currency: "USD", period: "annual", taxBasis: "gross", component: "base", hard: true },
    showNeedsReview: true,
  } },
  { id: "p-ru-ml", segment: "ml / CIS / soft KZT floor / full-time, Russian-first candidate", profile: {
    residenceCountry: "KZ", timezone: "Asia/Almaty",
    targetRoles: ["ml engineer", "data scientist"],
    skills: ["Python", "NLP", "Deep Learning", "Machine Learning", "Data Science", "SQL"],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "10:00", end: "19:00" }],
    zeroMandatoryAttendance: true,
    minimumCompensation: { amount: "500000", currency: "KZT", period: "monthly", taxBasis: "gross", component: "base", hard: false },
    showNeedsReview: true,
  } },
];

// --- Grades --------------------------------------------------------------
// Some postings carry must/nice marker words (golden-j30/j31/j32) so the
// requirement layer (item A2) is measured rather than assumed, and two pairs of
// identical postings differ only in when our pipeline first saw them
// (golden-j33/j34, golden-j38/j39) so the freshness layer (item A5) is measured
// the same way.
//
// Every judged pair is a written judgment about desirability for that
// candidate (see the legend in the header). All 37 jobs are judged for all 6
// profiles so the "unjudged shown" guard stays meaningful: if a gate change
// starts showing a job nobody judged, the harness fails loudly instead of
// scoring it as 0.
export const GOLDEN_JUDGMENTS: readonly GoldenJudgment[] = [
  { profileId: "p-backend-eu", grades: {
    "golden-j01": 3, "golden-j02": 2, "golden-j03": 1, "golden-j04": 1, "golden-j05": 2,
    "golden-j06": 1, "golden-j07": 1, "golden-j08": 1, "golden-j09": 1, "golden-j10": 1,
    "golden-j11": 1, "golden-j12": 1, "golden-j13": 1, "golden-j14": 1, "golden-j15": 0,
    "golden-j16": 0, "golden-j17": 0, "golden-j18": 0, "golden-j19": 0, "golden-j20": 3,
    "golden-j21": 1, "golden-j22": 1, "golden-j23": 1, "golden-j24": 1, "golden-j25": 1,
    "golden-j26": 1, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 2, "golden-j31": 3, "golden-j32": 1,
    "golden-j33": 2, "golden-j34": 3,
    "golden-j35": 1, "golden-j36": 1, "golden-j37": 1, "golden-j38": 1, "golden-j39": 1,
  } },
  { profileId: "p-frontend-latam", grades: {
    "golden-j01": 1, "golden-j02": 1, "golden-j03": 1, "golden-j04": 1, "golden-j05": 2,
    "golden-j06": 3, "golden-j07": 1, "golden-j08": 1, "golden-j09": 1, "golden-j10": 1,
    "golden-j11": 1, "golden-j12": 1, "golden-j13": 1, "golden-j14": 1, "golden-j15": 1,
    "golden-j16": 1, "golden-j17": 1, "golden-j18": 0, "golden-j19": 0, "golden-j20": 1,
    "golden-j21": 1, "golden-j22": 1, "golden-j23": 1, "golden-j24": 0, "golden-j25": 1,
    "golden-j26": 1, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 1, "golden-j31": 1, "golden-j32": 1,
    "golden-j33": 1, "golden-j34": 1,
    "golden-j35": 1, "golden-j36": 1, "golden-j37": 1, "golden-j38": 2, "golden-j39": 3,
  } },
  { profileId: "p-data-asia", grades: {
    "golden-j01": 1, "golden-j02": 1, "golden-j03": 1, "golden-j04": 1, "golden-j05": 1,
    "golden-j06": 1, "golden-j07": 1, "golden-j08": 1, "golden-j09": 3, "golden-j10": 2,
    "golden-j11": 2, "golden-j12": 2, "golden-j13": 1, "golden-j14": 1, "golden-j15": 1,
    "golden-j16": 1, "golden-j17": 1, "golden-j18": 0, "golden-j19": 0, "golden-j20": 1,
    "golden-j21": 2, "golden-j22": 1, "golden-j23": 1, "golden-j24": 0, "golden-j25": 2,
    "golden-j26": 2, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 1, "golden-j31": 1, "golden-j32": 3,
    "golden-j33": 2, "golden-j34": 3,
    "golden-j35": 1, "golden-j36": 2, "golden-j37": 1, "golden-j38": 1, "golden-j39": 1,
  } },
  { profileId: "p-devops-eu", grades: {
    "golden-j01": 1, "golden-j02": 2, "golden-j03": 1, "golden-j04": 1, "golden-j05": 1,
    "golden-j06": 1, "golden-j07": 1, "golden-j08": 1, "golden-j09": 1, "golden-j10": 1,
    "golden-j11": 1, "golden-j12": 1, "golden-j13": 3, "golden-j14": 3, "golden-j15": 1,
    "golden-j16": 1, "golden-j17": 1, "golden-j18": 0, "golden-j19": 0, "golden-j20": 1,
    "golden-j21": 1, "golden-j22": 3, "golden-j23": 1, "golden-j24": 0, "golden-j25": 1,
    "golden-j26": 1, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 1, "golden-j31": 1, "golden-j32": 1,
    "golden-j33": 1, "golden-j34": 1,
    "golden-j35": 2, "golden-j36": 1, "golden-j37": 1, "golden-j38": 1, "golden-j39": 1,
  } },
  { profileId: "p-qa-us", grades: {
    "golden-j01": 1, "golden-j02": 1, "golden-j03": 1, "golden-j04": 1, "golden-j05": 1,
    "golden-j06": 1, "golden-j07": 1, "golden-j08": 1, "golden-j09": 1, "golden-j10": 1,
    "golden-j11": 1, "golden-j12": 1, "golden-j13": 1, "golden-j14": 1, "golden-j15": 1,
    "golden-j16": 3, "golden-j17": 1, "golden-j18": 0, "golden-j19": 0, "golden-j20": 1,
    "golden-j21": 1, "golden-j22": 1, "golden-j23": 1, "golden-j24": 0, "golden-j25": 1,
    "golden-j26": 1, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 1, "golden-j31": 1, "golden-j32": 1,
    "golden-j33": 1, "golden-j34": 1,
    "golden-j35": 1, "golden-j36": 1, "golden-j37": 2, "golden-j38": 1, "golden-j39": 1,
  } },
  { profileId: "p-ru-ml", grades: {
    "golden-j01": 1, "golden-j02": 1, "golden-j03": 1, "golden-j04": 1, "golden-j05": 1,
    "golden-j06": 1, "golden-j07": 1, "golden-j08": 1, "golden-j09": 2, "golden-j10": 3,
    "golden-j11": 3, "golden-j12": 1, "golden-j13": 1, "golden-j14": 1, "golden-j15": 1,
    "golden-j16": 1, "golden-j17": 1, "golden-j18": 0, "golden-j19": 0, "golden-j20": 1,
    "golden-j21": 2, "golden-j22": 1, "golden-j23": 1, "golden-j24": 0, "golden-j25": 2,
    "golden-j26": 2, "golden-j27": 1,
    "golden-j28": 0, "golden-j29": 0,
    "golden-j30": 1, "golden-j31": 1, "golden-j32": 2,
    "golden-j33": 1, "golden-j34": 1,
    "golden-j35": 1, "golden-j36": 3, "golden-j37": 1, "golden-j38": 1, "golden-j39": 1,
  } },
];

export const GOLDEN_SET: GoldenSet = {
  id: "matching-golden",
  version: 4,
  gradesLegend: "3 strong / 2 good (minor gaps, unclear conditions) / 1 neighbouring specialisation or blocked by own hard conditions / 0 outside software engineering. Relevant for recall and MRR: grade >= 2.",
  // Fixed reference time for the freshness term and age labels (item A5): the
  // harness never reads the clock, so results stay reproducible.
  evaluatedAt: "2026-09-29T12:00:00.000Z",
  profiles: GOLDEN_PROFILES,
  jobs: GOLDEN_JOBS,
  judgments: GOLDEN_JUDGMENTS,
};
