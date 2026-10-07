/** Un switch de despliegue y otro por producto; no implica publicar en Shopify. */
export function persuasionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PDP_PERSUASION_ENABLED === "true";
}
