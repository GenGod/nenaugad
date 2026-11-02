# Distinctive UI language for Nenaugad: characterful Cyrillic typefaces and accessible vivid color

Research date: 2026-11-02. Method notes:

- **Cyrillic support** was checked in machine-readable form, not taken from memory. Sources were the live Google Fonts family metadata ([fonts.google.com/metadata/fonts](https://fonts.google.com/metadata/fonts), 1,959 families, 296 with the `cyrillic` subset), the per-family `METADATA.pb` / `DESCRIPTION.en_us.html` files in [github.com/google/fonts](https://github.com/google/fonts), and the [Fontsource API](https://api.fontsource.org/v1/fonts?subsets=cyrillic).
- **Visual render.** All 38 Google-hosted candidates were then rendered from the Google Fonts CSS API with the string `бвгдежзийклфцщъыюя ЁЖДЛЙФ 1407,59 ₽` plus an italic line, and inspected by eye. That render is the researcher's own check, not a published source.
- **Tabular figures (`tnum`)** were checked through the font source repositories (READMEs, `.fea`/`.glif` files via GitHub code search). Where nothing was found, the entry says "not verified". GitHub does not index large `.glyphs` sources, so a negative result is inconclusive.
- **Color numbers** (OKLCH, WCAG 2.x ratio, APCA Lc, simulated colour-vision deficiency distances) were computed locally with a script. The method and formulas are in Part B4.

---

## A1. Display / headline faces with strong personality and real Cyrillic

### Takeaway
Many Google Fonts faces have both genuine Cyrillic and a strong voice, all under OFL. The most distinctive and least worn are **Science Gothic** (2025; width 50–200 plus weight and contrast axes), **Tektur** (octagonal; width and weight axes) and **Dela Gothic One** (ultra-heavy poster face). **Unbounded** is excellent but widely used. **Oswald**, **Playfair Display** and **Montserrat** are among the most-used fonts on Google Fonts and read as default choices. Commercial **Druk Cyrillic** (Commercial Type / Type Today) is the iconic paid option. **Benzin** is sold commercially, and its Cyrillic was not confirmed.

### Cited Findings

**Shortlist: display faces (all verified `cyrillic` subset in GF metadata; all OFL per google/fonts `METADATA.pb`)**

| Face | Designer / foundry | Variable? axes | Styles on GF | Cyrillic ext.? | `tnum` | GF popularity rank* | Character (one line) |
|---|---|---|---|---|---|---|---|
| **Science Gothic** (added 2025-11-19) | Thomas Phinney, Vassil Kateliev, Brandon Buerkle | Yes: `wght` 100–900, `wdth` 50–200, `slnt` −10–0, `CTRS` (contrast) 0–85 | 100–900, no italics | yes (cyrillic) | **Yes**: `*.tnum.glif` glyphs in source | 794 (rare) | A Bank Gothic–style "science" grotesk that runs from compressed to ultra-wide, good for numbers and headlines |
| **Tektur** (2023) | Adam Jagosz | Yes: `wght` 400–900, `wdth` 75–100 | 400–900 | yes + ext | **Yes**: `*.tnum.glif` in source | 243 | Octagonal outlines and rectangular counters with a high x-height; technical but readable |
| **Dela Gothic One** (2020) | artakana (syakuzen) | No | 400 only | cyrillic | not verified | 166 | Flat, very thick gothic made for posters and packaging |
| **Unbounded** (2022) | NaN studio; funded by the Polkadot treasury | Yes: `wght` 200–900 | 200–900 | yes + ext | not verified | **85 (popular)** | Wide, rounded "crypto-era" display face; 1,300+ glyphs and a figure-building system |
| **Rubik Mono One** (2014) | Hubert & Fischer | No | 400 | cyrillic | n/a (monospaced caps) | 165 | Heavy monospaced all-caps. Lowercase renders as caps in the researcher's test |
| **Russo One** (2012) | Jovanny Lemonad | No | 400 | cyrillic | not verified | 224 | Squarish techno-sport face; dated 2010s RuNet feel |
| **Climate Crisis** (2022) | Daniel Coull, Eino Korkala | Yes: `YEAR` 1979–2050 | 400 | cyrillic | not verified | 636 | Ultra-heavy face that "melts" along a year axis; very expressive, one-trick |
| **Alumni Sans** (2021) | Robert Leuschke | Yes: `wght` 100–900 | 100–900 + italics | cyrillic | not verified | 252 | Impact-derived condensed sans, Thin to Black |
| **Sofia Sans Condensed / Extra Condensed** (2022) | Lettersoup (Botio Nikoltchev, Ani Petrova) | Yes: `wght` 1–1000 | + italics | yes + ext | not verified | 192 / 336 | Tense condensed "technical sans" from Bulgaria; four widths |
| **Yeseva One** (2011) | Jovanny Lemonad | No | 400 | yes + ext | not verified | 204 | High-contrast fat-face "feminine" Didone; editorial, slightly décor |
| **Prata** (2011) | Cyreal | No | 400 | yes + ext | not verified | 128 | Didone with ball terminals, for display sizes |
| **Playfair** (2.0, added 2023) | Claus Eggers Sørensen | Yes: `opsz` 5–1200, `wdth` 87.5–112.5, `wght` 300–900 | + italics | yes + ext | not verified | 122 | The newer, optical-size Playfair, less tired than Playfair Display (rank 19) |
| **Cormorant / Cormorant Garamond** (2016) | Christian Thalmann (Catharsis Fonts) | Yes: `wght` 300–700 | + italics | yes + ext | not verified | 104 / 30 | Display Garamond with very small x-height; elegant, fragile at UI sizes |
| **Forum** (2011) | Denis Masharov | No | 400 | cyrillic | not verified | 279 | Roman inscriptional capitals with matching lowercase; classical |
| **Kurale** (2015) | Eduardo Tunni | No | 400 | cyrillic | not verified | 492 | Warm, slightly calligraphic serif |

\*GF popularity rank is the `popularity` field in the [Google Fonts metadata](https://fonts.google.com/metadata/fonts) (lower = more used), read on 2026-11-02.

**Sources for the rows above**
- Subsets, designers, axes, styles, date added and popularity: [Google Fonts metadata JSON](https://fonts.google.com/metadata/fonts). Specimen pages: [Science Gothic](https://fonts.google.com/specimen/Science+Gothic), [Tektur](https://fonts.google.com/specimen/Tektur), [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One), [Unbounded](https://fonts.google.com/specimen/Unbounded), [Rubik Mono One](https://fonts.google.com/specimen/Rubik+Mono+One), [Russo One](https://fonts.google.com/specimen/Russo+One), [Climate Crisis](https://fonts.google.com/specimen/Climate+Crisis), [Alumni Sans](https://fonts.google.com/specimen/Alumni+Sans), [Sofia Sans Condensed](https://fonts.google.com/specimen/Sofia+Sans+Condensed), [Yeseva One](https://fonts.google.com/specimen/Yeseva+One), [Prata](https://fonts.google.com/specimen/Prata), [Playfair](https://fonts.google.com/specimen/Playfair), [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond), [Forum](https://fonts.google.com/specimen/Forum), [Kurale](https://fonts.google.com/specimen/Kurale).
- License OFL and source repositories: METADATA.pb for [Unbounded](https://github.com/google/fonts/blob/main/ofl/unbounded/METADATA.pb) (repo [googlefonts/unbounded](https://github.com/googlefonts/unbounded)), [Tektur](https://github.com/google/fonts/blob/main/ofl/tektur/METADATA.pb) ([hyvyys/Tektur](https://github.com/hyvyys/Tektur)), [Science Gothic](https://github.com/google/fonts/blob/main/ofl/sciencegothic/METADATA.pb) ([googlefonts/science-gothic](https://github.com/googlefonts/science-gothic)), [Dela Gothic One](https://github.com/google/fonts/blob/main/ofl/delagothicone/METADATA.pb) ([syakuzen/DelaGothic](https://github.com/syakuzen/DelaGothic)), [Russo One](https://github.com/google/fonts/blob/main/ofl/russoone/METADATA.pb) (reserved font name "Russo"), [Yeseva One](https://github.com/google/fonts/blob/main/ofl/yesevaone/METADATA.pb) (RFN "Yeseva"), [Prata](https://github.com/google/fonts/blob/main/ofl/prata/METADATA.pb), [Playfair](https://github.com/google/fonts/blob/main/ofl/playfair/METADATA.pb), [Cormorant Garamond](https://github.com/google/fonts/blob/main/ofl/cormorantgaramond/METADATA.pb), [Forum](https://github.com/google/fonts/blob/main/ofl/forum/METADATA.pb), [Kurale](https://github.com/google/fonts/blob/main/ofl/kurale/METADATA.pb), [Climate Crisis](https://github.com/google/fonts/blob/main/ofl/climatecrisis/METADATA.pb), [Alumni Sans](https://github.com/google/fonts/blob/main/ofl/alumnisans/METADATA.pb), [Sofia Sans Condensed](https://github.com/google/fonts/blob/main/ofl/sofiasanscondensed/METADATA.pb).
- `tnum` evidence: GitHub code search for "tnum" found `one.tnum.glif` and related glyphs in [hyvyys/Tektur](https://github.com/search?q=repo%3Ahyvyys%2FTektur+tnum&type=code) (65 hits) and [googlefonts/science-gothic](https://github.com/search?q=repo%3Agooglefonts%2Fscience-gothic+tnum&type=code) (603 hits). No hits came back for Unbounded or Alumni, which is inconclusive.
- Unbounded's own description: possibly the first open-source font funded on-chain, through the Polkadot treasury. It ships Light to Black as a variable font with Latin and Cyrillic, 1,300+ glyphs and a "figure building system" — [DESCRIPTION.en_us.html](https://github.com/google/fonts/blob/main/ofl/unbounded/DESCRIPTION.en_us.html).
- Tektur description: constructed octagonal outlines, rectangular counters, high x-height, ascenders aligned with cap height — [DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/tektur/DESCRIPTION.en_us.html).
- Dela Gothic One description: a flat, very thick gothic for posters and packaging — [DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/delagothicone/DESCRIPTION.en_us.html).
- Alumni Sans description: inspired by Impact; extreme weights are for display. **Conflict:** the description lists only Latin sets ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/alumnisans/DESCRIPTION.en_us.html)), while the [GF metadata](https://fonts.google.com/metadata/fonts) lists a `cyrillic` subset and Cyrillic glyphs rendered in the researcher's test. The description is probably stale.
- Sofia Sans description: designed for the city of Sofia, in four widths, with extended Latin, Greek and Cyrillic and early-20th-century technical-sans inspiration — [DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/sofiasans/DESCRIPTION.en_us.html).
- **Druk Cyrillic (commercial).** Type.today lists Druk (2014) with credits to Commercial Type, Berton Hasebe, Ilya Ruderman and Yury Ostromentsky ([type.today Druk Wide](https://type.today/en/druk_wide/bold)). Localfonts credits the base Druk Cyrillic to Yury Ostromentsky alone ([localfonts.eu Druk](https://localfonts.eu/shop/cyrillic-script/serbian/serbian-cyrillic-sans-serif/druk/)), so the attribution sources conflict. Druk Condensed was originally made for Bloomberg Businessweek's 2011 "Year in Review" issue ([localfonts.eu](https://localfonts.eu/?p=45722)). Druk Text Cyrillic also exists ([type.today Druk Text](https://type.today/en/druk_text/bold)).
- **Benzin (commercial).** Designed by Roman Postovoy and published by Supremat; geometric sans in 5 weights; on MyFonts from US$13.99 per style ([MyFonts Benzin](https://myfonts.com/fonts/supremat/benzin)). Cyrillic support was **not confirmed** in the sources found, and "free download" pages for it are SEO pages, not licensed sources.
- **Not available with Cyrillic on Google Fonts** (GF metadata `cyrillic` subset absent): Bebas Neue, Bricolage Grotesque, Fraunces, Instrument Serif, DM Serif Display, Young Serif, Gloock, Bodoni Moda, Syne, Archivo Black, Big Shoulders, Bungee — [GF metadata](https://fonts.google.com/metadata/fonts).

### Inferences
- **Best fits for an "evidence, not at random" product.** Science Gothic's wide width range and Tektur's engineered octagons suggest instruments and measurement without the crypto associations of Unbounded. Both have tabular figures, which suits salary and time numbers in headlines.
- **For a bolder, poster-like identity**, Dela Gothic One works for one-word or numeric hero statements. It has a single weight and no `tnum` evidence, so it needs a separate face for figures.
- **Serif options.** Playfair 2.0 with an optical-size axis, or Cormorant, would give a "document / protocol" serif voice. Both are at risk of a "luxury / wedding" reading in Russian design. Cormorant's tiny x-height is a problem at 320px width.
- **Rubik Mono One** works only as an all-caps label face. Russo One reads as dated 2010s RuNet.

### Gaps
- Glyph-level quality of the Russian forms (б, д, л, к, ж, й, ё) was only spot-checked visually at 17–27px. All faces drew distinct Cyrillic glyphs, and no obviously Bulgarian or wrong forms were seen in the display faces. A designer should still review д/л/к at large sizes before choosing. No published Cyrillic-quality review was found for Science Gothic, Tektur or Dela Gothic One.
- No sources were found for **Involve**, **Steppe** or **Gropled** (designer, license or Cyrillic quality). They need a dedicated search before they can be considered.
- No current price was found for Druk Cyrillic web licenses on type.today.

---

## A2. UI / text faces (not Inter, Geist or Roboto) legible at 14–16px

### Takeaway
The strongest open-source UI faces with native-quality Cyrillic are **Golos Text**, **Onest**, **Geologica**, **TikTok Sans** and **Manrope**. Golos Text is by Paratype (Korolkova/Kuzmin) for state services, and has `tnum`. Onest is by Voloshin and Kudryavtsev. Geologica is by Monokrom and has cursive and sharpness axes. TikTok Sans is by Grilli Type with Cyrillic by Contrast Foundry and has tabular numerals. Manrope is by Mikhail Sharanda and has tabular figures, but it is popular. **Commissioner** (flare and volume axes, `tnum`) and **Wix Madefor Text** (true italics) give extra character. Newer, rarely used options are **Akt** (Dmitry Grenev, added May 2026) and **Liter** (single weight). **PT Root UI** is OFL but is not on Google Fonts.

### Cited Findings

| Face | Designer / foundry | Variable? axes | Italics | `tnum` | GF popularity rank | Notable use / provenance | Character (one line) |
|---|---|---|---|---|---|---|---|
| **Golos Text** (GF 2023) | Alexandra Korolkova, Vitaly Kuzmin; released by Paratype 2019 | Yes: `wght` 400–900 | **No** | **Yes** (`tnum` in `features.fea`) | 129 | Commissioned by Smena and AIC Media for state and social-service websites | Closed, sober grotesk for continuous screen reading; very "Russian civic" |
| **Onest** (GF 2023) | Dmitri Voloshin, Andrey Kudryavtsev | Yes: `wght` 100–900 | No | not verified | 89 | Source repo owned by `simpals` | Friendly neo-grotesk with open shapes |
| **Geologica** (GF 2023) | Monokrom (Sindre Bremnes, Frode Helland) | Yes: `wght` 100–900, `slnt` −12–0, `CRSV` 0–1, `SHRP` 0–100 | Oblique via `slnt` only | not verified | 108 | — | Wide-stance geometric-humanist with a "sharpness" axis that adds pen-like wedges |
| **TikTok Sans** (GF 2025) | Grilli Type with Contrast Foundry | Yes: `opsz`, `slnt`, `wdth`, `wght` (300–900) | Oblique via `slnt` | **Yes** (README: tabular numerals) | 533 | TikTok's brand face, open-sourced | Compact, slightly quirky grotesk with optical sizes |
| **Manrope** (GF 2019) | Mikhail Sharanda; variable conversion with Mirko Velimirovic | Yes: `wght` 200–800 | No | **Yes** (README lists Tabular Figures) | **24 (popular)** | — | Semi-condensed, semi-geometric modern sans |
| **Commissioner** (GF 2020) | Kostas Bartsokas | Yes: `wght` 100–900, `slnt`, `FLAR` 0–100, `VOLM` 0–100 | Oblique via `slnt` | **Yes** (README: added in v1.012) | 309 | — | Low-contrast humanist whose flare axis grows glyphic serifs ("three voices") |
| **Wix Madefor Text** (GF 2023) | Dalton Maag for Wix | Yes: `wght` 400–800 | **Yes** (cursive-rooted italics) | not verified | 411 | Wix's brand family (Text + Display) | Compact geometric UI face with surprisingly cursive italics |
| **IBM Plex Sans** | Mike Abbink, Bold Monday for IBM | Yes: `wdth` 75–100, `wght` 100–700 | Yes | not verified | **25 (popular)** | IBM corporate face | Engineered grotesk with "industrial" details |
| **Akt** (GF 2026-05-12) | Dmitry Grenev | Yes: `wght` 100–900 | No | not verified | 761 (rare) | — | New neo-grotesk; little usage yet |
| **Liter** (GF 2025-01-08) | Anton Skugarov, Alexandr Ivanin | **No** (400 only) | No | not verified | 644 | — | Single-weight sans; too limited for a UI system |
| **Ysabeau Office** (GF 2023) | Christian Thalmann | Yes: `wght` 1–1000 | Yes | **Yes** (README) | 414 | — | Garamond-skeleton sans with a calligraphic feel; "Office" has lining figures |
| **Sofia Sans** (GF 2021) | Lettersoup | Yes: `wght` 1–1000 | Yes | not verified | 152 | Sofia city identity | Technical sans with soft corners. **See Bulgarian-forms caution below** |
| **Mulish** | Vernon Adams, Cyreal, Jacques Le Bailly | Yes: `wght` 200–1000 | Yes | not verified | **40** | — | Minimalist, slightly generic |
| **Raleway** | Matt McInerney, Pablo Impallari, Rodrigo Fuenzalida | Yes | Yes | not verified | **14** | — | Elegant thin display-sans; over-used and weak at 14px |
| **Montserrat Alternates** | Julieta Ulanovsky et al. | **No** (static) | Yes | not verified | 127 | — | Montserrat with quirky alternates |
| **PT Root UI** (not on GF) | Vitaly Kuzmin, ParaType 2018 | Variable on some distributions (not verified) | — | not verified | n/a | UI-specific member of ParaType's commercial PT Root family | Neutral Russian-made UI grotesk |

**Sources for the rows above**
- Subsets, axes, styles, designers and popularity: [Google Fonts metadata](https://fonts.google.com/metadata/fonts). All entries above except PT Root UI show `cyrillic: true`. Specimens: [Golos Text](https://fonts.google.com/specimen/Golos+Text), [Onest](https://fonts.google.com/specimen/Onest), [Geologica](https://fonts.google.com/specimen/Geologica), [TikTok Sans](https://fonts.google.com/specimen/TikTok+Sans), [Manrope](https://fonts.google.com/specimen/Manrope), [Commissioner](https://fonts.google.com/specimen/Commissioner), [Wix Madefor Text](https://fonts.google.com/specimen/Wix+Madefor+Text), [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans), [Akt](https://fonts.google.com/specimen/Akt), [Liter](https://fonts.google.com/specimen/Liter), [Ysabeau Office](https://fonts.google.com/specimen/Ysabeau+Office), [Sofia Sans](https://fonts.google.com/specimen/Sofia+Sans).
- OFL license and repositories (METADATA.pb): [Golos Text](https://github.com/google/fonts/blob/main/ofl/golostext/METADATA.pb), [Onest](https://github.com/google/fonts/blob/main/ofl/onest/METADATA.pb) ([simpals/onest](https://github.com/simpals/onest)), [Manrope](https://github.com/google/fonts/blob/main/ofl/manrope/METADATA.pb), [Geologica](https://github.com/google/fonts/blob/main/ofl/geologica/METADATA.pb), [Commissioner](https://github.com/google/fonts/blob/main/ofl/commissioner/METADATA.pb), [Wix Madefor Text](https://github.com/google/fonts/blob/main/ofl/wixmadefortext/METADATA.pb) ([wix-incubator/wixmadefor](https://github.com/wix-incubator/wixmadefor)), [TikTok Sans](https://github.com/google/fonts/blob/main/ofl/tiktoksans/METADATA.pb) ([TikTok/TikTokSans](https://github.com/TikTok/TikTokSans)), [IBM Plex Sans](https://github.com/google/fonts/blob/main/ofl/ibmplexsans/METADATA.pb), [Akt](https://github.com/google/fonts/blob/main/ofl/akt/METADATA.pb) ([dimgrenev/akt](https://github.com/dimgrenev/akt)), [Liter](https://github.com/google/fonts/blob/main/ofl/liter/METADATA.pb) ([skugiz/liter](https://github.com/skugiz/liter)), [Ysabeau Office](https://github.com/google/fonts/blob/main/ofl/ysabeauoffice/METADATA.pb).
- Golos Text description (Smena/AIC Media commission, Paratype 2019, Korolkova and Kuzmin, five weights Regular to Black): [DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/golostext/DESCRIPTION.en_us.html). `tnum` appears in `sources/Golos Text-Regular.ufo/features.fea`: [code search](https://github.com/search?q=repo%3Agooglefonts%2Fgolos-text+tnum&type=code).
- Manrope: designed by Mikhail Sharanda in 2018 and made variable with Mirko Velimirovic in 2019 ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/manrope/DESCRIPTION.en_us.html)). Its README lists "Tabular Figures" among the features ([googlefonts/manrope README](https://github.com/googlefonts/manrope)).
- Commissioner: low-contrast humanist with three "voices" set by the flair and volume axes ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/commissioner/DESCRIPTION.en_us.html)). Its README says v1.012 introduced tabular figures ([kosbarts/Commissioner](https://github.com/kosbarts/Commissioner)).
- TikTok Sans: the README says it offers tabular numerals, a disambiguation stylistic set and character variants ([TikTok/TikTokSans](https://github.com/TikTok/TikTokSans)). GF metadata credits Grilli Type and Contrast Foundry ([GF metadata](https://fonts.google.com/metadata/fonts)).
- Geologica: humanist genre with geometric construction, wide stance, generous spacing and large apertures, plus a sharpness axis ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/geologica/DESCRIPTION.en_us.html)).
- Wix Madefor: five display weights plus four text weights for interfaces; the text styles have italics rooted in cursive forms ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/wixmadefortext/DESCRIPTION.en_us.html)).
- Ysabeau: the README mentions `tnum` ([CatharsisFonts/Ysabeau code search](https://github.com/search?q=repo%3ACatharsisFonts%2FYsabeau+tnum&type=code)).
- PT Root UI: SIL OFL 1.1 with reserved font name "PT Root UI", © ParaType 2018 ([Font Squirrel](https://www.fontsquirrel.com/fonts/pt-root-ui)). Designed by Vitaly Kuzmin ([online-fonts.com](https://online-fonts.com/fonts/pt-root-ui)). The full commercial PT Root family is sold from US$229 for 11 fonts ([Fontspring PT Root](https://www.fontspring.com/fonts/paratype/pt-root)). The older PT Sans/Serif/Mono originally used the separate ParaType Free Font License ([SPDX](https://spdx.org/licenses/ParaType-Free-Font-1.3.html)), but Google Fonts now lists PT Mono under OFL ([METADATA.pb](https://github.com/google/fonts/blob/main/ofl/ptmono/METADATA.pb)).
- **Self-hosting.** Fontsource packages exist for every Google face in this table, with license OFL-1.1 and the listed weights, for example `onest`, `golos-text`, `tiktok-sans`, `science-gothic` and `akt` ([Fontsource API, cyrillic filter](https://api.fontsource.org/v1/fonts?subsets=cyrillic)). In this repo's Next.js version, `next/font` self-hosts any Google Font as static assets on the deployment's own domain, so the browser sends no requests to Google (local docs `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`; upstream [nextjs.org/docs/app/getting-started/fonts](https://nextjs.org/docs/app/getting-started/fonts)).
- **Not usable (no Cyrillic in GF metadata):** Space Grotesk, Plus Jakarta Sans, DM Sans, Outfit, Urbanist, Figtree, Lexend, Sora, Syne, Archivo, Hanken Grotesk, Schibsted Grotesk, Instrument Sans, Funnel Sans/Display, Host Grotesk, Mona Sans, Hubot Sans, Reddit Sans, Atkinson Hyperlegible Next, Google Sans Flex, Stack Sans — [GF metadata](https://fonts.google.com/metadata/fonts).
- **Google Sans** itself arrived on Google Fonts on 2025-12-09 with Cyrillic, and it already ranks 4th by popularity ([GF metadata](https://fonts.google.com/metadata/fonts)).

### Inferences
- **Short list for the Nenaugad UI face** (14–16px body, numbers in tables):
  1. **Golos Text** is the safest. It has native Russian design provenance, `tnum`, and a civic-service pedigree that fits "honest conditions". It is sober rather than vivid, which leaves the personality to the display face and color.
  2. **TikTok Sans** brings character through optical sizes and widths, has `tnum`, and its Cyrillic is by Contrast Foundry. Its TikTok association is a brand risk to weigh.
  3. **Geologica** is the most ownable of the three: the sharpness and cursive axes give character at heading sizes, and it is not over-used. Its `tnum` is unverified.
- **Commissioner** with the flare axis gives a humanist, "document" voice, and is a good partner for a serif-free brand.
- **Caution, Sofia Sans.** In the researcher's render, the default lowercase в and д in Sofia Sans looked Bulgarian-style (в with an ascender, д shaped like g). That suggests the default forms may follow Bulgarian conventions. Test with `lang="ru"` and `font-feature-settings` before use. This is not confirmed from documentation.
- **Missing italics.** Golos Text, Onest, Manrope, Akt and Liter have no italics; TikTok Sans, Geologica and Commissioner have oblique only. If Nenaugad needs italics (for example in letters or quoted conditions), Wix Madefor Text, IBM Plex Sans, Ysabeau and Finlandica Text ship true italic files on GF.

### Gaps
- `tnum` support for Onest, Geologica, Wix Madefor, Akt, Liter and IBM Plex Sans was not verified. GitHub code search returned 0 hits, which is inconclusive because large `.glyphs` sources are not indexed. Verify by loading the WOFF2 into Wakamai Fondue, or by testing `font-variant-numeric: tabular-nums`.
- "Notable products" usage for Onest, Geologica and Akt was not found on Fonts In Use or in press during this pass.
- Cyrillic italic forms (т as "m", д as "g", и as "u" in true Russian italics) were rendered, but not resolved clearly enough at the test size to judge each face.

---

## A3. Monospace with Cyrillic for data, time and salary

### Takeaway
**JetBrains Mono** (variable 100–800, true italics, Cyrillic + ext.) and **Martian Mono** (Evil Martians; width and weight axes; basic Cyrillic since Jan 2023) are the strongest characterful choices. **IBM Plex Mono**, **PT Mono** (ParaType, single weight), **Fira Code**, **Geist Mono**, **Cascadia Mono** and **Lilex** are verified alternatives. **Spline Sans Mono, Space Mono, DM Mono, Red Hat Mono, Azeret Mono, Fragment Mono, Chivo Mono, Reddit Mono, Intel One Mono, Google Sans Code and Atkinson Hyperlegible Mono have no Cyrillic on Google Fonts.**

### Cited Findings

| Face | Designer | Variable? | Italics | Cyrillic | GF rank | Character |
|---|---|---|---|---|---|---|
| **JetBrains Mono** | JetBrains, Philipp Nurullin, Konstantin Bulenkov | Yes: `wght` 100–800 | Yes | yes + ext | 22 (popular) | Tall x-height coding mono; neutral-technical |
| **Martian Mono** | Roman Shamin / Evil Martians | Yes: `wdth` 75–112.5, `wght` 100–800 | No | yes (basic Cyrillic added Jan 2023) | 313 | "Brutal and eye-catching" mono version of Martian Grotesk; width axis useful for tables |
| **IBM Plex Mono** | Mike Abbink, Bold Monday | No (static) | Yes | yes + ext | 45 | Industrial, slab-ish mono |
| **PT Mono** | ParaType | No (400 only) | No | yes + ext | 214 | Classic Russian-made mono; plain |
| **Fira Code** | Nikita Prokopov (based on Fira Mono by Carrois / Mozilla) | Yes: `wght` 300–700 | No | yes + ext | 274 | Coding ligatures; turn them off for data |
| **Geist Mono** | Vercel (Briganti, Zaragoza et al.) | Yes: `wght` 100–900 | Yes | yes | 71 | Swiss-ish mono; strongly tied to the Vercel aesthetic |
| **Cascadia Mono** | Microsoft (Aaron Bell et al.) | Yes: `wght` 200–700 | Yes | yes | 807 | Windows Terminal mono; friendly |
| **Lilex** | Mikhael Khrustik (based on IBM Plex Mono) | Yes: `wght` 100–700 | Yes | yes | 887 | Plex-Mono derivative with ligatures |
| **Victor Mono** | Rune Bjørnerås | Yes: `wght` 100–700 | Yes (cursive) | yes | 634 | Narrow mono with semi-connected cursive italics |

**Sources for the rows above**
- Subsets, axes, styles and designers: [GF metadata](https://fonts.google.com/metadata/fonts). Specimens: [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono), [Martian Mono](https://fonts.google.com/specimen/Martian+Mono), [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), [PT Mono](https://fonts.google.com/specimen/PT+Mono), [Fira Code](https://fonts.google.com/specimen/Fira+Code), [Geist Mono](https://fonts.google.com/specimen/Geist+Mono), [Cascadia Mono](https://fonts.google.com/specimen/Cascadia+Mono), [Lilex](https://fonts.google.com/specimen/Lilex), [Victor Mono](https://fonts.google.com/specimen/Victor+Mono).
- OFL and repositories: [JetBrains Mono METADATA](https://github.com/google/fonts/blob/main/ofl/jetbrainsmono/METADATA.pb), [Martian Mono METADATA](https://github.com/google/fonts/blob/main/ofl/martianmono/METADATA.pb) ([evilmartians/mono](https://github.com/evilmartians/mono)), [IBM Plex Mono METADATA](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/METADATA.pb), [PT Mono METADATA](https://github.com/google/fonts/blob/main/ofl/ptmono/METADATA.pb), [Fira Code METADATA](https://github.com/google/fonts/blob/main/ofl/firacode/METADATA.pb), [Geist Mono METADATA](https://github.com/google/fonts/blob/main/ofl/geistmono/METADATA.pb), [Cascadia Mono METADATA](https://github.com/google/fonts/blob/main/ofl/cascadiamono/METADATA.pb), [Lilex METADATA](https://github.com/google/fonts/blob/main/ofl/lilex/METADATA.pb).
- Martian Mono: monospaced version of Martian Grotesk; variable font with width (Condensed to SemiExpanded) and weight (Thin to ExtraBold) axes; basic Cyrillic added in January 2023 for Ukrainian, Belarusian and Russian ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/martianmono/DESCRIPTION.en_us.html)).
- No Cyrillic subset in GF metadata: Spline Sans Mono, Space Mono, DM Mono, Red Hat Mono, Azeret Mono, Sometype Mono, Fragment Mono, Chivo Mono, Kode Mono, Reddit Mono, Intel One Mono, Google Sans Code, Atkinson Hyperlegible Mono, SUSE Mono ([GF metadata](https://fonts.google.com/metadata/fonts)).

### Inferences
- Monospaced fonts give fixed-width digits by construction, which suits salary ranges, time-zone offsets and dates in columns. A proportional UI face with `tnum` (Golos Text, TikTok Sans, Manrope, Commissioner) can do the same job, and often looks less "developer-tool".
- **Martian Mono** is the most characterful for data. Its condensed width helps at 320px; set its weight and width per context. Turn off ligatures in **Fira Code** and **Lilex**, because `->` or `>=` could misrepresent conditions.
- **Geist Mono** is excluded in spirit, since the owner wants to avoid the Geist look.

### Gaps
- Cyrillic glyph quality in Martian Mono is "basic Cyrillic" by its own description. Extended Cyrillic coverage and Russian italic forms were not reviewed.

---

## A4. Over-used / cliché faces to avoid (2025–2026), and Russian-market signals

### Takeaway
Google Fonts usage data shows **Oswald (rank 2), Montserrat (3), Raleway (14), Manrope (24), IBM Plex Sans (25), Playfair Display (19), Cormorant Garamond (30)** among the most-used Cyrillic-capable families, so they read as defaults. **Unbounded** (85) has become the go-to Cyrillic display face of the 2020s. **Space Grotesk**, the crypto cliché, has no Cyrillic at all. Commercial clichés named by a Russian foundry itself include **Gilroy**, and TT Norms is described as a "bestseller".

### Cited Findings
- Popularity ranks from the Google Fonts metadata `popularity` field: Oswald 2, Inter 2, Montserrat 3, Google Sans 4, Open Sans 3, Raleway 14, Rubik 14, Playfair Display 19, Manrope 24, IBM Plex Sans 25, Cormorant Garamond 30, Mulish 40, Geist 48, Unbounded 85, Onest 89, Geologica 108, Golos Text 129, TikTok Sans 533, Akt 761, Science Gothic 794 — [GF metadata](https://fonts.google.com/metadata/fonts).
- Space Grotesk: `cyrillic` subset absent — [GF metadata](https://fonts.google.com/metadata/fonts).
- A study reported by Creative Bloq found Open Sans, Roboto, Lato and Montserrat to be the most popular startup typefaces — [Creative Bloq](https://www.creativebloq.com/news/study-reveals-most-popular-startup-typefaces-and-pairings).
- TypeType (the foundry behind TT Norms) runs a "Gilroy similar fonts" page for people tired of over-used typefaces. That marketing implicitly signals Gilroy saturation; TypeType is an interested party — [TypeType](https://typetype.org/fonts/gilroy-similar-fonts).

### Inferences
- For Nenaugad, "generic" comes as much from Inter plus one blue as from any single font. Unbounded with a gradient would read as "crypto / Web3 2022–2023" in Russian design. Montserrat and Manrope would read as template landing pages. This is inference from usage ranks, not from a published Russian critique.
- Rarely used but verified faces (Science Gothic, Tektur, Geologica, TikTok Sans, Akt) give more ownability per unit of effort.

### Gaps
- No Russian-language article (Habr, vc.ru, Tilda Education, Bureau Gorbunov) explicitly calling Unbounded, Manrope or TT Norms a 2025–2026 cliché was found in this pass. The cliché claim rests on usage data only.

---

## A5. Russian / Cyrillic type foundries and commercial options

### Takeaway
Commercial Cyrillic-native options come from **ParaType** (PT Root, Golos family), **Type Today / CSTM Fonts** (Ruderman and Ostromentsky; Druk Cyrillic, Kazimir and many cyrillizations; desktop, web and app licenses from about US$50 per style), **Contrast Foundry** (Maria Doreuli; CoFo Sans, Peshka, Kak, Robert, Pixel; also did TikTok Sans Cyrillic), **Brownfox** (Gayaneh Bagdasaryan, Vyacheslav Kirilenko; Formular from US$44.99 a style, US$400 for the family) and **TypeType** (TT Norms Pro: US$599–659 for the full family; web pricing by monthly visits).

### Cited Findings
- **Type Today / CSTM Fonts.** Type.today prices each typeface separately per Desktop, Web and App license. Examples: Maregraphe Text Light US$50 / US$50 / US$75 ([type.today](https://type.today/en/maregraphe_text/light)); Zhivov Regular (2026) US$50 / US$50 / US$75 ([type.today](https://type.today/en/zhivov/regular)); Portrait Bold US$72 / US$72 / US$108 ([type.today](https://type.today/en/portrait/bold)). Cyrillization is CSTM Fonts' main income source, with Western foundries ordering Cyrillic versions ([Inc. Russia, 2021](https://incrussia.ru/fly/type-today/)). Type.today faces, including CSTM's, can also be rented via Fontstand ([tomorrow.type.today FAQ](https://tomorrow.type.today/en/faq)). Kazimir Text is listed at [type.today/en/kazimir-text](https://type.today/en/kazimir-text/book).
- **Contrast Foundry.** CoFo Sans was designed by Maria Doreuli (2016–2018). It covers Latin, Cyrillic, extensive figures and fractions; the Pro version adds Vietnamese and Arabic ([Adobe Fonts CoFo Sans Pixel](https://fonts.adobe.com/fonts/cofo-sans-pixel), [Type Network](https://typenetwork.com/type-foundries/contrast-foundry)). Adobe Fonts points to Contrast Foundry for self-hosting and app licenses ([Adobe Fonts](https://fonts.adobe.com/fonts/cofo-sans-mono-variable)). CoFo Sans Mono is sold under a commercial license ([Fontstand](https://fontstand.com/fonts/cofo-sans-mono)). Doreuli says her families incorporate local Cyrillic forms ([localfonts.eu interview](https://localfonts.eu/journal/maria-doreuli-cyrillic-fonts-are-on-the-rise/)). Contrast Foundry co-designed TikTok Sans (OFL) — [GF metadata](https://fonts.google.com/metadata/fonts).
- **Brownfox.** Founded in 2012 by Gayaneh Bagdasaryan, who started at ParaType in 1996, with Vyacheslav Kirilenko. Formular is a Swiss-style sans for Latin and Cyrillic (2014), from US$44.99 per style and US$400 for the 15-font family on MyFonts ([MyFonts Formular](https://myfonts.com/fonts/brownfox/formular), [Luc Devroye](https://luc.devroye.org/fonts-62140.html)). Other Brownfox families on MyFonts include Institut, Wermut, Jet and Aeroport ([MyFonts Brownfox](https://www.myfonts.com/foundry/Brownfox)).
- **TypeType.** The TT Norms Pro full family (104 fonts) costs US$599 at Fontspring, with the variable package at US$399 ([Fontspring](https://www.fontspring.com/fonts/typetype/tt-norms-pro)), and US$659 at MyFonts ([MyFonts](https://www.myfonts.com/fonts/type-type/tt-norms?tab=licensing)). TypeType prices web licenses by monthly site visits ([TypeType TT Norms Std Condensed](https://typetype.org/fonts/tt-norms-std-condensed)). TT Norms Pro covers extended Cyrillic and Latin ([TypeType](https://typetype.org/)).
- **ParaType.** Golos was released by Paratype in 2019 (Korolkova, Kuzmin); Golos Text is OFL on GF ([DESCRIPTION](https://github.com/google/fonts/blob/main/ofl/golostext/DESCRIPTION.en_us.html)). PT Root UI is OFL; the full PT Root family is commercial from US$229 ([Font Squirrel](https://www.fontsquirrel.com/fonts/pt-root-ui), [Fontspring](https://www.fontspring.com/fonts/paratype/pt-root)).
- **Commercial Type (Druk, with Cyrillic by Ruderman and Ostromentsky)** — see A1 ([type.today Druk](https://type.today/en/druk_wide/bold)).

### Inferences
- If the owner will pay for distinctiveness, the cheapest ownable step is one display family from type.today (about US$50 web per style) or Brownfox, paired with an OFL UI face (Golos Text or TikTok Sans). Any commercial EULA must be checked for self-hosting and pageview caps before buying, since TypeType ties web pricing to traffic.

### Gaps
- "Shriftovik" was not researched. Current web-license prices for Contrast Foundry, Druk Cyrillic and the commercial ParaType Golos UI were not found.

---

## B1. Building a vivid palette in OKLCH; WCAG 2.2 vs APCA; tools

### Takeaway
Generate the palette in **OKLCH**. Fix hue and chroma, step lightness (L), and gamut-map to sRGB, with an optional P3 layer. Then **verify every text and UI pair with WCAG 2.x ratios**, because WCAG 2.2 AA is the conformance target. **APCA** is a useful second check for perceived readability and dark mode. Tools that do this include Evil Martians' oklch.com, Harmonizer and Harmony (OKLCH + APCA), Radix Colors (12-step scales with APCA guarantees), Tailwind v4 (OKLCH default palette) and Adobe Leonardo (generates colors to hit target contrast ratios).

### Cited Findings
- **Why OKLCH.** Evil Martians (Andrey Sitnik, Travis Turner; updated 2025-09-17) argue that OKLCH lightness is perceptual, so changing hue does not silently change contrast as it does in HSL. Palettes can be generated from a formula by varying L at fixed C and H. OKLCH can encode P3 colors that hex, RGB and HSL cannot, and P3 values can sit inside `@media (color-gamut: p3)`. Naive gamut clipping can shift hue visibly, so the article recommends explicit sRGB and P3 values. It lists the oklch.com picker, Huetone, the OkColor Figma plugin and stylelint-gamut, and its changelog says APCA should be used for contrast because OKLCH alone is not enough — [Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl).
- **Harmonizer / Harmony.** Harmonizer generates UI palettes with consistent chroma and contrast across levels and hues, using OKLCH plus the APCA formula, as a web tool and a Figma plugin ([Evil Martians, OKLCH ecosystem](https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools)). Harmony is the open-source npm palette: OKLCH shades with RGB fallbacks, P3, equal contrast within lightness groups and Tailwind compatibility ([github.com/evilmartians/harmony](https://github.com/evilmartians/harmony), [npm](https://www.npmjs.com/package/@evilmartians/harmony)). `apcach`, by Anton Lovchikov, composes colors at a target APCA contrast (same source).
- **Radix Colors.** Each scale has 12 steps:
  - steps 1–2 are app and subtle backgrounds;
  - steps 3–5 are component backgrounds (normal, hover, pressed);
  - steps 6–8 are borders and focus rings;
  - step 9 is the purest, highest-chroma solid background, step 10 its hover;
  - steps 11–12 are low- and high-contrast text.

  Most step-9 colors are designed for white text, but **Sky, Mint, Lime, Yellow and Amber are designed for dark foreground text**. Steps 11 and 12 are guaranteed Lc 60 and Lc 90 APCA on a step-2 background of the same scale — [Radix, Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).
- **Tailwind v4** (released 2025-01-22) moved its whole default palette from `rgb` to `oklch` to use the wider gamut, while keeping the v3 balance between colors — [Tailwind blog](https://tailwindcss.com/blog/tailwindcss-v4).
- **Adobe Leonardo.** You give it a base color, a background and a list of **target contrast ratios**, and `generateContrastColors()` returns swatches at those ratios. The defaults are 3 and 4.5. Output is often slightly above target because of RGB quantization, and the tool re-checks each swatch — [Leonardo API docs](https://leonardocolor.io/api.html), [npm @adobe/leonardo-contrast-colors](https://npmjs.com/package/@adobe/leonardo-contrast-colors), [Nate Baldwin, Medium](https://medium.com/@NateBaldwin/leonardo-an-open-source-contrast-based-color-generator-92d61b6521d2).
- **APCA thresholds:**
  - Lc 90 is preferred for body text, and Lc 75 is the minimum for body-text columns.
  - Lc 60 is the minimum for other content text.
  - Lc 45 covers large or heavy headlines and fine pictograms.
  - Lc 30 is the absolute minimum for placeholder or disabled text and large solid icons.
  - Lc 15 is the floor for non-text dividers.

  APCA is described as the *candidate* method for the future WCAG 3, not an adopted one. The same page says WCAG 2.x overstates contrast for dark colors and cannot guide dark-mode design — [APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html).
- **WCAG 2.2 requirements** (the conformance target):
  - [SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for text, 3:1 for large text (≥18pt, or ≥14pt bold).
  - [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 3:1 for UI component boundaries, states and meaningful graphics.
  - [SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html): color must not be the only visual means of conveying information.

### Inferences
- **Workflow for Nenaugad:**
  1. Pick brand H/C in oklch.com.
  2. Generate a 12-step Radix-style scale with Harmony/Harmonizer or Leonardo, targeting WCAG ratios.
  3. Hard-gate tokens in CI with a WCAG 2.x contrast test, with APCA as an advisory column.
  4. Ship sRGB hex as the baseline, with an optional `@media (color-gamut: p3)` override for extra vividness.
- Radix's split shows that bright hues (lime, yellow, amber, cyan) must carry **dark** text, while deep hues (cobalt, magenta) carry **white** text. This is the main design lever when using brand color as a surface.

### Gaps
- The `leonardocolor.io/api.html` details came via search summary, not a full page read. The sign convention for darker versus lighter targets is unverified.

---

## B2. Saturated brand color as a large surface; how Wise, Klarna, Mailchimp, Figma and Duolingo handle text on brand color

### Takeaway
The vivid brands that are also legible all **put dark ink on light, saturated surfaces**: Wise lime with forest green, Mailchimp yellow with Peppercorn, Klarna pink with black. Their brand color becomes a page or section background rather than a button tint. White on these brand colors fails WCAG badly (1.3–1.7:1). Duolingo's white-on-Feather-Green computes to only 2.09:1. Deep brand colors (cobalt, magenta) are the opposite case: they work with white text.

### Cited Findings
- **Wise.** Third-party design-system references describe Bright Green `#9FE870` for primary CTAs and interactive accents, and Forest Green `#163300` for text, links, navigation, selected states and dark surfaces ([Refero style reference](https://styles.refero.design/style/367c0c6e-73a7-441c-a8ff-91d139ac60dc)). A gallery entry says not to put white text on Bright Green but to use Forest Green ([oppadu design-system gallery](https://www.oppadu.com/tools/design-systems-site/brand/wise.html)). The official page [wise.design/foundations/colour](https://wise.design/foundations/colour) is client-rendered and returned only a heading, so these values are **unofficial**.
  - Computed by the researcher: `#163300` on `#9FE870` is **9.45:1** (APCA Lc 75.8); white on `#9FE870` is **1.47:1**. In OKLCH, `#9FE870` = oklch(85.7% 0.170 134.6) and `#163300` = oklch(28.7% 0.084 135.1): the same hue at opposite lightness ends.
- **Klarna.** Official guidelines say the trademark exists only in Klarna Pink, the pink wordmark goes **only on black backgrounds**, and logo colors must not be altered ([Klarna brand guidelines](https://docs.klarna.com/resources/marketing-tools/global-marketing-assets/brand-guidelines.md)). Klarna's developer docs allow button backgrounds only in Klarna Black `#0B051D`, white or off-white `#F9F8F5`, and **not Klarna Pink** ([Klarna custom button](https://docs.klarna.com/conversion-boosters/sign-in-with-klarna/additional-resources/creating-a-custom-button)). The pink hex `#FFB3C7` comes from unofficial sources ([webdesignhot Klarna](https://www.webdesignhot.com/design.md/klarna/)).
  - Computed: `#0B051D` on `#FFB3C7` is **11.89:1**; white on it is **1.68:1**.
- **Mailchimp.** Officially, Cavendish Yellow is the hero color and Peppercorn is used for accents ([Mailchimp brand assets](https://mailchimp.com/about/brand-assets/)). The hexes `#FFE01B` and `#241C15` come from third parties ([colorpickercode](https://colorpickercode.com/color-palette/brand-palettes/mailchimp/), [madegooddesigns](https://madegooddesigns.com/?p=57192)).
  - Computed: Peppercorn on Cavendish is **12.72:1** (Lc 85.8); white on Cavendish is **1.32:1**.
- **Duolingo.** Feather Green is the core brand color, Mask Green is the secondary green that Duo can be placed on, and Eel is commonly used for typography — summarized from the official [design.duolingo.com/identity/color](https://design.duolingo.com/identity/color), which on 2026-11-02 returns a **301 redirect** to [blog.duolingo.com/hub/design](https://blog.duolingo.com/hub/design/). Third parties give `#58CC02`, `#89E219` and Eel `#4B4B4B` ([brandpalettes](https://brandpalettes.com/duolingo-colors/)).
  - Computed: white on `#58CC02` is **2.09:1**, which fails even the 3:1 large-text threshold. Eel `#4B4B4B` on `#58CC02` is **4.18:1**, which passes only for large text.
- **Figma (Sept 2024 refresh).** An expanded color palette built on variables so it adapts across contexts ([Figma blog](https://www.figma.com/blog/figma-on-figma-evolving-our-visual-language/)). It kept the signature purple and added bold primaries, bright neons and muted earth tones ([Design Compass](https://designcompass.org/en/2024/09/20/figma-visual-identity-refresh)). A custom grotesque, Figma Sans by Grilli Type, comes with Figma Condensed, Figma Mono and Figma Hand ([Type-01](https://type-01.com/figma-rebrands-with-a-fresh-custom-font-by-grilli-type/), [It's Nice That](https://www.itsnicethat.com/features/figma-brand-refresh-graphic-design-spotlight-160924)). Exact hexes were not found.
- **Nenaugad today** (from `C:\Users\bvetr\Desktop\Projects\Nenaugad\src\app\tokens.css`): action `#3456D1` = oklch(50.5% 0.194 267.2), paper `#F7F5F0`, ink `#202840`. Computed: white on `#3456D1` is 6.18:1; `#3456D1` on paper is 5.67:1; ink on paper is 13.39:1. The brand is only a mid-chroma blue (C 0.19) used on buttons; nothing is color-blocked.

### Inferences
- **Two ways to make a saturated color the surface:**
  - **Light-vivid surface + dark ink** (Wise, Mailchimp, Klarna): L ≈ 0.82–0.91 with high chroma, and text in a near-black or a same-hue very dark shade (L ≈ 0.20–0.30) at 9–13:1.
  - **Deep-vivid surface + white text** (cobalt, magenta): L ≈ 0.45–0.55, giving 5.5–7.6:1 with white.

  Mixing the two systems (white on lime, black on cobalt) is where contrast fails.
- **Focus rings on brand surfaces** need their own token. On a deep cobalt surface, a dark ring is invisible (computed ink vs cobalt 2.44:1), so use white or paper (7.59:1). On a light cyan surface, use ink.
- **Brand color as text.** A light-vivid brand can't be used for links or text on paper (computed cyan `#22DEE6` on paper is 1.54:1). It needs a separate dark "brand-text" token. The Radix step 11/12 pattern and Wise's Forest Green do exactly this.

### Gaps
- Official hex values for Wise, Mailchimp, Klarna and Duolingo could not be read from first-party pages (client-rendered, image-only or redirected). All hexes above come from third-party references and are flagged as such.

---

## B3. Keeping semantic statuses (pass / unknown / fail / neutral) distinct from the brand

### Takeaway
Pick the brand hue **outside** the three status hue families: green ≈ 140–155°, amber ≈ 65–85° and red ≈ 20–35° in OKLCH. That leaves cobalt/ultramarine (≈ 255–268°, short of indigo/violet), cyan/petrol (≈ 195–220°) and, with care, magenta/pink (≈ 340–355°). Then separate by **lightness band** and **role**: brand = big surfaces, statuses = small labelled badges on neutral ground. Pair every status with an icon and text, per WCAG 1.4.1. A green brand would force "pass" to be told apart only by shade, which is what the Wise and Duolingo patterns imply. Since Nenaugad's conditions are its core content, a green, amber or red brand should be ruled out.

### Cited Findings
- WCAG 1.4.1 requires that color not be the only means of conveying information ([W3C Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
- Radix keeps status-adjacent bright hues (Lime, Yellow, Amber) on dark text and saturated hues on white text, so status chips and brand surfaces need different foregrounds ([Radix scale docs](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).
- **Computed by the researcher.** OKLab ΔE×100 distances use the Machado et al. 2009 colour-vision-deficiency simulation at severity 1.0 ([Machado, Oliveira, Fernandes 2009](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)) and OKLab ([Ottosson](https://bottosson.github.io/posts/oklab/)). Status solids: pass `#229944`, unknown `#F5AF20`, fail `#DB2C2B`, neutral `#7E8792`.
  - **Status vs status:** pass–fail is 32.4 normal but **3.6 under deuteranopia**, so the green/red pair collapses for deuteranopes, exactly as expected. Pass–neutral is 16.7 normal and 9.2–11.9 under CVD. **Icons and labels are mandatory.**
  - **Current Nenaugad** brand `#3456D1` vs current status texts: green700 22.4 (deut 21.0), amber800 28.8 (28.5), red700 29.0 (26.2). The current blue is already well separated. It is "generic", not unsafe.
  - **Saturated pink brand** `#EF1993` (H 354) vs fail solid: **14.5 normal, 5.2 tritan**. Vs neutral solid under deuteranopia: **2.7**, which means indistinguishable. A **light pink surface** `#FFB3DD` (L 0.85) vs fail: 31.0 normal and 28.6 deut. **Lightness separation is what survives CVD; hue separation alone does not.**

### Inferences
- **If the brand were green** (Wise, Duolingo), "pass" could be kept distinct only by moving the brand to an extreme lightness band and reserving mid-L green plus a check icon for pass. Alternatively, success could be re-hued (for example to teal), which breaks the green = pass convention Nenaugad has committed to. For Nenaugad, choose a non-status hue.
- **Status tokens should live on neutral (paper or white) ground**, never on brand surfaces. When a status must appear on a brand surface, use a white or paper chip containing the status color, the icon and the label.
- **The "unknown" amber solid is light** (`#F5AF20` vs white is 1.90:1), so it must carry dark text and an outlined or dark icon. The amber text token (`#875315`) handles text at 6.41:1 on white.

### Gaps
- Real users with CVD were not tested; the figures are simulation only. ΔE thresholds for "distinguishable" UI chips are heuristic. Roughly, ΔE×100 ≥ 10 is safe for adjacent large areas, with icons required regardless.

---

## B4. Three candidate vivid palettes (HEX + OKLCH + computed contrast), avoiding purple, indigo and violet

### Takeaway
The recommended palette is **P1 "Кобальт / Cobalt Protocol"**: electric cobalt surfaces with white text (7.59:1), dark cobalt-ink, warm paper and an aqua highlighter. It clears AA everywhere and stays far from all status colors, including under simulated CVD. **P3 "Петроль / Petrol Signal"** (light cyan surfaces with ink, deep petrol with white) is a strong, less common alternative. **P2 "Фуксия / Fuchsia Ledger"** is the boldest and most ownable, but it is close to "fail" red and, under deuteranopia, to neutral grey. Use it only as a deep surface (H 340, white text 5.56:1) with strict status rules.

### Method (reproducible)
- Colors were defined in OKLCH, converted to sRGB with Ottosson's OKLab matrices, and gamut-mapped by reducing chroma at constant L and H until in sRGB. The reported chroma is the post-mapping value. Sources: [Ottosson OKLab](https://bottosson.github.io/posts/oklab/); [Evil Martians on gamut mapping](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl).
- **WCAG ratio** = (L1 + 0.05) / (L2 + 0.05), using relative luminance from linearized sRGB with coefficients 0.2126 / 0.7152 / 0.0722 ([WCAG 2.2 relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)).
- **APCA Lc** uses APCA 0.0.98G-4g constants: exponents 0.56 / 0.57 (normal polarity) and 0.65 / 0.62 (reverse), scale 1.14, offset 0.027, black-clamp 0.022 / 1.414 ([APCA-W3 reference](https://github.com/Myndex/apca-w3); thresholds from [APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)). Positive Lc means dark text on a light background; negative means light text on dark.
- **CVD:** Machado 2009 matrices (severity 1.0) applied in linear RGB, then ΔE in OKLab ×100 ([Machado et al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)).
- Script: `C:\Users\bvetr\AppData\Local\Temp\claude\C--Users-bvetr-Desktop-Projects-Nenaugad\6bc4d1a5-4627-4fc4-9da8-6f32bfc48747\scratchpad\pal.js` (temporary scratch; it can be copied into the repo as a token contrast test).

### Shared status set (used by all three palettes)

| Token | HEX | OKLCH | Key pair | WCAG | APCA Lc |
|---|---|---|---|---|---|
| pass text | `#146D34` | oklch(47.1% 0.120 150.1) | on pass bg `#DAF8DF` / on white | 5.65 / 6.43 | 72.7 / 81.5 |
| pass bg | `#DAF8DF` | oklch(95.1% 0.046 150.1) | — | — | — |
| pass solid (icon) | `#229944` | oklch(60.1% 0.160 148.1) | vs white (non-text ≥ 3:1) | 3.68 | 63.9 |
| unknown text | `#875315` | oklch(49.1% 0.100 65.0) | on unknown bg `#FFEFC8` / on white | 5.62 / 6.41 | 72.7 / 81.5 |
| unknown bg | `#FFEFC8` | oklch(95.5% 0.053 88.4) | — | — | — |
| unknown solid | `#F5AF20` | oklch(80.0% 0.160 78.3) | vs white: **1.90 (fails 3:1)**; `#1A1A1A` on it 9.15 | 1.90 / 9.15 | 36.0 / 66.2 |
| fail text | `#B7191C` | oklch(50.0% 0.190 27.1) | on fail bg `#FFE6E5` / on white | 5.59 / 6.63 | 69.3 / 80.8 |
| fail bg | `#FFE6E5` | oklch(94.5% 0.028 20.4) | — | — | — |
| fail solid | `#DB2C2B` | oklch(58.0% 0.210 27.1) | vs white | 4.76 | 71.3 |
| neutral text | `#565E69` | oklch(47.9% 0.020 256.3) | on neutral bg `#EAEDF1` / on white | 5.59 / 6.56 | 71.6 / 82.5 |
| neutral bg | `#EAEDF1` | oklch(94.5% 0.006 255.5) | — | — | — |
| neutral solid | `#7E8792` | oklch(62.0% 0.020 253.4) | vs white | 3.64 | 64.0 |

On each palette's paper, all four status text colors measure **5.94–6.18:1** (APCA Lc 75–78), so they pass AA for normal text.

### P1 — "Кобальт / Cobalt Protocol" (recommended)
Concept: protocol stamp and ink. Electric cobalt as full-bleed bands and cards, with white type; warm paper; near-black cobalt ink; aqua as a "highlighter" for matched evidence.

| Token | HEX | OKLCH |
|---|---|---|
| paper | `#F8F7F2` | oklch(97.6% 0.007 97.4) |
| ink | `#0C1323` | oklch(18.9% 0.034 265.3) |
| muted text | `#505869` | oklch(46.0% 0.030 265.3) |
| brand (surface) | `#0035F0` | oklch(47.0% 0.274 264.0) |
| brand-text (links) | `#0032E2` | oklch(45.0% 0.261 264.0) |
| brand-tint | `#DAE7FF` | oklch(92.6% 0.036 262.8) |
| brand-deep | `#021969` | oklch(26.9% 0.140 264.1) |
| accent (aqua highlighter) | `#7BF5F5` | oklch(90.0% 0.110 195.4) |

| Pair | WCAG | APCA Lc | Verdict |
|---|---|---|---|
| ink on paper | 17.28 | 100.2 | AAA |
| muted on paper / on white | 6.66 / 7.14 | 79.9 / 84.8 | AA |
| **white on brand** | **7.59** | −89.4 | AAA body text on cobalt surfaces |
| ink on brand | 2.44 | 18.6 | **Fail**: never put dark text on cobalt |
| brand-text on paper / white | 7.66 / 8.22 | 81.7 / 86.6 | AAA links |
| ink on brand-tint | 14.88 | 90.4 | AAA |
| brand-text on brand-tint | 6.60 | 72.0 | AA |
| white / paper on brand-deep | 15.61 / 14.55 | −104.5 / −99.2 | AAA |
| ink on accent | 14.32 | 88.3 | AAA (white on accent 1.29: fail) |
| brand vs paper (component boundary) | 7.07 | 79.6 | passes 1.4.11 |
| focus ring on brand surface: white | 7.59 | — | use white or paper rings on cobalt (ink ring 2.44 fails) |

Brand vs status solids, ΔE×100 (normal / protan / deutan / tritan): pass 39.5 / 34.7 / 34.4 / 12.5; unknown 54.5 / 44.7 / 51.7 / 35.5; fail 44.0 / 31.4 / 37.5 / 35.1; neutral 29.5 / 23.5 / 26.3 / 13.8. Distinct in every simulated condition; the tritan pass and neutral figures are the lowest. Hue 264 sits at Tailwind "blue", not indigo or violet; the inference is that it avoids the AI gradient palette. The difference from today's `#3456D1` (C 0.19) is chroma 0.27 and its use as a surface.

### P2 — "Фуксия / Fuchsia Ledger" (boldest; needs status discipline)
Concept: a ledger marker in rhodamine ink. The first attempt, hot pink `#EF1993` (oklch 62.9% 0.250 354), **failed**: white on it was 4.01:1, it sat at ΔE 14.5 from fail red, and at deuteranopia ΔE 2.7 from neutral grey. The tuned version moves to H 340, L 0.55 and pairs it with a light pink tint for large calm areas.

| Token | HEX | OKLCH |
|---|---|---|
| paper | `#FAF5F8` | oklch(97.5% 0.007 340.4) |
| ink | `#1A1017` | oklch(18.9% 0.021 337.9) |
| muted text | `#60545C` | oklch(46% 0.02 340) |
| brand (deep surface) | `#C2009C` | oklch(55.0% 0.239 339.9) |
| brand-text (links) | `#840074` | oklch(42.0% 0.187 335.0) |
| brand-tint (light surface) | `#FDD8EF` | oklch(92.0% 0.051 340.4) |
| light-vivid surface option | `#FFB3DD` | oklch(85.1% 0.102 345.2) |
| accent (sky) | `#94DCFF` | oklch(85.9% 0.087 230.0) |

| Pair | WCAG | Verdict |
|---|---|---|
| ink on paper | ≈17.2 | AAA |
| muted on paper | 6.67 | AA |
| **white on brand `#C2009C`** | **5.56** | AA body text |
| ink on brand | 3.34 | large text only |
| brand vs paper (boundary) | 5.16 | passes 1.4.11 |
| brand-text `#840074` on paper | 8.72 (Lc 84.3) | AAA |
| ink on brand-tint / brand-text on brand-tint | 14.37 / 7.27 | AAA |
| ink on light-vivid `#FFB3DD` | 11.27 | AAA (white on it 1.65: fail) |
| ink on accent `#94DCFF` | 12.32 | AAA |

Brand `#C2009C` vs status solids, ΔE×100 (normal / protan / deutan / tritan): pass 40.0 / 28.7 / 14.7 / 32.5; unknown 39.6 / 41.2 / 34.1 / 26.1; **fail 18.4 / 19.9 / 17.9 / 8.9**; **neutral 24.9 / 20.0 / 7.8 / 24.1**. The light-vivid `#FFB3DD` surface is safer: fail 31.0, neutral under deuteranopia 23.4. Risks: proximity to fail red and, for deuteranopes, to neutral grey; magenta at H 335 and below drifts toward purple, which the owner wants to avoid; and pale pink + black resembles Klarna's code (see B2).

### P3 — "Петроль / Petrol Signal"
Concept: instrument and signal. Bright cyan as the light-vivid surface (hero bands, selected filters) with ink text; deep petrol as the dark surface and button color with white text; dark petrol for links.

| Token | HEX | OKLCH |
|---|---|---|
| paper | `#F1F8F9` | oklch(97.4% 0.008 207.1) |
| ink | `#04191F` | oklch(19.9% 0.030 218.8) |
| muted text | `#465C64` | oklch(46.0% 0.030 222.2) |
| brand (light-vivid surface) | `#22DEE6` | oklch(82.0% 0.135 199.6) |
| brand-text (links) | `#005F75` | oklch(44.9% 0.082 220.8) |
| brand-tint | `#D1F3F4` | oklch(94.0% 0.035 198.7) |
| brand-deep (dark surface, primary button) | `#004250` | oklch(35.0% 0.063 217.7) |

| Pair | WCAG | APCA Lc | Verdict |
|---|---|---|---|
| ink on paper | 16.78 | 99.6 | AAA |
| muted on paper / white | 6.57 / 7.06 | 79.4 / 84.5 | AA |
| **ink on brand cyan** | **10.88** | 73.9 | AAA |
| white on brand cyan | 1.66 | −32.1 | **Fail**: never use white on cyan |
| brand-text on paper / white | 6.75 / 7.26 | 79.7 / 84.7 | AA / AAA |
| ink on brand-tint / brand-text on brand-tint | 15.32 / 6.16 | 93.6 / 73.6 | AAA / AA |
| white on brand-deep | 11.08 | −99.0 | AAA (primary buttons) |
| brand cyan on brand-deep | 6.68 | −65.6 | AA (cyan type on petrol bands) |
| brand cyan vs paper (boundary) | 1.54 | 23.5 | **Fails 1.4.11**: cyan controls on paper need an ink or petrol border |

Brand vs status solids, ΔE×100 (normal / protan / deutan / tritan): pass 25.5 / 26.7 / 24.8 / 23.7; unknown 25.8 / 21.5 / 21.4 / 26.6; fail 42.0 / 41.3 / 27.3 / 45.1; neutral 23.6 / 24.5 / 19.9 / 25.2. Distinct throughout. Brand-text vs status texts: pass 12.3, neutral 7.3, so petrol links sit close to neutral grey text and must be underlined. An orange accent `#FC6B33` was tested and **rejected**: ΔE 13.0 to fail red and 15.5 to unknown amber.

### Inferences
- **P1 best matches "evidence, not at random"**: it has the widest status separation, white type on the brand, and a hue far from all three status families. It feels like a stamped protocol. Pair it with Science Gothic or Tektur for headlines and Golos Text or Geologica for UI, plus Martian or JetBrains Mono (or a `tnum` UI face) for salary and time.
- **P3** is a fresher take, with light cyan bands. It needs border discipline for 1.4.11 and underlined links.
- **P2** is the most memorable and the riskiest for a product whose content is red/green/amber conditions.
- **Responsive and zoom constraints** (320px, 200% text zoom) are unaffected by these color choices. Color-blocked bands must reflow and must not rely on fixed-height text containers.

### Gaps
- Dark-mode variants were not computed. APCA's dark-mode guidance is itself still a draft ([APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)).
- P3 display variants (`@media (color-gamut: p3)`) were not computed.
- No competitor color audit of Russian job boards (hh.ru, SuperJob, Habr Career, getmatch) was done, so "ownable" is judged only against the global references above.
