import Link from "next/link";

export default function Status() {
  return <>
    <header className="page-head">
      <p className="overline">Ненаугад / демо-старт</p>
      <h1>Небольшой, честный старт.</h1>
      <p>Один репозиторий, понятные границы и один следующий пользовательский сценарий.</p>
    </header>
    <div className="grid-two">
      <article className="panel"><span className="badge neutral">В шаблоне</span>
        <h2 style={{ fontSize: "1.25rem", margin: "12px 0" }}>Каркас приложения</h2>
        <p className="small secondary">Демо-каталог, поиск, карта условий, токены Ненаугад 1.3,
          иконки, фикстуры, SQL-миграция и тестовые команды.</p>
        <p className="small secondary" style={{ marginTop: 8 }}>Наличие кода не означает, что все
          проверки выполнены. Точный статус — в reports/DELIVERY.md.</p></article>
      <article className="panel"><span className="badge review">Выключено</span>
        <h2 style={{ fontSize: "1.25rem", margin: "12px 0" }}>Реальные данные и AI</h2>
        <p className="small secondary">Live-источники, платные вызовы и внешние отклики выключены
          флагами среды. Один флаг не включает отсутствующую защиту.</p></article>
    </div>
    <section className="prose" style={{ marginTop: 32 }}>
      <h2>Дальше</h2>
      <ol>
        <li><strong>Принять S0.</strong> Установить зависимости, зафиксировать lockfile и выполнить все проверки.</li>
        <li><strong>Подключить один источник.</strong> Контракт, разрешения, импорт, атрибуция и проверка актуальности.</li>
        <li><strong>Добавить ручной профиль.</strong> Авторизация, доступ владельца и объяснимый подбор.</li>
        <li><strong>Автоматизировать ввод и письмо.</strong> Только после защиты персональных данных и расходов.</li>
      </ol>
    </section>
    <div className="row" style={{ marginTop: 24 }}>
      <Link className="btn primary" href="/jobs">Открыть каталог</Link>
    </div>
  </>;
}
