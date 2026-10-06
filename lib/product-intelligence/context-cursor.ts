import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { canonicalHash } from "./concurrency";
import { ProductIntelligenceError } from "./errors";
import type { Principal } from "./policy";
import type { ToolInputs } from "./schemas";

const cursorSchema = z.strictObject({ binding: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().nonnegative().safe(), offset: z.number().int().nonnegative().safe(), expires: z.number().int().positive() });
export type ContextCursor = z.infer<typeof cursorSchema>;
export function cursorBinding(principal: Principal, input: ToolInputs["get_product_context"]): string {
  return canonicalHash({ user: principal.userId, actor: principal.actorId, kind: principal.actorKind, client: principal.clientId ?? null,
    product: input.product_id, include: input.include ?? null, view: input.view, archived: input.include_archived, pageSize: input.page_size, atRevision: input.at_revision ?? null });
}
function signature(body: string, secret: string) {
  if (secret.length < 32) throw new ProductIntelligenceError("INTERNAL_ERROR", "Falta configurar la paginación MCP.");
  return createHmac("sha256", secret).update(`pi-context-cursor-v1.${body}`).digest();
}
export function signContextCursor(cursor: ContextCursor, secret: string): string {
  const body = Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString("base64url");
  return `${body}.${signature(body, secret).toString("base64url")}`;
}
export function verifyContextCursor(value: string, binding: string, secret: string, now = Date.now()): ContextCursor {
  let cursor: ContextCursor;
  try {
    if (value.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const [body, encoded] = value.split("."), expected = signature(body, secret), actual = Buffer.from(encoded, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    cursor = cursorSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    if (cursor.binding !== binding || cursor.expires > Math.floor(now / 1000) + 900) throw new Error();
  } catch { throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no corresponde a esta lectura. Recupera el contexto de nuevo."); }
  if (cursor.expires <= Math.floor(now / 1000)) throw new ProductIntelligenceError("CURSOR_EXPIRED", "La lectura venció. Recupera el contexto de nuevo.");
  return cursor;
}
