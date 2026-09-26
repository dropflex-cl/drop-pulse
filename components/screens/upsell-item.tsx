"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon, notify, notifyUndo } from "@/components/df";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { productsApi } from "@/lib/products/client";
import { cn } from "@/lib/utils";

/**
 * Fila de producto con su menú ⋯: «Mover a Upsell» en Productos, «Quitar de Upsell» en
 * /products/upsell. La fila se esconde al instante y vuelve si falla; el toast trae «Deshacer».
 * El menú es hermano del enlace de la fila (no se anida un botón en un enlace) y se ubica sobre
 * su final: la fila le deja el hueco con `end={<span aria-hidden className="block w-6" />}`.
 */
export function UpsellItem({
  id,
  name,
  upsell,
  className,
  children,
}: {
  id: string;
  name: string;
  /** Si el producto ya es upsell (la acción lo quita). */
  upsell: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const move = async () => {
    setHidden(true);
    try {
      await productsApi.setUpsell(id, !upsell);
    } catch (e) {
      setHidden(false);
      notify(e instanceof Error ? e.message : "No pudimos mover el producto. Intenta de nuevo.");
      return;
    }
    refresh();
    notifyUndo(upsell ? `${name} volvió a Productos.` : `${name} pasó a Upsell.`, async () => {
      try {
        await productsApi.setUpsell(id, upsell);
        setHidden(false);
        refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "No pudimos deshacer el cambio. Intenta de nuevo.");
      }
    });
  };

  if (hidden) return null;
  return (
    <li className={cn("relative", className)}>
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Más opciones: ${name}`}
            title="Más opciones"
            className="absolute top-1/2 right-1 grid size-touch -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon name="more" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={move} className="min-h-touch">
            <Icon name={upsell ? "undo" : "tag"} size="sm" />
            {upsell ? "Quitar de Upsell" : "Mover a Upsell"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
