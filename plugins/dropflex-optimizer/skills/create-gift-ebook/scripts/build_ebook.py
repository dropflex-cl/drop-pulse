"""Maqueta un manuscrito local de regalo; no publica ni configura su entrega."""
import argparse
import json
import math
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents

# Paleta clara y escala de texto/espaciado: design-system/tokens.json de DropFlex.
INK = colors.HexColor("#15171c")
MUTED_INK = colors.HexColor("#5a606b")
SURFACE = colors.HexColor("#f3f4f6")
WHITE = colors.white
SPACE = 16
MARGIN = 32
VERTICAL_MARGIN = 48
PAGE_WIDTH, PAGE_HEIGHT = A5


def plain(value):
    return escape(str(value)).replace("\n", "<br/>")


def luminance(color):
    parts = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
             for v in (color.red, color.green, color.blue)]
    return sum(a * b for a, b in zip(parts, (.2126, .7152, .0722)))


def ratio(a, b):
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + .05) / (low + .05)


def contrast_ink(accent):
    value = accent
    # Conserva el acento en fondos/dibujos y oscurece solo su variante de texto.
    while ratio(value, WHITE) < 4.5:
        value = colors.Color(value.red * .9, value.green * .9, value.blue * .9)
    return value


def text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field}: escribe texto no vacío.")
    return value


def strings(value, field):
    if not isinstance(value, list):
        raise ValueError(f"{field}: se esperaba una lista.")
    for item in value:
        text(item, field)


