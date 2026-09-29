// Versioned skills dictionary: canonical names, aliases (EN+RU), categories.
// Used for deterministic skill extraction from CV text and job descriptions.
// Adding a skill here does NOT claim the user has it — it only enables
// the extractor to recognize the mention and propose it for confirmation.

export const SKILLS_DICTIONARY_VERSION = 1;

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

// Build a lookup map: lowercase alias → canonical skill.
const aliasMap: ReadonlyMap<string, string> = new Map(
  SKILLS_DICTIONARY.flatMap(entry =>
    [entry.canonical.toLowerCase(), ...entry.aliases.map(a => a.toLowerCase())]
      .map(alias => [alias, entry.canonical] as const),
  ),
);

export function skillCategory(canonical: string): SkillCategory {
  return SKILLS_DICTIONARY.find(s => s.canonical === canonical)?.category ?? "other";
}

// Canonical name for a single skill mention ("k8s" -> "Kubernetes").
// Returns null when the value is not in the dictionary — callers must treat
// that as "not recognised", never as a match.
export function canonicalSkillName(value: string): string | null {
  return aliasMap.get(value.trim().toLowerCase()) ?? null;
}

// Deterministic skill extraction from free text (CV or job description).
// Returns canonical skill names found in the text. Longer aliases are
// matched first and their text ranges are consumed, preventing shorter
// aliases from matching inside them ("Node.js" won't also match "js").
export function extractSkills(text: string): readonly string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  const seen = new Set<string>();
  const consumed: [number, number][] = [];
  const delimiters = new Set([" ", "\t", "\n", "\r", ",", ";", ":", "(", ")", "[", "]", "{", "}", '"', "'", "/", ".", "!", "?", "-", "_", "+", "=", "|", "&", "@", "#", "$", "%", "^", "*", "~", "`", "<", ">"]);
  const isAvailable = (start: number, end: number) =>
    !consumed.some(([cs, ce]) => start < ce && end > cs);
  // Sort aliases by length descending so "react native" matches before "react".
  const sortedAliases = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of sortedAliases) {
    if (seen.has(canonical)) continue;
    let index = lower.indexOf(alias);
    while (index !== -1) {
      const before = lower[index - 1] ?? " ";
      const after = lower[index + alias.length] ?? " ";
      const end = index + alias.length;
      if (delimiters.has(before) && delimiters.has(after) && isAvailable(index, end)) {
        found.push(canonical);
        seen.add(canonical);
        consumed.push([index, end]);
        break;
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
