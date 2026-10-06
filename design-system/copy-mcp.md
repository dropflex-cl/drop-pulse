# Página del producto desde el chat

El contenido recibido con `save_landing_content` se revisa en la pantalla existente. Conserva las tarjetas, previews, edición, imágenes, aprobación y la acción Publicar. No ofrece reescritura con IA del servidor.

Cuando cambió el contexto desde la escritura:

- Título: «Cambió el contexto de tu producto.»
- Texto: «Recupera el contexto en el chat, revisa el contenido y envía los cambios con save_landing_content. Después apruébalos aquí.»
- Sin acción de generación en este aviso.

Se reutilizan `Notice`, `ComponentEditor`, `StickyActions` y sus tokens existentes. Los estados de cada propuesta siguen usando `StatusBadge`.
