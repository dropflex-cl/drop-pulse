---
name: dropflex-capcut
description: Skill deprecada de CapCut para DropFlex. Solo sirve para reconocer invocaciones antiguas y dirigirlas al montaje local de clips con Python/FFmpeg; no editar en CapCut ni añadir captions o capas.
---

# DropFlex a CapCut: deprecada

No uses el flujo anterior de CapCut. El montaje vigente une los clips hablados y de apoyo en un único MP4 con la voz original, sin captions, textos, música, zooms, efectos, marca de agua ni cierre añadido.

Recupera el JSON de `get_ugc_montage` o el paquete descargado de Videos. Usa `scripts/ugc-montage.py` del repositorio DropFlex o la copia `scripts/ugc-montage.py` incluida en la skill de optimización:

```bash
python3 /ruta/ugc-montage.py /ruta/paquete.json --out /ruta/video.mp4
```

Requiere Python 3.9+, FFmpeg y FFprobe. Conserva completos los clips hablados y su voz; el apoyo sustituye la imagen sin usar su audio. Las anclas se ubican aproximadamente desde el guion, sin transcripción. Los enlaces duran 24 h; renovarlos no autoriza generar clips.

Si falta el script, recupera la skill de optimización vigente; no retomes CapCut como alternativa automática. Subir el MP4, elegir su uso y publicar siguen siendo acciones distintas.
