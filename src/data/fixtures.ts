import type { StarterJob } from "../domain/job.ts";

const base = {
  sourceId: "atlas-fixtures" as const, contentVersion: 1, synthetic: true as const,
  lifecycle: "active" as const, publishedDate: "2026-09-23",
  remote: {
    type: "remote" as const, permanent: true,
    mandatoryPresence: "explicitly_not_required" as const,
    evidence: "Постоянная полностью удалённая работа. Обязательного физического присутствия нет.",
    conflict: false
  }
};

export const jobs: readonly StarterJob[] = [
  { ...base, id: "fern-frontend", externalId: "fixture-001",
    title: "Senior Frontend Engineer", company: "Fern Labs", team: "Продуктовая команда",
    description: "Синтетический пример. Команда развивает интерфейсы продукта на React и TypeScript. Задачи включают доступность компонентов, интеграцию API и совместную работу с дизайнером. В этом примере допускается подряд из любой страны; конкретные рабочие часы не указаны.",
    skills: ["React", "TypeScript", "Accessibility"], salaryLabel: "€72 000–90 000 / год, до налогов",
    geographyLabel: "По всему миру", geographyKnown: true, contractLabel: "Подряд" },
  { ...base, id: "orbit-product", externalId: "fixture-002",
    title: "Product Designer", company: "Orbit Studio", team: "Дизайн и исследования",
    description: "Синтетический пример. Проектирование пользовательских сценариев, проверка прототипов и поддержка дизайн-системы. В объявлении не опубликованы страны найма. Это не означает найм по всему миру. Рабочие часы также не указаны.",
    skills: ["Product design", "Figma", "Research"], salaryLabel: "Зарплата не опубликована",
    geographyLabel: "Страны найма не указаны", geographyKnown: false, contractLabel: "Не указан" },
  { ...base, id: "north-backend", externalId: "fixture-003",
    title: "Backend Engineer", company: "North Systems", team: "Платформа",
    description: "Синтетический пример. Разработка API на Node.js и PostgreSQL. Полностью удалённая штатная работа, но кандидат должен работать из США. Ограничение по стране не делает вакансию гибридной и не означает её совместимость с любым профилем.",
    skills: ["Node.js", "PostgreSQL", "API"], salaryLabel: "$110 000–140 000 / год, до налогов",
    geographyLabel: "Только США", geographyKnown: true, contractLabel: "Трудовой договор" },
  { ...base, id: "cobalt-data", externalId: "fixture-004",
    title: "Data Analyst", company: "Cobalt Works", team: "Аналитика продукта",
    description: "Синтетический пример. Продуктовые метрики и SQL-исследования. Полностью удалённый подряд для кандидатов из Германии, Франции или Нидерландов. Эти три страны — полный список для данного примера.",
    skills: ["SQL", "Analytics", "Python"], salaryLabel: "€60 000–75 000 / год, до налогов",
    geographyLabel: "Германия, Франция, Нидерланды", geographyKnown: true, contractLabel: "Подряд" },
  { ...base, id: "hybrid-excluded", externalId: "fixture-005",
    title: "Hybrid Engineer", company: "Test Office", team: "Тест исключения",
    description: "Синтетическая отрицательная фикстура: два обязательных дня в офисе.",
    skills: ["React"], salaryLabel: "Не указана", geographyLabel: "Берлин", geographyKnown: true,
    contractLabel: "Трудовой договор", remote: { ...base.remote, type: "hybrid", mandatoryPresence: "required" } },
  { ...base, id: "closed-excluded", externalId: "fixture-006",
    title: "Closed Engineer", company: "Test Closed", team: "Тест закрытия",
    description: "Синтетическая отрицательная фикстура: вакансия закрыта.",
    skills: ["React"], salaryLabel: "Не указана", geographyLabel: "По всему миру", geographyKnown: true,
    contractLabel: "Подряд", lifecycle: "closed" },
  { ...base, id: "conflict-excluded", externalId: "fixture-007",
    title: "Remote tagged office job", company: "Test Conflict", team: "Тест конфликта",
    description: "Синтетическая отрицательная фикстура: тег remote противоречит обязательному офису.",
    skills: ["TypeScript"], salaryLabel: "Не указана", geographyLabel: "Не указана", geographyKnown: false,
    contractLabel: "Не указан", remote: { ...base.remote, conflict: true, mandatoryPresence: "required" } },
  { ...base, id: "temporary-excluded", externalId: "fixture-008",
    title: "Temporary remote job", company: "Test Temporary", team: "Тест временной удалёнки",
    description: "Синтетическая отрицательная фикстура: удалённо до открытия офиса.",
    skills: ["SQL"], salaryLabel: "Не указана", geographyLabel: "Не указана", geographyKnown: false,
    contractLabel: "Не указан", remote: { ...base.remote, permanent: false } }
];
