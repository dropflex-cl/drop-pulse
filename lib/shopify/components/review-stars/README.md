# review-stars — Estrellas de reseñas

`review-stars.rating` y `review-stars.count` son la fuente editable de la valoración agregada de toda la PDP: Google, Estrellas, Hero y cifras, muro, UGC, FAQ y prueba social. `label` controla el texto junto a las estrellas. Guarda estos campos con `save_landing_content`; no requiere conexión con Google, importación de reseñas, evidencia ni verificación.

La nota acepta 0–5 y la cantidad un entero no negativo. Cada variante comercial por ángulo/hook conserva su dirección; hook exacto → ángulo → default. Publicación y preview aplican la misma selección. Cuando faltan esos campos se usan los campos antiguos de Hero y cifras como respaldo compatible y luego el resumen importado, sin editar las reseñas originales. `review_summary` publica el agregado compartido y sus variantes; no es otra fuente editable.

El bloque está bajo Google y antes de badges y título. En modo compacto muestra «4,7 · 1.234 reseñas». `{rating}` usa coma y un decimal; `{count}`, punto de miles. Un label propio sin tokens puede mostrarse sin cifras. No hay mínimos de reseñas ni proporciones que sustituyan automáticamente el texto guardado.

Las estrellas son SVG con relleno proporcional, con área táctil y foco del tema. El ancla lleva a las reseñas si están en la página; sin destino permanece informativo. Un solo aria-label describe nota y cantidad. Las calificaciones de testimonios individuales se conservan y no se reemplazan por la nota agregada.

La IA obtiene el contrato con `get_landing_content` y el contexto con `get_component_generation_context`; el contexto identifica `rating_source`. Respeta variantes, imágenes omitidas, descartes y visibilidad. Guardar no publica ni genera.

La nota agregada está limitada a **4,4–4,9**, inclusive, con un decimal. El guardado rechaza valores fuera del rango; los agregados anteriores o importados se limitan al extremo más cercano al mostrarse y publicarse. Las notas individuales permanecen intactas.
