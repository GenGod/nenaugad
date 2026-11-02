# Make the evidence Nenaugad's signature

Nenaugad's current skin reads as AI-made because it matches the second-generation "anti-slop" default almost exactly. Its warm paper #F7F5F0 sits ΔE 1.2 from the cream (#F4F1EA) that Anthropic's own frontend skill now names as a generic AI default. The rest of the skin repeats tells that designers and automated detectors count: a serif hero with a floating example card, a three-icon feature strip, uniform white 12px cards, Inter, and one safe blue. The job-board market leaves only one thing unclaimed, and it happens to be Nenaugad's core: no board among the 27 sampled shows conditions as pass / unknown / fail with the source quote, and none draws a candidate's working-hours overlap. The recommended direction is **«Сигнал» (Signal)**. It is an instrument-panel language: a cool paper, an ink-bordered cyan #22DEE6 used as a surface and as the highlighter on quoted evidence, Tektur and Geologica type, and a status grammar in which "unknown" is a hatched, dashed "?" and not a grey or amber chip. It is the only one of three computed palettes that leaves both the category's blue cluster and the warm-cream default. Its worst-case brand-to-status distance under simulated colour blindness is ΔE 19.9 (OKLab ×100). The two alternatives are a conservative **Cobalt Protocol**, which offers the most continuity with Atlas but sits inside the job-board blue cluster, and a bold **Rose Ledger**, which is the most ownable among job boards but crowded by Klarna and, in Russia, by Wildberries' registered fuchsia. AGENTS.md declares Atlas 1.1 the approved appearance and says "Do not redesign Nenaugad", so adopting any of them is an owner decision, an Atlas 2.0, and this report is input to it. The behavioural contract of Atlas 1.1 can stay intact in every direction: three independent status axes, the Ground disclosure, the OverlapBand with a text equivalent, and 44px targets. What changes is the token layer, the component skins and the home-page composition.

## The current skin trips the newest AI tell, not just the old ones

