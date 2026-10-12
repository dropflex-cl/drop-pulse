import * as z from "zod/v4";

const plain = z.string().trim().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.");

/** Contenido propio del componente o referencia opcional a una reseña importada. */
export const reviewFields = {
  review_id: plain.min(1).max(100).optional().describe("Referencia opcional para reutilizar una reseña del producto."),
  body: plain.min(8).max(1500).optional().describe("Texto propio, editable desde el chat, sin requisito de reseña importada."),
  name: plain.min(1).max(70).optional().describe("Nombre que acompaña al texto propio."),
  rating: z.number().min(1).max(5).optional().describe("Calificación opcional del contenido propio."),
};

export const reviewItem = z.object(reviewFields).refine(item => Boolean(item.review_id || item.body), {
  message: "Escribe el texto o elige una reseña por su ID.",
});
