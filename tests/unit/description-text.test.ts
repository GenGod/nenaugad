import test from "node:test";
import assert from "node:assert/strict";
import {
  AdapterInputError, descriptionToText, himalayasContractFixture, mapHimalayasRecord,
} from "../../src/server/import/himalayas-fixture.ts";
import { jobicyContractFixture, mapJobicyRecord } from "../../src/server/import/jobicy-fixture.ts";

const NOW = "2026-10-07T12:00:00.000Z";

// B38: the description both adapters send to matching, BM25, the embeddings and the
// paid extraction. 608 of 700 local postings kept tags and 409 had paragraphs glued
// together ("…part of it?We bring…") before this.

test("description text: no tag survives, and a block boundary leaves a space (B38)", () => {
  assert.equal(descriptionToText("<p>Want to be part of it?</p><p>We bring craft and software.</p>"),
    "Want to be part of it? We bring craft and software.");
  assert.equal(descriptionToText("<h3>Requirements</h3><ul><li>Python</li><li>Django</li></ul><hr>Benefits"),
    "Requirements Python Django Benefits");
  assert.equal(descriptionToText("<div>Remote</div><div>Germany-wide</div><h2>About</h2><h4>Team</h4><h5>x</h5>"),
    "Remote Germany-wide About Team x");
  assert.equal(descriptionToText("Line one<br>Line two<br/>Line three<BR />end"), "Line one Line two Line three end");
  assert.equal(descriptionToText("<table><tr><td>Salary</td><td>80k</td></tr></table>"), "Salary 80k");
  assert.equal(descriptionToText("<section><article>Unknown</article><custom-tag>block</custom-tag></section>"),
    "Unknown block");
});

test("description text: an inline tag disappears without splitting a word (B38)", () => {
  assert.equal(descriptionToText("Py<b>thon</b> and <strong>Go</strong>lang, <em>remote</em>"), "Python and Golang, remote");
  assert.equal(descriptionToText("<a href=\"https://example.invalid\">apply</a> <u>now</u>, <span class=\"x\">today</span>"),
    "apply now, today");
  assert.equal(descriptionToText("H<sub>2</sub>O and m<sup>2</sup>, <code>npm</code>, <i>i</i><small>s</small>"),
    "H2O and m2, npm, is");
  // Tag names in any case.
  assert.equal(descriptionToText("Py<B>thon</B> <STRONG>Go</STRONG><P>Next</P>"), "Python Go Next");
});

test("description text: comments, scripts and styles disappear with their content (B38)", () => {
  assert.equal(descriptionToText("Before<!-- a <b>comment</b> -->after"), "Before after");
  assert.equal(descriptionToText("Job<script type=\"x\">alert('x')</script>text<style>.a{}</style>end"), "Job text end");
  assert.equal(descriptionToText("Job<SCRIPT>alert('x')</SCRIPT>text"), "Job text");
});

test("description text: entities are decoded once, after the tags are gone (B38)", () => {
  assert.equal(descriptionToText("R&amp;D &ndash; 5&nbsp;days &hellip;"), "R&D – 5 days …");
  // Escaped markup in the source is text, and stays text.
  assert.equal(descriptionToText("Use &lt;b&gt;bold&lt;/b&gt; tags"), "Use <b>bold</b> tags");
  // Escaped twice: one decoding pass keeps the outer escape (the old code read "<").
  assert.equal(descriptionToText("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
  // A bare "<" that opens no tag is text.
  assert.equal(descriptionToText("salary < 50k and 3 > 2"), "salary < 50k and 3 > 2");
});

test("description text: whitespace collapses and the edges are trimmed (B38)", () => {
  assert.equal(descriptionToText("  <p>\n  Senior\t engineer   </p>\n\n"), "Senior engineer");
  assert.equal(descriptionToText(""), "");
});

test("description text: a description far beyond any real one is refused as one bad record (B38)", () => {
  assert.throws(() => descriptionToText("x".repeat(100_001)),
    (error: unknown) => error instanceof AdapterInputError && error.message === "DESCRIPTION_TOO_LONG");
  // Just under the cap, markup that once rescanned the input from every "<" is cleaned
  // in one pass of the tag pattern.
  const started = Date.now();
  assert.equal(descriptionToText("<a".repeat(49_999)), "<a".repeat(49_999));
  assert.ok(Date.now() - started < 500, "the tag pattern must not rescan the input from every '<'");
});

test("both adapters clean markup the same way, and a rule across list items is read (B38)", () => {
  const himalayas = mapHimalayasRecord({
    ...himalayasContractFixture[0]!,
    description: "<h3>About</h3><div>Remote team</div><ul><li>Python</li><li>Django</li></ul><hr>",
  }, NOW);
  assert.equal(himalayas.description_text, "About Remote team Python Django");

  // The B24 text check reads the description: a rule in one list item no longer runs
  // into the next ("…in BrazilIndia…" read as no exclusion; "…the USBenefits…" as no country).
  const jobicy = (description: string) => mapJobicyRecord({ ...jobicyContractFixture[0]!, jobDescription: description }, NOW);
  const excluded = jobicy("<h3>About</h3><ul><li>We cannot hire in Brazil</li><li>India-based engineers are welcome</li></ul>");
  assert.equal(excluded.description_text, "About We cannot hire in Brazil India-based engineers are welcome");
  assert.deepEqual(excluded.hiring_options[0]?.geography.excluded_countries, ["BR"]);
  const restricted = jobicy("<h3>Requirements</h3><ul><li>Candidates must reside in the US</li><li>Benefits include equity</li></ul>");
  assert.equal(restricted.hiring_options[0]?.geography.scope, "restricted");
  assert.deepEqual(restricted.hiring_options[0]?.geography.allowed_countries, ["US"]);
});
