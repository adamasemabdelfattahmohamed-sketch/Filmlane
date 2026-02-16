import { describe, test, expect } from "vitest";
import {
  cleanInvisibleChars,
  normalizeLine,
  normalizeCharacterName,
} from "./text-utils";

describe("text-utils", () => {
  test("cleanInvisibleChars يزيل علامات الاتجاه والمحارف غير المرئية مع الحفاظ على فواصل الأسطر", () => {
    const input = `جهيما\u200f\n\u200eن:\u061C`;
    const cleaned = cleanInvisibleChars(input);
    expect(cleaned).toBe("جهيما\nن:");
  });

  test("normalizeLine يوحّد النقطتين ويزيل الفراغات غير اللازمة", () => {
    const input = "  عبد   العزيز  ：  ";
    expect(normalizeLine(input)).toBe("عبد العزيز:");
  });

  test("normalizeCharacterName يزيل النقطتين النهائية من اسم الشخصية", () => {
    const input = "  جهيمان:  ";
    expect(normalizeCharacterName(input)).toBe("جهيمان");
  });
});
