"""Regresión del ensamblador de páginas: ejecutar con Python, Pillow, ReportLab y pypdf."""
import copy
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

from PIL import Image, ImageOps
from pypdf import PdfReader

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ebook", ROOT / "plugins/dropflex-optimizer/skills/create-gift-ebook/scripts/build_ebook.py")
ebook = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ebook)


class PageImagesTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name, color in (("reference", "#777777"), ("cover", "#ab3344"), ("content", "#3355ab")):
            Image.new("RGB", (800, 1200), color).save(self.root / f"{name}.png")
        self.output = self.root / "ebook.pdf"
        self.data = {
            "schema_version": "3.0", "title": "Guía de prueba", "product_name": "Producto de prueba",
            "product_reference": {"id": "real-reference", "path": "reference.png"},
            "visual_direction": {"style": "Editorial de prueba", "palette_basis": "Producto"},
            "pages": [
                {"id": name, "role": "cover" if index == 0 else "content", "label": name,
                 "path": f"{name}.png", "text": f"Texto literal de {name}", "prompt": "Prompt de prueba",
                 "source": "generated_from_reference", "contains_product": True,
                 "reference_id": "real-reference", "has_infographic": index > 0}
                for index, name in enumerate(("cover", "content"))
            ],
        }

    def test_pixels_order_full_bleed_and_no_added_text(self):
        result = ebook.build(self.data, self.root, self.output)
        reader = PdfReader(self.output)
        self.assertEqual(result["mode"], "page_images")
        self.assertEqual(result["pages"], 2)
        self.assertEqual(len(reader.pages), 2)
        self.assertEqual(len(reader.outline), 2)
        for index, page in enumerate(reader.pages):
            self.assertEqual(page.extract_text(), "")
            self.assertEqual(len(page.images), 1)
            with Image.open(self.root / self.data["pages"][index]["path"]) as original:
                self.assertEqual(page.images[0].image.convert("RGB").tobytes(), original.tobytes())
                self.assertAlmostEqual(float(page.mediabox.width) / float(page.mediabox.height),
                                       original.width / original.height, places=6)
            operations = page.get_contents().operations
            transforms = [operands for operands, operation in operations
                          if operation == b"cm" and operands[0] != 1]
            self.assertEqual(len(transforms), 1)
            a, b, c, d, e, f = map(float, transforms[0])
            self.assertAlmostEqual(a, float(page.mediabox.width), places=4)
            self.assertAlmostEqual(d, float(page.mediabox.height), places=4)
            self.assertEqual((b, c, e, f), (0, 0, 0, 0))

    def test_transparency_and_exif_orientation(self):
        transparent = Image.new("RGBA", (800, 1200), (80, 20, 90, 128))
        transparent.save(self.root / "cover.png")
        rotated = Image.new("RGB", (1200, 800), (25, 60, 130))
        exif = Image.Exif()
        exif[274] = 6
        rotated.save(self.root / "content.jpg", exif=exif)
        self.data["pages"][1]["path"] = "content.jpg"
        ebook.build(self.data, self.root, self.output)
        reader = PdfReader(self.output)
        expected = Image.new("RGB", transparent.size, "white")
        expected.paste(transparent, mask=transparent.getchannel("A"))
        self.assertEqual(reader.pages[0].images[0].image.convert("RGB").tobytes(), expected.tobytes())
        with Image.open(self.root / "content.jpg") as original:
            expected = ImageOps.exif_transpose(original).convert("RGB")
            self.assertEqual(reader.pages[1].images[0].image.convert("RGB").tobytes(), expected.tobytes())

    def test_duplicate_pixels_even_if_file_encoding_differs(self):
        with Image.open(self.root / "cover.png") as image:
            image.save(self.root / "content.png", compress_level=0)
        with self.assertRaisesRegex(ValueError, "misma imagen"):
            ebook.build(self.data, self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_wrong_aspect_and_low_resolution(self):
        for size in ((1200, 800), (400, 600)):
            with self.subTest(size=size):
                Image.new("RGB", size, "blue").save(self.root / "content.png")
                with self.assertRaises(ValueError):
                    ebook.build(self.data, self.root, self.output)
                self.assertFalse(self.output.exists())

    def test_contract_and_traceability_fail_before_writing(self):
        variants = []
        for field, value in (("role", "cover"), ("reference_id", "unrelated"),
                             ("source", "approved_gallery"), ("has_infographic", False),
                             ("text", ""), ("prompt", ""), ("contains_product", "true"),
                             ("id", "cover"), ("path", "missing.png")):
            data = copy.deepcopy(self.data)
            data["pages"][1][field] = value
            variants.append(data)
        data = copy.deepcopy(self.data)
        data["pages"][0]["role"] = "content"
        variants.append(data)
        data = copy.deepcopy(self.data)
        data["pages"] = data["pages"][:1]
        variants.append(data)
        data = copy.deepcopy(self.data)
        data["pages"][1].update(contains_product=False, source="generated")
        variants.append(data)
        data = copy.deepcopy(self.data)
        data["accent_color"] = "#ff0000"
        variants.append(data)
        for data in variants:
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    ebook.build(data, self.root, self.output)
                self.assertFalse(self.output.exists())

    def test_invalid_file_and_animated_file(self):
        (self.root / "content.png").write_text("not an image")
        with self.assertRaisesRegex(ValueError, "no es legible"):
            ebook.build(self.data, self.root, self.output)
        one = Image.new("RGB", (800, 1200), "blue")
        two = Image.new("RGB", (800, 1200), "red")
        one.save(self.root / "content.png", save_all=True, append_images=[two])
        with self.assertRaisesRegex(ValueError, "estática"):
            ebook.build(self.data, self.root, self.output)

    def test_does_not_overwrite_inputs(self):
        for name in ("cover.png", "content.png", "reference.png"):
            target = self.root / name
            before = target.read_bytes()
            with self.assertRaisesRegex(ValueError, "sobrescribir"):
                ebook.build(self.data, self.root, target)
            self.assertEqual(target.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
