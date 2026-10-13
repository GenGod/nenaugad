// What is not a vacancy (B40, owner decision 2026-10-13). An invitation to join a
// candidate pool ("Join Our Talent Community", "General Application – …") offers no
// job to apply for: it is not shown, matched or extracted. The rule is a fixed list of
// title phrases, applied on read, so the stored snapshots never change and the rule can.
// Checked on 2026-10-13 against the local catalog's 1398 titles: 5 matches, and no
// "Talent Acquisition", "Talent Sourcer" or "Application Developer" among them.
const TALENT_POOL_TITLE = [
  /\btalent\s+(?:community|pool|network)\b/iu,
  /\b(?:general|open)\s+application\b/iu,
];

export function isTalentPoolTitle(title: string): boolean {
  return TALENT_POOL_TITLE.some(pattern => pattern.test(title));
}
