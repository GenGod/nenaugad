// The `--limit` of a paid CLI run (B32-001). A limit the owner typed and the parser
// did not understand used to mean "no limit": `--limit 5`, `--limit=0` and
// `--limit=5x` all ran the whole catalog, bounded only by the budget. A limit that
// is present but malformed is a refusal; an absent one is still "no limit".
export function limitArg(argv: readonly string[]): Readonly<{ ok: true; limit?: number } | { ok: false }> {
  const given = argv.filter(argument => argument === "--limit" || argument.startsWith("--limit="));
  if (given.length === 0) return { ok: true };
  const [only] = given;
  if (given.length > 1 || only === undefined || !only.startsWith("--limit=")) return { ok: false };
  const raw = only.slice("--limit=".length);
  return /^[1-9][0-9]{0,5}$/u.test(raw) ? { ok: true, limit: Number(raw) } : { ok: false };
}
