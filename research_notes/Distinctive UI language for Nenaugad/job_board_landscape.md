# Visual landscape of job boards and career platforms (international + Russian-language), November 2026

Method note (applies to every section): live pages were opened on 2026-11-02 in the built-in browser at a 1280x860 viewport, signed out, with cookie banners left unanswered. Colours are **computed styles** read from the DOM: the most frequent saturated background and text colours, plus the font family actually rendered. They show what the page really paints. They are not official brand specs, and a colour that appears once may come from an ad or a logo. Typeface names are the CSS `font-family` values the page loaded. Where a site blocked automated access (Himalayas Cloudflare challenge, LinkedIn authwall), the source used instead is named. Screenshots were described, not stored.

## Per-platform visual catalog (objective: 15–25 platforms, colours, type, list/card layout, salary/location/remote/tags, imagery, tone, distinctiveness)

### Takeaway
I sampled 27 platforms. 22 were observed live, 2 were partly blocked and filled from archives or the press, and 3 have shut down or been absorbed. Almost every list is the same object: logo, title, company, then a row of pill chips for location, salary, type and skills, with blue or green as the action colour and a neutral sans-serif. The few memorable ones each own one strong move: Welcome to the Jungle owns yellow plus a bespoke display font, Remote OK owns emoji density, Remotive owns a warm brown/orange palette, and hh.ru owns a custom "hh sans" typeface and a "light" metaphor.

### Cited Findings

