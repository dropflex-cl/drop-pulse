import { runAutomaticShopifyPublication } from "./shopify-automation";
import { runVisualIngestion } from "./visual-operations";
import { visualEnabled } from "./visual-service";
import { visualTools } from "./visual-schemas";
import { persuasionEnabled } from "./persuasion-flags";
import { persuasionTools } from "./persuasion-schemas";
import { runGalleryOperation } from "@/lib/page-images/operations";
import "server-only";
import { after } from "next/server";
import { runUgcOperation } from "@/lib/video/operations";
import { assertMcpRequestOrigin, createMcpAuthenticator, mcpConfiguration, protectedResourceMetadata } from "./oauth";
import { createMcpHttpHandler, mcpHttpError } from "./http";
import { checkLiveMcpGrant } from "./oauth-store";
import { createProductIntelligenceExecutor, PERSISTED_INTELLIGENCE_TOOLS } from "./knowledge-service";
import { createContextRepository } from "./repository";

export async function serveMcpMetadata(request: Request) {
  try {
    const config = mcpConfiguration();
    if (!config) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    assertMcpRequestOrigin(request, config);
    const origin = request.headers.get("origin");
    return Response.json(protectedResourceMetadata(config), { headers: { "Cache-Control": "no-store", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } });
  } catch (error) { return mcpHttpError(error); }
}

export async function serveMcpRequest(request: Request): Promise<Response> {
  let config;
  try {
    config = mcpConfiguration();
    if (!config) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const repository = createContextRepository();
    const wake = (id: string) => after(() => runUgcOperation(id));
    const wakeGallery = (id: string) => after(() => runGalleryOperation(id));
    const wakePublish = (id: string) => after(() => runAutomaticShopifyPublication(id));
    const wakeVisual = (id: string) => after(() => runVisualIngestion(id));
    return await createMcpHttpHandler(config, createMcpAuthenticator(config, checkLiveMcpGrant), createProductIntelligenceExecutor(repository, undefined, undefined, wake, wakeGallery, wakeVisual, wakePublish), {
      availableTools: PERSISTED_INTELLIGENCE_TOOLS.filter(tool => (persuasionEnabled() || !persuasionTools.includes(tool as typeof persuasionTools[number])) && (visualEnabled() || (tool !== "review_visual_record" && !visualTools.includes(tool as typeof visualTools[number])))),
      executorForAuthentication: (auth) => createProductIntelligenceExecutor(repository, auth.identity, undefined, wake, wakeGallery, wakeVisual, wakePublish),
    })(request);
  } catch (error) {
    const response = mcpHttpError(error, config ?? undefined);
    const origin = request.headers.get("origin");
    if (origin && config?.allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
      response.headers.set("Vary", "Origin");
    }
    return response;
  }
}
