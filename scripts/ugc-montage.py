#!/usr/bin/env python3
"""Montaje local del video UGC de DropFlex (docs/spec-video-ugc.md §5.2).

Lee el paquete que descarga la pestaña Videos de Creativos («Descargar paquete») y arma el video listo
para Meta: tomas habladas con la voz continua, B-roll encima de la voz (entra en su palabra), zoom
alterno por frase, entrada de golpe del B-roll, destello al cambiar de idea, sacudida en el gancho,
subtítulos palabra por palabra, rótulo «Dramatización», cierre con la foto del producto, música
opcional con bajada automática bajo la voz, marca de agua con el dominio de la tienda y compresión para
Meta.

La marca de agua es semitransparente y cambia de lugar cada 4 s (nunca en los subtítulos ni en los
textos en pantalla): no se quita recortando ni tapando una esquina, así otra tienda no puede reusar el
video. El dominio lo trae el paquete; --watermark lo cambia y --no-watermark la quita.

Uso:
    python3 scripts/ugc-montage.py uro-vaginal-probiotico-mascota-angulo-1.json [--music pista.mp3] [--out video.mp4] [--watermark tutienda.cl]

El video sale junto al paquete con su mismo nombre (producto, formato y ángulo), salvo que se pase --out.

Requisitos: ffmpeg y ffprobe; Python 3.9+ con Pillow y numpy. Para los tiempos de los subtítulos,
mlx-whisper (Mac con Apple Silicon: `pip install mlx-whisper`) u openai-whisper (`pip install
openai-whisper`). Sin Whisper, los tiempos se estiman por el largo de cada palabra.

El texto de los subtítulos sale del guion; Whisper solo aporta los tiempos (escribe «7» por «siete»
y a veces oye mal una palabra).
"""
from __future__ import annotations

import argparse
import difflib
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path

PACKAGE_VERSION = 1
W, H, FPS = 720, 1280, 24
END_CARD_S = 2.0
WHITE = (255, 255, 255, 255)
# Marca de agua: cada WATERMARK_EVERY_S segundos salta al siguiente lugar (x como expresión de overlay,
# y como fracción del alto). Todos quedan entre los textos en pantalla (15–26 %) y los subtítulos (60 %).
WATERMARK_EVERY_S = 4
WATERMARK_SPOTS = [("48", 0.34), ("W-w-48", 0.46), ("(W-w)/2", 0.53), ("W-w-48", 0.33)]
FONT_CANDIDATES = {
    "bold": ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "regular": ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"],
}


def fail(msg: str) -> None:
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def sh(*args: str) -> None:
    r = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        fail(f"{' '.join(args[:3])}… falló:\n{r.stderr.decode(errors='replace')[-1500:]}")


def probe_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, stdin=subprocess.DEVNULL)
    return float(out.stdout.strip() or 0)


def font(kind: str, size: int):
    from PIL import ImageFont

    for p in FONT_CANDIDATES[kind]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ---------------------------------------------------------------- Palabras y tiempos

