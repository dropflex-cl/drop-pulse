import { Suspense } from "react";
import { IconButton, StageList, StatusBadge, Thumb } from "@/components/df";
import { CopyScreen } from "@/components/screens/copy";
import { AssistantProvider } from "@/components/shell/assistant-provider";
import { fixture } from "./fixture";
import { previewCatalogData } from "./catalog-data";
import { PreviewCatalog } from "./preview-catalog";

// Sin parámetros o con ?state=done: catálogo desplegado con fixtures de todos los componentes.
// ?state=done&view=screen y los demás estados conservan la pantalla de producto para desarrollo.
async function Screen({ searchParams }: { searchParams: Promise<{ state?: string; view?: string }> }) {
  const { state = "done", view } = await searchParams;
  if (state === "done" && view !== "screen") return <PreviewCatalog {...previewCatalogData()} />;
  const data = fixture(state);
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
          <StageList stages={product.sections.map(({ title, state: s, desc, optional }) => ({ title, state: s, desc, optional }))} />
        </nav>
        <div className="min-w-0 flex-1">
          <CopyScreen key={state} data={data} />
        </div>
      </div>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string; view?: string }> }) {
  return (
    <AssistantProvider>
      <main id="contenido" className="min-h-svh">
        <Suspense fallback={null}>
          <Screen searchParams={searchParams} />
        </Suspense>
      </main>
    </AssistantProvider>
  );
}
