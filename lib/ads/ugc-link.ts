/** Cada anuncio debe dirigir a una sola combinación de ángulo/hook. Puro. */
export function ugcDestination(base: string, media: { ugc_provenance?: Record<string, unknown>; content_provenance?: Record<string, unknown> }[]): string {
  const selectors = media.flatMap((m) => {
    const p = m.content_provenance?.landing_angle_id ? m.content_provenance : m.ugc_provenance;
    return p?.landing_angle_id && p?.landing_hook_id ? [{ angle: String(p.landing_angle_id), hook: String(p.landing_hook_id) }] : [];
  });
  if (!selectors.length) return base;
  if (new Set(selectors.map((s) => `${s.angle}:${s.hook}`)).size > 1) throw new Error("Separa los creativos de distintos ángulos o ganchos en anuncios distintos para dirigir a la landing correspondiente.");
  const { angle, hook } = selectors[0];
  if (![angle, hook].every((v) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v))) throw new Error("Revisa los selectores de landing del creativo.");
  const url = new URL(base); url.searchParams.set("df_angle", angle); url.searchParams.set("df_hook", hook);
  return url.toString();
}