NUMBERS = {"1": "uno", "2": "dos", "3": "tres", "4": "cuatro", "5": "cinco", "6": "seis", "7": "siete", "8": "ocho", "9": "nueve", "10": "diez", "20": "veinte", "30": "treinta"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def tkey(t: str) -> str:
    n = norm(t)
    return NUMBERS.get(n, n)


def find_whisper() -> list[str] | None:
    exe = shutil.which("mlx_whisper") or next(iter(glob.glob(os.path.expanduser("~/Library/Python/*/bin/mlx_whisper"))), None)
    if exe:
        return [exe, "--model", "mlx-community/whisper-large-v3-turbo"]
    if shutil.which("whisper"):
        return ["whisper", "--model", "small"]
    return None


def transcribe(clip: Path, language: str, work: Path, whisper: list[str] | None) -> list[dict] | None:
    if not whisper:
        return None
    out = work / f"{clip.stem}.json"
    if not out.exists():
        lang = "pt" if language.startswith("pt") else "es"
        sh(*whisper, str(clip), "--language", lang, "--word-timestamps", "True", "--output-format", "json", "--output-dir", str(work), *(["--verbose", "False"] if "mlx" in whisper[0] else []))
    data = json.loads(out.read_text())
    return [{"w": w["word"].strip(), "s": float(w["start"]), "e": float(w["end"])} for seg in data.get("segments", []) for w in seg.get("words", [])]


def estimate(script: list[str], duration: float) -> list[dict]:
    """Sin Whisper: reparte la toma por el largo de cada palabra (la voz de Seedance no deja silencios)."""
    weights = [max(2, len(norm(w))) + 1 for w in script]
    total = sum(weights)
    start, out = 0.15, []
    span = max(0.5, duration - 0.35)
    for w, k in zip(script, weights):
        d = span * k / total
        out.append({"w": w, "s": start, "e": start + d})
        start += d
    return out


def align(script: list[str], heard: list[dict]) -> list[dict]:
    """El texto sale del guion; la transcripción solo aporta los tiempos."""
    sm = difflib.SequenceMatcher(a=[tkey(t) for t in script], b=[tkey(h["w"]) for h in heard], autojunk=False)
    out: list[dict] = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out += [{"w": script[i1 + k], "s": heard[j1 + k]["s"], "e": heard[j1 + k]["e"]} for k in range(i2 - i1)]
        elif i2 > i1:
            s0 = heard[j1]["s"] if j2 > j1 else (out[-1]["e"] if out else 0.0)
            e0 = heard[j2 - 1]["e"] if j2 > j1 else (heard[j1]["s"] if j1 < len(heard) else s0 + 0.3 * (i2 - i1))
            step = max(0.05, (e0 - s0) / (i2 - i1))
            out += [{"w": script[i1 + k], "s": s0 + k * step, "e": s0 + (k + 1) * step} for k in range(i2 - i1)]
    return out


# ---------------------------------------------------------------- Imágenes de texto (Pillow: el ffmpeg de Homebrew no trae drawtext)


def hex_rgba(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def wrap_lines(d, text: str, f, max_w: int) -> list[str]:
    """Parte el texto en líneas de hasta max_w (por palabras)."""
    lines, cur = [], ""
    for w in text.split():
        test = f"{cur} {w}".strip()
        if cur and d.textlength(test, font=f) > max_w:
            lines.append(cur)
            cur = w
        else:
            cur = test
    return lines + ([cur] if cur else [])


def fit_block(d, text: str, kind: str, size: int, min_size: int, max_w: int, max_lines: int):
    """La fuente más grande con que el texto cabe en max_lines líneas de max_w; en dos líneas, lo más parejas posible."""
    while True:
        f = font(kind, size)
        lines = wrap_lines(d, text, f, max_w)
        if len(lines) <= max_lines or size <= min_size:
            break
        size -= 2
    if len(lines) == 2:
        words = " ".join(lines).split()
        cut = min(range(1, len(words)), key=lambda i: max(d.textlength(" ".join(words[:i]), font=f), d.textlength(" ".join(words[i:]), font=f)))
        lines = [" ".join(words[:cut]), " ".join(words[cut:])]
    return f, size, lines


def fit_font(d, lines: list[str], kind: str, size: int, min_size: int, max_w: int, stroke: int = 0):
    """La fuente más grande (≤ size) con la que todas las líneas caben en max_w."""
    while size > min_size and max(d.textlength(line, font=font(kind, size)) + 2 * stroke for line in lines) > max_w:
        size -= 2
    return font(kind, size)


def beat_png(path: Path, text: str) -> None:
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lines = text.split("\n")
    max_w = W - 80
    if len(lines) == 1 and d.textlength(text, font=font("bold", 36)) > max_w:
        # Una línea que no cabe ni achicada: se parte en dos por la palabra más cercana al medio.
        words = text.split()
        cut = min(range(1, len(words)), key=lambda i: abs(len(" ".join(words[:i])) - len(" ".join(words[i:]))), default=len(words))
        lines = [" ".join(words[:cut]), " ".join(words[cut:])] if len(words) > 1 else lines
    f = fit_font(d, lines, "bold", 44 if len(lines) == 1 else 36, 26, max_w)
    y = int(H * 0.15)
    for line in lines:
        l, t, r, b = d.textbbox((0, 0), line, font=f)
        x = (W - (r - l)) // 2
        d.rounded_rectangle((x - 16, y - 14, x + (r - l) + 16, y + (b - t) + 14), radius=10, fill=(255, 255, 255, 235))
        d.text((x - l, y - t), line, font=f, fill=(0, 0, 0, 255))
        y += (b - t) + 40
    im.save(path)


def caption_png(path: Path, words: list[str], active: int, accent: tuple[int, int, int, int]) -> None:
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    line = " ".join(words)
    f = fit_font(d, [line], "bold", 50, 30, W - 60, stroke=5)
    l, t, r, b = d.textbbox((0, 0), line, font=f)
    x, y = (W - (r - l)) // 2, int(H * 0.60)
    for i, w in enumerate(words):
        piece = w + (" " if i < len(words) - 1 else "")
        d.text((x - l, y - t), piece, font=f, fill=accent if i == active else WHITE, stroke_width=5, stroke_fill=(0, 0, 0, 255))
        x += d.textlength(piece, font=f)
    im.save(path)


def label_png(path: Path, text: str) -> None:
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font("regular", 22)
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    x, y = W - (r - l) - 30, int(H * 0.105)
    d.rounded_rectangle((x - 8, y - 6, x + (r - l) + 8, y + (b - t) + 6), radius=6, fill=(0, 0, 0, 120))
    d.text((x - l, y - t), text, font=f, fill=WHITE)
    im.save(path)


def watermark_png(path: Path, text: str) -> None:
    """El dominio en blanco al 55 %, con un borde oscuro suave para que se lea sobre fondos claros."""
    from PIL import Image, ImageDraw

    f = font("bold", 28)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), text, font=f, stroke_width=2)
    im = Image.new("RGBA", (r - l + 8, b - t + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - l, 4 - t), text, font=f, fill=(255, 255, 255, 140), stroke_width=2, stroke_fill=(0, 0, 0, 90))
    im.save(path)


