import Link from "next/link";
export default function NotFound() {
  return <section className="empty"><h1>Вакансия не найдена</h1>
    <p>Она может быть закрыта, исключена из каталога или отсутствовать в демонстрационном наборе.</p>
    <Link className="btn primary" href="/jobs">Вернуться к каталогу</Link></section>;
}
