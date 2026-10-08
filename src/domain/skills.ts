// Versioned skills dictionary: canonical names, aliases (EN+RU), categories.
// Used for deterministic skill extraction from CV text and job descriptions.
// Adding a skill here does NOT claim the user has it — it only enables
// the extractor to recognize the mention and propose it for confirmation.
//
// v2 (2026-09-29, design item A3): Russian aliases and a few missed English
// forms live in ALIAS_DELTA_V2 below, and ambiguous one-word aliases (go, docs,
// rest, rust, spring…) now require capitalisation — the golden harness measured
// the cost of reading ordinary prose as skills ("We go fast" -> ["Go"]).
//
// v3 (2026-10-04, ESCO-001): alias additions accepted from the ESCO v1.2.1
// skills part live in src/domain/skills-esco.ts (ESCO_ALIAS_DELTA), next to the
// concept mapping that traces each one back to the fetched artifact. The merge
// below is the only place they enter the dictionary; licence and review rules
// are in that file's header and docs/DEPENDENCIES.md.
import { ESCO_ALIAS_DELTA } from "./skills-esco.ts";

export const SKILLS_DICTIONARY_VERSION = 3;

export type SkillCategory =
  | "frontend" | "backend" | "database" | "devops" | "mobile"
  | "data" | "ai_ml" | "security" | "qa" | "design"
  | "product" | "management" | "languages" | "cloud" | "other";

export type SkillEntry = Readonly<{
  canonical: string;
  aliases: readonly string[];
  category: SkillCategory;
}>;

