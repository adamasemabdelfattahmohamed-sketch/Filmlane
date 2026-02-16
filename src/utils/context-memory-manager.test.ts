import { describe, test, expect, beforeEach, vi } from "vitest";
import { ContextMemoryManager } from "./context-memory-manager";
import type { EnhancedContextMemory } from "./context-memory-manager";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("Enhanced Context Memory", () => {
  let manager: ContextMemoryManager;
  const sessionId = "test-session";

  beforeEach(() => {
    manager = new ContextMemoryManager();
    localStorageMock.clear();
  });

  test("يجب إنشاء ContextMemoryManager بنجاح", () => {
    expect(manager).toBeDefined();
  });

  test("يجب حفظ وتحميل الذاكرة", async () => {
    const memory: EnhancedContextMemory = {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: ["أحمد", "سارة"],
        commonLocations: [],
        lastClassifications: ["character", "dialogue"],
        characterDialogueMap: { أحمد: 5 },
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };

    await manager.saveContext(sessionId, memory);
    const loaded = await manager.loadContext(sessionId);

    expect(loaded).not.toBeNull();
    expect(loaded!.data.commonCharacters).toEqual(["أحمد", "سارة"]);
    expect(loaded!.data.characterDialogueMap["أحمد"]).toBe(5);
  });

  test("يجب حفظ في localStorage وتحميل منه", async () => {
    const memory: EnhancedContextMemory = {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: ["خالد"],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };

    await manager.saveContext(sessionId, memory);
    expect(localStorageMock.setItem).toHaveBeenCalled();

    // إنشاء manager جديد وتحميل من localStorage
    const manager2 = new ContextMemoryManager();
    const loaded = await manager2.loadContext(sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.data.commonCharacters).toEqual(["خالد"]);
  });

  test("يجب تتبع كتل الحوار", async () => {
    const memory: EnhancedContextMemory = {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: [],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };
    await manager.saveContext(sessionId, memory);

    manager.trackDialogueBlock(sessionId, "أحمد", 1, 3);
    const loaded = await manager.loadContext(sessionId);
    expect(loaded!.data.dialogueBlocks).toHaveLength(1);
    expect(loaded!.data.dialogueBlocks[0].character).toBe("أحمد");
    expect(loaded!.data.dialogueBlocks[0].lineCount).toBe(3);
  });

  test("يجب إضافة تصحيحات المستخدم", async () => {
    const memory: EnhancedContextMemory = {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: [],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };
    await manager.saveContext(sessionId, memory);

    manager.addUserCorrection(sessionId, {
      line: "نعم",
      originalType: "action",
      correctedType: "dialogue",
      confidence: 45,
      timestamp: Date.now(),
    });

    const corrections = manager.getUserCorrections(sessionId);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].correctedType).toBe("dialogue");
  });

  test("يجب تحديث الذاكرة مع تصنيفات جديدة", async () => {
    await manager.updateMemory(sessionId, [
      { line: "أحمد:", classification: "character", timestamp: Date.now() },
      { line: "مرحباً", classification: "dialogue", timestamp: Date.now() },
    ]);

    const loaded = await manager.loadContext(sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.data.commonCharacters).toContain("أحمد");
    expect(loaded!.data.lastClassifications).toContain("character");
    expect(loaded!.data.characterDialogueMap["أحمد"]).toBe(1);
  });

  test("يجب كشف الأنماط المتكررة", async () => {
    await manager.updateMemory(sessionId, [
      { line: "أحمد:", classification: "character", timestamp: Date.now() },
      { line: "مرحباً", classification: "dialogue", timestamp: Date.now() },
      { line: "سارة:", classification: "character", timestamp: Date.now() },
      { line: "أهلاً", classification: "dialogue", timestamp: Date.now() },
      { line: "خالد:", classification: "character", timestamp: Date.now() },
      { line: "كيف حالك", classification: "dialogue", timestamp: Date.now() },
    ]);

    const pattern = manager.detectPattern(sessionId);
    // character-dialogue يتكرر 3 مرات
    expect(pattern).not.toBeNull();
  });

  test("يجب تحديث ثقة التصنيف", async () => {
    const memory: EnhancedContextMemory = {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: [],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };
    await manager.saveContext(sessionId, memory);

    manager.updateConfidence(sessionId, "نعم", 45);
    const loaded = await manager.loadContext(sessionId);
    expect(loaded!.data.confidenceMap["نعم"]).toBe(45);
  });
});
