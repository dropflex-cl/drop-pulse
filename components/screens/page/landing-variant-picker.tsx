"use client";

import { selectVariant, type LandingSelection, type LandingVariant } from "@/lib/copy/variants";

export function LandingVariantPicker({ variants, selection, onChange }: {
  variants: LandingVariant[]; selection: LandingSelection; onChange: (selection: LandingSelection) => void;
}) {
  const chosen = selectVariant(variants, selection);
  const index = Math.max(0, variants.findIndex((v) => v.angle_id === chosen.angle_id && v.hook_id === chosen.hook_id));
  return (
    <label className="flex flex-col gap-2 text-label">
      Versión de la página
      <select className="h-touch w-full rounded-md border bg-background px-3 text-row" value={index}
        onChange={(event) => onChange(variants[Number(event.target.value)])}>
        {variants.map((v, i) => <option key={`${v.angle_id}:${v.hook_id}`} value={i}>{v.key === "default" ? "Página principal" : `Versión ${i}`} {(v.content as { title?: string })?.title ? `· ${(v.content as { title: string }).title}` : ""}</option>)}
      </select>

    </label>
  );
}
