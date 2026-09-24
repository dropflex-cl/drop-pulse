-- GIFs de la página (docs/spec-imagenes.md › GIFs): el espacio «gifs» de la etapa Imágenes acepta
-- animaciones (GIF, WebP animado y APNG). Se guardan re-codificadas como WebP animado en el mismo
-- bucket page-media, así que solo cambia lo que el bucket deja subir. page_images no cambia: el
-- espacio es texto y el orden va en `position`, igual que la galería.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/apng']
where id = 'page-media';
