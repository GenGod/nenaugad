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
import {
  normalizeTermsText, policyTermsHash, sha256Hex, termsFingerprint, termsSourceOf,
} from "../../src/server/terms-fingerprint.ts";
import {
  himalayasCandidatePolicy, jobicyCandidatePolicy, remoteFirstJobsCandidatePolicy,
  remoteJobsOrgCandidatePolicy,
} from "../../src/server/source-policies.ts";

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

test("normalization: numeric entities decode like named ones; impossible code points stay as written", () => {
  // A page that switches from &mdash; to &#8212; or &#x2014; has not changed its terms.
  const named = termsFingerprint("<p>tail &mdash; end</p>");
  assert.equal(termsFingerprint("<p>tail &#8212; end</p>"), named);
  assert.equal(termsFingerprint("<p>tail &#x2014; end</p>"), named);
  // Zero, past U+10FFFF, past a safe integer and unknown names are left as written.
  const kept = "&#0; &#x0; &#1114112; &#x110000; &#99999999999999999999; &bogus;";
  assert.equal(normalizeTermsText(`<p>${kept}</p>`), `${kept}\n`);
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
  const policies = {
    himalayas: himalayasCandidatePolicy, jobicy: jobicyCandidatePolicy,
    remote_first_jobs: remoteFirstJobsCandidatePolicy,
    remotejobs_org: remoteJobsOrgCandidatePolicy,
  };
  // Every page in the manifest belongs to a policy, and every snapshot is intact.
  for (const [key, entry] of Object.entries(manifest.snapshots)) {
    assert.ok(termsSourceOf(key) in policies, `${key}: no policy for this snapshot`);
    const text = readFileSync(path.join(ROOT, entry.snapshot), "utf8");
    // A snapshot that is empty or nearly so would make the check meaningless.
    assert.ok(text.length > 1000, `${entry.snapshot} looks too small to be a terms page`);
    // The snapshot holds already-normalized text, so integrity is a plain hash.
    assert.equal(sha256Hex(text), entry.sha256, `${key}: snapshot does not match its manifest hash`);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u, `${key}: manifest hash must be a sha256 hex digest`);
    assert.match(entry.url, /^https:\/\//u, `${key}: snapshot url must be https`);
  }
  // Each policy carries exactly the value of its pages: one page's own hash, or the hash
  // of several (S1-007).
  for (const [sourceId, policy] of Object.entries(policies)) {
    const expected = policyTermsHash(manifest.snapshots, sourceId);
    assert.ok(expected, `${sourceId} must have a snapshot entry in ${MANIFEST_PATH}`);
    assert.equal(policy.terms_hash, expected, `${sourceId}: policy terms_hash is stale — re-baseline or fix it`);
  }
  // RemoteJobs.org: the API page and the terms page are both watched.
  assert.deepEqual(Object.keys(manifest.snapshots).filter(key => termsSourceOf(key) === "remotejobs_org").sort()
    .map(key => manifest.snapshots[key]!.url), ["https://remotejobs.org/developers/api", "https://www.remotejobs.org/terms"]);
});

test("policy terms hash: one page is its own hash; several combine in key order", () => {
  const one = "a".repeat(64);
  const two = "b".repeat(64);
  assert.equal(policyTermsHash({ s: { sha256: one } }, "s"), one);
  assert.equal(policyTermsHash({ "s:terms": { sha256: two }, s: { sha256: one } }, "s"), sha256Hex(`${one}
${two}`));
  // A change to either page changes the policy value.
  assert.notEqual(policyTermsHash({ s: { sha256: one }, "s:terms": { sha256: one } }, "s"),
    policyTermsHash({ s: { sha256: one }, "s:terms": { sha256: two } }, "s"));
  // Another source's pages, or a source id that only starts the same, are not included.
  assert.equal(policyTermsHash({ s: { sha256: one }, so: { sha256: two }, "so:terms": { sha256: two } }, "s"), one);
  assert.equal(policyTermsHash({ so: { sha256: two } }, "s"), null);
  assert.equal(termsSourceOf("remotejobs_org:terms"), "remotejobs_org");
  assert.equal(termsSourceOf("jobicy"), "jobicy");
});
