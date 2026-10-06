import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const ticketSchema = z.object({ userId: z.uuid(), clientId: z.uuid(), authorizationId: z.string().min(1).max(256), resourceUrl: z.url().max(2048), expiresAt: z.number().int().positive(), nonce: z.string().length(32) }).strict();
export type ConsentTicket = z.infer<typeof ticketSchema>;
const signature = (body: string, secret: string) => {
  if (secret.length < 32) throw new Error("Falta configurar la autorización MCP.");
  return createHmac("sha256", secret).update(`pi-consent-v1.${body}`).digest();
};
export function createConsentTicket(input: Omit<ConsentTicket, "expiresAt" | "nonce">, secret: string, now = new Date()): string {
  const payload = ticketSchema.parse({ ...input, expiresAt: Math.floor(now.getTime() / 1000) + 600, nonce: randomBytes(24).toString("base64url") });
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret).toString("base64url")}`;
}
export function verifyConsentTicket(ticket: string, secret: string, now = new Date()): ConsentTicket {
  try {
    if (ticket.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)) throw new Error();
    const [body, encoded] = ticket.split(".");
    const actual = Buffer.from(encoded, "base64url");
    const expected = signature(body, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const result = ticketSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    const seconds = Math.floor(now.getTime() / 1000);
    if (result.expiresAt <= seconds || result.expiresAt > seconds + 600) throw new Error();
    return result;
  } catch { throw new Error("La solicitud de autorización venció. Conecta de nuevo el cliente MCP."); }
}
