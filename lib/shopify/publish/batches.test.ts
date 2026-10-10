import { describe, expect, it } from "vitest";
import { metafieldBatches } from "./batches";
import { CATALOG } from "../components/catalog";
import {
  landingAtomicGroups,
  landingAtomicKeys,
  type PublishInput,
} from "./mapping";

describe("Publicación atómica de variantes", () => {
  const entry = (key: string) => ({ namespace: "dropflex", key });
  it("mantiene JSON e imágenes juntos aunque caigan a ambos lados del límite del lote", () => {
    const list = [
      ...Array.from({ length: 24 }, (_, i) => entry(`shared_${i}`)),
      entry("content"),
      entry("files"),
    ];
    const batches = metafieldBatches(list, ["content", "files"]);
    expect(batches.map((b) => b.length)).toEqual([24, 2]);
    expect(batches[1].map((m) => m.key)).toEqual(["content", "files"]);
    expect(batches.flat()).toHaveLength(list.length);
    expect(metafieldBatches(list).map((b) => b.length)).toEqual([25, 1]);
  });
  it("rechaza un grupo imposible antes de entregar cualquier lote", () => {
    const list = Array.from({ length: 26 }, (_, i) => entry(`variant_${i}`));
    expect(() =>
      metafieldBatches(
        list,
        list.map((m) => m.key),
      ),
    ).toThrow("25");
  });
  it("publica el catálogo completo sin separar contenido y archivos ni exceder 25", () => {
    const variant = {
      key: "default",
      angle_id: null,
      hook_id: null,
      content: {},
    };
    const input = {
      listingVariants: [variant],
      components: CATALOG.map((c) => ({
        id: c.id,
        content: [variant],
        images: {},
      })),
      experienceManifest: {},
    } as PublishInput;
    const groups = landingAtomicGroups(input),
      keys = landingAtomicKeys(input);
    const list = [...new Set([...groups.flat(), ...keys])].map(entry);
    const batches = metafieldBatches(list, keys, groups);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((b) => b.length <= 25)).toBe(true);
    expect(batches.flat()).toHaveLength(list.length);
    for (const group of groups)
      expect(
        batches.some((b) => group.every((k) => b.some((m) => m.key === k))),
      ).toBe(true);
    expect(batches.at(-1)?.map((m) => m.key)).toEqual(keys);
  });
});
