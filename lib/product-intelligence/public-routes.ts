/** Excepciones exactas: las rutas de consentimiento/revocación siguen requiriendo cookie. */
export function isSelfAuthenticatedMcpRoute(path: string): boolean {
  return path === "/api/mcp" || path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/api/mcp";
}
