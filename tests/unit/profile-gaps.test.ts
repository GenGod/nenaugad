import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COUNTRY_FIELD_HINT,
  COUNTRY_MISSING_NOTICE,
  EMPTY_MATCH_WITHOUT_COUNTRY,
  lacksCountry,
} from "../../src/domain/profile-gaps.ts";

test("a missing, empty or blank country counts as missing", () => {
  assert.equal(lacksCountry({ residenceCountry: null }), true);
  assert.equal(lacksCountry({ residenceCountry: "" }), true);
  assert.equal(lacksCountry({ residenceCountry: "   " }), true);
});

test("a country code, or no profile at all, is not reported", () => {
  assert.equal(lacksCountry({ residenceCountry: "DE" }), false);
  assert.equal(lacksCountry({ residenceCountry: " us " }), false);
  assert.equal(lacksCountry(undefined), false);
  assert.equal(lacksCountry(null), false);
});

test("the notice names the consequence and the tab the postings stay in", () => {
  assert.match(COUNTRY_MISSING_NOTICE, /Страна работы не указана/u);
  assert.match(COUNTRY_MISSING_NOTICE, /ни одна вакансия не может попасть в «Условия совпадают»/u);
  assert.match(COUNTRY_MISSING_NOTICE, /«Нужно уточнить»/u);
});

test("the empty-tab text blames the missing country, not an honest empty result", () => {
  assert.match(EMPTY_MATCH_WITHOUT_COUNTRY.heading, /страна/iu);
  assert.doesNotMatch(EMPTY_MATCH_WITHOUT_COUNTRY.body, /честный результат/u);
  assert.match(EMPTY_MATCH_WITHOUT_COUNTRY.body, /Страна работы/u);
});

test("the form hint says what the country decides and that it stays optional", () => {
  assert.match(COUNTRY_FIELD_HINT, /«Условия совпадают»/u);
  assert.match(COUNTRY_FIELD_HINT, /можно оставить пустым/u);
});
