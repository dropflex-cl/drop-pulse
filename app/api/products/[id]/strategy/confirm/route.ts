import { retiredProductWriter } from "@/lib/products/retired-writer";

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Guarda tu selección desde el chat con set_product_strategy. La confirmación de estrategias antiguas se retiró.");
