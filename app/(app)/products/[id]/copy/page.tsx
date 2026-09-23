import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyScreen } from "@/components/screens/copy";
import { getProductCopy } from "@/lib/data/products";
import { COPY_STAGE_TITLE } from "@/lib/products/stages";

export const metadata: Metadata = { title: COPY_STAGE_TITLE };

/**
 * Página del producto, la etapa Textos (PantallasTextos1/2 y PantallasTextosEscritorio): con los 2
 * desarrollos de Ángulos aprobados, la IA escribe los bloques de la página y el comerciante acepta,
 * edita o descarta cada uno.
 */
export default async function CopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const copy = await getProductCopy(id);
  if (!copy) notFound();
  return <CopyScreen data={copy} />;
}