def watermark_xy(end_start: float) -> tuple[str, str]:
    """Posición de la marca por cuadro: rota por WATERMARK_SPOTS y en el cierre va arriba al centro."""
    k = f"mod(floor(t/{WATERMARK_EVERY_S}),{len(WATERMARK_SPOTS)})"

    def pick(values: list[str]) -> str:
        expr = values[-1]
        for i in range(len(values) - 2, -1, -1):
            expr = f"if(eq({k},{i}),{values[i]},{expr})"
        return expr

    xs = [x for x, _ in WATERMARK_SPOTS]
    ys = [f"H*{y}" for _, y in WATERMARK_SPOTS]
    return f"if(gte(t,{end_start:.3f}),(W-w)/2,{pick(xs)})", f"if(gte(t,{end_start:.3f}),56,{pick(ys)})"


def flash_png(path: Path, alpha: int) -> None:
    from PIL import Image

    Image.new("RGBA", (W, H), (255, 255, 255, alpha)).save(path)


def end_card_png(path: Path, card: dict, image: Path | None, accent: tuple[int, int, int, int]) -> None:
    """El cierre: foto del producto, nombre, línea, botón y letra chica. Los textos se achican y se parten
    en líneas (nunca se salen del cuadro); la foto usa el alto que dejan, desde abajo hacia arriba."""
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    title_f, title_s, title = fit_block(d, card.get("title", ""), "bold", 58, 34, W - 80, 2)
    sub_f, sub_s, sub = fit_block(d, card.get("subtitle", ""), "regular", 38, 26, W - 80, 2)
    cta_text = card.get("cta", "Comprar").upper()
    cta_f = fit_font(d, [cta_text], "bold", 36, 24, W - 200)
    cta_w = max(300, int(d.textlength(cta_text, font=cta_f)) + 80)
    small = [x for x in card.get("small_print", [])[:3] if x]
    for small_s in range(20, 14, -1):
        small_f = font("regular", small_s)
        fine = [line for item in small for line in wrap_lines(d, item, small_f, W - 60)]
        if len(fine) <= 6:
            break

    def lh(size: int, k: float) -> int:
        return int(size * k)

    # De abajo hacia arriba: letra chica, botón, línea, nombre y, en lo que queda, la foto.
    y = H - 40 - len(fine) * lh(small_s, 1.35)
    fine_top = y
    cta_top = y - (26 if fine else 0) - 76
    sub_top = cta_top - 34 - len(sub) * lh(sub_s, 1.25)
    title_top = sub_top - 14 - len(title) * lh(title_s, 1.15)
    photo_top, photo_bottom = 130, title_top - 40
    if image and image.exists():
        p = Image.open(image).convert("RGB")
        scale = min(520 / p.width, max(1, photo_bottom - photo_top) / p.height)
        p = p.resize((max(1, int(p.width * scale)), max(1, int(p.height * scale))))
        im.paste(p, ((W - p.width) // 2, photo_top + (photo_bottom - photo_top - p.height) // 2))

    def lines_at(lines: list[str], f, top: int, step: int, fill) -> None:
        for i, line in enumerate(lines):
            d.text(((W - d.textlength(line, font=f)) / 2, top + i * step), line, font=f, fill=fill)

    lines_at(title, title_f, title_top, lh(title_s, 1.15), "black")
    lines_at(sub, sub_f, sub_top, lh(sub_s, 1.25), "#333333")
    d.rounded_rectangle(((W - cta_w) // 2, cta_top, (W + cta_w) // 2, cta_top + 76), radius=14, fill=accent[:3])
    l, t, r, b = d.textbbox((0, 0), cta_text, font=cta_f)
    d.text(((W - (r - l)) // 2 - l, cta_top + (76 - (b - t)) // 2 - t), cta_text, font=cta_f, fill="black")
    lines_at(fine, small_f, fine_top, lh(small_s, 1.35), "#666666")
    im.save(path)


# ---------------------------------------------------------------- Movimiento


def motion(kind: str, idx: int, frames: int, flash: bool, shake: bool) -> str:
    """Zoom por plano (zoompan sobre 2x para que no tiemble)."""
    n = max(frames, 1)
    if kind == "B":
        z = f"if(lt(on,6),1.35-0.30*on/6,1.05+0.05*(on-6)/{n})"  # entrada de golpe
    elif idx % 2 == 0:
        z = f"1.04+0.08*on/{n}"  # se acerca
    else:
        z = f"1.14-0.10*on/{n}"  # se aleja
    sx, sy = ("+10*sin(on*2.1)", "+8*cos(on*1.7)") if shake else ("", "")
    vf = f"fps={FPS},scale={2 * W}:{2 * H},setsar=1,zoompan=z='{z}':x='iw/2-(iw/zoom/2){sx}':y='ih/2-(ih/zoom/2){sy}':d=1:s={W}x{H}:fps={FPS}"
    if flash:
        vf += ",fade=t=in:st=0:d=0.14:color=white"
    return vf


def file_slug(text: str) -> str:
    """Igual que fileSlug en lib/video/catalog.ts: minúsculas, sin tildes ni símbolos, hasta 40 sin cortar una palabra."""
    s = re.sub(r"[\u0300-\u036f]", "", unicodedata.normalize("NFD", text)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) <= 40:
        return s or "video"
    cut = s[:41]
    return (cut[: cut.rindex("-")] if "-" in cut else s[:40]).rstrip("-")


def package_name(pkg: dict) -> str:
    """El nombre del video: el que trae el paquete o, en los anteriores, la misma regla (montageName)."""
    if pkg.get("name"):
        return pkg["name"]
    fmt = pkg.get("format") or ("mascot" if pkg.get("label") in ("Animación", "Animação") else "ugc")
    return f"{file_slug(pkg['product']['title'])}-{'mascota' if fmt == 'mascot' else 'ugc'}-angulo-{pkg['angle']['slot']}"


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    if os.path.exists(url):
        shutil.copy(url, dest)
        return dest
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except Exception as e:  # noqa: BLE001
        fail(f"No se pudo descargar {dest.name} ({e}). Si el paquete tiene más de 24 horas, descárgalo de nuevo desde DropFlex.")
    return dest


# ---------------------------------------------------------------- Música


def beat_grid(music: Path, work: Path) -> tuple[float, float]:
    """Tempo y primer golpe por autocorrelación de la energía (sin librosa)."""
    import numpy as np

    raw = work / "music.raw"
    sh("ffmpeg", "-y", "-loglevel", "error", "-i", str(music), "-t", "90", "-ac", "1", "-ar", "11025", "-f", "f32le", str(raw))
    x = np.fromfile(raw, dtype=np.float32)
    hop, sr = 256, 11025
    e = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(len(x) // hop)])
    o = np.maximum(0, np.diff(e))
    o = o - o.mean()
    fps = sr / hop
    ac = np.correlate(o, o, "full")[len(o) - 1:]
    lags = np.arange(1, len(ac))
    bpm = 60 * fps / lags
    ok = (bpm > 70) & (bpm < 180)
    lag = lags[ok][np.argmax(ac[1:][ok])]
    period = int(round(lag))
    phase = max(range(period), key=lambda p: o[p::period].sum())
    return phase / fps, lag / fps


def mix_music(video: Path, music: Path, first_hit: float, out: Path, work: Path) -> None:
    dur = probe_duration(video)
    try:
        first_beat, period = beat_grid(music, work)
        offset = (first_beat - first_hit) % period
    except Exception:  # noqa: BLE001
        offset = 0.0
    end = max(0.0, dur - END_CARD_S)
    sh(
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-ss", f"{offset:.3f}", "-i", str(music), "-filter_complex",
        f"[0:a]loudnorm=I=-14:TP=-1.5:LRA=7,asplit=2[voz][sc];"
        f"[1:a]atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,volume=-14dB,volume='if(gte(t,{end:.3f}),2.5,1)':eval=frame,afade=t=in:st=0:d=0.3,afade=t=out:st={max(0, dur - 0.9):.3f}:d=0.9[mus];"
        f"[mus][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350:makeup=1[duck];"
        f"[voz][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(out),
    )


# ---------------------------------------------------------------- Montaje


def main() -> None:
    ap = argparse.ArgumentParser(description="Montaje local del video UGC de DropFlex.")
    ap.add_argument("package", help="El JSON que descarga «Descargar paquete».")
    ap.add_argument("--music", help="Pista de música (MP3/WAV) con licencia comercial. Opcional.")
    ap.add_argument("--out", help="Archivo de salida (por defecto, junto al paquete: <producto>-<ugc|mascota>-angulo-N.mp4).")
    ap.add_argument("--crf", type=int, default=25, help="Calidad H.264 (25 para Meta; más alto, más liviano).")
    ap.add_argument("--watermark", help="Texto de la marca de agua (por defecto, el dominio de tu tienda que trae el paquete).")
    ap.add_argument("--no-watermark", action="store_true", help="Sin marca de agua.")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            fail(f"falta {tool}. En Mac: brew install ffmpeg")
    try:
        import PIL  # noqa: F401
    except ImportError:
        fail("falta Pillow: pip install pillow")

    pkg_path = Path(args.package).expanduser().resolve()
    pkg = json.loads(pkg_path.read_text())
    if pkg.get("version") != PACKAGE_VERSION:
        fail(f"este script lee paquetes versión {PACKAGE_VERSION}; el paquete es versión {pkg.get('version')}. Actualiza el script.")
    work = pkg_path.with_suffix("").with_name(pkg_path.stem + "-montaje")
    work.mkdir(exist_ok=True)
    out = Path(args.out).expanduser() if args.out else pkg_path.parent / f"{package_name(pkg)}.mp4"
    accent = hex_rgba(pkg.get("accent_color") or "#F2C230")
    language = pkg.get("language", "es")
    whisper = find_whisper()
    print(f"Paquete: {pkg['product']['title']} · {pkg['angle']['title']}")
    print("Tiempos de los subtítulos: " + ("Whisper" if whisper else "estimados (instala mlx-whisper u openai-whisper para más precisión)"))
    watermark = None if args.no_watermark else (args.watermark or pkg.get("watermark") or "").strip() or None
    if watermark:
        print(f"Marca de agua: {watermark} (cambia de lugar cada {WATERMARK_EVERY_S} s)")
    elif not args.no_watermark:
        print("Aviso: el paquete no trae el dominio de tu tienda y el video sale SIN marca de agua. Agrégala con --watermark tutienda.cl")

    # 1. Clips y tiempos de cada palabra.
    clips = []
    for a in pkg["a_roll"]:
        path = download(a["url"], work / f"{a['key']}.mp4")
        script = a["line"].split()
        heard = transcribe(path, language, work, whisper)
        dur = probe_duration(path)
        clips.append({"key": a["key"], "path": path, "words": align(script, heard) if heard else estimate(script, dur), "dur": dur})
    b_paths = {b["key"]: download(b["url"], work / f"{b['key']}.mp4") for b in pkg["b_roll"]}

    # 2. Anclas: cada B-roll y cada texto entra en la primera vez que se dice su palabra (en orden).
    timeline = [(ci, wi, tkey(w["w"])) for ci, c in enumerate(clips) for wi, w in enumerate(c["words"])]

    def locate(anchor: str, after: int) -> int | None:
        k = tkey(anchor)
        found = next((i for i, (_, _, t) in enumerate(timeline) if i >= after and t == k), None)
        return found if found is not None else next((i for i, (_, _, t) in enumerate(timeline) if t == k), None)

    brolls, pos = [], 0
    for b in pkg["b_roll"]:
        i = locate(b["anchor"], pos)
        if i is None:
            print(f"Aviso: nadie dice «{b['anchor']}»; {b['key']} no entra.")
            continue
        pos = i + 1
        ci, wi, _ = timeline[i]
        brolls.append({"clip": ci, "start": clips[ci]["words"][wi]["s"], "cut": float(b["cut_s"]), "path": b_paths[b["key"]]})
    beats, pos = [], 0
    for t in pkg["text_beats"]:
        i = locate(t["anchor"], pos)
        if i is None:
            print(f"Aviso: nadie dice «{t['anchor']}»; el texto «{t['text']}» no entra.")
            continue
        pos = i + 1
        ci, wi, _ = timeline[i]
        until = locate(t["until"], i + 1) if t.get("until") else None
        beats.append({"idx": i, "until": until, "text": t["text"]})

    def global_time(i: int) -> float:
        ci, wi, _ = timeline[i]
        return sum(c["cut_len"] for c in clips[:ci]) + clips[ci]["words"][wi]["s"] - clips[ci]["t0"]

    # 3. Cada toma: recorte, zoom por frase, B-roll encima, flash en los textos, subtítulos.
    label_png(work / "label.png", pkg.get("label", "Dramatización"))
    flash_png(work / "flash.png", 200)
    for c in clips:
        c["t0"] = max(0.0, c["words"][0]["s"] - 0.08)
        c["t1"] = min(c["dur"], c["words"][-1]["e"] + 0.18)
        c["cut_len"] = c["t1"] - c["t0"]
    beat_windows = []
    for bi, b in enumerate(beats):
        start = global_time(b["idx"])
        nxt = global_time(beats[bi + 1]["idx"]) if bi + 1 < len(beats) else sum(c["cut_len"] for c in clips)
        end = global_time(b["until"]) if b["until"] is not None else nxt
        png = work / f"beat{bi}.png"
        beat_png(png, b["text"])
        beat_windows.append((start, end, png, bi > 0))

    parts, offset, piece_n = [], 0.0, 0
    for ci, c in enumerate(clips):
        t0, t1 = c["t0"], c["t1"]
        cuts = [t0] + [w["e"] for w in c["words"][:-1] if re.search(r"[.?:!]$", w["w"])] + [t1]
        over = sorted((b["start"], min(b["start"] + b["cut"], t1), b["path"]) for b in brolls if b["clip"] == ci)
        pieces = []
        for si in range(len(cuts) - 1):
            s, e, cur = cuts[si], cuts[si + 1], cuts[si]
            for os_, oe, bp in over:
                if oe <= cur or os_ >= e:
                    continue
                if os_ > cur:
                    pieces.append(("A", cur, os_))
                pieces.append((bp, max(os_, cur), min(oe, e)))
                cur = min(oe, e)
            if cur < e:
                pieces.append(("A", cur, e))
        vids, used = [], {}
        for src, s, e in pieces:
            d = e - s
            if d < 0.05:
                continue
            piece_n += 1
            outp = work / f"{c['key']}_p{piece_n}.mp4"
            if src == "A":
                ss, srcf = s, c["path"]
            else:
                ss = 0.6 + used.get(src, 0.0)  # salta el arranque quieto de Kling
                used[src] = used.get(src, 0.0) + d
                srcf = src
            sh("ffmpeg", "-y", "-loglevel", "error", "-ss", f"{ss:.3f}", "-i", str(srcf), "-t", f"{d:.3f}", "-an", "-vf",
               motion("A" if src == "A" else "B", piece_n, round(d * FPS), False, ci == 0 and s - t0 < 1.5), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(outp))
            vids.append(outp)
        listf = work / f"{c['key']}_list.txt"
        listf.write_text("".join(f"file '{v}'\n" for v in vids))
        sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listf), "-c", "copy", str(work / f"{c['key']}_v.mp4"))

        # Overlays de esta toma, en su tiempo local.
        dur = c["cut_len"]
        ovs = [(work / "label.png", 0.0, dur)]
        for start, end, png, flash in beat_windows:
            s, e = start - offset, end - offset
            if e > 0 and s < dur:
                ovs.append((png, max(0.0, s), min(dur, e)))
                if flash and 0 <= s < dur:
                    ovs.append((work / "flash.png", s, min(dur, s + 0.1)))
        words = c["words"]
        for gi in range(0, len(words), 3):
            grp = words[gi:gi + 3]
            text = [w["w"].strip(",.:;!¡").upper() for w in grp]
            for k, w in enumerate(grp):
                png = work / f"{c['key']}_cap{gi + k}.png"
                caption_png(png, text, k, accent)
                end = grp[k + 1]["s"] if k + 1 < len(grp) else (words[gi + 3]["s"] if gi + 3 < len(words) else t1)
                ovs.append((png, w["s"] - t0, end - t0))
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(work / f"{c['key']}_v.mp4"), "-ss", f"{t0:.3f}", "-t", f"{dur:.3f}", "-i", str(c["path"])]
        for p, _, _ in ovs:
            cmd += ["-i", str(p)]
        chain, last = [], "0:v"
        for i, (_, s, e) in enumerate(ovs):
            chain.append(f"[{last}][{i + 2}:v]overlay=enable='between(t,{s:.3f},{e:.3f})'[v{i}]")
            last = f"v{i}"
        cmd += ["-filter_complex", ";".join(chain), "-map", f"[{last}]", "-map", "1:a", "-af", "aresample=48000,aformat=channel_layouts=stereo",
                "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(work / f"{c['key']}_final.mp4")]
        sh(*cmd)
        parts.append(work / f"{c['key']}_final.mp4")
        offset += dur
        print(f"{c['key']}: {dur:.1f} s, {len(pieces)} planos")

    # 4. Cierre con la foto del producto.
    img = None
    if pkg["end_card"].get("image_url"):
        img = download(pkg["end_card"]["image_url"], work / "product-image")
        conv = work / "product.png"
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", str(img), str(conv))
        img = conv
    end_card_png(work / "endcard.png", pkg["end_card"], img, accent)
    sh("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-t", str(END_CARD_S), "-i", str(work / "endcard.png"),
       "-f", "lavfi", "-t", str(END_CARD_S), "-i", "anullsrc=r=48000:cl=stereo", "-vf",
       f"scale={2 * W}:{2 * H},zoompan=z='if(lt(on,7),1.15-0.15*on/7,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}",
       "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(work / "endcard.mp4"))
    parts.append(work / "endcard.mp4")

    # 5. Unión, música y compresión para Meta.
    joined = work / "joined.mp4"
    inputs = [x for p in parts for x in ("-i", str(p))]
    fc = "".join(f"[{i}:v][{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=1[v][a]"
    sh("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(joined))
    source = joined
    if args.music:
        music = Path(args.music).expanduser()
        if not music.exists():
            fail(f"no encuentro la música: {music}")
        first_hit = beat_windows[1][0] if len(beat_windows) > 1 else 0.0
        mixed = work / "mixed.mp4"
        mix_music(joined, music, first_hit, mixed, work)
        source = mixed
        print("Música: recuerda usar una pista con licencia comercial para anuncios.")
    encode = ["-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)]
    if watermark:
        # En esta última pasada (ya se recodifica todo): cubre también el cierre, sin otra codificación.
        mark = work / "watermark.png"
        watermark_png(mark, watermark)
        x, y = watermark_xy(probe_duration(source) - END_CARD_S)
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-i", str(mark), "-filter_complex", f"[0:v][1:v]overlay=x='{x}':y='{y}'[v]", "-map", "[v]", "-map", "0:a", *encode)
    else:
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", str(source), *encode)
    print(f"Listo: {out} · {probe_duration(out):.1f} s · {out.stat().st_size / 1024 / 1024:.1f} MB")
    print("Súbelo en DropFlex › Creativos › Videos › «Subir video montado».")


if __name__ == "__main__":
    main()
