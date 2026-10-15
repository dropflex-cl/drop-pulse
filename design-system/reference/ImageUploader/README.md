# ImageUploader

Agrega imágenes de referencia desde el equipo o desde un enlace.

- **Qué provees:** `mode` (`file` | `url`), `state` (`idle` | `dragover` | `error` | `fetching`), `items` (cola de subida: `{ name, state: 'uploading' | 'done' | 'error', progress, detail }`), `url`, `urlError`, `compact` (texto corto en móvil), `hideModes`.
- **Desde tu equipo:** zona de arrastre en escritorio ("Arrastra imágenes aquí o elige desde tu equipo") y botón de elegir en móvil, que abre la cámara o la galería. Acepta JPG, PNG y WEBP, hasta 10 MB cada una y 10 por producto. Se pueden elegir varias.
- **Desde un enlace:** campo con "Traer". El servidor descarga la imagen y valida tipo y tamaño. Los errores dicen qué hacer: "Ese enlace es una página, no una imagen. Abre la imagen y copia su dirección."
- Cada archivo tiene su fila con progreso; un error no detiene a los demás; subir se puede cancelar.
- En móvil vive en una hoja inferior que se abre desde el tile "Agregar"; en escritorio, fijo bajo la grilla de referencias.
- Pegar una imagen con Ctrl/Cmd+V en la página también la sube.
- **Otros usos:** los textos (`pickLabel`, `dragLabel`, `compactLabel`, `formats`, `noun`, `urlLabel`, `urlHint`) y los tipos aceptados (`accept`) se ajustan por props. En Imágenes › GIFs agrega animaciones: GIF, WebP animado o APNG, desde el equipo o desde un enlace.

## GIFs en Página

En `/products/[id]/copy`, la tarjeta **GIFs** permite completar sus medios junto al contenido guardado. Reutiliza `ImageUploader`, `Button` e `IconButton` con los tokens existentes. Los archivos y su orden se comparten entre todas las versiones; los textos pertenecen a la versión elegida. La carga no modifica la visibilidad del componente ni publica.

- Acción móvil: **Subir GIF**. Modos: **Desde tu equipo** y **Desde un enlace**.
- Formatos: **GIF, WebP animado o APNG · hasta 25 MB · mínimo 240 px por lado**. Un archivo por carga; hasta cinco elegidos.
- Enlace: **Enlace del GIF**, ayuda **Pega el enlace directo al archivo animado.**
- Ayuda: **El GIF 1 acompaña al texto 1, y así sucesivamente. Los archivos y su orden se comparten entre todas las versiones. Publica para mostrar los cambios en tu tienda.**
- Vacío: **Sube un GIF para mostrar el producto en uso. Sin GIFs, este componente no aparece en tu tienda.**
- Cada GIF muestra su número y el título del texto correspondiente. Acciones: **Mover GIF N antes**, **Mover GIF N después** y **Quitar GIF N**. Quitar conserva el archivo en **GIFs guardados sin usar**, con **Usar GIF** para elegirlo otra vez.
- Contador: **N de 5 GIFs en la página**. Límite: **Ya usas 5 GIFs. Quita uno para agregar otro.**
- Avance: **Subiendo GIF…** y **Guardando GIFs…**, con `role="status"`. Errores con `role="alert"` y el mensaje concreto del servidor.
- Confirmaciones: **GIF agregado a la página**, **GIF quitado de la página**, **Orden de los GIF guardado**.
