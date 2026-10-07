// Ejemplo de selección canónica para la pantalla de estrategia; sin pipeline antiguo.
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { ProductStrategy } from "@/lib/types";
import { strategyFixture } from "@/lib/product-intelligence/test-fixtures";
export function fixture(state: string): ProductStrategy {
  const selection = state === "done" ? strategyFixture() : null;
  const pos = productPosition({ price: 24990, currency: "CLP", base: { described: state !== "locked", priced: true }, intelligence: { selected: Boolean(selection), ready: Boolean(selection) } });
  return {
    product: { id: "00000000-0000-0000-0000-000000000000", name: "Producto de ejemplo", image: productImage(1, 1), sku: "", ...pos, aiConnected: true, supplierCost: 6900, price: 24990, currency: "CLP" },
    selection, blocker: state === "locked" ? "Completa el contexto en Información base." : null,
    chosen: selection?.snapshot.angles.map((angle, i) => ({ slot: i + 1, title: angle.name, hook: angle.hook })) ?? [],
  };
}
