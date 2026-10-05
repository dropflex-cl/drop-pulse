"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/components/df";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, type ProductData } from "@/lib/products/product-data";

// Información base › Datos del producto: el nombre y la descripción que recibe la estrategia (DATOS DEL
// PRODUCTO en el mega prompt). Los identifica la IA desde la imagen base y lo que sabe el comerciante; él
// los corrige aquí y se guardan solos.

const AUTOSAVE_MS = 1500;

export function ProductDataSection({
  productId,
  value,
  identifying,
  onIdentify,
  onSaved,
}: {
  productId: string;
  value?: ProductData;
  identifying: boolean;
  onIdentify: () => void;
  onSaved: (d: ProductData) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>();
  const [askRedo, setAskRedo] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Una identificación nueva reemplaza lo que se ve.
  const stamp = value?.updated_at;
  const [shownFor, setShownFor] = useState(stamp);
  if (stamp !== shownFor) {
    setShownFor(stamp);
    setName(value?.name ?? "");
    setDescription(value?.description ?? "");
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = (next: { name: string; description: string }) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setState("saving");
      setError(undefined);
      try {
        const { productData } = await productsApi.saveProductData(productId, next);
        setShownFor(productData.updated_at);
        onSaved(productData);
        setState("saved");
      } catch (e) {
        setState("error");
        setError(e instanceof ProductApiClientError ? e.message : "No pudimos guardar. Revisa tu conexión.");
      }
    }, AUTOSAVE_MS);
  };

  const field = "w-full rounded-md border border-input bg-background p-2.5 text-body font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";

  return (
    <section aria-labelledby="datos-producto" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="datos-producto" className="text-heading">
          Datos del producto
        </h2>
        {value ? (
          <span className="text-caption text-muted-foreground" aria-live="polite">
            {state === "saving" ? "Guardando…" : state === "saved" ? "Guardado" : value.source === "ai" ? "Identificado con IA" : "Editado por ti"}
          </span>
        ) : null}
      </div>
      {identifying ? (
        <p role="status" className="flex items-center gap-2 text-small">
          <Icon name="loader" size="sm" className="motion-exempt animate-spin text-muted-foreground" />
          La IA está mirando las imágenes y lo que sabes del producto.
        </p>
      ) : !value ? (
        <p className="text-small text-muted-foreground">
          La IA mira la imagen base y lo que sabes del producto, y escribe su descripción. Esa descripción es lo que recibe la estrategia: revísala antes de generarla.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-label">
            Producto
            <input
              value={name}
              maxLength={PRODUCT_NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                save({ name: e.target.value, description });
              }}
              className={`h-control ${field}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Descripción
            <textarea
              rows={8}
              value={description}
              maxLength={PRODUCT_DESCRIPTION_MAX}
              onChange={(e) => {
                setDescription(e.target.value);
                save({ name, description: e.target.value });
              }}
              className={`min-h-11 resize-y ${field}`}
            />
          </label>
          {error ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error}
            </p>
          ) : null}
          {askRedo ? (
            <div role="group" aria-label="Volver a identificar" className="flex flex-col gap-2 rounded-md bg-muted p-3">
              <p className="text-label font-normal">La IA vuelve a escribir el nombre y la descripción: se reemplaza lo que editaste.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" onClick={() => setAskRedo(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  icon="sparkle"
                  onClick={() => {
                    setAskRedo(false);
                    onIdentify();
                  }}
                >
                  Volver a identificar
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" icon="sparkle" className="self-start" onClick={() => (value.source === "merchant" ? setAskRedo(true) : onIdentify())}>
              Volver a identificar
            </Button>
          )}
        </>
      )}
    </section>
  );
}
