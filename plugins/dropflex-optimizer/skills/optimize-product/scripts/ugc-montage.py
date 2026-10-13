#!/usr/bin/env python3
"""Une clips UGC en un MP4 con video y la voz original, sin capas añadidas.

Uso: python3 scripts/ugc-montage.py paquete.json [--out video.mp4] [--work carpeta]
Requisitos: Python 3.9+, ffmpeg y ffprobe. Acepta paquetes v1/v2/v3 y sobres MCP.
Conserva completos los clips hablados, en orden. Los clips de apoyo reemplazan
su imagen durante cut_s, sin usar su audio ni interrumpir la voz. Las anclas se
ubican aproximadamente por el texto del guion; no se transcribe ni se invoca IA.
Ignora captions, textos, cierre, marca, música, look y editing_brief del paquete.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path

PACKAGE_VERSIONS = (1, 2, 3)
W, H, FPS = 720, 1280, 24


def fail(message: str) -> None:
    raise ValueError(message)


def sh(*args: str) -> None:
    result = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
    if result.returncode:
        fail(f"{args[0]} falló:\n{result.stderr.decode(errors='replace')[-1500:]}")


def probe(path: Path) -> dict:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                            capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if result.returncode:
        fail(f"No se pudo leer el clip {path.name}.")
    data = json.loads(result.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if not video:
        fail(f"El clip {path.name} no contiene video.")
    audio = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    durations = [float(s["duration"]) for s in (video, audio) if s and s.get("duration") not in (None, "N/A")]
    duration = max(durations or [float(data.get("format", {}).get("duration", 0))])
    if not math.isfinite(duration) or duration <= 0:
        fail(f"El clip {path.name} no tiene una duración válida.")
    return {"duration": duration, "video_duration": float(video.get("duration") or duration), "has_audio": audio is not None}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if unicodedata.category(c) != "Mn"))


def file_slug(text: str) -> str:
    text = re.sub(r"[\u0300-\u036f]", "", unicodedata.normalize("NFD", text)).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if len(text) <= 40:
        return text or "video"
    cut = text[:41]
    return (cut[:cut.rindex("-")] if "-" in cut else text[:40]).rstrip("-")


def package_name(pkg: dict) -> str:
    if pkg.get("name"):
        return Path(str(pkg["name"])).name
    fmt = pkg.get("format") or ("mascot" if pkg.get("label") in ("Animación", "Animação") else "ugc")
    return f"{file_slug(pkg.get('product', {}).get('title', 'video'))}-{'mascota' if fmt == 'mascot' else 'ugc'}-angulo-{pkg.get('angle', {}).get('slot', 1)}"


def unwrap_package(data: dict) -> dict:
    if "structuredContent" in data:
        data = data["structuredContent"]
    if "data" in data:
        data = data["data"]
    return data.get("package", data)


def download(source: str, work: Path, base: Path) -> Path:
    local = Path(source).expanduser()
    if not local.is_absolute():
        local = base / local
    if local.is_file():
        return local.resolve()
    if not source.startswith("https://"):
        fail("Cada clip debe tener una URL HTTPS o una ruta a un archivo existente.")
    # La caché depende del origen; jamás reutiliza planos con efectos del montaje anterior.
    destination = work / f"source-{hashlib.sha256(source.encode()).hexdigest()[:24]}.mp4"
    if destination.is_file() and destination.stat().st_size:
        return destination
    temporary = destination.with_suffix(".download")
    try:
        with urllib.request.urlopen(source, timeout=120) as response, temporary.open("wb") as target:
            shutil.copyfileobj(response, target)
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        fail("No se pudo descargar un clip. Si los enlaces vencieron, recupera el paquete de nuevo desde DropFlex.")
    return destination


def support_windows(pkg: dict, clips: list[dict], supports: list[dict]) -> list[tuple[int, int, dict]]:
    """Ventanas en cuadros sobre la voz completa; nunca cambia su duración."""
    timeline, offset = [], 0
    for entry, clip in zip(pkg["a_roll"], clips):
        words = entry.get("line", "").split()
        weights = [max(2, len(norm(word))) + 1 for word in words]
        total = sum(weights)
        before = 0
        for word, weight in zip(words, weights):
            timeline.append((norm(word), offset + round(clip["frames"] * before / total)))
            before += weight
        offset += clip["frames"]
    windows, after, previous_end = [], 0, 0
    for entry, support in zip(pkg.get("b_roll", []), supports):
        anchor = norm(entry.get("anchor", ""))
        match = next((i for i in range(after, len(timeline)) if timeline[i][0] == anchor), None)
        if match is None:
            match = next((i for i, item in enumerate(timeline) if item[0] == anchor), None)
        if match is None:
            fail(f"No se encuentra el ancla del clip {entry['key']} en el texto hablado. Corrige el paquete.")
        after = match + 1
        start = timeline[match][1]
        if (pkg.get("opening") or {}).get("insert") == entry["key"]:
            start = 0
        cut = float(entry.get("cut_s", support["duration"]))
        if not math.isfinite(cut) or cut <= 0:
            fail(f"La duración de apoyo de {entry['key']} debe ser positiva.")
        start = max(start, previous_end)
        length = min(max(1, round(cut * FPS)), support["frames"], offset - start)
        if length <= 0:
            fail(f"No queda espacio para el clip {entry['key']} sin cortar la voz. Corrige sus anclas o duraciones.")
        windows.append((start, start + length, support))
        previous_end = start + length
    return windows


def normalize_video(source: Path, destination: Path, frames: int, crf: int) -> None:
    duration = frames / FPS
    sh("ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", "0:v:0", "-an", "-sn", "-dn",
       "-vf", f"setpts=PTS-STARTPTS,fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration={duration:.6f}",
       "-frames:v", str(frames), "-c:v", "libx264", "-preset", "fast", "-crf", str(crf), "-pix_fmt", "yuv420p", "-map_metadata", "-1", str(destination))


def concat_file(paths: list[Path], destination: Path) -> None:
    # Escapa nombres con apóstrofes y rutas de carpetas elegidas por el usuario.
    destination.write_text("".join("file '" + str(path).replace("'", "'\\''") + "'\n" for path in paths))


def montage(pkg: dict, base: Path, work: Path, output: Path, crf: int) -> None:
    if pkg.get("version") not in PACKAGE_VERSIONS:
        fail("El script acepta paquetes versión 1, 2 o 3. Recupera el paquete vigente.")
    if not pkg.get("a_roll"):
        fail("El paquete necesita al menos un clip hablado.")
    work.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    clips, supports = [], []
    for kind, entries, target in (("A", pkg["a_roll"], clips), ("B", pkg.get("b_roll", []), supports)):
        for index, entry in enumerate(entries):
            source = download(entry.get("url") or entry.get("file", ""), work, base)
            facts = probe(source)
            if kind == "A" and not facts["has_audio"]:
                fail(f"El clip hablado {entry['key']} no tiene audio. Recupera un clip con voz.")
            # A conserva todo el video/audio; B usa solo cuadros disponibles y nunca congela el inserto.
            frames = max(1, math.ceil(facts["duration"] * FPS - 1e-6) if kind == "A" else math.floor(facts["video_duration"] * FPS + 1e-6))
            target.append({**facts, "source": source, "frames": frames, "video": work / f"plain-{kind}{index}.mp4", "voice": work / f"voice-{index}.wav"})
    if any(output.resolve() == clip["source"] for clip in clips + supports):
        fail("La salida no puede reemplazar un clip de origen. Elige otro archivo con --out.")
    windows = support_windows(pkg, clips, supports)
    for clip in clips + supports:
        normalize_video(clip["source"], clip["video"], clip["frames"], crf)
    for clip in clips:
        sh("ffmpeg", "-y", "-v", "error", "-i", str(clip["source"]), "-map", "0:a:0", "-vn", "-sn", "-dn",
           "-af", f"asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration={clip['frames'] / FPS:.6f}",
           "-ac", "2", "-c:a", "pcm_s16le", str(clip["voice"]))
    # La imagen cambia a B-roll, mientras la pista de voz permanece completa y en orden.
    parts, offset = [], 0
    for clip in clips:
        finish, cursor = offset + clip["frames"], offset
        pieces = []
        for start, end, support in windows:
            if end <= offset or start >= finish:
                continue
            left, right = max(start, offset), min(end, finish)
            if cursor < left:
                pieces.append((clip, cursor - offset, left - cursor))
            pieces.append((support, left - start, right - left))
            cursor = right
        if cursor < finish:
            pieces.append((clip, cursor - offset, finish - cursor))
        for source, start, length in pieces:
            part = work / f"plain-part-{len(parts)}.mp4"
            sh("ffmpeg", "-y", "-v", "error", "-i", str(source["video"]), "-an", "-sn", "-dn",
               "-vf", f"trim=start_frame={start}:end_frame={start + length},setpts=PTS-STARTPTS",
               "-c:v", "libx264", "-preset", "fast", "-crf", str(crf), "-pix_fmt", "yuv420p", str(part))
            parts.append(part)
        offset = finish
    videos, voices = work / "plain-videos.txt", work / "plain-voices.txt"
    concat_file(parts, videos)
    concat_file([clip["voice"] for clip in clips], voices)
    sh("ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(videos),
       "-f", "concat", "-safe", "0", "-i", str(voices), "-map", "0:v:0", "-map", "1:a:0", "-sn", "-dn",
       "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-map_metadata", "-1", "-movflags", "+faststart", str(output))
    print(f"Listo: {output} · {offset / FPS:.1f} s · {output.stat().st_size / 1024 / 1024:.1f} MB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Une clips hablados y de apoyo: solo video y voz original.")
    parser.add_argument("package", help="Paquete JSON de DropFlex o sobre MCP.")
    parser.add_argument("--out", help="MP4 de salida; por defecto, <name>.mp4 junto al paquete.")
    parser.add_argument("--work", help="Carpeta de trabajo; por defecto, <paquete>-montaje.")
    parser.add_argument("--crf", type=int, choices=range(0, 52), default=25, metavar="0-51", help="Calidad H.264 (por defecto: 25).")
    args = parser.parse_args()
    try:
        for tool in ("ffmpeg", "ffprobe"):
            if not shutil.which(tool):
                fail(f"Falta {tool}. Instala FFmpeg para montar el video.")
        path = Path(args.package).expanduser().resolve()
        pkg = unwrap_package(json.loads(path.read_text()))
        work = Path(args.work).expanduser().resolve() if args.work else path.with_name(path.stem + "-montaje")
        output = Path(args.out).expanduser().resolve() if args.out else path.parent / f"{package_name(pkg)}.mp4"
        montage(pkg, path.parent, work, output, args.crf)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
