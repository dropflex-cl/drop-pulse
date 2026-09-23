-- Color de acento de la página del producto (etapa Textos): botones y detalles de la tienda. Lo elige
-- el comerciante de una paleta con contraste WCAG AA (lib/copy/accent.ts) o a mano. Se guarda en hex
-- de 6 dígitos en minúsculas; lo usará la etapa Publicar. null = todavía no se eligió.
alter table public.products
  add column page_accent_color text check (page_accent_color ~ '^#[0-9a-f]{6}$');
