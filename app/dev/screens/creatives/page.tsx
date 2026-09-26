import { Suspense } from "react";
import { IconButton, StageList, StatusBadge, Thumb } from "@/components/df";
import { CreativesScreen } from "@/components/screens/creatives";
import { AiCostProvider } from "@/components/shell/ai-cost-provider";
import { AssistantProvider } from "@/components/shell/assistant-provider";
import { summarizeAiCost } from "@/lib/ai/costs";
import { fixture } from "./fixture";

// Verificación visual de la etapa Creativos con datos de ejemplo:
// ?state=locked|key|start|proposing|failed|concepts|rendering|review|done
// y la pestaña Videos: &video=locked|none|writing|failed|script|suggest|both|keyframes|clips|montage|final
// Imita el layout del producto (encabezado + ruta a la izquierda en escritorio). Las acciones llaman a
// la API real y fallan sin datos: aquí solo importa cómo se ve.
async function Screen({ searchParams }: { searchParams: Promise<{ state?: string; video?: string }> }) {
  const { state = "start", video } = await searchParams;
  const data = fixture(state, video);
  const { product } = data;
  return (
    <>
      <header className="hidden items-center gap-3 border-b px-8 pt-5 pb-4 lg:flex">
        <IconButton icon="chevron-left" label="Productos" href="/products" />
        <Thumb src={product.image} />
        <div className="min-w-0 flex-1">
          <h1 className="text-display">{product.name}</h1>
          <p className="text-caption text-muted-foreground">{product.summary}</p>
        </div>
        {product.status ? <StatusBadge status={product.status} /> : null}
      </header>
      <div className="lg:flex">
        <nav aria-label="Ruta del producto" className="sticky top-0 hidden max-h-svh w-66 shrink-0 self-start overflow-auto border-r pt-3 lg:block">
          <StageList stages={product.stages.map(({ title, state: s, desc, optional }) => ({ title, state: s, desc, optional }))} />
        </nav>
        <div className="min-w-0 flex-1">
          <CreativesScreen key={`${state}-${video ?? ""}`} data={data} initialTab={video ? "videos" : "images"} />
        </div>
      </div>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string; video?: string }> }) {
  return (
    <AssistantProvider>
      {/* Costo de IA de ejemplo en CLP: los botones que gastan muestran el monto en la moneda de la tienda. */}
      <AiCostProvider cost={Promise.resolve(summarizeAiCost([], { currency: "CLP", usdRate: 950, stages: [], now: new Date("2026-01-01T12:00:00Z") }))}>
        <main id="contenido" className="min-h-svh">
          <Suspense fallback={null}>
            <Screen searchParams={searchParams} />
          </Suspense>
        </main>
      </AiCostProvider>
    </AssistantProvider>
  );
}
