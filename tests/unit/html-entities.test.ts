// A feed's excerpt arrives HTML-escaped (docs/OPEN_GAPS.md B30): the card must show the
// characters, decoded exactly once, and anything that is not an entity stays as written.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeHtmlEntities } from "../../src/server/import/html-entities.ts";

test("html entities: the named and numeric ones a feed sends are decoded (B30)", () => {
  const table: readonly (readonly [string, string])[] = [
    ["medical records to&hellip;", "medical records to…"],
    ["R&amp;D and QA", "R&D and QA"],
    ["we're in &gt;40% of apps", "we're in >40% of apps"],
    ["&lt;b&gt;", "<b>"],
    ["&quot;remote&quot; &apos;first&apos;", "\"remote\" 'first'"],
    ["a&nbsp;b", "a b"],
    ["&ndash; &mdash; &lsquo;x&rsquo; &ldquo;y&rdquo; &bull;", "– — ‘x’ “y” •"],
    ["&#8230; &#x2026; &#X2026; &#39;", "… … … '"],
    ["plain text, no entity", "plain text, no entity"],
  ];
  for (const [input, want] of table) assert.equal(decodeHtmlEntities(input), want, input);
});

test("html entities: one pass, and what is not an entity stays as written (B30)", () => {
  // Double-encoded text decodes once: it says "&hellip;", it is not an ellipsis.
  assert.equal(decodeHtmlEntities("&amp;hellip;"), "&hellip;");
  assert.equal(decodeHtmlEntities("&amp;amp;"), "&amp;");
  for (const kept of ["AT&T", "a & b", "&unknownentity;", "&#0;", "&#xD800;", "&#1114112;", "&;", "&#;", "&#x;"]) {
    assert.equal(decodeHtmlEntities(kept), kept, kept);
  }
});
