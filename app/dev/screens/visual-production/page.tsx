import { Suspense } from "react";
import { VisualProduction } from "@/components/screens/visual-production";
import { fixture } from "./fixture";
async function Preview({ searchParams }: { searchParams: Promise<{ state?: string; tab?: string }> }) {
  const { state, tab } = await searchParams;
  return <main id="contenido" className="mx-auto min-h-svh max-w-5xl p-4"><h1 className="mb-4 text-display">Producción visual · Vista de ejemplo</h1><VisualProduction initial={fixture(state === "stale")} initialTab={tab === "assets" ? "assets" : "plan"} /></main>;
}
export default function Page(props: { searchParams: Promise<{ state?: string; tab?: string }> }) { return <Suspense fallback={null}><Preview {...props} /></Suspense>; }
