/** metafieldsSet es atómico por petición: contenido e índices deben viajar con sus archivos. */
export function metafieldBatches<T extends { namespace: string; key: string }>(list: T[], atomicKeys: string[] = []): T[][] {
  const keys = new Set(atomicKeys);
  const atomic = list.filter((m) => m.namespace === "dropflex" && keys.has(m.key));
  if (atomic.length > 25) throw new Error("La publicación de variantes supera 25 metafields. Reduce los componentes y reintenta.");
  const other = list.filter((m) => !atomic.includes(m));
  const batches: T[][] = [];
  for (let i = 0; i < other.length; i += 25) batches.push(other.slice(i, i + 25));
  if (atomic.length) batches.push(atomic);
  return batches;
}
