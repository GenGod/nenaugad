// ESCO skills links and alias delta (ESCO-001; owner decision E.6, 2026-10-02).
//
// Provenance: ESCO REST API v1.1.3 (release notes 28/08/2025) serving dataset
// v1.2.1 — `selectedVersion=v1.2.1`, 13 939 skills in 140 pages, retrieved
// 2026-10-04. The unversioned `latest` selection is a DIFFERENT, smaller set
// (13 485 on the retrieval date). The artifact (full skill documents: preferred
// and alternative labels in all 28 languages, status, description) is fetched
// and sha256-pinned by `npm run esco:fetch`; it is never committed — the pins
// live in data/esco-manifest.json. This module records what a human REVIEWED
// out of that artifact: a partial mapping from our canonical skills to ESCO
// concepts, and the alias additions accepted from ESCO labels.
//
// Licence: ESCO content, © European Union; reuse is authorised provided the
// source is acknowledged (Decision 2011/833/EU; Commission legal notice,
// CC BY 4.0). "This service uses the ESCO classification of the European
// Commission." This module is an ADAPTED version of a small part of ESCO (a
// subset of skill labels reused as aliases) and is marked as such here, in the
// interface footer and in docs/DEPENDENCIES.md. The occupations part of ESCO
// (ISCO-08, © ILO) is explicitly out of scope — nothing here derives from it.
//
// What the review found (2026-10-04, `npm run esco:fetch -- --propose`):
//   * exact preferred-label matches: 36 links (SQL, JavaScript, C#, MySQL,
//     English…), including labels that carry a parenthetical ("Python (computer
//     programming)") and concept labels that equal one of our aliases
//     ("Hadoop" for Big Data);
//   * 14 more links via English alternative labels (the "business intelligence"
//     concept lists "BI"; "ICT encryption" lists "TLS"/"SSL");
//   * ESCO has NO concept for many brand tools (Docker, Kubernetes, Terraform,
//     MongoDB, Redis, AWS/GCP/Azure) — the mapping is honestly partial;
//   * ESCO labels that were REJECTED as false friends, recorded here so the
//     next review does not re-litigate them: ".NET" is an alternative label of
//     the Visual Basic concept, "transformers" of "electrical machines",
//     "Canvas" of a learning-management-system concept; the generic "computer
//     programming" concept carries tool names (AngularJS, OpenCV, bash) as
//     alternative labels, which is why alternative labels are reviewed one by
//     one and never imported wholesale.
//
// Review rules for the delta (mirrors the v2 delta review):
//   * only multi-word English labels are accepted as new aliases — single-word
//     additions are the false-positive class the v2 ambiguity rule exists for
//     (an exception must be listed in AMBIGUOUS_ALIASES with a comment);
//   * an accepted label must be term-like: not an ability sentence ("ability
//     to comprehend spoken and written English…"), not a vendor edition or a
//     historical name — a form a posting or a CV could use as a skill mention;
//   * an accepted alias must not collide with any canonical or alias already
//     in the dictionary;
//   * the additions are measured on the golden set (`npm run eval:matching`):
//     the ratchet floors are a floor, never a ceiling — they may only rise.

export type EscoConceptLink = Readonly<{
  /** Our canonical skill name; must exist in SKILLS_DICTIONARY. */
  canonical: string;
  /** Concept URI in the ESCO skills scheme, as served by the API. */
  uri: string;
  /** Preferred English label of the concept, copied from the artifact. */
  preferredEn: string;
  /** How the link was established (exact label match, parenthetical, ...). */
  matchedVia: string;
}>;

