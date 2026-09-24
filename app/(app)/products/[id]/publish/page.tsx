import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublishScreen } from "@/components/screens/publish";
import { getProductPublish } from "@/lib/data/products";

export const metadata: Metadata = { title: "Publicar" };

/**
 * Publicar (docs/spec-publicar.md): instala el tema de DropFlex en la tienda (una vez, sin publicar)
 * y lleva lo aprobado del producto a Shopify: ficha, packs como variantes, galería y el contenido de
 * la página en metafields.
 */
export default async function PublicarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductPublish(id);
  if (!data) notFound();
  return <PublishScreen product={data.product} initial={data.state} />;
}
