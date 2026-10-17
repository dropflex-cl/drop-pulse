# Ritmo y superficies de la ficha de tienda

La ficha alterna zonas de lectura y dos hitos sólidos: hero comercial y confianza. El acento vigente del producto da continuidad; fotos, reseñas, comparación y preguntas conservan su fondo de lectura. No modifica el diseño de la app.

## Tokens de tienda

Se declaran en `.df` de `df-components.css`, derivados del acento existente, sin nuevos datos del producto:

- `--df-tone-anchor`: `#16181d`, tinta neutra de la tienda; `--df-tone-paper`: `#ffffff`.
- `--df-tone-wash`: acento al 6 % sobre `--df-bg`; `--df-tone-soft`: acento al 12 % sobre `--df-bg`.
- `--df-tone-deep`: acento al 32 % sobre tinta. Incluso con acento blanco, el texto blanco mantiene más de 6:1. Texto secundario: papel al 90 % sobre ese fondo. Las tarjetas interiores usan papel al 6 % y borde al 24 %.
- Ondas: alto `--df-title-gap` (32/48 px), ancho con exceso de `--df-gap` por lado, máscara vectorial con dos curvas de distinta opacidad. Color acento al 10 % sobre transparente en zonas claras, papel al 8 % en zonas sólidas.
- Padding de panel: `--df-rich-space` vertical y `--df-rich-pad` horizontal. Radio `--df-radius-lg`. Margen lateral `--df-gutter`. Todos ya pertenecen a la escala de tienda.

## Aplicación

Problema: fondo suave y tarjetas del fondo del tema. Mecanismo: panel suave; en escritorio, imagen y explicación comparten dos columnas. Hero y cifras: panel sólido, botón de papel con texto de tinta del panel. Confianza: panel sólido, con políticas reales y enlaces subrayados. Un fondo o texto configurado explícitamente en el editor conserva su diseño y desactiva el tono automático del problema o hero.

Las ondas solo viven en el problema, mecanismo y confianza. Son apoyo decorativo, `aria-hidden`, sin eventos ni contenido. No flotan sobre texto: se sitúan al pie del panel, detrás del contenido y dentro del recorte.

## Movimiento

Se reutiliza `df-motion.js`: encabezados y tarjetas entran una vez al desplazarse, con `--df-dur-reveal` y el escalonado existente. Las ondas permanecen visibles y estáticas, incluso al final de la página. Sin bucles, parallax, animaciones de precios ni nuevas dependencias. Sin JS todo queda visible; el editor, `df_motion=off` y `prefers-reduced-motion` conservan la composición estática. El foco sigue siendo visible en cada superficie.

La presentación usa el acento, contenido, archivos y políticas ya guardados. No cambia contratos de datos, selección, orden, exclusiones, MCP ni generación de contenido.
