# Montaje local: solo video y voz

`scripts/ugc-montage.py` es el montaje vigente. La skill `dropflex-capcut` está deprecada y no se selecciona automáticamente. Remotion y el worker de render siguen retirados.

1. Recupera `get_ugc_montage` o descarga el paquete JSON desde Videos. Acepta v1/v2, el paquete directo y sobres MCP (`data.package` o `structuredContent.data.package`). Los enlaces duran 24 h; recuperarlos de nuevo no genera clips.
2. Ejecuta `python3 scripts/ugc-montage.py paquete.json --out video.mp4`. Requiere Python 3.9+, FFmpeg y FFprobe. La skill de optimización incluye una copia del script para tareas locales sin el repositorio.
3. Entrega un solo MP4 H.264/AAC, vertical 720×1280, 24 fps, con los clips hablados completos en el orden del paquete y su voz original. El script normaliza dimensiones y audio para unir fuentes distintas, sin recortar la voz ni modificar su volumen. Conserva el encuadre con bandas cuando la proporción difiere; no añade zoom.
4. Los clips de apoyo sustituyen la imagen durante `cut_s`, manteniendo la voz debajo y descartando su audio. `anchor` los ubica aproximadamente según las palabras del guion, sin Whisper ni IA. El inserto declarado en `opening.insert` comienza en el cuadro 0. No hay sincronización precisa palabra por palabra. La duración se limita a los cuadros disponibles y al espacio de voz restante; si no cabe un clip o su ancla no existe, falla con el dato que debe corregirse.
5. Sube el MP4 en Video final para revisarlo. Subir, elegir su uso y publicar siguen siendo acciones distintas; el montaje no usa proveedores ni gasta créditos.

No añade captions, subtítulos, textos, cierre, música, marca de agua, efectos, grano ni filtros de teléfono. Conserva los campos antiguos del contrato v2 como datos compatibles, pero ignora `text_beats`, `end_card`, `accent_color`, `watermark`, `look` y las sugerencias de capas en `editing_brief`. Un texto necesario para entender el anuncio debe estar en la voz o en los clips. El script no elimina textos o música ya incrustados en un archivo de origen.

`seconds` representa una duración prevista, no un recorte de la toma hablada. La salida dura la suma de los clips hablados reales, con un ajuste de hasta un cuadro por toma para normalizar a 24 fps; no suma una tarjeta final. No transcribe, no crea imágenes de texto y no mezcla pistas adicionales. Una toma hablada sin audio produce un error.

`--work` elige la carpeta de trabajo; `--crf` controla la calidad (25 por defecto). Solo se reutilizan descargas del mismo origen. Cada ejecución rehace los planos simples para no recuperar zooms o captions de una carpeta histórica. No acepta los flags anteriores `--music`, `--watermark`, `--no-watermark`, `--look` ni `--fresh`. La salida no puede reemplazar un clip de origen.

El script canónico vive en `scripts/ugc-montage.py`. `scripts/package-dropflex-plugin.py` copia ese archivo a la skill antes de empaquetarla; el MCP lo expone como recurso de la skill. Los cambios locales y el ZIP no acreditan despliegue ni disponibilidad en un catálogo de cliente ya importado.

Verificación local:

```bash
python3 scripts/test-ugc-montage.py
npm run pi:contracts
npx vitest run lib/video/video.test.ts lib/product-intelligence/ugc.local.test.ts lib/product-intelligence/mcp-skills.test.ts
```
