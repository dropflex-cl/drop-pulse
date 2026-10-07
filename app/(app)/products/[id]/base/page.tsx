import { getProductVisualWorkbench } from "@/lib/data/visual-production";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BaseInfoScreen } from "@/components/screens/base-info";
import { getProductBase } from "@/lib/data/products";

export const metadata: Metadata = { title: "Información base" };

/**
 * Información base (PantallasProductoNuevo1 / PantallasProductoNuevoEscritorio): lo que el
 * comerciante sabe del producto y sus imágenes de referencia → “Optimizar con IA” → cliente ideal.
 */
export default async function BaseInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await getProductBase(id);
  if (!base) notFound();
  const visual = await getProductVisualWorkbench(id);
  return <BaseInfoScreen base={base} visual={visual} />;
}
