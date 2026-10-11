"""Empaqueta únicamente el manifiesto, conexión y skill versionados en el repositorio."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
plugin = root / "plugins/dropflex-optimizer"
manifest = json.loads((plugin / "plugin.json").read_text())
files = [plugin / "plugin.json", plugin / ".app.json"]
compatibility = plugin / ".codex-plugin/plugin.json"
if compatibility.exists():
    legacy = json.loads(compatibility.read_text())
    if legacy["name"] != manifest["name"] or legacy["version"] != manifest["version"]:
        raise ValueError("El manifiesto compatible debe conservar la identidad y versión actuales.")
    files.append(compatibility)
files += sorted(path for path in (plugin / "skills").rglob("*") if path.is_file())
if any(path.is_symlink() or not path.resolve().is_relative_to(plugin.resolve()) for path in files):
    raise ValueError("El paquete no admite enlaces ni archivos externos.")
destination = root / "output/plugins" / f"{manifest['name']}-{manifest['version']}.zip"
destination.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, arcname=str(path.relative_to(plugin)))
print(f"Paquete creado: {destination} ({len(files)} archivos)")
