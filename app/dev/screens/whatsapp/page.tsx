import { Suspense } from "react";
import { IconButton, StageList, Thumb } from "@/components/df";
import { MessagesScreen } from "@/components/screens/whatsapp";
import { AssistantProvider } from "@/components/shell/assistant-provider";
import { fixture } from "./fixture";

// Verificación visual de la etapa WhatsApp con datos de ejemplo: ?state=full|no-tip|bare
// «Escribir consejo con IA» llama a la API real y falla sin datos: aquí solo importa cómo se ve.
async function Screen({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = "full" } = await searchParams;
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
      </header>
      <div className="lg:flex">
        <nav aria-label="Ruta del producto" className="sticky top-0 hidden max-h-svh w-66 shrink-0 self-start overflow-auto border-r pt-3 lg:block">
          <StageList stages={product.stages.map(({ title, state: s, desc, optional }) => ({ title, state: s, desc, optional }))} />
        </nav>
        <div className="min-w-0 flex-1">
          <MessagesScreen key={state} data={data} />
        </div>
      </div>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
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
