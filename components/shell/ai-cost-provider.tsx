"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AiCostCard, AiCostChip, AiRunList, IconButton, linkClasses } from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { count, money } from "@/lib/format";
import type { ProductAiCost } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDesktop } from "./use-desktop";

// Costo de IA del producto (design-system/arquitectura.md › 11): el layout del producto lo pide sin
// esperarlo (llega por streaming y no frena la pantalla) y cada pantalla de etapa lo muestra en su barra
// superior (AiCostChip) cuando llega. El detalle (tarjeta completa e
// historial) se abre como hoja inferior en móvil y como panel derecho en escritorio.

interface AiCostState {
  cost: ProductAiCost | null;
  openDetail: () => void;
}

const Ctx = createContext<AiCostState | null>(null);

export function AiCostProvider({ cost: pending, children }: { cost: Promise<ProductAiCost | null>; children: React.ReactNode }) {
  // Mientras llega (o si no se pudo leer) no se dibuja; al refrescar se mantiene el anterior hasta el nuevo.
  const [cost, setCost] = useState<ProductAiCost | null>(null);
  useEffect(() => {
    let live = true;
    pending.then(
      (c) => live && setCost(c),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [pending]);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const desktop = useDesktop();
  const openDetail = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const close = () => {
    setOpen(false);
    // Devuelve el foco a quien lo abrió.
    requestAnimationFrame(() => opener.current?.focus());
  };
  const value = useMemo(() => ({ cost, openDetail }), [cost, openDetail]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Drawer open={open} onOpenChange={(o) => (o ? null : close())} direction={desktop ? "right" : "bottom"}>
        <DrawerContent
          className={cn(
            "bg-popover duration-slow ease-enter",
            !desktop && "h-11/12 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none",
          )}
        >
          {cost ? <AiCostDetail cost={cost} onClose={close} /> : null}
        </DrawerContent>
      </Drawer>
    </Ctx.Provider>
  );
}

function AiCostDetail({ cost, onClose }: { cost: ProductAiCost; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 py-2 pr-2 pl-4">
        <DrawerTitle className="flex-1 text-heading">Costo de IA</DrawerTitle>
        <DrawerDescription className="sr-only">Cuánto costó en IA llevar este producto hasta donde está, por etapa, y cada generación.</DrawerDescription>
        <IconButton icon="x" label="Cerrar" onClick={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]">
        <AiCostCard {...cost} context={cost.audience === "admin" ? null : cost.context} />
        <div className="flex items-center justify-between pt-1 text-label font-semibold text-muted-foreground">
          Historial
          <span className="font-normal">
            {count(cost.generations)} {cost.generations === 1 ? "generación" : "generaciones"}
          </span>
        </div>
        {cost.runs.length ? (
          <AiRunList runs={cost.runs} audience={cost.audience} currency={cost.currency} />
        ) : (
          <p className="m-0 rounded-lg border bg-card p-4 text-label font-normal text-muted-foreground">
            Todavía no usaste la IA en este producto. Cada generación aparecerá aquí con su costo.
          </p>
        )}
        {cost.audience === "admin" ? (
          <p className="m-0 text-caption text-muted-foreground">Vista de administrador: tokens y modelo por llamada, solo para el equipo.</p>
        ) : null}
      </div>
    </div>
  );
}

/** El indicador de la barra superior. Fuera de un producto no dibuja nada. */
export function AiCostButton({ className }: { className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx?.cost) return null;
  const { cost, openDetail } = ctx;
  return <AiCostChip total={cost.total} cap={cost.cap} running={cost.running} currency={cost.currency} onClick={openDetail} className={className} />;
}

/** Tarjeta resumida bajo la ruta de etapas, con “Ver detalle”. */
export function AiCostSummary({ className }: { className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx?.cost) return null;
  const { cost, openDetail } = ctx;
  return (
    <AiCostCard
      {...cost}
      compact
      className={className}
      action={
        <button type="button" onClick={openDetail} className={linkClasses}>
          Ver detalle
        </button>
      }
    />
  );
}

/** Costo estimado de una llamada del paso, en la moneda de la tienda; null fuera de un producto. */
export function useAiEstimate(step: string): { amount: number; currency: string } | null {
  const ctx = useContext(Ctx);
  const amount = ctx?.cost?.estimates[step];
  return ctx?.cost && amount ? { amount, currency: ctx.cost.currency } : null;
}

/**
 * Formatea un costo en USD (imágenes, clips: lo que cobra el proveedor) en la moneda de la tienda, con el
 * mismo tipo de cambio del indicador de costo de IA. Mientras no llega (o fuera de un producto), en USD.
 */
export function useLocalCost(): (usd: number) => string {
  const cost = useContext(Ctx)?.cost;
  return useCallback((usd: number) => `≈ ${cost ? money(usd * cost.usdRate, cost.currency) : money(usd, "USD")}`, [cost]);
}

/** «≈ $30» para una llamada del paso (AI_STEPS), o null si todavía no hay estimado. */
export function useStepCost(step: string): string | null {
  const e = useAiEstimate(step);
  return e ? `≈ ${money(e.amount, e.currency)}` : null;
}
