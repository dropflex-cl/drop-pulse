import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessagesScreen } from "@/components/screens/whatsapp";
import { getProductMessages } from "@/lib/data/products";

export const metadata: Metadata = { title: "WhatsApp" };

/**
 * Etapa opcional WhatsApp: los mensajes para confirmar y seguir los pedidos, con los datos del
 * producto y de Ajustes › Envíos y políticas, listos para copiar y pegar en WhatsApp.
 */
export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductMessages(id);
  if (!data) notFound();
  return <MessagesScreen data={data} />;
}
