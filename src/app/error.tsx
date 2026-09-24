"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="empty-state"><h1>Не удалось открыть страницу</h1>
    <p>Проверьте локальную конфигурацию и базу. Содержимое технической ошибки не публикуется.</p>
    <button className="button secondary" type="button" onClick={reset}>Повторить</button></section>;
}
