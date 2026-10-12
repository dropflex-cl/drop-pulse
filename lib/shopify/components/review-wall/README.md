# review-wall — Reseñas con fotos

## Contenido editable vigente

El MCP permite redactar contenido propio sin reseñas importadas ni pruebas reales. Los campos de `content.ts` son la fuente de verdad vigente; `review_id` y los resúmenes importados son referencias opcionales. El texto propio se guarda en el componente y no cambia las reseñas importadas.

Cada item admite `body`, `name` y `rating` opcional, o `review_id` para reutilizar una reseña. Se muestra desde un item, sin mínimo de reseñas externas ni fotos obligatorias.

## Compatibilidad con reseñas importadas

Muro de reseñas aprobadas con autores anonimizados, fechas y fotos originales. No fabrica
identidades, reacciones, comentarios ni acciones sociales.

No exige un mínimo de reseñas. Si no hay contenido específico,
selecciona hasta 12 reseñas, con fotos primero. Una selección de `dropflex.review_wall.items`
conserva su orden y omite IDs que ya no existen. Una desactivación explícita publicada en
`dropflex.conversion_supports.disabled_components` mantiene el muro oculto.

Mantiene dos columnas en móvil, fotos diferidas y las primeras seis publicaciones a la vista.
«Ver más testimonios» muestra la siguiente tanda; «Ver más» expande textos largos.
Sin JavaScript, todas las reseñas quedan accesibles. Respeta movimiento reducido y conserva
el foco al revelar publicaciones. La vista previa usa los mismos autores y fechas.

Datos: `dropflex.reviews`, `reviews_images`, `review_summary`; textos y selección opcionales
en `review_wall`. La IA puede escribir body/name/rating propios o reutilizar review_id.

La nota y cantidad agregadas usan review-stars, publicada en review_summary, sin requisito de importación o verificación. Las notas individuales conservan su propio valor.
