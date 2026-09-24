// Las etiquetas propias de los componentes del tema (<df-slider>, <df-inventory>…): la vista previa
// usa las mismas para que el CSS del tema (store.generated.css) aplique igual. Sin su JS: son solo
// contenedores.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type StoreElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "df-slider": StoreElement;
      "df-buy-link": StoreElement;
      "df-comparison-table": StoreElement;
      "df-faq-and-text": StoreElement;
      "df-insta-story": StoreElement;
      "df-inventory": StoreElement;
      "df-review-slider": StoreElement;
      "df-review-stars": StoreElement;
      "df-scrolling-benefits": StoreElement;
      "df-shipping-timeline": StoreElement;
      "df-ugc-slider": StoreElement;
    }
  }
}
