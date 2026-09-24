// Datos de tienda de ejemplo para la vista previa (tests, /dev y la pantalla de ejemplo): reseñas con
// los ids que citan los ejemplos de los content.ts. Puro.

import type { StoreFacts } from "./facts";

const REVIEW_TEXTS: [id: string, author: string, rating: number, body: string, country: string][] = [
  ["rv_8812", "M***a", 5, "Lo uso 2 horas en la oficina y ya no termino encorvada. Buena calidad, las correas no se sueltan.", "CL"],
  ["rv_8840", "J***o", 4, "Llegó bien embalado en 4 días. La talla M me quedó justa, pedí según la tabla.", "CL"],
  ["rv_8903", "C***a", 4, "Al principio incomoda un poco, después te acostumbras. Se nota la diferencia al final del día.", "MX"],
  ["rv_1201", "P***o", 5, "Se ajusta fácil y no se nota debajo de la polera. Lo uso para manejar.", "CO"],
  ["rv_1244", "A***a", 5, "Tal cual la foto. Lo compré para mi hijo que estudia mucho sentado y le sirvió.", "CL"],
  ["r_1042", "L***s", 5, "Antes terminaba el día con la espalda cargada; ahora me acuerdo de enderezarme sin pensarlo.", "PE"],
];

/** Una tienda con reseñas aprobadas, envío gratis y garantía; sin plazos de entrega cargados. */
export const FIXTURE_FACTS: StoreFacts = {
  productName: "Corrector de postura",
  price: 24990,
  compareAt: 32990,
  currency: "CLP",
  reviews: REVIEW_TEXTS.map(([id, author, rating, body, country]) => ({ id, author, rating, body, country, date: "ago 2026", photos: [] })),
  rating: 4.7,
  count: REVIEW_TEXTS.length,
  policies: { cod: true, free_shipping: true, return_days: 30 },
  logistics: null,
};

/** Una tienda recién conectada: sin reseñas ni políticas más allá del pago al recibir. */
export const EMPTY_FACTS: StoreFacts = {
  productName: "Corrector de postura",
  price: 24990,
  currency: "CLP",
  reviews: [],
  rating: null,
  count: 0,
  policies: { cod: true, free_shipping: false },
  logistics: null,
};
