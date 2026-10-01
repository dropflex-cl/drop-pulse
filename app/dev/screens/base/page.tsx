import { Suspense } from "react";
import { BaseInfoScreen } from "@/components/screens/base-info";
import { AssistantProvider } from "@/components/shell/assistant-provider";
import { fixture } from "./fixture";

// Verificación visual de Información base con datos de ejemplo: ?state=new|optimizing|failed|review|approved|ai (sin la clave de Anthropic).
// Las acciones llaman a la API real y fallan sin sesión: aquí solo importa cómo se ve.
async function Screen({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = "new" } = await searchParams;
  return <BaseInfoScreen key={state} base={fixture(state)} />;
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
