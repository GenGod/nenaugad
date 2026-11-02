// PERF-002: what /jobs shows while the server reads and renders the catalog. Static on
// purpose (Signal §7: nothing moves); the status line is what assistive tech announces.
const ROWS = ["first", "second", "third"] as const;

export default function JobsLoading() {
  return <>
    <header className="page-head">
      <p className="overline">Открытый каталог / демо</p>
      <h1>Все вакансии</h1>
      <p><output>Загружаем вакансии…</output></p>
    </header>
    <div className="job-list" aria-hidden="true">
      {ROWS.map(row => <div key={row} className="job-card loading-row">
        <span className="skeleton short" />
        <span className="skeleton title" />
        <span className="skeleton" />
      </div>)}
    </div>
  </>;
}
