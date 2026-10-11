import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BaseInfoScreen } from "@/components/screens/base-info";
import { getProductBase } from "@/lib/data/products";

export const metadata: Metadata = { title: "Información y oferta" };

/** Información y oferta guardadas, con ajustes manuales en el modelo compartido. */
export default async function BaseInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await getProductBase(id);
  if (!base) notFound();
  return <BaseInfoScreen base={base} />;
}
