// Hiring geography a posting states in its own text (spec 11.1: the employer's
// exclusions take priority over a broad permission). The jobicy adapter reads it to test
// a worldwide label (docs/OPEN_GAPS.md B24).
//
// Only phrasing about where the hire may live counts, anchored on a cue such as "must
// reside in", "open to candidates based in" or "we can only hire in". An office line
// ("we are based in San Francisco"), a privacy notice ("if you are located in the EEA"),
// "must reside outside of a radius" and a negated cue are not hiring rules.
//
// Countries come from a fixed dictionary, matched case-sensitively so that the pronoun
// "us" is not the US. A region (Europe, EMEA, the Schengen Area), a state, a city or a
// name outside the dictionary is not a country: a rule naming one is kept, with an
// unknown country set. "Georgia" is left out on purpose: it is a country and a US state,
// and spec 11.1 forbids choosing.

export type StatedCountries = Readonly<{
  /** ISO 3166-1 alpha-2 codes; empty when a restriction names a place the dictionary does not resolve. */
  countries: readonly string[];
  quote: string;
}>;

export type TextGeography = Readonly<{
  /** Where the text limits hiring to; null when it states no such rule. */
  restriction: StatedCountries | null;
  /** Countries the text explicitly excludes; only dictionary names count. */
  exclusion: StatedCountries | null;
}>;

const COUNTRY_CODES: Readonly<Record<string, string>> = {
  "United States of America": "US", "United States": "US", "U.S.A.": "US", USA: "US",
  "U.S.": "US", US: "US", "United Kingdom": "GB", "U.K.": "GB", UK: "GB",
  Canada: "CA", Mexico: "MX", Brazil: "BR", Argentina: "AR", Chile: "CL", Colombia: "CO",
  Peru: "PE", Uruguay: "UY", Paraguay: "PY", Bolivia: "BO", Ecuador: "EC", Venezuela: "VE",
  "Costa Rica": "CR", Panama: "PA", Guatemala: "GT", Honduras: "HN", "El Salvador": "SV",
  Nicaragua: "NI", "Dominican Republic": "DO", Jamaica: "JM", Cuba: "CU",
  Ireland: "IE", Germany: "DE", France: "FR", Spain: "ES", Portugal: "PT", Italy: "IT",
  Netherlands: "NL", Belgium: "BE", Luxembourg: "LU", Switzerland: "CH", Austria: "AT",
  Poland: "PL", Czechia: "CZ", "Czech Republic": "CZ", Slovakia: "SK", Hungary: "HU",
  Romania: "RO", Bulgaria: "BG", Greece: "GR", Croatia: "HR", Slovenia: "SI", Serbia: "RS",
  "Bosnia and Herzegovina": "BA", Montenegro: "ME", "North Macedonia": "MK", Albania: "AL",
  Denmark: "DK", Sweden: "SE", Norway: "NO", Finland: "FI", Iceland: "IS", Estonia: "EE",
  Latvia: "LV", Lithuania: "LT", Ukraine: "UA", Moldova: "MD", Belarus: "BY", Russia: "RU",
  Malta: "MT", Cyprus: "CY", Türkiye: "TR", Turkiye: "TR", Turkey: "TR", Armenia: "AM",
  Azerbaijan: "AZ", Israel: "IL", "United Arab Emirates": "AE", UAE: "AE",
  "Saudi Arabia": "SA", Qatar: "QA", Egypt: "EG", Morocco: "MA", Tunisia: "TN",
  Nigeria: "NG", Kenya: "KE", Ghana: "GH", "South Africa": "ZA", Ethiopia: "ET",
  Uganda: "UG", Rwanda: "RW", Iran: "IR", Iraq: "IQ", Syria: "SY", Lebanon: "LB",
  Australia: "AU", "New Zealand": "NZ", Japan: "JP", "South Korea": "KR", "North Korea": "KP",
  China: "CN", "Hong Kong": "HK", Taiwan: "TW", Singapore: "SG", Malaysia: "MY",
  Indonesia: "ID", Philippines: "PH", Thailand: "TH", Vietnam: "VN", India: "IN",
  Pakistan: "PK", Bangladesh: "BD", "Sri Lanka": "LK", Nepal: "NP", Kazakhstan: "KZ",
  Uzbekistan: "UZ",
};

