import type { DomainError } from "./schemas";

export class ProductIntelligenceError extends Error {
  readonly code: DomainError["code"];
  readonly details: DomainError["details"];
  readonly retryable: boolean;

  constructor(code: DomainError["code"], message: string, details: DomainError["details"] = {}, retryable = false) {
    super(message);
    this.name = "ProductIntelligenceError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toDomainError(): DomainError {
    return { code: this.code, message: this.message, retryable: this.retryable, details: this.details };
  }
}

export function invalidField(field: string, message: string): never {
  throw new ProductIntelligenceError("VALIDATION_ERROR", message, { fields: [field] });
}

export function invalidReference(): never {
  // No revelar la identidad ni el estado del recurso que no pertenece al grafo.
  throw new ProductIntelligenceError("INVALID_REFERENCE", "Una referencia no pertenece a este producto o no está disponible.");
}
