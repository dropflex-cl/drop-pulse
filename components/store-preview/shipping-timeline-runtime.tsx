"use client";

import Script from "next/script";

/** El preview ejecuta el mismo reloj y movimiento que el asset canónico del tema. */
export function ShippingTimelineRuntime() {
  return <Script src="/store-preview/df-shipping-timeline.js" strategy="afterInteractive" />;
}
