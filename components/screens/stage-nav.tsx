"use client";

import { usePathname } from "next/navigation";
import { StageList, type Stage as ListStage } from "@/components/df";
import { STAGE_SEGMENT, productHref } from "@/lib/routes";
import type { Stage, StageKey } from "@/lib/types";

export function stageHref(productId: string, key: StageKey, state: Stage["state"]): string | undefined {
  if (state === "locked") return undefined;
  return productHref(productId, key);
}

/**
 * La ruta del producto. En una pantalla de etapa, esa etapa se marca como actual
 * (la que estaba marcada pasa a disponible), como en el escritorio de la referencia.
 */
export function StageNav({ productId, stages, className }: { productId: string; stages: Stage[]; className?: string }) {
  const pathname = usePathname();
  const onStage = (Object.keys(STAGE_SEGMENT) as StageKey[]).find((k) => pathname.endsWith(`/${STAGE_SEGMENT[k]}`));
  const items: ListStage[] = stages.map((s) => {
    let state = s.state;
    if (onStage) {
      if (s.key === onStage) state = "current";
      else if (s.state === "current") state = "available";
    }
    return { title: s.title, state, desc: s.desc, optional: s.optional, href: stageHref(productId, s.key, s.state) };
  });
  return <StageList stages={items} className={className} />;
}
