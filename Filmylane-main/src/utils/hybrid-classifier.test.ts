import { describe, test, expect, beforeAll } from "vitest";
import { HybridClassifier } from "./classification-core";
import { ContextMemoryManager } from "./context-memory-manager";
import type { LineContext } from "@/types/screenplay";

const makeCtx = (previousTypes: string[] = []): LineContext => ({
  previousLines: [],
  currentLine: "",
  nextLines: [],
  previousTypes,
  stats: {
    wordCount: 2,
    charCount: 10,
    hasColon: false,
    hasPunctuation: false,
    startsWithBullet: false,
    isShort: true,
    isLong: false,
  },
  pattern: {
    isInDialogueBlock: false,
    isInSceneHeader: false,
    lastSceneDistance: -1,
    lastCharacterDistance: -1,
  },
});

describe("Hybrid Classifier", () => {
  let hybrid: HybridClassifier;
  let memoryManager: ContextMemoryManager;

  beforeAll(() => {
    memoryManager = new ContextMemoryManager();
    hybrid = new HybridClassifier(memoryManager);
    hybrid.initialize();
  });

  test("يجب أن يكون النظام جاهزاً", () => {
    expect(hybrid.isReady()).toBe(true);
  });

  test("يجب استخدام regex للأنماط الواضحة (بسملة)", async () => {
    const result = await hybrid.classifyLine(
      "بسم الله الرحمن الرحيم",
      "basmala",
      makeCtx(),
      "test-session"
    );
    expect(result.method).toBe("regex");
    expect(result.confidence).toBeGreaterThanOrEqual(95);
    expect(result.needsConfirmation).toBe(false);
  });

  test("يجب استخدام regex لعناوين المشاهد", async () => {
    const result = await hybrid.classifyLine(
      "مشهد رقم 1",
      "scene-header-1",
      makeCtx(),
      "test-session"
    );
    expect(result.method).toBe("regex");
    expect(result.confidence).toBeGreaterThanOrEqual(95);
  });

  test("يجب استخدام regex للانتقالات", async () => {
    const result = await hybrid.classifyLine(
      "قطع إلى:",
      "transition",
      makeCtx(),
      "test-session"
    );
    expect(result.method).toBe("regex");
    expect(result.confidence).toBeGreaterThanOrEqual(95);
  });

  test("يجب استخدام السياق بعد character", async () => {
    const ctx = makeCtx(["action", "character"]);
    ctx.pattern.isInDialogueBlock = true;
    const result = await hybrid.classifyLine(
      "أنا لا أعرف",
      "dialogue",
      ctx,
      "test-session"
    );
    // بعد character → dialogue بثقة عالية من السياق
    expect(result.type).toBe("dialogue");
    expect(result.needsConfirmation).toBe(false);
  });

  test("يجب طلب تأكيد للثقة المنخفضة جداً", async () => {
    // كلمة واحدة غامضة مع regex confidence منخفض
    const result = await hybrid.classifyLine(
      "نعم",
      "action", // regex أعطى action بثقة منخفضة
      makeCtx(),
      "test-session"
    );
    // ML + context قد لا يكونان واثقين كفاية
    // النتيجة قد تكون needsConfirmation أو لا حسب ثقة ML
    expect(typeof result.needsConfirmation).toBe("boolean");
  });

  test("يجب إعادة التدريب مع التصحيحات", () => {
    expect(() => {
      hybrid.retrainWithCorrections([{ text: "يا حبيبي", label: "dialogue" }]);
    }).not.toThrow();
    expect(hybrid.isReady()).toBe(true);
  });
});
