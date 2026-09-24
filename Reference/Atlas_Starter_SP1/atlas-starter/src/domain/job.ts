export type Workplace = "remote" | "hybrid" | "onsite" | "unknown";
export type Presence = "required" | "not_stated" | "explicitly_not_required" | "unknown";

export type StarterJob = Readonly<{
  id: string;
  sourceId: "atlas-fixtures";
  externalId: string;
  contentVersion: number;
  title: string;
  company: string;
  team: string;
  description: string;
  skills: readonly string[];
  salaryLabel: string;
  geographyLabel: string;
  geographyKnown: boolean;
  contractLabel: string;
  publishedDate: string;
  remote: Readonly<{
    type: Workplace;
    permanent: boolean;
    mandatoryPresence: Presence;
    evidence: string;
    conflict: boolean;
  }>;
  lifecycle: "active" | "closed" | "stale";
  synthetic: true;
}>;

export interface CatalogRepository {
  all(): Promise<readonly StarterJob[]>;
}

export type CatalogQuery = Readonly<{ q: string; offset: number; limit: number }>;

export class InvalidQueryError extends Error {
  constructor() { super("INVALID_QUERY"); }
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const allowed = new Set(["q", "offset", "limit"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new InvalidQueryError();
  }
  const q = (params.get("q") ?? "").trim();
  if (q.length > 100 || /[\u0000-\u001f]/u.test(q)) throw new InvalidQueryError();
  const integer = (key: string, fallback: number, max: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (!/^(0|[1-9][0-9]{0,4})$/u.test(raw)) throw new InvalidQueryError();
    const value = Number(raw);
    if (value > max) throw new InvalidQueryError();
    return value;
  };
  const limit = integer("limit", 20, 50);
  if (limit < 1) throw new InvalidQueryError();
  return { q, offset: integer("offset", 0, 1000), limit };
}

export function remoteGate(job: StarterJob): boolean {
  return job.remote.type === "remote" &&
    job.remote.permanent &&
    ["not_stated", "explicitly_not_required"].includes(job.remote.mandatoryPresence) &&
    !job.remote.conflict && job.remote.evidence.trim().length > 0;
}

export function visibleInCatalog(job: StarterJob): boolean {
  return job.synthetic && job.sourceId === "atlas-fixtures" &&
    job.lifecycle === "active" && remoteGate(job);
}

export function selectCatalog(jobs: readonly StarterJob[], query: CatalogQuery) {
  const terms = query.q.toLocaleLowerCase("ru").split(/\s+/u).filter(Boolean);
  const visible = jobs.filter(visibleInCatalog).filter(job => {
    const haystack = [job.title, job.company, ...job.skills].join(" ").toLocaleLowerCase("ru");
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.id.localeCompare(b.id));
  return { items: visible.slice(query.offset, query.offset + query.limit), total: visible.length };
}

// Starter interchange guard, NOT the full production JobSnapshot contract.
export function isStarterJob(value: unknown): value is StarterJob {
  if (!value || typeof value !== "object") return false;
  const j = value as Record<string, unknown>;
  const strings = ["id", "externalId", "title", "company", "team", "description",
    "salaryLabel", "geographyLabel", "contractLabel", "publishedDate"];
  if (!strings.every(key => typeof j[key] === "string" && (j[key] as string).length <= 12000)) return false;
  if (!/^[a-z0-9-]{1,80}$/u.test(j.id as string)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(j.publishedDate as string)) return false;
  if (j.sourceId !== "atlas-fixtures" || j.synthetic !== true) return false;
  if (!Number.isSafeInteger(j.contentVersion) || Number(j.contentVersion) < 1) return false;
  if (!Array.isArray(j.skills) || j.skills.length > 20 ||
      !j.skills.every(s => typeof s === "string" && s.length <= 80)) return false;
  if (typeof j.geographyKnown !== "boolean" ||
      !["active", "closed", "stale"].includes(String(j.lifecycle))) return false;
  const r = j.remote;
  if (!r || typeof r !== "object") return false;
  const remote = r as Record<string, unknown>;
  return ["remote", "hybrid", "onsite", "unknown"].includes(String(remote.type)) &&
    typeof remote.permanent === "boolean" && typeof remote.conflict === "boolean" &&
    typeof remote.evidence === "string" && remote.evidence.length <= 12000 &&
    ["required", "not_stated", "explicitly_not_required", "unknown"].includes(String(remote.mandatoryPresence));
}
