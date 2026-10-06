"use client";

import { landingQuery, selectVariant, variantLabel, type LandingSelection, type LandingVariant } from "@/lib/copy/variants";

export function LandingVariantPicker({ variants, selection, onChange }: {
  variants: LandingVariant[]; selection: LandingSelection; onChange: (selection: LandingSelection) => void;
}) {
  const chosen = selectVariant(variants, selection);
  const index = Math.max(0, variants.findIndex((v) => v.angle_id === chosen.angle_id && v.hook_id === chosen.hook_id));
  const query = landingQuery(variants[index] ?? {});
  return (
    <label className="flex flex-col gap-2 text-label">
      Versión de la página
      <select className="h-touch w-full rounded-md border bg-background px-3 text-row" value={index}
        onChange={(event) => onChange(variants[Number(event.target.value)])}>
        {variants.map((v, i) => <option key={`${v.angle_id}:${v.hook_id}`} value={i}>{variantLabel(v)}</option>)}
      </select>
      <span className="break-all text-caption font-normal text-muted-foreground">{query ? `Parámetros del enlace: ?${query}` : "Se muestra al entrar sin parámetros o con una combinación desconocida."}</span>
    </label>
  );
}
