
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
 mark:'<path d="M5 19 12 4l7 15M8 13h8M4 20h16"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 filter:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H5m6-6-6 6 6 6"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 question:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5m0 3v.1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13c5 3 13 3 18 0M10 14h4"/>',
 bookmark:'<path class="bookmark" d="M6 3h12v18l-6-4-6 4V3Z"/>',
 document:'<path d="M5 3h9l5 5v13H5V3Zm9 0v6h5M8 13h8M8 17h6"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 flag:'<path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
 delete:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>'
};
function icon(name){return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.info}</svg>`}
function btn(text,action,kind='primary',ico=''){return `<button class="btn ${kind}" data-action="${action}">${ico?icon(ico):''}${text}</button>`}
function link(text,to,kind='primary',ico=''){return `<a class="btn ${kind}" href="#${to}">${text}${ico?icon(ico):''}</a>`}
function badge(kind,text){return `<span class="badge ${kind}">${icon(kind==='pass'?'check':kind==='review'?'question':kind==='fail'?'close':'info')}${text}</span>`}
const jobs=[
{id:'fern',company:'Fern Labs',title:'Senior Full-stack Engineer',salary:'€72 000–90 000',basis:'/ год, до налогов',geo:'Найм по всему миру',contract:'Подряд / B2B',status:'pass',source:'Himalayas',checked:'2 часа назад',posted:'2 дня назад',skills:['TypeScript','React','Node.js'],reason:'Грузия разрешена · минимум 7 ч пересечения',mark:'f',fresh:true},
{id:'river',company:'River Software',title:'Product Engineer',salary:'€68 000–85 000',basis:'/ год, до налогов',geo:'Грузия и ещё 12 стран',contract:'Подряд / B2B',status:'pass',source:'Jobicy',checked:'3 часа назад',posted:'вчера',skills:['React','TypeScript','PostgreSQL'],reason:'Страна и договор совпадают · React подтверждён',mark:'r',fresh:true},
{id:'pearl',company:'Pearl Studio',title:'Frontend Engineer',salary:'€65 000–78 000',basis:'/ год, до налогов',geo:'Найм по всему миру',contract:'Подряд / B2B',status:'pass',source:'Himalayas',checked:'4 часа назад',posted:'3 дня назад',skills:['React','TypeScript','Accessibility'],reason:'Страна и рабочие часы совпадают',mark:'p',fresh:true},
{id:'cedar',company:'Cedar Cloud',title:'Senior Backend Engineer',salary:'€75 000–95 000',basis:'/ год, до налогов',geo:'Europe — список стран не указан',contract:'Подряд / B2B',status:'review',source:'Remotive',checked:'2 часа назад',posted:'вчера',skills:['Node.js','PostgreSQL','AWS'],reason:'Работодатель не уточнил список стран для Europe',mark:'c',fresh:true},
{id:'orbit',company:'Orbit Tools',title:'Full-stack Engineer',salary:'Зарплата не опубликована',basis:'',geo:'Найм по всему миру',contract:'Подряд / B2B',status:'review',source:'Jobicy',checked:'5 часов назад',posted:'4 дня назад',skills:['TypeScript','React','GraphQL'],reason:'GraphQL не подтверждён · зарплата не опубликована',mark:'o',fresh:true},
{id:'coda',company:'Coda Systems',title:'Software Engineer',salary:'€70 000–82 000',basis:'/ год, до налогов',geo:'Найм по всему миру',contract:'Подряд / B2B',status:'closed',source:'Himalayas',checked:'вчера',posted:'14 дней назад',skills:['React','Node.js'],reason:'Работодатель закрыл публикацию',mark:'c',fresh:false}
];
const state={saved:new Set(['fern','coda']),tab:'pass',mode:'personal',query:'',salaryOnly:false,
 savedStatus:{fern:'Планирую',coda:'Архив'},demoState:'empty',resultsScroll:0,modalTrigger:null};
function byId(id){return jobs.find(j=>j.id===id)||jobs[0]}
function saveButton(id){const s=state.saved.has(id);return `<button class="icon-btn save-toggle" data-save="${id}" aria-pressed="${s}" aria-label="${s?'Убрать из сохранённого':'Сохранить вакансию'}: ${escapeHTML(byId(id).title)}">${icon('bookmark')}</button>`}
function sourceLine(j){return `<div class="source">${icon('document')}<span>Источник: <button class="source-link" data-action="source">${j.source}</button></span><span>· Проверен ${j.checked}</span></div>`}
function jobcard(j,personal=true){return `<article class="job-card" data-job="${j.id}">
 <div class="job-top"><div class="company-mark ${j.id}">${j.mark}</div><div class="job-title-area"><div class="company">${j.company} <span aria-hidden="true">·</span> ${j.posted}</div><h3><a href="#job-${j.id}">${j.title}</a></h3></div>${saveButton(j.id)}</div>
 <p class="salary money">${j.salary} <small>${j.basis}</small></p>
 <div class="job-facts"><span>${icon('globe')}${j.geo}</span><span>${icon('briefcase')}${j.contract}</span></div>
 <div class="job-bottom"><div>${personal?badge(j.status,j.status==='pass'?'Условия совпадают':'Нужно уточнить'):badge('neutral','Полностью удалённо')}<p class="job-reason">${personal?j.reason:'Постоянная удалённая работа · без обязательного офиса'}</p></div>
 <div class="row">${j.skills.slice(0,3).map(s=>`<span class="chip">${s}</span>`).join('')}</div></div>${sourceLine(j)}
 </article>`}
function header(route){const active=route==='results'||route.startsWith('job-')?'results':route;return `<header class="site-header"><div class="wrap header-inner">
 <a class="logo" href="#home" aria-label="Atlas — главная"><span class="logo-mark">${icon('mark')}</span>atlas</a><span class="tagline">Только удалённо</span>
 <nav class="site-nav" aria-label="Основная"><a href="#results" ${active==='results'?'aria-current="page"':''}>Вакансии</a><a href="#saved" ${active==='saved'?'aria-current="page"':''}>Сохранённое <span data-saved-count style="margin-left:6px">${state.saved.size}</span></a><a href="#profile" ${active==='profile'?'aria-current="page"':''}>Профиль</a></nav>
 <div class="header-right"><span class="small secondary">Демо-профиль</span><a class="avatar" href="#profile" aria-label="Открыть демо-профиль">${icon('user')}</a></div></div></header>`}
function footer(){return `<footer class="wrap demo-note">Atlas 1.1 · Дизайн-концепция. Вакансии, цитаты и профили — демонстрационные; реальный подбор не подключён.</footer>`}
function mobileNav(route){if(route.startsWith('job-')){let j=byId(route.slice(4));return `<div class="mobile-apply">${saveButton(j.id)}${j.status==='closed'?'<button class="btn primary" disabled>Вакансия закрыта</button>':btn('Перейти к отклику','apply','primary','external')}</div>`}return `<nav class="mobile-nav" aria-label="Основная мобильная">${[['results','Вакансии','search'],['saved','Сохранённое','bookmark'],['profile','Профиль','user']].map(([r,t,i])=>`<a href="#${r}" ${r===route?'aria-current="page"':''}>${icon(i)}<span>${t}</span></a>`).join('')}</nav>`}
function pagehead(kicker,title,text=''){return `<div class="page-head">${kicker?`<p class="overline" style="margin:0 0 12px">${kicker}</p>`:''}<h1 tabindex="-1">${title}</h1>${text?`<p>${text}</p>`:''}</div>`}
function proof(){return `<div class="proof-shell"><div class="proof-head"><span>Как выглядит ясность</span><span>Пример</span></div><div class="proof-card">
 <div class="row"><div class="company-mark fern">f</div><div><p class="small secondary">Fern Labs</p><h3>Senior Full-stack Engineer</h3></div></div>
 <p class="pay money">€72 000–90 000 <span class="small secondary">/ год</span></p>
 ${badge('pass','Условия совпадают')}
 <div style="margin-top:20px">
 <div class="proof-rule">${icon('check')}<div><strong>Работайте из Грузии</strong><span class="secondary">Подряд доступен по всему миру</span></div></div>
 <div class="proof-rule">${icon('check')}<div><strong>В вашем рабочем ритме</strong><span class="secondary">Минимум 7 часов пересечения. Нужно 4.</span></div></div>
 <div class="proof-rule">${icon('document')}<div><strong>У каждого вывода есть основание</strong><span class="secondary">Оригинальная формулировка доступна</span></div></div></div></div>
 <p class="proof-foot">По опубликованным условиям и подтверждённому профилю. Не гарантия найма.</p></div>`}
function home(){return `<div class="wrap"><section class="hero"><div><p class="overline">Удалённая работа. Понятные условия.</p><h1 tabindex="-1">Работа, которая<br><em>совпадает<br>с жизнью.</em></h1><p class="lead">Найдите роль под ваш опыт, страну и рабочие часы. Без переезда и догадок о том, что значит «remote».</p><div class="row actions">${link('Подобрать по резюме','profile','primary large','arrow')}${link('Смотреть вакансии','results','secondary large')}</div><p class="privacy">${icon('lock')}Вы подтвердите профиль перед подбором. Резюме не отправляется работодателям автоматически.</p></div>${proof()}</section>
 <section class="promise-grid" aria-label="Принципы продукта">
 <div class="promise">${icon('globe')}<h3>Удалённо — действительно</h3><p>Без гибрида и обязательных визитов в офис.</p></div>
 <div class="promise">${icon('clock')}<h3>В вашем рабочем ритме</h3><p>Страна найма и рабочие часы — отдельные условия.</p></div>
 <div class="promise">${icon('document')}<h3>Неизвестное не спрятано</h3><p>Каждый вывод можно проверить по источнику.</p></div></section>
 <section class="section-space"><div class="row between"><div><p class="overline">Открытый каталог · примеры</p><h2 class="serif" style="margin-top:8px">Возможности уже здесь</h2></div>${link('Все вакансии','results','tertiary','arrow')}</div><div class="system-grid two" style="margin-top:24px">${jobcard(jobs[0],false)}${jobcard(jobs[1],false)}</div></section></div>`}

function matchedJobs(){
 return jobs.filter(j=>j.fresh)
  .filter(j=>state.mode==='all'||j.status===state.tab)
  .filter(j=>!state.salaryOnly||j.basis)
  .filter(j=>(j.title+' '+j.company+' '+j.skills.join(' ')).toLowerCase().includes(state.query.toLowerCase().trim()));
}
function filteredCount(status){return jobs.filter(j=>j.fresh&&j.status===status).filter(j=>!state.salaryOnly||j.basis).filter(j=>(j.title+' '+j.company+' '+j.skills.join(' ')).toLowerCase().includes(state.query.toLowerCase().trim())).length}
function resultsBody(){let list=matchedJobs();return list.length?list.map(j=>jobcard(j,state.mode==='personal')).join(''):`<div class="empty">${icon('search')}<h2>Пока нет совпадений</h2><p>В демонстрационной выборке нет вакансий с такими фильтрами. Условия работодателей мы не будем менять.</p>${btn('Сбросить фильтры','reset','secondary')}</div>`}
function results(){return `<div class="wrap page">${pagehead('Ваш рабочий атлас','Вакансии для вас')}
 <div class="mode-switch" aria-label="Режим каталога"><button data-mode="personal" aria-pressed="${state.mode==='personal'}">Для вас</button><button data-mode="all" aria-pressed="${state.mode==='all'}">Все вакансии</button></div>
 <div class="results-layout"><aside class="results-sidebar" aria-label="Условия поиска"><p class="overline side-label">Ваши условия</p>
 <div class="side-block"><h3>${icon('pin')} Страна работы</h3><p>Грузия</p><p class="small">Не гражданство и не часовой пояс.</p></div>
 <div class="side-block"><h3>${icon('clock')} Рабочие часы</h3><p>12:00–20:00 · Пн–Пт<br>Asia/Tbilisi</p></div>
 <div class="side-block"><h3>${icon('briefcase')} Сотрудничество</h3><p>Подряд / B2B<br>От €65 000 / год</p></div>
 <div class="side-block"><h3>Всегда включено</h3><p>Полностью удалённо.<br>Без обязательного офиса.</p></div>
 ${link('Изменить профиль','profile','tertiary','arrow')}</aside>
 <section aria-label="Результаты">
 ${state.mode==='personal'?`<div class="context"><div><div class="context-title"><span class="hide-mobile">Senior Full-stack · подтверждённый демо-профиль</span><span class="hide-desktop">Senior Full-stack</span></div><div class="context-info">Грузия · 12:00–20:00 Тбилиси · Подряд</div></div><a class="btn tertiary" href="#profile" aria-label="Изменить условия поиска"><span class="hide-mobile">Изменить</span><span class="hide-desktop">${icon("filter")}</span></a></div>`:`<div class="banner">${icon('globe')}<span>Открытый каталог. Для просмотра не нужны резюме и регистрация.</span></div><div style="height:20px"></div>`}
 <div class="search-row"><div class="search-control">${icon('search')}<label for="job-search" class="sr-only">Поиск по роли, компании или навыку</label><input id="job-search" type="search" placeholder="Роль, компания или навык" value="${escapeHTML(state.query)}" autocomplete="off"></div>
 <button class="btn secondary" data-action="filters" aria-label="Открыть фильтры">${icon('filter')}<span class="filter-label">Фильтры${state.salaryOnly?' · 1':''}</span></button></div>
 ${state.mode==='personal'?`<div class="tablist" role="tablist" aria-label="Совместимость">
 <button role="tab" id="tab-pass" aria-controls="result-panel" aria-selected="${state.tab==='pass'}" tabindex="${state.tab==='pass'?0:-1}" data-tab="pass">Условия совпадают <span class="tabcount" id="count-pass">${filteredCount('pass')}</span></button>
 <button role="tab" id="tab-review" aria-controls="result-panel" aria-selected="${state.tab==='review'}" tabindex="${state.tab==='review'?0:-1}" data-tab="review">Нужно уточнить <span class="tabcount" id="count-review">${filteredCount('review')}</span></button></div>`:''}
 <div class="results-meta"><span id="result-count">${matchedJobs().length} в демо-выборке</span><span>Сначала релевантные</span></div>
 <div id="result-panel" ${state.mode==='personal'?`role="tabpanel" aria-labelledby="tab-${state.tab}" tabindex="0"`:''}><div class="job-list" id="job-list">${resultsBody()}</div></div>
 </section></div></div>`}
const conds=[
{title:'Страна найма',text:'Грузия разрешена. Работодатель предлагает подряд по всему миру.',quote:'This is a permanent, fully remote contractor role open worldwide.',ref:'Himalayas · синтетическая цитата · версия 23.09.2026'},
{title:'Рабочие часы',text:'Минимум 7 часов пересечения в течение года. Нужно 4 часа.',quote:'At least four hours of overlap with 09:00–17:00 Europe/Berlin, Monday to Friday.',ref:'Пример условия · учтён сезонный переход времени'},
{title:'Способ сотрудничества',text:'Подряд / B2B указан работодателем и выбран в профиле.',quote:'We offer an independent contractor agreement for this role.',ref:'Пример опубликованных условий'},
{title:'Компенсация',text:'€72 000–90 000 в год до налогов. Ваш минимум — €65 000.',quote:'Annual gross contractor compensation: EUR 72,000–90,000.',ref:'Синтетический диапазон · не персональное предложение'}
];
function condition(c,i,review=false){return `<div class="condition-row"><div class="condition-top"><div class="condition-icon ${review?'review':''}">${icon(review?'question':'check')}</div><div><strong>${c.title}</strong><p>${c.text}</p></div></div><details><summary>Основание: ${c.title.toLowerCase()}</summary><figure class="evidence"><blockquote lang="en">“${c.quote}”</blockquote><figcaption>${c.ref}</figcaption></figure></details></div>`}
function schedule(){return `<div class="aside-card"><p class="overline">Время без догадок</p><h3 style="margin-top:8px">Общие рабочие часы</h3><div class="schedule-row"><div class="schedule-label"><strong>Вы</strong><span>12:00–20:00</span></div><div class="schedule-track" aria-hidden="true"><span></span></div></div>
 <div class="schedule-row"><div class="schedule-label"><strong>Команда · летом</strong><span>11:00–19:00</span></div><div class="schedule-track team" aria-hidden="true"><span></span></div></div><p class="small muted" style="margin-top:12px">Обе шкалы — в Asia/Tbilisi.<br>Шкала: 09:00–21:00.</p>
 <p class="overlap-number money">7–8 часов</p><p class="small secondary" style="margin-top:8px">Пересечение по сезонам.<br>Минимум 7, требуется 4.</p><hr class="line"><p class="small muted">Команда: 09:00–17:00 Europe/Berlin. Праздники и отпуск не учтены. Демонстрационный расчёт.</p></div>`}
function detail(id){const j=byId(id),review=j.status==='review',closed=j.status==='closed';
 let cs=conds.map(c=>({...c}));
 cs[0].text = j.id==='river' ? 'Грузия включена в опубликованный список стран для подряда.' : 'Грузия разрешена. Работодатель предлагает подряд по всему миру.';
 cs[0].quote = j.id==='river' ? 'This fully remote contractor role is open to candidates in Georgia and the other countries listed in the posting.' : conds[0].quote;
 cs[0].ref = j.source+' · синтетическая цитата · версия 23.09.2026';
 cs[3].text = j.salary+' в год до налогов. Ваш минимум — €65 000.';
 cs[3].quote = 'Annual gross contractor compensation: '+j.salary+'.';
 cs[3].ref = j.source+' · синтетический диапазон';
 if(id==='cedar'){cs[0]={title:'Страна найма',text:'В описании указано Europe, но нет списка стран. Найм из Грузии не подтверждён.',quote:'Candidates must be located in Europe.',ref:'Remotive · синтетический пример неоднозначности'};}
 if(id==='orbit'){cs[3]={title:'Компенсация',text:'Зарплата не опубликована. Сравнить с вашим минимумом пока нельзя.',quote:'Compensation will be discussed during the interview.',ref:'Jobicy · синтетический пример отсутствующей суммы'};}
 return `<div class="wrap page"><a class="btn tertiary" href="#results">${icon('back')}К подборке</a>
 <div class="detail-head"><div class="row between"><div class="row"><div class="company-mark ${j.id}">${j.mark}</div><p class="small secondary">${j.company} · Разработка продукта</p></div><div class="hide-mobile">${saveButton(j.id)}</div></div>
 <h1 tabindex="-1" style="margin-top:16px">${j.title}</h1><div class="job-facts"><span>${icon('globe')}${j.geo}</span><span>${icon('briefcase')}${j.contract}</span></div>
 <p class="money" style="font-size:1.25rem;font-weight:600;margin-top:20px">${j.salary} <span class="small secondary">${j.basis}</span></p>${sourceLine(j)}</div>
 <div class="detail-layout"><section><div class="row between"><h2>Карта условий</h2>${badge(closed?'neutral':j.status,closed?'Вакансия закрыта':review?'Нужно уточнить':'Условия совпадают')}</div>
 <p class="small secondary" style="margin-top:12px">${closed?'Историческая демонстрационная запись. Отклик недоступен.':'По опубликованным условиям и подтверждённому демо-профилю. Не гарантия найма.'}</p>
 ${review?`<div class="banner review" style="margin-top:20px">${icon('question')}<span><strong>${id==='cedar'?'Нужно уточнить у работодателя':'Нужно уточнить два условия'}</strong><br>${j.reason}. Неизвестное не считается отказом.</span></div>`:''}
 <div class="conditions">${cs.map((c,i)=>condition(c,i,review&&((id==='cedar'&&i===0)||(id==='orbit'&&i===3)))).join('')}</div>
 <div class="section-space"><h2>Где пригодится ваш опыт</h2><p class="secondary" style="margin-top:12px">Сопоставление требований с демонстрационным профилем.</p><div class="row" style="margin-top:16px">${j.skills.map(s=>badge(['TypeScript','React','Node.js'].includes(s)?'pass':'review',['TypeScript','React','Node.js'].includes(s)?s:s+' не подтверждён')).join('')}</div></div>
 <div class="section-space"><h2>О роли</h2><div class="prose" style="margin-top:16px"><p>В этом примере команда ищет инженера для развития продукта: интерфейсов, API и инструментов для пользователей. В реальной карточке здесь будет оригинальное описание из разрешённого источника.</p><p style="margin-top:16px">Синтетические данные предназначены для оценки интерфейса. Fern Labs, River Software и другие названия не являются объявлениями реальных работодателей.</p></div></div>
 </section><aside class="detail-aside"><div class="aside-card action-card"><p class="overline">Следующий шаг</p><h3 style="margin-top:8px">Решение — за вами</h3><p class="small secondary" style="margin-top:12px">Перед откликом проверьте оригинал и оставшиеся вопросы.</p>${closed?'<button class="btn wide" disabled>Вакансия закрыта</button>':btn('Перейти к отклику','apply','primary wide','external')}<p class="small muted" style="margin-top:12px">Маршрут: через ${j.source}. Резюме не отправляется автоматически. В демо переход не выполняется.</p></div>${schedule()}</aside></div></div>`}
function profile(){return `<div class="wrap page">${pagehead('Ваш профиль','Работа на ваших условиях.','Опыт — из резюме. Страна, рабочие часы и ожидания — только с вашего подтверждения.')}
 <div class="profile-layout"><form id="profile-form" class="panel" novalidate>
 <section class="profile-section"><h2>01. Профессиональный опыт</h2><div class="upload-zone"><div class="row">${icon('document')}<div><strong>Демонстрационное резюме</strong><span class="small secondary">Реальные файлы здесь не загружаются</span></div></div>${btn('Посмотреть пример','resume','secondary')}</div>
 <div class="form-grid" style="margin-top:20px"><div class="field full"><label for="profile-role">Целевая роль</label><input id="profile-role" value="Senior Full-stack Engineer" required><span class="small secondary">Можно исправить извлечённое название.</span></div>
 <div class="field full"><label for="profile-skills">Подтверждённые навыки</label><input id="profile-skills" value="TypeScript, React, Node.js"><span class="small secondary">Неуказанный навык не считается отсутствующим.</span></div></div></section>
 <section class="profile-section"><h2>02. Где и когда вы работаете</h2><div class="form-grid">
 <div class="field"><label for="country">Страна фактической работы</label><select id="country"><option>Грузия</option><option>Армения</option><option>Германия</option><option>Не хочу указывать пока</option></select><span class="small secondary">Не гражданство и не желаемая релокация.</span></div>
 <div class="field"><label for="zone">Часовой пояс</label><select id="zone"><option>Asia/Tbilisi</option><option>Asia/Yerevan</option><option>Europe/Berlin</option></select><span class="small secondary">Для расчёта рабочих часов, не страны найма.</span></div>
 <div class="field"><label for="hours-from">Начало рабочего дня</label><input id="hours-from" type="time" value="12:00"></div><div class="field"><label for="hours-to">Конец рабочего дня</label><input id="hours-to" type="time" value="20:00"></div>
 <div class="field full"><span class="small secondary">Понедельник–пятница. Сезонный переход учитывается при подборе.</span></div></div></section>
 <section class="profile-section"><h2>03. Способ сотрудничества</h2><div class="form-grid"><div class="field"><label for="contract">Предпочтение</label><select id="contract"><option>Подряд / B2B</option><option>Трудоустройство</option><option>Оба варианта</option></select></div><div class="field"><label for="minimum">Минимум, EUR в год до налогов</label><input id="minimum" type="number" min="0" value="65000"></div>
 <label class="check full"><input type="checkbox" checked>Считать минимум строгим условием</label></div></section>
 <div id="profile-feedback" role="status" style="margin-top:20px"></div><button class="btn primary large" type="submit" style="margin-top:24px">Проверить пример профиля ${icon('arrow')}</button><p class="small muted" style="margin-top:12px">Демо-форма: значения не отправляются и не меняют подборку.</p>
 </form><aside class="profile-aside flow-lg"><div class="profile-note"><p class="overline">Вы управляете профилем</p><h3 style="margin-top:12px">Проверка важнее догадки</h3><p style="margin-top:12px">Atlas не выводит право на работу из страны, английский — из языка резюме, а готовность к переезду — из прошлого опыта.</p></div><div class="aside-card"><h3>${icon('lock')} Только для вашего поиска</h3><p class="small secondary" style="margin-top:12px">Резюме не отправляется работодателям автоматически. В реальном продукте обработчик и режим хранения будут указаны до загрузки.</p></div></aside></div></div>`}
function saved(){let list=jobs.filter(j=>state.saved.has(j.id));return `<div class="wrap page">${pagehead('Личное рабочее пространство','Возможности, к которым<br class="hide-mobile"> хочется вернуться.','Сохранение — не отклик. Личный статус меняете только вы.')}
 <div class="row between" style="margin-bottom:24px"><span class="badge neutral">${list.length} сохранено в демо-сеансе</span>${link('К подборке','results','tertiary','arrow')}</div>
 <div class="panel">${list.length?list.map(j=>`<article class="saved-row ${j.status==='closed'?'closed':''}"><div><div class="row"><div class="company-mark ${j.id}">${j.mark}</div><div><p class="small secondary">${j.company}</p><h3><a href="#job-${j.id}">${j.title}</a></h3></div></div><p class="small money" style="margin-top:14px">${j.salary} ${j.basis}</p><div style="margin-top:12px">${badge(j.status==='closed'?'neutral':j.status,j.status==='closed'?'Вакансия закрыта':'Условия совпадают')}</div></div>
 <div class="saved-status"><label class="saved-label" for="status-${j.id}">Мой статус</label><select id="status-${j.id}" data-user-status="${j.id}">${['Планирую','Откликнулся','Интервью','Архив'].map(s=>`<option ${state.savedStatus[j.id]===s?'selected':''}>${s}</option>`).join('')}</select></div>
 <button class="icon-btn remove-save" data-save="${j.id}" aria-label="Убрать из сохранённого: ${j.title}">${icon('close')}</button></article>`).join(''):`<div class="empty"><h2>Пока ничего не сохранено</h2><p>Добавьте интересную роль из подборки.</p>${link('Смотреть вакансии','results','primary','arrow')}</div>`}</div>
 <p class="small secondary" style="margin-top:24px">Закрытые вакансии остаются в истории только в объёме, разрешённом источником.</p></div>`}

const palette=[
['Бумага','#F7F5F0','bg.canvas'],['Поверхность','#FFFFFF','bg.surface'],
['Чернила','#202840','text.primary'],['Атлас-синий','#3456D1','action.primary'],
['Подтверждено','#EAF4EE','status.success.bg'],['Уточнение','#FFF3DF','status.review.bg']
];
function swatches(){return `<div class="swatches">${palette.map(([name,hex,token])=>`<div><div class="swatch-color" style="background:${hex}" aria-label="${name}: ${hex}"></div><div class="swatch-info"><strong>${name}</strong><br><code>${hex}</code></div></div>`).join('')}</div>`}
function overview(){return `<div class="wrap page"><div class="system-label"><span class="logo"><span class="logo-mark">${icon('mark')}</span>atlas</span><span class="overline">Дизайн-язык / 1.1 / Light</span></div>
 <section class="design-hero"><div><p class="overline">Спокойный снаружи. Точный внутри.</p><h1 tabindex="-1">Ясность —<br><em class="blue">следующий шаг.</em></h1><p>Редакционная теплота встречается с точностью рабочего инструмента. Один язык для вакансий, условий, профиля и решений.</p><div class="row" style="margin-top:28px">${link('Открыть подборку','results','primary large','arrow')}${link('Компоненты','components','secondary large')}</div><div class="row" style="margin-top:28px">${badge('pass','Подтверждено')}${badge('review','Нужно уточнить')}${badge('neutral','Не оценено')}</div></div>${proof()}</section>
 <section><div class="row between" style="margin-bottom:20px"><h2>Тёплая основа. Точные сигналы.</h2><span class="small secondary">Цвет следует за смыслом</span></div>${swatches()}</section>
 <section class="section-space system-grid"><div class="note-tile"><p class="overline">01 / Характер</p><h3>Не job-board с баннерами</h3><p>Serif даёт голос бренду. Гротеск помогает работать. Декор уступает место условиям и действию.</p></div><div class="note-tile"><p class="overline">02 / Доверие</p><h3>Не процент, а основание</h3><p>Страна, часы и договор проверяются отдельно. Неизвестное не превращается в отказ или зелёную галочку.</p></div><div class="note-tile"><p class="overline">03 / Контроль</p><h3>Решение остаётся за вами</h3><p>Подтвердить профиль. Уточнить условие. Сохранить роль. Перейти к отклику — без автоматической отправки.</p></div></section>
 <section class="section-space"><div class="row between"><h2>Один объект. Два честных состояния.</h2>${link('Все состояния','states','tertiary','arrow')}</div><div class="system-grid two" style="margin-top:24px">${jobcard(jobs[0])}${jobcard(jobs[3])}</div></section>
 <section class="section-space system-grid"><div class="component-block"><p class="quality-count">44 / 48</p><p class="small secondary" style="margin-top:8px">Минимальная зона действия<br>desktop / mobile, CSS px</p></div><div class="component-block"><p class="quality-count">4.5 : 1</p><p class="small secondary" style="margin-top:8px">Минимальный контраст<br>обычного текста</p></div><div class="component-block"><p class="quality-count">132</p><p class="small secondary" style="margin-top:8px">Токена: от палитры<br>до семантики компонентов</p></div></section>
 </div>`}
function foundations(){return `<div class="wrap page">${pagehead('01 / Foundations','Характер без случайных деталей.','Палитра, типографика, ритм и поведение — в одном словаре. Все значения доступны в JSON и CSS.')}
 <section>${swatches()}<div class="system-grid three" style="margin-top:24px"><div class="component-block"><h3>Условия</h3><div class="stack">${badge('pass','Условие подтверждено')}${badge('review','Нужно уточнить')}${badge('fail','Есть несовместимость')}</div></div><div class="component-block"><h3>Действие</h3><div class="stack">${btn('Основное действие','sample','primary')}${btn('Вторичное действие','sample','secondary')}</div></div><div class="component-block"><h3>Не декоративная мелочь</h3><p class="small secondary">Источник, зарплата и ограничения читаются при 14–16 px. Светлая линия делит блоки; поле получает контрастный контур.</p></div></div></section>
 <section class="section-space"><h2>Два голоса, одна иерархия</h2><p class="secondary" style="margin-top:12px">Source Serif 4 / Inter. В автономном UI-kit — установленные шрифты и системные замены.</p>
 ${[
 ['Display · 64/68','Работа, которая<br><em class="blue">совпадает с жизнью.</em>','serif','4rem'],
 ['Page · 40/48','Ваши условия — отправная точка.','serif','2.5rem'],
 ['Section · 28/36','Карта условий','', '1.75rem'],
 ['Card · 20/28','Senior Full-stack Engineer','', '1.25rem'],
 ['Body · 16/24','Грузия разрешена. Минимум 7 часов пересечения.','', '1rem'],
 ['Metadata · 14/20','Источник: Himalayas · Проверен 2 часа назад','secondary', '.875rem']
 ].map(([label,text,cls,size])=>`<div class="type-row"><span class="small secondary">${label}</span><div class="sample ${cls}" style="font-size:${size};line-height:1.2">${text}</div></div>`).join('')}</section>
 <section class="section-space system-grid two"><div class="component-block"><h3>Ритм 4 px</h3><div class="row">${[4,8,12,16,24,32,48].map(n=>`<div class="stack" style="align-items:center"><span style="display:block;width:${Math.max(n,8)}px;height:32px;background:var(--blue-soft);border:1px solid var(--blue)"></span><span class="small">${n}</span></div>`).join('')}</div><p class="small secondary" style="margin-top:20px">Внутри группы 12–16. Между разделами 32–48. На mobile поля 16.</p></div>
 <div class="component-block"><h3>Умеренная геометрия</h3><div class="row">${[6,10,12,16].map(n=>`<div style="width:64px;min-height:64px;display:grid;place-items:center;border:1px solid var(--control);border-radius:${n}px">${n}</div>`).join('')}</div><p class="small secondary" style="margin-top:20px">Badge / control / card / panel. Тени — только для поднятых слоёв.</p></div></section>
 <section class="section-space"><h2>Токен хранит решение</h2><pre class="token-code">ref.blue600 → color.action.primary
            → component.button.primary.background

