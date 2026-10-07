# Referencia visual en el chat

Tarjeta MCP inline, mobile first, con los colores claro/oscuro, tipografía, espaciado, radios y área táctil de `tokens.json`. Muestra la foto completa del producto sin recorte ni transformación. No muestra estados de aprobación del asset.

- Título: «Referencia original del producto».
- Acción principal: «Adjuntar referencia al chat»; después de adjuntar, «Volver a adjuntar referencia».
- Acción secundaria: «Abrir fotografía original».
- Tras adjuntar: «Revisar referencia en el chat», visible si el host admite mensajes desde la tarjeta; solo ese toque solicita una nueva inspección sin generación.
- Ayuda inicial: «Revisa la foto original y adjúntala antes de generar».
- Durante la subida: «Adjuntando la referencia original…», acción deshabilitada.
- Resultado: «Archivo adjunto a ChatGPT. Revisa la referencia en un nuevo turno antes de generar»; se conserva al actualizar la tarjeta y al restaurar su estado.
- Sin APIs de archivo: «Este cliente no permite adjuntar la referencia desde la tarjeta. Abre la original y adjúntala al chat».
- Si cambian los bytes: «La referencia cambió. Recupera el contexto visual antes de adjuntarla».

La ayuda y los errores usan `role="status"`. Botón y enlace tienen al menos `size-touch`. La acción verifica el hash y adjunta; no genera ni aprueba imágenes, ni envía un mensaje automáticamente.
