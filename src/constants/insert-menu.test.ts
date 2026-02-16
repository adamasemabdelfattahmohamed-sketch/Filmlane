import { describe, expect, it } from "vitest";

import { insertMenuDefinitions } from "./insert-menu";
import { EDITOR_STYLE_FORMAT_IDS } from "@/utils";

describe("insert menu definitions", () => {
  it("contains all required 10 insert items in the expected order", () => {
    expect(insertMenuDefinitions).toHaveLength(10);
    expect(insertMenuDefinitions.map((item) => item.label)).toEqual([
      "بسملة",
      "رأس المشهد (1)",
      "رأس المشهد 2",
      "رأس المشهد 3",
      "الوصف/الحركة",
      "اسم الشخصية",
      "الحوار",
      "تعليمات الحوار",
      "الانتقال",
      "فوتو مونتاج",
    ]);
  });

  it("maps every menu item to a valid editor-styles format id", () => {
    const expectedIds = [
      "basmala",
      "scene-header-1",
      "scene-header-2",
      "scene-header-3",
      "action",
      "character",
      "dialogue",
      "parenthetical",
      "transition",
      "scene-header-top-line",
    ] as const;

    expect(insertMenuDefinitions.map((item) => item.id)).toEqual(expectedIds);

    const knownIds = new Set<string>(EDITOR_STYLE_FORMAT_IDS);
    for (const item of insertMenuDefinitions) {
      expect(knownIds.has(item.id)).toBe(true);
    }
  });
});
