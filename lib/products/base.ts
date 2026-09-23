// La imagen base de un producto: toda generación (ficha, cliente ideal, creativos, anuncios) parte
// de ella. La elegida por el comerciante; si no eligió, la portada de Shopify; si no, la primera en
// uso. Nunca una excluida. Puro: lo usan el servidor (filas) y la pantalla (ReferenceImage).

interface BaseFlags {
  base: boolean;
  cover: boolean;
  excluded: boolean;
}

export function pickBase<T>(items: T[], flags: (item: T) => BaseFlags): T | undefined {
  const usable = items.filter((i) => !flags(i).excluded);
  return usable.find((i) => flags(i).base) ?? usable.find((i) => flags(i).cover) ?? usable[0];
}

/** Las imágenes en uso con la base primero: el orden en que las recibe el modelo. */
export function baseFirst<T>(items: T[], flags: (item: T) => BaseFlags): T[] {
  const base = pickBase(items, flags);
  const rest = items.filter((i) => i !== base && !flags(i).excluded);
  return base ? [base, ...rest] : rest;
}
