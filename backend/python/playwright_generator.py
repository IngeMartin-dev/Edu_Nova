#!/usr/bin/env python3
import sys
import os
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("ERROR: playwright no esta instalado. Ejecuta: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from pypdf import PdfWriter, PdfReader, Transformation
except ImportError:
    PdfWriter = None
    PdfReader = None
    Transformation = None

if len(sys.argv) < 3:
    print("Uso: playwright_generator.py <input_html> <output_pdf>", file=sys.stderr)
    sys.exit(1)

input_html = sys.argv[1]
output_pdf = sys.argv[2]

input_html_abs = os.path.abspath(input_html)
if not os.path.exists(input_html_abs):
    print(f"ERROR: No existe el archivo HTML: {input_html_abs}", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# TAMAÑO DE RENDER ORIGINAL del diseño del boletín (SVG de la plantilla,
# medido en pixeles fijos: 816x1344 = 8.5in x 14in a 96dpi). NO SE TOCA,
# porque el SVG tiene cientos de coordenadas absolutas calculadas para
# esa proporción exacta; cambiarlo a mano rompería el diseño.
ORIG_WIDTH_IN = 8.5
ORIG_HEIGHT_IN = 14.0

# TAMAÑO FINAL DE PÁGINA que debe tener el PDF entregado: CARTA (Letter),
# 8.5in x 11in, ya preconfigurado. Cada página generada con el tamaño
# "original" de arriba se reescala automáticamente (sin recortar ni
# deformar, conservando proporción) para caber en esta hoja carta antes
# de escribir el PDF final. Así el archivo SIEMPRE queda en tamaño carta.
PAGE_WIDTH_IN = 8.5
PAGE_HEIGHT_IN = 11.0

# Los archivos de Consolidados se manejan aparte (ya están en Carta
# horizontal, ver CONSOLIDADO_WIDTH_IN/CONSOLIDADO_HEIGHT_IN más abajo).

BLOCKS_POR_HOJA = 12
ALTO_BLOQUE_PX = 92.16
EXT_PAGE_PAD_TOP = 20
EXT_PAGE_PAD_BOTTOM = 4
EXT_PAGE_PAD_LEFT = 53.44
EXT_PAGE_PAD_RIGHT = 30.4


def _letterbox_page(reader_page, writer):
    """Toma una pagina ya renderizada (a su tamano ORIGINAL de diseno) y la
    agrega a `writer` como una pagina tamano CARTA (PAGE_WIDTH_IN x
    PAGE_HEIGHT_IN), escalandola de forma UNIFORME (sin deformar) para que
    quepa completa, centrada, con margenes blancos si sobra espacio. Nunca
    la agranda (scale se limita a 1.0 como maximo) para no perder nitidez."""
    target_w = PAGE_WIDTH_IN * 72.0
    target_h = PAGE_HEIGHT_IN * 72.0
    src_w = float(reader_page.mediabox.width)
    src_h = float(reader_page.mediabox.height)

    if Transformation is None or src_w <= 0 or src_h <= 0:
        # Sin pypdf.Transformation disponible: se agrega tal cual (fallback).
        writer.add_page(reader_page)
        return

    scale = min(target_w / src_w, target_h / src_h, 1.0)
    new_w = src_w * scale
    new_h = src_h * scale
    offset_x = (target_w - new_w) / 2.0
    offset_y = (target_h - new_h) / 2.0

    blank = writer.add_blank_page(width=target_w, height=target_h)
    transform = Transformation().scale(scale, scale).translate(offset_x, offset_y)
    blank.merge_transformed_page(reader_page, transform)


def _append_pdf_as_letter(pdf_path, writer):
    """Lee un PDF (una o mas paginas) y agrega cada pagina a `writer` ya
    convertida a tamano Carta mediante _letterbox_page."""
    reader = PdfReader(pdf_path)
    for pg in reader.pages:
        _letterbox_page(pg, writer)


def render_simple(html_path, out_path):
    """Genera el PDF final en tamano CARTA (8.5in x 11in), reescalando de
    forma automatica el render original del diseno (8.5in x 14in) para que
    quepa completo y sin deformarse. Se usa para documentos de una sola
    pieza (por ejemplo el reporte de grado/salon) que no tienen bloques de
    materias adicionales que partir."""
    tmp_dir = os.path.dirname(os.path.abspath(out_path)) or "."
    tmp_path = os.path.join(tmp_dir, "_render_orig.pdf")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(Path(html_path).resolve().as_uri())
        page.pdf(path=tmp_path, width=f"{ORIG_WIDTH_IN}in", height=f"{ORIG_HEIGHT_IN}in", print_background=True)
        browser.close()

    if PdfWriter is None or PdfReader is None:
        # Sin pypdf disponible: se conserva el comportamiento anterior
        # (tamano original) en vez de fallar la generacion completa.
        os.replace(tmp_path, out_path)
        return

    writer = PdfWriter()
    _append_pdf_as_letter(tmp_path, writer)
    with open(out_path, "wb") as f:
        writer.write(f)
    try:
        os.remove(tmp_path)
    except OSError:
        pass


# Tamano de pagina para el Consolidado: Carta horizontal (apaisada),
# 11in x 8.5in, distinto del boletin (vertical). Cada pagina del
# documento ya trae su propio "page-break-after: always" en el CSS
# (una por cada grupo de 32 estudiantes), asi que un solo render()
# alcanza para producir todas las paginas -no hace falta partir y
# combinar como con los boletines-.
CONSOLIDADO_WIDTH_IN = 11.0
CONSOLIDADO_HEIGHT_IN = 8.5


def render_consolidado(html_path, out_path):
    """Genera el PDF del Consolidado (Carta horizontal, 1:1), respetando
    los saltos de pagina (.page { page-break-after: always }) que ya trae
    la plantilla Consolidado Base/ConsolidadoBase.html para el grupo de
    32 estudiantes por hoja."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(Path(html_path).resolve().as_uri())
        page.pdf(
            path=out_path,
            width=f"{CONSOLIDADO_WIDTH_IN}in",
            height=f"{CONSOLIDADO_HEIGHT_IN}in",
            print_background=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        browser.close()


def render_html_string(browser, html_str, out_path, height_px=None):
    """Renderiza al tamano ORIGINAL de diseno (nunca al tamano carta final:
    eso se aplica despues, en el merge, con _letterbox_page)."""
    page = browser.new_page()
    page.set_content(html_str, wait_until="load")
    kwargs = dict(path=out_path, width=f"{ORIG_WIDTH_IN}in", print_background=True)
    kwargs["height"] = f"{height_px}px" if height_px is not None else f"{ORIG_HEIGHT_IN}in"
    page.pdf(**kwargs)
    page.close()


def try_split_and_merge(html_text, out_path):
    """
    Si el HTML es un boletin con bloques de materias adicionales
    (.materia-ext-page), separa el documento en: pagina 1 (fija),
    N hojas de materias adicionales -cada una con la altura EXACTA
    que necesita su contenido real, sin sobrante en blanco-, y
    pagina 2 (fija). Genera cada parte por separado y las combina en
    un solo PDF. Si el HTML no tiene esa estructura (por ejemplo, el
    reporte de grado/salon), no hace nada y devuelve False para que
    el llamador use el generador simple de siempre.
    """
    if BeautifulSoup is None or PdfWriter is None:
        return False
    if 'materia-ext-page' not in html_text:
        return False

    soup = BeautifulSoup(html_text, "html.parser")
    ext_pages = soup.select(".materia-ext-page")
    if not ext_pages:
        return False

    style_tag = soup.find("style")
    style_html = str(style_tag) if style_tag else ""

    page_divs = soup.select("div.page")
    if len(page_divs) < 2:
        return False  # estructura inesperada -> no arriesgar, usar el modo simple

    page1_html = str(page_divs[0])
    page2_html = str(page_divs[1])

    # Todos los bloques de materia VISIBLES (no colapsados), en el
    # mismo orden en que aparecen en el documento.
    visible_blocks = [
        b for b in soup.select(".materia-block")
        if "materia-block--vacio" not in (b.get("class") or [])
    ]

    # Los <script> de la plantilla (ajuste de ancho y partido de textos largos)
    # se conservan en cada parte; sin ellos los textos largos se desbordan.
    scripts_html = "".join(str(sc) for sc in soup.find_all("script"))

    if not visible_blocks:
        # Hasta 16 materias: no hay hojas extra. Se renderiza el documento
        # completo (render_simple) para que los scripts de la plantilla
        # oculten los cupos vacios y suban el bloque de cierre.
        return False

    def wrap(body_inner):
        return (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
            + style_html
            + "<style>body{margin:0;padding:0;}</style></head><body>"
            + body_inner
            + scripts_html
            + "</body></html>"
        )

    tmp_dir = os.path.dirname(os.path.abspath(out_path)) or "."
    part_paths = []

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # Pagina 1 (tamano fijo, sin cambios).
        p1_path = os.path.join(tmp_dir, "_part_p1.pdf")
        render_html_string(browser, wrap(page1_html), p1_path)
        part_paths.append(p1_path)

        # Materias adicionales: en grupos de hasta 12, cada hoja con la
        # altura exacta que necesita (sin dejar una pagina a medias).
        for i in range(0, len(visible_blocks), BLOCKS_POR_HOJA):
            chunk = visible_blocks[i:i + BLOCKS_POR_HOJA]
            alto_contenido = len(chunk) * ALTO_BLOQUE_PX
            alto_pagina_px = EXT_PAGE_PAD_TOP + alto_contenido + EXT_PAGE_PAD_BOTTOM
            bloques_html = "".join(str(b) for b in chunk)
            estilo_pagina = (
                "width:816px;box-sizing:border-box;"
                f"padding:{EXT_PAGE_PAD_TOP}px {EXT_PAGE_PAD_RIGHT}px "
                f"{EXT_PAGE_PAD_BOTTOM}px {EXT_PAGE_PAD_LEFT}px;"
                "font-family:'Times New Roman',Times,serif;position:relative;"
            )
            body_inner = f'<div style="{estilo_pagina}">{bloques_html}</div>'
            part_path = os.path.join(tmp_dir, f"_part_mid_{i}.pdf")
            render_html_string(browser, wrap(body_inner), part_path, height_px=alto_pagina_px)
            part_paths.append(part_path)

        # Pagina 2 (tamano fijo, sin cambios).
        p2_path = os.path.join(tmp_dir, "_part_p2.pdf")
        render_html_string(browser, wrap(page2_html), p2_path)
        part_paths.append(p2_path)

        browser.close()

    # Combinar todas las partes en un solo PDF final, convirtiendo cada
    # pagina a tamano CARTA (8.5in x 11in) en el proceso.
    writer = PdfWriter()
    for pp in part_paths:
        _append_pdf_as_letter(pp, writer)
    with open(out_path, "wb") as f:
        writer.write(f)

    for pp in part_paths:
        try:
            os.remove(pp)
        except OSError:
            pass

    return True


try:
    with open(input_html_abs, "r", encoding="utf-8") as f:
        html_text = f.read()

    if 'data-doc="consolidado"' in html_text:
        # Consolidado: Carta horizontal, un solo render con saltos de
        # pagina por CSS (no necesita partir/combinar como el boletin).
        render_consolidado(input_html_abs, output_pdf)
    else:
        handled = try_split_and_merge(html_text, output_pdf)
        if not handled:
            render_simple(input_html_abs, output_pdf)

    print(f"OK: PDF generado en {output_pdf}")
except Exception as e:
    print(f"ERROR generando PDF: {e}", file=sys.stderr)
    sys.exit(1)