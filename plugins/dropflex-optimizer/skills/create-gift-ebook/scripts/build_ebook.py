"""Compone un ebook editorial desde assets propios y una referencia local del producto."""
import argparse
import colorsys
import hashlib
import io
import json
import math
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

from PIL import Image as PillowImage, ImageOps
from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Neutros, tipografía y espaciado: design-system/tokens.json; paleta desde la foto.
INK = colors.HexColor("#15171c")
MUTED_INK = colors.HexColor("#5a606b")
WHITE = colors.white
SPACE, MARGIN, VERTICAL_MARGIN = 16, 32, 48
PAGE_WIDTH, PAGE_HEIGHT = A5
HEIGHTS = {"small": 112, "medium": 176, "large": 256}
LAYOUTS = ("wide", "inset", "image_left", "image_right")
BLOCK_KINDS = ("paragraph", "intro", "image", "infographic", "steps", "checklist", "callout", "page_break")


def plain(value):
    return escape(str(value)).replace("\n", "<br/>")


def text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field}: escribe texto no vacío.")
    return value


def strings(value, field):
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field}: incluye una lista con contenido.")
    for item in value:
        text(item, field)


def image_path(spec, root):
    path = root / text(spec.get("path"), "image.path")
    if not path.is_file():
        raise ValueError(f"No existe la imagen local: {path}")
    try:
        with PillowImage.open(path) as picture:
            if picture.format not in ("PNG", "JPEG", "WEBP"):
                raise ValueError("Usa PNG, JPEG o WebP.")
            picture.verify()
    except (OSError, SyntaxError) as error:
        raise ValueError(f"La imagen no es legible: {path}") from error
    return path


def region_box(region, size):
    if region is None:
        region = [0, 0, 1, 1]
    if (not isinstance(region, list) or len(region) != 4
            or any(type(n) not in (int, float) or not math.isfinite(n) or not 0 <= n <= 1 for n in region)
            or region[0] >= region[2] or region[1] >= region[3]):
        raise ValueError("subject_region: usa [izquierda, arriba, derecha, abajo] entre 0 y 1.")
    box = tuple(round(n * size[i % 2]) for i, n in enumerate(region))
    if box[0] == box[2] or box[1] == box[3]:
        raise ValueError("subject_region: la región seleccionada no contiene píxeles.")
    return box


def infer_palette(path, region=None):
    """Lee colores de la región del producto; no consulta el acento informado."""
    with PillowImage.open(path) as original:
        rgba = ImageOps.exif_transpose(original).convert("RGBA")
        picture = PillowImage.new("RGBA", rgba.size, "white")
        picture.alpha_composite(rgba)
        picture = picture.convert("RGB")
    picture = picture.crop(region_box(region, picture.size))
    picture.thumbnail((160, 160))
    quantized = picture.quantize(colors=24)
    palette = quantized.getpalette()
    candidates = []
    for count, index in quantized.getcolors():
        rgb = tuple(palette[index * 3:index * 3 + 3])
        _, saturation, value = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        if value < .08 or (saturation < .1 and value > .95):
            continue
        candidates.append((count, rgb, saturation, value))
    if not candidates:
        index = max(quantized.getcolors())[1]
        candidates = [(1, tuple(palette[index * 3:index * 3 + 3]), 0, 0)]
    chromatic = [c for c in candidates if c[2] >= .18 and c[0] >= sum(x[0] for x in candidates) * .05]
    neutral = [c for c in candidates if c[3] <= .7]
    chosen = max(chromatic or neutral or candidates, key=lambda c: c[0])
    accent = "#" + "".join(f"{c:02x}" for c in chosen[1])
    return {"accent_color": accent, "source": "reference_image",
            "subject_region": region or [0, 0, 1, 1]}


def tint(accent, strength):
    return colors.Color(*(1 - strength * (1 - channel)
                          for channel in (accent.red, accent.green, accent.blue)))


def luminance(color):
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
              for c in (color.red, color.green, color.blue)]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))


def ratio(a, b):
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + .05) / (low + .05)


def contrast_ink(accent):
    value = accent
    while ratio(value, WHITE) < 4.5:
        value = colors.Color(value.red * .9, value.green * .9, value.blue * .9)
    return value


