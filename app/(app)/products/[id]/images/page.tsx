import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageImagesScreen } from "@/components/screens/page-images";
import { getProductPageImages } from "@/lib/data/products";

export const metadata: Metadata = { title: "Imágenes" };

/**
 * Imágenes (docs/spec-imagenes.md): las imágenes de la página del producto por espacio (Portada,
 * Galería y un Beneficio por cada beneficio aprobado). La IA las genera con Higgsfield desde la foto
 * base; el comerciante elige, ordena y puede usar sus fotos o subir otras.
 */
export default async function ImagenesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductPageImages(id);
  if (!data) notFound();
  return <PageImagesScreen data={data} />;
}
