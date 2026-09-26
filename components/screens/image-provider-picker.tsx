"use client";

import Link from "next/link";
import { useState } from "react";
import { SegmentedControl, linkClasses, notify } from "@/components/df";
import { money } from "@/lib/format";
import { IMAGE_COST_BY_PROVIDER, IMAGE_PROVIDER_NAME, costSource, type ImageProvider, type ImageProviderChoice, type ImageStage } from "@/lib/image-provider";
import { ProductApiClientError, imageProviderApi } from "@/lib/products/client";

// Con qué se generan las imágenes de esta pantalla (Higgsfield o Gemini, lib/image-provider.ts). La
// elección se guarda por etapa: la próxima vez la pantalla abre con la misma. Lo que ya se está
// generando sigue con el proveedor con que empezó.

export function ImageProviderPicker({ stage, choice, onChange }: { stage: ImageStage; choice: ImageProviderChoice; onChange: (choice: ImageProviderChoice) => void }) {
  const [saving, setSaving] = useState(false);
  const usable = choice.options.filter((o) => o.available);
  if (!choice.value || !usable.length) return null;
  const missingHiggsfield = choice.options.some((o) => o.id === "higgsfield" && !o.available);

  async function pick(value: string) {
    const provider = value as ImageProvider;
    if (provider === choice.value || saving) return;
    const before = choice;
    onChange({ ...choice, value: provider, saved: provider });
    setSaving(true);
    try {
      onChange(await imageProviderApi.save(stage, provider));
      notify(`Las próximas imágenes se generan con ${IMAGE_PROVIDER_NAME[provider]}`);
    } catch (e) {
      onChange(before);
      notify(e instanceof ProductApiClientError ? e.message : "No pudimos guardar tu elección. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-label font-normal text-muted-foreground">Generar con</span>
      {usable.length > 1 ? (
        <SegmentedControl label="Proveedor de imágenes" value={choice.value} options={usable.map((o) => ({ value: o.id, label: o.name }))} onChange={pick} />
      ) : (
        <span className="text-label">{IMAGE_PROVIDER_NAME[choice.value]}</span>
      )}
      <span className="text-caption text-muted-foreground tabular-nums">{`≈ ${money(IMAGE_COST_BY_PROVIDER[choice.value], "USD")} por imagen${costSource(choice.value)}`}</span>
      {missingHiggsfield ? (
        <Link href="/settings#creativos" className={linkClasses}>
          Conecta Higgsfield para elegir
        </Link>
      ) : null}
    </div>
  );
}
