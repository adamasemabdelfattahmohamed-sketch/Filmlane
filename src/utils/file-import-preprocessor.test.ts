import { describe, expect, it } from "vitest";

import {
  computeImportedTextQualityScore,
  normalizeDocTextFromAntiword,
  preprocessImportedTextForClassifier,
} from "./file-import-preprocessor";

describe("file-import-preprocessor", () => {
  it("normalizes antiword wrapped lines and scene header spacing", () => {
    const raw = `مشهد1                                              نهار -داخلي
الشديد للغاية فالأثاث متهالك بشدة وقديم ويبدو ان هناك حالة من الرتابة
والجمود في ذلك المنزل واضحة للغاية

بوسي:`;

    const result = normalizeDocTextFromAntiword(raw);
    expect(result.text).toContain("مشهد 1 - نهار -داخلي");
    expect(result.text).toContain(
      "الشديد للغاية فالأثاث متهالك بشدة وقديم ويبدو ان هناك حالة من الرتابة والجمود في ذلك المنزل واضحة للغاية"
    );
    expect(result.applied).toContain("antiword-wrapped-lines-normalized");
  });

  it("preprocesses docx artifacts (tabs/spacing)", () => {
    const raw = `مشهد1\t\t\t\tنهار -داخلي
سطر   به    مسافات`;
    const result = preprocessImportedTextForClassifier(raw, "docx");
    expect(result.text).toContain("مشهد 1");
    expect(result.text).toContain("سطر به مسافات");
  });

  it("computes lower quality score for heavily wrapped text", () => {
    const weak = `مشهد1
وال
نص
مكسور`;
    const good = `مشهد 1 - داخلي - نهار
هذا سطر كامل منضبط.
أحمد:`;
    expect(computeImportedTextQualityScore(weak)).toBeLessThan(
      computeImportedTextQualityScore(good)
    );
  });
});
