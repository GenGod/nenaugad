import assert from "node:assert/strict";
import { test } from "node:test";
import { readTextGeography } from "../../src/server/import/geography-text.ts";

// What a posting's own text says about where the employer hires (spec 11.1). The
// phrasings are synthetic; the traps mirror shapes seen in the approved live feeds.

test("restriction: a stated residence rule resolves to the countries it names", () => {
  const cases: readonly (readonly [string, readonly string[], string])[] = [
    ["Applicants must reside in the US.", ["US"], "must reside in the US"],
    ["Candidates must be based in the United States or Canada.", ["US", "CA"],
      "must be based in the United States or Canada"],
    ["You must be located in Germany, the Netherlands, or Poland to apply.", ["DE", "NL", "PL"],
      "must be located in Germany, the Netherlands, or Poland"],
    ["Applicants must currently reside in Türkiye.", ["TR"], "must currently reside in Türkiye"],
    ["Must be based in one of the following countries: Brazil, Mexico, Argentina.",
      ["BR", "MX", "AR"], "Must be based in one of the following countries: Brazil, Mexico, Argentina"],
    ["This role is open to candidates residing in the UK.", ["GB"],
      "open to candidates residing in the UK"],
    ["We can only hire in Portugal and Spain at this time.", ["PT", "ES"],
      "only hire in Portugal and Spain"],
    ["This position is based in the U.S. and reports to the CTO.", ["US"],
      "position is based in the U.S."],
    ["You can work from anywhere in Canada.", ["CA"], "work from anywhere in Canada"],
    ["U.S.-based candidates only.", ["US"], "U.S.-based candidates only"],
    ["Residents of the United States only.", ["US"], "Residents of the United States only"],
    ["Location: Remote (US only)", ["US"], "Remote (US only)"],
  ];
  for (const [text, countries, quote] of cases) {
    assert.deepEqual(readTextGeography(text).restriction, { countries, quote }, text);
  }
});

test("restriction: a rule naming a region, a state or an ambiguous place has no country set", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["Candidates must be based in Europe.", "must be based in Europe"],
    ["You must be located within the Schengen Area.", "must be located within the Schengen Area"],
    ["Applicants must currently reside in New Jersey.", "must currently reside in New Jersey"],
    // A state that starts with a country's name is not that country.
    ["Applicants must reside in Indiana.", "must reside in Indiana"],
    // One unresolved place makes the whole list unknown: GEO-01 would otherwise fail
    // a candidate the text admits.
    ["Must be based in the US or LATAM.", "Must be based in the US or LATAM"],
    // The country or the US state: spec 11.1 forbids choosing.
    ["You must live in Georgia.", "must live in Georgia"],
    ["We are only hiring in the following provinces: Ontario and Alberta.",
      "only hiring in the following provinces: Ontario and Alberta"],
  ];
  for (const [text, quote] of cases) {
    assert.deepEqual(readTextGeography(text).restriction, { countries: [], quote }, text);
  }
});

test("restriction: the combined rule is unknown when any stated rule is unresolved", () => {
  const { restriction } = readTextGeography(
    "Applicants must reside in the US. The hire must live in the greater Atlanta region.");
  assert.deepEqual(restriction, { countries: [], quote: "must live in the greater Atlanta region" });
  const both = readTextGeography("Applicants must reside in the US. Canada-based candidates only.");
  assert.deepEqual(both.restriction, { countries: ["US", "CA"], quote: "must reside in the US" });
});

test("restriction: offices, notices, negations, the world and timezones are not hiring rules", () => {
  const texts = [
    "We are based in San Francisco, CA, but built as a remote-first company.",
    "If you are located in the European Economic Area, see our privacy notice.",
    "You must reside outside of a 50 mile radius from our Nashville office.",
    "You don't need to be based in the US to apply.",
    "You do not have to live in Germany.",
    "Work from anywhere in the world.",
    "This role is open to candidates in any country.",
    "Health insurance (US only) and a learning budget.",
    "You should live in a time zone within three hours of UTC.",
    "US based candidates interested in this position can email the team.",
    "The salary range for US-based candidates is 100k.",
    "We are open to candidates from all backgrounds.",
    "Must be able to work from home.",
    "Candidates in Europe are encouraged to apply.",
  ];
  for (const text of texts) {
    assert.deepEqual(readTextGeography(text), { restriction: null, exclusion: null }, text);
  }
});

test("exclusion: countries an employer explicitly excludes", () => {
  const cases: readonly (readonly [string, readonly string[], string])[] = [
    ["We hire worldwide, except in Brazil.", ["BR"], "worldwide, except in Brazil"],
    ["We are unable to hire candidates located in Cuba, Iran or Syria.", ["CU", "IR", "SY"],
      "unable to hire candidates located in Cuba, Iran or Syria"],
    ["Open to candidates anywhere except the US and Canada.", ["US", "CA"],
      "anywhere except the US and Canada"],
    ["This role is not open to candidates in Brazil.", ["BR"], "not open to candidates in Brazil"],
    ["Remote worldwide (excluding Russia and Belarus).", ["RU", "BY"],
      "worldwide (excluding Russia and Belarus"],
  ];
  for (const [text, countries, quote] of cases) {
    const read = readTextGeography(text);
    assert.deepEqual(read.exclusion, { countries, quote }, text);
    assert.equal(read.restriction, null, text);
  }
});

test("exclusion: separate exclusions in one text combine", () => {
  assert.deepEqual(readTextGeography(
    "We are unable to hire in Cuba. We hire worldwide, except in Brazil.").exclusion,
  { countries: ["CU", "BR"], quote: "unable to hire in Cuba" });
});

test("restriction: an unresolved rule without a sentence end is quoted within a bound", () => {
  const list = "Ohio Indiana Iowa Kansas Michigan Minnesota Missouri Nebraska Wisconsin ".repeat(4);
  const { restriction } = readTextGeography(`Candidates must reside in ${list}`);
  assert.deepEqual(restriction?.countries, []);
  assert.equal(restriction?.quote.startsWith("must reside in Ohio Indiana"), true);
  assert.equal(restriction!.quote.length <= "must reside in ".length + 160, true);
});

test("exclusion: only a named country counts; subdivisions and holidays do not", () => {
  for (const text of [
    "Paid holidays (except Christmas).",
    "Eligible states: AL, FL, TX (except Houston), TN.",
    "We cannot accept applications from candidates residing elsewhere.",
    "We hire globally, except for sanctioned countries.",
  ]) {
    assert.equal(readTextGeography(text).exclusion, null, text);
  }
  // A subdivision exclusion inside a country restriction leaves the country set.
  const read = readTextGeography(
    "This role is open to candidates residing in the US except the San Francisco Bay Area.");
  assert.deepEqual(read, {
    restriction: { countries: ["US"], quote: "open to candidates residing in the US" },
    exclusion: null,
  });
});
