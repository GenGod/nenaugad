// Required travel in a posting's own words (spec §10.1–10.2, B64-001), for every adapter.
// The answer goes to workplace.mandatory_travel with its quote; whether it matters is the
// candidate's choice (REMOTE-01 under "no mandatory attendance"), not the catalog's.
//
// Errors run toward "not_stated": a posting that says nothing about travel promises
// nothing either way (acceptance case: never claim "there will be no travel"), and a
// requirement is only recorded when the text states one. An offsite or a retreat is not
// mandatory travel (spec: an optional offsite does not turn remote into hybrid), and
// travel perks, travellers and travel as a product are not travel requirements.
import type { Evidence, Workplace } from "../../domain/source-contracts.ts";

export type TravelReading = Readonly<{
  requirement: Workplace["mandatory_travel"];
  quote: string | null;
}>;

const SHARE = String.raw`(?:[1-9]\d?|100)\s?%`;
const QUALIFIER = String.raw`(?:some|occasional|frequent|regular|periodic|limited|minimal|domestic|international|national|overnight|extensive|significant|\w+wide)`;

// Stated as a possibility, not a requirement: "travel may be required", "travel of up to
// 10% may be required", "travel to Portland, OR, may be required".
const POSSIBLE = [
  /\btravel\b[^.;!?\n]{0,60}?\b(?:may|might|could) be (?:required|needed|necessary|expected)\b/giu,
  new RegExp(String.raw`\b(?:may|might|could) (?:require|involve|include) (?:${QUALIFIER}\s+)*travel(?:ing|ling)?\b`, "giu"),
] as const;
// Stated as not required.
const NOT_REQUIRED = [
  /\bno (?:mandatory |required |business )?travel(?: (?:is|will be))?(?: required| necessary| expected)?\b/giu,
  /\btravel (?:is )?not (?:required|necessary|expected|mandatory)\b/giu,
  /\b(?:does not|doesn't|will not|won't) (?:require|involve) (?:any )?travel\b/giu,
  /\btravel\s*:\s*(?:none|no|0\s?%)(?![\p{L}\p{N}])/giu,
] as const;
// Travel as a topic, a perk or a trade, not a duty: "travel industry experience
// (required)", "travel insurance", "travel stipend", "Travel Nurse"; and a statement about
// other roles: "for eligible field-based roles that require travel, we cover expenses".
const NOT_A_DUTY = [
  /\b(?:roles?|positions?|jobs?|employees?|team members?) (?:that|which|who) (?:require|involve|includes?) travel\b/giu,
  /\btravel(?: and (?:hospitality|tourism|leisure|expense))?\s+(?:industry|insurance|stipends?|budgets?|allowances?|reimbursements?|expenses?|perks?|agenc(?:y|ies)|agents?|tech(?:nology)?|platforms?|bookings?|management|nurse|nursing|sector|experience|compan(?:y|ies)|brands?|products?|apps?|marketplace)\b/giu,
] as const;
// Stated as part of the job.
const REQUIRED = [
  // A share of the time: "up to 25% travel", "15% estimated travel", "travel up to 25%",
  // "comfortable traveling up to 20%", "travel no more than 25 % of the time".
  new RegExp(String.raw`(?:\b(?:up to|approximately|about|around|roughly|at least)\s+)?${SHARE}\s*(?:\(\s*)?(?:of\s+)?(?:[\p{L}-]+\s+){0,2}travel(?:ing|ling)?\b`, "iu"),
  new RegExp(String.raw`\btravel(?:ing|ling)?\s+(?:is\s+|will\s+be\s+)?(?:expected\s+|required\s+)?(?:up to|approximately|about|around|roughly|no more than|at least|less than|under)?\s*${SHARE}`, "iu"),
  // "travel required", "travel is required", "some travel to our Connecticut facility
  // required", "national travel expected", "minimum travel required".
  /\btravel\b[^.;!?\n]{0,60}?\b(?:is |will be |are )?(?:required|mandatory|expected)\b/iu,
  // "must travel", "required to travel", "expected to travel", "must be able to travel".
  /\b(?:required|expected|needs?|must|will need|have) (?:to )?(?:be (?:able|willing|prepared|comfortable) (?:and (?:able|willing) )?to )?travel\b/iu,
  /\b(?:ability|willingness) (?:and (?:ability|willingness) )?to travel\b/iu,
  /\bwilling to travel\b/iu,
  new RegExp(String.raw`\brequir(?:es|ing|e) (?:${QUALIFIER}\s+)*travel\b`, "iu"),
  new RegExp(String.raw`\b(?:includes?|involves?|entails?) (?:${QUALIFIER}\s+)*travel\b`, "iu"),
  /\btravel(?:ing|ling)? to (?:our |the |a )?(?:clients?|customers?|partners?)(?:'|’)?\s*(?:sites?|locations?|offices?|facilities|premises)\b/iu,
  /\byou(?:'|’)ll travel\b|\byou will travel\b/iu,
] as const;
// A "/Travel" label in the title, like a remote label: "(Remote/Travel)", "- Travel".
// A job name that starts with the word ("Travel Nurse") is not one.
const TITLE_LABEL = /(?:^|[([|,/·-]\s*)travel(?:ing)?(?=\s*$|\s*[)\]|,/·]|\s+-)/iu;

// Unicode hyphens read as "-" and a soft hyphen as nothing, as in the remote rule.
function foldDashes(text: string): string {
  return text.replace(/\u00ad/gu, "").replace(/[\u2010-\u2015\u2212]/gu, "-");
}

function firstMatch(patterns: readonly RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * What the posting says about mandatory travel, with the words that say it. A stated
 * requirement wins over a possibility, a possibility over "not required"; possibilities
 * and negations are taken out of the text first, so "no travel required" and "travel
 * may be required" never read as a requirement.
 */
export function readTravel(title: string, text: string): TravelReading {
  const body = foldDashes(text);
  const label = TITLE_LABEL.exec(foldDashes(title));
  if (label) return { requirement: "required", quote: foldDashes(title).trim() };
  const possible = firstMatch(POSSIBLE, body);
  const notRequired = firstMatch(NOT_REQUIRED, body);
  let rest = body;
  for (const pattern of [...POSSIBLE, ...NOT_REQUIRED, ...NOT_A_DUTY]) rest = rest.replace(pattern, " ");
  const required = firstMatch(REQUIRED, rest);
  if (required !== null) return { requirement: "required", quote: required };
  if (possible !== null) return { requirement: "unknown", quote: possible };
  if (notRequired !== null) return { requirement: "explicitly_not_required", quote: notRequired };
  return { requirement: "not_stated", quote: null };
}

/** The evidence item a mapper stores for a stated reading; none when nothing is stated. */
export function travelEvidence(reading: TravelReading, recordId: string): Evidence | null {
  if (reading.requirement === "not_stated") return null;
  return {
    id: `ev:${recordId}:travel`, origin_type: "job_source", origin_id: recordId,
    origin_version: 1, field_path: "title+description", quote: reading.quote,
    method: "rule", confidence: reading.requirement === "unknown" ? 0.5 : 0.8,
  };
}

/** A mapper's workplace and evidence with the travel reading folded in. */
export function withTravel(
  workplace: Workplace, evidence: readonly Evidence[], reading: TravelReading, recordId: string,
): { workplace: Workplace; evidence: readonly Evidence[] } {
  const item = travelEvidence(reading, recordId);
  if (item === null) return { workplace, evidence };
  return {
    workplace: { ...workplace, mandatory_travel: reading.requirement, evidence_ids: [...workplace.evidence_ids, item.id] },
    evidence: [...evidence, item],
  };
}
