import { Suspense } from "react";
import { connection } from "next/server";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { McpConnections } from "@/components/auth/mcp-connections";
import { getMcpConnections } from "@/lib/data/oauth";

export const metadata = { title: "Conexiones MCP" };
async function Connections() {
  await connection();
  let data;
  try { data = await getMcpConnections(); }
  catch { return <AuthCard title="Conexiones MCP"><FormError>No pudimos consultar las conexiones. Inicia sesión y reintenta cuando MCP esté habilitado.</FormError></AuthCard>; }
  return <AuthCard title="Conexiones MCP" description="Revisa los clientes con acceso a tu catálogo. Revoca una conexión para cortar su acceso."><McpConnections connections={data} /></AuthCard>;
}
export default function Page() { return <Suspense><Connections /></Suspense>; }
