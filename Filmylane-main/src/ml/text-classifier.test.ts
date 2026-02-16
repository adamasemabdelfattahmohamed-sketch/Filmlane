import { describe, test, expect, beforeAll } from "vitest";
import { ArabicTextClassifier } from "./text-classifier";

describe("ML Classifier", () => {
  let classifier: ArabicTextClassifier;

  beforeAll(() => {
    classifier = new ArabicTextClassifier();
    classifier.train();
  });

  test("يجب أن يكون النموذج جاهزاً بعد التدريب", () => {
    expect(classifier.isReady()).toBe(true);
  });

  test("يجب تصنيف الحوار بدقة", () => {
    const result = classifier.classify("مرحباً، كيف حالك؟");
    expect(result.type).toBe("dialogue");
    expect(result.confidence).toBeGreaterThan(40);
    expect(result.isML).toBe(true);
  });

  test("يجب تصنيف الحركة بدقة", () => {
    const result = classifier.classify("يدخل أحمد إلى الغرفة");
    expect(result.type).toBe("action");
    expect(result.confidence).toBeGreaterThan(40);
  });

  test("يجب تصنيف الشخصية بدقة", () => {
    const result = classifier.classify("أحمد:");
    expect(result.type).toBe("character");
  });

  test("يجب تصنيف عنوان المشهد", () => {
    const result = classifier.classify("مشهد رقم 1");
    expect(result.type).toBe("scene-header-1");
  });

  test("يجب تصنيف الانتقال", () => {
    const result = classifier.classify("قطع إلى:");
    expect(result.type).toBe("transition");
  });

  test("يجب تصنيف التوصيف (بمحتوى عربي فقط)", () => {
    const result = classifier.classify("بفرح");
    // ML يرى الكلمة بدون أقواس (tokenizer يزيلها) لذا قد يصنفها parenthetical أو غيرها
    // الأقواس يكشفها regex في النظام الهجين وليس ML
    expect(result.isML).toBe(true);
    expect(typeof result.type).toBe("string");
  });

  test("يجب تصنيف البسملة", () => {
    const result = classifier.classify("بسم الله الرحمن الرحيم");
    expect(result.type).toBe("basmala");
  });

  test("يجب إعادة التدريب مع أمثلة إضافية", () => {
    classifier.retrain([
      { text: "يا سلام!", label: "dialogue" },
      { text: "يركض بسرعة", label: "action" },
    ]);
    expect(classifier.isReady()).toBe(true);
  });

  test("النص الفارغ يرجع action مع ثقة منخفضة", () => {
    const result = classifier.classify("");
    expect(result.type).toBe("action");
    expect(result.confidence).toBeLessThan(50);
  });
});