#### Remote-focused boards
- **Himalayas** (https://himalayas.app/jobs). The live page served a Cloudflare "Performing security verification" interstitial to the browser, so the visual data comes from the Wayback copy dated 2026-10-06. Primary colour is purple: `bg-primary-500` = rgb(159,122,234) #9F7AEA and `text-primary-700` = #6B46C1, with a yellow accent `text-yellow-300` = #FACA15. The page is dominated by Tailwind gray classes (`bg-gray-50`, `text-gray-600`, about 200 uses each). The typeface is **Euclid** (`font-family: var(--font-euclid)`). Sources: [Wayback HTML](https://web.archive.org/web/2026id_/https://himalayas.app/jobs) and [Wayback CSS](https://web.archive.org/web/2026id_/https://himalayas.app/_next/static/chunks/1lthmj5h4swmk.css). List rows show title, company, posted age, a **country flag plus an eligibility string** ("United Kingdom only", "CA and US only", "AL, AD + 71 more"), and badges such as "Full Time"/"Contractor" with category tags. Some rows are AIApply ads labelled "Sponsored". Salary ranges ("$90K – $130K per year") appear in a separate block. There is no per-job match score; sort is "Most relevant" — [WebFetch of himalayas.app/jobs](https://himalayas.app/jobs). The location filter placeholder reads "Country or timezone" — [Wayback HTML](https://web.archive.org/web/2026id_/https://himalayas.app/jobs). The site's own design claim is "design and UX are at the heart of everything", and early UI work by Jordan Hughes is on Dribbble — [Product Hunt](https://www.producthunt.com/products/himalayas/reviews), [Dribbble](https://dribbble.com/jordanhughes/projects/2170408-himalayas-app?page=1). Verdict: a tidy, gray-dominant Tailwind look with a soft purple. Pleasant, but not memorable.
- **Jobicy** (https://jobicy.com/). The typeface is **Bricolage Grotesque** for the whole page, including a bold 700-weight H1 whose second half is set in blue ("Find better work. **Build what comes next.**"). The accent is sky blue #029AEB (90 text uses), with orange #FF9100 on the "PRO" badge. The page background is #F9F9F9. Layout is an app shell: a left sidebar (Remote Jobs, Career, AI Tools, Resume Builder, Salaries…), a centred search with a black pill "Search remote jobs" button, category chips, and a stats row ("50K+ opportunities · 190+ countries · 100K+ professionals"). The jobs list shows logo, date, a "Featured" badge, title, a description excerpt and "Remote from…" — [jobicy.com](https://jobicy.com/), [jobicy.com/jobs](https://jobicy.com/jobs). Verdict: a trendy 2024–25 font on a generic SaaS-dashboard skeleton.
- **Remote OK** (https://remoteok.com/). Everything is set in a system-ui stack, with Nunito as a declared fallback and an 800-weight heading. The background is warm off-white #FBFAF8 and text is #0F1115. Buttons are blue #0072B1. Paid "featured" rows are filled **yellow #FFF38F**, and tags are **black-outlined pills**. The top bar crams in upsells ("Global Payroll", "Build your resume", a purple #5656C2 "Health insurance", "Post a job"). Row text reads: "Enterprise Sales Development Representative 🎈 | Toptal | 🇨🇦 Canada 💰 $10k - $50k | Customer Support | Sales | 3d | Apply". Other rows read "🌏 **Probably worldwide**" and "💰 **Upgrade to Premium to see salary**" — [remoteok.com](https://remoteok.com/). The page title carries "#OpenSalaries" — [remoteok.com](https://remoteok.com/). The menu offers "Dark mode" and "Hacker News mode" — [search snippet of cached Remote OK pages](https://remoteok.com/hire-remotely/design-thiking). Verdict: still the most recognisable "indie hacker" density (emoji, flags, yellow ad rows), though the old dark/neon look is now an optional mode on a light default.
- **We Work Remotely** (https://weworkremotely.com/). The typeface is **Neufile Grotesk** (plus Light and Semi Bold cuts), with Font Awesome 6 Pro icons. Colours are red CTA #F03E3E ("Post a job for $299"), **yellow #FFD500 for highlighted listings** (55 elements), and navy #2736A3. Links are #0D6EFD and text #212529, both Bootstrap 5 defaults. The H1 is two-tone ("The **largest job board** for remote jobs"). Listing fields: title, age ("6d"/"NEW"), badges "Boosted listing / Featured / Top 100", company, "HQ: Tallinn, Estonia", "Full-Time", salary as a **bucket** ("$75,000 - $99,999 USD", "$100,000 or more USD"), and region ("Anywhere in the World", "🇺🇸 United States of America", "North America Only") — [weworkremotely.com](https://weworkremotely.com/), [category page](https://weworkremotely.com/remote-full-stack-programming-jobs). Verdict: a classic ad-funded board. Red plus yellow reads as "marketplace", not as a brand.
- **Remotive** (https://remotive.com/remote-jobs). It uses **custom fonts** "RemotiveHeader", "RemotiveSubHeader" and "RemotiveBody". The palette is unusually warm: **dark brown text #532A21** (480 uses), **orange #FF871A** CTAs ("Unlock All Jobs", "Unlock 125,000+ Jobs"), peach #FED294 on featured rows, and light blue #89C2FF chips. A dark-brown banner reads "20,099 remote jobs added this week". Cards show title, company, chips (category, "Full-time", country list "+4 more") and a "Featured" badge. The listing is paywalled ("Browse 125,000+ fully remote jobs from vetted companies") — [remotive.com/remote-jobs](https://remotive.com/remote-jobs). Verdict: one of the few with its own colour temperature (brown/orange). Memorable, but it reads as a paywall.
- **Working Nomads** (https://www.workingnomads.com/jobs). The typeface is proxima-nova, with FontAwesome icons. The hero is dark navy #232837 over a dusk **photo of a silhouetted person with a bicycle**, and the accent is teal #299FB3. Layout is a left filter sidebar (Location, Category, Position type, Experience, Salary) with a list of bordered cards and right-aligned badges — [workingnomads.com/jobs](https://www.workingnomads.com/jobs). Verdict: a 2015-era "digital nomad" stock-photo aesthetic, generic.
- **Wellfound (ex-AngelList Talent)** (https://wellfound.com/jobs). The typeface is **Graphik**. Text is near-black navy #050C26, CTAs are black ("Create profile", "Search"), and the logo has a pink/red colon ("wellfound:"). Small pink accents are #E9357B and #D11F68, plus a yellow #F8BE14. The hero scatters **tilted sticker-like cards** ("New message: You have 9 interviews ready"). Below it, "Trending startups hiring now" cards show logo, employee count, a one-liner and pink pill badges ("Growing fast", "Top 5% of responders", "Responds within a few days") — [wellfound.com/jobs](https://wellfound.com/jobs). Verdict: clean and slightly playful. The responsiveness badges are a distinctive signal, but the overall look is generic startup-SaaS.
- **Remote.co** (https://remote.co/remote-jobs/). It uses Open Sans with Raleway headings, blue #006EA5, and **mint #D5FFC8 "NEW!" badges**. Listings now include "Hybrid Remote Work" and "Hybrid Remote in Melbourne, VIC, Australia", with salaries in AUD — [remote.co/remote-jobs](https://remote.co/remote-jobs/). Verdict: generic. The "remote" label is diluted by hybrid roles.
- **FlexJobs** (https://www.flexjobs.com/). The typeface is **halcyon**. The CTA is orange #FF532A, the secondary colour is blue #007CAD, and the theme colour is deep teal #004F6D. The hero is a **stock lifestyle photo** of a smiling woman with a laptop on an orange circle, with floating chips "200k+ Jobs Available" and "100% Remote Jobs". The headline is "The #1 Job Site to Find Work From Home Jobs. No Ads, Scams, or Junk" — [flexjobs.com](https://www.flexjobs.com/). Verdict: an "ad-landing-page" look, not distinctive.
- **Arc.dev** (https://arc.dev/remote-jobs). Body text is Open Sans and the H1 is **Inter 900** ("Remote Jobs"). The accent is blue #075AFF on white. Cards show title, "Arc Exclusive", "Actively hiring", "Fast apply", type (Freelance/Full-time), seniority, skill tags, and an **explicit time-zone line**: "Overlap with Eastern Time (US & Canada) working hours" or "Overlap with Cairo working hours". Salary is shown as "US$130K - 135K" or just an "Hourly rate" label. There is no match score — [arc.dev/remote-jobs](https://arc.dev/remote-jobs). Verdict: plain blue SaaS. Its time-zone wording is the useful idea.
- **Turing** (https://www.turing.com/jobs). It uses **Poppins** and blue #2E6EDF. The page has pivoted to AI-training work ("Accelerate your career with AI… Solve cutting-edge challenges and advance AI") and shows role categories instead of a job list — [turing.com/jobs](https://www.turing.com/jobs). Verdict: generic.
- **Welcome to the Jungle (WTTJ)** (https://www.welcometothejungle.com/en/jobs). It uses a **bespoke "welcome-font" at weight 900** for headings and **Work Sans** for body text. The hero is a full-bleed **yellow #FFCD00**, the page background is warm off-white #F6F3EF, buttons are black ("Search", "Sign in"), and the active nav pill is yellow ("Find a job") — [WTTJ jobs](https://www.welcometothejungle.com/en/jobs?refinementList%5Bremote%5D%5B%5D=fulltime). The identity dates from June 2020: yellow "contemporary, warm and joyful", the bespoke "Welcome" headline font by Violaine & Jeremy, Work Sans body, and the tagline "Work for More" — [WTTJ brand article](https://www.welcometothejungle.com/en-GB/articles/wttj-new-brand-identity), [Welcome Font article](https://www.welcometothejungle.com/en-GB/articles/new-welcome-font). Signed out, the jobs URL now shows a **matching pitch instead of a list**: "3 steps to the job that fits", "Get matched", "Know why you fit before you apply", and the editorial video series "Oh My Job" — [WTTJ jobs page text](https://www.welcometothejungle.com/en/jobs?query=developer&refinementList%5Bremote%5D%5B%5D=fulltime). Verdict: the most ownable brand in the category. **Yellow plus a chunky custom display font is taken.**
- **Otta** (now part of WTTJ). Ragged Edge's 2021 identity used "a bold colour palette that's loud, bold and impossible to miss": bright yellow, pink, orange gradients, turquoise, pink concentric spiral loops, stacked chevrons, and icons that "take centre stage". It was a "candidate-first career champion", the "antithesis of the corporate job platform" — [Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/). Stink Studios made the 2022 "Otta helps you find that job" campaign — [Stink Studios](https://stinkstudios.com/work/find-that-job), [LBB](https://lbbonline.com/news/start-up-job-search-platform-otta-appoints-stink-studios-for-brand-campaign). WTTJ acquired Otta in January 2024 and rebranded it to WTTJ — [WTTJ employer FAQ](https://employers.welcometothejungle.com/companies/welcome-to-the-jungle), [Mondaq press release](https://www.mondaq.com/pressrelease/131590/welcome-to-the-jungle-acquires-job-search-platform-otta). Verdict: it was memorable, and **the brand is gone**, so its loud multicolour look is no longer in the market.
- **Contra** (https://contra.com/). The typeface is **GT Standard** (M and L cuts). Text is near-black #14171F on white. Small accents are green #3AB266, violet #6A57E3, coral #FF5A5E and pale lime #F0FB96. The hero is an **AI chat box** ("How can I help you?", a "Let's go" button and suggestion chips) above "Trending topics" cards made of dark photos with stats. The tagline is "The network for creative intelligence" — [contra.com](https://contra.com/). Verdict: premium-feeling, but in the same chat-box-hero idiom as most 2025–26 AI products.
- **Peerlist** (https://peerlist.io/jobs). Text is **Geist** throughout, and a promo heading uses **Instrument Serif** (font-family "instrument"). The palette is Tailwind slate (#64748B, #0F172A), green #009541 for the "Create Profile" CTA, and theme colour #27AE60. Layout is a left icon nav (Scroll, Launchpad, Jobs, Search, Blog), a **flat single-line list** ("UI/UX Design Intern at Sophinea", "Hybrid (Bengaluru, India)", "Remote (United States) • 4+ years"), a right promo card and an "AI Job Search" pill — [peerlist.io/jobs](https://peerlist.io/jobs). Verdict: the "Vercel/shadcn" minimal look. Clean, and indistinguishable from many 2025 SaaS apps.
- **Toptal** (https://www.toptal.com/). It uses **Proxima Nova**, blue #204ECF (also the theme-color), and a **green CTA #00CC83**. The hero is a **cut-out portrait photo** of a vetted freelancer on a grey-blue field, with the headline "Hire the Top 3% of Freelance Talent®" — [toptal.com](https://www.toptal.com/). Verdict: corporate, and employer-facing, not candidate-facing.
- **Read.cv**. Perplexity acquired it in January 2025, it started winding down, and users could export data until 16 May 2025 — [TechCrunch](https://techcrunch.com/2025/01/17/perplexity-acquires-read-cv-a-social-media-platform-for-professionals/), [IndieWeb](https://indieweb.org/Read.cv). **Shut down.**
- **Deel / Remote.com job boards**: not checked (see Gaps).

#### Big generalists
- **LinkedIn Jobs** (https://www.linkedin.com/jobs/). The signed-out search redirected to an **authwall** ("Join LinkedIn"), so the list could not be observed. The brand blue #0A66C2 was measured on that page — [linkedin.com/jobs/search](https://www.linkedin.com/jobs/search?keywords=frontend&f_WT=2). Job Match launched in January 2025. It summarises how your profile compares with a posting's required and preferred qualifications, and Premium users see a high/medium/low rating plus a "Top Applicant" signal — [Social Media Today](https://www.socialmediatoday.com/news/linkedin-ai-tools-job-seekers-recruiters-smbs/737481/), [Business Today](https://www.businesstoday.in/technology/news/story/linkedin-introduces-ai-powered-job-match-feature-to-simplify-hiring-and-job-seeking-461203-2025-01-17), [Engadget](https://www.engadget.com/social-media/linkedin-wants-you-to-apply-for-fewer-jobs-140049139.html), [LinkedIn product page](https://www.linkedin.com/hibt). Verdict: the canonical "blue professional network" look.
- **Indeed** (https://www.indeed.com/q-remote-frontend-jobs.html). The typeface is **Noto Sans**, with "Indeed Sans" second in the stack. Buttons are blue #004FCB and links #085FF7. Layout is the classic **split pane**: a list of bordered cards (title, company, "Remote", bookmark icon) on the left and a sticky detail on the right. Filter pills read "Pay, Remote, Easily apply, Job type, Experience level, Education, Encouraged to apply, Date posted". The detail panel's "Job details" block has icons and shows **"Pay information not provided"**, "Full-time" and "Remote" — [indeed.com](https://www.indeed.com/q-remote-frontend-jobs.html). Verdict: the reference "utilitarian blue" look.
- **Glassdoor** (https://www.glassdoor.com/Job/…). It uses **Glassdoor Sans**. Text is near-black #00060C, the accent is dark green #004D2F with #4CD681, and the theme colour is #0CAA41. The nav has "Your job matches", and filter chips read "Easy Apply only / Remote only / Company rating / Date posted / Salary range". Cards show company, title, "Remote", salary **with provenance** ("$20.00 - $55.00 Per Hour (Employer provided)"), a snippet and a "Skills:" line — [glassdoor.com search](https://www.glassdoor.com/Job/remote-frontend-developer-jobs-SRCH_IL.0,6_IS11047_KO7,25.htm). Glassdoor was folded into Indeed in July 2025, and new users must sign in with an Indeed account — [Reworked](https://reworked.co/employee-experience/glassdoor-folds-into-indeed/), [HR Dive](https://www.hrdive.com/news/layoffs-glassdoor-indeed-ai-integration/752876/), [ERE](https://www.ere.net/articles/indeed-and-glassdoor-hit-by-more-layoffs-as-recruit-restructures-hr-tech-division). Verdict: owns green among the generalists.

#### Russian-language / CIS
- **hh.ru** (https://hh.ru/search/vacancy?work_format=REMOTE). All text uses the custom **"hh sans"** (2,802 elements). The CTA is blue #0070FF ("Откликнуться"), the secondary CTA is black ("Создать резюме"), the logo is a red circle, and text is #2A3137. A card reads: "Сейчас смотрят 18 человек | Frontend developer (React) | **до 250 000 ₽ за месяц, на руки** | Опыт более 6 лет | **Можно удалённо** | Выплаты: Два раза в месяц | Enjoypro | 4.5 • 21 отзыв | Санкт-Петербург | Откликнуться". The page also has a "Вакансии на карте" map widget and a region prompt ("Ваш регион — Москва?") — [hh.ru search](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend). The new identity was published on 2025-08-29 by ONY. Its concept is "освещать путь", with **light as the main expressive element**, scenes built as background/object/light-source, illustrations with hatching, and 204 icons that echo the oval of the font. The hh sans face has 3 text cuts and 1 display cut, covers Cyrillic, extended Latin and Georgian, and is described as "живой, чуть шероховатый, очень человечный". The motivation is a broader audience (blue-collar and entry-level jobs) — [Sostav](https://www.sostav.ru/publication/svet-na-puti-poiska-novyj-vizualnyj-stil-hh-ru-77679.html). The work won RUWARD AWARD 2026 for branding — [RUWARD](https://ruward.ru/award/2026/312101/). Verdict: the product UI is still blue-on-white chips. The brand layer (custom font, light) is distinctive and recent, so the **"light/illumination" metaphor is now taken in the Russian market**.
- **Хабр Карьера** (https://career.habr.com/vacancies?remote=true). It uses **Inter** throughout. The accent is **violet #8164F7** (33 buttons and badges), text #1B272C, link blue #0464D2 and greens #00AD3A/#3DC24A. A pink-violet promo banner sits on top, and some cards have an orange highlight border. A card reads: "2 ноября | ITK academy | 4.92 | AQA Тестировщик (Python) | от 75 000 до 90 000 ₽ | Junior | Можно удалённо | Python | ООП | …". Cards with no salary say "**Зарплата не указана | Похожие специалисты получают 155 000 - 244 000 ₽**" — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all). Verdict: generic layout. The salary fallback is a notable honesty pattern.
- **getmatch** (https://getmatch.ru/vacancies). Headings are **Montserrat** and body text is Inter. The accent is blue #205AED (links and titles), on a light grey page with a **peach-tinted card**. The "Добавить в Telegram" CTA is black. A card reads: "Data Scientist Fast Track | в Avito | 📍 Москва | Санкт-Петербург | … | Ереван (Армения) | Гибрид | 📍 **Весь мир** | Удалённо", with the full description inline. The salary filter uses "₽/мес **на руки**" — [getmatch.ru/vacancies](https://getmatch.ru/vacancies). Verdict: generic, with emoji pins.
- **SuperJob** (https://www.superjob.ru/vakansii/udalennaya-rabota.html). It uses the system font stack. The accent is green #00A278 (theme #009476), chips are slate #414957 and links violet #6942B8. The hero is an illustrated banner with a running **rabbit** promoting the "Быстрые собеседования" show. The remote page redirects to "**Удалённая работа в Москве**" (52 vacancies), so the remote listing is scoped to a city, and the top card is a paid red bank listing — [superjob.ru](https://www.superjob.ru/vakansii/udalennaya-rabota.html). Verdict: generic, ad-heavy.
- **Geekjob** (https://geekjob.ru/). It uses the system font stack, Font Awesome and Material Icons. The palette is **Material/Flat-UI defaults**: #16A085, #2196F3, #FF9800, #E74C3C, and link #039BE5. The hero is a blue banner reading "Сервис **анонимного** поиска работы в ИТ и Диджитал". Below it sit two columns, "Вакансии" and "Специалисты", with salaries like "2.5K — 3K $" — [geekjob.ru](https://geekjob.ru/). Verdict: dated circa-2016 Material look.
- **remocate.app** (https://www.remocate.app/). It uses **Poppins**. The accent is **#2563EB with a blue gradient hero**, and text is #0F172A. The background has a dotted grid, and the hero chips carry emoji ("work remotely", "relocate"). Rows read "Financial and Compliance Controller | United Tech | New | 2h ago | Remote | 💵 Finances | Ukraine", with category emoji (💵, 🚀, 🕵️‍♀️). There is a "Salary shown" filter, and rows carry a "Salary from the job post" label in the accessibility tree — [remocate.app](https://www.remocate.app/). Its Telegram channel @remocate has 141K subscribers. Posts are plain text with no emoji or hashtags: "Role в **Company**" plus a link, a remote/relocation line, a salary line and an italic footer — [t.me/s/remocate](https://t.me/s/remocate). Verdict: the default Tailwind/landing-page look.
- **Telegram job channels (as a format)**. A September 2025 roundup lists Russian-language remote-work channels (@onlinevakansii, @jobs_start, @work_finde, @normrabota, @marketing_jobs and others). It notes that some include "зарплатные вилки", and it lists no bots — [vc.ru](https://vc.ru/hr/2217641-udalyonnaya-rabota-v-telegram). Habr advises checking that a Telegram vacancy also exists on the company site or a trusted board — [vc.ru/Habr summary](https://vc.ru/hr/2110889-udalennaya-rabota-v-rossii-cherez-telegram), [Habr](https://habr.com/ru/articles/825836). The format is a text-only feed with no structured fields.

#### AI job-matching products (2024–2026)
- **Jobright.ai** (https://jobright.ai/). The H1 is **Titillium Web** and body text is Inter. The page is white with a pale mint wash and a **mint #00F0A0** accent. It features a browser-window mockup, a black pill "TRY FOR FREE" button, and stats ("3,000,000 trusted users", "3x interviews landed"). The headline is "No More Solo Job Hunting / Do it with AI" — [jobright.ai](https://jobright.ai/). It offers a "Match Score", and the Orion "Job Fit Analysis" covers "Relevant Experience", "Seniority", "Skills" and "**Potential Gaps**". It opens with "Here's why this role may be a fit for you" — [jobright.ai/ai-job-match](https://jobright.ai/ai-job-match). It also sells autofill applications — [jobright.ai](https://jobright.ai/).
- **Sorce** and look-alikes (Skyworker, Poozle, Bagchaser) present a "Tinder for jobs" **swipe** interface with AI auto-apply. The swipe-for-jobs idea was mocked as importing "the worst part of modern dating" — [Daily Dot](https://dailydot.com/sorce-tinder-for-jobs-reactions), [Villpress](https://villpress.com/?p=6568), [People Matters](https://www.peoplemattersglobal.com/?p=16683).

### Inferences
- In the sampled set, the default action colour is blue. It appears on LinkedIn, Indeed, hh.ru, getmatch, Arc, Toptal, Turing, remocate, Jobicy, Remote OK, Remote.co and FlexJobs (secondary).
- Several 2024–26 entrants show framework default palettes rather than designed ones: Peerlist and remocate use Tailwind slate #0F172A/#64748B and blue-600 #2563EB, WWR uses Bootstrap #0D6EFD/#212529, and Geekjob uses Material #2196F3/#FF9800. This is inferred from exact matches with the frameworks' published default values.
- Only five products ship a proprietary typeface in the product UI: hh.ru (hh sans), Glassdoor (Glassdoor Sans), Indeed (Indeed Sans in its stack), WTTJ (Welcome) and Remotive (Remotive*). The rest use licensed or free grotesques: Inter, Geist, Poppins, Graphik, Proxima Nova, Euclid, Bricolage Grotesque, Neufile Grotesk, Montserrat and Open Sans.

### Gaps
- Deel and Remote.com job boards were not checked. I found no evidence of a candidate-facing Deel job board, and Remote.com was not opened.
- LinkedIn's signed-in job list and Job Match panel could not be observed because of the authwall and the no-sign-in rule. The descriptions come from press, not first-hand observation.
- Himalayas' live UI could not be seen. Colours and font come from a Wayback copy dated 2026-10-06, which may differ slightly from today.
- Card-level screenshots below the fold failed on several sites when the pane stopped rendering. Card fields were captured from DOM text instead, so exact visual treatments of tags (fill vs. outline) are confirmed only where a screenshot exists: Remote OK, hh.ru, Habr, getmatch, remocate, Peerlist and Indeed.
- "Удалёнка"-style standalone Russian boards beyond those above (e.g. remote-job.ru) were not sampled.

## What are the shared visual conventions?

### Takeaway
The category's shared grammar is: white or off-white page; a blue, green or violet action colour; a neutral grotesque or geometric sans; a vertical list of **logo + title + company + a row of pill chips** (location, salary, type, skills); a left filter sidebar or top filter pills; yellow or tinted rows for **paid** placements; and smiling stock or portrait photography on marketing pages. Remote boards add flags plus country strings for eligibility.

### Cited Findings
- **Pill chips for everything.**
  - hh.ru: "Опыт более 6 лет", "Можно удалённо", "Выплаты: …" — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend).
  - Habr: "Junior", "Можно удалённо" and skill chips — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all).
  - Remote OK: black-outlined tags — [remoteok.com](https://remoteok.com/).
  - Indeed: filter pills — [indeed.com](https://www.indeed.com/q-remote-frontend-jobs.html).
  - remocate: "Remote"/category/region chips — [remocate.app](https://www.remocate.app/).
  - Wellfound: pink signal pills — [wellfound.com/jobs](https://wellfound.com/jobs).
- **Yellow or tinted rows mean "paid".**
  - WWR: yellow #FFD500 on "Boosted/Featured" listings — [weworkremotely.com](https://weworkremotely.com/).
  - Remote OK: yellow #FFF38F featured rows — [remoteok.com](https://remoteok.com/).
  - Remotive: peach #FED294 "Featured" rows — [remotive.com](https://remotive.com/remote-jobs).
  - Habr: orange-bordered highlighted card — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all).
  - SuperJob: red paid bank card at the top — [superjob.ru](https://www.superjob.ru/vakansii/udalennaya-rabota.html).
- **Split list + detail pane** on the generalists: Indeed — [indeed.com](https://www.indeed.com/q-remote-frontend-jobs.html).
- **Left filter sidebar**: Working Nomads — [workingnomads.com](https://www.workingnomads.com/jobs); getmatch — [getmatch.ru](https://getmatch.ru/vacancies); Habr (right side) — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all); Jobicy app-shell nav — [jobicy.com](https://jobicy.com/).
- **Black pill CTAs** as the 2024–26 "modern" button: Jobicy, WTTJ, Wellfound, Jobright, getmatch, hh.ru's secondary CTA — [jobicy.com](https://jobicy.com/), [WTTJ](https://www.welcometothejungle.com/en/jobs), [wellfound.com](https://wellfound.com/jobs), [jobright.ai](https://jobright.ai/), [getmatch.ru](https://getmatch.ru/vacancies), [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend).
- **Two-tone headlines** (one phrase in the accent colour): Jobicy — [jobicy.com](https://jobicy.com/); WWR — [weworkremotely.com](https://weworkremotely.com/); FlexJobs ("The **#1** Job Site…") — [flexjobs.com](https://www.flexjobs.com/); Toptal (underlined "Top 3%") — [toptal.com](https://www.toptal.com/).
- **Stock or portrait photography of a person with a laptop**: FlexJobs — [flexjobs.com](https://www.flexjobs.com/); Toptal — [toptal.com](https://www.toptal.com/); Working Nomads silhouette — [workingnomads.com](https://www.workingnomads.com/jobs).
- **AI chat-box or "AI Job Search" entry points**: Contra hero prompt box — [contra.com](https://contra.com/); Peerlist "AI Job Search" pill — [peerlist.io/jobs](https://peerlist.io/jobs); Jobicy "AI Tools" — [jobicy.com](https://jobicy.com/); Jobright "AI Job Search Copilot" — [jobright.ai](https://jobright.ai/).
- **Social-proof counters**: hh.ru "Сейчас смотрят 18 человек" — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend); WWR "42,822 jobs posted" and "Latest post 4 minutes ago" — [weworkremotely.com](https://weworkremotely.com/); Jobicy stats row — [jobicy.com](https://jobicy.com/); Remotive "20,099 remote jobs added this week" — [remotive.com](https://remotive.com/remote-jobs).

### Inferences
- Visual convergence is strongest in the card itself: chips, logo, title/company. Brand difference lives almost entirely in headers and heroes, which disappear once a user is scrolling a list.
- On remote boards, a yellow or tinted row signals "this is an ad", not "this is important". If Nenaugad uses yellow or a warm tint as a highlight, users trained on WWR and Remote OK may read it as sponsored.
- A black pill CTA with a geometric sans is now the generic "2025 startup" tell. It no longer differentiates.

### Gaps
- No usage or eye-tracking data was found on which card layout performs better. These are observations, not effectiveness claims.

## Which platforms are genuinely memorable, and what did their redesigns change?

### Takeaway
Memorability comes from **owning one extreme**: WTTJ's saturated yellow plus a bespoke ultra-bold display font; Otta's loud multicolour spirals (now defunct); Remote OK's emoji/flag density with yellow ad rows; Remotive's warm brown/orange; and hh.ru's 2025 custom hh sans with a "light" metaphor. Recent redesigns moved toward **matching-first** flows (WTTJ 2025–26) and **warmer, more human brand layers** (hh.ru 2025). In the product UI itself, the list stayed conventional.

### Cited Findings
- **WTTJ.**
  - The 2020 identity: yellow "contemporary, warm and joyful", the bespoke "Welcome" headline font, Work Sans body, and the tagline "Work for More" — [WTTJ](https://www.welcometothejungle.com/en-GB/articles/wttj-new-brand-identity).
  - The live font is "welcome-font" at weight 900, on a yellow #FFCD00 hero and warm #F6F3EF page — [WTTJ jobs](https://www.welcometothejungle.com/en/jobs?refinementList%5Bremote%5D%5B%5D=fulltime).
  - The candidate search was changed to show "fewer" jobs where you have "a realistic chance of being contacted", with a "quality over quantity" aim. The help page says the ranking is not driven by "the biggest advertising budget" and that a system to "clearly explain why a job is considered a match" is still being built — [WTTJ help](https://help.welcometothejungle.com/en/why-has-the-search-experience-changed-on-welcome-to-the-jungle).
  - The recruiter-side "Welcome Hiring Suite" with AI job matching was announced on 15 April 2026 — [Onrec](https://onrec.com/news/launch/recruitment-in-the-ai-era-welcome-to-the-jungle-launches-new-people-first-hiring-suite).
- **Otta (2021–2024).** The palette was "loud, bold and impossible to miss", with pink spirals on turquoise, icons that "take centre stage", and a typographic system that "starts off quietly and gets progressively louder". It was positioned as a "career champion" — [Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/), [Transform](https://www.transformmagazine.net/articles/2021/ragged-edge-fully-rebrands-job-search-platform/). WTTJ absorbed it in 2024 — [WTTJ employer FAQ](https://employers.welcometothejungle.com/companies/welcome-to-the-jungle).
- **hh.ru (2025).**
  - ONY's identity uses light as the main element, the custom hh sans, hatched illustrations and 204 icons. The rationale is a broader audience and the message that hh.ru "освещает путь" — [Sostav](https://www.sostav.ru/publication/svet-na-puti-poiska-novyj-vizualnyj-stil-hh-ru-77679.html).
  - The product UI now renders entirely in hh sans — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend).
  - The work won RUWARD 2026 — [RUWARD](https://ruward.ru/award/2026/312101/).
- **Remote OK.** It keeps emoji in titles (🎈), flags, 💰 salary, yellow featured rows, outlined tags and "#OpenSalaries" on a light default, with Dark and "Hacker News" modes as options — [remoteok.com](https://remoteok.com/), [cached Remote OK menu](https://remoteok.com/hire-remotely/design-thiking). I found no write-up dating a redesign — [Product Hunt](https://www.producthunt.com/p/remotejobs/remote-ok).
- **Remotive.** Custom typefaces, brown #532A21 text and orange #FF871A CTAs — [remotive.com](https://remotive.com/remote-jobs).
- **Wellfound.** Tilted sticker cards and "Responds within a few days" responsiveness badges — [wellfound.com/jobs](https://wellfound.com/jobs).
- **Consolidation and shutdowns that changed the landscape.**
  - Read.cv shut down in 2025 — [TechCrunch](https://techcrunch.com/2025/01/17/perplexity-acquires-read-cv-a-social-media-platform-for-professionals/).
  - Glassdoor was folded into Indeed in 2025 — [Reworked](https://reworked.co/employee-experience/glassdoor-folds-into-indeed/).
  - Otta was absorbed into WTTJ in 2024 — [Mondaq](https://www.mondaq.com/pressrelease/131590/welcome-to-the-jungle-acquires-job-search-platform-otta).
  - Turing pivoted to AI-training work — [turing.com/jobs](https://www.turing.com/jobs).

### Inferences
- With Otta and Read.cv gone, the two most design-led candidate brands of 2020–24 have left. Today's "designed" candidate brands are WTTJ (yellow) and, in Russia, hh.ru (hh sans + light). The rest are generic, which leaves room for a distinctive candidate-first identity.
- WTTJ has publicly committed to explaining matches but has not shipped it, as of its help page. That makes "honest, explained fit" a moment Nenaugad could own before WTTJ does.

### Gaps
- I found no public case study of a 2024–26 WTTJ product-UI redesign of the job card itself. The search-experience change is documented only as help text.
- I found no detailed write-up of Remote OK's move to a light default or its dates.

## How do the best ones visualize "fit" or "match"? Does anyone show uncertainty or unknowns honestly?

### Takeaway
Fit is shown as **a single score or label** (Jobright "Match Score", LinkedIn Premium high/medium/low, Glassdoor "Your job matches"), as **matched/unmatched qualifications** (LinkedIn Job Match, Indeed "Profile insights" with green for matches), or as **opaque ranking** (WTTJ fewer, better-matched results, still without explanations). No sampled platform shows a per-condition **pass / unknown / fail** with the source quote. Honest handling of missing data exists only piecemeal, almost always for salary: "Pay information not provided", "Зарплата не указана" with a market range, "Employer provided", "Probably worldwide". Remote OK even uses a paywall as the unknown state.

### Cited Findings
- **LinkedIn Job Match** (January 2025) gives a summary of how your skills compare with required and preferred qualifications. Premium shows a high/medium/low rating and "Top Applicant" — [Social Media Today](https://www.socialmediatoday.com/news/linkedin-ai-tools-job-seekers-recruiters-smbs/737481/), [Business Today](https://www.businesstoday.in/technology/news/story/linkedin-introduces-ai-powered-job-match-feature-to-simplify-hiring-and-job-seeking-461203-2025-01-17). Secondary sources disagree on whether matching is contextual or keyword-based, and there is no official statement — [The Interview Guys](https://blog.theinterviewguys.com/?p=7477).
- **Indeed "Profile insights"** sit under the company name and show how your qualifications match employer requirements (skills, education, certifications, languages). "Green highlights mean an insight or detail matches your profile", and colours show "what matches and what does not" — [Indeed Help Center](https://support.indeed.com/hc/en-us/articles/32603395892109).
- **Jobright** has a "Match Score" and a Job Fit Analysis with "Relevant Experience / Seniority / Skills / Potential Gaps", plus "See Key Requirements" listing aligned skills and requirements to review — [jobright.ai/ai-job-match](https://jobright.ai/ai-job-match). Third-party listings describe a 0–100 scale — [Jobright search summary](https://jobright.ai/tools/resume-job-matcher).
- **WTTJ** shows matching without explanation, for now: "currently working on a system that will clearly explain why a job is considered a match" — [WTTJ help](https://help.welcometothejungle.com/en/why-has-the-search-experience-changed-on-welcome-to-the-jungle).
- **Glassdoor** has a "Your job matches" nav item and a "Skills:" line on cards — [glassdoor.com](https://www.glassdoor.com/Job/remote-frontend-developer-jobs-SRCH_IL.0,6_IS11047_KO7,25.htm).
- **Honest unknowns found:**
  - Indeed: "Pay information not provided" — [indeed.com](https://www.indeed.com/q-remote-frontend-jobs.html).
  - Хабр Карьера: "Зарплата не указана | Похожие специалисты получают 155 000 - 244 000 ₽", which names the absence and then offers a labelled estimate — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all).
  - Glassdoor: "(Employer provided)" provenance tag on salary — [glassdoor.com](https://www.glassdoor.com/Job/remote-frontend-developer-jobs-SRCH_IL.0,6_IS11047_KO7,25.htm).
  - Remote OK: "🌏 Probably worldwide", a hedged location — [remoteok.com](https://remoteok.com/).
  - hh.ru: "на руки" (net of tax) — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend). getmatch: "₽/мес на руки" — [getmatch.ru](https://getmatch.ru/vacancies).
  - remocate: "Salary from the job post" label — [remocate.app](https://www.remocate.app/).
- **Unknown as a paywall**: Remote OK's "💰 Upgrade to Premium to see salary" — [remoteok.com](https://remoteok.com/).
- **Arc, Himalayas and WWR show no match score** on the list — [arc.dev](https://arc.dev/remote-jobs), [himalayas.app](https://himalayas.app/jobs), [weworkremotely.com](https://weworkremotely.com/remote-full-stack-programming-jobs).
- **hh.ru**: I found no official description of a percentage resume-to-vacancy match. Skills tags do feed matching — [hh.ru article](https://hh.ru/article/31649), [Habr](https://habr.com/ru/articles/994398).

### Inferences
- The market's fit visuals collapse uncertainty. A score or a green/not-green highlight cannot distinguish "the posting says no" from "the posting doesn't say". Nenaugad's three-state conditions with quotes are a genuinely unoccupied pattern, and the closest analogues, Habr's salary fallback and Glassdoor's provenance tag, are only about salary.
- A neutral "unknown" state needs its own colour and shape. It cannot borrow green or red, and it should not look like the paywalled or empty states that competitors use, where Remote OK's unknown salary is a sales prompt.
- Avoid a single percentage or circular gauge. It is the AI-startup convention (Jobright, and LinkedIn Premium's banding), and it contradicts the product rule that eligibility is not relevance.

### Gaps
- I could not observe Jobright's or LinkedIn's actual match UI (colours, gauges) without signing in. Their descriptions come from the vendors' own pages and the press.
- I found no platform that displays a quoted source sentence next to an extracted condition. This is an absence of evidence from about 27 sites, not proof that none exists.

## How do they visualize time zones and location eligibility for remote jobs?

### Takeaway
Almost entirely **as text strings plus flags**: "Anywhere in the World", "🇺🇸 United States of America", "North America Only", "United Kingdom only", "AL, AD + 71 more", "🌏 Probably worldwide", "📍 Весь мир". Time zones appear only as prose ("Overlap with Eastern Time (US & Canada) working hours") or as filter text ("Country or timezone"). No sampled site draws an overlap band, clock or map of working hours. Russian boards often reduce remote to a "Можно удалённо" chip, while still anchoring the job to a city.

### Cited Findings
- **WWR**: "Anywhere in the World", "🇺🇸 United States of America", "🇬🇧 United Kingdom…", "North America Only", plus an "HQ:" line — [weworkremotely.com category](https://weworkremotely.com/remote-full-stack-programming-jobs).
- **Himalayas**: flag plus "United Kingdom only", "CA and US only", "Mexico only", and "AL, AD + 71 more" — [himalayas.app/jobs](https://himalayas.app/jobs). The location filter is "Country or timezone" — [Wayback](https://web.archive.org/web/2026id_/https://himalayas.app/jobs). Employers are told to "specify required timezone overlap", e.g. US Eastern for at least 4 hours — [Himalayas docs](https://himalayas.app/docs/posting-a-remote-job). Scrapers report structured timezone-restriction fields, which is unverified on the UI — [Apify](https://apify.com/himalayas/remote-jobs).
- **Arc.dev**: "Overlap with Eastern Time (US & Canada) working hours", "Overlap with Cairo working hours", and "Remote, Philippines" — [arc.dev/remote-jobs](https://arc.dev/remote-jobs).
- **Remote OK**: "🇨🇦 Canada", "🇺🇸 United States", "🌏 Probably worldwide" — [remoteok.com](https://remoteok.com/).
- **remocate**: a "Remote" or "Relocation" chip plus region ("Europe", "Spain", "Ukraine") — [remocate.app](https://www.remocate.app/). Telegram posts give one location line — [t.me/s/remocate](https://t.me/s/remocate).
- **getmatch**: "📍 Москва | … | Ереван (Армения) | Гибрид | 📍 Весь мир | Удалённо" — [getmatch.ru](https://getmatch.ru/vacancies).
- **hh.ru**: "Можно удалённо" chip plus employer city ("Санкт-Петербург") and a map widget — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend).
- **Habr**: "Можно удалённо" plus city ("Новосибирск") — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all).
- **SuperJob**: the remote page becomes "Удалённая работа в Москве" — [superjob.ru](https://www.superjob.ru/vakansii/udalennaya-rabota.html).
- **Remote.co**: "Hybrid Remote in Melbourne, VIC, Australia" — [remote.co](https://remote.co/remote-jobs/).
- **Peerlist**: "Remote (United States)" and "Hybrid (Bengaluru, India)" — [peerlist.io/jobs](https://peerlist.io/jobs).
- Many remote jobs are still country-specific, per a third-party guide — [onterjob guide](https://onterjob.pages.dev/blog/best-remote-jobs-apac-time-zones-2026-guide).

### Inferences
- Flags plus a country string is the universal idiom, and it is taken. Nenaugad's differentiator is to show **the candidate's own position against the requirement**: their time zone against the required overlap window, and their country against the hiring list, as pass/unknown/fail. Today every board shows only the employer's side.
- A 24-hour band or "clock strip" showing overlap hours is visually open territory in this sample. Arc's prose shows the data exists, but nobody draws it.
- Russian boards conflate remote with a city ("в Москве"). A remote-only Russian-language product can make "where can I legally be hired from" the headline, instead of a city.

### Gaps
- Job detail pages were not opened on every board. A timeline-style overlap visual might exist on a detail page (e.g. Himalayas, which was blocked), so treat "nobody draws it" as true for list views only.

## Which colours and visual moves are "taken", and which are open for Nenaugad?

### Takeaway
Taken:
- blue, the default for LinkedIn, Indeed, hh.ru, getmatch, Arc, Toptal, remocate and others;
- green, for Glassdoor, SuperJob, Peerlist and Jobright mint;
- violet, for Хабр Карьера and Himalayas;
- **yellow, owned by WTTJ** and used as the "paid row" signal on WWR and Remote OK;
- orange and brown, for Remotive and FlexJobs;
- teal, for Working Nomads and Geekjob;
- emoji density, for Remote OK, remocate and getmatch;
- smiling stock photos, for FlexJobs, Toptal and Working Nomads;
- light/illumination, for hh.ru 2025;
- the AI chat-box hero and black pills, for Contra, Jobright, Jobicy and Wellfound.

Open: a non-blue, non-yellow saturated primary (e.g. hot magenta or vermilion-on-ink, now that Otta's pink has left the market), dark or ink-heavy grounds, serif or editorial display typography, document- or ledger-like evidence layouts with quotations, and graphic time-zone overlap. Above all, a **three-state visual language** (pass/unknown/fail) that nobody uses.

### Cited Findings
- Blue primaries measured:
  - LinkedIn #0A66C2 — [linkedin.com](https://www.linkedin.com/jobs/search?keywords=frontend&f_WT=2)
  - Indeed #004FCB/#085FF7 — [indeed.com](https://www.indeed.com/q-remote-frontend-jobs.html)
  - hh.ru #0070FF — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend)
  - getmatch #205AED — [getmatch.ru](https://getmatch.ru/vacancies)
  - Arc #075AFF — [arc.dev](https://arc.dev/remote-jobs)
  - Toptal #204ECF — [toptal.com](https://www.toptal.com/)
  - Turing #2E6EDF — [turing.com](https://www.turing.com/jobs)
  - remocate #2563EB — [remocate.app](https://www.remocate.app/)
  - Jobicy #029AEB — [jobicy.com](https://jobicy.com/)
  - Remote OK #0072B1 — [remoteok.com](https://remoteok.com/)
  - Remote.co #006EA5 — [remote.co](https://remote.co/remote-jobs/)
- Green measured:
  - Glassdoor #0CAA41/#004D2F — [glassdoor.com](https://www.glassdoor.com/Job/remote-frontend-developer-jobs-SRCH_IL.0,6_IS11047_KO7,25.htm)
  - SuperJob #00A278 — [superjob.ru](https://www.superjob.ru/vakansii/udalennaya-rabota.html)
  - Peerlist #009541 — [peerlist.io](https://peerlist.io/jobs)
  - Jobright #00F0A0 — [jobright.ai](https://jobright.ai/)
  - Toptal CTA #00CC83 — [toptal.com](https://www.toptal.com/)
- Violet measured:
  - Habr #8164F7 — [career.habr.com](https://career.habr.com/vacancies?remote=true&type=all)
  - Himalayas #9F7AEA/#6B46C1 — [Wayback CSS](https://web.archive.org/web/2026id_/https://himalayas.app/_next/static/chunks/1lthmj5h4swmk.css)
  - Contra secondary #6A57E3 — [contra.com](https://contra.com/)
- Yellow:
  - WTTJ #FFCD00 — [WTTJ](https://www.welcometothejungle.com/en/jobs)
  - WWR highlight #FFD500 — [weworkremotely.com](https://weworkremotely.com/)
  - Remote OK featured #FFF38F — [remoteok.com](https://remoteok.com/)
- Orange and brown:
  - Remotive #FF871A/#532A21 — [remotive.com](https://remotive.com/remote-jobs)
  - FlexJobs #FF532A — [flexjobs.com](https://www.flexjobs.com/)
  - Jobicy PRO #FF9100 — [jobicy.com](https://jobicy.com/)
- Teal: Working Nomads #299FB3 — [workingnomads.com](https://www.workingnomads.com/jobs); Geekjob #16A085 — [geekjob.ru](https://geekjob.ru/)
- Red as CTA or logo: WWR #F03E3E — [weworkremotely.com](https://weworkremotely.com/); the hh.ru logo is a red circle — [hh.ru](https://hh.ru/search/vacancy?work_format=REMOTE&text=frontend)
- Pink and magenta: only small accents on Wellfound (#E9357B, #D11F68) — [wellfound.com](https://wellfound.com/jobs). Otta's pink spirals have left the market — [Creative Boom](https://www.creativeboom.com/news/ottas-fresh-identity-by-ragged-edge/), [WTTJ FAQ](https://employers.welcometothejungle.com/companies/welcome-to-the-jungle).
- Typography is overwhelmingly sans: Inter, Geist, Poppins, Graphik, Proxima Nova, Euclid, Bricolage Grotesque, Neufile Grotesk, Montserrat, Open Sans, Noto Sans, Work Sans, GT Standard and system-ui (sources per platform above). The only serif observed was Instrument Serif in a Peerlist promo heading — [peerlist.io/jobs](https://peerlist.io/jobs).
- Dark default: none of the sampled pages loaded dark by default. Remote OK offers a Dark mode option — [cached Remote OK menu](https://remoteok.com/hire-remotely/design-thiking). Working Nomads has only a dark photo hero — [workingnomads.com](https://www.workingnomads.com/jobs).
- Illustration and metaphor already claimed:
  - hh.ru: light plus hatched illustrations — [Sostav](https://www.sostav.ru/publication/svet-na-puti-poiska-novyj-vizualnyj-stil-hh-ru-77679.html)
  - SuperJob: mascot rabbit — [superjob.ru](https://www.superjob.ru/vakansii/udalennaya-rabota.html)
  - Himalayas: mountain name and theme — [Product Hunt](https://www.producthunt.com/products/himalayas/reviews)
  - WTTJ: "jungle" plus editorial video ("Oh My Job") — [WTTJ](https://www.welcometothejungle.com/en/jobs?query=developer&refinementList%5Bremote%5D%5B%5D=fulltime)
- Interaction idioms already claimed: swipe-to-apply belongs to Sorce and its look-alikes — [Daily Dot](https://dailydot.com/sorce-tinder-for-jobs-reactions), and Nenaugad's no-auto-apply rule makes swipe a poor fit anyway. The AI chat-box hero belongs to Contra — [contra.com](https://contra.com/).

### Inferences
- **Avoid as primary**: mid-blue (#0050–#2563-ish), Glassdoor/SuperJob green, Habr violet, WTTJ yellow (also the "ad row" signal), Remotive orange/brown, and teal.
- **Plausibly open**, as an inference from what is absent in the sample:
  - a hot magenta, fuchsia or vermilion primary on deep ink or off-black;
  - acid chartreuse used structurally, not as a small accent;
  - a two-colour system in which one hue is reserved strictly for "unknown", for example a hatched or striped neutral, distinct from the pass and fail hues;
  - serif or editorial display type for headlines, a niche currently used only in one promo card;
  - monospace or "quoted evidence" styling for source citations, evoking a dossier or annotated document rather than a SaaS card;
  - a drawn time-zone overlap strip.
- Hatching for "unknown" overlaps slightly with hh.ru's hatched illustration style. hh.ru uses it decoratively, but a Russian audience may associate the texture with hh.ru, so choose a distinct texture (e.g. dotted, or a striped diagonal at a different angle) or test it.
- Emoji as a primary visual vocabulary would place Nenaugad next to Remote OK, remocate and the Telegram-channel look. That is fine for small tokens, but it should not be the identity.
- A bright, memorable direction that is also "honest" probably comes from making the **condition ledger the hero**, with a coloured three-state system plus quoted evidence, not from a hero illustration. That is the one piece of UI no competitor has. This is a synthesis, not a sourced claim.

### Gaps
- Colour ownership is inferred from about 27 sites and does not cover every regional board (e.g. Zarplata.ru, Rabota.ru, trudvsem.ru were not sampled).
- I found no trademark or colour-ownership data. "Taken" means "strongly associated in this category", not legally protected.
- Mobile-app screens (Mobbin, Page Flows) were not accessed. Several brands (WTTJ, hh.ru, Jobright, Sorce) are app-first, and their app UIs may differ from the web pages sampled here.
