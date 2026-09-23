import { describe, expect, it } from "vitest";
import {
  anonymize,
  buildFeedbackUrl,
  extractItemId,
  isAliExpressInput,
  isAllowedImageUrl,
  isShortLink,
  parseEvalDate,
  parseFeedbackPage,
  parseFilterCount,
  parseStats,
  parseTotalPages,
  passesFilters,
  toStars,
} from "./aliexpress";

// Recortada de una respuesta real de searchEvaluation.do para el listado 1005012046725163 (dropflex v1):
// las formas son las que el endpoint devuelve, no una suposición.
const PAYLOAD = {
  data: {
    currentPage: 1,
    totalPage: 3,
    evaViewList: [
      {
        evaluationIdStr: "30103016223438633",
        buyerName: "j***r",
        buyerCountry: "BE",
        buyerEval: 100,
        buyerFeedback: "Bon pommeau de douche. Le jet est puissant.",
        buyerTranslationFeedback: "Buen cabezal de ducha. El flujo de agua es potente.",
        skuInfo: "Color:Rojo",
        evalDate: "07 MAY 2026",
        upVoteCount: 2,
        images: ["https://ae-pic-a1.aliexpress-media.com/kf/A4b6b939e9d4a4fdeac66b9087d166545a.jpg"],
      },
      {
        evaluationIdStr: "50226444494510234",
        buyerName: "Anónimo",
        buyerCountry: "il",
        buyerEval: 20,
        buyerFeedback: "коробка пришла помятой",
        buyerTranslationFeedback: "La caja llegó abollada tras 3 semanas, pero todo bien.",
        evalDate: "13 AGO 2026",
        images: [
          "https://ae-pic-a1.aliexpress-media.com/kf/Acd20aeb223464c25a4653b770d0fb4bcv.jpg",
          "https://ae-pic-a1.aliexpress-media.com/kf/Aeb70082f57eb4a4bba26b6ed8e87a69fX.jpg",
          "https://ae-pic-a1.aliexpress-media.com/kf/Athird.jpg",
          "https://ae-pic-a1.aliexpress-media.com/kf/Afourth.jpg",
        ],
      },
      // Sin foto: entra igual (el filtro “Solo con fotos” decide después).
      { evaluationIdStr: "1", buyerName: "Maria", buyerEval: 80, buyerFeedback: "Buena calidad, el velcro es firme y se ajusta bien.", images: [] },
      // Foto de un host que no es el CDN: se descarta la foto, no la reseña.
      { evaluationIdStr: "2", buyerEval: 100, buyerFeedback: "Excelente", images: ["https://evil.example.com/x.jpg"] },
      // Sin id: no se puede deduplicar, no entra.
      { buyerEval: 100, buyerFeedback: "Sin id" },
    ],
    filterInfo: {
      filterStatistic: [
        { filterCode: "all", filterCount: 43 },
        { filterCode: "image", filterCount: 3 },
      ],
    },
    productEvaluationStatistic: { evarageStar: 4.6, totalNum: 43 },
  },
};

describe("enlace", () => {
  it("lee el id de un enlace completo, de otros dominios y del número solo", () => {
    expect(extractItemId("https://es.aliexpress.com/item/1005012046725163.html?spm=a2g0o.productlist.main.4&algo_pvid=16de")).toBe("1005012046725163");
    expect(extractItemId("https://www.aliexpress.us/item/1005001.html")).toBe("1005001");
    expect(extractItemId("  1005012046725163 ")).toBe("1005012046725163");
  });

  it("reconoce el enlace corto de la app y rechaza otras tiendas", () => {
    expect(extractItemId("https://a.aliexpress.com/_mKtqRDA")).toBeNull();
    expect(isShortLink("https://a.aliexpress.com/_mKtqRDA")).toBe(true);
    expect(isAliExpressInput("https://a.aliexpress.com/_mKtqRDA")).toBe(true);
    expect(isAliExpressInput("https://www.amazon.com/dp/B0CXYZ")).toBe(false);
    expect(isAliExpressInput("https://example.com/item/123.html")).toBe(false);
  });

  it("pide “all” o “image” según “Solo con fotos”", () => {
    const all = new URL(buildFeedbackUrl({ itemId: "1005", page: 2, photosOnly: false }));
    expect(all.origin).toBe("https://feedback.aliexpress.com");
    expect(all.searchParams.get("page")).toBe("2");
    expect(all.searchParams.get("filter")).toBe("all");
    expect(all.searchParams.get("lang")).toBe("es_ES");
    expect(new URL(buildFeedbackUrl({ itemId: "1005", page: 1, photosOnly: true })).searchParams.get("filter")).toBe("image");
  });
});

