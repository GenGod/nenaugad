import Link from "next/link";

export function Unavailable({ title, detail }: { title: string; detail: string }) {
  return <section className="empty-state">
    <p className="eyebrow">Без скрытых заглушек</p>
    <h1>{title}</h1>
    <p>{detail}</p>
    <Link className="button primary" href="/jobs">Открыть демо-каталог</Link>
    <Link className="text-link" href="/status">Посмотреть этапы разработки</Link>
  </section>;
}
