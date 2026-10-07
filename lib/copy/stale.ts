// Solo el contexto canónico puede invalidar contenido nuevo. No reconstruir dependencias retiradas.
export type CopyStaleReason = "product_context";
export const STALE_REASON_LABEL: Record<CopyStaleReason, string> = { product_context: "el contexto guardado desde el chat" };
