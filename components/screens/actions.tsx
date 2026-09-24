"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, notify, type NativeButtonProps } from "@/components/df";
import { productsApi } from "@/lib/products/client";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Trae los productos activos de Shopify y borra, con todo lo suyo, los que se eliminaron allá. */
export function SyncProductsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      icon="refresh"
      loading={loading}
      // TopBar deja 4px a la derecha (sus acciones son IconButton); un botón con fondo necesita
      // 12px más para cerrar en el mismo borde de 16px que el título y la lista.
      className="mr-3 lg:mr-0"
      onClick={async () => {
        setLoading(true);
        try {
          const { created, deleted, pending } = await productsApi.sync();
          const parts = [
            created && plural(created, "producto nuevo", "productos nuevos"),
            deleted && `${plural(deleted, "eliminado", "eliminados")} porque ya no están en Shopify`,
          ].filter(Boolean);
          notify(
            (parts.length ? `Sincronizado: ${parts.join(", ")}.` : "Todo al día con Shopify.") +
              (pending ? ` Faltan ${pending}: sincroniza otra vez para traerlos.` : ""),
          );
          router.refresh();
        } catch (e) {
          notify(e instanceof Error ? e.message : "No pudimos sincronizar con Shopify. Intenta de nuevo.");
        } finally {
          setLoading(false);
        }
      }}
    >
      Sincronizar
    </Button>
  );
}

/** Reintentar una publicación con error. */
export function RetryPublishButton(props: Omit<NativeButtonProps, "onClick">) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...props}
      loading={loading}
      onClick={() => {
        setLoading(true);
        window.setTimeout(() => {
          setLoading(false);
          notify("Reintento enviado. Te avisamos en Hoy cuando quede publicado.");
        }, 800);
      }}
    />
  );
}
