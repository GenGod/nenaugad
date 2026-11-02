# Signature components and visual motifs for Nenaugad's Condition Map

Scope: precedents and ideas for memorable, honest signature components for a Russian-language, remote-only, evidence-based job search product. The core object is the five-group "Condition Map" (hiring country, working hours/time-zone overlap, contract type, compensation, mandatory requirements). Each group shows pass / unknown / fail, a reason and a "Ground" disclosure (exact quote, source name, date). Research done 2026-11-02 with web search and fetch. Most product claims come from product pages, help docs or secondary write-ups. Where only a weak or third-party source was available, the finding says so. WebFetch returns text only, so no screenshots were inspected. Visual details (colours, shading) come from text descriptions, not direct observation.

---

## 1. Time-zone overlap visualization: how do existing tools show overlapping working hours, and which forms are most legible and distinctive?

### Takeaway
The dominant, most legible form is a set of **horizontal 24-hour strips, one per zone, aligned on a shared time axis**, crossed by a vertical cursor. World Time Buddy, Every Time Zone, Spacetime and SyncHours all use it, with shading that separates working, fringe and sleep hours. Circular 24-hour dials exist (TimeDials, Meridian, academic work) and are more distinctive, but they are harder to read precisely. For Nenaugad, which compares only two parties (the candidate and the team), a two-strip "overlap ribbon" with the intersection called out in words is the strongest fit.

