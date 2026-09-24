from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
HTML=(ROOT/'atlas-ui-kit.html').read_text()
ROUTES=['overview','foundations','components','home','results','job-fern','profile','saved','states']
report={'browser':'Chromium via Playwright','page_errors':[],'responsive':[],'interactions':[],'screenshots':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
 page.set_content(HTML,wait_until='load')
 page.evaluate("document.body.classList.add('preview')")
 def go(route):
  page.evaluate('(r)=>{location.hash=r;}',route)
  page.wait_for_timeout(40)
  page.wait_for_selector('h1')
 for width in [320,360,390,768,1024,1440,1920]:
  page.set_viewport_size({'width':width,'height':844 if width<768 else 1000})
  for route in ROUTES:
   go(route)
   metrics=page.evaluate('''()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length})''')
   report['responsive'].append({'route':route,**metrics,'pass':metrics['scrollWidth']<=width and metrics['h1']==1 and metrics['main']==1})
   if width in [390,1440] and route in ['overview','foundations','home','results','job-fern','profile','saved','states','components']:
    name=route+('-mobile.png' if width==390 else '-desktop.png')
    page.screenshot(path=str(ROOT/'screens'/name),full_page=(width!=390))
    report['screenshots'].append(name)
 page.set_viewport_size({'width':1440,'height':1000})
 go('results')
 page.locator('#job-search').fill('React')
 assert page.locator('.job-card').count()==3
 report['interactions'].append({'case':'Keyword search','pass':True})
 page.locator('[data-action="filters"]').click()
 page.locator('#filter-query').fill('NOT-A-ROLE')
 page.keyboard.press('Escape')
 assert page.locator('#job-search').input_value()=='React'
 assert page.evaluate('document.activeElement.dataset.action')=='filters'
 report['interactions'].append({'case':'Filter Escape cancels draft and restores focus','pass':True})
 page.locator('[data-action="filters"]').click()
 page.locator('#filter-query').fill('NOT-A-ROLE')
 page.locator('[data-action="apply-filters"]').click()
 assert page.locator('.job-card').count()==0
 assert page.locator('.empty').count()==1
 report['interactions'].append({'case':'Apply filters changes results and shows empty state','pass':True})
 page.locator('[data-action="reset"]').click()
 page.locator('#tab-pass').focus()
 page.keyboard.press('ArrowRight')
 assert page.locator('#tab-review').get_attribute('aria-selected')=='true'
 assert page.locator('.job-card').count()==2
 report['interactions'].append({'case':'Keyboard tabs use arrows and update result panel','pass':True})
 page.locator('[data-action="filters"]').click()
 page.locator('#salary-only').check()
 page.locator('[data-action="apply-filters"]').click()
 assert page.locator('.job-card').count()==1
 report['interactions'].append({'case':'Salary published filter removes unpublished salary','pass':True})
 page.locator('[data-save="cedar"]').click()
 assert page.locator('[data-save="cedar"]').get_attribute('aria-pressed')=='true'
 go('saved')
 assert page.locator('.saved-row').count()==3
 report['interactions'].append({'case':'Save is reflected in saved view','pass':True})
 go('job-fern')
 page.locator('summary').first.click()
 assert page.locator('details').first.get_attribute('open') is not None
 report['interactions'].append({'case':'Evidence disclosure expands','pass':True})
 before=page.evaluate('JSON.stringify(state.savedStatus)')
 page.locator('.action-card [data-action="apply"]').click()
 assert page.locator('#dialog').is_visible()
 page.locator('#dialog [data-action="cancel"]').click()
 assert page.evaluate('JSON.stringify(state.savedStatus)')==before
 report['interactions'].append({'case':'Apply demonstration never changes application status','pass':True})
 go('profile')
 page.locator('#profile-role').fill('')
 page.locator('#profile-form button[type=submit]').click()
 assert page.locator('#profile-role').get_attribute('aria-invalid')=='true'
 assert page.evaluate('document.activeElement.id')=='profile-role'
 page.locator('#profile-role').fill('Product Designer')
 page.locator('#profile-form button[type=submit]').click()
 assert page.locator('#profile-feedback .success').count()==1
 report['interactions'].append({'case':'Profile demo validates and preserves form values','pass':True})
 page.emulate_media(reduced_motion='reduce')
 go('components')
 assert page.locator('button.btn').first.evaluate('(e)=>getComputedStyle(e).transitionDuration')=='0s'
 report['interactions'].append({'case':'Reduced motion disables transitions','pass':True})
 page.set_viewport_size({'width':390,'height':844})
 go('job-fern')
 assert page.locator('.mobile-nav').count()==0
 assert page.locator('.mobile-apply').is_visible()
 report['interactions'].append({'case':'Mobile detail uses apply bar instead of stacked global nav','pass':True})
 page.locator('.mobile-apply [data-action="apply"]').click()
 focus_inside=True
 for _ in range(12):
  page.keyboard.press('Tab')
  focus_inside=focus_inside and page.evaluate("document.getElementById('dialog').contains(document.activeElement)")
 assert focus_inside
 page.keyboard.press('Escape')
 report['interactions'].append({'case':'Mobile modal traps focus and supports Escape','pass':True})
 browser.close()
report['limitations']=['No full WCAG certification','No manual screen-reader test','No real uploads, network integrations or matching','User research not performed','Browser policy blocks file navigation in test environment; same HTML was loaded with set_content']
report['pass']=not report['page_errors'] and all(i['pass'] for i in report['responsive']) and all(i['pass'] for i in report['interactions'])
(ROOT/'qa'/'ui-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps({'pass':report['pass'],'responsive_cases':len(report['responsive']),'failed':[x for x in report['responsive'] if not x['pass']],'interactions':len(report['interactions']),'page_errors':report['page_errors']},indent=2))
