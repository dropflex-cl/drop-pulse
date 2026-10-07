# Referencia visual en el chat

Tarjeta MCP inline, mobile first, con los colores claro/oscuro, tipografía, espaciado, radios y área táctil de `tokens.json`. Muestra la foto completa del producto sin recorte ni transformación. No muestra estados de aprobación del asset.

- Título: «Referencia original del producto».
- Acción principal: «Adjuntar referencia al chat»; después de adjuntar, «Volver a adjuntar referencia».
- Acción secundaria: «Abrir fotografía original».
- Ayuda inicial: «Revisa la foto original y adjúntala antes de generar».
- Durante la subida: «Adjuntando la referencia original…», acción deshabilitada.
- Resultado: «Referencia adjunta al chat. Puedes pedir que la revise antes de generar».
- Sin APIs de archivo: «Este cliente no permite adjuntar la referencia desde la tarjeta. Abre la original y adjúntala al chat».
- Si cambian los bytes: «La referencia cambió. Recupera el contexto visual antes de adjuntarla».

La ayuda y los errores usan `role="status"`. Botón y enlace tienen al menos `size-touch`. La acción verifica el hash y adjunta; no genera ni aprueba imágenes, ni envía un mensaje automáticamente.
