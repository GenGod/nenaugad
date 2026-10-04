// ESCO skills artifact (ESCO-001; owner decision E.6, 2026-10-02).
//
// `npm run esco:fetch`              — fetch missing files, verify every file
// `npm run esco:fetch -- --check`   — verify the local artifact, download nothing
// `npm run esco:fetch -- --propose` — offline: print mapping/alias candidates
//
// Why a reviewed command instead of a runtime dependency: the ESCO skills part
// is external content with licence obligations (attribution and an
// adapted-version note — docs/DEPENDENCIES.md), and the alias delta must trace
// back to a frozen artifact. This script downloads the released dataset
// (v1.2.1) through the open ESCO REST API and pins every file by sha256 in a
// committed manifest (data/esco-manifest.json). The files themselves live in
// data/esco/ and are never committed.
//
// What the artifact is: the skill concepts of ESCO v1.2.1 with their full
// documents (`type=skill&full=true`, 13 939 skills in 140 pages) — preferred
// and alternative labels in all 28 languages, status and description. The
// occupations part (ISCO/ILO) is never fetched.
//
// Two API quirks this script encodes, both verified live on 2026-10-04:
//   * `offset` is a PAGE NUMBER, not an item offset — the API's own "next"
//     link says offset=1 after the first page, and `offset=100&limit=100` is
//     the 101st page (item 10 000), not a request beyond the end;
//   * `full=true` caps a page at 100 items even when a larger limit is asked,
//     so the page arithmetic has to use 100.
// Reading either one the intuitive way produces empty pages at depth — the
// kind of failure that would otherwise be recorded as "the dataset ends at
// 200 skills".
//
// What it guarantees:
//   * every file is verified against its recorded sha256; an existing file with
//     a different hash is a refusal, not an overwrite;
//   * pages must be contiguous: the item count per page follows from the total,
//     and a URI seen on two pages fails the run — a shifted page is caught
//     here, not in the delta;
//   * each concept linked in src/domain/skills-esco.ts must exist in the
//     artifact with exactly the recorded English label (checked by --check and
//     at the end of every fetch);
//   * nothing is written outside data/esco/ and data/esco-manifest.json.
//
// Proposal mode is read-only: it matches the dictionary (src/domain/skills.ts)
// against the cached artifact and prints exact matches (preferred and
// alternative labels), whole-word containment candidates, and the alternative
// labels of already-linked concepts. It only prints — the delta itself is a
// human-reviewed change in src/domain/skills-esco.ts.
//
// Exit codes: 0 — ok; 1 — a file is missing or does not match; 2 — could not run.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALIAS_DELTA_V2_ENTRIES,
  AMBIGUOUS_ALIASES,
  canonicalSkillName,
  SKILLS_DICTIONARY,
  SKILLS_DICTIONARY_VERSION,
} from "../src/domain/skills.ts";
import { ESCO_SKILL_CONCEPTS } from "../src/domain/skills-esco.ts";

const API_BASE = "https://ec.europa.eu/esco/api";
const DATASET_VERSION = "v1.2.1";
/** 100 is not a taste: `full=true` clamps a page to 100 items server-side. */
const PAGE_LIMIT = 100;
const ARTIFACT_DIR = path.resolve("data/esco");
const MANIFEST_FILE = path.resolve("data/esco-manifest.json");
const USER_AGENT = "nenaugad-esco-fetch/1.0 (+local development; contact: repository owner)";
const REQUEST_TIMEOUT_MS = 120_000;
const REQUEST_PAUSE_MS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONCEPT_URI_PREFIX = "http://data.europa.eu/esco/skill/";
const PROPOSE_MAX_PER_CANONICAL = 10;

type PagePin = { file: string; page: number; items: number; bytes: number; sha256: string };
type Manifest = {
  source: string;
  apiBase: string;
  apiVersion: string;
  datasetVersion: string;
  index: { query: string; total: number; retrievedAt: string; pages: PagePin[] };
};

