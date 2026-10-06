import { errorResponse, ownedProduct, ProductApiError } from "./http";

/** Compatibilidad con clientes antiguos: autentica y verifica propiedad antes de responder 410. */
export function retiredProductWriter(message: string) {
  return async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      await ownedProduct(id);
      throw new ProductApiError(message, 410);
    } catch (error) { return errorResponse(error); }
  };
}
