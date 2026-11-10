// Remote First Jobs adapter mapping + a clearly-labelled CONTRACT FIXTURE (S1-006).
// Live-contract facts from one research request on 2026-11-02 (page 0, 100 jobs):
// id is a lowercase slug, url is https://remotefirstjobs.com/companies/<company>/jobs/<id>,
// published_at is ISO 8601 WITHOUT an offset and is UTC (the newest job was visible
// 44 minutes after the documented 24-hour delay, which no western offset allows),
// salary_min/salary_max are USD per year converted by the source (0 = none), locations
// holds up to 3 country names and is often empty, description is HTML.
// The feed is NOT remote-only: by owner decision 2026-11-02 a posting is confirmed
// remote only by its own words. The fixture records below are synthetic.
import type {
  Evidence, Geography, JobSnapshot, Workplace,
} from "../../domain/source-contracts.ts";
import { AdapterInputError, descriptionToText } from "./himalayas-fixture.ts";
import { countryCodeOf } from "./geography-text.ts";
import { readTravel, withTravel } from "./travel-text.ts";

export type RemoteFirstJobsRawRecord = Readonly<{
  id: string;
  url: string;
  company_name: string;
  company_logo?: string | null;
  title: string;
  category?: string | null;
  seniority?: string | null;
  description: string;
  salary_min?: number | null;
  salary_max?: number | null;
  locations?: readonly string[] | null;
  published_at: string;
}>;

export const remoteFirstJobsContractFixture: readonly RemoteFirstJobsRawRecord[] = [
  {
    id: "platform-engineer-synthetic-fixture-900101",
    url: "https://remotefirstjobs.com/companies/northwind-fixtures/jobs/platform-engineer-synthetic-fixture-900101",
    company_name: "Northwind Fixtures",
    company_logo: null,
    title: "Platform Engineer - synthetic fixture (Remote)",
    category: "software_development",
    seniority: "senior",
    description:
      "<p>Synthetic contract fixture. This is a fully remote position: the team works " +
      "asynchronously across time zones.</p><ul><li>Operate the platform</li></ul>",
    salary_min: 120000,
    salary_max: 150000,
    locations: ["United States", "Canada"],
    published_at: "2026-11-01T13:30:55",
  },
  {
    id: "account-manager-synthetic-fixture-900102",
    url: "https://remotefirstjobs.com/companies/harbor-fixtures/jobs/account-manager-synthetic-fixture-900102",
    company_name: "Harbor Fixtures",
    company_logo: null,
    title: "Account Manager (synthetic fixture)",
    category: "sales",
    seniority: "middle",
    description:
      "<p>Synthetic contract fixture. This is a hybrid role: three days per week in our " +
      "Munich office.</p>",
    salary_min: 0,
    salary_max: 0,
    locations: ["Germany"],
    published_at: "2026-11-01T09:00:00",
  },
  {
    id: "data-analyst-synthetic-fixture-900103",
    url: "https://remotefirstjobs.com/companies/cobalt-fixtures/jobs/data-analyst-synthetic-fixture-900103",
    company_name: "Cobalt Fixtures",
    company_logo: null,
    title: "Data Analyst (synthetic fixture)",
    category: "data",
    seniority: "middle",
    description: "<p>Synthetic contract fixture. You will build dashboards for the finance team.</p>",
    salary_min: null,
    salary_max: null,
    locations: [""],
    published_at: "2026-10-31T19:03:18",
  },
];

const ID_PATTERN = /^[a-z0-9-]{1,120}$/u;
const PUBLISHED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/u;
const EXCERPT_CHARS = 300;

