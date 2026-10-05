import "server-only";
import { getAnthropicConnection, NO_ANTHROPIC_KEY } from "@/lib/integrations/anthropic/connection";

/** Un paso de IA que no puede partir: su mensaje (en español) y el código HTTP para la ruta. */
export class OptimizeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Toda acción que llama a Claude parte con la clave de Anthropic del comerciante conectada: sin ella
 * falla al tocar, antes de crear la corrida o de gastar créditos de imágenes cuyo QA no podría correr.
 */
export async function requireAiKey(userId: string): Promise<void> {
  if ((await getAnthropicConnection(userId))?.status !== "connected") throw new OptimizeError(NO_ANTHROPIC_KEY, 409);
}
