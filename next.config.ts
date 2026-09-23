import type { NextConfig } from "next";

// Rutas anteriores en español → rutas en inglés (CLAUDE.md › Rutas). Permanentes, para enlaces y marcadores viejos.
const LEGACY_ROUTES: [string, string][] = [
  ["/hoy", "/today"],
  ["/productos/:id/textos", "/products/:id/copy"],
  ["/productos/:id/imagenes", "/products/:id/images"],
  // La etapa Precio se unió a Información base (“Precio y packs”).
  ["/productos/:id/precio", "/products/:id/base"],
  ["/products/:id/price", "/products/:id/base"],
  ["/productos/:id", "/products/:id"],
  ["/productos", "/products"],
  ["/campanas/:id", "/campaigns/:id"],
  ["/campanas", "/campaigns"],
  ["/ajustes", "/settings"],
  ["/auth/crear-cuenta", "/auth/create-account"],
  ["/onboarding/productos", "/onboarding/products"],
  ["/onboarding/numeros", "/onboarding/numbers"],
  ["/onboarding/meta/cuentas", "/onboarding/meta/accounts"],
  ["/onboarding/listo", "/onboarding/done"],
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: false,
  async redirects() {
    return LEGACY_ROUTES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