def validate(data, root):
    if not isinstance(data, dict):
        raise ValueError("El manuscrito debe ser un objeto JSON.")
    if data.get("schema_version") != "2.0":
        raise ValueError("Usa schema_version 2.0 y el contrato editorial de blocks; migra el manuscrito anterior.")
    for key in ("title", "subtitle", "product_name"):
        text(data.get(key), key)
    if "accent_color" in data:
        raise ValueError("No informes accent_color: la paleta se infiere desde product_reference.")
    if data.get("background", "plain") not in ("waves", "plain"):
        raise ValueError("background: usa waves o plain.")
    if type(data.get("show_contents", False)) is not bool:
        raise ValueError("show_contents: usa true o false.")
    reference = data.get("product_reference")
    if not isinstance(reference, dict):
        raise ValueError("product_reference: conserva la referencia real utilizada.")
    text(reference.get("id"), "product_reference.id")
    reference_path = image_path(reference, root)
    with PillowImage.open(reference_path) as picture:
        region_box(reference.get("subject_region"), ImageOps.exif_transpose(picture).size)
    direction = data.get("visual_direction")
    if not isinstance(direction, dict):
        raise ValueError("visual_direction: define una dirección común para imágenes y PDF.")
    for key in ("style", "palette_basis"):
        text(direction.get(key), f"visual_direction.{key}")
    assets = data.get("visual_assets")
    if not isinstance(assets, list) or not assets:
        raise ValueError("visual_assets: incluye las piezas creadas para esta guía.")
    catalog, digests = {}, {}
    for asset in assets:
        if not isinstance(asset, dict):
            raise ValueError("Cada asset debe ser un objeto.")
        asset_id = text(asset.get("id"), "asset.id")
        if asset_id in catalog:
            raise ValueError("Los IDs de assets deben ser únicos.")
        path = image_path(asset, root)
        if asset.get("kind") not in ("product_image", "infographic", "illustration"):
            raise ValueError("asset.kind: usa product_image, infographic o illustration.")
        if type(asset.get("contains_product")) is not bool:
            raise ValueError("asset.contains_product: usa true o false.")
        if asset["kind"] == "product_image" and not asset["contains_product"]:
            raise ValueError("Un asset product_image debe contener el producto.")
        source = asset.get("source")
        if source not in ("generated_from_reference", "generated", "authored_vector", "approved_gallery"):
            raise ValueError("asset.source: conserva la procedencia de la pieza.")
        if source != "approved_gallery":
            text(asset.get("prompt"), "asset.prompt")
        if asset["contains_product"]:
            if source not in ("generated_from_reference", "approved_gallery"):
                raise ValueError("Las piezas con producto necesitan una referencia real.")
            if asset.get("reference_id") != reference["id"]:
                raise ValueError("asset.reference_id: debe coincidir con la referencia utilizada.")
        text(asset.get("purpose"), "asset.purpose")
        catalog[asset_id] = asset
        digests[asset_id] = hashlib.sha256(path.read_bytes()).hexdigest()
    cover = data.get("cover")
    if not isinstance(cover, dict) or not isinstance(cover.get("asset"), str) or cover["asset"] not in catalog:
        raise ValueError("cover.asset: elige la pieza de portada.")
    if cover.get("layout", "title_first") not in ("title_first", "image_first"):
        raise ValueError("cover.layout: usa title_first o image_first.")
    cover_asset = catalog[cover["asset"]]
    if not cover_asset["contains_product"] or cover_asset["source"] != "generated_from_reference":
        raise ValueError("La portada necesita una imagen propia creada desde la referencia del producto.")
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        raise ValueError("chapters: incluye secciones con contenido útil.")
    used_products, used_infographics = set(), set()
    for chapter in chapters:
        if not isinstance(chapter, dict):
            raise ValueError("Cada sección debe ser un objeto.")
        text(chapter.get("title"), "chapter.title")
        if type(chapter.get("start_on_new_page", False)) is not bool:
            raise ValueError("start_on_new_page: usa true o false.")
        blocks = chapter.get("blocks")
        if not isinstance(blocks, list) or not blocks:
            raise ValueError("chapter.blocks: define el contenido en el orden editorial elegido.")
        useful = False
        for index, block in enumerate(blocks):
            if not isinstance(block, dict) or block.get("kind") not in BLOCK_KINDS:
                raise ValueError("Tipo de bloque no admitido.")
            kind = block["kind"]
            if kind in ("paragraph", "intro"):
                text(block.get("text"), "block.text")
                useful = True
            elif kind in ("steps", "checklist"):
                strings(block.get("items"), "block.items")
                useful = True
            elif kind == "callout":
                text(block.get("title"), "callout.title")
                text(block.get("body"), "callout.body")
                useful = True
            elif kind in ("image", "infographic"):
                asset_id = text(block.get("asset"), "block.asset")
                if asset_id not in catalog:
                    raise ValueError("block.asset: no existe en visual_assets.")
                asset = catalog[asset_id]
                if block.get("layout", "wide") not in LAYOUTS:
                    raise ValueError("block.layout: usa wide, inset, image_left o image_right.")
                if not isinstance(block.get("size", "medium"), str) or block.get("size", "medium") not in HEIGHTS:
                    raise ValueError("block.size: usa small, medium o large.")
                if block.get("layout") in ("image_left", "image_right"):
                    text(block.get("aside"), "block.aside")
                if "caption" in block:
                    text(block["caption"], "block.caption")
                if asset["contains_product"] and asset["source"] == "generated_from_reference":
                    used_products.add(digests[asset_id])
                if kind == "infographic":
                    if asset["kind"] != "infographic" or asset["source"] == "approved_gallery":
                        raise ValueError("La infografía debe ser una pieza propia creada para esta guía.")
                    used_infographics.add(asset_id)
            elif kind == "page_break" and index in (0, len(blocks) - 1):
                raise ValueError("No empieces ni cierres una sección con page_break.")
        if not useful:
            raise ValueError("Cada sección necesita contenido práctico, además de imágenes.")
    if not used_products - {digests[cover["asset"]]}:
        raise ValueError("Crea una escena o detalle distinto del producto para el interior; no repitas la portada.")
    if not used_infographics:
        raise ValueError("Incluye una infografía propia dentro de la guía.")
    sources = data.get("sources", [])
    if not isinstance(sources, list):
        raise ValueError("sources: se esperaba una lista.")
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("Cada fuente debe ser un objeto.")
        text(source.get("label"), "source.label")
        url = text(source.get("url"), "source.url")
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.netloc or any(c in url for c in " \n<>\"'"):
            raise ValueError("Cada fuente necesita un enlace HTTPS válido.")
    return catalog