eligible ≠ relevance ≠ freshness
unknown  ≠ false

motion: 120 / 180 / 240 ms
prefers-reduced-motion: remove transitions</pre></section></div>`}
function components(){return `<div class="wrap page">${pagehead('02 / Components','Детали, которые держат систему.','Живые примеры поведения. Полные props, states и accessibility-контракты — в atlas.components.json.')}
 <div class="system-grid two"><section class="component-block"><h3>Действия</h3><div class="row">${btn('Подобрать','sample','primary','arrow')}${btn('Сохранить','sample','secondary','bookmark')}${btn('Удалить','delete-demo','danger','delete')}</div><div class="row" style="margin-top:16px"><button class="btn" disabled>Сначала подтвердите профиль</button></div><p class="small muted" style="margin-top:12px">Disabled сопровождается понятной причиной.</p></section>
 <section class="component-block"><h3>Статусы без ложной уверенности</h3><div class="stack">${badge('pass','Условия совпадают')}${badge('review','Нужно уточнить')}${badge('fail','Страна найма не совпадает')}${badge('neutral','Вакансия закрыта')}</div></section>
 <section class="component-block"><h3>Поле с контекстом</h3><div class="field"><label for="sample-field">Страна фактической работы</label><input id="sample-field" value="Грузия" aria-describedby="sample-helper"><span class="small secondary" id="sample-helper">Это не гражданство и не страна желаемого переезда.</span></div><label class="check" style="margin-top:12px"><input type="checkbox" checked>Только с опубликованной зарплатой</label></section>
 <section class="component-block"><h3>Контур ошибки</h3><div class="field"><label for="sample-error">Целевая роль</label><input id="sample-error" placeholder="Например, Product Designer" aria-invalid="true" aria-describedby="sample-error-copy"><span class="small" style="color:var(--red)" id="sample-error-copy">Укажите хотя бы одну роль или оставьте поиск без персонализации.</span></div></section>
 <section class="component-block"><h3>Панель фильтров</h3><p class="small secondary">Черновик не применяется до подтверждения. Escape и «Отмена» возвращают к тому же контролу.</p><div style="margin-top:16px">${btn('Открыть фильтры','filters','secondary','filter')}</div></section>
 <section class="component-block"><h3>Подтверждение действия</h3><p class="small secondary">Toast сообщает об обратимом действии. Критичная ошибка остаётся рядом с задачей.</p><div style="margin-top:16px">${btn('Показать уведомление','sample','secondary')}</div></section></div>
 <section class="section-space system-grid two"><div>${jobcard(jobs[0])}</div><div class="component-block"><h3>Карта условий / Evidence</h3>${condition(conds[0],0)}<p class="small secondary" style="margin-top:16px">Цитата и версия расположены рядом с выводом, а не в отдельном непрозрачном AI-отчёте.</p></div></section>
 <section class="section-space"><div class="banner review">${icon('question')}<span><strong>Нужно уточнить у работодателя</strong><br>Europe — без списка стран. Совпадение с Грузией не подтверждено.</span></div></section></div>`}
function statePreview(kind){
 if(kind==='empty')return `<div class="empty">${icon('search')}<h2>Сейчас нет подтверждённых совпадений</h2><p>Ваши условия сохранились. В двух демонстрационных вакансиях нужно уточнение — это ещё не отказ.</p>${btn('Посмотреть уточнения','show-review','primary')}</div>`;
 if(kind==='loading')return `<div class="panel" role="status"><p class="small secondary">Сопоставляем опубликованные условия с профилем…</p><div class="skeleton" style="width:72%;height:24px;margin-top:24px"></div><div class="skeleton" style="width:45%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:60%"></div><p class="small muted" style="margin-top:24px">Без фиктивного процента завершения.</p></div>`;
 if(kind==='degraded')return `<div class="flow-lg"><div class="banner review">${icon('refresh')}<span><strong>Часть источников временно недоступна</strong><br>Показываем уже найденные вакансии. Ошибка проверки не означает закрытие.</span></div>${jobcard(jobs[0])}</div>`;
 if(kind==='unknown')return `<div class="flow-lg"><div class="banner review">${icon('question')}<span><strong>Нужно уточнить, а не исключить</strong><br>Работодатель указал Europe без списка стран. Подтвердить это может работодатель, а не пользователь.</span></div>${jobcard(jobs[3])}</div>`;
 if(kind==='closed')return `<div class="panel flow"><div>${badge('neutral','Вакансия закрыта')}</div><h2>Software Engineer</h2><p class="secondary">Coda Systems · запись сохранена в личной истории в разрешённом объёме.</p><button class="btn" disabled>Отклик недоступен: вакансия закрыта</button>${link('Другие вакансии','results','tertiary','arrow')}</div>`;
 return `<div class="panel flow"><div class="banner danger">${icon('document')}<span><strong>Не удалось извлечь текст</strong><br>В документе нет доступного текстового слоя. Резюме не отправлено работодателю.</span></div>${link('Заполнить профиль вручную','profile','primary','arrow')}<p class="small secondary">OCR не запускается без отдельного решения.</p></div>`;
}
function states(){return `<div class="wrap page">${pagehead('03 / States','Не только счастливый путь.','Неопределённость, ошибки и пустая выдача должны помогать продолжить, а не маскировать проблему.')}
 <div class="row" aria-label="Пример состояния" style="margin-bottom:24px">${[['empty','Нет совпадений'],['unknown','Уточнение'],['loading','Загрузка'],['degraded','Сбой источника'],['closed','Закрыта'],['parse','Ошибка резюме']].map(([k,t])=>`<button class="btn ${state.demoState===k?'primary':'secondary'}" data-demo-state="${k}" aria-pressed="${state.demoState===k}">${t}</button>`).join('')}</div>
 <div style="max-width:850px">${statePreview(state.demoState)}</div><section class="section-space system-grid"><div class="note-tile"><p class="overline">Принцип 01</p><h3>Неизвестное — не false</h3><p>Сохраняем причину и следующий шаг. Цвет не заменяет объяснение.</p></div><div class="note-tile"><p class="overline">Принцип 02</p><h3>Фильтры не меняются сами</h3><p>Никакого скрытого включения гибрида, другой страны или меньшей зарплаты.</p></div><div class="note-tile"><p class="overline">Принцип 03</p><h3>Состояние не исчезает</h3><p>После ошибки остаются введённые значения, сохранённое и путь восстановления.</p></div></section></div>`}

const routeNames={overview:'Дизайн-язык',foundations:'Основы',components:'Компоненты',home:'Главная',results:'Подбор', 'job-fern':'Вакансия',profile:'Профиль',saved:'Сохранённое',states:'Состояния'};
let currentRoute='',toastTimer;
function route(){return (location.hash.slice(1)||'overview').split('?')[0]}
function render(keepScroll=false){
 const r=route(),known=routeNames[r]||r.startsWith('job-');const actual=known?r:'overview';
 const product=['home','results','profile','saved'].includes(actual)||actual.startsWith('job-');
 const top=window.scrollY;currentRoute=actual;
 let content=actual.startsWith('job-')?detail(actual.slice(4)):
 ({overview,foundations,components,home,results,profile,saved,states}[actual]||overview)();
 $('#app').innerHTML=(product?header(actual):'')+`<main id="main" tabindex="-1">${content}</main>`+footer()+mobileNav(actual);
 $('#view-select').value=actual.startsWith('job-')?'job-fern':actual;
 $$('.kit-links a').forEach(a=>a.toggleAttribute('aria-current',a.hash==='#'+actual));
 $$('.kit-links a[aria-current]').forEach(a=>a.setAttribute('aria-current','page'));
 document.title=`Atlas 1.1 · ${routeNames[actual]||'Вакансия'}`;
 const h=$('h1');if(h&&!keepScroll)h.focus({preventScroll:true});
 if(keepScroll)window.scrollTo(0,top);else window.scrollTo(0,actual==='results'?state.resultsScroll:0);
}
function toast(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},6000)}
function announce(message){$('#live').textContent='';setTimeout(()=>{$('#live').textContent=message},20)}
function openModal(title,body,footerContent='',trigger=null){
 state.modalTrigger=trigger||document.activeElement;
 $('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;$('#dialog-footer').innerHTML=footerContent;
 $('#dialog-footer').hidden=!footerContent;
 $('#dialog').showModal();
}
function closeModal(){if($('#dialog').open)$('#dialog').close()}
$('#dialog').addEventListener('close',()=>{const t=state.modalTrigger;if(t&&t.isConnected)t.focus()});
function openFilters(trigger){
 openModal('Фильтры подборки',`<p class="secondary small">Эти фильтры меняют выдачу, но не условия работодателя.</p>
 <div class="field" style="margin-top:20px"><label for="filter-query">Роль, компания или навык</label><input id="filter-query" value="${escapeHTML(state.query)}" placeholder="Например, React"></div>
 <label class="check" style="margin-top:16px"><input type="checkbox" id="salary-only" ${state.salaryOnly?'checked':''}>Только с опубликованной зарплатой</label>
 <div class="banner" style="margin-top:20px">${icon('lock')}<span>Полностью удалённо, без обязательного офиса — правило сервиса. Его нельзя отключить.</span></div>`,
 `<button class="btn secondary" data-action="cancel">Отмена</button><button class="btn primary" data-action="apply-filters">Применить</button>`,trigger);
}
function updateResults(){
 if(!$('#job-list'))return;
 $('#job-list').innerHTML=resultsBody();$('#result-count').textContent=matchedJobs().length+' в демо-выборке';
 if($('#count-pass'))$('#count-pass').textContent=filteredCount('pass');
 if($('#count-review'))$('#count-review').textContent=filteredCount('review');
 announce(`Найдено ${matchedJobs().length} демонстрационных вакансий`);
}
document.addEventListener('click',e=>{
 const skip=e.target.closest('.skip');
 if(skip){e.preventDefault();$('#main').focus();return}
 const linkEl=e.target.closest('a[href^="#"]');
 if(linkEl&&currentRoute==='results')state.resultsScroll=window.scrollY;
 const save=e.target.closest('[data-save]');
 if(save){let id=save.dataset.save,has=state.saved.has(id);if(has)state.saved.delete(id);else{state.saved.add(id);state.savedStatus[id]||='Планирую'}
 if(currentRoute==='saved'){render(true)}
 else $$(`[data-save="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',!has);b.setAttribute('aria-label',`${has?'Сохранить вакансию':'Убрать из сохранённого'}: ${byId(id).title}`)});
 $$('[data-saved-count]').forEach(el=>el.textContent=state.saved.size);
 toast(has?'Убрано из сохранённого. Изменение только в демо-сеансе.':'Вакансия сохранена в демо-сеансе. Отклик не отправлен.');
 return}
 const mode=e.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;render(true);$(`[data-mode="${state.mode}"]`).focus();return}
 const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;render(true);$(`[data-tab="${state.tab}"]`).focus();announce(`Найдено ${matchedJobs().length} демонстрационных вакансий`);return}
 const ds=e.target.closest('[data-demo-state]');if(ds){state.demoState=ds.dataset.demoState;render(true);$(`[data-demo-state="${state.demoState}"]`).focus();return}
 const action=e.target.closest('[data-action]');if(!action)return;
 switch(action.dataset.action){
 case 'filters':openFilters(action);break;
 case 'cancel':case 'close':closeModal();break;
 case 'apply-filters':
  state.query=$('#filter-query').value;state.salaryOnly=$('#salary-only').checked;
  closeModal();if(currentRoute==='results'){render(true);$('[data-action="filters"]').focus();announce(`Фильтры применены. Найдено ${matchedJobs().length} вакансий`)}else toast('Фильтры настроены для демонстрационной подборки.');
  break;
 case 'reset':state.query='';state.salaryOnly=false;render(true);$('#job-search').focus();break;
 case 'show-review':state.mode='personal';state.tab='review';state.query='';state.salaryOnly=false;location.hash='results';break;
 case 'source':toast('Пример атрибуции. Реальная публикация источника в этом UI-kit не подключена.');break;
 case 'sample':toast('Пример подтверждения действия. Данные не отправлялись на сервер.');break;
 case 'apply':
  openModal('Переход к отклику',`<div class="banner">${icon('external')}<span>Это дизайн-прототип. Здесь нет реальной вакансии и внешняя страница не открывается.</span></div><p class="secondary small" style="margin-top:20px">В продукте эта кнопка откроет разрешённый маршрут источника. Резюме не отправится автоматически, статус «Откликнулся» не изменится.</p>`,`<button class="btn primary" data-action="cancel">Понятно</button>`,action);break;
 case 'resume':
  openModal('Пример извлечённого опыта',`<div class="flow"><p><strong>Senior Full-stack Engineer</strong></p><p class="secondary">Демонстрационный опыт: TypeScript, React, Node.js.</p><div class="banner review">${icon('question')}<span>Уровень английского и право на работу не выводятся из текста. Их нужно подтвердить отдельно.</span></div><p class="small muted">Реального файла нет. Парсер не запускался.</p></div>`,`<button class="btn primary" data-action="cancel">Вернуться к профилю</button>`,action);break;
 case 'delete-demo':
  openModal('Удаление: пример подтверждения',`<p class="secondary">В реальном продукте здесь должны быть названы точный объект и последствия: файл, профиль или аккаунт. Это не взаимозаменяемые операции.</p><div class="banner" style="margin-top:20px">${icon('info')}<span>Данные в этом примере не удаляются.</span></div>`,`<button class="btn secondary" data-action="cancel">Отмена</button><button class="btn danger" data-action="delete-confirm">Подтвердить пример</button>`,action);break;
 case 'delete-confirm':closeModal();toast('Показан сценарий подтверждения. Реального удаления не было.');break;
 }
});
document.addEventListener('input',e=>{if(e.target.id==='job-search'){state.query=e.target.value;updateResults()}});
document.addEventListener('change',e=>{
 if(e.target.id==='view-select'){location.hash=e.target.value;return}
 if(e.target.dataset.userStatus){state.savedStatus[e.target.dataset.userStatus]=e.target.value;toast('Личный статус изменён только в демо-сеансе.')}
});
document.addEventListener('keydown',e=>{
 const t=e.target.closest('[role=tab]');if(!t)return;
 const tabs=$$('[role=tab]',t.closest('[role=tablist]'));let i=tabs.indexOf(t),next=i;
 if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
 e.preventDefault();tabs[next].click();
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='profile-form')return;e.preventDefault();
 const role=$('#profile-role'),feedback=$('#profile-feedback');
 if(!role.value.trim()){role.setAttribute('aria-invalid','true');role.setAttribute('aria-describedby','profile-feedback');feedback.innerHTML=`<div class="banner danger">${icon('close')}<span>Укажите целевую роль. Остальные значения сохранены в форме.</span></div>`;role.focus();return}
 role.removeAttribute('aria-invalid');role.removeAttribute('aria-describedby');
 feedback.innerHTML=`<div class="banner success">${icon('check')}<span>Пример профиля проверен. Данные никуда не отправлены; реальный подбор и сохранение на сервере не подключены.</span></div>`;
 announce('Демонстрационная проверка завершена');
});
window.addEventListener('hashchange',()=>render());
if(new URLSearchParams(location.search).has('preview'))document.body.classList.add('preview');
render();

document.getElementById('dialog').addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;
 const nodes=Array.from(e.currentTarget.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length);
 if(!nodes.length){e.preventDefault();return}
 const first=nodes[0],last=nodes[nodes.length-1],active=document.activeElement;
 if(e.shiftKey&&active===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&active===last){e.preventDefault();first.focus()}
});
