"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/df";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { formFields } from "@/lib/copy/form";
import { LISTING } from "@/lib/copy/listing";
import { strictSchema } from "@/lib/copy/page-schema";
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
  facts: StoreFacts;
  accent: string | null;
  catalog: CatalogImage[];
  imagesHref: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (patch: { content: unknown; images?: ImagePick[] }) => void;
}

export function ComponentEditor({ view, facts, accent, catalog, imagesHref, saving, error, onCancel, onSave }: ComponentEditorProps) {
  const listing = view.component === LISTING;
  const def = componentById(view.component);
  const slots = def?.imageSlots ?? [];
  const [draft, setDraft] = useState<unknown>(() => structuredClone(view.content));
  const [picks, setPicks] = useState<ImagePick[]>(view.images);
  const fields = useMemo(() => formFields(strictSchema(view.component)!), [view.component]);
  const Preview = PREVIEWS[view.component];

  const errors = useMemo(() => {
    const parsed = strictSchema(view.component)!.safeParse(draft);
    const map = new Map<string, string>();
    if (!parsed.success) for (const i of parsed.error.issues) if (!map.has(i.path.join("."))) map.set(i.path.join("."), i.message);
    return map;
  }, [draft, view.component]);
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
        <div className="sticky top-0 z-1 -mx-4 bg-background px-4 pb-3">
          <div role="region" aria-label={`Vista previa de ${name}`} tabIndex={0} className="max-h-44 overflow-y-auto rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring lg:max-h-96">
            <StoreFrame accent={accent} scale={0.85}>
              <div className={def?.kind === "block" ? "p-4" : undefined}>
                <Preview content={draft} facts={facts} images={imagesBySlot(picks, catalog)} />
              </div>
            </StoreFrame>
          </div>
        </div>

        <div className="flex flex-col gap-6 pt-2">
          <p className="text-caption text-muted-foreground">
            Las palabras entre llaves, como {"{count}"} o {"{min}"}, las reemplaza tu tienda con datos reales: reseñas, plazos y políticas.
          </p>
          <ComponentForm fields={fields} value={draft} onChange={setDraft} errors={errors} reviews={facts.reviews} />
          {slots.length ? (
            <div className="flex flex-col gap-3 border-t pt-5">
              <h3 className="text-heading">Fotos</h3>
              <SlotImagePicker slots={slots} picks={picks} images={catalog} onChange={setPicks} imagesHref={imagesHref} />
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
            onClick={() => onSave({ content: draft, images: slots.length ? picks : undefined })}
          >
            {listing ? "Guardar y aprobar" : "Guardar y usar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
