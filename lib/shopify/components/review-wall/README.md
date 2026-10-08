# review-wall — Reseñas con fotos

Muro de reseñas aprobadas con autores anonimizados, fechas y fotos originales. No fabrica
identidades, reacciones, comentarios ni acciones sociales.

Se activa por defecto con al menos cuatro reseñas aprobadas. Si no hay contenido específico,
selecciona hasta 12 reseñas, con fotos primero. Una selección de `dropflex.review_wall.items`
conserva su orden y omite IDs que ya no existen. Una desactivación explícita publicada en
`dropflex.conversion_supports.disabled_components` mantiene el muro oculto.

Mantiene dos columnas en móvil, fotos diferidas y las primeras seis publicaciones a la vista.
«Ver más testimonios» muestra la siguiente tanda; «Ver más» expande textos largos.
Sin JavaScript, todas las reseñas quedan accesibles. Respeta movimiento reducido y conserva
el foco al revelar publicaciones. La vista previa usa los mismos autores y fechas.

Datos: `dropflex.reviews`, `reviews_images`, `review_summary`; textos y selección opcionales
en `review_wall`. La IA solo puede seleccionar reseñas, nunca escribirlas.
