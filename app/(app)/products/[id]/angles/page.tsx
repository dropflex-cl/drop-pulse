import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StrategyScreen } from "@/components/screens/strategy";
import { getProductStrategy } from "@/lib/data/products";

export const metadata: Metadata = { title: "Estrategia" };

/**
 * Estrategia (docs/spec-estrategia.md): con los datos del producto y el precio, el mega prompt escribe la
 * estrategia completa y el comerciante elige 2 o 3 de sus TOP 5 ángulos para testear.
 */
export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const strategy = await getProductStrategy(id);
  if (!strategy) notFound();
  return <StrategyScreen data={strategy} />;
}
