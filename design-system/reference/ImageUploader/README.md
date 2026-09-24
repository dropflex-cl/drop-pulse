# ImageUploader

Agrega imágenes de referencia desde el equipo o desde un enlace.

- **Qué provees:** `mode` (`file` | `url`), `state` (`idle` | `dragover` | `error` | `fetching`), `items` (cola de subida: `{ name, state: 'uploading' | 'done' | 'error', progress, detail }`), `url`, `urlError`, `compact` (texto corto en móvil), `hideModes`.
- **Desde tu equipo:** zona de arrastre en escritorio ("Arrastra imágenes aquí o elige desde tu equipo") y botón de elegir en móvil, que abre la cámara o la galería. Acepta JPG, PNG y WEBP, hasta 10 MB cada una y 10 por producto. Se pueden elegir varias.
- **Desde un enlace:** campo con "Traer". El servidor descarga la imagen y valida tipo y tamaño. Los errores dicen qué hacer: "Ese enlace es una página, no una imagen. Abre la imagen y copia su dirección."
- Cada archivo tiene su fila con progreso; un error no detiene a los demás; subir se puede cancelar.
- En móvil vive en una hoja inferior que se abre desde el tile "Agregar"; en escritorio, fijo bajo la grilla de referencias.
- Pegar una imagen con Ctrl/Cmd+V en la página también la sube.
- **Otros usos:** los textos (`pickLabel`, `dragLabel`, `compactLabel`, `formats`, `noun`, `urlLabel`, `urlHint`) y los tipos aceptados (`accept`) se ajustan por props. En Imágenes › GIFs agrega animaciones: GIF, WebP animado o APNG, desde el equipo o desde un enlace.
