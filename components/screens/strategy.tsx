"use client";

import { Button, EmptyState, Notice, TopBar } from "@/components/df";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { STRATEGY_STAGE_TITLE } from "@/lib/products/stages";
import { productHref } from "@/lib/routes";
import type { ProductStrategy } from "@/lib/types";
import { useRouter } from "next/navigation";

/** Estrategia escrita y seleccionada desde el chat; el informe anterior queda solo para consulta. */
export function StrategyScreen({ data }: { data: ProductStrategy }) {
  const router = useRouter();
  const { product, selection, chosen } = data;
  const angles = selection?.snapshot.angles;
  return (
    <div className="flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage={STRATEGY_STAGE_TITLE} stageKey="angulos" image={product.image} />
      <TopBar back={product.name} backHref={`/products/${product.id}`} title={STRATEGY_STAGE_TITLE} actions={<><AiCostButton /><AssistantButton /></>} className="sticky top-0 z-sticky lg:hidden" />
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 lg:max-w-content lg:px-8 lg:py-6">
        <Notice title="Define la estrategia desde el chat" body="Guarda el análisis con save_product_analysis y selecciona la estrategia con set_product_strategy. Elegir un ángulo no demuestra que sea ganador." />
        {data.blocker ? <Notice title="Completa el contexto del producto" body={data.blocker} action={<Button size="sm" href={productHref(product.id, "importado")}>Ir a Información base</Button>} /> : null}
        {selection ? (
          <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="selected-strategy">
            <h2 id="selected-strategy" className="text-heading">Estrategia seleccionada</h2>
            <p className="text-small">{selection.snapshot.positioning}</p>
            <p className="text-small text-muted-foreground">{selection.snapshot.rationale}</p>
            {selection.readiness.stale || selection.readiness.needs_review ? <Notice title="Revisa la estrategia en el chat" body="Cambió el contexto o la evidencia. Recupera la selección y resuelve lo pendiente antes de generar contenido." /> : null}
            {angles?.map((angle) => <article key={angle.id} className="flex flex-col gap-1 rounded-md bg-muted p-3"><h3 className="text-label">{angle.name}</h3><p className="text-body">{angle.hook}</p><p className="text-caption text-muted-foreground">{angle.promise}</p></article>)}
          </section>
        ) : <EmptyState icon="text" title="Prepara tu estrategia en el chat" body="Cuando guardes la selección, podrás consultarla aquí. Consulta aquí los ángulos y el motivo de la selección." />}
        {chosen.length && !selection ? <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-label="Ángulos conservados">{chosen.map((angle) => <article key={angle.slot}><h3 className="text-label">{angle.title}</h3><p className="text-body">{angle.hook}</p></article>)}</section> : null}
      </div>
      <StickyActions variant="bar" summary="El análisis y la selección se guardan desde el chat.">
        <Button icon="refresh" onClick={() => router.refresh()}>Actualizar</Button>
        {chosen.length ? <Button variant="primary" iconEnd="chevron-right" href={productHref(product.id, "imagenes")}>Continuar: Imágenes</Button> : null}
      </StickyActions>
    </div>
  );
}
