#!/usr/bin/env python3
"""Genera backend/templates/BoletinBase.html a partir de la plantilla SVG original:
 - cambia el logo por el de EduNova, el nombre por el marcador {{NOMBRE_INSTITUCION}}
 - recolorea rellenos y líneas (negro/gris) a la paleta morada, sin tocar el texto de datos."""
import base64, io, re, sys
from PIL import Image

SRC = sys.argv[1]
DST = sys.argv[2]
LOGO = sys.argv[3]

PURPLE_DARK, BRAND, LAV_LIGHT, LAV_MID = '#3B0764', '#6D28D9', '#EDE9FE', '#DDD6FE'

s = open(SRC, encoding='utf8').read()

# 1) logo
buf = io.BytesIO()
Image.open(LOGO).convert('RGBA').resize((256, 256), Image.LANCZOS).save(buf, 'PNG', optimize=True)
logo_uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
s, n1 = re.subn(r'data:image/png;base64,[A-Za-z0-9+/=]+', lambda m: logo_uri, s, count=1)

# 2) nombre de la institución
s, n2 = re.subn(
    r'<tspan\b[^>]*?>CORPORACION COLEGIO [A-Z ]+</tspan>',
    f'<tspan x="0" y="0" style="font-variant:normal;font-weight:700;font-size:11px;font-family:Arial;'
    f'writing-mode:lr-tb;fill:{BRAND};fill-opacity:1;fill-rule:nonzero;stroke:none">{{{{NOMBRE_INSTITUCION}}}}</tspan>',
    s, flags=re.S)

# 3) colores en atributos style (formas, líneas y texto: todo lo negro pasa a violeta oscuro)
def recolor_style(m):
    v = m.group(1)
    v = (v.replace('#000000', PURPLE_DARK).replace('#c0c0c0', LAV_LIGHT)
          .replace('#d1d1d1', LAV_MID).replace('#e0e0e0', LAV_LIGHT))
    return f'style="{v}"'
s = re.sub(r'style="([^"]*)"', recolor_style, s)
s = s.replace('fill:#3B0764;fill-opacity:1;fill-rule:nonzero;stroke:none">{{NOMBRE_INSTITUCION}}', f'fill:{BRAND};fill-opacity:1;fill-rule:nonzero;stroke:none">{{{{NOMBRE_INSTITUCION}}}}')

# 4) colores del CSS (bordes de los bloques de materias extra)
head, sep, rest = s.partition('</style>')
head = re.sub(r'(border[a-z-]*:\s*1px solid )#000;', rf'\g<1>{PURPLE_DARK};', head)
head = head.replace('color: #000;', f'color: {PURPLE_DARK};')
head = head.replace('background: #c0c0c0;', f'background: {LAV_LIGHT};')
s = head + sep + rest

open(DST, 'w', encoding='utf8').write(s)
print('logo reemplazado:', n1, '| nombre reemplazado:', n2, '| tamaño:', len(s))
print('menciones al nombre original:', len(re.findall('trini' + 'tar', s, re.I)))
