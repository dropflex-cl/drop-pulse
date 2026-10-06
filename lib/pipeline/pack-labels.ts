import "server-only";
import { OptimizeError } from "./errors";

/** @deprecated Escribe la propuesta en chat y persístela con save_pack_labels. */
export async function regeneratePackLabels(_userId: string, _productId: string): Promise<never> {
  void _userId; void _productId;
  throw new OptimizeError("Escribe otras etiquetas en el chat y guárdalas desde el MCP.", 409);
}
