// Terms-of-service fingerprinting (source review item).
//
// Why this exists: the previous `terms_hash` was sha256 of the raw fetched page,
// and the raw page is not reproducible — jobicy injects a Cloudflare script with
// a per-request nonce, and himalayas ships a deploy-dependent app shell. Two
// fetches of the same unchanged page produced different hashes, so the value
// could not answer the only question it is for: "did the terms change?".
//
// The fix: hash the NORMALIZED TEXT of the page (markup, scripts and entities
// removed; block boundaries kept as newlines so a human diff stays readable),
// and keep a committed snapshot of that text (docs/sources/terms/ plus its
// manifest). The offline unit test ties the loop shut: policy.terms_hash must
// equal the manifest hash and the snapshot's fingerprint, so a drifted or
// hand-edited value fails without any network access.
//
// This is a change detector, not a rights decision: a changed fingerprint means
// "a human must re-read the terms", never "the terms still say what we think".
import { createHash } from "node:crypto";

const BLOCK_END =
  /<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|blockquote|table|nav|main|aside|pre|figure|figcaption|dl|dt|dd|form)>/gi;

// A deliberately small, single-pass entity map: enough for the pages under
// review, and single-pass means "&amp;lt;" decodes to "&lt;" (one level), the
// same way a browser's text renderer would surface it.
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", times: "×", copy: "©",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", deg: "°",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Normalizes an HTML page into comparable plain text: comments, scripts and
 * styles are dropped, block boundaries become newlines, entities are decoded,
 * inline whitespace is collapsed and empty lines are removed.
 */
export function normalizeTermsText(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutScripts = withoutComments
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const withLineBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_END, "\n");
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, " ").replace(/<[^>]*$/g, " ");
  const decoded = decodeEntities(withoutTags);
  const lines = decoded
    .split("\n")
    .map(line => line.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(line => line.length > 0);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** sha256 hex digest of a UTF-8 string — the only hashing used for snapshots. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * sha256 of the normalized text — the value a source policy stores as
 * `terms_hash`. The committed snapshot file holds text that was already
 * normalized once, so its integrity is checked with `sha256Hex(snapshotText)`:
 * normalization is a one-level entity decode and is deliberately NOT idempotent,
 * so re-normalizing a snapshot is not a valid check.
 */
export function termsFingerprint(html: string): string {
  return sha256Hex(normalizeTermsText(html));
}
