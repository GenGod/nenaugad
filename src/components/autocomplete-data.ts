// Client-side autocomplete data for the manual profile form.
// Countries: curated ISO-3166 alpha-2 list (typing any other valid code
// stays allowed — the datalist is help, not a restriction). Timezones come
// from the platform Intl list with a curated fallback.

export const COUNTRY_OPTIONS: readonly (readonly [string, string])[] = [
  ["AR", "Аргентина"], ["AM", "Армения"], ["AU", "Австралия"], ["AT", "Австрия"],
  ["AZ", "Азербайджан"], ["BY", "Беларусь"], ["BE", "Бельгия"], ["BA", "Босния и Герцеговина"],
  ["BR", "Бразилия"], ["BG", "Болгария"], ["CA", "Канада"], ["CL", "Чили"],
  ["CN", "Китай"], ["CO", "Колумбия"], ["CR", "Коста-Рика"], ["HR", "Хорватия"],
  ["CY", "Кипр"], ["CZ", "Чехия"], ["DK", "Дания"], ["EE", "Эстония"],
  ["EG", "Египет"], ["FI", "Финляндия"], ["FR", "Франция"], ["GE", "Грузия"],
  ["DE", "Германия"], ["GR", "Греция"], ["HU", "Венгрия"], ["IS", "Исландия"],
  ["IN", "Индия"], ["ID", "Индонезия"], ["IE", "Ирландия"], ["IL", "Израиль"],
  ["IT", "Италия"], ["JP", "Япония"], ["KZ", "Казахстан"], ["KE", "Кения"],
  ["LV", "Латвия"], ["LT", "Литва"], ["LU", "Люксембург"], ["MY", "Малайзия"],
  ["MT", "Мальта"], ["MX", "Мексика"], ["MD", "Молдова"], ["ME", "Черногория"],
  ["MA", "Марокко"], ["NL", "Нидерланды"], ["NZ", "Новая Зеландия"], ["MK", "Северная Македония"],
  ["NG", "Нигерия"], ["NO", "Норвегия"], ["PK", "Пакистан"], ["PA", "Панама"],
  ["PH", "Филиппины"], ["PL", "Польша"], ["PT", "Португалия"], ["RO", "Румыния"],
  ["SA", "Саудовская Аравия"], ["RS", "Сербия"], ["SG", "Сингапур"], ["SK", "Словакия"],
  ["SI", "Словения"], ["ZA", "Южная Африка"], ["KR", "Южная Корея"], ["ES", "Испания"],
  ["SE", "Швеция"], ["CH", "Швейцария"], ["TH", "Таиланд"], ["TN", "Тунис"],
  ["TR", "Турция"], ["UA", "Украина"], ["AE", "ОАЭ"], ["GB", "Великобритания"],
  ["US", "США"], ["UZ", "Узбекистан"], ["VN", "Вьетнам"],
];

const FALLBACK_TIMEZONES: readonly string[] = [
  "Europe/Amsterdam", "Europe/Athens", "Europe/Belgrade", "Europe/Berlin",
  "Europe/Brussels", "Europe/Bucharest", "Europe/Budapest", "Europe/Copenhagen",
  "Europe/Dublin", "Europe/Helsinki", "Europe/Kyiv", "Europe/Lisbon",
  "Europe/London", "Europe/Madrid", "Europe/Minsk", "Europe/Moscow",
  "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Riga",
  "Europe/Rome", "Europe/Sofia", "Europe/Stockholm", "Europe/Tallinn",
  "Europe/Vienna", "Europe/Vilnius", "Europe/Warsaw", "Europe/Zurich",
  "Asia/Bangkok", "Asia/Dubai", "Asia/Ho_Chi_Minh", "Asia/Jakarta",
  "Asia/Jerusalem", "Asia/Kolkata", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Tbilisi", "Asia/Tokyo",
  "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago",
  "America/Denver", "America/Lima", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Sao_Paulo", "America/Toronto",
  "Australia/Melbourne", "Australia/Sydney", "Africa/Cairo", "Africa/Johannesburg",
  "Africa/Lagos", "Pacific/Auckland", "UTC",
];

export function timeZoneOptions(): readonly string[] {
  try {
    const supported = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf?.("timeZone");
    return Array.isArray(supported) && supported.length > 0 ? supported : FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
}
