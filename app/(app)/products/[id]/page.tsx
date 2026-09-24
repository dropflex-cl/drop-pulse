import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button, StageList, StageMeter, TopBar } from "@/components/df";
import { StageNav } from "@/components/screens/stage-nav";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton, AiCostSummary } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { getProduct } from "@/lib/data/products";
import { money } from "@/lib/format";
import { productHref } from "@/lib/routes";
import type { Product } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const product = await getProduct((await params).id);
  return { title: product?.name ?? "Producto" };
}

/** “Continuar: <etapa>” siempre lleva al siguiente paso pendiente. */
function NextAction({ product }: { product: Product }) {
  const stage = product.stages.find((s) => s.key === product.nextStage);
  const title = stage?.title ?? "";
  if (product.nextStage === "angulos" || product.nextStage === "textos" || product.nextStage === "imagenes" || product.nextStage === "publicar" || product.nextStage === "anuncios") {
    return (
      <Button href={productHref(product.id, product.nextStage)} variant="primary" size="lg" iconEnd="chevron-right">
        Continuar: {title}
      </Button>
    );
  }
  return (
    <Button variant="primary" size="lg" loading>
      Importando del proveedor
    </Button>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();
  // Un producto sin su información base lista abre en esa etapa (design-system/arquitectura.md › 8).
  if (product.stages.find((s) => s.key === "importado")?.state !== "done") redirect(productHref(product.id, "importado"));
  const next = product.stages.find((s) => s.key === product.nextStage);

  return (
    <>
      <AssistantScope productId={product.id} product={product.name} image={product.image} />
      <TopBar
        back="Productos"
        backHref="/products"
        title={product.name}
        subtitle={product.summary}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />

      {/* Móvil: la ruta completa. */}
      <div className="lg:hidden">
        <div className="px-4 pt-1 pb-3">
          <StageMeter stages={product.meter} />
        </div>
        <Suspense fallback={<StageList stages={product.stages.map(({ title, state, desc, optional }) => ({ title, state, desc, optional }))} />}>
          <StageNav productId={product.id} stages={product.stages} />
        </Suspense>
        <AiCostSummary className="mx-4 mt-2 mb-4" />
      </div>

      {/* Escritorio: la ruta está a la izquierda; al centro, lo siguiente y los datos del producto. */}
      <section aria-labelledby="siguiente" className="hidden max-w-content flex-col gap-4 px-8 py-6 lg:flex">
        <div className="rounded-lg border bg-card p-4">
          <h2 id="siguiente" className="text-label font-semibold text-muted-foreground">
            Siguiente paso
          </h2>
          <p className="mt-1 text-heading">{next?.title}</p>
          {next?.desc ? (
            <p className={next.state === "error" ? "text-body text-destructive" : "text-body text-muted-foreground"}>{next.desc}</p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border">
          <div className="bg-card p-3">
            <dt className="text-caption text-muted-foreground">Precio en tu tienda</dt>
            <dd className="text-metric">{product.price ? money(product.price, product.currency) : "Sin precio"}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-caption text-muted-foreground">Costo del proveedor</dt>
            <dd className="text-metric">{product.supplierCost ? money(product.supplierCost, product.currency) : "Sin costo"}</dd>
          </div>
        </dl>
      </section>

      <div className="lg:max-w-content lg:px-8 lg:pb-6">
        <StickyActions>
          <NextAction product={product} />
        </StickyActions>
      </div>
    </>
  );
}