class Figure(Flowable):
    """La imagen conserva su proporción; el manuscrito decide tamaño y posición."""
    def __init__(self, path, height, inset=False):
        super().__init__()
        with PillowImage.open(path) as original:
            picture = ImageOps.exif_transpose(original).copy()
        if picture.mode not in ("RGB", "RGBA", "L", "LA", "P", "1"):
            picture = picture.convert("RGB")
        buffer = io.BytesIO()
        picture.save(buffer, format="PNG")
        buffer.seek(0)
        self.picture = Image(buffer)
        self.max_height, self.inset = height, inset

    def wrap(self, available_width, available_height):
        self.width = available_width
        frame_width = available_width * (.72 if self.inset else 1)
        scale = min(frame_width / self.picture.imageWidth, self.max_height / self.picture.imageHeight)
        self.picture.drawWidth = self.picture.imageWidth * scale
        self.picture.drawHeight = self.picture.imageHeight * scale
        self.height = self.picture.drawHeight
        return self.width, self.height

    def draw(self):
        self.picture.drawOn(self.canv, (self.width - self.picture.drawWidth) / 2, 0)


class Cover(Flowable):
    """Portada completa; la dirección editorial elige imagen o título primero."""
    def __init__(self, data, root, catalog, styles):
        super().__init__()
        self.data, self.root, self.catalog, self.styles = data, root, catalog, styles
        self.height = PAGE_HEIGHT - VERTICAL_MARGIN * 2

    def wrap(self, available_width, available_height):
        self.width = available_width
        self.copy = []
        if self.data.get("brand"):
            self.copy.append(Paragraph(plain(self.data["brand"]), self.styles["label"]))
        self.copy += [Paragraph(plain(self.data[key]), self.styles[style])
                      for key, style in (("title", "title"), ("subtitle", "intro"))]
        self.footer = [Paragraph(plain(self.data["product_name"]), self.styles["label"]),
                       Paragraph("Incluido gratis con cada compra", self.styles["caption"])]
        used = sum(item.wrap(self.width, math.inf)[1] + SPACE for item in self.copy + self.footer)
        height = self.height - used - SPACE
        if height < SPACE * 8:
            raise ValueError("La portada no cabe: acorta título/subtítulo para conservar una imagen legible.")
        self.photo = Figure(self.root / self.catalog[self.data["cover"]["asset"]]["path"], height)
        self.photo.wrap(self.width, height)
        return self.width, self.height

    def draw(self):
        first = [self.photo, *self.copy] if self.data["cover"].get("layout") == "image_first" else [*self.copy, self.photo]
        y = self.height
        for item in [*first, *self.footer]:
            height = item.wrap(self.width, math.inf)[1]
            y -= height
            item.drawOn(self.canv, 0, y)
            y -= SPACE


