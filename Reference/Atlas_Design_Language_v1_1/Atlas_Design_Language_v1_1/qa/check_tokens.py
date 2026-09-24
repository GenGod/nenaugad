from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent.parent
T=json.loads((ROOT/'atlas.tokens.json').read_text())
def l(hex):
    a=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
    a=[v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4 for v in a]
    return sum(v*w for v,w in zip(a,[0.2126,0.7152,0.0722]))
def ratio(a,b):
    hi,lo=sorted([l(a),l(b)],reverse=True)
    return (hi+.05)/(lo+.05)
refs={k:v['$value']['hex'] for k,v in T['ref'].items()}
pairs=[]
for fg in ['ink','slate','muted','blue600']:
    for bg in ['paper','white','fog']:
        pairs.append((fg,bg,4.5))
pairs += [('white','blue600',4.5),('white','blue700',4.5),('white','blue800',4.5)]
pairs += [('green700','green50',4.5),('amber800','amber50',4.5),('red700','red50',4.5),('grey700','grey50',4.5)]
pairs += [('control','white',3),('control','paper',3),('blue600','white',3),('blue600','paper',3)]
rows=[]
for fg,bg,target in pairs:
    r=ratio(refs[fg],refs[bg])
    rows.append({'foreground_token':fg,'foreground':refs[fg],'background_token':bg,'background':refs[bg],'minimum':target,'ratio':r,'pass':r>=target})
out={'method':'WCAG relative luminance / sRGB','scope':'Palette pairs only; not a full rendered UI or WCAG audit','pairs':rows,'pass':all(r['pass'] for r in rows)}
(ROOT/'qa'/'contrast.json').write_text(json.dumps(out,indent=2))
print('Contrast pairs:',len(rows),'pass:',out['pass'])
if not out['pass']:
 print([r for r in rows if not r['pass']])
 raise SystemExit(1)
