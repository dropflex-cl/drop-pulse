import "server-only";

/** Un paso de IA que no puede partir: su mensaje (en español) y el código HTTP para la ruta. */
export class OptimizeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