By mid-2026, critics had turned "looks AI-made" into countable CSS and DOM checks. Adrian Krebs ran deterministic Playwright checks on **1,590 Show HN submissions** and found **22% scored "High" (4+ AI patterns)**, 32% Medium and 46% Low, with an estimated 5–10% false-positive rate ([Krebs](https://www.adriankrebs.ch/blog/design-slop/)). Open-source detectors such as pixelslop and Paul Bakaus's 62-check Impeccable set thresholds as specific as "radius 8–20px plus any box-shadow, more than 4 times" ([pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md); [Impeccable](https://impeccable.style)). Across about fifteen sources reviewed for this report, the most-cited tells were:

1. purple-to-blue gradients (about 10 sources);
2. Inter or another default sans on everything (about 8);
3. three identical icon-topped feature cards (about 8);
4. one radius with a soft shadow or thin border everywhere (about 8);
5. a centred hero (about 5).

These counts are the researchers' own tally, not a published statistic.

The more uncomfortable finding is a second wave. Anthropic's current frontend-design skill lists these as looks that "read as AI-generated":

- **"a warm cream background (near #F4F1EA) with a high-contrast serif display"**;
- a terracotta accent;
- a broadsheet layout with hairline rules and zero radius;
- near-black with an acid-green or vermilion accent;
- the "SaaS-card kit" of identical rounded cards.

([Anthropic SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)). Design Arena, a platform where people vote on AI-generated designs, reportedly asked whether "beige, serif sites [have] become the new purple gradients". It said the losing styles shared a beige background, a large serif headline and a rounded panel floating on the right. That claim comes only from a search summary, because the post itself returned HTTP 402 ([Design Arena on X](https://x.com/DesignArena/status/2111246612320416039)).

The table below maps Nenaugad's current elements against this catalogue. Two figures in it were computed for this report: OKLab ΔE ×100, and OKLCH hue.

| Current element | Catalogued tell | Evidence |
|---|---|---|
| Paper #F7F5F0 with Source Serif 4 headings | Gen-2 "cream + high-contrast serif display" | #F7F5F0 is ΔE 1.2 from Anthropic's named #F4F1EA, which is visually the same colour ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)) |
| Serif hero with a floating example card | Design Arena's reported losing pattern | Search-summary evidence only ([Design Arena](https://x.com/DesignArena/status/2111246612320416039)) |
| Checkmark rows in that card | Placeholder line icons (rocket, bolt, checkmark) | ([Snoddy](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/)) |
| Three-column icon + bold title + grey sentence strip | The most-cited layout tell | ([Krebs](https://www.adriankrebs.ch/blog/design-slop/); [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)) |
| Inter for all UI | Default-font tell; also on OpenAI's recommended GPT-5 frontend list | ([Anthropic blog](https://www.claude.com/blog/improving-frontend-design-through-skills); [OpenAI cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_frontend)) |
| White cards, 12px radius, thin borders | "GPT thin border", uniform radius | ([Impeccable](https://impeccable.style); [Canatselis](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)) |
| One blue action #3456D1 | The "one safe blue/indigo primary" | OKLCH hue 267°, between Tailwind blue-600 (263°) and indigo-500 (277°) ([Tailwind v3 colours](https://v3.tailwindcss.com/docs/customizing-colors)) |
| Green/amber/red pills | "Status-chip soup" risk | The meaning is real here; only the generic rendering is the problem ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) |

That makes six to eight hits, above Krebs's four-pattern "High" threshold. This is an inference, because his exact pattern set differs. The cause is structural and will recur. Anthropic calls it **"distributional convergence"**: safe patterns dominate the training data, so "without direction, Claude samples from this high-probability center" ([Anthropic blog](https://www.claude.com/blog/improving-frontend-design-through-skills)). Tailwind's creator joked that he was sorry for making every Tailwind UI button `bg-indigo-500` ([dev.to/alanwest](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p)). Next.js documents Geist as its canonical font example ([Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts)). The trap is recursive: Anthropic's own early anti-slop advice (distinctive serifs, warm palettes) seems to have produced the cream-and-serif look that its skill now bans. Moving from purple to cream, or from cream to near-black with acid green, only moves Nenaugad to the next default.

The skin is the problem, not the rules beneath it. Atlas 1.1 already says the feed "does not consist of hero blocks", that "a generic shield icon does not replace verification", and that it should avoid "random AI gradients and 3D stickers". It also keeps conditions, freshness and personal progress as separate status languages (`docs/solo/context/ATLAS_DESIGN_LANGUAGE.md`). Those principles are worth keeping. The tokens and the marketing composition drifted into the generation-2 default.

## Job boards converge on blue chips, and none draws the candidate's side

A survey of 27 platforms on 2 November 2026 read colours from live pages' computed styles. Nearly every list uses the same object: **logo, title, company, then a row of pill chips** for location, salary, type and skills. Blue or green is the action colour, the type is a neutral grotesque, and a yellow or tinted row means "paid". Blue is the overwhelming default:

| Board | Blue |
|---|---|
| hh.ru | #0070FF |
| getmatch | #205AED |
| Arc | #075AFF |
| Indeed | #004FCB |
| Toptal | #204ECF |
| LinkedIn | #0A66C2 |
| remocate | #2563EB, which is Tailwind blue-600 |

([hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend); [getmatch](https://getmatch.ru/vacancies); [Arc](https://arc.dev/remote-jobs); [Indeed](https://www.indeed.com/q-remote-frontend-jobs.html); [remocate](https://www.remocate.app/)). Computed for this report, these blues fall in a narrow OKLCH hue band of **255–265°**.

Every other strong colour is also claimed:

- **Green:** Glassdoor, SuperJob, Peerlist ([Glassdoor](https://www.glassdoor.com/Job/remote-frontend-developer-jobs-SRCH_IL.0,6_IS11047_KO7,25.htm); [SuperJob](https://www.superjob.ru/vakansii/udalennaya-rabota.html)).
- **Violet:** Хабр Карьера #8164F7, Himalayas #9F7AEA ([Habr Career](https://career.habr.com/vacancies?remote=true&type=all); [Himalayas via Wayback](https://web.archive.org/web/2026id_/https://himalayas.app/jobs)).
- **Yellow:** owned by Welcome to the Jungle (WTTJ) #FFCD00 with its bespoke 900-weight display face. It is also the paid-row signal on We Work Remotely (#FFD500) and Remote OK (#FFF38F) ([WTTJ](https://www.welcometothejungle.com/en/jobs?refinementList%5Bremote%5D%5B%5D=fulltime); [WWR](https://weworkremotely.com/); [Remote OK](https://remoteok.com/)).
- **Brown/orange:** Remotive #532A21 / #FF871A ([Remotive](https://remotive.com/remote-jobs)).

Several 2024–26 entrants simply ship framework defaults. Peerlist uses Geist with Tailwind slate, and the black pill CTA appears on Jobicy, WTTJ, Wellfound, Jobright and getmatch. Jobicy uses a two-tone headline, and Contra's hero is an AI chat box ([Peerlist](https://peerlist.io/jobs); [Jobicy](https://jobicy.com/); [Contra](https://contra.com/)). In Russia, hh.ru's 2025 identity by ONY now owns **light as a metaphor**, hatched illustrations and a custom "hh sans". It won RUWARD 2026 ([Sostav](https://www.sostav.ru/publication/svet-na-puti-poiska-novyj-vizualnyj-stil-hh-ru-77679.html)).

Fit is shown as a **single score or a matched/unmatched highlight**:

- Jobright's "Match Score" ([Jobright](https://jobright.ai/ai-job-match));
- LinkedIn Premium's high/medium/low rating ([Social Media Today](https://www.socialmediatoday.com/news/linkedin-ai-tools-job-seekers-recruiters-smbs/737481/));
- Indeed's green "Profile insights" ([Indeed Help](https://support.indeed.com/hc/en-us/articles/32603395892109)).

None of these can tell "the posting says no" from "the posting doesn't say". Honest unknowns exist only piecemeal, and almost always for salary. Хабр writes «Зарплата не указана | Похожие специалисты получают 155 000 – 244 000 ₽». Indeed shows "Pay information not provided" and Glassdoor "(Employer provided)". Remote OK hedges with "Probably worldwide", and it also turns unknown salary into a paywall ("Upgrade to Premium to see salary") ([Habr Career](https://career.habr.com/vacancies?remote=true&type=all); [Remote OK](https://remoteok.com/)). Time zones appear only as text: Arc's "Overlap with Eastern Time (US & Canada) working hours", and Himalayas' "Country or timezone" filter ([Arc](https://arc.dev/remote-jobs)). No list view sampled draws an overlap band. WTTJ publicly says it is "currently working on a system that will clearly explain why a job is considered a match" ([WTTJ help](https://help.welcometothejungle.com/en/why-has-the-search-experience-changed-on-welcome-to-the-jungle)). The explained-fit position is open today and will not stay open forever.

Two cross-checks narrow what looks "open". First, **"open in the category" is not the same as "safe from AI defaults."** The landscape survey suggested vermilion-on-ink and structural acid chartreuse, but Anthropic's skill names "near-black with acid-green or vermilion accent" as a generic AI look ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)). Second, **the pink lane is crowded outside job boards.** Otta's loud pink left the market when WTTJ absorbed it in 2024 ([Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/); [Mondaq](https://www.mondaq.com/pressrelease/131590/welcome-to-the-jungle-acquires-job-search-platform-otta)). But in June 2024 Wildberries registered a colour trademark gradient with Rospatent (No. 1023991): fuchsia Pantone 2395C, violet 254C and dark violet 2617C ([Retail.ru](https://www.retail.ru/news/wildberries-zaregistriroval-v-rospatente-svoy-firmennyy-tsvet-i-gradient-30-iyunya-2024-242308/)). Pantone 2395C approximates **#C800A1** on screen ([ColorXS](https://www.colorxs.com/color/pantone-2395-c)). That is ΔE 1.4 from the deep fuchsia #C2009C that the palette research tuned as its boldest option, which is a near-identical colour. Klarna's pink #FFB3C7 is ΔE 3.1 from the lighter pink #FFB3DD ([webdesignhot Klarna, unofficial](https://www.webdesignhot.com/design.md/klarna/)). The colours still open are a cool cyan or petrol used as a light surface, and a light pink accepted with its risks. Cobalt is not open: it is the category's own hue made louder.

## Structure survives density, and styles are now downloadable templates

Ten candidate aesthetic directions were assessed against a dense, evidence-first, WCAG 2.2 AA work tool. The pattern is clear. **Structural languages survive working screens; decorative ones belong to brand moments; and by 2026 most of them ship as one-click templates for AI agents.**

| Direction | Fit for Nenaugad's working screens | 2026 status |
|---|---|---|
| Instrument / wayfinding: departure boards, Flighty, Bloomberg, Nothing used sparingly | High: built to state facts under uncertainty, such as "gate not yet assigned" | Viable. Flighty won the 2023 Apple Design Award for Interaction ([Travel Daily News](https://www.traveldailynews.com/technology/flighty-wins-apple-design-award/)). Cloning Nothing's dot-matrix is derivative ([shadcn.io Nothing DESIGN.md](https://www.shadcn.io/design/nothing)) |
| Civic honest-service (GOV.UK) | High for the rules: text tags, few statuses, adjectives not verbs, an unmistakable focus ring | Reads as "government" if copied visually ([GOV.UK Tag](https://design-system.service.gov.uk/components/tag/); [GOV.UK focus](https://design-system.service.gov.uk/get-started/focus-states/)) |
| Swiss grid + big grotesque | High as the skeleton | Packaged as a "swiss-design-skill" for agents ([README](https://cdn.jsdelivr.net/gh/zeke/swiss-design-skill@main/README.md)) |
| Data-forward monospace accents | High only for verbatim data | "Monospace for small data labels" is itself an Anthropic-listed default ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)) |
| One ownable bright colour (Wise, Monzo) | High if kept out of status | Wise left "safe blue" for citrus green in 2023 because blue had become the fintech convention ([Tearsheet](https://tearsheet.co/marketing/from-safe-blue-to-citrus-green-how-wise-rebranded-to-an-identity-that-is-exciting-and-good-for-its-bottom-line/)) |
| Editorial / magazine | Medium-high on detail pages, weak on lists | Gen-2 cream + serif is its AI form. Read.cv closed in 2025 |
| Label / ticket / stamp ephemera | Medium as a metaphor, low as texture | No authoritative source shows it in working screens |
| Neo-brutalism | Low-medium: a "soft" subset of borders and flat fills survives | NN/g warns it can "overwhelm users and hinder accessibility" ([NN/g](https://www.nngroup.com/articles/neobrutalism/)). Shipped as RetroUI and as agent skills ([RetroUI](https://retroui.shadcn.io/blogs/why-neobrutalism-is-perfect-for-modern-websites)) |
| Toy UI, mascots | Low: trivialises rejection and implies odds | Organic blobs "almost never ship" on conversion flows ([StudioMeyer](https://studiomeyer.io/en/blog/webdesign-trends-2026-reality-check)) |
| Kinetic type, glass, blobs | Low | Classed "overpromised" in 2026 ([StudioMeyer](https://studiomeyer.io/en/blog/webdesign-trends-2026-reality-check)) |

Bento grids and the broadsheet hairline look are now defaults in their own right. Community DESIGN.md files already clone Gumroad, Nothing, Monzo, Wise, Duolingo and Teenage Engineering ([webdesignhot Gumroad](https://www.webdesignhot.com/design.md/gumroad/); [shadcn.io](https://www.shadcn.io/design/nothing)). Figma's 2026 list still promotes neo-brutalism and maximalism, and calls dark mode and gradients "baseline expectations" ([Figma](https://www.figma.com/resource-library/web-design-trends/)). An agent can download any named style, so a named style cannot be the source of distinctiveness. What an agent cannot download is a component that renders Nenaugad's own truth. Here that means five conditions, three honest states and a quote under each. PostHog's operating-system website shows the same principle at brand scale: one bold, product-specific concept carried everywhere ([PostHog](https://posthog.com/blog/why-os)). The working composite is therefore:

- a Swiss skeleton;
- an instrument-panel signature for the Condition Map;
- civic status discipline;
- one vivid brand hue kept out of the status layer;
- monospace only where the text is literally machine data or a verbatim quote.

## Cyrillic narrows the type field in Nenaugad's favour

Most of the second-tier "LLM fonts" simply do not exist in Russian. Of the 1,959 Google Fonts families, **296 carry a Cyrillic subset**. The following have none ([Google Fonts metadata](https://fonts.google.com/metadata/fonts)):

- Space Grotesk and Instrument Serif, which Krebs and Anthropic flag as converged-on, and Bricolage Grotesque, which Anthropic once suggested as "distinctive";
- Fraunces, DM Sans, Syne and Plus Jakarta Sans;
- the monospaces Space Mono and DM Mono.

The Russian-language trap is a different set: the most-used Cyrillic families. Google Fonts popularity ranks put Oswald at 2, Montserrat at 3, Raleway at 14, Playfair Display at 19, Manrope at 24, IBM Plex Sans at 25 and Cormorant Garamond at 30. Unbounded (85) reads as the "crypto-era" display face; it was funded through the Polkadot treasury ([Unbounded description](https://github.com/google/fonts/blob/main/ofl/unbounded/DESCRIPTION.en_us.html)). Rarely used faces with verified Cyrillic give the most ownability per unit of effort. Every face below is OFL licensed, has a verified `cyrillic` subset in the Google Fonts metadata, and was rendered with Russian text by the researchers.

| Role | Face | Verified facts | Fit |
|---|---|---|---|
| Display | **Tektur** | Octagonal outlines; `wght` 400–900, `wdth` 75–100; `tnum` glyphs in source; rank 243 ([specimen](https://fonts.google.com/specimen/Tektur); [tnum search](https://github.com/search?q=repo%3Ahyvyys%2FTektur+tnum&type=code)) | Instrument and readout voice. Big numerals for hours and pay |
| Display | **Science Gothic** (2025) | `wdth` 50–200, `wght` 100–900, contrast axis; `tnum`; rank 794 ([specimen](https://fonts.google.com/specimen/Science+Gothic); [tnum search](https://github.com/search?q=repo%3Agooglefonts%2Fscience-gothic+tnum&type=code)) | Wide "protocol" headers and stamps |
| Display | **Dela Gothic One** | Ultra-heavy poster gothic, single weight, `tnum` unverified; rank 166 ([specimen](https://fonts.google.com/specimen/Dela+Gothic+One)) | One-line poster statements only |
| UI | **Geologica** | `wght` 100–900, sharpness and cursive axes, oblique; rank 108; **`tnum` unverified** ([specimen](https://fonts.google.com/specimen/Geologica)) | Most ownable UI face; check figures first |
| UI | **Golos Text** | ParaType 2019 (Korolkova, Kuzmin), made for state and social-service sites; `tnum` verified; no italics ([description](https://github.com/google/fonts/blob/main/ofl/golostext/DESCRIPTION.en_us.html); [tnum search](https://github.com/search?q=repo%3Agooglefonts%2Fgolos-text+tnum&type=code)) | Safest; sober and "civic" |
| UI | **Commissioner** | Flare and volume axes grow glyphic serifs; tabular figures since v1.012 ([README](https://github.com/kosbarts/Commissioner)) | Gives a "document" quote voice within one family |
| Data | **Martian Mono** | Width 75–112.5, weight 100–800; basic Cyrillic only, added 2023 ([description](https://github.com/google/fonts/blob/main/ofl/martianmono/DESCRIPTION.en_us.html)) | UTC offsets, times, dates |
| Quote | **PT Mono** | ParaType, single weight, Cyrillic + extended ([specimen](https://fonts.google.com/specimen/PT+Mono)) | Typewritten "excerpt" voice |

Several faces from the research are ruled out or limited:

- **Sofia Sans** rendered Bulgarian-style в and д by default, so test it with `lang="ru"` before use.
- **TikTok Sans** has `tnum` and Cyrillic by Contrast Foundry, but carries the TikTok association ([TikTok Sans](https://github.com/TikTok/TikTokSans)).
- **Geist Mono** is tied to the Vercel look.

For a paid option, type.today sells Cyrillic display faces from about **US$50 per style for a web licence**, Druk Cyrillic among them ([type.today Zhivov](https://type.today/en/zhivov/regular); [type.today Druk](https://type.today/en/druk_wide/bold)). TypeType prices TT Norms Pro web licences by monthly visits, so check any EULA before buying ([Fontspring](https://www.fontspring.com/fonts/typetype/tt-norms-pro)). Any Google face can be self-hosted through `next/font` with no requests to Google ([Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts)). That keeps Atlas's "no external font/CDN requests" rule. The research could not resolve two points: Russian italic and cursive forms at text size, and figure support in Geologica. A designer must check д, л, к and the cursive т/д/и before committing.

## Vivid colour works only as a surface, kept out of the status layer

Brands that are both vivid and legible put **dark ink on a light, saturated surface**, or white on a deep one, and never mix the two. Computed from third-party hex values:

| Brand | Dark ink on the surface | White on the surface |
|---|---|---|
| Wise: forest #163300 on lime #9FE870 | 9.45:1 | 1.47:1 |
| Mailchimp: Peppercorn on Cavendish yellow | 12.72:1 | 1.32:1 |
| Klarna: black #0B051D on its pink | 11.89:1 | 1.68:1 |

Duolingo's white on Feather Green computes to **2.09:1**, which fails even the 3:1 large-text bar ([Refero Wise](https://styles.refero.design/style/367c0c6e-73a7-441c-a8ff-91d139ac60dc); [Klarna guidelines](https://docs.klarna.com/resources/marketing-tools/global-marketing-assets/brand-guidelines.md); [Mailchimp brand assets](https://mailchimp.com/about/brand-assets/)).

The workflow:

1. Build the palette in OKLCH, where lightness is perceptual ([Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)).
2. Generate 12-step scales on the Radix pattern. Its bright hues (lime, yellow, amber, sky) are designed for dark text ([Radix](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).
3. Gate every pair in CI against WCAG 2.2 conformance values:
   - 4.5:1 for text ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html));
   - 3:1 for component boundaries and meaningful graphics ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html));
   - colour never the only carrier of meaning ([1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
4. Keep APCA as an advisory column only, since it is a WCAG 3 candidate and not adopted ([APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)).

Brand and status must be separated by **lightness and role, not hue alone**. The researchers simulated colour-vision deficiency with Machado 2009 matrices and measured distances in OKLab ([Machado et al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html); [Ottosson](https://bottosson.github.io/posts/oklab/)). Green "pass" and red "fail" solids sit 32.4 apart for normal vision but **only 3.6 apart under deuteranopia**. A saturated pink brand #EF1993 sat **2.7** from neutral grey under deuteranopia, which makes them indistinguishable. So a glyph and a word are mandatory on every status. The brand hue must also come from outside the status families: green 140–155°, amber 65–85° and red 20–35° in OKLCH. That excludes a green brand, however fashionable Wise made it. Nenaugad's current #3456D1 is already 22–29 ΔE from its status colours, so it is generic but not unsafe.

The three computed palettes, with key WCAG 2.x pairs:

| Palette | Core tokens | Key contrasts | Worst brand-to-status ΔE under CVD |
|---|---|---|---|
| **Signal (petrol/cyan)** | paper #F1F8F9, ink #04191F, cyan #22DEE6, petrol #004250, links #005F75 | ink on cyan **10.88**; white on petrol 11.08; links on paper 6.75. White on cyan 1.66 is forbidden. Cyan vs paper 1.54, so cyan controls need an ink border | **19.9** (neutral, deuteranopia) |
| **Cobalt Protocol** | white canvas, ink #0C1323, cobalt #0035F0, links #0032E2, deep #021969, aqua #7BF5F5 | white on cobalt **7.59**; links on white 8.22; ink on aqua 14.32. Ink on cobalt 2.44 is forbidden | **12.5** (pass, tritanopia) |
| **Rose Ledger** | paper #FAF5F8, ink #1A1017, rose #FFB3DD, sky #94DCFF | ink on rose **11.27**; ink on sky 12.33. White on rose 1.65 is forbidden. Rose vs paper 1.53, so it needs a border | 19.3 with a non-amber "unknown"; **6.6** vs amber under tritanopia |

The shared status set clears AA on every paper, at 5.94–6.16:1 for text:

| Status | Text | Background | Solid |
|---|---|---|---|
| Pass | #146D34 | #DAF8DF | #229944 |
| Fail | #B7191C | #FFE6E5 | #DB2C2B |
| Neutral | #565E69 | #EAEDF1 | — |

Values come from the researchers' script, plus figures computed for this report with the same formulas ([WCAG 2.2 relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)).

One recommendation departs from Atlas 1.1: **retire amber as the colour of "unknown."** Atlas currently renders "clarification" as amber #885619 on #FFF3DF. There are three reasons to stop:

- Amber is the middle of a traffic light, so it reads as "probably" or "partly". Value-suppressing uncertainty palettes argue for removing value encoding where uncertainty is high ([Correll, Moritz, Heer](https://www.tableau.com/research/publications/value-suppressing-uncertainty-palettes)).
- Warm yellow tints are the remote-board signal for "paid row".
- Grey is no alternative, because it reads as disabled. Song and Szafir found that downplaying missing data lowers perceived quality and skews interpretation ([CU Boulder VisuaLab](https://cmci.colorado.edu/visualab/MissingData)).

The replacement is an **achromatic ink hatch with a dashed outline**. Hatching and dashing read as "uncertain" without hue, and participants preferred dashed lines ([AVIZ sketchiness study](https://www.aviz.fr/Research/UncertaintySketchy)). Ink lines on paper measure 16.8:1. Keep text off the hatch, because patterns behind text become noise ([Highcharts](https://www.highcharts.com/docs/accessibility/patterns-and-contrast)). hh.ru uses hatching in its illustrations, so use a pitch and angle that differ from its look and test them. The palette research's amber set (#875315 on #FFEFC8, 5.62:1) remains a compliant fallback if testing shows hatched unknowns get overlooked.

## Five signature components turn the Condition Map into the brand

The identity must live in the list row and the job detail. On every board sampled, the brand difference sits in headers and heroes, which disappear as soon as a candidate scrolls. Five components can carry it, and Atlas 1.1 already specifies the behaviour of most of them.

**A three-state status grammar used everywhere.** GOV.UK warns that "the more you add, the harder it is for users to remember them", and that colour alone is "not accessible" ([GOV.UK Tag](https://design-system.service.gov.uk/components/tag/)). Each state therefore carries four cues, so it survives greyscale and colour blindness:

| Outcome | Fill | Outline | Glyph | Word |
|---|---|---|---|---|
| Pass | Solid pass green | Solid | ✓ | подходит |
| Unknown | Ink hatch on white | **Dashed** | ? | не указано в источнике |
| Fail | Solid fail red | Solid, plus a notched corner | ✕ | не подходит |

Reserve «—» for "not applicable", for example a pay sub-field that the contract type makes irrelevant. Datawrapper's rule applies: a gap must be deliberate and labelled ([Datawrapper](https://www.datawrapper.de/academy/patchy-data)).

**The overlap ribbon («Лента пересечения»).** The most legible form in World Time Buddy, Every Time Zone and Spacetime is aligned horizontal 24-hour strips on one axis ([World Time Buddy](https://www.worldtimebuddy.com/); [Spacetime](https://mattstromawn.com/projects/spacetime)). Circular dials such as TimeDials are more ownable but harder to read precisely ([TimeDials](https://www.timedials.com/)). Nenaugad compares only two parties, so the design uses two strips:

- «Ваши часы» and «Часы команды», both shown in the candidate's local time;
- a vertical intersection band labelled «Пересечение 3 ч · 11:00–14:00 по вашему времени»;
- a midnight tick, and a "now" marker in the style of Spacetime.

Two cases need their own treatment:

- **Hours not published:** the team strip is fully hatched and labelled «Часы не указаны».
- **Only a zone range ("UTC−3…UTC+2"):** draw it as a dashed, unfilled outline labelled «Указан только диапазон поясов», so the ribbon does not invent 9-to-5 hours.

The detail view needs 48–64px of height. In the list, the ribbon shrinks to a 24-cell micro-strip with "3 ч". It shows a duration, never a percentage. This is a skin for Atlas's existing OverlapBand, including its text equivalent and its summer/winter example.

**The «Условия вакансии» label.** Burkey Belser's 1994 Nutrition Facts label became iconic through a fixed, ruled, plain format, not decoration ([NPR](https://www.npr.org/2023/09/28/1202113376)). Its useful descendants work in two layers. In a CMU IoT label study, all 15 consumer participants clearly understood the primary layer, and the secondary layer held the detail ([arXiv 2002.04631](https://arxiv.org/pdf/2002.04631)). The label design:

- a heavy-ruled panel titled «Условия вакансии»;
- one line «по данным объявления · источник · дата»;
- five rows in fixed order with a tabular value column;
- a footer: «Это сверка с текстом объявления, а не гарантия найма или юридической допустимости».

Two traps to avoid. The EU energy label's A–G scale reads as a grade ([ECC-Net](https://www.eccnet.eu/news/european-energy-labels-good-environment-and-your-wallet)). And Apple's self-reported privacy labels show that an authoritative format can lend unearned trust: Apple does not verify the answers ([Apple Developer](https://developer.apple.com/app-store/app-privacy-details/)). Mark up the label semantically as a table or `<dl>` with row headers.

**The five-cell signal strip** is the compact form of the label in list rows. It is five equal cells in a fixed order (country · hours · contract · pay · requirements), so users learn the positions, and each cell uses the status grammar. It is an index, not a meter. Never draw it as a bar that "fills up", and avoid "4/5" counts.

**The Ground as a receipt.** Quote-first grounding is the honest pattern. Elicit surfaces "the most relevant supporting quotes" per claim ([Elicit product email](https://email.elicit.com/deliveries/dgTd9ggDAKHze6DzewGRV6Mar1nmdWdNl_mKLCI=)), and research describes direct quotes as making citations "verifiable by design" ([arXiv 2404.03862](https://arxiv.org/pdf/2404.03862.pdf)). In one controlled study (N=372), hover cards were associated with better evidence evaluation (β=0.08, p<0.05). That figure is reported through a review site, not read from the paper ([Moonlight review](https://www.themoonlight.io/review/seeing-to-think-how-source-transparency-design-shapes-interactive-information-seeking-and-evaluation-in-conversational-ai)). When open, each Ground shows:

- the exact quote in its own typographic voice, with the decisive words marked by `<mark>` plus an underline;
- the source and a link;
- a dated outline stamp, «сверено с объявлением · 02.11.2026».

An unknown becomes an **"empty receipt"**: «В объявлении нет слов о часах работы» over a hatched quote area. It is Nenaugad's [citation needed]. Wikipedia's tag grew from a footnote marker into a meme, which shows how a rigorous marker can become a brand symbol ([Wikiwand](https://www.wikiwand.com/en/Citation_needed_(Wikipedia))).

The receipt opens in three layers: a marker, a preview on focus or hover, and a pinned panel. Use tap on touch devices, and give markers accessible names such as «Основание для: страна найма». An «Об этой вакансии» panel, modelled on Google's "About this result", explains where the job came from and what Nenaugad did not check ([9to5Google](https://9to5google.com/2021/02/01/google-search-links-getting-about-this-result-panel-with-website-information/)). Do not add a Consensus-style aggregate meter; critics note that it collapses evidence into a verdict ([Aaron Tay](https://aarontay.substack.com/p/a-2025-deep-dive-of-consensus-promises)).

**The brand motif from «не наугад».** The cultural image of "at random" is Malkiel's blindfolded monkey throwing darts. In the WSJ contest that tested it (1988–2002), the professionals won 87 of 142 rounds ([Daily Princetonian](https://www.dailyprincetonian.com/article/2002/05/fourteen-years-of-darts-on-wall-street-lead-malkiel-to-reassert-stock-theory)). That image is useful as a 404 joke («Наугад мы не ищем»), not as a mark. Avoid dice: Dice is a long-running US tech job board, and dice suggest gambling ([Recruiter](https://www.recruiter.co.uk/news/2015/07/us-dice-rolls-out-rebranded-it-job-board)). Motifs of measurement fit better: registration marks, a 24-tick ruler, two overlapping bars, a crosshair of five ticks. Aim the copy at conditions, not outcomes: «Цель — видеть условия, а не угадывать».

**Personality moments.** Personality belongs at moments of commitment. Mailchimp's sweaty chimp finger over the send button is the canonical example ([The Next Web](https://thenextweb.com/news/genius-mailchimps-sweaty-monkey-finger)). Felt craft matters too, such as Linear's invisible submenu "safe triangle" ([Linear via Plushcap](https://www.plushcap.com/content/linear/blog/linear-invisible-details-building-contextual-menus)). For Nenaugad, there are four such moments:

- **Leaving to apply** is the commitment moment, because there is no auto-apply. A stamp reads «Отклик — на сайте работодателя», with a list of the unknowns worth asking about.
- **Opening a Ground** gets a single highlighter sweep over the decisive words.
- **The first unknown** gets a one-time line: «"Не указано" — не отказ. Это вопрос работодателю».
- **Keyboard keys 1–5** open the five Grounds.

Never celebrate a "pass". FiveThirtyEight's mascot was read as Clippy-like softening, and the NYT needle's random jitter drew public backlash ([Real Life](https://reallifemag.com/what-the-chart-wants/); [Quartz](https://qz.com/831944/the-new-york-times-election-result-projections-are-mostly-random-jitters)).

## Three directions for the owner, with Signal recommended

All three directions share the five signature components, the status grammar, Atlas 1.1's behaviour, 44/48px targets and 320px reflow. They differ in colour, type, geometry and which component leads.

### Direction 1 (recommended): «Сигнал» / Signal

The concept is an instrument board that reads conditions out. Cyan is the act of verification: it marks the words each conclusion rests on, so the brand colour and the evidence are the same thing.

| Token | HEX | Role | Key pair |
|---|---|---|---|
| paper | #F1F8F9 | Canvas: cool, hue 207°, not cream | ink 16.78 |
| surface | #FFFFFF | Label, panels, fields | ink 18.04 |
| ink | #04191F | Text, 2px borders, focus ring on paper and on cyan | on cyan 10.88 |
| muted | #465C64 | Secondary text | 6.57 on paper |
| signal | #22DEE6 | Header band, primary button fill (with ink border), selected filter, `<mark>` on quotes | never white on it (1.66) |
| signal-tint | #D1F3F4 | Hover and selected rows | ink 15.32 |
| petrol | #004250 | Deep bands (footer, «Об этой вакансии»), secondary button | white 11.08 |
| petrol-text | #005F75 | Links, always underlined | 6.75 on paper |

**Type**

| Role | Face and setting |
|---|---|
| Headings and big numerals («3 ч», pay in the label) | Tektur 700–900, `wdth` 75–100 |
| UI | Geologica 400/600 at sharpness 0. Body 16px, dense list 15px |
| Quotes | Geologica with cursive axis 1 and a slight slant. Verify Russian cursive forms |
| Times, UTC offsets, stamp dates | Martian Mono, width 87.5 |

**Geometry**
- Rectangles with 2px radius for data objects and 6px for controls.
- 2px ink borders on every interactive element.
- Rules of 1px between rows and 4px under the label title.
- No shadows: elevation comes from border weight and cyan fill.
- The 24-tick ruler is the only ornament, used at the header base, in the ribbon scale and in empty states.

**Layout**
- The home page is the search plus live list rows. No floating card and no feature strip.
- List rows, not cards, each with: title/company/source date · signal strip · overlap micro-strip · pay in tabular figures · save.
- Filters in a 240px left rail.
- Detail: a sticky Condition label beside the posting, with quotes highlighted in cyan. On mobile the label comes first.

**Motion**
- When a Ground opens, one 240ms cyan sweep across the decisive words.
- When the detail page first paints, one 300ms left-to-right fill of the overlap band.
- Nothing else moves, and everything is static under `prefers-reduced-motion`.

**Logo:** two bars whose overlap is cyan.

**Risks**
- Cyan on near-black reads as the AI neon tell: #22DEE6 is ΔE 5.2 from pixelslop's #00D4FF. Never put cyan on a dark ground.
- Cyan fails as a boundary on paper.
- Petrol links sit ΔE 7.3 from neutral grey text.
- Tektur may read as "gaming".
- Geologica's figures are unverified.

### Direction 2: «Протокол» / Cobalt Protocol (continuity)

The concept is a stamped verification protocol. This is today's hue (264° against 267°) pushed to the sRGB chroma limit and used as full-bleed bands. The cream is dropped for a white canvas.

| Token | HEX | Key pair |
|---|---|---|
| canvas | #FFFFFF | ink #0C1323: 18.53 |
| muted | #505869 | 7.14 on white |
| cobalt | #0035F0 | Header band, primary button. White 7.59. Never ink on it (2.44) |
| cobalt-text | #0032E2 | Links: 8.22 on white |
| cobalt-tint | #DAE7FF | Selected rows; ink 14.88 |
| cobalt-deep | #021969 | Footer; white 15.61 |
| aqua | #7BF5F5 | Quote highlighter; ink 14.32, and 5.86 against cobalt |

**Type:** Science Gothic headers at width 125–150, Golos Text for UI and figures, PT Mono for verbatim quotes.

**Geometry**
- The label is an unboxed sheet with corner registration marks.
- 0px radius on the label, strip and ribbon; 4px on controls.
- Nutrition-label rule weights of 1, 3 and 8px.
- A double-ruled outline stamp; no shadows.

**Motion:** one 150ms "stamp press" when a Ground opens.

**Risks**
- It stays in the category's blue cluster: ΔE 7.5 from getmatch, 7.6 from Arc and 9.6 from Tailwind blue-600.
- Golos's civic provenance combined with a saturated blue may read as a state-service portal (an inference).
- Its worst CVD case is the lowest of the three, at 12.5.
- A plain white canvas is itself a minor tell in two sources ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)), so the cobalt bands and the label have to carry the identity.

### Direction 3: «Ведомость» / Rose Ledger (boldest)

The concept is a ledger with a marker pen, the most ownable option among job boards now that Otta is gone.

| Token | HEX | Key pair |
|---|---|---|
| paper | #FAF5F8 | ink #1A1017: 17.23 |
| muted | #60545C | 6.67 |
| rose | #FFB3DD | Header band; primary button fill with a 2px ink border. Ink 11.27 |
| rose-tint | #FDD8EF | Ink 14.37 |
| sky | #94DCFF | Highlighter; ink 12.33 |

Links are ink and underlined. The palette research's #840074 link colour sits ΔE 7.3 from Wildberries' violet, and deep fuchsia #C2009C is excluded outright.

**Type:** Dela Gothic One for one-line poster titles; Commissioner for UI and figures; Commissioner at maximum flare for quotes.

**Geometry:** a "soft-brutal" subset of 2px ink outlines, flat fills and 8px panel radius. No offset shadows, stickers or tilt.

**Layout:** a comparison ledger as the default list view, with jobs as rows, the five conditions as columns and three-state cells.

**Motion:** a sky-blue highlighter sweep, and a tick when a row is saved.

**Risks**
- Rose is ΔE 3.1 from Klarna's pink and 8.8 from Gumroad's.
- It sits in Wildberries' colour lane in Russia, with possible "fashion marketplace" associations, which is untested.
- Dela Gothic One has a single weight and no `tnum` evidence.

| Criterion | Signal | Cobalt Protocol | Rose Ledger |
|---|---|---|---|
| Leaves job-board blue (255–265°) | Yes, 200° | No, 264° | Yes, 345° |
| Leaves gen-2 cream | Yes | Yes (white canvas) | Mostly |
| Brand hue tied to the product's truth | Yes: it highlights evidence | Partly: the stamp | Partly: the ledger |
| Accessibility simplicity | Needs border and underline discipline | Simplest: white on cobalt | Needs border discipline |
| Change from Atlas 1.1 | Large | Smallest | Largest |

**Signal is recommended** because it is the only option that clears all four filters: AI defaults, category colours, Russian-market collisions and status safety. It also turns the brand colour into the visible mark of "evidence, not at random". Choose Cobalt Protocol if continuity and the lowest migration risk matter more than standing apart from hh.ru and getmatch. Choose Rose Ledger only after a quick perception test with Russian candidates.

### Never do

| Never | Why |
|---|---|
| Purple or indigo gradients, gradient text, mesh or aurora backgrounds | The most-cited AI tell ([Krebs](https://www.adriankrebs.ch/blog/design-slop/)) |
| Cream paper with a serif display headline or an italic accent word; terracotta | The current gen-2 default ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)) |
| Floating hero card, three icon cards, 01/02/03 steps, stat rows, eyebrow chips, black pill CTAs | Catalogued tells and category clichés |
| Inter, Geist, Montserrat, Manrope or Unbounded as the primary face; monospace as decoration | Defaults, by usage rank |
| One radius and soft shadow everywhere, cards in cards, glassmorphism | Detector-flagged patterns ([pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)) |
| Match percentages, gauges, A–G grades, "4/5", strips that "fill up" | Contradicts the rule that eligibility is not relevance |
| Unknown shown grey, blank, amber "probably" or behind a paywall | Misreads absence as a verdict |
| Brand colour inside the Condition Map; colour-only status | WCAG 1.4.1; pass and fail collapse under deuteranopia |
| Yellow or peach row highlights | Read as paid listings |
| Confetti on pass, a chance-commenting mascot, jittering meters, fade-up on every section, swipe-to-apply | They imply odds and violate "no auto-apply" |
| Dice imagery; «проверено», «одобрено» or «гарантировано» on stamps | Dice.com, gambling, and unearned authority |
| Deep fuchsia near #C800A1; cyan on near-black; dark-by-default with glows | Wildberries' trademark lane and the neon AI tell |

## Conclusion

In 2026, a visual style is a commodity file that an agent can download. The only defensible distinctiveness is a component no template contains, and for Nenaugad that is the honest unknown. Every competitor collapses "not stated" into a score, a grey chip or a paywall. A hatched, dashed "?" with an empty receipt and the line «это вопрос работодателю» turns Nenaugad's strictest product rule into its most recognisable visual. That should be the brand's emotional centre, more than any hue. Colour choice turns out to be an engineering problem, not a matter of taste. It is boxed in by the status system, colour-blind simulation, the job board blue cluster, AI defaults and a Russian colour trademark, and the safe overlap that remains is narrow. A cool cyan used as ink-bordered surface and highlighter is the cleanest point left in it.

The decision also needs protection once it is made. Convergence pulls every future AI-assisted change back toward Inter, cream and blue unless Atlas encodes the choice concretely: hex tokens, named faces and the never-do table. The token contrast script should run in CI, and a slop detector should be part of visual acceptance. Before choosing, the owner can mock three screens per direction: the list, the job detail with the Condition Map, and a 320px phone. Those screens can be tested against Atlas's own acceptance targets: zero critical misreadings of a hiring guarantee, and every participant finding the reason for an unknown. Several questions remain open:

- No study shows that distinctive UI improves trust or applications in job products.
- Cyrillic glyph quality was only spot-checked.
- Dark mode and P3 variants were not computed.
- The Pantone-to-hex conversions behind the Wildberries comparison are third-party approximations.