class EbookDoc(BaseDocTemplate):
    def __init__(self, output, data, accent, regular):
        self.data, self.accent, self.regular = data, accent, regular
        super().__init__(str(output), pagesize=A5, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=VERTICAL_MARGIN, bottomMargin=VERTICAL_MARGIN,
                         title=data["title"], author=data.get("brand", ""))
        frame = Frame(MARGIN, VERTICAL_MARGIN, PAGE_WIDTH - MARGIN * 2,
                      PAGE_HEIGHT - VERTICAL_MARGIN * 2, leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0, id="body")
        self.addPageTemplates(PageTemplate(id="ebook", frames=frame, onPage=self.decorate))

    def decorate(self, canvas, doc):
        canvas.saveState()
        if self.data.get("background", "plain") == "waves":
            for strength, offset in ((.04, 0), (.025, 12)):
                canvas.setFillColor(tint(self.accent, strength))
                wave = canvas.beginPath()
                wave.moveTo(0, 0)
                wave.lineTo(0, VERTICAL_MARGIN - offset)
                wave.curveTo(PAGE_WIDTH * .3, -12, PAGE_WIDTH * .6, VERTICAL_MARGIN - offset,
                             PAGE_WIDTH, VERTICAL_MARGIN / 2 - offset)
                wave.lineTo(PAGE_WIDTH, 0)
                wave.close()
                canvas.drawPath(wave, fill=1, stroke=0)
        canvas.setFillColor(self.accent)
        canvas.roundRect(MARGIN, PAGE_HEIGHT - MARGIN, SPACE * 3, 4, 2, stroke=0, fill=1)
        if doc.page > 1:
            canvas.setFillColor(MUTED_INK)
            canvas.setFont(self.regular, 12)
            canvas.drawString(MARGIN, MARGIN / 2, "Guía de regalo")
            canvas.drawRightString(PAGE_WIDTH - MARGIN, MARGIN / 2, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "chapter":
            key = flowable.ebook_key
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(), key, level=0)
            self.notify("TOCEntry", (0, flowable.getPlainText(), self.page, key))


