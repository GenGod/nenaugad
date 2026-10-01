// Terms-of-service fingerprint: normalization behaviour and the offline loop
// that ties a source policy to its committed snapshot.
//
// This file is the reason a `terms_hash` can be trusted without network access:
// if the policy value, the manifest or the snapshot text drift apart, the test
// fails. Re-baselining is a deliberate two-step action — `npm run terms:check --
// --write` writes the snapshot and manifest, and a human updates the policy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { normalizeTermsText, sha256Hex, termsFingerprint } from "../../src/server/terms-fingerprint.ts";
import { himalayasCandidatePolicy, jobicyCandidatePolicy } from "../../src/server/source-policies.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const MANIFEST_PATH = "docs/sources/terms/snapshots.json";

type SnapshotEntry = Readonly<{ url: string; fetched_at: string; snapshot: string; sha256: string }>;
const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8")) as {
  snapshots: Record<string, SnapshotEntry>;
};

test("normalization: markup, scripts and entities are removed, block boundaries survive", () => {
  const html = [
    "<html><head><style>body{color:red}</style><script>var x=1;</script></head>",
    "<body><!-- nav --><h1>Terms</h1><p>Clause&nbsp;1 &amp; 2</p>",
    "<ul><li>first</li><li>second</li></ul><div>tail &mdash; end</div></body></html>",
  ].join("");
  assert.equal(
    normalizeTermsText(html),
    "Terms\nClause 1 & 2\nfirst\nsecond\ntail — end\n",
  );
  // Entities decode exactly one level, the way a browser surfaces them: a
  // double-encoded ampersand stays visible as "&lt;". This is why a snapshot is
  // hashed as-is instead of being normalized a second time.
  assert.equal(normalizeTermsText("<p>&amp;lt;</p>"), "&lt;\n");
});

test("normalization: an injected per-request script does not change the fingerprint", () => {
  // The exact failure this fingerprint exists for: a CDN (Cloudflare on jobicy)
  // injects a script whose payload changes on every request, so hashing the raw
  // page made two fetch of identical terms disagree.
  const page = (nonce: string) =>
    `<html><body><p>You may use the listings.</p>` +
    `<script>window.__CF$cv$params={r:'${nonce}',t:'${nonce}'}</script></body></html>`;
  const first = termsFingerprint(page("a431d8cbdd5dd0d3"));
  const second = termsFingerprint(page("a431d8cbdd5dd0d3".split("").reverse().join("")));
  assert.equal(first, second);
  // A real change still moves the fingerprint.
  assert.notEqual(first, termsFingerprint("<html><body><p>You may not use the listings.</p></body></html>"));
});

test("policies: terms_hash, manifest and committed snapshots agree offline", () => {
  const policies = { himalayas: himalayasCandidatePolicy, jobicy: jobicyCandidatePolicy };
  for (const [sourceId, policy] of Object.entries(policies)) {
    const entry = manifest.snapshots[sourceId];
    assert.ok(entry, `${sourceId} must have a snapshot entry in ${MANIFEST_PATH}`);
    const text = readFileSync(path.join(ROOT, entry.snapshot), "utf8");
    // A snapshot that is empty or nearly so would make the check meaningless.
    assert.ok(text.length > 1000, `${entry.snapshot} looks too small to be a terms page`);
    // The snapshot holds already-normalized text, so integrity is a plain hash,
    // and the policy must carry exactly that value.
    assert.equal(sha256Hex(text), entry.sha256, `${sourceId}: snapshot does not match its manifest hash`);
    assert.equal(policy.terms_hash, entry.sha256, `${sourceId}: policy terms_hash is stale — re-baseline or fix it`);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u, `${sourceId}: manifest hash must be a sha256 hex digest`);
    assert.match(entry.url, /^https:\/\//u, `${sourceId}: snapshot url must be https`);
  }
});