// Reviewed mapping, 2026-10-04: 50 links over 33 of our 83 canonical skills.
// Verified against the artifact by `npm run esco:check` — the recorded label
// must be what the pinned bytes actually serve.
export const ESCO_SKILL_CONCEPTS: readonly EscoConceptLink[] = [
  { canonical: "Accessibility", uri: "http://data.europa.eu/esco/skill/1774bd31-8893-44cf-9498-7e3d95508419", preferredEn: "screen reader", matchedVia: "preferred label equals our alias \"screen reader\"" },
  { canonical: "Analytics", uri: "http://data.europa.eu/esco/skill/143769cb-b61e-47d8-a61e-eedfbec1016c", preferredEn: "business intelligence", matchedVia: "alternative label \"BI\" equals our alias \"bi\"" },
  { canonical: "Android", uri: "http://data.europa.eu/esco/skill/d8829a1d-dbde-435b-b921-29d6462f35c9", preferredEn: "Android (mobile operating systems)", matchedVia: "label minus the parenthetical equals our alias \"android\"" },
  { canonical: "Angular", uri: "http://data.europa.eu/esco/skill/1ffac4ac-fda7-407d-8ed1-ca8f4a8dc146", preferredEn: "Angular", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Ansible", uri: "http://data.europa.eu/esco/skill/6f8a40d6-f9ce-43ec-a72f-d4213a53f3ed", preferredEn: "Ansible", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Automated Testing", uri: "http://data.europa.eu/esco/skill/7557f0f4-b8bc-4ac0-b91e-222ab1ba744f", preferredEn: "tools for ICT test automation", matchedVia: "alternative label \"Selenium\" equals our alias \"selenium\"" },
  { canonical: "Big Data", uri: "http://data.europa.eu/esco/skill/e46291c7-52b9-4174-bd59-178884861038", preferredEn: "Hadoop", matchedVia: "preferred label equals our alias \"hadoop\"" },
  { canonical: "C#", uri: "http://data.europa.eu/esco/skill/4c016b68-4116-468c-9dc6-42710c239e4a", preferredEn: "C#", matchedVia: "preferred label equals our canonical name" },
  { canonical: "C#", uri: "http://data.europa.eu/esco/skill/56a7f561-1d55-43c9-9cd7-36a0a9bc6c50", preferredEn: "ASP.NET", matchedVia: "preferred label equals our alias \"asp.net\"" },
  { canonical: "C++", uri: "http://data.europa.eu/esco/skill/b633eb55-8f1f-4ae6-ab4c-2022ffe2cb7f", preferredEn: "C++", matchedVia: "preferred label equals our canonical name" },
  { canonical: "CI/CD", uri: "http://data.europa.eu/esco/skill/f47a1998-0beb-43be-9f46-380aa4d183da", preferredEn: "Jenkins (tools for software configuration management)", matchedVia: "alternative label \"Jenkins\" equals our alias \"jenkins\"" },
  { canonical: "Computer Vision", uri: "http://data.europa.eu/esco/skill/7b0d5000-00da-4864-b776-6de49a87a669", preferredEn: "computer vision", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Cryptography", uri: "http://data.europa.eu/esco/skill/d32db06e-bd06-4415-a7ab-1b0ee68caa9a", preferredEn: "ICT encryption", matchedVia: "alternative labels \"TLS\"/\"SSL\" equal our aliases \"tls\"/\"ssl\"" },
  { canonical: "Cybersecurity", uri: "http://data.europa.eu/esco/skill/8088750d-8388-4170-a76f-48354c469c44", preferredEn: "cyber security", matchedVia: "preferred label equals our alias \"cyber security\"" },
  { canonical: "Data Engineering", uri: "http://data.europa.eu/esco/skill/48db96bf-3314-45c6-bad8-fdb6e20e5639", preferredEn: "data engineering", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Data Engineering", uri: "http://data.europa.eu/esco/skill/9d0d89be-bffa-4393-b6f6-8d05bea49051", preferredEn: "data extraction, transformation and loading tools", matchedVia: "alternative label \"ETL\" equals our alias \"etl\"" },
  { canonical: "Data Engineering", uri: "http://data.europa.eu/esco/skill/af7ae54f-4649-4c16-87c7-59ba41d4d57f", preferredEn: "SPARK", matchedVia: "preferred label \"SPARK\" equals our alias \"spark\" (case-insensitive)" },
  { canonical: "Data Science", uri: "http://data.europa.eu/esco/skill/7ee4c2ea-b349-4bd2-81a3-ec31475d4833", preferredEn: "statistics", matchedVia: "preferred label equals our alias \"statistics\"" },
  { canonical: "Data Science", uri: "http://data.europa.eu/esco/skill/edebd83d-35f6-4ed5-a940-6c203d178c01", preferredEn: "data science", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Deep Learning", uri: "http://data.europa.eu/esco/skill/5608d5a0-6d5e-43b7-be37-616501729bb4", preferredEn: "artificial neural networks", matchedVia: "alternative label \"neural networks\" equals our alias \"neural networks\"" },
  { canonical: "Deep Learning", uri: "http://data.europa.eu/esco/skill/ecc4552a-92c5-4222-b18d-faf5ac841080", preferredEn: "deep learning", matchedVia: "preferred label equals our canonical name" },
  { canonical: "DevSecOps", uri: "http://data.europa.eu/esco/skill/6f1edc19-191f-4ba5-a048-ee69aff05bab", preferredEn: "security engineering", matchedVia: "preferred label equals our alias \"security engineering\"" },
  { canonical: "English", uri: "http://data.europa.eu/esco/skill/6d3edede-8951-4621-a835-e04323300fa0", preferredEn: "English", matchedVia: "preferred label equals our canonical name" },
  { canonical: "French", uri: "http://data.europa.eu/esco/skill/e747e77e-0ea1-4001-8b07-1d11946b5f1b", preferredEn: "French", matchedVia: "preferred label equals our canonical name" },
  { canonical: "German", uri: "http://data.europa.eu/esco/skill/4812a4ea-dc55-4dc6-b9b0-4a59bba2c647", preferredEn: "German", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Graphic Design", uri: "http://data.europa.eu/esco/skill/7fb699d9-182a-430e-b7a0-6d8ed05c284b", preferredEn: "graphic design", matchedVia: "preferred label equals our canonical name" },
  { canonical: "HTML/CSS", uri: "http://data.europa.eu/esco/skill/1110c92f-3059-445a-9436-0f4200d365f5", preferredEn: "Sass", matchedVia: "preferred label \"Sass\" equals our alias \"sass\"" },
  { canonical: "HTML/CSS", uri: "http://data.europa.eu/esco/skill/c2999f0c-eb37-4cdf-b9b0-82107b628794", preferredEn: "style sheet languages", matchedVia: "alternative label \"CSS\" equals our alias \"css\"" },
  { canonical: "HTML/CSS", uri: "http://data.europa.eu/esco/skill/e5d1f825-60ed-4bdd-872a-e748c387f777", preferredEn: "CSS", matchedVia: "preferred label \"CSS\" equals our alias \"css\"" },
  { canonical: "iOS", uri: "http://data.europa.eu/esco/skill/449d119b-2d66-43a9-9230-7d27f16afbb6", preferredEn: "Xcode", matchedVia: "preferred label \"Xcode\" equals our alias \"xcode\"" },
  { canonical: "iOS", uri: "http://data.europa.eu/esco/skill/be80acfc-b6f2-4411-9b8d-b19d9cd2556a", preferredEn: "Swift (computer programming)", matchedVia: "alternative label \"Swift\" equals our alias \"swift\"" },
  { canonical: "iOS", uri: "http://data.europa.eu/esco/skill/ce26e71f-2d47-474e-89b6-7920931ac4fc", preferredEn: "iOS", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Java", uri: "http://data.europa.eu/esco/skill/19a8293b-8e95-4de3-983f-77484079c389", preferredEn: "Java (computer programming)", matchedVia: "alternative label \"Java\" equals our canonical name" },
  { canonical: "JavaScript", uri: "http://data.europa.eu/esco/skill/3cd569a2-4f88-4c1e-9995-8dce8c5e51a7", preferredEn: "JavaScript", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Machine Learning", uri: "http://data.europa.eu/esco/skill/3a2d5b45-56e4-4f5a-a55a-4a4a65afdc43", preferredEn: "machine learning", matchedVia: "preferred label equals our canonical name" },
  { canonical: "MySQL", uri: "http://data.europa.eu/esco/skill/4da171e5-779c-4983-a76f-91c16751e99f", preferredEn: "MySQL", matchedVia: "preferred label equals our canonical name" },
  { canonical: "NLP", uri: "http://data.europa.eu/esco/skill/fff0e2cd-d0bd-4b02-9daf-158b79d9688a", preferredEn: "natural language processing", matchedVia: "preferred label equals our alias \"natural language processing\"" },
  { canonical: "NoSQL", uri: "http://data.europa.eu/esco/skill/76ef6ed3-1658-4a1a-9593-204d799c6d0c", preferredEn: "NoSQL", matchedVia: "preferred label equals our canonical name" },
  { canonical: "OWASP", uri: "http://data.europa.eu/esco/skill/902fb91c-3113-4004-9b4f-79aa86b638b7", preferredEn: "web application security threats", matchedVia: "alternative label \"OWASP\" equals our canonical name" },
  { canonical: "PHP", uri: "http://data.europa.eu/esco/skill/4350c38d-0fe9-4ca7-bab9-40ed7f72b04f", preferredEn: "PHP", matchedVia: "preferred label equals our canonical name" },
  { canonical: "PostgreSQL", uri: "http://data.europa.eu/esco/skill/a8d07b5a-c1a1-42c6-9d53-db9c7a2ca996", preferredEn: "PostgreSQL", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Project Management", uri: "http://data.europa.eu/esco/skill/7111b95d-0ce3-441a-9d92-4c75d05c4388", preferredEn: "project management", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Project Management", uri: "http://data.europa.eu/esco/skill/bec4359e-cb92-468f-a997-8fb28e32fba9", preferredEn: "ICT project management methodologies", matchedVia: "alternative labels \"Agile\"/\"Scrum\" equal our aliases \"agile\"/\"scrum\"" },
  { canonical: "Python", uri: "http://data.europa.eu/esco/skill/ccd0a1d9-afda-43d9-b901-96344886e14d", preferredEn: "Python (computer programming)", matchedVia: "alternative label \"Python\" equals our canonical name" },
  { canonical: "Ruby", uri: "http://data.europa.eu/esco/skill/0ccdfe98-f845-4598-84a1-3dca66e9d9a3", preferredEn: "Ruby (computer programming)", matchedVia: "alternative label \"Ruby\" equals our canonical name" },
  { canonical: "Russian", uri: "http://data.europa.eu/esco/skill/6891bbce-20bf-4afc-bd5e-75bdf54c0165", preferredEn: "Russian", matchedVia: "preferred label equals our canonical name" },
  { canonical: "SQL", uri: "http://data.europa.eu/esco/skill/598de5b0-5b58-4ea7-8058-a4bc4d18c742", preferredEn: "SQL", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Scala", uri: "http://data.europa.eu/esco/skill/ffddfc7c-a9dd-449f-9e96-882dc447c8b6", preferredEn: "Scala", matchedVia: "preferred label equals our canonical name" },
  { canonical: "Spanish", uri: "http://data.europa.eu/esco/skill/14ee9f76-3524-43d5-8a1a-5ba8283f8bd7", preferredEn: "Spanish", matchedVia: "preferred label equals our canonical name" },
  { canonical: "TypeScript", uri: "http://data.europa.eu/esco/skill/867137fb-ff1b-4ca3-99f3-cb6969aa2c68", preferredEn: "TypeScript", matchedVia: "preferred label equals our canonical name" },
];

// ESCO-derived alias additions, keyed by canonical name (merged into the
// dictionary by skills.ts as v3). Every entry traces to a linked concept above:
//   business intelligence  <- analytics concept "business intelligence" (alt "BI")
//   apache hadoop          <- "Hadoop" concept
//   c sharp                <- "C#" concept (the spelled-out form)
//   information security / it security <- "cyber security" concept
//   statistical analysis   <- "statistics" concept
//   artificial neural networks <- "artificial neural networks" concept
//   supervised/unsupervised/semi-supervised learning <- "machine learning" concept
//   programme management   <- "ICT project management methodologies" concept
export const ESCO_ALIAS_DELTA: Readonly<Record<string, readonly string[]>> = {
  "Analytics": ["business intelligence"],
  "Big Data": ["apache hadoop"],
  "C#": ["c sharp"],
  "Cybersecurity": ["information security", "it security"],
  "Data Science": ["statistical analysis"],
  "Deep Learning": ["artificial neural networks"],
  "Machine Learning": ["semi-supervised learning", "supervised learning", "unsupervised learning"],
  "Project Management": ["programme management"],
};
