/** Cada componente conserva JSON y pools en una sola petición; el manifiesto se activa al final. */
export function metafieldBatches<T extends { namespace: string; key: string }>(
  list: T[],
  atomicKeys: string[] = [],
  atomicGroups: string[][] = [],
): T[][] {
  const used = new Set<T>();
  const select = (keys: string[]) =>
    list.filter((m) => m.namespace === "dropflex" && keys.includes(m.key));
  const activation = select(atomicKeys);
  const groups = atomicGroups.map(select).filter((g) => g.length);
  for (const group of [...groups, activation]) {
    if (group.length > 25)
      throw new Error(
        "Un componente supera 25 metafields. Reduce sus medios y reintenta.",
      );
    for (const entry of group) {
      if (used.has(entry))
        throw new Error("Un metafield pertenece a dos grupos de publicación.");
      used.add(entry);
    }
  }
  const other = list.filter((m) => !used.has(m));
  const batches: T[][] = [];
  let current: T[] = [];
  for (const group of [...other.map((m) => [m]), ...groups]) {
    if (current.length + group.length > 25) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) batches.push(current);
  if (activation.length) batches.push(activation);
  return batches;
}