def validate(data, root):
    if not isinstance(data, dict):
        raise ValueError("El manuscrito debe ser un objeto JSON.")
    for key in ("title", "subtitle", "product_name"):
        text(data.get(key), key)
    if not isinstance(data.get("accent_color"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", data["accent_color"]):
        raise ValueError("accent_color: usa el hex exacto de la PDP (#rrggbb).")
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        raise ValueError("chapters: incluye al menos un capítulo.")
    for chapter in chapters:
        if not isinstance(chapter, dict):
            raise ValueError("Cada capítulo debe ser un objeto.")
        text(chapter.get("title"), "chapter.title")
        if not any(chapter.get(k) for k in ("intro", "paragraphs", "steps", "checklist", "callout")):
            raise ValueError("Cada capítulo necesita contenido útil, además de su título.")
        if "intro" in chapter:
            text(chapter["intro"], "chapter.intro")
        for key in ("paragraphs", "steps", "checklist"):
            if key in chapter:
                strings(chapter[key], f"chapter.{key}")
        if "callout" in chapter:
            if not isinstance(chapter["callout"], dict):
                raise ValueError("callout: se esperaba un objeto.")
            for key in ("title", "body"):
                text(chapter["callout"].get(key), f"callout.{key}")
    illustrations = [data.get("cover_illustration"), *[c.get("illustration") for c in chapters]]
    if not any(illustrations):
        raise ValueError("Incluye al menos una ilustración explicativa.")
    for illustration in filter(None, illustrations):
        if not isinstance(illustration, dict):
            raise ValueError("illustration: se esperaba un objeto.")
        kind = illustration.get("kind")
        if kind == "image":
            path = root / text(illustration.get("path"), "illustration.path")
            if not path.is_file():
                raise ValueError(f"No existe la imagen local: {path}")
        elif kind in ("sequence", "checklist", "comparison"):
            strings(illustration.get("items"), "illustration.items")
            if not 2 <= len(illustration["items"]) <= 6:
                raise ValueError("El diagrama necesita entre 2 y 6 elementos.")
        else:
            raise ValueError("Tipo de ilustración no admitido.")
    sources = data.get("sources", [])
    if not isinstance(sources, list):
        raise ValueError("sources: se esperaba una lista.")
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("Cada fuente debe ser un objeto.")
        text(source.get("label"), "source.label")
        url = text(source.get("url"), "source.url")
        if not re.fullmatch(r"https://[^\s<>\"']+", url):
            raise ValueError("Cada fuente necesita un enlace HTTPS válido.")


class Diagram(Flowable):
    """Esquema vectorial rotulado con alturas medidas; admite continuaciones."""
    def __init__(self, kind, items, accent, style, compact=False, start_index=0):
        super().__init__()
        self.kind, self.items, self.accent, self.style = kind, items, accent, style
        self.compact = compact
        self.start_index = start_index

    def wrap(self, available_width, available_height):
        self.width = available_width
        columns = 2 if self.kind == "comparison" or self.compact else 1
        self.cell_width = (available_width - SPACE * (columns - 1)) / columns
        self.rows = []
        for start in range(0, len(self.items), columns):
            row = [Paragraph(plain(item), self.style) for item in self.items[start:start + columns]]
            height = max(p.wrap(self.cell_width - SPACE * 4, math.inf)[1] for p in row) + SPACE * 2
            self.rows.append((row, height))
        self.height = sum(h for _, h in self.rows) + SPACE * (len(self.rows) - 1)
        return self.width, self.height

    def split(self, available_width, available_height):
        self.wrap(available_width, available_height)
        used, count = 0, 0
        columns = 2 if self.kind == "comparison" or self.compact else 1
        for _, height in self.rows:
            used += height + (SPACE if count else 0)
            if used > available_height:
                break
            count += 1
        if count == 0:
            return []
        cut = count * columns
        return [Diagram(self.kind, items, self.accent, self.style, self.compact, start)
                for items, start in ((self.items[:cut], self.start_index),
                                     (self.items[cut:], self.start_index + cut)) if items]

    def draw(self):
        canvas, y, index = self.canv, self.height, self.start_index
        for row, height in self.rows:
            y -= height
            for col, paragraph in enumerate(row):
                x = col * (self.cell_width + SPACE)
                canvas.setFillColor(SURFACE)
                canvas.roundRect(x, y, self.cell_width, height, 10, stroke=0, fill=1)
                canvas.setFillColor(self.accent)
                canvas.circle(x + SPACE * 1.5, y + height - SPACE * 1.5, 10, stroke=0, fill=1)
                foreground = WHITE if ratio(self.accent, WHITE) >= ratio(self.accent, INK) else INK
                canvas.setFillColor(foreground)
                canvas.setFont(self.style.fontName, 12)
                label = str(index + 1) if self.kind == "sequence" else ("+" if self.kind == "checklist" else chr(65 + index))
                canvas.drawCentredString(x + SPACE * 1.5, y + height - SPACE * 1.5 - 4, label)
                _, paragraph_height = paragraph.wrap(self.cell_width - SPACE * 4, height)
                paragraph.drawOn(canvas, x + SPACE * 3, y + height - SPACE - paragraph_height)
                index += 1
            y -= SPACE


class EbookDoc(BaseDocTemplate):
    def __init__(self, output, data, accent, regular, bold):
        self.data, self.accent, self.regular, self.bold = data, accent, regular, bold
        super().__init__(str(output), pagesize=A5, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=VERTICAL_MARGIN, bottomMargin=VERTICAL_MARGIN,
                         title=data["title"], author=data.get("brand", ""))
        frame = Frame(MARGIN, VERTICAL_MARGIN, PAGE_WIDTH - MARGIN * 2,
                      PAGE_HEIGHT - VERTICAL_MARGIN * 2, leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0, id="body")
        self.addPageTemplates(PageTemplate(id="ebook", frames=frame, onPage=self.decorate))

    def decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(self.accent)
        canvas.rect(0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8, stroke=0, fill=1)
        canvas.setFillColor(MUTED_INK)
        canvas.setFont(self.regular, 12)
        canvas.drawString(MARGIN, MARGIN, "Guía de regalo")
        canvas.drawRightString(PAGE_WIDTH - MARGIN, MARGIN, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "chapter":
            label = flowable.getPlainText()
            key = flowable.ebook_key
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(label, key, level=0)
            self.notify("TOCEntry", (0, label, self.page, key))


def build(data, root, output, regular="Helvetica", bold="Helvetica-Bold"):
    validate(data, root)
    accent = colors.HexColor(data["accent_color"])
    accent_ink = contrast_ink(accent)
    styles = {
        "title": ParagraphStyle("title", fontName=bold, fontSize=28, leading=34, textColor=INK, spaceAfter=SPACE),
        "chapter": ParagraphStyle("chapter", fontName=bold, fontSize=20, leading=26, textColor=INK, spaceAfter=SPACE, keepWithNext=True),
        "body": ParagraphStyle("body", fontName=regular, fontSize=13, leading=18, textColor=INK, spaceAfter=12),
        "intro": ParagraphStyle("intro", fontName=regular, fontSize=15, leading=22, textColor=MUTED_INK, spaceAfter=SPACE),
        "label": ParagraphStyle("label", fontName=bold, fontSize=12, leading=16, textColor=accent_ink, spaceAfter=8, keepWithNext=True),
        "caption": ParagraphStyle("caption", fontName=regular, fontSize=12, leading=16, textColor=MUTED_INK, spaceAfter=SPACE),
    }
    def paragraph(value, style="body"):
        return Paragraph(plain(value), styles[style])

    width = PAGE_WIDTH - MARGIN * 2

    def illustration(spec, compact=False):
        if not spec:
            return []
        parts = []
        if spec.get("title"):
            parts.append(paragraph(spec["title"], "label"))
        if spec["kind"] == "image":
            picture = Image(str(root / spec["path"]))
            scale = min(width / picture.imageWidth, (PAGE_HEIGHT / 3) / picture.imageHeight)
            picture.drawWidth, picture.drawHeight = picture.imageWidth * scale, picture.imageHeight * scale
            parts.append(picture)
        else:
            parts.append(Diagram(spec["kind"], spec["items"], accent, styles["body"], compact))
        parts.append(Spacer(1, 12))
        if spec.get("caption"):
            parts.append(paragraph(spec["caption"], "caption"))
        return parts

    story = []
    if data.get("brand"):
        story.append(paragraph(data["brand"], "label"))
    story.extend([paragraph(data["title"], "title"), paragraph(data["subtitle"], "intro")])
    story.extend(illustration(data.get("cover_illustration"), compact=True))
    story.extend([paragraph(f"Para acompañar tu {data['product_name']}.", "caption"), PageBreak()])
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("toc", fontName=regular, fontSize=13, leading=22, textColor=INK, spaceBefore=12)]
    story.extend([paragraph("Tu recorrido", "title"), toc, PageBreak()])
    for index, chapter in enumerate(data["chapters"]):
        if index:
            story.append(PageBreak())
        story.append(paragraph(f"CAPÍTULO {index + 1:02}", "label"))
        heading = paragraph(chapter["title"], "chapter")
        heading.ebook_key = f"chapter-{index + 1}"
        story.append(heading)
        if chapter.get("intro"):
            story.append(paragraph(chapter["intro"], "intro"))
        story.extend(illustration(chapter.get("illustration")))
        for value in chapter.get("paragraphs", []):
            story.append(paragraph(value))
        for step, value in enumerate(chapter.get("steps", []), 1):
            story.append(paragraph(f"{step}. {value}"))
        for value in chapter.get("checklist", []):
            story.append(paragraph(f"[  ] {value}"))
        if chapter.get("callout"):
            callout = chapter["callout"]
            story.append(KeepTogether([Spacer(1, 8), paragraph(callout["title"], "label"), paragraph(callout["body"])]))
    if data.get("sources"):
        story.extend([PageBreak(), paragraph("Para profundizar", "title")])
        for source in data["sources"]:
            url = escape(source["url"], {'"': "&quot;"})
            story.append(Paragraph(f'<link href="{url}" color="{accent_ink.hexval()}">{plain(source["label"])}</link>', styles["body"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = EbookDoc(output, data, accent, regular, bold)
    doc.multiBuild(story)
    return doc.page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manuscript", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--font-regular", type=Path)
    parser.add_argument("--font-bold", type=Path)
    args = parser.parse_args()
    if bool(args.font_regular) != bool(args.font_bold):
        parser.error("Indica ambas fuentes o ninguna.")
    regular, bold = "Helvetica", "Helvetica-Bold"
    if args.font_regular:
        pdfmetrics.registerFont(TTFont("BrandRegular", str(args.font_regular)))
        pdfmetrics.registerFont(TTFont("BrandBold", str(args.font_bold)))
        regular, bold = "BrandRegular", "BrandBold"
    try:
        pages = build(json.loads(args.manuscript.read_text(encoding="utf-8")),
                      args.manuscript.resolve().parent, args.output, regular, bold)
    except (ValueError, KeyError) as error:
        parser.error(str(error))
    print(f"PDF creado: {args.output.resolve()} ({pages} páginas)")


if __name__ == "__main__":
    main()
