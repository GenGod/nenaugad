# Покрытие стартового шаблона

| Требование | Сейчас | Ограничение |
|---|---|---|
| SP-T03 права источника | Unit gate разрешает только bundled synthetic catalog | Не проверяет реальную лицензию |
| SP-T04 повторный seed | Написан integration test | PostgreSQL ещё не запускался |
| SP-T06 remote/office | Unit на явных полях synthetic records | Нет текстового extractor |
| SP-T07 неизвестная география | Unit: не worldwide, не personal eligible | Полный eligibility engine не реализован |
| SP-T20 внешний переход | Apply disabled для synthetic | Нет live apply route |
| SP-T21 no AI | Отказ и read-only fixture catalog | Ручной профиль и редактор ещё не созданы |
| SP-T01/02/09 приватность/upload | Не реализовано | Нет соответствующей функции; не принимать личные данные |
| SP-T08 DST/hiring/salary rules | Не реализовано | В шаблоне только публичные labels |
| SP-T10–17 бюджеты/очередь | Не реализовано | Paid transport отсутствует и заблокирован |
| SP-T18–19 letters | Не реализовано | Генерация/редактор не подключены |
| SP-T22 restore | Не реализовано | Обязателен до beta |

Все статусы «не реализовано» являются gating backlog, не пройденной проверкой по
принципу «нет функции — нет ошибки». Перед включением соответствующей функции
появляются реальные отрицательные/integration/fault tests.
