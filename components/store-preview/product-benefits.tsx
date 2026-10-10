import type { Listing } from "@/lib/copy/listing";
import { DfIcon } from "./primitives";

/** Los tres beneficios aprobados, debajo del botón de compra. */
export function ProductBenefitsPreview({ benefits }: { benefits?: Listing["gallery_benefits"] }) {
  if (benefits?.length !== 3) return null;
  return (
    <div className="df df-gallery-benefits-host">
      <ul className="df-gallery-benefits" aria-label="Beneficios principales" role="list">
        {benefits.map((item, i) => (
          <li key={i} className="df-gallery-benefits__item">
            <DfIcon name={item.icon} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
