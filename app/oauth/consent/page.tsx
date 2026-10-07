import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { McpConsentForm } from "@/components/auth/mcp-consent-form";
import { Button } from "@/components/df";
import { getMcpConsent } from "@/lib/data/oauth";
import { McpConsentRecoveryError } from "@/lib/product-intelligence/consent";

export const metadata = { title: "Autoriza la conexión MCP" };
async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  await connection();
  const { authorization_id: id } = await searchParams;
  let data;
  try { if (!id) throw new Error(); data = await getMcpConsent(id); }
  catch (error) { return <AuthCard title="Autoriza la conexión MCP"><FormError>{error instanceof McpConsentRecoveryError ? error.message : "La solicitud venció o no tiene acceso. Revisa tus conexiones y vuelve a conectar el cliente MCP."}</FormError><Button href="/oauth/connections">Revisa tus conexiones</Button></AuthCard>; }
  if (data.redirectUrl) redirect(data.redirectUrl);
  return <AuthCard title="Autoriza la conexión MCP" description={`${data.clientName} solicita acceso a tu catálogo de DropFlex durante 30 días. Elige qué puede hacer.`}><McpConsentForm ticket={data.ticket!} /></AuthCard>;
}
export default function Page(props: { searchParams: Promise<{ authorization_id?: string }> }) { return <Suspense><Consent {...props} /></Suspense>; }
