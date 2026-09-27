"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="empty"><h1>Не удалось открыть страницу</h1>
    <p>Проверьте локальную конфигурацию и базу. Содержимое технической ошибки не публикуется.</p>
    <button className="btn secondary" type="button" onClick={reset}>Повторить</button></section>;
}
