# Передача дизайн-системы Ненаугад

> **Superseded (2026-11-02).** This archived handoff describes the 1.3 design system. The
> current appearance is Signal 2.0: `docs/solo/context/NENAUGAD_SIGNAL.md`. Do not apply
> this bundle to the app.

Прочитай README.md, затем NENAUGAD_DESIGN_SYSTEM.md и docs/MIGRATION.md.
Это адаптация Atlas 1.1, не новая логика продукта. Не переписывай приложение.
Сначала открой автономные `nenaugad-ui-kit.html` и `nenaugad-cover-letters.html`.
Галерея иконок находится в `nenaugad-ui-kit.html#icons`.

Подключи токены, исходный логотип, favicon и Icon-компонент в существующий стек.
Используй `icons/manifest.json` как словарь допустимых имён.
Не превращай знак бренда в отметку verified. Сохрани семантику unknown, источник и версии.
Иконка share не разрешает публично делиться резюме, а иконка letter — отправлять письма.

Первая задача разработчика: header + favicon + токены + 5 навигационных/action иконок,
затем проверить 320/390/1440 и клавиатуру. Остальные экраны обновлять по одному.
Правки внутреннего namespace данных, оплачиваемые API и deploy не входят в эту задачу.
Различай визуальный прототип, исходный компонент и реально интегрированный продукт.
