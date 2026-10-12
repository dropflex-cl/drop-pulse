import { carouselContentSchema, type CarouselContent } from "./carousel";
export function carouselFixture(): CarouselContent {
  return carouselContentSchema.parse({ name: "Rutina Sadoer", ratio: "4:5", primary_text: "Pack de dos para tu rutina", cta: "SHOP_NOW", art: { palette: "Azul y oro", typography: "Sans bold", lighting: "Luz natural", photography_style: "Editorial", consistency_notes: "Mismo producto" }, cards: ["cuidado", "oferta"].map(key => ({ key, headline: key, scene: "Producto sobre piedra", image_texts: [] })) });
}
