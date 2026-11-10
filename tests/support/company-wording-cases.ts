// B72-001: office statements about the company, other roles, a condition, an option, a perk
// or a preference, against statements about the role itself. Shared by the Remote First
// Jobs and RemoteJobs.org tests (both read `readOfficeVocabulary`). Every text is synthetic,
// modelled on postings of the first live RemoteJobs.org run (S1-007); the live wording is
// paraphrased and the employers' names replaced.

export type CompanyWordingCase = Readonly<{
  text: string;
  outcome: "needs_review" | "excluded";
  // The workplace evidence quote: the office statement that sent it where it is.
  quote?: string;
}>;

// A perks list, flattened as the source's text is: "Remote and hybrid work options".
export const PERKS_MENU_TEXT = "401(k) plan with company match Tuition reimbursement Remote and hybrid work options Equal Employment Opportunity at Acme";

// Wording about the company or other roles: the posting waits for review.
export const COMPANY_WORDING_REVIEW: readonly CompanyWordingCase[] = [
  // Remote work named beside it: a menu of the company's work modes.
  { text: PERKS_MENU_TEXT, outcome: "needs_review", quote: "hybrid work" },
  { text: "Award-winning time-off plans. Flexible work models, including remote and hybrid work arrangements, where possible.", outcome: "needs_review", quote: "hybrid work" },
  { text: "Our goal is that everyone can contribute, whether they are working on-site, in a hybrid model, or fully remotely.", outcome: "needs_review", quote: "hybrid model" },
  { text: "This is a remote or hybrid position.", outcome: "needs_review", quote: "hybrid position" },
  // An option.
  { text: "This is a 100% remote position from select locations, with an opportunity to work a hybrid schedule for candidates who live near our headquarters in Chicago.", outcome: "needs_review", quote: "hybrid schedule" },
  { text: "We're a remote-first workplace with optional in-office days in Boston and Denver.", outcome: "needs_review", quote: "in-office days" },
  // Other roles, or a condition.
  { text: "Remote-first work environment *Some roles in our GTM team are currently being hired for in-person hybrid work in Toronto and Austin. These roles will specify on the posting.", outcome: "needs_review", quote: "hybrid work" },
  { text: "For hybrid roles: if this role is hybrid, you will live within commutable distance of the office.", outcome: "needs_review", quote: "role is hybrid" },
  { text: "For remote roles: if this role is remote, there will be in-office events that require travel to our Toronto office.", outcome: "needs_review", quote: "will be in-office" },
  { text: "This role can be performed remotely within the United States. If you are based within 35 miles of our Oakland office, you will be expected to be in-office 2 days / week.", outcome: "needs_review", quote: "in-office 2 days" },
  // Negated, or the candidate's preference.
  { text: "Positions that are not required to be onsite to support a client may offer the ability to work remotely or hybrid at an office location.", outcome: "needs_review", quote: "required to be onsite" },
  { text: "This is not a hybrid role; you can work from anywhere in Canada.", outcome: "needs_review", quote: "hybrid role" },
  { text: "You might not be a great fit if you prefer an in-person role over remote.", outcome: "needs_review", quote: "in-person role" },
  // The company's own model, or a perk, for a bare "hybrid work / working / model" phrase.
  { text: "In our hybrid work environment, we provide the flexibility to thrive, working virtually when it's productive.", outcome: "needs_review", quote: "hybrid work" },
  { text: "Learn more about Acme's hybrid working model and benefits here.", outcome: "needs_review", quote: "hybrid working" },
  { text: "What you'll get: competitive compensation, hybrid work model, and strong career growth. What we offer: a fully remote setup, work from anywhere in Europe.", outcome: "needs_review", quote: "hybrid work" },
  { text: "Benefits: Hybrid working model, 25 days' holiday, private medical cover.", outcome: "needs_review", quote: "Hybrid working" },
  // From the re-review of cycle 1 (repair cycle 2): a role stated remote keeps its option.
  { text: "This position is 100% remote, with an opportunity to work a hybrid schedule for candidates who live near our headquarters.", outcome: "needs_review", quote: "hybrid schedule" },
  { text: "This role is fully remote, with the option to work a hybrid schedule from our Chicago office.", outcome: "needs_review", quote: "hybrid schedule" },
  { text: "The role is remote-first with optional in-office days in Boston.", outcome: "needs_review", quote: "in-office days" },
  { text: "No relocation required, with optional in-office days in Denver.", outcome: "needs_review", quote: "in-office days" },
];

