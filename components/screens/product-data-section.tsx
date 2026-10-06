"use client";

import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, type ProductData } from "@/lib/products/product-data";
import { useEffect, useRef, useState } from "react";

// Datos del producto guardados desde el chat o completados por el comerciante, con autoguardado.

const AUTOSAVE_MS = 1500;

export function ProductDataSection({
  productId,
  value,
  onSaved,
}: {
  productId: string;
  value?: ProductData;
  onSaved: (d: ProductData) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>();
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
      <p className="text-small text-muted-foreground">Completa el nombre y la descripción. Revisa que describan lo que el producto hace.</p>
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
    </section>
  );
}