// Longest first, so "United States of America" wins over "United States" and "USA" over "US".
const COUNTRY_NAME = Object.keys(COUNTRY_CODES)
  .sort((a, b) => b.length - a.length)
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
  .join("|");
// A dictionary name, optionally after "the", with no letter or digit straight after it:
// "USD" is not "US", "Indiana" is not "India".
const PLACE = new RegExp(String.raw`(?:[Tt]he\s+)?(${COUNTRY_NAME})(?![\p{L}\p{N}])`, "uy");
const LIST_INTRO = /(?:one\s+of\s+)?the\s+following\s+(?:countries|locations)\s*:?\s*/iuy;
const LIST_SEPARATOR = /\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or|&)\s+|\s*\/\s*/uy;
const CAPITALIZED = /(?:[Tt]he\s+)?\p{Lu}/uy;
const ONLY_AFTER = /\s*(?:only|Only|ONLY)\b/uy;
// "anywhere in the world", "candidates in any country": the whole world is no limit.
const WHOLE_WORLD = /(?:the\s+)?(?:world|globe|planet)\b|(?:any|all|every)\s+(?:countr(?:y|ies)|locations?|regions?|places?)\b/iuy;
// A time-zone or working-hours rule is schedule, not geography (spec 11.3).
const TIME_ZONE = /\b(?:time\s*zones?|timezones?|UTC|GMT|CET|CEST|EST|EDT|PST|PDT|hours\s+of)\b/iu;
// The end of a cue's sentence: "U.S. or" does not end it, "Europe. We" does.
const SENTENCE_END = /[.;!?](?=\s+\p{Lu}|\s*$)/u;

const NOT_NEGATED = String.raw`(?<!\b(?:not|never)\s+|n['’]t\s+)`;
const LIVING = "(?:resid(?:e|es|ing|ent|ents)|li(?:ve|ves|ving)|located|based)";
const PEOPLE = "(?:candidates|applicants|people|individuals|professionals|talent|those)";

// A cue ends where its list of places begins. "stated": the cue alone states a residence
// rule, so an unresolved place keeps the rule with an unknown country set. "only": the
// list must resolve and be followed by "only", otherwise the phrase is no rule.
type ListCue = Readonly<{ pattern: RegExp; reading: "stated" | "only" }>;

const STATED_CUES: readonly string[] = [
  // "must reside in", "must be based in", "required to be located in", "should live in"
  String.raw`${NOT_NEGATED}\b(?:must|required\s+to|needs?\s+to|ha(?:ve|s)\s+to|should)\s+(?:(?:currently|already|physically|legally)\s+)*(?:be\s+)?(?:(?:currently|physically|legally)\s+)*(?:an?\s+)?${LIVING}\s+(?:anywhere\s+)?(?:in|within|of|out\s+of)\s+`,
  // "open to candidates residing in", "available only to people based in"
  String.raw`${NOT_NEGATED}\b(?:open|available|limited|restricted)\s+(?:only\s+)?to\s+${PEOPLE}\s+(?:who\s+(?:are\s+)?)?(?:(?:currently\s+)?${LIVING}\s+)?(?:anywhere\s+)?(?:in|within)\s+`,
  // "open to residents of"
  String.raw`${NOT_NEGATED}\b(?:open|available|limited|restricted)\s+(?:only\s+)?to\s+(?:legal\s+)?residents\s+(?:of|in)\s+`,
  // "we can only hire in", "only accepting applications from candidates based in"
  String.raw`${NOT_NEGATED}\bonly\s+(?:be\s+)?(?:able\s+to\s+)?(?:hir(?:e|ing)|recruit(?:ing)?|employ(?:ing)?|accept(?:ing)?\s+(?:applications|applicants|candidates))\s+(?:(?:from\s+)?${PEOPLE}\s+)?(?:(?:who\s+(?:are\s+)?)?${LIVING}\s+)?(?:in|within)\s+`,
  // "this role is based in", "the position is remote and located in"
  String.raw`\b(?:role|position|job|opportunity|vacancy)\s+is\s+(?:(?:fully\s+)?remote(?:\s+and|,)?\s+)?(?:based|located)\s+(?:in|within|out\s+of)\s+`,
  // "work from anywhere in", "based anywhere in"
  String.raw`\b(?:work|working|live|living|based|located)\s+(?:(?:fully\s+)?remotely\s+)?(?:from\s+)?anywhere\s+(?:in|within|across)\s+`,
];

