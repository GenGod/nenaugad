"""Build the standalone offline UI kit from Atlas design tokens and source files."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent

def walk(obj,prefix=''):
    for key,value in obj.items():
        if key.startswith('$'):
            continue
        path=f'{prefix}.{key}' if prefix else key
        if '$value' in value:
            yield path,value
        else:
            yield from walk(value,path)

def css_value(token):
    value=token['$value']
    kind=token['$type']
    if isinstance(value,str) and value.startswith('{'):
        return 'var(--atlas-'+value[1:-1].replace('.','-')+')'
    if kind=='color':
        return value['hex']
    if kind in ('dimension','duration'):
        return f"{value['value']:g}{value['unit']}"
    if kind=='fontFamily':
        return ', '.join('"'+v+'"' if ' ' in v else v for v in value)
    if kind=='cubicBezier':
        return 'cubic-bezier('+','.join(str(v) for v in value)+')'
    return str(value)

def main():
    tokens=json.loads((ROOT/'atlas.tokens.json').read_text())
    flat=dict(walk(tokens))
    for path,t in flat.items():
        seen=set()
        while isinstance(t['$value'],str) and t['$value'].startswith('{'):
            target=t['$value'][1:-1]
            if target not in flat:
                raise ValueError(f'Missing alias: {path} -> {target}')
            if target in seen:
                raise ValueError(f'Circular alias: {path}')
            seen.add(target)
            t=flat[target]
    css='/* Atlas 1.1 / generated from atlas.tokens.json */\n:root {\n'
    css+='\n'.join('  --atlas-'+p.replace('.','-')+': '+css_value(t)+';' for p,t in flat.items())+'\n}\n'
    (ROOT/'atlas.tokens.css').write_text(css)
    html=(ROOT/'shell.html').read_text().replace('__CSS__',css+'\n'+(ROOT/'ui.css').read_text()).replace('__JS__',(ROOT/'ui.js').read_text())
    (ROOT/'atlas-ui-kit.html').write_text(html)
    print(f'Built {len(flat)} tokens and {len(html)} characters of standalone HTML.')
if __name__=='__main__':
    main()