// The rule has three tiers (owner decision 2026-11-02, review H1). Errors may only run
// toward hiding a remote posting, never toward showing an office one as remote.
//   1. An office STATEMENT (title or text) excludes the posting, even beside a remote
//      statement: an unresolved contradiction is quarantined (spec 10.3). Since B72 a
//      statement in the text about the company, other roles, a condition, an option, a
//      perk or a preference is not one: it is an office word (tier 2).
//   2. Any other office WORD blocks confirmation: the posting goes to needs-review.
//      Since B65 also: office words in other languages or inside a longer word, other
//      places of work, presence by the calendar, and in the title anything attached to
//      the remote label that is not a place, a time zone, a contract type or travel.
//   3. Only then does a remote statement confirm it.
// Tiers 1 and 2 also read a normalised copy of the text; tier 3 never does.
// "Hybrid cloud", "hybrid apps" and the like are not a work mode.
const TECH_HYBRID = String.raw`(?![- ](?:cloud|it\b|infrastructure|apps?\b|mobile\b|networks?\b|search\b))`;
const HYBRID = `hybrid${TECH_HYBRID}`;
// A whole word, with letter boundaries that also hold for "ü" or "é" (\b is ASCII-only).
const word = (alternatives: string) =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, "iu");
// Being at a place: "at our …", "from one of our …", "visit the …", "based at Acme's …".
const PLACE_PREPOSITION = "(?:at|in|on|from|to|into|inside|out of|visit(?:s|ing)?|attend(?:s|ing)?|join(?:s|ing)?|based (?:at|in|on|out of))";
// Tokens are bounded so that a long run of letters and dots costs linear time.
const PLACE_OWNER = String.raw`(?:(?:one of\s+)?(?:our|the|its|their)|\p{L}[\p{L}\p{N}&.-]{0,40}['’]s)`;
// Up to three words between the owner and the place: "our Austin, TX", "the main". A word
// that ends a sentence ("their own. Intelligence Center") is not one.
const PLACE_MODIFIER = String.raw`[\p{L}\p{N}&.'’,-]{0,39}[\p{L}\p{N}&'’,-]\s+`;
const PLACE_MODIFIERS = `(?:${PLACE_MODIFIER}){0,3}?`;
// A git "main branch" (into, to, from, off or on it) and products named like places are
// not workplaces; a bank's main branch is.
const WORKPLACE = String.raw`(?:studios?(?<!(?:android|visual|label|looker|data|copilot|ai|ml|sagemaker|code|developer|azure|apps|r)\s+studios?)|campus(?:es)?|facilit(?:y|ies)(?<!credit\s+facilit(?:y|ies))|labs?|laborator(?:y|ies)|plants?(?![- ]based)|warehouses?|factor(?:y|ies)|workshops?|premises|branch(?:es)?(?<!(?:(?:into|to|from|off|on)\s+(?:the\s+|our\s+)?main|master|feature|release|dev|development|default|production|git|remote)\s+branch(?:es)?)|showrooms?|clinics?|hospitals?|depots?|hubs?|stores?(?<!(?:app|play|online|web|e-?commerce|chrome web)\s+stores?)|(?:distribution|call|fulfil?l?ment|contact|service|customer|operations|logistics|support|data|dispatch|sorting|processing|care|medical|training)\s+cent(?:er|re)s?)`;
// A weekday, whole or short: "Monday", "Tue", "Wednesdays", "Thurs".
const WEEKDAY = "(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri)(?:day)?s?";
// Presence by the calendar: "every other week", "most days", "Mondays", "3 out of 5 days".
const PRESENCE_FREQUENCY = String.raw`(?:daily|every (?:other |second )?(?:day|week)|each (?:day|week)|most (?:days|weeks)|weekly|bi-?weekly|fortnightly|once a fortnight|monthly|every (?:\d{1,2}|two|three|four) weeks|(?:every |each |on )?(?:mon|tues|wednes|thurs|fri)days?|(?:every |each |on )?weekdays?|${WEEKDAY}\s*(?:-|to|through|thru|until)\s*${WEEKDAY}|[1-4] (?:out of|of) 5 days|(?:\d|one|two|three|four|five|six|seven) days? (?:a|per|each) week)`;
// A place by its name, read case-sensitively ("in Austin", not "in person"); languages,
// days, months, teams and everyday tools are not places ("Monday to Friday", "code daily
// in Python", "report weekly to Product").
const PLACE_NAME = String.raw`(?!(?:English|Spanish|German|French|Portuguese|Italian|Dutch|Polish|(?:Mon|Tue|Tues|Wed|Wednes|Thu|Thur|Thurs|Fri|Satur|Sun)(?:day)?s?|Weekends?|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]|Slack|Zoom|Teams|Jira|Notion|Salesforce|Google|Microsoft|Excel|Figma|GitHub|Asana|HubSpot|Zendesk|Python|Java|JavaScript|TypeScript|Go|Rust|Ruby|PHP|SQL|Kotlin|Swift|Scala|React|Node|AWS|Azure|GCP|Tableau|Looker|Snowflake|Product|Engineering|Sales|Marketing|Design|Finance|Operations|Support|Leadership|Management|HR)\b)\p{Lu}[\p{L}.'-]{1,30}(?:\s+\p{Lu}[\p{L}.'-]{1,30}){0,2}(?:,\s*\p{Lu}{2})?`;
// The same frequency words for a case-sensitive pattern: a capital first letter or not.
const PRESENCE_FREQUENCY_CASED = PRESENCE_FREQUENCY.replace(/(?<![\\\p{L}])\p{Ll}/gu, letter => `[${letter.toUpperCase()}${letter}]`);
const AT = "(?:[Ii]n|[Aa]t|[Tt]o|[Ii]nto)";
// After a frequency, "to" is mostly a person or a team ("report weekly to Product").
const AT_AFTER_FREQUENCY = "(?:[Ii]n|[Aa]t|[Ii]nto)";
// Words for working remotely, in the languages read below.
const REMOTE_WORDS = String.raw`(?:remote(?:ly)?|tele(?:work|commut)\w*|wfh|work(?:ing)?[- ]from[- ]home|home[- ]?office|t[ée]l[ée]travail|teletrabajo|teletrabalho|remot[oa]|smart working|thuiswerk\p{L}*|pracy zdalnej|praca zdalna|mobile[ns]? arbeiten|telearbeit)`;
// A negation within four plain words of a remote word: "we are not hiring remote
// engineers", "no option to work remotely", "Puesto no remoto", "Brak pracy zdalnej";
// and after it: "Remote work is unavailable", "Remote—no.", "Remote: N/A". The words in
// between are a closed list, so "Visa sponsorship: Not available. Hires remotely in…"
// and "never worked remotely before?" are not negations; nor is a remote word that names
// a perk or a skill ("No remote experience required", "There is no remote stipend").
const NEGATOR = "(?:no|not|never|cannot|can['’]?t|won['’]t|isn['’]t|aren['’]t|don['’]t|doesn['’]t|unable to|without|ineligible|excludes?|excluding|prohibits?|forbids?|disallows?|nicht|kein(?:e|en)?|pas de|sans|aucun|sin|sem|niente|geen|brak|nie)";
const BEFORE_REMOTE = String.raw`(?:a|an|any|the|this|for|to|of|from|be|is|are|do|does|go|done|offer(?:ed|ing)?|hiring|consider(?:ed|ing)?|accept(?:ed|ing)?|support(?:ed|ing)?|allow(?:ed|ing)?|permit(?:ted)?|provid(?:e|ed|ing)|open|eligible|qualify|qualifies|available|possible|possibility|chance|option|options|opportunity|work|working|performed|fully|100\s?%|completely|entirely|currently|yet|able|longer|positions?|roles?|jobs?|candidates|applicants|employees|staff|people|anyone|you|se|permite|el|la|un|una|es|hay|puesto|trabajo|ist|möglich|leider)`;
const REMOTE_AS_A_THING = String.raw`(?![\s-]+(?:work\s+)?(?:experience|stipends?|allowances?|budgets?|setups?|equipment|perks?|benefits?|tools?|halfway)\b)`;
const AFTER_REMOTE = "(?:work|working|workers?|arbeit|arbeiten|positions?|roles?|options?|arrangements?|employment|candidates|applicants|applications|is|are|will|would|be|currently|unfortunately|leider|ist|sind|est|es|está|n['’]est|possible|allowed|permitted|eligible|available|policy|here|for|this|möglich|se|el|la|da)";
// What can follow "not" without negating the remote work: "Remote work is not new to us",
// "Remote is not optional", "not just a perk", "not for everyone".
const NOT_A_NEGATION = String.raw`(?!\s+(?:just|only|new|optional|negotiable|temporary|a problem|an issue|a perk|a benefit|a buzzword|a trend|an afterthought|for everyone|required|necessary|needed|need)\b)`;
const NEGATED_REMOTE = [
  /\bnon[- ]?remote\b/iu,
  /\bnot\s+(?:(?:a|an|100\s?%|fully|completely|entirely)\s+){0,2}remote\b/iu,
  // B65: other negations. "No remote position available", "Engineer - No Remote", "No WFH".
  new RegExp(String.raw`\bno\s+(?:(?:fully|100\s?%|full[- ]time|permanent)\s+)?remote\b(?![- ](?:first|friendly))${REMOTE_AS_A_THING}`, "iu"),
  /\bno\s+(?:wfh|work(?:ing)? from home|home[- ]?office|telecommut\w*)\b/iu,
  // "cannot be performed remotely", "isn't remote", "not open to remote candidates",
  // "we do not offer remote work", "not eligible for remote work".
  /\b(?:not|cannot|can['’]?t|won['’]t|isn['’]t|aren['’]t|unable to|don['’]t|doesn['’]t)\s+(?:be\s+)?(?:(?:done|performed|worked|offered|considered|supported|accommodated|available|eligible|open|suitable|offer|support|consider|allow|permit|accept|hire)\s+)?(?:(?:as|for|to)\s+)?(?:a\s+)?(?:fully\s+)?remote(?:ly)?\b/iu,
  /\bremote(?:\s+(?:work(?:ing)?|options?|arrangements?|employment))?\s+(?:(?:is|are)\s+)?(?:not|isn['’]t|aren['’]t)\s+(?:(?:currently|yet)\s+)?(?:possible|available|an option|offered|permitted|allowed|supported)\b/iu,
  // A form field: "Remote: No", "Remote work possible? No", "Homeoffice: nein", "Remote?
  // Not at this time" (not "Remote? No problem" or "Not a problem").
  /\b(?:remote|wfh|work from home|telecommut\w*|home[- ]?office|t[ée]l[ée]travail|teletrabajo|teletrabalho)(?:\s+[\p{L}-]+){0,2}\s*[:?=]\s*(?:unfortunately,?\s+)?(?:(?:no|nein|non|não)(?![\p{L}\p{N}])(?!\s+(?:problem|worries|issue|question|doubt|office|commut\w*|relocation))|not\b(?!\s+(?:only|just|a problem|an issue))|none\b|[✗✘❌])/iu,
  /\bremote (?:candidates|applicants|applications) (?:will|are|would) not be (?:considered|accepted|eligible)\b/iu,
  // German, French, Spanish and Portuguese.
  word(String.raw`nicht\s+(?:\p{L}+\s+)?remote|kein(?:e|en)?\s+(?:remote|home[- ]?office|mobile[sn]? arbeiten|telearbeit)`),
  word(String.raw`(?:pas de|sans|aucun)\s+t[ée]l[ée]travail|t[ée]l[ée]travail (?:impossible|non (?:autorisé|possible))`),
  word(String.raw`(?:sin|no hay|sem|não há)\s+(?:teletrabajo|teletrabalho|trabajo remoto|trabalho remoto)|no es (?:un (?:puesto|trabajo) )?remoto|não é (?:um )?(?:cargo |trabalho )?remoto`),
  // Review of B65: a negation near a remote word, in either order (see NEGATOR).
  word(String.raw`${NEGATOR}(?:[\s-]+${BEFORE_REMOTE}){0,4}?[\s-]+${REMOTE_WORDS}${REMOTE_AS_A_THING}`),
  word(String.raw`${REMOTE_WORDS}(?:[\s-]+${AFTER_REMOTE}){0,4}?\s*(?:[:?=,-]\s*)?(?:(?:not|never|(?<=\b(?:work|working|options?|arrangements?|positions?|roles?)\s+)(?:cannot|can['’]?t)(?=\s+be\b)|nicht|pas|não|niet|nie|non(?!-))(?:\s+(?:possible|available|allowed|permitted|offered|supported|an option|möglich|erlaubt|disponible|permitido|possível|mogelijk))?(?![\p{L}\p{N}])${NOT_A_NEGATION}|no (?:es|está|son) (?:posible|permitido|una opción)|(?:no|nein|non|nope)(?=\s*(?:[.,;!)]|$))|unavailable|impossible|prohibited|forbidden|disallowed|ineligible|excluded|out of the question|n\/a|false|need not apply|ausgeschlossen)`),
  /\blooking for (?:a |an )?(?:fully )?remote\b[^.;!?]{0,40}?\b(?:this is not|this isn['’]t|not (?:it|this|the right))\b/iu,
  // Form fields: "Remote (Y/N): N", "Remote: 0%".
  /\bremote\s*\(y\/n\)\s*:?\s*n\b|\bremote(?:\s+work)?\s*:\s*0\s?%/iu,
] as const;
const OFFICE_TITLE = [
  new RegExp(String.raw`\b(?:${HYBRID}|on[- ]?site|in[- ]office|office[- ]based)\b`, "iu"),
  ...NEGATED_REMOTE,
] as const;
// Statements of a work arrangement in the text. Since B72 each occurrence is read in its
// sentence (`aboutTheCompany`), so the patterns are global; the negations are not.
const ARRANGEMENT_STATEMENTS = [
  /\bhybrid (?:role|position|job|work|working|schedule|model|setup|set-up|arrangement|policy|opportunity)\b/giu,
  /\b(?:role|position|job) is hybrid\b/giu,
  /\b(?:on[- ]?site|in[- ]office|in[- ]person) (?:role|position|job)\b/giu,
  /\b(?:days?|times?) (?:a|per|each) week (?:in|at|from) (?:the |our |an? )?[^.]{0,40}?\boffice\b/giu,
  /\boffice\b[^.]{0,40}?\b(?:[1-5]|one|two|three|four|five) days? (?:a|per|each) week\b/giu,
  /\bin[- ]office (?:\w+ )?(?:days?|requirement|presence|attendance)\b/giu,
  // An obligation, not a history or a joke: "one year of work onsite in Germany" is
  // experience, and "don't ask to work in our office (we don't have one)" is remote.
  /\b(?:will|must|(?:required|expected|needs?) to) (?:work|be|report) (?:on[- ]?site|in[- ]office|in (?:the|our) office)\b/giu,
  /\bin[- ]person \d+ days?\b/giu,
] as const;
// ANY office vocabulary blocks a confirmation and sends the posting to a human. Listing
// office phrasings one by one always missed some ("work from our London office", "the
// Berlin HQ", "commute to", "relocation"), so the word itself is enough. "Microsoft
// Office" or "Office Manager" go to review too, which is the allowed direction; "your
// home office" does not.
const OFFICE_WORDS = [
  new RegExp(String.raw`\b${HYBRID}\b`, "iu"),
  /\bon[- ]?site\b/iu,
  /(?<!\bhome[- ]?)\boffices?\b/iu,
  /\bin[- ]person\b/iu,
  /\bcommut\w*/iu,
  /\brelocat\w*/iu,
  /\b(?:hq|head ?quarters?)\b/iu,
  /\bpartially remote\b/iu,
  /\bwork(?:ing)? from home (?:\d|one|two|three|four|five)\b/iu,
  // B65, from the S1-006 final review. The word inside a longer one or in another
  // language: "Hybridmodell", "hybride", "híbrido", "ibrido", "hybrydowa".
  new RegExp(String.raw`(?:hybr[iy]d|h[íi]brid|(?<!\p{L})ibrid)${TECH_HYBRID}\p{L}*`, "iu"),
  /\b(?:partly|semi|mostly)[- ]remote\b|\bremote[- ]ish\b/iu,
  // Office words in German, French, Spanish/Portuguese, Italian, Dutch, Polish and the
  // Scandinavian languages, with their compounds ("Büroarbeitsplatz", "Officetage").
  // "Homeoffice" is working from home and is not one; "Bürokratie" is not an office.
  word(String.raw`vor[- ]ort|\p{L}*b(?:ü|ue)ro(?!kra)\p{L}*|office(?:tage?|pflicht|präsenz|anwesenheit)\p{L}*|anwesenheit\p{L}*|in präsenz|präsenz(?:tag|pflicht|arbeit|phase|zeit|termin|kultur)\p{L}*|teilweise\s+(?:remote|home[- ]?office|mobil\p{L}*)|(?:am|im|an (?:unserem|einem|dem)) standort\p{L}*|(?:in|an) (?:der|unserer) zentrale|hauptsitz\p{L}*|niederlassung\p{L}*|geschäftsstelle\p{L}*|im betrieb|präsenz im`),
  word(String.raw`au bureau|(?:nos|notre|vos|les|des|aux|en|du) (?:bureaux?|locaux)|pr[ée]sentiel\p{L}*|sur (?:site|place)|t[ée]l[ée]travail partiel|si[èe]ge|en agence|(?:notre|nos) sites?|présence`),
  word(String.raw`\p{L}*presencial\p{L}*|oficinas?|escrit[óo]rios?|modalidad mixta|teletrabajo parcial|in sede|ufficio|uffici|in presenza|smart working (?:parziale|\d)|\p{L}*kantoor\p{L}*|op locatie|deels (?:thuis|remote)\p{L}*|biur(?:o|ze|a|em|ach|ow\p{L}*)|stacjonarn\p{L}*|częściowo zdaln\p{L}*|\p{L}*kontor\p{L}*|sede|instalaciones|siedzib\p{L}*|filiale|in loco|sucursal\p{L}*|oddzia[łl]\p{L}*|hoofdkwartier`),
  // Days of presence: "3 days a week", "2-3 days per week", "2 days/wk", "twice a week",
  // "2x/week", "zwei Tage pro Woche", "deux jours par semaine". Five days is a full week.
  /\b(?:[1-4]|one|two|three|four|several|a few|a couple(?: of)?|some|multiple)(?:\s*(?:-|to|or)\s*(?:[1-5]|two|three|four|five))?\s*(?:x\s*)?(?:days?|d)\s*(?:a|per|each|every|in a|\/)\s*(?:week|wk)\b|\b(?:[1-4]|one|two|three|four)\s*days?\s*(?:weekly|a fortnight)\b|\b[1-4]\s*(?:out of|of|\/)\s*5\s*(?:work(?:ing)?\s*)?days\b/iu,
  /\b(?:once|twice|(?:[1-4]|one|two|three|four)\s*(?:x|times?))\s*(?:a|per|each|every|\/)\s*(?:week|wk|fortnight)\b/iu,
  // Fixed weekdays: "every Tuesday", "Tuesdays and Thursdays", "on Fridays" (not a
  // schedule such as "Monday through Friday").
  /\bevery (?:mon|tues|wednes|thurs|fri)day\b|\b(?:mon|tues|wednes|thurs|fri)days?\s*(?:and|&|,|\/)\s*(?:mon|tues|wednes|thurs|fri)days?\b|\bon (?:mon|tues|wednes|thurs|fri)days\b/iu,
  // Part of a week: "Mon-Wed", "Tue/Thu", "Monday to Wednesday" (not Monday to Friday).
  new RegExp(String.raw`\b(?!mon(?:day)?\s*(?:-|to|through|thru|until)\s*fri(?:day)?\b)${WEEKDAY}\s*(?:[-/&]|to|through|thru|until|and)\s*${WEEKDAY}\b`, "iu"),
  word(String.raw`(?:[1-4]|ein(?:en)?|zwei|drei|vier)\s*(?:x\s*)?(?:tage?n?|mal)\s*(?:pro|die|in der|je|/)\s*woche|(?:[1-4]|un|deux|trois|quatre)\s*jours?\s*(?:par|/)\s*semaine`),
  word(String.raw`(?:[1-4]|uno?|dos|tres|cuatro|dois|duas|três|quatro)\s*d[íi]as?\s*(?:a|por|na|/)\s*semana|(?:[1-4]|een|twee|drie|vier)\s*dag(?:en)?\s*(?:per|in de|/)\s*week|(?:[1-4]|uno|due|tre|quattro)\s*giorn[oi]\s*(?:a|alla|per|di|in)\s*(?:settimana|smart working)`),
  // Days split between home and somewhere else: "WFH 2 days", "WFH Mondays", "two days
  // remote", "3 Tage Homeoffice", "deux jours de télétravail", "2 dagen thuiswerken".
  /\b(?:wfh|work(?:ing)? from home)\s*(?:on\s+|for\s+|up to\s+|\(|:|-)?\s*(?:\d|one|two|three|four|five|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?)\b/iu,
  /\b(?:[1-4]|one|two|three|four)\s*(?:x\s*)?days?\s*(?:of\s+)?(?:wfh|remote(?:ly)?|(?:work(?:ing)?\s+)?from home|home[- ]?office)\b/iu,
  word(String.raw`(?:[1-4]|ein(?:en)?|zwei|drei|vier)\s*(?:x\s*)?tage?n?\s*(?:home[- ]?office|mobil\p{L}*|remote)|(?:[1-4]|un|deux|trois|quatre)\s*jours?\s*(?:de\s+)?t[ée]l[ée]travail|(?:[1-4]|uno?|dos|tres|cuatro|dois|duas|três|quatro)\s*d[íi]as?\s*(?:de\s+)?(?:teletrabajo|teletrabalho|remoto)|(?:[1-4]|een|twee|drie|vier)\s*dag(?:en)?\s*thuis\p{L}*`),
  // A physical place of work other than an office: "at our Paris studio", "on our Austin
  // campus", "visit our Austin facility", "in the lab", "at Acme's Lisbon hub". Travel to
  // one is B64's required travel, not presence, unless it is weekly; a product named like
  // a place is not one.
  new RegExp(String.raw`(?<!\btravel\w*\s+)\b${PLACE_PREPOSITION}\s+${PLACE_OWNER}\s+${PLACE_MODIFIERS}${WORKPLACE}\b`, "iu"),
  new RegExp(String.raw`\b${PLACE_OWNER}\s+${PLACE_MODIFIERS}(?:${WORKPLACE}|sites?|locations?)\b,?\s+${PRESENCE_FREQUENCY}\b`, "iu"),
  /\b(?:daily|weekly|bi-?weekly|fortnightly)\s+(?:travel|trips?|visits?|flights?|commut\w*)\b/iu,
  // Presence by the calendar at a named place: "every other week in Austin", "Mondays in
  // Austin", "fly to Austin biweekly", "in Austin 3 out of 5 days".
  new RegExp(String.raw`(?<![\p{L}\p{N}])${PRESENCE_FREQUENCY_CASED}\s+${AT_AFTER_FREQUENCY}\s+${PLACE_NAME}`, "u"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])${AT}\s+${PLACE_NAME},?\s+${PRESENCE_FREQUENCY_CASED}(?![\p{L}\p{N}])`, "u"),
  // "Site" is often a website or a job title ("Site Reliability"): only a site with a
  // modifier ("our Denver site", "the client site") or one you are at ("at the site").
  new RegExp(String.raw`(?<!\btravel\w*\s+)\b${PLACE_PREPOSITION}\s+${PLACE_OWNER}\s+(?:${PLACE_MODIFIER}){1,3}?sites?(?<!(?:web|career|careers|internet|e-?commerce|job board|social media)\s+sites?)\b(?!\s+reliability)`, "iu"),
  // So are a centre, a shop, a building, a workplace and a base you are at, which have
  // idioms of their own ("in the center of", "diversity in the workplace", "our code
  // base"); "to" them is mostly a customer ("we sell to the auto repair shops").
  new RegExp(String.raw`\b(?:at|in|on|from|into|inside|out of|visit(?:s|ing)?|attend(?:s|ing)?|join(?:s|ing)?|based (?:at|in|on|out of))\s+${PLACE_OWNER}\s+(?:${PLACE_MODIFIER}){1,3}?(?:cent(?:er|re)s?|shops?(?<!coffee\s+shops?)|buildings?|workplaces?|bases?(?<!(?:code|data|customer|user|client|knowledge|install|installed|fan|talent|revenue|subscriber|member|asset|tax|cost)\s+bases?))\b`, "iu"),
  /\bjobsites?\b|\bon (?:the |a )?job sites?\b|\bphysical(?:ly)? (?:present|presence)\b/iu,
  /\bat\s+(?:our|the|its|their)\s+sites?\b(?!\s+reliability)/iu,
  // A location you are at ("at our Austin location", "out of our Austin location"), not
  // "in the following locations" or "their home location".
  new RegExp(String.raw`\b(?:at|from|out of)\s+${PLACE_OWNER}\s+(?:${PLACE_MODIFIER}){1,3}?locations?(?<!home\s+locations?)\b`, "iu"),
  // A client's site without an owner word: "at customer sites across Texas".
  /(?<!\btravel\w*\s+)\b(?:at|on|from|in)\s+(?:the\s+)?(?:customer|client|partner)s?['’]?\s+(?:sites?|locations?|premises|offices?|facilit(?:y|ies))\b/iu,
  /\b(?:works?|based|time|days?)\s+in the field\b|\bco-?located\b|\bin[- ]store\b/iu,
  /\bon[- ]campus\b|\b(?:studio|lab|site|campus|facility|warehouse|clinic|hospital|field)[- ]based\b/iu,
  /\bfield (?:role|position)\b/iu,
  // A commuting radius: "local to Austin", "within 30 miles of".
  /\blocal (?:to (?!your\b|their\b)|candidates?\b)|\blocals? only\b/iu,
  /\bwithin (?:a )?\d+[- ]?(?:miles?|mi|km|kilomet(?:er|re)s?)\b/iu,
] as const;
// In the title after the label: "(Remote - Austin, TX weekly)", "(Remote, 1 week/month)".
const TITLE_QUALIFIERS = [
  /\b(?:weekly|bi-?weekly|monthly|quarterly)\b/iu,
  /\b(?:[1-4]|one|two)\s*(?:weeks?|wks?)\s*(?:a|per|each|every|\/)\s*(?:month|mo|quarter)\b/iu,
  /\b(?:once|twice|[1-4]\s*(?:x|times?))\s*(?:a|per|each|every|\/)\s*(?:month|mo)\b/iu,
  // Anywhere in a title, a count of days or weeks, a weekday (not "Mon-Fri") or a
  // frequency is an arrangement, never part of a job's name: "(Remote) - Austin 2 days",
  // "(Remote, Austin Tue/Thu)", "(Remote, Austin fortnightly)", "(Remote, Berlin 2 Tage)".
  word(String.raw`\d+\s*(?:x\s*)?(?:days?|wks?|weeks?|tage?n?|jours?|d[íi]as?|dagen|giorni)`),
  new RegExp(String.raw`\b(?!mon(?:day)?\s*(?:-|to|through|thru|until)\s*fri)(?<!\bmon(?:day)?\s*(?:-|to|through|thru|until)\s*)${WEEKDAY}\b(?!\s+off\b)`, "iu"),
  word("daily|fortnightly|every (?:other |second |\\d{1,2} )?(?:days?|weeks?|months?|(?:mon|tue|wed|thu|fri)\\p{L}*)|wöchentlich|monatlich|täglich|semanal(?:mente)?|mensual|quincenal|hebdomadaire|mensuel|quotidien|settimanale|mensile|wekelijks|maandelijks|tygodniowo"),
] as const;
// What a title says around the word "remote" must be a place, a time zone, a contract type
// or travel: "(Remote - Canada)", "| EST Hours | Remote", "(Contract, Remote)", "(Remote -
// Contractor)", "(Remote/Travel)", "- 100% Remote - US". Anything else ("(Remote, 2 days in
// Austin)", "- Remote (Austin campus)", "Remote US, Austin studio") is an arrangement the
// rule cannot read and blocks the confirmation (B65). Every standalone "remote" counts, not
// only a label; after a leading one the job's name comes first ("Remote - Senior
// Engineer"). A harmless qualifier ("(Remote, NetSuite)") waits for review.
const TITLE_LENGTH_READ = 300;
const TITLE_REMOTE = /(?<![\p{L}\p{N}])remote(?![\p{L}\p{N}]|-(?:first|friendly)\b)/iu;
const TITLE_LEADING = /^[\s([|,/·*-]*(?:(?:fully|100\s?%)\s+)?$/iu;
const TITLE_SEPARATOR = /[()[\]{}|,/·;:&*]|\s[-+]\s|\s+(?:and|or|w\/|with)\s+/u;
const TITLE_NOISE = /\((?:[mwfdhxn]\s*\/\s*){1,3}[mwfdhxn]\)|\ball genders\b|#\s*\d+|\breq(?:uisition)?\.?\s*(?:id\s*)?#?\s*[\w-]*\d[\w-]*/giu;
// One affix at a time, each anchored, so a long run of them costs no backtracking.
const TITLE_PREFIX = /^(?:remote|fully|100\s?%|only|anywhere|in|within|from|across|for|open to|based in|located in|bilingual)\s+/iu;
const TITLE_SUFFIX = /\s+(?:based|only|residents?|citizens?|preferred|candidates|applicants|(?:business |working )?hours|time\s*zones?|timezones?|tz|overlap|friendly|speaking|speakers?)$|-based$/iu;
const TITLE_REGION_WORD = /^(?:east|west|north|south|central|coast|eastern|western|northern|southern|time|zone)$/iu;
const TITLE_ALLOWED = new RegExp(`^(?:|remote|anywhere|worldwide|global(?:ly)?|international|distributed|async|${[
  // What only describes the remote work: "- Remote Opportunity", "(Remote Position)".
  "opportunity|position|role|job|work|eligible|ok|possible|available|option(?:al)?",
  // Territories and small states the country list does not hold.
  "monaco|andorra|liechtenstein|san marino|martinique|guadeloupe|r[ée]union|mayotte|french guiana|puerto rico|guam|greenland|faroe islands|gibraltar|isle of man|jersey|guernsey|bermuda|cayman islands|aruba|cura[cç]ao",
  // Regions, US states, Canadian provinces and Australian states (names and codes).
  "europe|eu|eea|emea|apac|apj|latam|lat ?am|americas|(?:north|south|latin|central) america|caribbean|asia(?:[- ]pacific)?|africa|middle east|mena|oceania|nordics?|scandinavia|dach|cee|benelux|baltics?|balkans|iberia|uk ?& ?i|uki|anz|sea|na|ap",
  "east coast|west coast|gulf coast|midwest|northeast|southeast|southwest|northwest|new england|central|eastern|western|pacific|mountain",
  "ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland(?: and labrador)?|prince edward island|yukon|nunavut|northwest territories|on|qc|bc|ab|mb|sk|ns|nb|nl|pe|yt|nu|nt",
  "new south wales|victoria|queensland|western australia|south australia|tasmania|australian capital territory|northern territory|nsw|vic|qld|tas|act",
  // Languages, shifts, pay: "(Remote, Bilingual Spanish)", "(Remote, Night Shift)", "(Remote,
  // $120k-$150k)", "(Remote) - Fridays Off".
  "english|spanish|german|french|portuguese|italian|dutch|polish|japanese|mandarin|chinese|cantonese|korean|arabic|hindi|russian|turkish|swedish|danish|norwegian|finnish|greek|hebrew|vietnamese|thai|indonesian|tagalog",
  "(?:day|night|evening|overnight|weekend|swing|graveyard) shifts?|nights|evenings|weekends|(?:mon|fri)days? off|no travel",
  String.raw`[$€£]?\d[\d,.]*\s*k?(?:\s*-\s*[$€£]?\d[\d,.]*\s*k?)?(?:\s*(?:usd|eur|gbp|cad|aud|\/\s*(?:yr|year|hr|hour)|per (?:year|hour)))?`,
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington(?: dc| d\\.c\\.)?|west virginia|wisconsin|wyoming|district of columbia",
  "al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc",
  // Time zones: "EST", "CET", "UTC+1 to UTC+3", "GMT-5".
  String.raw`(?:et|ct|mt|pt|est|edt|cst|cdt|mst|mdt|pst|pdt|akst|hst|ast|cet|cest|eet|eest|wet|bst|ist|aest|aedt|awst|nzst|jst|kst|sgt|hkt|wat|eat|sast|utc|gmt)(?:\s*[+-]\s*\d{1,2}(?::?\d{2})?)?(?:\s*(?:to|-)\s*(?:utc|gmt)?\s*[+-]?\s*\d{1,2}(?::?\d{2})?)?`,
  // Contract types and seniority.
  String.raw`contract(?:or)?|contract[- ]to[- ]hire|freelance(?:r)?|full[- ]?time|part[- ]?time|ft|pt|permanent|perm|w-?2|1099|c2c|corp[- ]to[- ]corp|hourly|salaried|intern(?:ship)?|ftc|fixed[- ]term|b2b|\d{1,2}[- ]?(?:month|mo)s?(?: (?:contract|ftc|fixed[- ]term))?|(?:entry|junior|mid|senior)(?:[- ]level)?`,
  // A full working week: "(Remote, Mon-Fri)".
  "mon(?:day)?\\s*(?:-|to|through)\\s*fri(?:day)?|m-f",
  // Travel is B64's: "(Remote/Travel)", "(Remote, 25% travel)".
  String.raw`travel(?:ing)?(?: required)?|(?:some|occasional|limited|frequent) travel|\d{1,3}\s?% travel`,
].join("|")})$`, "iu");

// "in Martinique", "within Canada": a named place after a preposition, read
// case-sensitively ("in Austin" is a place; "in office" is not).
const TITLE_IN_PLACE = /^(?:[Ii]n|[Ww]ithin|[Ff]rom|[Bb]ased in|[Ll]ocated in)\s+\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*){0,3}$/u;

function titlePartAllowed(part: string): boolean {
  if (TITLE_IN_PLACE.test(part.trim())) return true;
  let core = part.trim();
  for (let previous = ""; previous !== core;) {
    previous = core;
    core = core.replace(TITLE_PREFIX, "").replace(TITLE_SUFFIX, "").trim();
  }
  const known = (words: string) => TITLE_ALLOWED.test(words) || countryCodeOf(words) !== null;
  // "US East Coast", "CET time zone": a place word by word.
  return known(core) || core.split(/\s+/u).every(word => known(word) || TITLE_REGION_WORD.test(word));
}

function unverifiedTitleQualifier(title: string): string | null {
  // A title longer than any job's name is not read word by word; it waits for review.
  if (title.length > TITLE_LENGTH_READ) return title.slice(0, 80);
  const remote = TITLE_REMOTE.exec(title);
  // A leading "Remote" is followed by the job's name, in as many parts as it takes
  // ("Remote Document Review - Verdict Classification Attorney"): nothing to read.
  if (!remote || TITLE_LEADING.test(title.slice(0, remote.index))) return null;
  const before = title.slice(0, remote.index);
  // Inside the label's own bracket, what comes before it: "(Contract, Remote)".
  const open = Math.max(before.lastIndexOf("("), before.lastIndexOf("["));
  const close = Math.max(before.lastIndexOf(")"), before.lastIndexOf("]"));
  const inside = open > close ? before.slice(open + 1) : "";
  const split = (text: string) => text.replace(TITLE_NOISE, " ").split(TITLE_SEPARATOR)
    .map(part => part.trim()).filter(part => part.length > 0);
  const unread = [...split(inside), ...split(title.slice(remote.index + remote[0].length))]
    .filter(part => !titlePartAllowed(part));
  return unread[0] ?? null;
}
// The title's remote LABEL: "(Remote)", "[Remote]", "- Remote" at the end, "· Remote",
// "Remote/Travel", "- 100% Remote - US". A word that starts a job name ("Remote Sensing
// Scientist") or a compound ("Remote-First Company", "Remote-friendly") is not one.
const REMOTE_TITLE = /(?:^|[([|,/·-]\s*|\b(?:fully|100\s?%)\s+)remote(?=\s*$|\s*[)\]|,/·]|\s+-)/iu;
// Remote statements in the text about this posting's work mode. "Remote-first" is a
// company's culture, not this role's arrangement, and does not confirm on its own.
const REMOTE_TEXT = [
  /\b(?:fully|100\s?%|completely|entirely|permanently)[ -]remote\b/iu,
  /\bremote[- ]only\b/iu,
  /\bwork(?:ing)? from anywhere\b/iu,
  /\b(?:this|the) (?:role|position|job|opportunity) is (?:a )?(?:fully )?remote\b/iu,
  /\bremote (?:role|position|job|opportunity)\b/iu,
  /\blocation\s*:\s*(?:fully\s+)?remote\b/iu,
] as const;
// Remote for a while, in the title or the text. Read whether or not the posting is
// confirmed (B65): an office word in a temporarily remote posting must not lift it from
// excluded to needs-review.
const TEMPORARY_TEXT = [
  /\bremote until .{0,40}office/iu, /\btemporarily remote\b/iu,
  /\binitially remote\b|\bremote (?:for now|initially|at first|to start)\b/iu,
] as const;

// Unicode hyphens and dashes read as "-" and a soft hyphen as nothing, so "on\u2011site"
// (U+2011) or "on\u00adsite" cannot pass patterns written with an ASCII hyphen. The
// evidence quote is taken from this folded text.
function foldDashes(text: string): string {
  return text.replace(/\u00ad/gu, "").replace(/[\u2010-\u2015\u2212]/gu, "-");
}

// Office words are also read in a normalised copy (B65): compatibility forms folded (NFKC:
// the "ﬃ" ligature, full-width letters) and invisible characters removed, so "hy\u200bbrid" or
// "on\u2060site" cannot split a word. A remote confirmation reads only the folded text, so the
// copy can only hide a posting, never show one.
function normalized(text: string): string {
  return foldDashes(text.replace(/[\u200b-\u200d\u2060\ufeff\u180e]|\u034f/gu, "").normalize("NFKC"));
}

function firstMatch(patterns: readonly RegExp[], ...views: readonly string[]): string | null {
  for (const view of views) {
    for (const pattern of patterns) {
      const match = pattern.exec(view);
      if (match) return match[0];
    }
  }
  return null;
}

// B72: an arrangement statement in the text is read in its sentence. Wording about the
// company, about other roles, a condition, an option, a perk or a preference does not state
// this role's arrangement, so it does not exclude: it is an office word (tier 2), and the
// posting waits for review. It can never confirm one. A statement about the role still
// excludes, and so does any other statement in the text.
// What is read: the sentence up to the statement (at most SENTENCE_BEFORE characters) and
// after it (at most SENTENCE_AFTER). A sentence ends at ". ", "! ", "? ", "; " or a line
// break; an abbreviation ("U.S. Remote") cuts it short, so fewer words are read on that side
// (fewer markers, and fewer office words for the presence check below). Either way the
// posting stays out of the main catalog.
const SENTENCE_BEFORE = 160;
const SENTENCE_AFTER = 120;
const SENTENCE_END = /[.!?;](?:\s|$)|\n/u;
// Remote work as one of several modes: "remote and hybrid", "on-site, in a hybrid model, or
// fully remotely", "a remote or hybrid position". A menu without remote work in it ("an
// on-site or hybrid role") is not one, nor is a remote culture ("remote-first culture").
const REMOTE_MODE = String.raw`(?:(?:fully|100\s?%)[- ])?(?:remote(?:ly)?|distributed|work(?:ing)? from (?:home|anywhere))(?![- ](?:first|friendly)\b)`;
const BESIDE = String.raw`\s*(?:,\s*(?:(?:and|or)\s+)?|(?:and\/or|and|or|&|\/)\s*)(?:(?:in|on)\s+)?(?:an?\s+)?`;
const REMOTE_BEFORE = new RegExp(String.raw`(?<![\p{L}\p{N}])${REMOTE_MODE}(?:\s+work(?:ing)?)?${BESIDE}$`, "iu");
// Not the breakdown of a hybrid week (reviews of cycles 0 and 1): "a hybrid role, remote 2
// days a week", "working from home on Mondays", "remote work is permitted up to two days per
// week", "remote twice a week", "remote most days", "remote on alternate weeks", "remote work
// is allowed occasionally".
const NOT_A_BREAKDOWN = String.raw`(?![^.;!?]{0,40}?(?:(?<![\p{L}\p{N}])(?:\d+|one|two|three|four|five)\s*(?:-\s*\d+\s*)?(?:days?|times?)(?![\p{L}\p{N}])|\b(?:mon|tues|wednes|thurs|fri)days?\b|\b(?:twice|once|most days|some days|alternate|every other|half (?:of )?the|occasional(?:ly)?)\b))`;
const REMOTE_AFTER = new RegExp(String.raw`^(?:\s+(?:work(?:ing)?|model|arrangements?|options?|roles?|positions?|setup|schedule))?${BESIDE}${REMOTE_MODE}(?![\p{L}\p{N}])${NOT_A_BREAKDOWN}`, "iu");
// An option: "an opportunity to work a hybrid schedule", "optional in-office days", "hybrid
// work options", "hybrid work arrangements, where possible". Not "the ability" or "the
// flexibility" to work one, and nothing the sentence requires ("must have …").
const OPTION_BEFORE = /(?:\b(?:options?|opportunit(?:y|ies)|choice|possibility)\s+(?:(?:to|for)\s+)?(?:work\s+)?(?:(?:in|on)\s+)?(?:an?\s+)?|\boptional\s+)$/iu;
const OPTION_AFTER = /^(?:\s+(?:work(?:ing)?|model|schedule|arrangements?))?,?\s+(?:options?|opportunities|where possible|if (?:preferred|desired|you prefer)|(?:is|are) (?:also )?(?:an? )?(?:option|optional|possible))\b/iu;
// A bare "required" is not one ("No relocation required, with optional in-office days").
const REQUIREMENT = /\b(?:requires?|required to|must|needs? to|expected to|mandatory)\b/iu;
// Some other roles, as the sentence's subject: "Some roles in our GTM team", "many
// positions", "Positions that are not required to be onsite …". Not "other teams", "most
// roles" or "other roles", which are about this role too (review of cycle 0), and not when a
// contrast follows before the statement: "Many of our roles are remote, but this is a hybrid
// role", "While many positions are remote, this one requires …" (review of cycle 1).
const CONTRAST = /\b(?:but|however|whereas|yet|this\s+(?:is|one|role|position|job)|you(?:['’]ll|\s+will))\b/iu;
const SOME_ROLES = [
  /\b(?:some|many|certain|select)\s+(?:of\s+(?:our|the)\s+)?(?:roles|positions|jobs|openings)\b/iu,
  /^\W*(?:positions|roles|jobs)\s+(?:that|which)\b/iu,
] as const;
// A condition, anywhere in the sentence before: "If this role is remote, there will be …",
// "If you are based within 35 miles of …", "For employees near an office, …"; or "if this "
// right before "role is hybrid".
const CONDITIONS = [
  /\b(?:if|when|whether|unless)\s+(?:(?:this|the|a|your)\s+(?:role|position|job)\s+is\b|you\s+(?:(?:are\s+)?(?:based|located)|live|reside)\s+(?:within|near|in|close to|around)\b)/iu,
  /\bfor\s+(?:those|candidates|employees|people|team members|staff)\b[^.;!?]{0,30}?\b(?:near|within|close to)\b/iu,
] as const;
const IF_THIS = /\b(?:if|when|whether|unless)\s+(?:this|the|a|your)\s+$/iu;
const ROLE_FIRST = /^(?:role|position|job)\b/iu;
// A sentence whose subject is this role is about the role, whatever else it says: "Some roles
// … are hybrid, and this role is a hybrid role", "This role follows our hybrid work model",
// "This position is subject to Acme's hybrid work policy". A condition ("if this role is")
// is not one, nor is a sentence that states the role remote ("This position is 100%
// remote, with an opportunity to work a hybrid schedule", review of cycle 1).
const ROLE_IS_REMOTE = /\b(?:this|the|your)\s+(?:role|position|job)\s+is\s+(?:an?\s+)?(?:(?:fully|100\s?%|completely|entirely)\s+)?remote\b/iu;
const ROLE_SUBJECT = /(?<!\b(?:if|when|whether|unless)\s+)\b(?:this|the|your)\s+(?:role|position|job)\s+(?:is|will|would|requires?|follows?|includes?|offers?|operates?|has|involves?|can|must|sits|comes)\b/iu;
// Negated, or the candidate's preference: "This is not a hybrid role" (unless presence
// follows: "This is not a hybrid role; it is fully on-site"), "if you prefer an in-person
// role over remote"; not the employer's ("We prefer a hybrid schedule").
const NEGATED_BEFORE = /(?:\b(?:not|never)|n['’]t)\s+(?:be\s+)?(?:an?\s+)?$/iu;
const PREFERENCE_BEFORE = /\b(?:you|candidates?|applicants?|people|those)\s+(?:who\s+)?(?:\p{L}+\s+)?prefer(?:s|red)?\s+(?:an?\s+)?$/iu;
// Only for a bare "hybrid work / working / model / …" phrase: the company's own model ("In
// our hybrid work environment", "Acme's hybrid working model"), not hiring for it ("based
// in Dublin for our hybrid working model"), adopting or joining it ("part of our", "subject
// to Acme's", "in line with our", "You'll join our") or the role's own ("This role's hybrid
// work model"); or a perk
// ("Benefits: Hybrid working model", "competitive compensation, hybrid work model, and …").
const BARE_HYBRID = /^hybrid (?:work|working|schedule|model|setup|set-up|arrangement|policy|opportunity)$/iu;
const COMPANY_OWNER = /(?<!\b(?:for|follows?|following|of|to|under|with|within|per|join(?:s|ing)?)\s+)(?<![\p{L}\p{N}&.'’-])(?!(?:role|position|job)['’]s)(?:our|its|their|\p{L}[\p{L}\p{N}&.-]{0,40}['’]s)\s+(?:(?:flexible|collaborative)\s+)?$/iu;
const COMPANY_MODEL = /^hybrid\s+(?:work(?:ing)?\s+)?(?:model|environment|policy|approach|culture|framework|philosophy|programm?e?|structure|strategy|workplace|setup|set-up)\b/iu;
const PERK = String.raw`(?:compensation|salary|salaries|pay|bonus(?:es)?|equity|stock options|benefits?|perks?|insurance|health(?:care)?|dental|vision|pto|paid time off|time off|holidays?|vacation|leave|401\(?k\)?|pension|retirement|stipends?|allowances?|meals?|lunch(?:es)?|snacks?|gym|wellness|well-?being|career growth|growth|learning|training|development|equipment|laptop)`;
const PERKS_HEADER = /\b(?:benefits?|perks?|what we offer|we offer|what['’]s in it for you|why (?:join|work)|we provide)\b/iu;
const PERK_BEFORE = new RegExp(String.raw`\b${PERK}\s*[,;+&]\s*(?:and\s+)?(?:an?\s+)?(?:flexible\s+)?$`, "iu");
const PERK_AFTER = new RegExp(String.raw`^(?:\s+(?:work(?:ing)?|model|arrangements?|setup))?\s*[,;+&]\s*(?:and\s+)?(?:[\p{L}-]+\s+){0,3}?${PERK}\b`, "iu");
// A model, a perk or a negation that names presence is the role's arrangement: "Hybrid
// working (3 days in our Cardiff office)", "Our hybrid work model … three days a week in our
// Lisbon office", "We offer a hybrid work schedule; you'll be in the office Monday to
// Wednesday". Presence is read in the raw text after it (PRESENCE_AFTER characters, across
// sentence ends). So is the role's own location or work-model line, with or without a colon
// ("Location: London (hybrid working model)", "Work model Hybrid schedule"), read in the raw
// LOCATION_BEFORE characters before it, so an abbreviation ("Washington, D.C. (our hybrid
// work model)") cannot cut it off.
const PRESENCE_AFTER = 160;
const LOCATION_BEFORE = 50;
const ROLE_LOCATION = /\b(?:location|work(?:ing)?\s+(?:model|arrangements?|mode|style|location|type|setup)|workplace\s+type)\b/iu;

function aboutTheCompany(text: string, index: number, quote: string): boolean {
  const end = index + quote.length;
  const before = text.slice(Math.max(0, index - SENTENCE_BEFORE), index).split(SENTENCE_END).slice(-1).join("");
  const after = text.slice(end, end + SENTENCE_AFTER).split(SENTENCE_END, 1).join("");
  const presence = () => firstMatch(OFFICE_WORDS, before.slice(-60), text.slice(end, end + PRESENCE_AFTER)) !== null;
  // Remote work beside it, a condition, or the candidate's preference: never about the role.
  if (REMOTE_BEFORE.test(before) || REMOTE_AFTER.test(after) ||
    CONDITIONS.some(pattern => pattern.test(before)) || (IF_THIS.test(before) && ROLE_FIRST.test(quote)) ||
    PREFERENCE_BEFORE.test(before) || (NEGATED_BEFORE.test(before) && !presence())) {
    return true;
  }
  // The rest yields to a sentence about this role, unless it says the role is remote.
  if (ROLE_SUBJECT.test(before) && !ROLE_IS_REMOTE.test(before)) return false;
  if (SOME_ROLES.some(pattern => someOtherRoles(pattern, before)) ||
    ((OPTION_BEFORE.test(before) || OPTION_AFTER.test(after)) && !REQUIREMENT.test(before))) {
    return true;
  }
  if (!BARE_HYBRID.test(quote)) return false;
  const companyModel = COMPANY_OWNER.test(before) && COMPANY_MODEL.test(`${quote}${after}`);
  const perk = PERKS_HEADER.test(before) || PERK_BEFORE.test(before) || PERK_AFTER.test(after);
  return (companyModel || perk) && !presence() &&
    !ROLE_LOCATION.test(text.slice(Math.max(0, index - LOCATION_BEFORE), index));
}

// A subset phrase with no contrast between it and the statement.
function someOtherRoles(pattern: RegExp, before: string): boolean {
  const match = pattern.exec(before);
  return match !== null && !CONTRAST.test(before.slice(match.index + match[0].length));
}

// Tier 1 in the text: the first statement of an arrangement that is about the role, or the
// first negation, in the order the patterns were always read (so an unaffected posting keeps
// its quote); and the first statement that was about the company, which is an office word.
function readStatements(views: readonly string[]): Readonly<{ office: string | null; companyLevel: string | null }> {
  let companyLevel: string | null = null;
  for (const view of views) {
    for (const pattern of ARRANGEMENT_STATEMENTS) {
      for (const match of view.matchAll(pattern)) {
        if (!aboutTheCompany(view, match.index, match[0])) return { office: match[0], companyLevel };
        companyLevel ??= match[0];
      }
    }
    const negation = firstMatch(NEGATED_REMOTE, view);
    if (negation !== null) return { office: negation, companyLevel };
  }
  return { office: null, companyLevel };
}

/**
 * Tiers 1 and 2 of the rule, and temporary remote work: what a posting's title and text
 * say against remote work. `office` is a statement (the posting is excluded), `officeWord`
 * any other office vocabulary (it waits for review), each the quote that matched or null.
 * Shared with RemoteJobs.org (S1-007, owner decision 2 of 2026-11-07: the source's remote
 * filter plus this veto), so both sources read one rule.
 */
export function readOfficeVocabulary(rawTitle: string, rawText: string): Readonly<{
  office: string | null; officeWord: string | null; temporary: string | null;
}> {
  // The folded text first, so a quote keeps the posting's own characters.
  const titles = [foldDashes(rawTitle), normalized(rawTitle)];
  const texts = [foldDashes(rawText), normalized(rawText)];
  const titleOffice = firstMatch(OFFICE_TITLE, ...titles);
  const { office: textOffice, companyLevel } = titleOffice === null
    ? readStatements(texts) : { office: null, companyLevel: null };
  const office = titleOffice ?? textOffice;
  // A statement about the company (B72) is an office word: it blocks a confirmation.
  const officeWord = office === null
    ? firstMatch(OFFICE_WORDS, ...titles) ?? firstMatch(TITLE_QUALIFIERS, ...titles) ??
      titles.map(unverifiedTitleQualifier).find(qualifier => qualifier !== null) ??
      companyLevel ?? firstMatch(OFFICE_WORDS, ...texts)
    : null;
  const temporary = office === null
    ? firstMatch(TEMPORARY_TEXT, ...titles) ?? firstMatch(TEMPORARY_TEXT, ...texts)
    : null;
  return { office, officeWord: officeWord ?? null, temporary };
}

// The feed's name ("Remote Jobs API") is the source's claim that a posting is remote;
// the posting's own words decide whether that claim is confirmed, contradicted or open.
// Exported so a re-map of stored postings reads this rule, not a copy of it.
export function remoteFirstJobsWorkplace(rawTitle: string, rawText: string, evidenceId: string, recordId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  const title = foldDashes(rawTitle);
  const text = foldDashes(rawText);
  const { office, officeWord, temporary } = readOfficeVocabulary(rawTitle, rawText);
  const remote = office === null && officeWord === null
    ? REMOTE_TITLE.exec(title)?.[0]?.replace(/^[([|,/·-]?\s*/u, "") ?? firstMatch(REMOTE_TEXT, text)
    : null;
  const state: Workplace["verification_state"] =
    office !== null ? "conflicting" : remote !== null ? "confirmed" : "unknown";
  const quote = office ?? officeWord ?? remote ?? temporary;
  return {
    workplace: {
      type: "remote",
      // An office word leaves the source's claim unverified (needs-review), not refuted.
      permanence: office !== null ? "unknown" : temporary !== null ? "temporary" : "permanent",
      mandatory_onsite: office !== null ? "required" : officeWord !== null ? "unknown" : "not_stated",
      mandatory_travel: "not_stated",
      optional_offsites: null,
      verification_state: state,
      evidence_ids: [evidenceId],
    },
    conflict: office !== null ? "remote-claim-vs-office-text" : null,
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId,
      origin_version: 1,
      field_path: quote !== null ? "title+description" : "feed:remote-jobs-api",
      quote,
      method: "rule",
      confidence: state === "unknown" ? 0.5 : 0.9,
    },
  };
}

// Up to three country names. They are never a complete list (the feed caps them at
// three), so a candidate elsewhere is unknown, never failed; empty is unspecified,
// never worldwide (the feed does not define it as worldwide).
function geographyFor(raw: RemoteFirstJobsRawRecord, evidenceId: string, recordId: string): {
  geography: Geography; evidence: Evidence;
} {
  if (raw.locations != null && (!Array.isArray(raw.locations) ||
    !raw.locations.every(name => typeof name === "string"))) {
    throw new AdapterInputError("INVALID_LOCATIONS");
  }
  const names = [...new Set((raw.locations ?? []).map(name => name.trim()).filter(name => name.length > 0))];
  const codes = names.map(name => countryCodeOf(name)).filter((code): code is string => code !== null);
  const evidence: Evidence = {
    id: evidenceId, origin_type: "job_source", origin_id: recordId,
    origin_version: 1, field_path: "locations",
    quote: names.length > 0 ? names.join(", ") : null, method: "source_field", confidence: 1,
  };
  const geography: Geography = names.length === 0
    ? {
        scope: "unspecified", allowed_countries: [], excluded_countries: [],
        allowed_subdivisions: [], region_text: null, exhaustive: false, evidence_ids: [evidenceId],
      }
    : {
        scope: "restricted", allowed_countries: [...new Set(codes)], excluded_countries: [],
        allowed_subdivisions: [], region_text: names.join(", "), exhaustive: false,
        evidence_ids: [evidenceId],
      };
  return { geography, evidence };
}

function salaryOf(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AdapterInputError("INVALID_SALARY");
  }
  return value === 0 ? null : value;
}

function publishedAtOf(value: unknown): string {
  if (typeof value !== "string") throw new AdapterInputError("INVALID_PUB_DATE");
  const match = PUBLISHED_AT.exec(value);
  if (!match) throw new AdapterInputError("INVALID_PUB_DATE");
  // Date rolls an impossible calendar time over ("02-30" becomes "03-02"): refuse it.
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as
    [number, number, number, number, number, number];
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new AdapterInputError("INVALID_PUB_DATE");
  }
  // No offset is the live contract and is read as UTC (an assumption: the live check
  // rules out western offsets only); Date would read it as local time.
  const date = new Date(match[7] === undefined ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) throw new AdapterInputError("INVALID_PUB_DATE");
  return date.toISOString();
}

export function mapRemoteFirstJobsRecord(raw: RemoteFirstJobsRawRecord, fetchedAt: string): JobSnapshot {
  // A null or a scalar in the page is one bad record, not a failed run.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdapterInputError("INVALID_RECORD");
  }
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    throw new AdapterInputError("INVALID_ID");
  }
  let listingUrl: URL;
  try {
    listingUrl = new URL(raw.url);
  } catch {
    throw new AdapterInputError("INVALID_URL");
  }
  if (listingUrl.protocol !== "https:" || listingUrl.host !== "remotefirstjobs.com" ||
    listingUrl.port !== "" || listingUrl.username !== "" || listingUrl.password !== "") {
    throw new AdapterInputError("INVALID_URL_HOST");
  }
  // URL parsing drops an empty "?" or "#", so the raw string is checked.
  if (raw.url.includes("?") || raw.url.includes("#")) throw new AdapterInputError("INVALID_URL_PATH");
  // The listing URL names the record it belongs to; a URL to another listing is refused.
  if (!/^\/companies\/[a-z0-9-]{1,120}\/jobs\/[a-z0-9-]{1,120}$/u.test(listingUrl.pathname) ||
    !listingUrl.pathname.endsWith(`/jobs/${raw.id}`)) {
    throw new AdapterInputError("INVALID_URL_PATH");
  }
  if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
    throw new AdapterInputError("EMPTY_TITLE");
  }
  if (typeof raw.company_name !== "string" || raw.company_name.trim().length === 0) {
    throw new AdapterInputError("EMPTY_COMPANY");
  }
  if (typeof raw.description !== "string") throw new AdapterInputError("EMPTY_DESCRIPTION");
  const text = descriptionToText(raw.description);
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");
  const publishedAt = publishedAtOf(raw.published_at);
  const salaryMin = salaryOf(raw.salary_min);
  const salaryMax = salaryOf(raw.salary_max);

  const id = `remote_first_jobs:${raw.id}`;
  const geo = geographyFor(raw, `ev:${id}:geo`, id);
  const workplace = remoteFirstJobsWorkplace(raw.title, text, `ev:${id}:workplace`, id);
  const salaryKnown = salaryMin !== null || salaryMax !== null;
  // The source converts every salary to USD per year (a monthly euro range arrives as
  // its annual dollar value), so the original posting's currency is not recoverable.
  const salaryOriginal = salaryKnown
    ? `${salaryMin ?? "?"}–${salaryMax ?? "?"} USD / annual (converted by the source)`
    : null;
  // Required travel from the title and text (B64-001); the profile decides what it means.
  const travelled = withTravel(workplace.workplace, [geo.evidence, workplace.evidence, ...(salaryKnown ? [{
    id: `ev:${id}:comp`, origin_type: "job_source" as const,
    origin_id: id, origin_version: 1,
    field_path: "salary_min,salary_max", quote: salaryOriginal, method: "source_field" as const,
    confidence: 1,
  }] : [])], readTravel(raw.title.trim(), text), id);
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id,
    version: 1,
    source_record_id: id,
    title: raw.title.trim(),
    company_name: raw.company_name.trim(),
    company_domain: null,
    source_url: listingUrl.href,
    apply_url: null, // direct_apply denied; the listing on Remote First Jobs is the route
    description_text: text,
    description_language: "en",
    workplace: travelled.workplace,
    hiring_options: [{
      id: `opt:${id}:1`,
      geography: geo.geography,
      employment_types: ["unknown"],
      authorization: {
        requirement: "none_stated", authorization_type: "none_stated",
        any_of_countries: [], original_text: null, evidence_ids: [],
      },
      schedule: {
        status: "not_stated", timezone: null, zone_semantics: "not_stated",
        mode: "not_stated", local_windows: [], required_overlap_minutes: null,
        accepted_utc_offsets_minutes: [], original_text: null, evidence_ids: [],
      },
      evidence_ids: geo.geography.evidence_ids,
    }],
    requirements: [],
    compensation: {
      ranges: salaryKnown ? [{
        min: salaryMin === null ? null : String(salaryMin),
        max: salaryMax === null ? null : String(salaryMax),
        currency: "USD",
        period: "annual",
        tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [`ev:${id}:comp`],
      }] : [],
      original_text: salaryOriginal,
      evidence_ids: salaryKnown ? [`ev:${id}:comp`] : [],
    },
    dates: {
      source_published_at: publishedAt,
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: null,
    },
    lifecycle: "active",
    conflicts: workplace.conflict === null ? [] : [workplace.conflict],
    evidence: travelled.evidence,
  };
}

/** The card's excerpt: the feed has none, so the start of the posting text, cut at a word. */
export function remoteFirstJobsExcerptOf(snapshot: JobSnapshot): string {
  const text = snapshot.description_text;
  if (text.length <= EXCERPT_CHARS) return text;
  const cut = text.slice(0, EXCERPT_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function mapRemoteFirstJobsFixture(fetchedAt: string): readonly JobSnapshot[] {
  return remoteFirstJobsContractFixture.map(raw => mapRemoteFirstJobsRecord(raw, fetchedAt));
}
