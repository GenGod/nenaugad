import Link from "next/link";

export function Unavailable({ title, detail }: { title: string; detail: string }) {
  return <section className="empty">
    <p className="overline">Без скрытых заглушек</p>
    <h1>{title}</h1>
    <p>{detail}</p>
    <Link className="btn primary" href="/jobs">Открыть демо-каталог</Link>
    <Link href="/status">Посмотреть этапы разработки →</Link>
  </section>;
}