const RESTRICTION_CUES: readonly ListCue[] = [
  ...STATED_CUES.map((source): ListCue => ({ pattern: new RegExp(source, "giu"), reading: "stated" })),
  {
    // "residents of the United States only", "candidates based in the UK only"
    pattern: new RegExp(String.raw`\b(?:residents|candidates|applicants)\s+(?:(?:currently\s+)?${LIVING}\s+)?(?:of|from|in|within)\s+`, "giu"),
    reading: "only",
  },
];

// The country is part of the cue: "US-based candidates only", "UK residents only",
// "Remote (US only)". Without "only" such a phrase is often an aside ("the salary
// range for US-based candidates"), so it does not count.
const ONLY_SUFFIX = String.raw`\s+(?:only|Only|ONLY)\b`;
const PLACE_FIRST_CUES: readonly RegExp[] = [
  String.raw`(?<![\p{L}\p{N}.])(?:[Tt]he\s+)?(${COUNTRY_NAME})(?:\s*-\s*|\s+)[Bb]ased\s+(?:[Cc]andidates|[Aa]pplicants|[Tt]alent|[Pp]rofessionals)${ONLY_SUFFIX}`,
  String.raw`(?<![\p{L}\p{N}.])(${COUNTRY_NAME})\s+[Rr]esidents${ONLY_SUFFIX}`,
  String.raw`\b[Rr]emote\s*[(:,|–—-]\s*(?:[Tt]he\s+)?(${COUNTRY_NAME})${ONLY_SUFFIX}\)?`,
].map(source => new RegExp(source, "gu"));

const EXCLUSION_CUES: readonly RegExp[] = [
  // "worldwide, except in Brazil", "anywhere except the US", "worldwide (excluding Russia)"
  String.raw`\b(?:worldwide|anywhere|globally|any\s+country|all\s+countries)\b[^.;:!?]{0,30}?\b(?:except(?:\s+for)?|excluding|other\s+than|with\s+the\s+exception\s+of)\s+(?:(?:in|from)\s+)?`,
  // "we are unable to hire candidates located in", "we cannot hire in"
  String.raw`\b(?:cannot|can\s*not|can['’]t|unable\s+to|not\s+able\s+to|do\s+not|don['’]t)\s+(?:currently\s+)?(?:hire|employ|recruit|accept\s+(?:applications|applicants|candidates)|consider\s+(?:applications|applicants|candidates))\s+(?:(?:from\s+)?(?:${PEOPLE}|anyone)\s+)?(?:(?:who\s+(?:are\s+)?)?(?:currently\s+)?${LIVING}\s+)?(?:in|from|within)\s+`,
  // "not open to candidates in"
  String.raw`\bnot\s+(?:open|available)\s+to\s+(?:${PEOPLE}|residents)\s+(?:who\s+(?:are\s+)?)?(?:(?:currently\s+)?${LIVING}\s+)?(?:in|within|from|of)\s+`,
].map(source => new RegExp(source, "giu"));

type PlaceList = Readonly<{ countries: readonly string[]; resolved: boolean; end: number }>;

function stickyAt(pattern: RegExp, text: string, position: number): RegExpExecArray | null {
  pattern.lastIndex = position;
  return pattern.exec(text);
}