// A statement about the role's own arrangement still excludes, even beside company wording.
export const ROLE_STATEMENT_EXCLUDED: readonly CompanyWordingCase[] = [
  { text: "This part-time in-person role supports our new infusion centers.", outcome: "excluded", quote: "in-person role" },
  { text: "This is a hybrid role based in Austin.", outcome: "excluded", quote: "hybrid role" },
  { text: "The role is hybrid.", outcome: "excluded", quote: "role is hybrid" },
  { text: "Expect 3 days a week in the Austin office.", outcome: "excluded", quote: "days a week in the Austin office" },
  // Hiring for the company's model is the role's arrangement.
  { text: "We are looking to speak to candidates who are based in Dublin for our hybrid working model.", outcome: "excluded", quote: "hybrid working" },
  // A perk or the company's model that names presence.
  { text: "Benefits: Hybrid working (3 days in our Cardiff office), 25 days' holiday.", outcome: "excluded", quote: "Hybrid working" },
  { text: "Our hybrid work model combines remote work with three days a week in our Lisbon office.", outcome: "excluded" },
  { text: "The Acme Hybrid Work Model: we all gather in the office three days a week.", outcome: "excluded" },
  // A menu without remote work in it.
  { text: "This is an on-site or hybrid role.", outcome: "excluded", quote: "hybrid role" },
  // Company wording beside a statement about the role.
  { text: "Remote and hybrid work options. This is a hybrid role in Austin.", outcome: "excluded", quote: "hybrid role" },
  { text: "Remote and hybrid work options. Expect 3 days a week in the Austin office.", outcome: "excluded", quote: "days a week in the Austin office" },
  // Negations and temporary remote work are untouched.
  { text: "Remote and hybrid work options. This is not a remote position.", outcome: "excluded", quote: "not a remote" },
  { text: "Remote and hybrid work options. This role is temporarily remote.", outcome: "excluded" },
  // From the review of cycle 0 (repair cycle 1). Other teams, or a company-wide "most roles",
  // in a flattened bullet list or in the same sentence are not other roles' arrangement.
  { text: "Collaborate with other teams across the company Requirements 5+ years of experience in Python Expect 3 days a week in the Austin office", outcome: "excluded", quote: "days a week in the Austin office" },
  { text: "Partner with product and other teams to deliver features Mentor junior engineers Work Arrangement This is a hybrid role based in Austin", outcome: "excluded", quote: "hybrid role" },
  { text: "Work with cross-functional partners and select teams across Engineering Hybrid role based in Boston 3 days a week in the Boston office", outcome: "excluded" },
  { text: "Like most roles at Acme, this is a hybrid role with 3 days a week in our SF office.", outcome: "excluded", quote: "hybrid role" },
  { text: "You will partner with other teams and are expected to work in the office 3 days a week.", outcome: "excluded" },
  { text: "Unlike other roles on our team, this is a hybrid role based in NYC.", outcome: "excluded", quote: "hybrid role" },
  { text: "Some roles in our GTM team are hired for hybrid work in Toronto, and this role is a hybrid role in Toronto.", outcome: "excluded", quote: "hybrid role" },
  // A requirement is not an option.
  { text: "This position requires the ability to work a hybrid schedule in our Denver office.", outcome: "excluded", quote: "hybrid schedule" },
  { text: "Must have the ability to work a hybrid schedule.", outcome: "excluded", quote: "hybrid schedule" },
  { text: "You'll have the flexibility to work a hybrid schedule (3 days in office, 2 days remote).", outcome: "excluded", quote: "hybrid schedule" },
  // The role follows the company's model.
  { text: "This role follows our hybrid work model. Team members are in the office Tuesday through Thursday.", outcome: "excluded", quote: "hybrid work" },
  { text: "This position is subject to Acme's hybrid work policy. Employees work from our Austin office on Tuesdays and Wednesdays.", outcome: "excluded", quote: "hybrid work" },
  { text: "This role is part of our hybrid work model; team members are in the office Monday to Wednesday.", outcome: "excluded", quote: "hybrid work" },
  { text: "This role follows our hybrid work model.", outcome: "excluded", quote: "hybrid work" },
  { text: "This role's hybrid work model applies. Expect Tuesdays and Thursdays in Austin.", outcome: "excluded", quote: "hybrid work" },
  // A hybrid week's breakdown is not a menu of modes.
  { text: "This is a hybrid role, remote 2 days a week.", outcome: "excluded", quote: "hybrid role" },
  { text: "This is a hybrid role, working from home on Mondays and Fridays.", outcome: "excluded", quote: "hybrid role" },
  { text: "The position is hybrid, and remote work is permitted up to two days per week.", outcome: "excluded", quote: "position is hybrid" },
  // The role's own location or work-model line, and presence in the next clause.
  { text: "Location London, hybrid working model, pension.", outcome: "excluded", quote: "hybrid working" },
  { text: "Benefits Medical, dental and vision 401(k) Work model Hybrid schedule Location Austin", outcome: "excluded", quote: "Hybrid schedule" },
  { text: "We offer a hybrid work schedule; you'll be in the office Monday to Wednesday.", outcome: "excluded", quote: "hybrid work" },
  // A negation of hybrid that states on-site.
  { text: "This is not a hybrid role; it is fully on-site.", outcome: "excluded", quote: "hybrid role" },
  // From the re-review of cycle 1 (repair cycle 2). A contrast with other roles is about this one.
  { text: "Many of our roles are remote, but this is a hybrid role based in Austin.", outcome: "excluded", quote: "hybrid role" },
  { text: "Unlike many of our positions, this is an on-site role.", outcome: "excluded", quote: "on-site role" },
  { text: "While some roles at Acme are remote, this is an in-person role in Denver.", outcome: "excluded", quote: "in-person role" },
  { text: "Some of our jobs are fully remote, but this job is hybrid.", outcome: "excluded", quote: "job is hybrid" },
  { text: "While many positions are remote, this one requires 3 days a week in the Austin office.", outcome: "excluded", quote: "days a week in the Austin office" },
  { text: "Many roles at Acme are remote but you will be expected to work in the office on Tuesdays.", outcome: "excluded" },
  // A hybrid week's breakdown in other words, and a remote culture, are not a menu.
  { text: "This is a hybrid role, remote twice a week.", outcome: "excluded", quote: "hybrid role" },
  { text: "This is a hybrid role, remote most days and in Austin when needed.", outcome: "excluded", quote: "hybrid role" },
  { text: "Hybrid work, remote on alternate weeks, Austin office.", outcome: "excluded", quote: "Hybrid work" },
  { text: "The position is hybrid, and remote work is allowed occasionally.", outcome: "excluded", quote: "position is hybrid" },
  { text: "This is a hybrid role, remote-first culture, based in our Austin office.", outcome: "excluded", quote: "hybrid role" },
  // The employer's preference, presence while in the office, joining the company's model.
  { text: "We strongly prefer a hybrid schedule in our Austin office.", outcome: "excluded", quote: "hybrid schedule" },
  { text: "We prefer an in-person role for this team.", outcome: "excluded", quote: "in-person role" },
  { text: "When you are in the office, you will follow our hybrid work policy.", outcome: "excluded", quote: "hybrid work" },
  { text: "You'll join our hybrid work environment. The team meets in Austin regularly.", outcome: "excluded", quote: "hybrid work" },
  { text: "You'll be joining Acme's hybrid work model and collaborating closely with the Austin team.", outcome: "excluded", quote: "hybrid work" },
  // A location line cut short by an abbreviation.
  { text: "Location: Washington, D.C. (our hybrid work model)", outcome: "excluded", quote: "hybrid work" },
  { text: "Location: St. Louis, MO - our hybrid work model applies", outcome: "excluded", quote: "hybrid work" },
];