type SkillItem = {
  uri: string;
  preferredLabel: Record<string, unknown>;
  alternativeLabel: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

async function exists(filename: string): Promise<boolean> {
  try {
    return (await stat(filename)).isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).length > 0;
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}: ${text.slice(0, 200)}`);
  }
  return text;
}

function pageUrl(page: number): string {
  return `${API_BASE}/search?${new URLSearchParams({
    text: "", type: "skill", language: "en", full: "true",
    limit: String(PAGE_LIMIT), offset: String(page), selectedVersion: DATASET_VERSION,
  })}`;
}

function artifactFile(relative: string): string {
  const target = path.resolve(ARTIFACT_DIR, relative);
  // Boundary check: a pin can only ever place a file inside the artifact dir.
  if (target !== ARTIFACT_DIR && !target.startsWith(ARTIFACT_DIR + path.sep)) {
    throw new Error(`refusing to write outside the artifact directory: ${relative}`);
  }
  return target;
}

function pageFile(page: number): string {
  return `pages/page-${String(page).padStart(3, "0")}.json`;
}

/** Validate one page: every row is a skill with a skill URI and labels. */
function parseSkillPage(text: string, page: number): { total: number; items: SkillItem[] } {
  const parsed = JSON.parse(text) as { total?: unknown; _embedded?: { results?: unknown } };
  const results = Array.isArray(parsed._embedded?.results) ? parsed._embedded.results : null;
  if (typeof parsed.total !== "number" || results === null) {
    throw new Error(`unexpected skill page shape at page ${page}`);
  }
  const items: SkillItem[] = [];
  for (const raw of results) {
    const row = raw as { uri?: unknown; className?: unknown; preferredLabel?: unknown; alternativeLabel?: unknown };
    if (row.className !== "Skill" || typeof row.uri !== "string" || !row.uri.startsWith(CONCEPT_URI_PREFIX)) {
      throw new Error(`row on page ${page} is not a skill: ${String(row.uri)}`);
    }
    if (typeof row.preferredLabel !== "object" || row.preferredLabel === null) {
      throw new Error(`skill ${row.uri} has no labels`);
    }
    items.push({
      uri: row.uri,
      preferredLabel: row.preferredLabel as Record<string, unknown>,
      alternativeLabel: (typeof row.alternativeLabel === "object" && row.alternativeLabel !== null
        ? row.alternativeLabel : {}) as Record<string, unknown>,
    });
  }
  return { total: parsed.total, items };
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await mkdir(path.dirname(MANIFEST_FILE), { recursive: true });
  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readManifest(): Promise<Manifest | null> {
  if (!(await exists(MANIFEST_FILE))) return null;
  return JSON.parse(await readFile(MANIFEST_FILE, "utf8")) as Manifest;
}

async function fetchApiVersion(): Promise<string> {
  const parsed = JSON.parse(await fetchText(`${API_BASE}/`)) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "unknown";
}

/** Expected item count on a page: full pages everywhere, a partial last one. */
function expectedItems(total: number, page: number): number {
  return Math.min(PAGE_LIMIT, total - page * PAGE_LIMIT);
}

/** Fetch pages that are missing, verifying anything already on disk. */
async function syncPages(manifest: Manifest, checkOnly: boolean): Promise<number> {
  let failed = 0;
  const total = manifest.index.total;
  const pageCount = Math.ceil(total / PAGE_LIMIT);
  for (let page = 0; page < pageCount; page += 1) {
    const relative = pageFile(page);
    const target = artifactFile(relative);
    const pin = manifest.index.pages.find(item => item.page === page);
    if (checkOnly) {
      if (!pin || !(await exists(target))) {
        console.error(`  MISSING  ${relative} — run npm run esco:fetch`);
        failed += 1;
        continue;
      }
      const text = await readFile(target, "utf8");
      if (text.length !== pin.bytes || digest(text) !== pin.sha256) {
        console.error(`  MISMATCH ${relative}: content does not match the pinned sha256`);
        failed += 1;
      }
      continue;
    }
    if (pin && (await exists(target))) {
      const text = await readFile(target, "utf8");
      if (text.length !== pin.bytes || digest(text) !== pin.sha256) {
        console.error(`  MISMATCH ${relative}: expected ${pin.sha256}, found different content`);
        failed += 1;
      }
      continue;
    }
    process.stdout.write(`  ${pin ? "repairing" : "fetching"} ${relative} ... `);
    const downloaded = await fetchText(pageUrl(page));
    if (pin && (downloaded.length !== pin.bytes || digest(downloaded) !== pin.sha256)) {
      console.error(`HASH_MISMATCH for ${relative}: expected ${pin.sha256}/${pin.bytes}, got different content`);
      failed += 1;
      continue;
    }
    if (!pin) {
      manifest.index.pages.push({
        file: relative, page, items: expectedItems(total, page),
        bytes: downloaded.length, sha256: digest(downloaded),
      });
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, downloaded, "utf8");
    if (!pin) await writeManifest(manifest);
    console.log("ok");
    await sleep(REQUEST_PAUSE_MS);
  }
  return failed;
}

/** Read every page back: parse, check counts and contiguity, optionally verify
 *  hashes. Returns the entries and human-readable problems. */
async function readArtifact(
  manifest: Manifest,
  options: Readonly<{ verify: boolean }>,
): Promise<{ items: SkillItem[]; problems: string[] }> {
  const items: SkillItem[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const total = manifest.index.total;
  const pageCount = Math.ceil(total / PAGE_LIMIT);
  if (manifest.index.pages.length !== pageCount) {
    problems.push(`manifest pins ${manifest.index.pages.length} page(s), the total implies ${pageCount}`);
  }
  for (let page = 0; page < pageCount; page += 1) {
    const pin = manifest.index.pages.find(item => item.page === page);
    const relative = pin?.file ?? pageFile(page);
    const target = artifactFile(relative);
    if (!(await exists(target))) {
      problems.push(`${relative} is missing — run npm run esco:fetch`);
      continue;
    }
    const text = await readFile(target, "utf8");
    if (options.verify && pin && (text.length !== pin.bytes || digest(text) !== pin.sha256)) {
      problems.push(`${relative} does not match the pinned sha256`);
      continue;
    }
    let parsed: { total: number; items: SkillItem[] };
    try {
      parsed = parseSkillPage(text, page);
    } catch (error) {
      problems.push(`${relative}: ${error instanceof Error ? error.message : "unreadable"}`);
      continue;
    }
    if (parsed.total !== total) {
      problems.push(`${relative} reports total ${parsed.total}, expected ${total}`);
      continue;
    }
    if (parsed.items.length !== expectedItems(total, page)) {
      problems.push(`${relative} has ${parsed.items.length} items, expected ${expectedItems(total, page)}`);
      continue;
    }
    for (const item of parsed.items) {
      if (seen.has(item.uri)) {
        problems.push(`${item.uri} appears on more than one page (pagination shifted)`);
        break;
      }
      seen.add(item.uri);
    }
    items.push(...parsed.items);
  }
  return { items, problems };
}

/** Every linked concept must exist in the artifact with the recorded label. */
function verifyMapping(items: readonly SkillItem[]): string[] {
  const byUri = new Map(items.map(item => [item.uri, item]));
  const problems: string[] = [];
  for (const link of ESCO_SKILL_CONCEPTS) {
    if (!link.uri.startsWith(CONCEPT_URI_PREFIX) || !UUID_PATTERN.test(link.uri.slice(CONCEPT_URI_PREFIX.length))) {
      problems.push(`mapping lists a malformed concept uri: ${link.uri}`);
      continue;
    }
    const item = byUri.get(link.uri);
    if (item === undefined) {
      problems.push(`mapping links ${link.canonical} to a concept absent from the artifact: ${link.uri}`);
      continue;
    }
    const served = typeof item.preferredLabel.en === "string" ? normalize(item.preferredLabel.en) : null;
    if (served !== normalize(link.preferredEn)) {
      problems.push(`mapping says ${link.canonical} -> "${link.preferredEn}", the artifact serves "${String(item.preferredLabel.en)}"`);
    }
  }
  return problems;
}

async function cmdFetch(checkOnly: boolean): Promise<number> {
  let manifest = await readManifest();
  if (manifest === null) {
    if (checkOnly) {
      console.error("No manifest at data/esco-manifest.json — nothing to verify. Run npm run esco:fetch.");
      return 1;
    }
    if (await directoryHasFiles(ARTIFACT_DIR)) {
      console.error("Artifact files exist without a manifest — remove data/esco/ and rerun to fetch from scratch.");
      return 2;
    }
    console.log(`Fetching ESCO dataset ${DATASET_VERSION} through ${API_BASE}`);
    const first = await fetchText(pageUrl(0));
    const { total } = parseSkillPage(first, 0);
    manifest = {
      source: "ESCO REST API, skills part only (occupations/ISCO are out of scope)",
      apiBase: API_BASE,
      apiVersion: await fetchApiVersion(),
      datasetVersion: DATASET_VERSION,
      index: {
        query: `search?text=&type=skill&language=en&full=true&limit=${PAGE_LIMIT}&selectedVersion=${DATASET_VERSION}`,
        total,
        retrievedAt: new Date().toISOString(),
        pages: [],
      },
    };
    const relative = pageFile(0);
    await mkdir(path.dirname(artifactFile(relative)), { recursive: true });
    await writeFile(artifactFile(relative), first, "utf8");
    manifest.index.pages.push({
      file: relative, page: 0, items: expectedItems(total, 0),
      bytes: first.length, sha256: digest(first),
    });
    await writeManifest(manifest);
    console.log(`  ${relative} ok (${total} skills reported, ${Math.ceil(total / PAGE_LIMIT)} pages)`);
  }
  console.log(checkOnly
    ? `Checking artifact: ESCO ${manifest.datasetVersion}, ${manifest.index.total} skills, retrieved ${manifest.index.retrievedAt}`
    : `Artifact: ESCO ${manifest.datasetVersion}, ${manifest.index.total} skills, retrieved ${manifest.index.retrievedAt} (api ${manifest.apiVersion})`);
  let failed = await syncPages(manifest, checkOnly);
  const { items, problems } = await readArtifact(manifest, { verify: true });
  for (const problem of problems) console.error(`  ${problem}`);
  failed += problems.length;
  const mappingProblems = verifyMapping(items);
  for (const problem of mappingProblems) console.error(`  ${problem}`);
  failed += mappingProblems.length;
  if (failed > 0) {
    console.error(`${failed} problem(s) — a human must resolve this.`);
    return 1;
  }
  console.log(checkOnly
    ? "Artifact verified."
    : "Artifact complete and verified. This verifies bytes, not rights: reuse conditions live in docs/DEPENDENCIES.md.");
  return 0;
}

// --- proposal mode: read-only review material for the delta -----------------

const DELIMITERS = new Set([
  " ", "\t", "\n", "\r", ",", ";", ":", "(", ")", "[", "]", "{", "}", "\"", "'",
  "/", ".", "!", "?", "-", "_", "+", "=", "|", "&", "@", "#", "$", "%", "^", "*", "~", "`", "<", ">",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\u2018\u2019]/gu, "'").replace(/\s+/gu, " ").trim();
}

