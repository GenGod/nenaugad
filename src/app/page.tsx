import Link from "next/link";
import { Icon } from "../components/icon.tsx";

export default function Home() {
  return <>
    <section className="hero">
      <div>
        <p className="overline">Подбор с основаниями</p>
        <h1>Выбирать работу.<br /><em>Не наугад.</em></h1>
        <p className="lead">Удалённая работа с понятными условиями: страна найма, рабочие часы
          и обязательные требования стоят рядом с каждым выводом, а неизвестное не выдаётся
          за совпадение.</p>
        <div className="actions">
          <Link className="btn primary large" href="/profile">Подобрать по резюме</Link>
          <Link className="btn secondary large" href="/jobs">Смотреть вакансии</Link>
        </div>
        <p className="privacy"><Icon name="lock" size={16} />
          Вы подтвердите профиль перед подбором. Резюме не отправляется работодателям
          автоматически.</p>
      </div>
      <aside className="proof-shell" aria-label="Пример карты условий">
        <div className="proof-head"><span>Пример</span><span>Карта условий</span></div>
        <div className="proof-card">
          <div className="row">
            <span className="company-mark fern" aria-hidden="true">F</span>
            <div>
              <p className="small secondary">Fern Labs · синтетическая компания</p>
              <h3>Senior Frontend Engineer</h3>
            </div>
          </div>
          <p className="pay money">€72 000–90 000 <small className="small secondary">/ год, до налогов</small></p>
          <div className="proof-rule"><Icon name="check" size={16} />
            <span><strong>Страна найма</strong>По всему миру — по контракту источника</span></div>
          <div className="proof-rule"><Icon name="help-circle" size={16} style={{ color: "var(--amber)" }} />
            <span><strong>Рабочие часы</strong>Не опубликованы — нужно уточнить</span></div>
          <div className="proof-rule"><Icon name="check" size={16} />
            <span><strong>Формат</strong>Постоянная полная удалёнка, без обязательного офиса</span></div>
          <p className="proof-foot">Демонстрационный пример, не реальная вакансия. Персональная
            совместимость появится после подтверждения профиля.</p>
        </div>
      </aside>
    </section>
    <section className="promise-grid" aria-label="Принципы Ненаугад">
      <div className="promise"><Icon name="conditions" />
        <h3>Условия раньше обещаний</h3>
        <p>Полная удалёнка не означает, что нанимают из любой страны.</p></div>
      <div className="promise"><Icon name="shield" />
        <h3>Решение остаётся за вами</h3>
        <p>Без автоматической отправки резюме и скрытых откликов.</p></div>
      <div className="promise"><Icon name="evidence" />
        <h3>Неизвестное остаётся видимым</h3>
        <p>Неполные сведения не превращаются в уверенную рекомендацию.</p></div>
    </section>
  </>;
}
