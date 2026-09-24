# Зависимости и границы проверки

Дата подготовки: 23 сентября 2026. Это не автоматическое подтверждение npm-установки.

| Компонент | Выбранная версия | Основание |
|---|---|---|
| Next.js | 16.3.6 | Официальное сообщение об обновлении безопасности от 22.09.2026 |
| React / React DOM | 19.3.0 | Официальный выпуск React 19.3 и метаданные react/latest |
| pg | 8.23.0 | Страница пакета владельца node-postgres |
| PostgreSQL local image | 17.11-alpine | Ветка 17.11 в официальной документации; image pull ещё не проверен |
| TypeScript | 5.9.3 | Выбрана известная фиксированная версия, не обещание latest |
| Biome | 2.2.4 | Официальный version history |
| Playwright Test | 1.62.1 | Страница пакета Microsoft |
| Рекомендуемый Node | 24.21.0 | Официальный archive ветки 24 |
| Node фактической офлайн-проверки | 22.16.0 | Локальная среда поставки |
| TypeScript ограниченной локальной проверки | 5.8.3 | Уже установленный compiler среды, не полный lock проекта |

Type declarations в package.json — фиксированные стартовые версии.
Peer dependencies, transitive dependencies, установка native binaries и поддержка
всей комбинации должны быть проверены в S0. npm-проба в среде поставки дала
DNS EAI_AGAIN; lockfile и npm audit не выполнялись. Нельзя заявлять отсутствие
уязвимостей по списку direct dependencies.

## Первичные источники
- https://nextjs.org/blog/nextjs-security-update-september-22-2026
- https://nextjs.org/docs/app/getting-started/installation
- https://react.dev/blog/2026/09/09/react-19-3
- https://registry.npmjs.org/react/latest
- https://www.npmjs.com/package/pg
- https://node-postgres.com/features/queries
- https://node-postgres.com/features/transactions
- https://www.postgresql.org/docs/17/
- https://nodejs.org/en/download/archive/v24
- https://nodejs.org/api/typescript.html
- https://biomejs.dev/internals/changelog/version/2-2-4/
- https://www.npmjs.com/package/@playwright/test
- https://nextjs.org/docs/app/guides/testing/playwright

GitHub Actions starter использует major tags checkout/setup-node v4, не выдаёт их
за immutably pinned supply chain. Перед activation рабочего CI проверьте Actions
и закрепите полный актуальный SHA в отдельном reviewed diff. Workflow не имеет
production secrets, write permission или deploy. Не используйте pull_request_target
для запуска кода недоверенного PR.

## Установка
Первый раз `npm install`: реальный dependency resolver создаёт lockfile.
После review/сохранения lockfile — `npm ci`.
Не писать package-lock руками и не скрывать peer conflict опцией --force.
При недоступной выбранной версии проверить официальный registry/release,
предложить совместимую поддерживаемую замену и сохранить причину изменения.
Не откатывать Next на уязвимую версию ради успешного build.
