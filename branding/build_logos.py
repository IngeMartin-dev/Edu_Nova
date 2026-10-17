#!/usr/bin/env python3
"""Genera la familia de logos de EduNova (SVG + PNG). El texto se convierte a trazos
para que se vea idéntico en navegador, PDF y correo, sin depender de fuentes instaladas."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
font = TTFont(FONT)
gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
UPM = font['head'].unitsPerEm

def text_path(text, size, tracking=0.0):
    """Devuelve (d, ancho) del texto como trazo SVG, con origen en (0,0) sobre la línea base."""
    scale, x, parts = size / UPM, 0.0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        parts.append(pen.getCommands())
        x += hmtx[g][0] * scale + tracking
    return ' '.join(parts), x - tracking

def two_tone(size, tracking, x_center, y, c1, c2):
    d1, w1 = text_path('EDU', size, tracking)
    d2, w2 = text_path('NOVA', size, tracking)
    total = w1 + tracking + w2
    x0 = x_center - total / 2
    return (f'<path transform="translate({x0:.2f} {y})" d="{d1}" fill="{c1}"/>'
            f'<path transform="translate({x0 + w1 + tracking:.2f} {y})" d="{d2}" fill="{c2}"/>'), total

# ---- Símbolo: birrete + libro + destello "nova" (coordenadas en caja 220x220) ----
def star(cx, cy, r, fill):
    k = r * 0.22
    return (f'<path d="M{cx} {cy - r} Q{cx + k} {cy - k} {cx + r} {cy} Q{cx + k} {cy + k} {cx} {cy + r} '
            f'Q{cx - k} {cy + k} {cx - r} {cy} Q{cx - k} {cy - k} {cx} {cy - r}Z" fill="{fill}"/>')

def symbol(main, shade, spark, spine, dy=0):
    """main = color del símbolo, shade = sombra del birrete, spark = destello, spine = color del lomo."""
    return f'''<g transform="translate(0 {dy})">
    <!-- birrete -->
    <path d="M62 84 V106 Q62 124 110 124 Q158 124 158 106 V84 L110 102 Z" fill="{shade}"/>
    <path d="M110 48 L184 80 L110 112 L36 80 Z" fill="{main}"/>
    <path d="M110 48 L184 80 L110 80 Z" fill="#fff" opacity=".18"/>
    <!-- borla -->
    <path d="M174 84 V112" stroke="{main}" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <path d="M174 110 l-5 14 h10 z" fill="{main}"/>
    <!-- libro abierto -->
    <path d="M110 150 C 94 138 66 138 46 144 V182 C 66 176 94 176 110 188 Z" fill="{main}"/>
    <path d="M110 150 C 126 138 154 138 174 144 V182 C 154 176 126 176 110 188 Z" fill="{main}" opacity=".88"/>
    <path d="M110 150 V188" stroke="{spine}" stroke-width="3"/>
    <path d="M58 154 C 72 151 90 152 102 158 M58 164 C 72 161 90 162 102 168" stroke="{spine}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".55"/>
    <!-- destellos -->
    {star(184, 44, 15, spark)}
    {star(150, 28, 7, spark)}
    </g>'''

GRAD = '''<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6D28D9"/><stop offset="55%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F5D0FE"/><stop offset="100%" stop-color="#E879F9"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#3B0764" flood-opacity=".35"/>
    </filter>
  </defs>'''

def svg(w, h, body, vb=None, label='EduNova'):
    vb = vb or f'0 0 {w} {h}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" aria-label="{label}">\n'
            f'  {body}\n</svg>\n')

def write(name, content):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(content)

# 1) logo.svg — icono de app (fondo morado) + nombre
t, _ = two_tone(25, 2.6, 110, 198, '#FFFFFF', '#F5D0FE')
write('logo.svg', svg(220, 220, f'''{GRAD}
  <rect x="6" y="6" width="208" height="208" rx="50" fill="url(#bg)" filter="url(#sh)"/>
  <rect x="6" y="6" width="208" height="208" rx="50" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>
  {symbol('#FFFFFF', '#E9D5FF', 'url(#spark)', '#7C3AED', dy=-15)}
  {t}''', label='EduNova Logo'))

# 2) logo-symbol.svg — solo símbolo, color, para fondos claros
write('logo-symbol.svg', svg(220, 220, f'''{GRAD}
  {symbol('#6D28D9', '#4C1D95', 'url(#spark)', '#FFFFFF')}''', label='EduNova símbolo'))

# 3) logo-horizontal.svg — símbolo + nombre, para encabezados, boletines y consolidados (fondo claro)
d1, w1 = text_path('EDU', 56, 3)
d2, w2 = text_path('NOVA', 56, 3)
write('logo-horizontal.svg', svg(520, 160, f'''{GRAD}
  <g transform="translate(0 8) scale(.75)">{symbol('#6D28D9', '#4C1D95', 'url(#spark)', '#FFFFFF')}</g>
  <g transform="translate(170 96)"><path d="{d1}" fill="#4C1D95"/><path transform="translate({w1 + 3:.2f} 0)" d="{d2}" fill="#9333EA"/></g>
  <text x="172" y="126" font-family="Arial, Helvetica, sans-serif" font-size="13" letter-spacing="3.2" fill="#7C3AED">GESTIÓN ACADÉMICA</text>''', label='EduNova'))

# 4) logo-mono.svg — blanco, para fondos morados / PDFs oscuros
t, _ = two_tone(25, 2.6, 110, 198, '#FFFFFF', '#E9D5FF')
write('logo-mono.svg', svg(220, 220, f'''{symbol('#FFFFFF', '#FFFFFF', '#FFFFFF', 'rgba(0,0,0,0)', dy=-15)}
  {t}''', label='EduNova (blanco)'))

# 5) favicon.svg — símbolo simplificado, legible a 16 px
write('favicon.svg', svg(64, 64, '''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6D28D9"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <path d="M32 12 L54 22 L32 32 L10 22 Z" fill="#fff"/>
  <path d="M17 27 V35 Q17 40 32 40 Q47 40 47 35 V27 L32 33.500 Z" fill="#E9D5FF"/>
  <path d="M32 44 C 27 40.500 18 40.500 11 42.500 V54 C 18 52 27 52.500 32 56 Z" fill="#fff"/>
  <path d="M32 44 C 37 40.500 46 40.500 53 42.500 V54 C 46 52 37 52.500 32 56 Z" fill="#fff" opacity=".88"/>
  <path d="M55 10 l1.600 3.400 3.400 1.600 -3.400 1.600 -1.600 3.400 -1.600 -3.400 -3.400 -1.600 3.400 -1.600z" fill="#F5D0FE"/>''', label='EduNova'))

# ---- PNG ----
import cairosvg
def png(src, dst, size, bg=None):
    cairosvg.svg2png(url=os.path.join(OUT, src), write_to=os.path.join(OUT, dst), output_width=size, output_height=size, background_color=bg)
png('logo.svg', 'logo-512.png', 512)
png('logo.svg', 'logo-192.png', 192)
png('logo.svg', 'logo-email.png', 160)
png('favicon.svg', 'favicon-32.png', 32)
png('favicon.svg', 'favicon-180.png', 180)
cairosvg.svg2png(url=os.path.join(OUT, 'logo-horizontal.svg'), write_to=os.path.join(OUT, 'logo-horizontal.png'), output_width=1040, output_height=320)
print('OK', sorted(f for f in os.listdir(OUT) if f.startswith(('logo', 'favicon'))))
