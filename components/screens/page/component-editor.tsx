"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/df";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { formFields } from "@/lib/copy/form";
import { LISTING } from "@/lib/copy/listing";
import { baseContentSchema } from "@/lib/copy/page-schema";
import { contentVariants, isVariants, selectVariant, variantsSchema, type LandingSelection } from "@/lib/copy/variants";
import { LandingVariantPicker } from "./landing-variant-picker";
import { componentName } from "@/lib/copy/page-ui";
import { componentById } from "@/lib/shopify/components/catalog";
import type { StoreFacts } from "@/lib/store-preview/facts";
import type { CatalogImage, ImagePick, PageComponentView } from "@/lib/types";
import { ComponentForm } from "./component-form";
import { SlotImagePicker } from "./slot-image-picker";

// La hoja de edición de un componente o de la ficha: la vista previa arriba (se actualiza mientras
// escribes), sus campos y, si lleva fotos, el selector del catálogo del producto. Guardar = aprobar
// y usar en la página. Valida con el mismo esquema que el servidor.

/** Las fotos elegidas por espacio, como URLs (lo que recibe la vista previa). */
export function imagesBySlot(picks: ImagePick[], catalog: CatalogImage[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of picks) {
    const img = catalog.find((i) => i.source === p.source && i.id === p.id);
    if (img) (out[p.slot] ??= []).push(img.src);
  }
  return out;
}

export interface ComponentEditorProps {
  view: PageComponentView;
  selection?: LandingSelection;
  facts: StoreFacts;
  videos?: { id: string; name: string }[];
  accent: string | null;
  catalog: CatalogImage[];
  imagesHref: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (patch: { content: unknown; images?: ImagePick[]; expected_id?: string; expected_updated_at?: string }) => void;
  /** «Volver a escribir con IA»: una escritura nueva solo de este componente (lo demás queda igual). */
  onRewrite?: () => void;
  rewriting?: boolean;
}

export function ComponentEditor({ view, selection = {}, facts, videos, accent, catalog, imagesHref, saving, error, onCancel, onSave, onRewrite, rewriting }: ComponentEditorProps) {
  const [expected] = useState({ expected_id: view.id, expected_updated_at: view.updatedAt });
  const [activeSelection, setActiveSelection] = useState<LandingSelection>(selection);
  const listing = view.component === LISTING;
  const def = componentById(view.component);
  const slots = def?.imageSlots ?? [];
  const [draft, setDraft] = useState<unknown>(() => structuredClone(view.content));
  const [picks, setPicks] = useState<ImagePick[]>(view.images);
  const fields = useMemo(() => formFields(baseContentSchema(view.component)!), [view.component]);
  const Preview = PREVIEWS[view.component];
  const variant = selectVariant(draft, activeSelection);
  const activePicks = variant.images ?? picks;
  const updateDraft = (content: unknown) => setDraft(isVariants(draft) ? draft.map((v) => v.key === variant.key ? { ...v, content } : v) : content);
  const updatePicks = (images: ImagePick[]) => {
    if (isVariants(draft)) setDraft(draft.map((v) => v.key === variant.key ? { ...v, images } : v));
    else setPicks(images);
  };

  const errors = useMemo(() => {
    const parsed = (isVariants(draft) ? variantsSchema(baseContentSchema(view.component)!) : baseContentSchema(view.component)!).safeParse(draft);
    const map = new Map<string, string>();
    if (!parsed.success) for (const i of parsed.error.issues) if (!map.has(i.path.join("."))) map.set(i.path.join("."), i.message);
    return map;
  }, [draft, view.component]);
  const visibleErrors = new Map<string, string>();
  const prefix = isVariants(draft) ? `${draft.findIndex((v) => v.key === variant.key)}.content.` : "";
  for (const [path, message] of errors) if (!prefix || path.startsWith(prefix)) visibleErrors.set(prefix ? path.slice(prefix.length) : path, message);
  const name = componentName(view.component);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5 px-4 pt-2 pb-3">
        <DrawerTitle className="text-heading">{listing ? "Revisar la ficha" : `Editar ${name}`}</DrawerTitle>
        <DrawerDescription className="text-caption text-muted-foreground">
          {listing ? "Lo que ve el comprador arriba del precio y en Google." : "Así se ve en tu tienda. Cambia los textos o las fotos y guarda."}
        </DrawerDescription>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {isVariants(draft) ? <div className="pb-4"><LandingVariantPicker variants={contentVariants(draft)} selection={activeSelection} onChange={setActiveSelection} /><p className="mt-2 text-caption text-muted-foreground">Revisa todas las versiones. Se aprueban juntas al guardar.</p></div> : null}
        <div className="sticky top-0 z-1 -mx-4 bg-background px-4 pb-3">
          <div role="region" aria-label={`Vista previa de ${name}`} tabIndex={0} className="max-h-44 overflow-y-auto rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring lg:max-h-96">
            <StoreFrame accent={accent} scale={0.85}>
              <div className={def?.kind === "block" ? "p-4" : undefined}>
                <Preview content={variant.content} facts={facts} images={imagesBySlot(activePicks, catalog)} />
              </div>
            </StoreFrame>
          </div>
        </div>

        <div className="flex flex-col gap-6 pt-2">
          <p className="text-caption text-muted-foreground">
            Las palabras entre llaves, como {"{count}"} o {"{min}"}, las reemplaza tu tienda con datos reales: reseñas, plazos y políticas.
          </p>
          <ComponentForm fields={fields} value={variant.content} onChange={updateDraft} errors={visibleErrors} reviews={facts.reviews} videos={videos} />
          {slots.length ? (
            <div className="flex flex-col gap-3 border-t pt-5">
              <h3 className="text-heading">Fotos</h3>
              <SlotImagePicker slots={slots} picks={activePicks} images={catalog} onChange={updatePicks} imagesHref={imagesHref} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]">
        {error || errors.size ? (
          <p role="alert" className="text-label font-normal text-destructive">
            {error ?? (errors.size === 1 ? "Corrige el campo marcado para guardar." : `Corrige los ${errors.size} campos marcados para guardar.`)}
          </p>
        ) : null}
        {onRewrite ? (
          <Button variant="ghost" icon="sparkle" className="self-start" loading={rewriting} disabled={saving} onClick={onRewrite}>
            Volver a escribir con IA
          </Button>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            icon="check"
            loading={saving}
            disabled={errors.size > 0}
            onClick={() => onSave({ ...expected, content: draft, images: slots.length && !isVariants(draft) ? picks : undefined })}
          >
            {isVariants(draft) ? "Guardar y aprobar variantes" : listing ? "Guardar y aprobar" : "Guardar y usar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
