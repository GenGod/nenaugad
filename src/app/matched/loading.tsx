// B41: the matched page reads and evaluates the whole catalog, which takes a few
// seconds the first time after the server starts. This shows at once on navigation,
// so «Открыть подбор» is never a click that appears to do nothing.
export default function MatchedLoading() {
  return <section aria-busy="true" aria-live="polite">
    <header className="page-head">
      <p className="overline">Подбор с основаниями</p>
      <h1>Подбираем вакансии</h1>
      <p>Сверяем опубликованные условия вакансий с вашим профилем — это может занять несколько секунд.</p>
    </header>
    <div className="skeleton" style={{ height: 96 }} />
    <div className="skeleton" style={{ height: 96 }} />
    <div className="skeleton" style={{ height: 96 }} />
  </section>;
}
