import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnglesScreen } from "@/components/screens/angles";
import { getProductAngles } from "@/lib/data/products";

export const metadata: Metadata = { title: "Ángulos" };

/**
 * Ángulos (PantallasAngulos1/2, PantallasAngulosEscritorio1/2): con el cliente ideal aprobado, la IA
 * evalúa los 6 ángulos de venta, el comerciante elige principal y secundario y aprueba sus desarrollos.
 */
export default async function AnglesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const angles = await getProductAngles(id);
  if (!angles) notFound();
  return <AnglesScreen data={angles} />;
}
