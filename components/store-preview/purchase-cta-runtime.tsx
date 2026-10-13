"use client";

import Script from "next/script";

/** El preview comparte el efecto acotado del botón del tema; la ficha sigue siendo decorativa. */
export function PurchaseCtaRuntime() {
  return <Script src="/store-preview/df-purchase-cta.js" strategy="afterInteractive" />;
}
