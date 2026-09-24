import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreativesScreen } from "@/components/screens/creatives";
import { getProductCreatives } from "@/lib/data/products";

export const metadata: Metadata = { title: "Creativos" };

/**
 * Creativos (docs/spec-creativos.md): anuncios de imagen terminados, generados con Higgsfield desde los
 * 2 ángulos aprobados. Opcional: alimenta Anuncios y nunca bloquea Publicar.
 */
export default async function CreativesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creatives = await getProductCreatives(id);
  if (!creatives) notFound();
  return <CreativesScreen data={creatives} />;
}