export const SKILLS_DICTIONARY: readonly SkillEntry[] = [
  // Frontend
  { canonical: "React", aliases: ["react", "react.js", "reactjs"], category: "frontend" },
  { canonical: "Vue.js", aliases: ["vue", "vue.js", "vuejs"], category: "frontend" },
  { canonical: "Angular", aliases: ["angular", "angularjs"], category: "frontend" },
  { canonical: "Svelte", aliases: ["svelte", "sveltekit"], category: "frontend" },
  { canonical: "Next.js", aliases: ["next", "next.js", "nextjs"], category: "frontend" },
  { canonical: "TypeScript", aliases: ["typescript", "ts"], category: "frontend" },
  { canonical: "JavaScript", aliases: ["javascript", "js", "es6"], category: "frontend" },
  { canonical: "HTML/CSS", aliases: ["html", "css", "html5", "css3", "scss", "sass"], category: "frontend" },
  { canonical: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"], category: "frontend" },
  { canonical: "Redux", aliases: ["redux", "redux-toolkit"], category: "frontend" },
  { canonical: "GraphQL", aliases: ["graphql", "apollo"], category: "frontend" },
  { canonical: "WebGL", aliases: ["webgl", "three.js", "threejs", "canvas"], category: "frontend" },
  { canonical: "Accessibility", aliases: ["accessibility", "a11y", "wcag", "screen reader"], category: "frontend" },

  // Backend
  { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"], category: "backend" },
  { canonical: "Python", aliases: ["python", "py", "django", "flask", "fastapi"], category: "backend" },
  { canonical: "Go", aliases: ["go", "golang"], category: "backend" },
  { canonical: "Rust", aliases: ["rust", "rustlang"], category: "backend" },
  { canonical: "Java", aliases: ["java", "spring", "spring-boot"], category: "backend" },
  { canonical: "Kotlin", aliases: ["kotlin", "ktor"], category: "backend" },
  { canonical: "Ruby", aliases: ["ruby", "rails", "ruby-on-rails"], category: "backend" },
  { canonical: "PHP", aliases: ["php", "laravel", "symfony"], category: "backend" },
  { canonical: "C#", aliases: ["c#", "csharp", ".net", "dotnet", "asp.net"], category: "backend" },
  { canonical: "C++", aliases: ["c++", "cpp"], category: "backend" },
  { canonical: "Scala", aliases: ["scala", "akka"], category: "backend" },
  { canonical: "Elixir", aliases: ["elixir", "phoenix"], category: "backend" },
  { canonical: "gRPC", aliases: ["grpc", "protobuf", "protocol buffers"], category: "backend" },
  { canonical: "REST API", aliases: ["rest", "rest api", "restful", "api design"], category: "backend" },
  { canonical: "Microservices", aliases: ["microservices", "micro-services", "service-oriented"], category: "backend" },
  { canonical: "Event Sourcing", aliases: ["event sourcing", "cqrs", "event-driven"], category: "backend" },

  // Database
  { canonical: "PostgreSQL", aliases: ["postgres", "postgresql", "pg"], category: "database" },
  { canonical: "MySQL", aliases: ["mysql", "mariadb"], category: "database" },
  { canonical: "MongoDB", aliases: ["mongodb", "mongo"], category: "database" },
  { canonical: "Redis", aliases: ["redis", "memcached"], category: "database" },
  { canonical: "Elasticsearch", aliases: ["elasticsearch", "elastic", "opensearch"], category: "database" },
  { canonical: "SQLite", aliases: ["sqlite"], category: "database" },
  { canonical: "ClickHouse", aliases: ["clickhouse"], category: "database" },
  { canonical: "DynamoDB", aliases: ["dynamodb", "dynamo"], category: "database" },
  { canonical: "SQL", aliases: ["sql", "queries", "query optimization"], category: "database" },
  { canonical: "NoSQL", aliases: ["nosql", "key-value", "document store"], category: "database" },

  // DevOps
  { canonical: "Docker", aliases: ["docker", "containers", "containerization"], category: "devops" },
  { canonical: "Kubernetes", aliases: ["kubernetes", "k8s"], category: "devops" },
  { canonical: "Terraform", aliases: ["terraform", "iac", "infrastructure-as-code"], category: "devops" },
  { canonical: "CI/CD", aliases: ["ci/cd", "continuous integration", "continuous deployment", "jenkins", "gitlab-ci", "github-actions"], category: "devops" },
  { canonical: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"], category: "devops" },
  { canonical: "GCP", aliases: ["gcp", "google cloud", "cloud run"], category: "devops" },
  { canonical: "Azure", aliases: ["azure", "microsoft cloud"], category: "devops" },
  { canonical: "Linux", aliases: ["linux", "ubuntu", "debian", "centos", "unix", "bash"], category: "devops" },
  { canonical: "Nginx", aliases: ["nginx", "reverse proxy", "load balancer"], category: "devops" },
  { canonical: "Monitoring", aliases: ["monitoring", "prometheus", "grafana", "datadog", "observability"], category: "devops" },
  { canonical: "Ansible", aliases: ["ansible", "configuration management"], category: "devops" },

  // Mobile
  { canonical: "React Native", aliases: ["react native", "react-native"], category: "mobile" },
  { canonical: "Flutter", aliases: ["flutter", "dart"], category: "mobile" },
  { canonical: "iOS", aliases: ["ios", "swift", "swiftui", "xcode"], category: "mobile" },
  { canonical: "Android", aliases: ["android", "kotlin-android", "jetpack"], category: "mobile" },

  // Data & AI/ML
  { canonical: "Machine Learning", aliases: ["machine learning", "ml", "scikit", "sklearn", "model training"], category: "ai_ml" },
  { canonical: "Deep Learning", aliases: ["deep learning", "neural networks", "pytorch", "tensorflow", "keras"], category: "ai_ml" },
  { canonical: "NLP", aliases: ["nlp", "natural language processing", "llm", "transformers", "bert", "gpt"], category: "ai_ml" },
  { canonical: "Computer Vision", aliases: ["computer vision", "opencv", "image processing"], category: "ai_ml" },
  { canonical: "Data Science", aliases: ["data science", "pandas", "numpy", "jupyter", "statistics"], category: "data" },
  { canonical: "Data Engineering", aliases: ["data engineering", "etl", "elt", "airflow", "dbt", "spark"], category: "data" },
  { canonical: "Analytics", aliases: ["analytics", "bi", "tableau", "power bi", "looker"], category: "data" },
  { canonical: "Big Data", aliases: ["big data", "hadoop", "kafka", "streaming"], category: "data" },

  // Security
  { canonical: "Cybersecurity", aliases: ["cybersecurity", "cyber security", "infosec", "penetration testing", "pentest"], category: "security" },
  { canonical: "DevSecOps", aliases: ["devsecops", "security engineering", "appsec"], category: "security" },
  { canonical: "Cryptography", aliases: ["cryptography", "encryption", "tls", "ssl", "pkI"], category: "security" },
  { canonical: "OWASP", aliases: ["owasp", "web security", "security testing"], category: "security" },

  // QA
  { canonical: "Automated Testing", aliases: ["automated testing", "jest", "cypress", "playwright", "selenium", "pytest"], category: "qa" },
  { canonical: "Manual Testing", aliases: ["manual testing", "qa", "test cases", "regression testing"], category: "qa" },
  { canonical: "Load Testing", aliases: ["load testing", "performance testing", "stress testing"], category: "qa" },

  // Design
  { canonical: "UI/UX Design", aliases: ["ui/ux", "ui design", "ux design", "figma", "sketch", "design system"], category: "design" },
  { canonical: "Graphic Design", aliases: ["graphic design", "photoshop", "illustrator", "branding"], category: "design" },
  { canonical: "Prototyping", aliases: ["prototyping", "wireframing", "mockups"], category: "design" },

  // Product & Management
  { canonical: "Product Management", aliases: ["product management", "product owner", "roadmap", "backlog"], category: "product" },
  { canonical: "Project Management", aliases: ["project management", "agile", "scrum", "kanban", "jira"], category: "management" },
  { canonical: "Team Leadership", aliases: ["team leadership", "team lead", "people management", "mentoring"], category: "management" },
  { canonical: "Technical Writing", aliases: ["technical writing", "documentation", "docs"], category: "other" },

  // Languages
  { canonical: "English", aliases: ["english", "английский"], category: "languages" },
  { canonical: "German", aliases: ["german", "немецкий", "deutsch"], category: "languages" },
  { canonical: "French", aliases: ["french", "французский"], category: "languages" },
  { canonical: "Spanish", aliases: ["spanish", "испанский"], category: "languages" },
  { canonical: "Russian", aliases: ["russian", "русский"], category: "languages" },

  // Cloud (overlaps with devops but distinct enough)
  { canonical: "Serverless", aliases: ["serverless", "lambda functions", "faas"], category: "cloud" },
  { canonical: "Edge Computing", aliases: ["edge computing", "cdn", "cloudflare workers"], category: "cloud" },
];

// v2 alias delta (item A3): Russian-language names for the skills that appear
// in Russian-language postings, plus a few English forms that were missing.
// Kept as an explicit delta instead of editing sixty entries above: the review
// diff shows exactly what v2 added, and the maintenance flow stays obvious —
// add a line here, bump the version, and the tests below cover it.
const ALIAS_DELTA_V2: Readonly<Record<string, readonly string[]>> = {
  "JavaScript": ["ecmascript"],
  "SQL": ["базы данных"],
  "Microservices": ["микросервисы"],
  "Monitoring": ["мониторинг"],
  "Terraform": ["инфраструктура как код"],
  "Machine Learning": ["машинное обучение"],
  "Deep Learning": ["глубокое обучение", "нейронные сети"],
  "NLP": ["обработка естественного языка"],
  "Data Engineering": ["инженерия данных"],
  "Analytics": ["аналитика"],
  "Big Data": ["большие данные"],
  "Automated Testing": ["автотесты", "автоматизация тестирования"],
  "Manual Testing": ["ручное тестирование"],
  "Load Testing": ["нагрузочное тестирование"],
  "Cybersecurity": ["кибербезопасность", "информационная безопасность"],
  "Project Management": ["управление проектами"],
  "Product Management": ["управление продуктом"],
  "Team Leadership": ["руководство командой"],
  "UI/UX Design": ["дизайн интерфейсов"],
};

// Exported for the tests that assert two properties this delta must keep:
// every target canonical exists, and no delta alias steals a name that already
// belongs to a different canonical in the list above.
export const ALIAS_DELTA_V2_ENTRIES = ALIAS_DELTA_V2;

// Build a lookup map: lowercase alias → canonical skill. Both deltas are merged
// in the same pass (no mutation afterwards), so a name collision would be a
// reviewable conflict rather than a silent overwrite in the tests.
const aliasMap: ReadonlyMap<string, string> = new Map<string, string>([
  ...SKILLS_DICTIONARY.flatMap(entry =>
    [entry.canonical.toLowerCase(), ...entry.aliases.map(a => a.toLowerCase())]
      .map(alias => [alias, entry.canonical] as const),
  ),
  ...Object.entries(ALIAS_DELTA_V2).flatMap(([canonical, aliases]) =>
    aliases.map(alias => [alias.toLowerCase(), canonical] as const),
  ),
  ...Object.entries(ESCO_ALIAS_DELTA).flatMap(([canonical, aliases]) =>
    aliases.map(alias => [alias.toLowerCase(), canonical] as const),
  ),
]);

export function skillCategory(canonical: string): SkillCategory {
  return SKILLS_DICTIONARY.find(s => s.canonical === canonical)?.category ?? "other";
}

// Canonical name for a single skill mention ("k8s" -> "Kubernetes").
// Returns null when the value is not in the dictionary — callers must treat
// that as "not recognised", never as a match.
export function canonicalSkillName(value: string): string | null {
  return aliasMap.get(value.trim().toLowerCase()) ?? null;
}

// Is this single token a known alias at all? Used by the vocabulary worklist
// (src/domain/dictionary-coverage.ts), not by matching.
export function hasAlias(token: string): boolean {
  return aliasMap.has(token.trim().toLowerCase());
}

// Aliases that are ordinary English words. They only match when the source text
// capitalises them ("Go", "Rust", "REST"): a posting that writes "we go fast" is
// not offering a Go role. The golden harness measured that failure mode on
// 2026-09-29 (extractSkills("We go fast") -> ["Go"], and a keyword-stuffed
// posting climbed the data ranking on "ml"/"bi"-class false matches).
export const AMBIGUOUS_ALIASES: ReadonlySet<string> = new Set([
  "go", "docs", "bi", "ml", "ts", "js", "py", "pg", "rest", "rust",
  "spring", "rails", "swift", "phoenix", "canvas", "queries", "statistics",
]);

function isCapitalisedAt(text: string, index: number): boolean {
  const first = text[index];
  return first !== undefined && /\p{Lu}/u.test(first);
}

// Aliases sorted by length descending, built once ("react native" matches before
// "react"). The sort is stable, so equal-length aliases keep dictionary order.
const SORTED_ALIASES: readonly (readonly [string, string])[] =
  [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);

// Prefilter (B41): an alias of three or more characters can only occur in a text
// that contains its first three characters, so a call marks the aliases whose
// opening trigram occurs and tries only those, in the same order as the full scan.
// The result is unchanged; a short sentence used to pay for every alias in the
// dictionary. Aliases shorter than three characters are always tried. The trigram
// is looked up by a 16-bit hash of its character codes, with no allocation per
// position; a collision only adds a candidate, which the scan then rejects.
const KEY_LENGTH = 3;
const HASH_MASK = 0xffff;

function trigramHash(first: number, second: number, third: number): number {
  return (((first * 31) + second) * 31 + third) & HASH_MASK;
}

const ALIASES_BY_HASH: readonly (readonly number[] | undefined)[] = (() => {
  const byHash: number[][] = [];
  SORTED_ALIASES.forEach(([alias], index) => {
    if (alias.length < KEY_LENGTH) return;
    const hash = trigramHash(alias.charCodeAt(0), alias.charCodeAt(1), alias.charCodeAt(2));
    const bucket = byHash[hash];
    if (bucket) bucket.push(index);
    else byHash[hash] = [index];
  });
  return byHash;
})();
const ALWAYS_TRIED: Uint8Array = Uint8Array.from(SORTED_ALIASES, ([alias]) => (alias.length < KEY_LENGTH ? 1 : 0));

// Marks, one byte per alias in SORTED_ALIASES order, of the aliases worth scanning for.
function candidateMarks(lower: string): Uint8Array {
  const marks = ALWAYS_TRIED.slice();
  const last = lower.length - KEY_LENGTH;
  for (let start = 0; start <= last; start += 1) {
    const bucket = ALIASES_BY_HASH[trigramHash(
      lower.charCodeAt(start), lower.charCodeAt(start + 1), lower.charCodeAt(start + 2))];
    if (bucket) for (const index of bucket) marks[index] = 1;
  }
  return marks;
}

// A text is scanned by several callers in one request (matching, ranking, the
// negative-preference model, requirements, per sentence) and again by the next
// request: the answer is remembered up to a character budget, oldest first out.
// Results are frozen: the cache hands every caller the same array.
const MEMO_CHAR_BUDGET = 48_000_000;
const memo = new Map<string, readonly string[]>();
let memoChars = 0;

function remember(text: string, result: readonly string[]): void {
  memo.set(text, result);
  memoChars += text.length;
  for (const [oldest] of memo) {
    if (memoChars <= MEMO_CHAR_BUDGET) break;
    memo.delete(oldest);
    memoChars -= oldest.length;
  }
}

// Deterministic skill extraction from free text (CV or job description).
// Returns canonical skill names found in the text. Longer aliases are
// matched first and their text ranges are consumed, preventing shorter
// aliases from matching inside them ("Node.js" won't also match "js").
export function extractSkills(text: string): readonly string[] {
  const remembered = memo.get(text);
  if (remembered) return remembered;
  const result = Object.freeze(scanSkills(text));
  remember(text, result);
  return result;
}

function scanSkills(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  // Parallel copy of the original text: toLowerCase preserves length for the
  // scripts this dictionary covers, so match indices line up and the
  // capitalisation rule can look at the source form of a match.
  const original = ` ${text} `;
  const found: string[] = [];
  const seen = new Set<string>();
  const consumed: [number, number][] = [];
  const delimiters = new Set([" ", "\t", "\n", "\r", ",", ";", ":", "(", ")", "[", "]", "{", "}", '"', "'", "/", ".", "!", "?", "-", "_", "+", "=", "|", "&", "@", "#", "$", "%", "^", "*", "~", "`", "<", ">"]);
  const isAvailable = (start: number, end: number) =>
    !consumed.some(([cs, ce]) => start < ce && end > cs);
  const marks = candidateMarks(lower);
  for (let aliasIndex = 0; aliasIndex < marks.length; aliasIndex += 1) {
    if (marks[aliasIndex] === 0) continue;
    const [alias, canonical] = SORTED_ALIASES[aliasIndex] as readonly [string, string];
    if (seen.has(canonical)) continue;
    let index = lower.indexOf(alias);
    while (index !== -1) {
      const before = lower[index - 1] ?? " ";
      const after = lower[index + alias.length] ?? " ";
      const end = index + alias.length;
      const caseOk = !AMBIGUOUS_ALIASES.has(alias) || isCapitalisedAt(original, index);
      if (caseOk && delimiters.has(before) && delimiters.has(after) && isAvailable(index, end)) {
        if (!seen.has(canonical)) {
          found.push(canonical);
          seen.add(canonical);
        }
        consumed.push([index, end]);
        // Keep scanning instead of stopping at the first hit: every later
        // occurrence of this alias must be consumed as well, otherwise a
        // shorter alias can match inside it. Measured defect (2026-09-29): a
        // posting with "Node.js" twice let "js" match the second occurrence and
        // reported JavaScript for a profile that only knows Node.js.
      }
      index = lower.indexOf(alias, index + 1);
    }
  }
  return found;
}

// Overlap: what fraction of the user's skills appear in the job's skills?
export function skillOverlap(userSkills: readonly string[], jobSkills: readonly string[]): Readonly<{
  overlap: number; matched: readonly string[]; missing: readonly string[];
}> {
  const jobSet = new Set(jobSkills.map(s => s.toLowerCase()));
  const matched = userSkills.filter(skill => jobSet.has(skill.toLowerCase()));
  const missing = userSkills.filter(skill => !jobSet.has(skill.toLowerCase()));
  const overlap = userSkills.length === 0 ? 0 : matched.length / userSkills.length;
  return { overlap, matched, missing };
}
