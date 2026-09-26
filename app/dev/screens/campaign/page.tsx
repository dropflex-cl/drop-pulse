import { Suspense } from "react";
import { CampaignScreen } from "@/components/screens/campaign";
import { fixture } from "./fixture";

// Verificación visual del detalle de campaña con datos de ejemplo:
// ?state=paused (en pausa, inicio en unas horas)|now (en pausa, sin inicio programado)|waiting (publicada, esperando su hora)|live
// Las acciones llaman a la API real y fallan sin datos: aquí solo importa cómo se ve.
async function Screen({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = "paused" } = await searchParams;
  return <CampaignScreen key={state} data={fixture(state)} />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  return (
    <main id="contenido" className="min-h-svh">
      <Suspense fallback={null}>
        <Screen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
