// B42: what a profile without a work country costs, and the words that say so.
//
// GEO-01 cannot pass without a country (src/domain/matching.ts), so such a profile
// has no «Условия совпадают» at all. The country stays optional in the form; the
// product owes the candidate the reason, in the places where the effect shows.

export function lacksCountry(
  input: Readonly<{ residenceCountry: string | null }> | null | undefined,
): boolean {
  if (input === null || input === undefined) return false;
  return input.residenceCountry === null || input.residenceCountry.trim().length === 0;
}

// The matched page, above both tabs.
export const COUNTRY_MISSING_NOTICE =
  "Страна работы не указана в профиле. Без неё география вакансий не оценивается, поэтому "
  + "ни одна вакансия не может попасть в «Условия совпадают» — все остаются в «Нужно уточнить».";

// The empty «Условия совпадают» tab, in place of «это честный результат».
export const EMPTY_MATCH_WITHOUT_COUNTRY = {
  heading: "Совпадений нет: не указана страна",
  body: "Страна работы решает, какие вакансии вообще могут совпасть: без неё география не "
    + "оценивается, и ни одна вакансия не станет совпадением, сколько бы их ни было.",
} as const;

// Under the country field of the profile form.
export const COUNTRY_FIELD_HINT =
  "Страна решает, какие вакансии могут попасть в «Условия совпадают»: без неё география не "
  + "оценивается. Поле можно оставить пустым — тогда вакансии останутся в «Нужно уточнить».";
