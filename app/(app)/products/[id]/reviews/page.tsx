import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewsScreen } from "@/components/screens/reviews";
import { getProductReviews } from "@/lib/data/products";

export const metadata: Metadata = { title: "Reseñas" };

/**
 * Etapa opcional Reseñas (design-system/arquitectura.md › 9): importar de AliExpress, aprobar,
 * rechazar o editar. Nunca bloquea ni se bloquea; la IA usa las aprobadas al escribir.
 */
export default async function ReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductReviews(id);
  if (!data) notFound();
  return <ReviewsScreen data={data} />;
}