function containsAsWholeTerm(haystack: string, needle: string): boolean {
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = haystack[index - 1] ?? " ";
    const after = haystack[index + needle.length] ?? " ";
    if (DELIMITERS.has(before) && DELIMITERS.has(after)) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

/** English labels from a label map. Values are arrays of strings in this API
 *  (`alternativeLabel.en`), but a bare string appears in older payloads — both
 *  shapes are accepted, and both single-word and phrase labels come through. */
function englishLabels(labels: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  for (const key of ["en", "en-us"]) {
    const value = labels[key];
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === "string") values.push(value);
  }
  return values.filter((label): label is string => typeof label === "string" && label.length > 0);
}

async function cmdPropose(): Promise<number> {
  const manifest = await readManifest();
  if (manifest === null) {
    console.error("No manifest at data/esco-manifest.json — run npm run esco:fetch first.");
    return 2;
  }
  const { items, problems } = await readArtifact(manifest, { verify: true });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("Artifact is not usable — run npm run esco:fetch / --check first.");
    return 2;
  }
  console.log(`Artifact: ESCO ${manifest.datasetVersion}, ${items.length} skills, retrieved ${manifest.index.retrievedAt} (api ${manifest.apiVersion})`);
  console.log(`Dictionary: v${SKILLS_DICTIONARY_VERSION}, ${SKILLS_DICTIONARY.length} canonical skills`);

  const terms: { canonical: string; term: string; kind: string }[] = [];
  for (const entry of SKILLS_DICTIONARY) {
    terms.push({ canonical: entry.canonical, term: normalize(entry.canonical), kind: "canonical" });
    for (const alias of entry.aliases) {
      terms.push({ canonical: entry.canonical, term: normalize(alias), kind: "alias" });
    }
  }
  for (const [canonical, aliases] of Object.entries(ALIAS_DELTA_V2_ENTRIES)) {
    for (const alias of aliases) terms.push({ canonical, term: normalize(alias), kind: "alias-v2" });
  }
  const byTerm = new Map<string, { canonical: string; term: string; kind: string }>();
  for (const item of terms) if (!byTerm.has(item.term)) byTerm.set(item.term, item);

  const preferredMatches = new Map<string, { term: string; kind: string; label: string; uri: string; alternative: string[] }[]>();
  const alternativeMatches: { canonical: string; term: string; alt: string; preferred: string; uri: string }[] = [];
  const containment = new Map<string, { term: string; labels: string[] }>();
  for (const item of items) {
    const preferredEn = typeof item.preferredLabel.en === "string" ? item.preferredLabel.en : null;
    if (preferredEn === null) continue;
    const preferred = normalize(preferredEn);
    const alternative = englishLabels(item.alternativeLabel);
    const hit = byTerm.get(preferred);
    if (hit) {
      const list = preferredMatches.get(hit.canonical) ?? [];
      list.push({ term: hit.term, kind: hit.kind, label: preferred, uri: item.uri, alternative });
      preferredMatches.set(hit.canonical, list);
    }
    for (const alt of alternative) {
      const altHit = byTerm.get(normalize(alt));
      if (altHit && normalize(alt) !== preferred) {
        alternativeMatches.push({
          canonical: altHit.canonical, term: altHit.term, alt,
          preferred: preferredEn, uri: item.uri,
        });
      }
    }
    for (const label of [preferred]) {
      for (const [term, entry] of byTerm) {
        if (term.length < 4 || term === label) continue;
        if (AMBIGUOUS_ALIASES.has(term)) continue; // single ordinary words: review noise
        if (!containsAsWholeTerm(label, term)) continue;
        const list = containment.get(entry.canonical) ?? { term, labels: [] };
        if (!list.labels.includes(label)) list.labels.push(label);
        containment.set(entry.canonical, list);
      }
    }
  }

  console.log(`\n== Exact preferred-label matches: ${preferredMatches.size} of ${SKILLS_DICTIONARY.length} canonicals ==`);
  for (const [canonical, matches] of [...preferredMatches.entries()].sort()) {
    for (const match of matches) {
      console.log(`  ${canonical} | "${match.term}" (${match.kind}) == "${match.label}" | ${match.uri}`);
      const fresh = [...new Set(match.alternative)].filter(alt => canonicalSkillName(alt) === null);
      for (const alt of fresh.sort()) {
        const words = alt.trim().split(/\s+/u).length;
        console.log(`      alt NEW "${alt}" (${words} word${words === 1 ? "" : "s"})`);
      }
    }
  }

  console.log(`\n== Exact matches via alternative labels: ${alternativeMatches.length} hit(s) ==`);
  for (const match of alternativeMatches.sort((a, b) => a.canonical.localeCompare(b.canonical) || a.alt.localeCompare(b.alt))) {
    console.log(`  ${match.canonical} | "${match.term}" == alt "${match.alt}" of "${match.preferred}" | ${match.uri}`);
  }

  console.log(`\n== Whole-word containment candidates (review material, not proposals) ==`);
  for (const [canonical, info] of [...containment.entries()].sort()) {
    const labels = [...info.labels].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const shown = labels.slice(0, PROPOSE_MAX_PER_CANONICAL);
    console.log(`  ${canonical} (term "${info.term}"): ${labels.length} concept label(s)`);
    for (const label of shown) console.log(`      "${label}"`);
    if (labels.length > shown.length) console.log(`      ... +${labels.length - shown.length} more`);
  }

  console.log(`\n== Linked concepts (src/domain/skills-esco.ts): ${ESCO_SKILL_CONCEPTS.length} ==`);
  const byUri = new Map(items.map(item => [item.uri, item]));
  for (const link of ESCO_SKILL_CONCEPTS) {
    const item = byUri.get(link.uri);
    console.log(`  ${link.canonical} -> "${link.preferredEn}" | ${link.uri}${item ? "" : " — NOT in artifact"}`);
    if (!item) continue;
    const english = englishLabels(item.alternativeLabel);
    const fresh = new Set<string>();
    const covered = new Set<string>();
    for (const label of english) (canonicalSkillName(label) === null ? fresh : covered).add(label);
    for (const label of [...fresh].sort()) {
      const words = label.trim().split(/\s+/u).length;
      console.log(`      alt NEW "${label}" (${words} word${words === 1 ? "" : "s"})`);
    }
    for (const label of [...covered].sort()) console.log(`      alt have "${label}"`);
  }

  const withoutCandidates = SKILLS_DICTIONARY
    .map(entry => entry.canonical)
    .filter(canonical => !preferredMatches.has(canonical)
      && !alternativeMatches.some(match => match.canonical === canonical)
      && !containment.has(canonical));
  console.log(`\n== Canonicals with no candidate: ${withoutCandidates.length} ==`);
  console.log(`  ${withoutCandidates.join(", ")}`);
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const unknown = args.filter(argument => !["--check", "--propose"].includes(argument));
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: esco:fetch [--check | --propose]`);
    return 2;
  }
  if (args.includes("--check") && args.includes("--propose")) {
    console.error("Choose one mode: --check or --propose.");
    return 2;
  }
  if (args.includes("--propose")) return cmdPropose();
  return cmdFetch(args.includes("--check"));
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`esco:fetch could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
