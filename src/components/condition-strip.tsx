import type { RuleOutcome } from "../domain/matching.ts";
import type { StripCell, ZoneStripView } from "../domain/condition-strip.ts";
import type { IconName } from "./icon-registry.generated.ts";
import { Icon } from "./icon.tsx";

// DS-002b, Signal §3/§6: five cells in a fixed order, each with fill, outline, glyph
// and a word for screen readers. An index, not a meter: no counts, nothing fills up.
const GLYPH: Readonly<Record<RuleOutcome, IconName>> = {
  pass: "check", unknown: "help-circle", fail: "close", not_applicable: "minus",
};
const WORD: Readonly<Record<RuleOutcome, string>> = {
  pass: "подходит", unknown: "нужно уточнить", fail: "не подходит", not_applicable: "не применяется",
};

export function ConditionStrip({ cells }: { cells: readonly StripCell[] }) {
  return <ol className="signal-strip" aria-label="Условия по группам">
    {cells.map(cell => <li key={cell.group} className={`signal-cell ${cell.outcome}`} title={cell.explanation}>
      <span className="signal-mark"><Icon name={GLYPH[cell.outcome]} size={14} /></span>
      <span>{cell.label}<span className="sr-only">: {WORD[cell.outcome]}</span></span>
    </li>)}
  </ol>;
}

// The time-zone strip (the honest stand-in for an hours overlap: the data has accepted
// UTC offsets, not team hours). The text line carries the facts; the axis is a picture.
export function ZoneStrip({ view }: { view: ZoneStripView }) {
  return <div className="zone-strip">
    <div className="zone-axis" aria-hidden="true">
      {view.cells.map(cell => <span key={cell.offsetHours}
        className={`zone-cell${cell.offsetHours === 0 ? " utc" : ""}${cell.accepted ? " accepted" : ""}${cell.candidate ? " you" : ""}`} />)}
    </div>
    <p className="zone-text">Принимаемые пояса: <span className="mono">{view.acceptedText}</span>
      {view.summerIncluded ? " · летнее время включено" : ""}
      {" · "}ваш: <span className="mono">{view.candidateText ?? "пояс не задан в профиле"}</span></p>
  </div>;
}