def build(data, root, output, regular="Helvetica", bold="Helvetica-Bold"):
    catalog = validate(data, root)
    reference = data["product_reference"]
    palette = infer_palette(root / reference["path"], reference.get("subject_region"))
    accent = colors.HexColor(palette["accent_color"])
    styles = {
        "title": ParagraphStyle("title", fontName=bold, fontSize=28, leading=34, textColor=INK, spaceAfter=SPACE),
        "chapter": ParagraphStyle("chapter", fontName=bold, fontSize=20, leading=26, textColor=INK, spaceBefore=SPACE, spaceAfter=SPACE, keepWithNext=True),
        "body": ParagraphStyle("body", fontName=regular, fontSize=13, leading=18, textColor=INK, spaceAfter=12),
        "intro": ParagraphStyle("intro", fontName=regular, fontSize=15, leading=22, textColor=MUTED_INK, spaceAfter=SPACE),
        "label": ParagraphStyle("label", fontName=bold, fontSize=12, leading=16, textColor=contrast_ink(accent), spaceAfter=8, keepWithNext=True),
        "caption": ParagraphStyle("caption", fontName=regular, fontSize=12, leading=16, textColor=MUTED_INK, spaceAfter=SPACE),
    }
    def paragraph(value, style="body"):
        return Paragraph(plain(value), styles[style])

    width = PAGE_WIDTH - MARGIN * 2
    story = [Cover(data, root, catalog, styles), PageBreak()]
    if data.get("show_contents", False):
        toc = TableOfContents()
        toc.levelStyles = [ParagraphStyle("toc", fontName=regular, fontSize=13, leading=22, textColor=INK, spaceBefore=12)]
        story += [paragraph("Tu recorrido", "title"), toc, PageBreak()]
    for index, chapter in enumerate(data["chapters"]):
        if index and chapter.get("start_on_new_page", False):
            story.append(PageBreak())
        heading = paragraph(chapter["title"], "chapter")
        heading.ebook_key = f"section-{index + 1}"
        story.append(heading)
        for block in chapter["blocks"]:
            kind = block["kind"]
            if kind in ("paragraph", "intro"):
                story.append(paragraph(block["text"], "intro" if kind == "intro" else "body"))
            elif kind in ("image", "infographic"):
                asset = catalog[block["asset"]]
                layout = block.get("layout", "wide")
                figure = Figure(root / asset["path"], HEIGHTS[block.get("size", "medium")], layout == "inset")
                figure_parts = [figure, Spacer(1, 12)]
                if block.get("caption"):
                    figure_parts.append(paragraph(block["caption"], "caption"))
                if layout in ("image_left", "image_right"):
                    copy = [paragraph(block["aside"])]
                    cells = [figure_parts, copy] if layout == "image_left" else [copy, figure_parts]
                    table = Table([cells], colWidths=[width / 2] * 2, hAlign="LEFT")
                    table.setStyle(TableStyle([
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (0, 0), SPACE),
                        ("RIGHTPADDING", (1, 0), (1, 0), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), SPACE),
                    ]))
                    story.append(table)
                else:
                    story.append(KeepTogether(figure_parts))
            elif kind in ("steps", "checklist"):
                for i, value in enumerate(block["items"], 1):
                    story.append(paragraph(f"{i}. {value}" if kind == "steps" else f"[  ] {value}"))
            elif kind == "callout":
                story.append(KeepTogether([paragraph(block["title"], "label"), paragraph(block["body"])]))
            elif kind == "page_break":
                story.append(PageBreak())
    if data.get("sources"):
        story += [PageBreak(), paragraph("Para profundizar", "title")]
        for source in data["sources"]:
            url = escape(source["url"], {'"': "&quot;"})
            story.append(Paragraph(f'<link href="{url}">{plain(source["label"])}</link>', styles["body"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = EbookDoc(output, data, accent, regular)
    doc.multiBuild(story)
    return {"pages": doc.page, "palette": palette}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manuscript", type=Path, nargs="?")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--inspect-reference", type=Path)
    parser.add_argument("--subject-region", type=float, nargs=4)
    parser.add_argument("--font-regular", type=Path)
    parser.add_argument("--font-bold", type=Path)
    args = parser.parse_args()
    try:
        if args.inspect_reference:
            path = image_path({"path": str(args.inspect_reference.resolve())}, Path.cwd())
            print(json.dumps(infer_palette(path, args.subject_region), ensure_ascii=False))
            return
        if not args.manuscript or not args.output:
            parser.error("Indica el manuscrito y --output, o usa --inspect-reference.")
        if bool(args.font_regular) != bool(args.font_bold):
            parser.error("Indica ambas fuentes o ninguna.")
        regular, bold = "Helvetica", "Helvetica-Bold"
        if args.font_regular:
            pdfmetrics.registerFont(TTFont("BrandRegular", str(args.font_regular)))
            pdfmetrics.registerFont(TTFont("BrandBold", str(args.font_bold)))
            regular, bold = "BrandRegular", "BrandBold"
        result = build(json.loads(args.manuscript.read_text(encoding="utf-8")),
                       args.manuscript.resolve().parent, args.output, regular, bold)
    except (ValueError, KeyError) as error:
        parser.error(str(error))
    print(json.dumps({"pdf": str(args.output.resolve()), **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
