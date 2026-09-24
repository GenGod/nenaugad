import Link from "next/link";

export default function Home() {
  return <>
    <section className="hero">
      <div>
        <p className="eyebrow">Удалённая работа. С понятными условиями.</p>
        <h1>Работа, которая<br /><em>совпадает с жизнью.</em></h1>
        <p className="hero-lead">Не просто слово remote. Страна найма, рабочие часы и требования — на виду, а неизвестное не выдаётся за совпадение.</p>
        <div className="actions">
          <Link className="button primary" href="/jobs">Посмотреть демо-каталог <span aria-hidden="true">→</span></Link>
          <Link className="text-link" href="/status">Как устроен старт</Link>
        </div>
        <p className="helper">Это стартовый шаблон для разработки. Все данные ниже — примеры.</p>
      </div>
      <aside className="hero-example" aria-label="Пример карточки условий">
        <div className="example-title"><span className="company-monogram">F</span><span>Fern Labs<span className="source-line">Синтетическая компания</span></span></div>
        <h2>Senior Frontend Engineer</h2>
        <p className="salary">€72 000–90 000 / год</p>
        <div className="example-row"><span>Формат</span><strong>Полностью удалённо</strong></div>
        <div className="example-row"><span>Страны найма</span><strong>По всему миру</strong></div>
        <div className="example-row"><span>Рабочие часы</span><span className="badge review">Не опубликованы</span></div>
        <p className="helper">Совместимость с вашим профилем ещё не оценена. В шаблоне нет авторизации и профилей.</p>
      </aside>
    </section>
    <section className="principles" aria-label="Принципы Atlas">
      <article><span className="eyebrow">01 / Ясность</span><h2>Условия раньше обещаний</h2><p>Полная удалёнка не означает, что нанимают из любой страны.</p></article>
      <article><span className="eyebrow">02 / Контроль</span><h2>Решение остаётся за вами</h2><p>Без автоматической отправки резюме и скрытых откликов.</p></article>
      <article><span className="eyebrow">03 / Основания</span><h2>Неизвестное остаётся видимым</h2><p>Неполные сведения не превращаются в уверенную рекомендацию.</p></article>
    </section>
  </>;
}