### Cited Findings
- **World Time Buddy** lays out each location as a block with its name, current local time and offset from the home zone, followed by a row of "hour-tiles". Day headers (e.g. "Mon, Nov 2") sit inside the row, so day boundaries are visible. The page's interaction copy is "Mouse over hours to convert time at a glance" and "Click hour tiles to schedule and share". It also has a "Mark Weekends" setting and "Link to this selection" — [worldtimebuddy.com](https://www.worldtimebuddy.com/) (page text only; shading not observable via fetch).
- World Time Buddy's iOS app (Time Buddy) uses a column-of-hours layout and can show the user's calendars above the hours to avoid conflicts — [App Store listing](https://apps.apple.com/us/app/id719765848?l=en-us).
- **Every Time Zone**: users "drag the green bar to see the corresponding time (and date)" in each zone. Shades of blue indicate the hours of the day, and lighter tones mark better meeting times — [Labnol](https://labnol.org/internet/world-time-zones/14346); [Executive Traveller](https://www.executivetraveller.com/useful-web-app-takes-the-hassle-out-of-planning-across-time-zones). One review notes the slider covers only about ±24 h and not every zone — [Executive Traveller](https://www.executivetraveller.com/useful-web-app-takes-the-hassle-out-of-planning-across-time-zones). The site lists each zone with a flag, name, abbreviation and UTC offset (e.g. "PST UTC-8"), and labels the current-time marker "your local time" — [everytimezone.com](https://everytimezone.com/).
- **Spacetime** (Planetary, designer Matt Ström-Awn): an early prototype kept availability fixed while a red line moved. The final design keeps "now" centred, "letting the team's work hours scroll past", and the goal was to work "without needing to do the mental math of time zone conversion" — [mattstromawn.com/projects/spacetime](https://mattstromawn.com/projects/spacetime). Its colour code is green for hours already worked, blue for hours left and red for unavailable, in an "easy-to-comprehend list" with lots of white space — [GoodUX/Appcues](https://goodux.appcues.com/blog/spacetimes-visual-schedules).
- **Timezone.io** was built by Dan Farrelly while on Buffer's remote team and is open source. Platform.sh self-hosted a clone because the hosted version required a public team page — [Product Hunt](https://www.producthunt.com/products/timezone-io); [Upsun/Platform.sh blog](https://developer.upsun.com/posts/unknown/what-is-your-timezone).
- **Notion Calendar** shows several time zones side by side as extra columns in week view, with custom labels and the ability to "temporarily travel" to a zone. The help page implies a default cap of four zones — [Notion help: Time zones](https://www.notion.com/help/time-zones).
- **Slack** has no overlap visual. It relies on each person setting a local time zone "so that colleagues know what time it is for you when they check your profile", plus Do Not Disturb schedules and optional custom "work hours" profile fields — [Slack help](https://www.slack.com/help/articles/360025054173-set-up-slack-for-work).
- **GitHub** lets users opt in to "Display current local time" on their profile. Visitors see the UTC offset and how many hours ahead or behind the person is relative to themselves — [GitHub changelog](https://github.blog/changelog/label/profiles).
- **Overlap** (iOS/Mac, by Moleskine Studio per its App Store title) offers an "Overlap Graph" where users choose 'available' hours for each zone. A reviewer says the graph shows when the largest number of people will be present — [App Store](https://apps.apple.com/app/id1516950324); [Softpedia](https://mac.softpedia.com/get/Utilities/Overlap.shtml).
- **Circular forms**: TimeDials uses a draggable dial with green arcs for work hours and red arcs for sleep, for up to 6 cities — [timedials.com](https://www.timedials.com/). Meridian draws each city as a ring around a 24-hour dial starting at 00:00 UTC at the top — [phoca.cz/meeting-time](https://www.phoca.cz/meeting-time/). Buono, Costabile and Lanzilotti (2014) propose a 24-hour circular visualization of distributed team members' activity — [Univ. of Bari repository](https://ricerca.uniba.it/handle/11586/124038).
- **SyncHours** describes a "24-hour visual timezone matrix" with a real-time scrubber showing overlapping working, fringe and rest hours — [Product Hunt](https://www.producthunt.com/products/synchours).
- **SavvyCal** overlays the recipient's own calendar on the host's availability, in a different colour. That is calendar overlay, not time-zone overlap. Its time-zone rendering is described only by third parties — [digi-tools review](https://digi-tools.pages.dev/articles/savvycal-review); [listicler](https://listicler.com/best/tools-fix-broken-meeting-scheduling-timezones) (low-quality sources; unconfirmed by SavvyCal).

### Inferences
- **Most legible pattern**: aligned horizontal hour strips on one axis (World Time Buddy, Every Time Zone, Spacetime). They support exact reading ("11:00–14:00"), day-boundary markers and a simple text equivalent. Circular dials (TimeDials, Meridian) are more ownable visually, but angles are harder to read precisely and harder to describe to a screen reader.
- **Proposed signature component: "Лента пересечения" (overlap ribbon).**
  - Two 24-hour strips in the *candidate's* local time: "Ваши часы" (user-set, default 09–18) and "Часы команды" (from the posting).
  - The intersection is drawn as a vertical band spanning both strips, labelled in words, e.g. «Пересечение 3 ч · 11:00–14:00 по вашему времени».
  - The ribbon includes a midnight/day-change tick (from World Time Buddy) and a "now" marker (from Spacetime).
  - If the team's hours are **not published**, the team strip is fully hatched with the label «Часы не указаны». An empty or grey strip would read as "no hours" (see Q3).
  - If the posting gives only a zone range ("UTC−3…UTC+2") and no hours, draw the range as a dashed, unfilled outline. The outline shows what the source says without inventing 9-to-5 hours. Label it «Указан только диапазон поясов».
- **Honesty**: show the overlap as a duration in hours, never as a "fit %". Do not round "1 h overlap" up to pass when the posting states a minimum overlap requirement the candidate does not meet. Quote that requirement in the Ground.
- **Accessibility**: the overlap band must carry text (hours and the range). Encode pass, unknown and fail through outline style and pattern, not only hue. Provide a visually hidden sentence, e.g. «Ваши часы 09:00–18:00, часы команды 14:00–23:00, пересечение 4 часа». A `<figure>` with a `<figcaption>` or `aria-describedby` works well here.
- **Distinctive flourish**: a small 24-hour dial could serve as the brand glyph or favicon, or as a compact list-view chip (two arcs with their overlap). Keep the linear ribbon as the precise view.
- **Density**: the ribbon needs only about 48–64 px of height on a detail page. In the job list it can shrink to a 1-line micro-strip (24 cells) with the text "3 ч".

### Gaps
- I could not verify how **Clockwise, Calendly, Cron/Notion Calendar (beyond columns), Figma, Deel or Remote** visualise time zones or overlap. No primary sources were fetched in this session, so these remain unverified.
- I did not observe World Time Buddy's or Every Time Zone's exact colours and shading directly. WebFetch returns text only, and the shading descriptions come from secondary reviews.
- I found no user-testing evidence comparing linear and circular overlap displays for legibility. The preference for linear strips above is an inference.

---

## 2. Checklist and eligibility visualization beyond icon rows: labels, passes, tickets and spec sheets

### Takeaway
The strongest precedents are **standardized disclosure labels**: the FDA Nutrition Facts label and its descendants (privacy "nutrition labels", Apple App Store privacy labels, IoT security labels, AI model cards and AI "nutrition facts"). Their memorability comes from a fixed, plain, rule-lined format and a primary layer that links to a secondary layer of detail, not from decoration. There is a known trap: graded scales such as the EU energy label's A–G imply a ranking or score, which conflicts with Nenaugad's no-score rule. Self-reported labels (Apple) also show how a trusted-looking format can overstate accuracy.

### Cited Findings
- **FDA Nutrition Facts label** (1994): designed by Burkey Belser, who was approached because of his earlier work on the appliance EnergyGuide label. He worked pro bono through about three dozen iterations, set it in bold and light Helvetica, received a Presidential Design Award (1997), and Massimo Vignelli praised the label in 1996. It remained essentially unchanged until the 2016 revision, which enlarged the calories section. Belser also designed the OTC Drug Facts label — [NPR](https://www.npr.org/2023/09/28/1202113376); [Wikipedia: Burkey Belser](https://en.wikipedia.org/wiki/Burkey_Belser); [Marketplace](https://www.marketplace.org/2014/03/10/guy-behind-nutrition-facts-and-energy-guides).
- **Privacy "nutrition label" research**: Kelley, Bresee, Cranor and Reeder, "A 'Nutrition Label' for Privacy", SOUPS 2009. The design drew on nutrition, warning and energy labeling and on standardized banking privacy notices. A CHI 2010 follow-up, "Standardizing Privacy Notices", tested the approach online — [researchr](https://researchr.org/publication/KelleyBCR09); [Cranor talk slides](https://lorrie.cranor.org/talks/notice-choice-pets2013.pdf).
- **Apple App Store privacy labels** (December 2020): developers self-report in App Store Connect, and the labels are "required to submit new apps and app updates". Developers are "responsible for keeping your responses accurate". The page does not say Apple verifies the answers — [Apple Developer: App privacy details](https://developer.apple.com/app-store/app-privacy-details/). Top-level groupings are "Data Used to Track You", "Data Linked to You" and "Data Not Linked to You" — [Adjust glossary](https://www.adjust.com/glossary/privacy-nutrition-labels/); [Schneier](https://www.schneier.com/blog/archives/2020/11/privacy-nutrition-labels-in-apples-app-store.html).
- Large-scale analyses found mismatches between Apple labels and privacy policies. CMU researchers proposed a colour-coded **expandable grid** redesign, which improved users' ability to answer privacy questions and reduced the time needed — [NSF PAR: large-scale analysis](https://par.nsf.gov/biblio/10399852-understanding-ios-privacy-nutrition-labels-exploratory-large-scale-analysis-app-store-data); [NSF PAR: expandable grid](https://par.nsf.gov/biblio/10574916-exploring-expandable-grid-designs-make-ios-app-privacy-labels-more-usable).
- **IoT security and privacy label** (Emami-Naeini et al., CMU): the label has two layers. The **primary layer** holds glanceable content for the package. A **secondary layer**, reached via QR code or URL, holds the detail. Together the layers carry 47 pieces of information. In interviews, all 15 consumer participants clearly understood the primary layer — [arXiv 2002.04631](https://arxiv.org/pdf/2002.04631); [Duke/IEEE S&P 2021](https://inspire.cs.duke.edu/publications/sp21/sp21-mag.pdf); [Help Net Security](https://www.helpnetsecurity.com/2020/06/04/iot-security-label/).
- **EU energy label (rescaled 1 March 2021)**: the label dropped A+++…A+ for a simple A–G scale and left the top classes empty "to leave room for progress". It added a QR code linking to the EPREL product database, a secondary layer much like the IoT label's — [ECC-Net](https://www.eccnet.eu/news/european-energy-labels-good-environment-and-your-wallet); [CORDIS](https://www.cordis.europa.eu/article/id/443181-handy-new-tools-to-help-with-the-new-eu-energy-labels); [Smeg UK summary](https://www.smeguk.com/news/2020/new-energy-label.html); label annex example: [legislation.gov.uk Annex III](https://legislation.gov.uk/eur/2019/2016/annex/III/adopted/data.html).
- **AI documentation labels**:
  - Model Cards (Mitchell et al., FAT* 2019) are short (1–2 page) records of model performance — [arXiv 1810.03993](https://arxiv.org/pdf/1810.03993v1).
  - The Data Nutrition Project (2018–) gives a dataset "nutrition label" with "ingredients", intended use and curation process. It won a 2022 Ars Electronica award — [Berkman Klein](https://cyber.harvard.edu/story/2019-01/dataset-nutrition-label-project-tackles-dataset-health-and-standards); [Ars Electronica](https://ars.electronica.art/planetb/en/the-data-nutrition-project).
  - Twilio publishes "AI Nutrition Facts" labels per product (introduced at SIGNAL 2023) and a generator at nutrition-facts.ai — [Twilio docs](https://twilio.com/docs/voice/intelligence/ai-nutrition-fact-labels).
- **Boarding pass redesigns**: Tyler Thompson's 2010 critique of a Delta pass started a "boarding pass conceptual redesign frenzy". Pete Smart's redesign led with flight number, gate and airline, then date, name and cities — [Core77](https://www.core77.com/posts/26366/Peter-Smarts-Better-Boarding-Pass-Redesign); [Runway Girl Network](https://runwaygirlnetwork.com/2014/02/16/easy-to-read-boarding-pass-looks-smart/); [NPR 2014](https://www.npr.org/sections/alltechconsidered/2014/01/23/265233797/a-boarding-pass-design-thats-so-much-better-than-what-we-have); [ISO50 "Boarding Pass/Fail"](https://blog.iso50.com/?p=13468).
- **Spec-sheet aesthetics**: Teenage Engineering reportedly uses monospace type across products, packaging and website. Its site is described as a black canvas with 1px grid dividers instead of shadowed cards, square UI corners, and products supplying the only accent colour — [Blake Crosley design guide](https://blakecrosley.com/guides/design/teenage-engineering); [shadcn.io token reference](https://www.shadcn.io/design/teenage-engineering) (secondary and auto-generated; values may not match the live site).

### Inferences
- **Recommended metaphor: a "Состав вакансии" label (FDA-style), not a graded label.** The FDA label works because it is standardized, rule-lined, typographically plain and the same on every product. That supports Nenaugad's "evidence, not judgement" stance. The Condition Map could be one heavy-ruled panel:
  - a bold title «Условия вакансии»;
  - a thin line stating «по данным объявления · источник · дата»;
  - five rows separated by hairlines, each with a tabular value column;
  - a footer line «Это сверка с текстом объявления, а не гарантия найма или юридической допустимости».

  This gives memorability through format, the way the nutrition label itself is recognizable.
- **Layering**: borrow the IoT label's **primary/secondary layer** and the energy label's QR-to-database idea. The primary layer is the five outcomes with short reasons. The secondary layer is the Ground: quote, source and date. This matches Nenaugad's existing Ground disclosure.
- **Avoid the EU A–G scale and anything with a single summary grade.** A coloured graded bar reads as a score, and Nenaugad has no match percentages by design. A count like "4/5" also invites ranking; use it with caution or not at all.
- **Ticket/boarding-pass stub as the list-view chip**: a perforated stub with five slots (one per group) works as the compact form. The boarding-pass lesson is hierarchy, not decoration: the most decision-relevant item comes first (likely hiring country), and the rest follows.
- **Five-segment "signal strip"**: five equal cells in a fixed order, so users learn the positions (country · hours · contract · pay · requirements). Each cell combines shape, pattern and a letter or glyph:
  - pass: solid fill with a check mark;
  - unknown: diagonal hatching with "?";
  - fail: solid with a cross, or a notched or cut corner as a second, shape-based cue.

  Fixed order plus pattern makes it colour-independent. The strip is an index to the label, not a meter: do not draw it as a progress bar that "fills up".
- **Honesty risk of borrowed authority**: nutrition and energy labels carry *regulatory* authority, and Apple's labels show that a standardized look can lend unearned trust to self-reported data. Nenaugad's label must say plainly that it reports what the posting or source says, as of a date, and is not verified with the employer. Avoid words like «сертифицировано» and «гарантировано».
- **Accessibility**: a label is a table semantically. Render it as `<table>` or `<dl>` with row headers, so a screen reader announces e.g. «Страна найма — подходит: Россия указана в списке стран. Основание: …». Keep the Ground a native `<details>` or a button with `aria-expanded`.

### Gaps
- I did not find real job-product UIs that use visa stamps, Pantone chips, punch cards or receipts for eligibility. These remain untested metaphors.
- Spotify Wrapped cards were not researched in this session.
- I did not fetch FDA's own label-design guidance or the EU Regulation 2017/1369 text. Energy label details come from manufacturer and consumer-agency summaries.

---

## 3. Showing uncertainty and "unknown / not reported" honestly, distinct from "no"

### Takeaway
Research and practice agree on four points:
- **Missing data must be shown explicitly, not hidden or imputed silently.** Breaking visual continuity or downplaying missing values changes how people judge the data (Song & Szafir).
- **Texture and outline variables** (hatching, dashing, sketchiness) read as "less certain" without using hue.
- **Frequency or discrete displays** (quantile dotplots, ball swarms) beat continuous ones for lay readers.
- **Motion-as-uncertainty** (the NYT needle jitter) provokes strong negative reactions.

For Nenaugad's categorical "not published", the right tools are hatching or open outlines plus explicit words, not grey-out and not a blank.

### Cited Findings
- **Value-Suppressing Uncertainty Palettes** (Correll, Moritz, Heer, CHI 2018): the palette allocates a wider slice of the colour channel to data when uncertainty is low and a narrower one when it is high. In a crowdsourced study, people weighed uncertainty more heavily in decisions than with standard bivariate maps — [Tableau Research](https://www.tableau.com/research/publications/value-suppressing-uncertainty-palettes).
- **Sketchiness as a visual variable** (Boukhelifa, Bezerianos, Isenberg, Fekete, IEEE TVCG 2012): hand-drawn-style perturbation of lines, with more perturbation for more uncertainty, was about as readable as blur. Participants preferred **dashed** lines — [AVIZ project page](https://www.aviz.fr/Research/UncertaintySketchy); [IEEE VIS 2012](https://ieeevis.org/year/2012/paper/infovis/evaluating-sketchiness-visual-variable-depiction-qualitative-uncertainty). A Utah reading group critiqued the loose definition of "uncertainty" and possible novelty effects — [Utah notes](https://users.cs.utah.edu/~miriah/uncertainty/uncertainty_9_17_12.html).
- **Missing data** (Song & Szafir, "Where's My Data?", IEEE VIS 2018 / TVCG 2019): visualizations that highlight imputed values were rated as higher quality. Breaking visual continuity lowered perceived quality and could skew interpretation, and downplaying or removing information also reduced perceived quality — [CU Boulder VisuaLab](https://cmci.colorado.edu/visualab/MissingData); [NSF PAR full text](https://par.nsf.gov/servlets/purl/10111567). A 2024 survey covers missing-data visualization more broadly — [arXiv 2410.03712](https://arxiv.org/pdf/2410.03712).
- Practitioner guidance:
  - Datawrapper recommends leaving gaps for missing values by putting "NA" or "–" in the data, so missing values don't read as zeros — [Datawrapper Academy](https://www.datawrapper.de/academy/patchy-data); [empty cells shown as zeros](https://www.datawrapper.de/academy/my-empty-cells-get-displayed-as-zeros-in-tooltips).
  - New America and Bocoup used dotted lines for data too sparse to trust — [New America](https://newamerica.org/oti/blog/showing-missing-data-line-charts).
- **Why authors omit uncertainty** (Hullman, IEEE TVCG 2020; survey of 90 authors and 13 interviews): authors value showing uncertainty but routinely omit it. The paper calls this a contradiction between stated values and practice — [arXiv 1908.01697](https://arxiv.org/pdf/1908.01697).
- **Quantile dotplots** (Kay, Kola, Hullman, Munson, CHI 2016): a discrete display of continuous outcomes for small screens. They reduced the variance of probability estimates about 1.15× compared with density plots — [UW IDL](https://idl.uw.edu/papers/when-ish-is-my-bus). A follow-up (Fernandes et al., CHI 2018) found quantile dotplots and CDFs led to better bus-catching decisions than no-uncertainty displays — [MU Collective](https://mucollective.northwestern.edu/project/uncertainty-bus). Vega has an implementation example — [Vega example](https://vega.github.io/vega/examples/quantile-dot-plot).
- **FiveThirtyEight 2020 forecast**: a "ball swarm" of 100 representative outcomes conveyed the spread of possible results, and the mascot Fivey Fox guided readers. Critics noted Fivey mostly warned about low-probability outcomes and read as Clippy-like softening — [FiveThirtyEight design write-up](https://fivethirtyeight.com/features/how-we-designed-the-look-of-our-2020-forecast) (URL now redirects to ABC News; content known via search summary); [FlowingData](https://flowingdata.com/2020/08/12/fivethirtyeight-launches-2020-election-forecast); [Real Life "What the chart wants"](https://reallifemag.com/what-the-chart-wants/); [Information is Beautiful Awards entry](https://www.informationisbeautifulawards.com/showcase/5638-fivethirtyeight-s-2020-election-forecast). Hullman's lab analysed incentives and goals in election forecast communication — [MU Collective](https://mucollective.northwestern.edu/?p=382).
- **NYT election needle**:
  - 2016: the jitter (moving between the 25th and 75th percentiles of simulated outcomes) drew heavy criticism, with readers calling it irresponsible or nauseating. Quartz noted most movement was random, not new data — [Quartz](https://qz.com/831944/the-new-york-times-election-result-projections-are-mostly-random-jitters); [FlowingData](https://flowingdata.com/2016/11/15/showing-uncertainty-during-the-live-election-forecast/); [vis4 "Jittery gauges"](https://vis4.net/blog/jittery-gauges-election-forecast).
  - 2018: NYT added a jitter-off toggle with a caution that turning it off only hides the uncertainty.
  - 2020: the needle moved only with new data — [Nieman Lab](https://www.niemanlab.org/2020/11/bad-polls-fake-news-and-that-damned-needle-heres-how-the-media-covered-a-twisty-election-night/).
- **IPCC calibrated language** separates **confidence** (evidence quality × agreement, from very low to very high) from **likelihood** (e.g. "very likely" 90–100%). The European Environment Agency (EEA) warns that translating the calibrated terms from English loses precision — [EEA Climate-ADAPT uncertainty guidance](https://climate-adapt.eea.europa.eu/en/knowledge/tools/uncertainty-guidance/topic2/index_html); critique of confidence/likelihood interplay: [Springer, Climatic Change 2018](https://link.springer.com/article/10.1007/s10584-018-2247-6); author interpretation study: [White Rose 2022](https://eprints.whiterose.ac.uk/190055/1/s10584-022-03382-3.pdf).
- **Patterns for accessibility**: Highcharts recommends pattern fills to distinguish series beyond colour, with caveats. Its docs warn patterns "could make your charts visually confusing", prefer subtle patterns, and advise data labels in addition to colour — [Highcharts: Patterns and contrast](https://www.highcharts.com/docs/accessibility/patterns-and-contrast); [Highcharts accessibility blog](https://www.highcharts.com/blog/tutorials/best-chart-accessibility-practices/).

### Inferences
- **A three-state visual grammar for Nenaugad** (applies everywhere: signal strip, label rows, overlap ribbon):

  | Outcome | Fill | Outline | Glyph | Word |
  |---|---|---|---|---|
  | pass («подходит») | solid | solid | ✓ | подходит |
  | unknown («не указано») | diagonal hatching on light ground | **dashed** | ? | не указано / неизвестно |
  | fail («не подходит») | solid, distinct hue | solid, plus a shape cue (e.g. notched corner) | ✕ | не подходит |

  - Hatching and dashing are grounded in the sketchiness and dashed-line findings and the missing-data practice above, and they work in greyscale.
  - Never render unknown as greyed-out or disabled. Song & Szafir show that downplaying missing data shifts judgements, and grey reads as "inactive" or "no".
  - Never leave it blank. Datawrapper's guidance applies: a gap or "–" must be *deliberate and labelled*.
- **"—" vs "?" convention**: use «?» plus the words «не указано в источнике» for unknown. Reserve «—» for "not applicable" (e.g. a compensation sub-field when the contract type makes it irrelevant). The tooltip or Ground must say which one it is.
- **Unknown as a first-class state with its own colour token**: VSUPs suggest that when uncertainty is high, you should *suppress value encoding*. For Nenaugad, the unknown state therefore should not borrow a "half-pass" amber that reads as "probably". It should have a neutral, textured identity of its own.
- **Avoid probabilistic visuals entirely.** Ball swarms, dotplots and needles communicate *probability*, and Nenaugad explicitly has no offer probabilities. The transferable lesson from FiveThirtyEight and the NYT is negative: animated uncertainty upsets people and implies a model. Nenaugad's uncertainty is "the source did not say", which is *categorical*, not probabilistic.
- **IPCC lesson**: separate "what the source says" (outcome) from "how good the evidence is" (source freshness, quote exactness). If Nenaugad ever adds evidence quality, keep it a separate, verbal axis (e.g. «цитата точная», «формулировка размыта»), not a fused score. Translated calibrated terms lose precision, so define Russian terms in a glossary.
- **Accessibility**: pattern plus glyph plus word gives three non-colour cues, which satisfies WCAG 1.4.1 "Use of Color". Keep hatching subtle and high-contrast against its own ground, per Highcharts' caveat about noisy patterns.

### Gaps
- **Our World in Data hatching**: search snippets of OWID chart captions say countries without data are shown with a hatched fill, but I could only find these on staging and preview mirrors. I could not confirm the current production rendering or colour. Treat as unverified.
- The Economist forecast, NYT Upshot, The Pudding and weather-app "unknown" conventions were not researched in this session.
- I found no study that tests hatching vs grey vs "?" glyph specifically for *categorical* "not reported" in UI tables. The recommendation is extrapolated from chart research.
- WCAG 2.2 Success Criterion 1.4.1 is cited from general knowledge — [W3C Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). It was not fetched in this session.

---

## 4. Evidence and citation UI: how products present the quote or source behind a claim

### Takeaway
Current practice converges on **claim-level (sentence or sub-sentence) citations shown as small inline markers that expand on demand**, often in three layers: inline marker → hover or tap preview → full source. Quote-first grounding (showing the exact extracted sentence) is the most trust-building variant (Elicit, Consensus). Controlled research suggests hover cards support on-demand verification without breaking reading flow. Nenaugad's "Ground" already matches this model; the signature move is to make the quote itself the hero.

### Cited Findings
- **Perplexity** (third-party teardowns): numbered inline citations, with sources expanding from a light hover preview to a full source browser, described as a three-layer model (inline, list, detail). Users can also select a passage and check its sources — [AI Design Patterns teardown](https://ai-design-patterns.pages.dev/teardowns/perplexity/citations); [925 Studios breakdown](https://www.925studios.co/blog/perplexity-design-breakdown) (secondary sources).
- **Controlled study of source presentation** (N=372, between-subjects): it compared collapsible, hover card, footer and aligned sidebar presentations. It found a trade-off between fluency (the hover card supports on-demand verification and "seamless drafting") and layouts that enforce reflective verification. The hover card was associated with better evidence evaluation (β=0.08, p<0.05) — [Moonlight review of the paper](https://www.themoonlight.io/review/seeing-to-think-how-source-transparency-design-shapes-interactive-information-seeking-and-evaluation-in-conversational-ai); related arXiv: [2512.12207](https://arxiv.org/html/2512.12207). (The statistic is reported via a review site; the original paper was not opened.)
- **Elicit**: clicking an extracted answer shows numbers after parts of the answer, and clicking one shows "the most relevant supporting quotes from the paper for that specific claim" — [Elicit product email](https://email.elicit.com/deliveries/dgTd9ggDAKHze6DzewGRV6Mar1nmdWdNl_mKLCI=) (promotional source; rollout unconfirmed).
- **Consensus Meter**: classifies results into yes / no / possibly / mixed for yes-no questions. The vendor says the results powering it are "extracted word-for-word quotes" from papers and calls the meter "just a snapshot". Critics note it does not weight by study design and reflects only the retrieved set of papers — [Consensus blog](https://consensus.app/home/blog/introducing-the-consensus-meter/); [Aaron Tay, 2025 deep dive](https://aarontay.substack.com/p/a-2025-deep-dive-of-consensus-promises).
- Research on attribution granularity:
  - Attribution has moved from document-level to sentence-level citations, and sub-sentence citations are proposed — [arXiv 2406.06125](https://arxiv.org/abs/2406.06125).
  - Generating direct quotes makes citations "verifiable by design" — [arXiv 2404.03862](https://arxiv.org/pdf/2404.03862.pdf).
- **Wikipedia [citation needed]**: in use since 2006, it adds a superscript in the style of a footnote marker, linked to a page explaining the citation policy. It became a meme: in 2008 Matt Mechtley made "[citation needed]" stickers for advertisements — [Wikipedia:Citation needed](https://www.wikipedia.org/wiki/Wikipedia:CITENEED); [Wikiwand: Citation needed (Wikipedia)](https://www.wikiwand.com/en/Citation_needed_(Wikipedia)).
- **Google "About this result"**: opened from a three-dot menu next to a result (2021). It shows source information (initially drawing on Wikipedia), later self-descriptions, what others say about the source, and why the result ranked. Research frames it as a lateral-reading aid — [9to5Google](https://9to5google.com/2021/02/01/google-search-links-getting-about-this-result-panel-with-website-information/); [TechCrunch](https://techcrunch.com/2021/09/29/google-search-update-will-provide-more-context-about-websites-including-descriptions-and-what-others-say); [NSF PAR study](https://par.nsf.gov/servlets/purl/10438929).
- **Community Notes and crowdsourced context**: a design-space framework covers participation, inputs, curation, presentation, platform treatment and transparency. It notes X's system is open source and open data, unlike the later YouTube and Meta pilots — [arXiv 2509.15434](https://arxiv.org/abs/2509.15434).
- **Implementation reference**: the shadcn/ui inline citation component offers hover cards that also work by click on mobile, with keyboard focus support — [shadcn.io inline citation](https://www.shadcn.io/ai/inline-citation).

### Inferences
- **Signature component: "Основание" as a receipt or quotation slip.** When expanded, each condition's Ground shows:
  1. the **exact quote** in a distinct typographic voice (e.g. a monospace or typewriter face), with the decisive words **highlighted** like a marker pen;
  2. the source name and a link;
  3. a dated **check stamp** («сверено 02.11.2026»), drawn as a rubber-stamp outline;
  4. for unknown: an explicit **"empty receipt"** — «В объявлении нет слов о часах работы» with a hatched quote area — echoing Wikipedia's *[citation needed]*. The absence is itself the documented evidence.
- **Layering**: mirror Perplexity's three layers. A small superscript marker sits on each condition reason, on the Wikipedia/Perplexity model. Hover or focus shows a quote preview, using the hover-card advantage from the N=372 study. Click or tap opens a pinned panel with the full context. On touch devices use tap, not hover only.
- **Honesty**:
  - Quote-first (Elicit and Consensus style) is the honest pattern: the user can see that the outcome is derived from words in the source.
  - Do **not** copy Consensus's aggregate meter. Its critics' point, that collapsing evidence into yes/no/mixed loses nuance, applies directly to any temptation to summarise the five outcomes into one badge.
  - Show the date prominently. Evidence for job postings goes stale.
- **"About this job" panel**: modelled on Google's "About this result", it is a single place explaining *where the job came from* (which approved source, when imported, when last checked) and *what Nenaugad did not check* (employer's real practice, legal eligibility).
- **Accessibility**:
  - Footnote markers need accessible names («Основание для: страна найма»), not bare "[1]".
  - Hover cards must open on keyboard focus and be dismissible with Esc, or use a disclosure button.
  - Highlighting must not rely on colour alone. Use `<mark>`, which screen readers can announce, plus an underline or weight change.

### Gaps
- Kagi, Readwise and fact-checking sites (PolitiFact, Full Fact, Snopes) were not researched in this session.
- Perplexity's own documentation of its citation design was not found. Descriptions come from third-party teardowns.
- X's current Community Notes visual label and layout were not confirmed.

---

## 5. Memorable micro-interactions and personality in serious tools

### Takeaway
Memorable personality in serious tools tends to sit at **moments of stress or commitment**: Mailchimp's sweaty-finger and high-five around the "send" button. Elsewhere it comes from **pervasive craft that is felt rather than seen**: Linear's invisible pointer details and keyboard-first command menu, and Teenage Engineering's strict monospace and spec-sheet discipline. It becomes childish when it decorates neutral moments or softens serious information (critiques of FiveThirtyEight's Fivey Fox).

### Cited Findings
- **Mailchimp**:
  - From 2005, users about to send saw a chimp's sweaty finger hovering over a big red button with "prepare to launch", then got a monkey-paw high-five after sending. It is often cited as **empathetic design**, bringing humour to a stressful step — [The Next Web](https://thenextweb.com/news/genius-mailchimps-sweaty-monkey-finger).
  - Mailchimp later made "Fast Fives", a stand-alone high-five arcade game for users who sent a campaign — [Fuzzco Mailchimp collection](https://fuzzco-2019.netlify.app/collections/mailchimp).
  - It added a "Freddie High Five" ready-to-launch animation for Facebook Ads — [Mailchimp design tips](https://mailchimp.com/resources/design-tips/?page=11).
  - On the company's view of playfulness — [Creative Review](https://www.creativereview.co.uk/mailchimp-on-playfulness/). (Whether the send animation still ships today was not confirmed.)
- **Linear**: contextual menus use a triangular "safe area" so diagonal pointer movement into a submenu doesn't close it. This is an "invisible detail" — [Linear blog via Plushcap mirror](https://www.plushcap.com/content/linear/blog/linear-invisible-details-building-contextual-menus). Keyboard-first means designing from shortcuts (e.g. C to create, T to triage), with the command menu as a universal hub that shows shortcuts beside items so users learn them — [Brainy glossary: keyboard-first](https://brainy.ink/paper/glossary/keyboard-first) (secondary).
- **Teenage Engineering**: monospace everywhere, presented as a philosophical stance. Products appear as rotatable 3D objects on clean backgrounds, with grid dividers instead of cards and square interface corners. The result is described as "raw honesty about what the device is" combined with careful finish — [Blake Crosley design guide](https://blakecrosley.com/guides/design/teenage-engineering); [shadcn.io token reference](https://www.shadcn.io/design/teenage-engineering) (secondary).
- **Otta** (job search; now Welcome to the Jungle): Ragged Edge's rebrand used "stretchy, shouty type and a bright colour palette" to stand out from "corporate blue" job boards. It positioned Otta as a "career champion" against "jobs-by-numbers". Otta also foregrounded salary ranges — [Creative Review](https://www.creativereview.co.uk/otta-rebrand-ragged-edge/); [Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/). Otta was acquired by Welcome to the Jungle in January 2024 and the brand was sunset.
- **FiveThirtyEight's Fivey Fox** is a cautionary example. Critics read the mascot's chummy tone as softening distressing information, and compared it to Clippy — [Real Life](https://reallifemag.com/what-the-chart-wants/).

### Inferences
- **Where Nenaugad's personality moments should be**:
  1. **Leaving to apply.** There is no auto-apply, so the user goes to the employer's site. That is a commitment moment, analogous to Mailchimp's send. A small "stamp" animation could mark the job card «Отклик — на сайте работодателя», with a reminder of any unknown conditions to ask about. This is empathetic, not celebratory.
  2. **Ground expanded.** A brief "stamp press" or highlighter-sweep animation on the decisive words of the quote: once, short, and respecting `prefers-reduced-motion`.
  3. **First "unknown" encountered.** A one-time explainer: «"Не указано" — не отказ. Это вопрос, который стоит задать работодателю». It turns unknown into an action (ask), consistent with "Unknown is not pass/fail".
- **Craft that is felt**: keyboard navigation through the five conditions (e.g. 1–5 or arrow keys to open each Ground), Linear-style. A command palette for filters. Tabular numerals in the overlap ribbon.
- **Spec-sheet voice (Teenage Engineering)** fits an evidence product: a monospace or "typewriter" face reserved for *quoted source text* and data values; ruled lines; numbered fields («01 Страна найма … 05 Обязательные требования»). This is bright and memorable through strict system, not mascots.
- **Avoid**: a mascot commenting on the candidate's chances (Fivey Fox risk), celebratory confetti on "pass" (it implies a win or likely hire), and jitter or animated meters (NYT needle lesson).
- **Honesty**: no animation should suggest progress toward an offer. Celebrate user actions (saved, compared, asked), not outcomes.
- **Appearance constraint**: AGENTS.md says the approved appearance is Atlas 1.1, built from `src/app/tokens.css`, and forbids redesigning Nenaugad. Any of these ideas must be expressed within those tokens or proposed to the owner as a token-level change.

### Gaps
- Stripe, Things 3, Arc and Raycast micro-interactions were not researched in this session; no sourced findings are available.
- Linear's own blog post was reached only via a mirror (Plushcap); the original URL on linear.app was not fetched.
- I found no user research quantifying how "memorable" these micro-interactions are. Memorability claims are from design press.

---

## 6. Brand motifs from the name "Ненаугад" ("not at random")

### Takeaway
The richest cultural anchor for "random vs deliberate" is Malkiel's **blindfolded monkey throwing darts**, from *A Random Walk Down Wall Street*, and the WSJ's 14-year dartboard contest. It is a ready-made image of "picking at random" that Nenaugad can invert: aimed, sighted, measured. **Dice are risky**: one of the best-known US tech job boards is literally named Dice, and dice connote gambling. Motifs from measurement and verification fit the evidence positioning better and translate well into components: crosshair or registration marks, coordinate grids, ruled forms, stamps.

### Cited Findings
- Burton Malkiel wrote that a blindfolded monkey throwing darts at a newspaper's financial pages could select a portfolio that would do as well as one chosen by experts. The WSJ ran a dartboard contest from 1988 to 2002: the pros won 87 of 142 contests and the darts 55. Malkiel said "This wasn't really a serious contest" — [Daily Princetonian (2002)](https://www.dailyprincetonian.com/article/2002/05/fourteen-years-of-darts-on-wall-street-lead-malkiel-to-reassert-stock-theory); [IFA Magazine](https://ifamagazine.com/monkey-business-random-walk/).
- **Dice** is a long-running US technology job board. In 2015 it rebranded the European "IT Job Board" as Dice, and its parent renamed itself DHI Group with the tagline "Delivering Hire Insights" — [Recruiter (2015)](https://www.recruiter.co.uk/news/2015/07/us-dice-rolls-out-rebranded-it-job-board); [GlobeNewswire](https://www.globenewswire.com/news-release/2015/04/21/993017/0/en/Leading-Digital-Provider-for-Professional-Communities-Rebrands-as-DHI-Group-Inc-With-Help-From-CBX.html).
- Otta's brand explicitly opposed "jobs-by-numbers" with a bright, expressive identity in a sector of "corporate blue" boards. It is a precedent for a bright job-search brand built on a stance — [Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/); [Creative Review](https://www.creativereview.co.uk/otta-rebrand-ragged-edge/).
- Wikipedia's "[citation needed]" grew from a footnote-style UI marker into a cultural meme, including stickers placed on ads. A small, rigorous evidence marker can become a brand-level symbol — [Wikiwand](https://www.wikiwand.com/en/Citation_needed_(Wikipedia)).

### Inferences
- **Candidate motifs, ranked by fit**:
  1. **Registration / crop marks and a crosshair** («прицел»): the printer's marks that prove alignment. They say "deliberate, measured" without violence. They can frame the Condition Map card (corner marks instead of rounded-card shadow), act as a focus indicator, and become a logo device (a crosshair formed from five ticks, one per condition).
  2. **Rubber stamp / verification mark** («сверено» with date): directly supports the Ground and the dated check. Risk: stamps imply *official* verification. The wording must be «сверено с объявлением», never «проверено» alone or «одобрено».
  3. **Ruled form or ledger paper**: numbered fields, hairline rules, a monospace quote face. This is the "label/spec-sheet" system from Q2 and Q5 and is very implementable with CSS borders and grid.
  4. **Coordinate grid**: the five conditions as axes or columns of a grid, with each job a row. That suits a comparison view («сравнить вакансии») where columns are the five conditions and cells use the three-state grammar from Q3. It is very dense and highly scannable.
  5. **Inverted randomness**: a die showing only one face repeated, a dart in the centre, or a blindfold being removed. These work as a one-off illustration or a 404/empty-state joke («Наугад мы не ищем»), not as the core mark. Dice conflict with Dice.com's name and with gambling connotations. Darts and monkeys are a playful empty-state reference at most.
- **Honesty check across motifs**: targeting and crosshair imagery can imply "we hit the right job for you" or "you'll get it". Copy must anchor the aim to *conditions you can check*, not outcomes: «Цель — видеть условия, а не угадывать», not «попадание в оффер».
- **Accessibility**: decorative motifs (crop marks, grid) must be `aria-hidden`. Stamps containing a date must carry that date as real text, not only as an image.

### Gaps
- I found no documented brand that visually plays on "random vs deliberate" as its *core* identity beyond the examples above. Google's "I'm Feeling Lucky" and dating apps' "deliberate" positioning were not researched with sources.
- I did not research Russian-market job boards (hh.ru, Habr Career) for visual conventions or existing uses of these motifs. A check is advisable to avoid looking derivative locally.
- I did not check trademark or confusion risk around dice imagery in the Russian market.
