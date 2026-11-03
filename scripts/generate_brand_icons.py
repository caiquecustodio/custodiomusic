"""Rasterize the existing Custodio vector mark for installation icons (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
from math import sqrt, atan2, cos, sin, pi, degrees
import json
ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
BG = '#2A203D'
INK = '#C7A7FF'
def render(size, adaptive=False, monochrome=False, background=True):
    ss = 4
    im = Image.new('RGBA', (size*ss, size*ss), BG if background else (0,0,0,0))
    draw = ImageDraw.Draw(im)
    scale = size*ss / (108 if adaptive else 48)
    def point(x,y):
        if adaptive: x,y = (x-24)*1.5+54,(y-24)*1.5+54
        return (x*scale,y*scale)
    def stroke(points,width):
        width *= scale * (1.5 if adaptive else 1)
        pts=[point(x,y) for x,y in points]
        color = '#FFFFFF' if monochrome else INK
        draw.line(pts,fill=color,width=round(width),joint='curve')
        r=width/2
        for x,y in [pts[0],pts[-1]]: draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
    cx = 32-sqrt(14**2-10**2)
    angle = atan2(10,32-cx)
    color = '#FFFFFF' if monochrome else INK
    width = 4 * scale * (1.5 if adaptive else 1)
    # Use an annular sector polygon for exact centered SVG stroke geometry.
    outer=[]; inner=[]
    for i in range(721):
        t=angle+(2*pi-2*angle)*i/720
        outer.append(point(cx+16*cos(t),24+16*sin(t)))
        inner.append(point(cx+12*cos(t),24+12*sin(t)))
    draw.polygon(outer+inner[::-1],fill=color)
    for x,y in [point(32,14),point(32,34)]:
        r=width/2
        draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
    for x,y1,y2 in [(21,20,28),(27,16,36),(33,22,26)]: stroke([(x,y1),(x,y2)],3)
    return im.resize((size,size),Image.Resampling.LANCZOS)
render(1024).convert('RGB').save(ASSETS/'icon.png')
render(1024,adaptive=True,background=False).save(ASSETS/'android-icon-foreground.png')
Image.new('RGB',(1024,1024),BG).save(ASSETS/'android-icon-background.png')
render(1024,adaptive=True,monochrome=True,background=False).save(ASSETS/'android-icon-monochrome.png')
render(512,background=False).save(ASSETS/'splash-icon.png')
render(64).save(ASSETS/'favicon.png')
(ASSETS/'custodio-mark.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="16" fill="#2A203D"/><path d="M32 14a14 14 0 1 0 0 20" fill="none" stroke="#C7A7FF" stroke-width="4" stroke-linecap="round"/><path d="M21 20v8m6-12v20m6-14v4" fill="none" stroke="#C7A7FF" stroke-width="3" stroke-linecap="round"/></svg>\n',encoding='utf-8')
p=ROOT/'app.json'
c=json.loads(p.read_text(encoding='utf-8'))
c['expo']['android']['adaptiveIcon']['backgroundColor']=BG
p.write_text(json.dumps(c,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Custodio launcher assets generated.')

preview=ROOT/'releases'/'ui-review'/'launcher-icon.png'
preview.parent.mkdir(parents=True,exist_ok=True)
render(256).save(preview)
