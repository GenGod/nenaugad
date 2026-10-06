import type { SnapshotCardView } from "../server/snapshot-catalog-service.ts";
import { firstSeenLabel } from "../domain/freshness.ts";
import { hiringCountriesText } from "../domain/snapshot-projection.ts";
import { availabilityNoteFor } from "../domain/survival.ts";
import { Icon } from "./icon.tsx";

function geographyLabel(card: SnapshotCardView): string {
  if (card.geography.scope === "worldwide") return "По всему миру (по контракту источника)";
  const countries = hiringCountriesText(card.geography);
  if (card.geography.scope === "restricted" && countries !== null) return `Страны найма: ${countries}`;
  return "Страны найма не указаны";
}

function publishedDate(card: SnapshotCardView): string {
  return card.publishedAt ? card.publishedAt.slice(0, 10) : "дата не указана";
}

// Card for an approved external source: excerpt only (full text is stored
// but never republished), visible attribution and a backlink to the listing.
// The age line reports when OUR pipeline first saw the posting (item A5), not a
// claimed publication date — the label is built by src/domain/freshness.ts.
export function SnapshotCard({ card, now }: { card: SnapshotCardView; now: string }) {
  const age = firstSeenLabel(card.firstSeenAt, now);
  // Items A10/B7/B6: an unconfirmed posting is still shown, but the candidate is
  // told — and a posting that has been in the catalog for months gets the soft
  // age caution. One honest source of the line (src/domain/survival.ts), not a
  // silent demotion.
  const availabilityNote = availabilityNoteFor(card.firstSeenAt, now, card.closure);
  return <article className="job-card">
    <div className="job-top">
      <span className="company-mark" aria-hidden="true">{card.company.slice(0, 1)}</span>
      <div className="job-title-area">
        <p className="company">{card.company}</p>
        <h3><a href={card.apply.url} rel="nofollow noreferrer" target="_blank">{card.title}</a></h3>
      </div>
      <span className="badge neutral">{card.source.displayName}</span>
    </div>
    <p className="salary money">{card.salaryOriginalText ?? "Зарплата не опубликована"}</p>
    <div className="job-facts">
      <span><Icon name="globe" />{geographyLabel(card)}</span>
      <span><Icon name="info" />Показан фрагмент; полностью — на источнике</span>
      {age !== null && <span><Icon name="clock" />{age}</span>}
    </div>
    {availabilityNote !== null && <p className="small secondary" style={{ marginTop: 4 }}>
      <Icon name="help-circle" size={16} /> {availabilityNote}
    </p>}
    {card.excerpt && <p className="job-reason">{card.excerpt}</p>}
    <p className="source"><Icon name="source" size={16} />
      Источник: {card.source.displayName} · листинг от {publishedDate(card)} · данные обновляются регулярно ·
      {" "}<a className="source-link" href={card.apply.url} rel="nofollow noreferrer" target="_blank">
        Открыть на {card.source.displayName}</a></p>
    {/* Cross-source provenance (item A4): the same posting on other boards is
        shown once, but never at the cost of the other source's attribution —
        each one keeps its own named backlink. */}
    {card.alsoListedAt.length > 0 && <p className="source">
      Та же вакансия также на: {card.alsoListedAt.map((listing, index) => <span key={listing.sourceId}>
        {index > 0 ? ", " : ""}<a className="source-link" href={listing.url} rel="nofollow noreferrer" target="_blank">{listing.displayName}</a>
      </span>)}</p>}
  </article>;
}
