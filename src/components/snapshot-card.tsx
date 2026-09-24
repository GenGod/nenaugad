import type { SnapshotCardView } from "../server/snapshot-catalog-service.ts";

function geographyLabel(card: SnapshotCardView): string {
  if (card.geography.scope === "worldwide") return "Страны найма: по всему миру (по контракту источника)";
  if (card.geography.scope === "restricted" && card.geography.countries.length > 0) {
    return `Страны найма: ${card.geography.countries.join(", ")}`;
  }
  return "Страны найма не указаны";
}

function publishedDate(card: SnapshotCardView): string {
  return card.publishedAt ? card.publishedAt.slice(0, 10) : "дата не указана";
}

// Card for an approved external source: excerpt only (full text is stored
// but never republished), visible attribution and a backlink to the listing.
export function SnapshotCard({ card }: { card: SnapshotCardView }) {
  return <article className="job-card">
    <div className="card-top">
      <div className="company-monogram" aria-hidden="true">{card.company.slice(0, 1)}</div>
      <div className="card-heading">
        <p className="company">{card.company}</p>
        <h2><a href={card.apply.url} rel="nofollow noreferrer" target="_blank">{card.title}</a></h2>
      </div>
      <span className="badge neutral">Himalayas</span>
    </div>
    <p className="salary">{card.salaryOriginalText ?? "Зарплата не указана"}</p>
    <p className="conditions">{geographyLabel(card)}</p>
    {card.excerpt && <p className="conditions">{card.excerpt}</p>}
    <div className="card-bottom">
      <span className="badge neutral">Показан фрагмент; полностью — на источнике</span>
      <a className="text-link" href={card.apply.url} rel="nofollow noreferrer" target="_blank">
        Открыть на Himalayas <span aria-hidden="true">↗</span>
      </a>
    </div>
    <p className="source-line">
      Источник: Himalayas · листинг от {publishedDate(card)} · данные обновляются ежедневно
    </p>
  </article>;
}
