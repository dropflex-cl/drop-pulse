import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_FACTS } from "@/lib/store-preview/fixture";
import { RichPdpPreview } from "./rich-pdp";

describe("Contenido sin requisitos de evidencia", () => {
  it("muestra antes/después con imágenes elegidas sin fact_id", () => {
    const html = renderToStaticMarkup(<RichPdpPreview component="before-after" facts={EMPTY_FACTS}
      content={{ heading: "Compara el uso", before_label: "Antes", after_label: "Después", body: "Desliza para comparar las imágenes." }}
      images={{ before: ["https://example.test/generated-before.webp"], after: ["https://example.test/generated-after.webp"] }} />);
    expect(html).toContain("data-df-comparison");
    expect(html).toContain("generated-after.webp");
  });
  it("muestra contenido propio de historias sin reseñas importadas", () => {
    const html = renderToStaticMarkup(<RichPdpPreview component="customer-stories" facts={EMPTY_FACTS}
      content={{ heading: "En el día a día", stories: [{ title: "En el escritorio", body: "Mantengo todo a mano mientras trabajo.", name: "María" }] }} images={{}} />);
    expect(html).toContain("Mantengo todo a mano mientras trabajo.");
    expect(html).toContain("María");
    expect(html).not.toContain("df-stars");
  });
  it("muestra nombre, credencial y declaración editables sin fact_id", () => {
    const html = renderToStaticMarkup(<RichPdpPreview component="expert-endorsement" facts={EMPTY_FACTS}
      content={{ heading: "Conoce otra perspectiva", name: "Ana", credential: "Especialista", quote: "Organiza cada objeto en su espacio." }} images={{}} />);
    expect(html).toContain("Organiza cada objeto en su espacio.");
    expect(html).toContain("Especialista");
  });
});