// Reads "the US, Canada or Mexico" from `start`. `resolved` is false when a listed place
// is not in the dictionary. After a separator, a word that is no known place ends the
// list if it is lower-case ("…in Portugal, or willing to relocate") and is an unknown
// place if it is capitalized ("…in the US or LATAM").
function readPlaces(text: string, start: number): PlaceList {
  let position = stickyAt(LIST_INTRO, text, start) ? LIST_INTRO.lastIndex : start;
  const countries: string[] = [];
  let end = position;
  for (;;) {
    const place = stickyAt(PLACE, text, position);
    if (place === null) {
      const unknownPlace = countries.length === 0 || stickyAt(CAPITALIZED, text, position) !== null;
      return { countries: [...new Set(countries)], resolved: !unknownPlace, end };
    }
    countries.push(COUNTRY_CODES[place[1]!]!);
    end = PLACE.lastIndex;
    if (stickyAt(LIST_SEPARATOR, text, end) === null) {
      return { countries: [...new Set(countries)], resolved: true, end };
    }
    position = LIST_SEPARATOR.lastIndex;
  }
}

function quoteOf(text: string, start: number, end: number): string {
  return text.slice(start, end).replace(/\s+/gu, " ").trim();
}

function sentenceQuote(text: string, start: number, from: number): string {
  const rest = text.slice(from, from + 160);
  const stop = rest.search(SENTENCE_END);
  return quoteOf(text, start, from + (stop === -1 ? rest.length : stop));
}

type Found = Readonly<{ index: number; countries: readonly string[]; resolved: boolean; quote: string }>;

function restrictionsIn(text: string): Found[] {
  const found: Found[] = [];
  for (const cue of RESTRICTION_CUES) {
    for (const match of text.matchAll(cue.pattern)) {
      const start = match.index;
      const listStart = start + match[0].length;
      const places = readPlaces(text, listStart);
      if (cue.reading === "only") {
        if (places.resolved && stickyAt(ONLY_AFTER, text, places.end) !== null) {
          found.push({ index: start, countries: places.countries, resolved: true,
            quote: quoteOf(text, start, ONLY_AFTER.lastIndex) });
        }
        continue;
      }
      if (places.resolved) {
        found.push({ index: start, countries: places.countries, resolved: true,
          quote: quoteOf(text, start, places.end) });
        continue;
      }
      const quote = sentenceQuote(text, start, listStart);
      if (stickyAt(WHOLE_WORLD, text, listStart) !== null || TIME_ZONE.test(quote)) continue;
      found.push({ index: start, countries: [], resolved: false, quote });
    }
  }
  for (const pattern of PLACE_FIRST_CUES) {
    for (const match of text.matchAll(pattern)) {
      found.push({ index: match.index, countries: [COUNTRY_CODES[match[1]!]!],
        resolved: true, quote: quoteOf(text, match.index, match.index + match[0].length) });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// Only a named country is excluded: "except for sanctioned countries" names none, and
// the named countries of a partly unresolved list still count.
function exclusionsIn(text: string): (StatedCountries & { index: number })[] {
  const found: (StatedCountries & { index: number })[] = [];
  for (const pattern of EXCLUSION_CUES) {
    for (const match of text.matchAll(pattern)) {
      const places = readPlaces(text, match.index + match[0].length);
      if (places.countries.length === 0) continue;
      found.push({ index: match.index, countries: places.countries,
        quote: quoteOf(text, match.index, places.end) });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function unionOf(found: readonly Readonly<{ countries: readonly string[] }>[]): string[] {
  return [...new Set(found.flatMap(item => item.countries))];
}

export function readTextGeography(text: string): TextGeography {
  const restrictions = restrictionsIn(text);
  const exclusions = exclusionsIn(text);
  // One unresolved rule makes the country set unknown: listing only the resolved
  // countries would fail a candidate the text admits.
  const unresolved = restrictions.find(found => !found.resolved);
  const restriction = restrictions.length === 0 ? null
    : unresolved !== undefined ? { countries: [], quote: unresolved.quote }
    : { countries: unionOf(restrictions), quote: restrictions[0]!.quote };
  const exclusion = exclusions.length === 0 ? null
    : { countries: unionOf(exclusions), quote: exclusions[0]!.quote };
  return { restriction, exclusion };
}
