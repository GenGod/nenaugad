// HTML entities in a feed's plain-text field (docs/OPEN_GAPS.md B30). The jobicy feed sends
// its excerpt HTML-escaped ("to&hellip;", "R&amp;D"), and a card must show characters.
//
// One pass: text that was escaped twice keeps its outer escape ("&amp;hellip;" reads
// "&hellip;"), because decoding again would change what the source wrote. Anything that
// is not a known entity — an unknown name, an invalid code point, a bare "&" — stays as
// written rather than being guessed.

const NAMED: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•",
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/gu;

function characterFor(codePoint: number): string | null {
  const valid = codePoint > 0 && codePoint <= 0x10FFFF && (codePoint < 0xD800 || codePoint > 0xDFFF);
  return valid ? String.fromCodePoint(codePoint) : null;
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY, (entity: string, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED[name] ?? entity;
    const codePoint = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? "", 16);
    return characterFor(codePoint) ?? entity;
  });
}