describe("lectores", () => {
  it("convierte la nota de 0 a 100 en estrellas de 1 a 5", () => {
    expect(toStars(100)).toBe(5);
    expect(toStars(80)).toBe(4);
    expect(toStars(0)).toBe(1);
    expect(toStars(null)).toBe(5);
  });

  it("lee las fechas en español y no adivina otras", () => {
    expect(parseEvalDate("13 AGO 2026")).toBe("2026-08-13");
    expect(parseEvalDate("1 ene 2025")).toBe("2025-01-01");
    expect(parseEvalDate("13 AUG 2026")).toBeNull();
    expect(parseEvalDate("ayer")).toBeNull();
  });

  it("fija las fotos al CDN de AliExpress por https", () => {
    expect(isAllowedImageUrl("https://ae-pic-a1.aliexpress-media.com/kf/A.jpg")).toBe(true);
    expect(isAllowedImageUrl("https://ae01.alicdn.com/kf/A.jpg")).toBe(true);
    expect(isAllowedImageUrl("http://ae01.alicdn.com/kf/A.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://alicdn.com.evil.io/A.jpg")).toBe(false);
  });

  it("anonimiza al autor: primera y última letra", () => {
    expect(anonymize("j***r")).toBe("J***r");
    expect(anonymize("Maria")).toBe("M***a");
    expect(anonymize("Anónimo")).toBe("Cliente");
    expect(anonymize(null)).toBe("Cliente");
    expect(anonymize("A")).toBe("A***");
  });
});

describe("parseFeedbackPage", () => {
  const drafts = parseFeedbackPage(PAYLOAD);

  it("toma toda reseña con id, con o sin foto", () => {
    expect(drafts.map((d) => d.externalId)).toEqual(["30103016223438633", "50226444494510234", "1", "2"]);
    expect(drafts[3]!.photoUrls).toEqual([]);
  });

  it("normaliza lo que muestra la tarjeta y guarda el original", () => {
    expect(drafts[0]).toMatchObject({
      author: "J***r",
      country: "BE",
      rating: 5,
      variant: "Color:Rojo",
      reviewedAt: "2026-05-07",
      helpfulCount: 2,
      bodyOriginal: "Bon pommeau de douche. Le jet est puissant.",
      bodyTranslated: "Buen cabezal de ducha. El flujo de agua es potente.",
    });
  });

  it("país en mayúsculas, a lo más 3 fotos y sin traducción repetida", () => {
    expect(drafts[1]!.country).toBe("IL");
    expect(drafts[1]!.photoUrls).toHaveLength(3);
    expect(drafts[2]!.bodyTranslated).toBeNull();
  });

  it("aguanta una respuesta sin lista", () => {
    expect(parseFeedbackPage({})).toEqual([]);
    expect(parseFeedbackPage(null)).toEqual([]);
    expect(parseFeedbackPage({ data: { evaViewList: "nope" } })).toEqual([]);
  });
});

describe("filtros", () => {
  const drafts = parseFeedbackPage(PAYLOAD);
  const ids = (f: Parameters<typeof passesFilters>[1]) => drafts.filter((d) => passesFilters(d, f)).map((d) => d.externalId);

  it("4★ o más por defecto; “Solo 5★”; “Todas”", () => {
    expect(ids({ minRating: 4, photosOnly: false, translate: true })).toEqual(["30103016223438633", "1", "2"]);
    expect(ids({ minRating: 5, photosOnly: false, translate: true })).toEqual(["30103016223438633", "2"]);
    expect(ids({ minRating: 1, photosOnly: false, translate: true })).toHaveLength(4);
  });

  it("“Solo con fotos” deja fuera las que no traen una foto válida", () => {
    expect(ids({ minRating: 1, photosOnly: true, translate: true })).toEqual(["30103016223438633", "50226444494510234"]);
  });
});

describe("parseStats", () => {
  it("lee el promedio del listado, cuántas hay y el avance por filtro", () => {
    expect(parseStats(PAYLOAD)).toEqual({ avgRating: 4.6, totalReviews: 43, photoReviews: 3 });
    expect(parseTotalPages(PAYLOAD)).toBe(3);
    expect(parseFilterCount(PAYLOAD, false)).toBe(43);
    expect(parseFilterCount(PAYLOAD, true)).toBe(3);
  });

  it("cae a null con una respuesta desconocida", () => {
    expect(parseStats({})).toEqual({ avgRating: null, totalReviews: null, photoReviews: null });
    expect(parseTotalPages({})).toBe(1);
  });
});
