import Link from "next/link";
export default function Status() {
  return <section className="status-page">
    <p className="eyebrow">Nenaugad / Starter 0.1</p><h1>Небольшой, честный старт.</h1>
    <p className="hero-lead">Один репозиторий, понятные границы и один следующий пользовательский сценарий.</p>
    <div className="status-grid">
      <article className="panel"><span className="badge neutral">В шаблоне</span><h2>Каркас приложения</h2>
        <p>Демо-каталог, поиск, карточка условий, токены Atlas 1.1, фикстуры, SQL-миграция и тестовые команды.</p>
        <p className="helper">Наличие кода не означает, что все проверки выполнены. Точный статус — в reports/DELIVERY.md.</p></article>
      <article className="panel"><span className="badge review">Выключено</span><h2>Реальные данные и AI</h2>
        <p>Нет загрузки CV, аккаунтов, paid API, живых источников и внешних откликов. Один флаг не включает отсутствующую защиту.</p></article>
    </div>
    <ol className="roadmap">
      <li><strong>Принять S0.</strong> Установить зависимости, зафиксировать lockfile и выполнить все проверки.</li>
      <li><strong>Подключить один источник.</strong> Контракт, разрешения, импорт, атрибуция и проверка актуальности.</li>
      <li><strong>Добавить ручной профиль.</strong> Авторизация, доступ владельца и объяснимый подбор.</li>
      <li><strong>Автоматизировать ввод и письмо.</strong> Только после защиты персональных данных и расходов.</li>
    </ol>
    <Link className="button primary" href="/jobs">Открыть каталог</Link>
  </section>;
}
