/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeAll, vi } from "vitest";
import { HybridClassifier } from "./classification-core";
import { ContextMemoryManager } from "./context-memory-manager";
import { FeedbackCollector } from "./feedback-collector";
import { handlePaste } from "./paste-classifier";
import { normalizeLine } from "./text-utils";
import {
  SCENE_NUMBER_RE,
  SCENE_TIME_RE,
  SCENE_LOCATION_RE,
  TRANSITION_RE,
  PARENTHETICAL_RE,
} from "./arabic-patterns";
import type { LineContext } from "@/types/screenplay";

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

/**
 * بناء سياق كامل لسطر معين ضمن مجموعة أسطر
 * Uses shared normalizeLine from text-utils
 */
const buildTestContext = (
  lines: string[],
  index: number,
  previousTypes: string[]
): LineContext => {
  const line = lines[index] || "";
  const trimmed = line.trim();
  // Use shared normalizeLine from text-utils
  const normalized = normalizeLine(trimmed);

  return {
    previousLines: lines.slice(Math.max(0, index - 3), index),
    currentLine: line,
    nextLines: lines.slice(index + 1, index + 4),
    previousTypes,
    stats: {
      wordCount: normalized.split(/\s+/).filter(Boolean).length,
      charCount: trimmed.length,
      hasColon: trimmed.includes(":") || trimmed.includes("："),
      hasPunctuation: /[.!?،؛]/.test(trimmed),
      startsWithBullet: /^[•·∙⋅●○◦■□]/.test(line),
      isShort: trimmed.length < 30,
      isLong: trimmed.length > 100,
    },
    pattern: {
      isInDialogueBlock: previousTypes
        .slice(-3)
        .some(
          (t) => t === "character" || t === "dialogue" || t === "parenthetical"
        ),
      isInSceneHeader: [
        "scene-header-1",
        "scene-header-2",
        "scene-header-top-line",
      ].includes(previousTypes[previousTypes.length - 1] || ""),
      lastSceneDistance: -1,
      lastCharacterDistance: -1,
    },
  };
};

describe("Full Integration Test", () => {
  let hybrid: HybridClassifier;
  let memoryManager: ContextMemoryManager;

  beforeAll(() => {
    localStorageMock.clear();
    memoryManager = new ContextMemoryManager();
    hybrid = new HybridClassifier(memoryManager);
    hybrid.initialize();
  });

  test("يجب معالجة نص سيناريو كامل بنجاح", async () => {
    // Updated test data to match the actual SCENE_NUMBER_RE pattern
    // SCENE_NUMBER_RE = /(?:مشهد|scene)\s*([0-9٠-٩]+)/i
    // This matches "مشهد 1" but NOT "مشهد رقم 1"
    const lines = [
      "مشهد 1", // scene-header-1 (matches SCENE_NUMBER_RE)
      "داخلي - بيت أحمد - نهار", // scene-header-2
      "يدخل أحمد إلى الغرفة.", // action
      "أحمد:", // character
      "مرحباً يا سارة.", // dialogue
      "سارة:", // character
      "(بفرح)", // parenthetical
      "أهلاً بك!", // dialogue
      "قطع إلى:", // transition
    ];

    const expectedTypes = [
      "scene-header-1",
      "scene-header-2",
      "action",
      "character",
      "dialogue",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
    ];

    const classifiedTypes: string[] = [];
    const sessionId = "integration-test";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const ctx = buildTestContext(lines, i, classifiedTypes);

      // تصنيف regex بسيط للتمرير إلى النظام الهجين
      // Uses shared regex constants from arabic-patterns
      let regexType = "action";
      if (SCENE_NUMBER_RE.test(line)) regexType = "scene-header-1";
      else if (SCENE_LOCATION_RE.test(line) && SCENE_TIME_RE.test(line))
        regexType = "scene-header-2";
      else if (TRANSITION_RE.test(line)) regexType = "transition";
      else if (PARENTHETICAL_RE.test(line)) regexType = "parenthetical";
      else if (/[:：]\s*$/.test(line) && line.length < 30)
        regexType = "character";
      else if (classifiedTypes[classifiedTypes.length - 1] === "character")
        regexType = "dialogue";
      else if (classifiedTypes[classifiedTypes.length - 1] === "parenthetical")
        regexType = "dialogue";

      const result = await hybrid.classifyLine(line, regexType, ctx, sessionId);
      classifiedTypes.push(result.type);
    }

    // التحقق من التصنيفات الصحيحة
    expect(classifiedTypes[0]).toBe(expectedTypes[0]); // scene-header-1
    expect(classifiedTypes[1]).toBe(expectedTypes[1]); // scene-header-2
    expect(classifiedTypes[2]).toBe(expectedTypes[2]); // action
    expect(classifiedTypes[3]).toBe(expectedTypes[3]); // character
    expect(classifiedTypes[4]).toBe(expectedTypes[4]); // dialogue
    expect(classifiedTypes[5]).toBe(expectedTypes[5]); // character
    expect(classifiedTypes[6]).toBe(expectedTypes[6]); // parenthetical
    expect(classifiedTypes[7]).toBe(expectedTypes[7]); // dialogue
    expect(classifiedTypes[8]).toBe(expectedTypes[8]); // transition
  });

  test("يجب أن يعمل FeedbackCollector", () => {
    const collector = new FeedbackCollector();
    collector.clearCorrections();

    collector.addCorrection("نعم", "action", "dialogue", 45);
    collector.addCorrection("لا", "action", "dialogue", 40);

    expect(collector.getCorrectionCount()).toBe(2);

    const exported = collector.exportForTraining();
    expect(exported).toHaveLength(2);
    expect(exported[0]).toEqual({ text: "نعم", label: "dialogue" });
    expect(exported[1]).toEqual({ text: "لا", label: "dialogue" });
  });

  test("يجب إعادة التدريب بالتصحيحات وتحسين النتائج", () => {
    const corrections = [
      { text: "أيوه", label: "dialogue" },
      { text: "معلش", label: "dialogue" },
      { text: "خلاص", label: "dialogue" },
    ];

    expect(() => {
      hybrid.retrainWithCorrections(corrections);
    }).not.toThrow();
    expect(hybrid.isReady()).toBe(true);
  });

  test("يجب التعامل مع نص فارغ", async () => {
    const ctx = buildTestContext([""], 0, []);
    const result = await hybrid.classifyLine("", "action", ctx, "test");
    expect(result.type).toBeDefined();
  });

  test("يجب التعامل مع سياق حوار مستمر", async () => {
    const lines = ["أحمد:", "مرحباً", "كيف حالك؟", "أنا بخير"];
    const types: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const ctx = buildTestContext(lines, i, types);
      let regexType = "action";
      if (/[:：]\s*$/.test(lines[i]) && lines[i].length < 30)
        regexType = "character";
      else if (
        types[types.length - 1] === "character" ||
        types[types.length - 1] === "dialogue"
      )
        regexType = "dialogue";

      const result = await hybrid.classifyLine(
        lines[i],
        regexType,
        ctx,
        "dialogue-test"
      );
      types.push(result.type);
    }

    expect(types[0]).toBe("character");
    expect(types[1]).toBe("dialogue");
    expect(types[2]).toBe("dialogue");
    expect(types[3]).toBe("dialogue");
  });

  test("يجب عدم تحويل الأكشن الواضح إلى dialogue داخل بلوك الحوار", async () => {
    const originalClassify = (hybrid as any).mlClassifier.classify;
    (hybrid as any).mlClassifier.classify = () => ({
      type: "dialogue",
      confidence: 10,
      isML: true,
    });

    try {
      const lines = ["أحمد:", "مرحباً", "يدخل أحمد إلى الغرفة."];
      const ctx = buildTestContext(lines, 2, ["character", "dialogue"]);
      const result = await hybrid.classifyLine(
        lines[2],
        "action",
        ctx,
        "action-inside-dialogue"
      );
      expect(result.type).toBe("action");
    } finally {
      (hybrid as any).mlClassifier.classify = originalClassify;
    }
  });

  test("يجب دمج اسم الشخصية المكسور (مثل: الا + سطى:) مع تجاهل العلامات غير المرئية وأنواع النقطتين", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "الا\nسطى﹕\u200f" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "merge-broken-character-name"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs).toHaveLength(1);
    expect(lineDivs[0]?.className).toBe("format-character");
    expect(lineDivs[0]?.textContent?.trim()).toBe("الاسطى:");

    editor.remove();
  });

  test("يجب كشف الأكشن داخل بلوك الحوار (وهو مازال يتوضأ) وعدم تصنيفه كـ dialogue", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "أحمد:\nمرحبا\nوهو مازال يتوضأ" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "action-inside-dialogue-block"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "أحمد:",
      "مرحبا",
      "وهو مازال يتوضأ",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-action",
    ]);

    editor.remove();
  });

  test("يجب تجاهل @dom-element artifacts أثناء اللصق", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "@dom-element:div\nأحمد:\nمرحبا\n@dom-element:div"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "ignore-dom-artifacts"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "أحمد:",
      "مرحبا",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("لا اعرف بعد اسم شخصية يجب أن تبقى dialogue (مش action)", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "أحمد:\nلا اعرف" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "negation-dialogue-guard"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "أحمد:",
      "لا اعرف",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("لا يتحرك كسرد مستقل يجب أن تبقى action", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "لا يتحرك" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "negation-narrative-action"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual(["لا يتحرك"]);
    expect(lineDivs.map((d) => d.className)).toEqual(["format-action"]);

    editor.remove();
  });

  test("مؤشر مسموع سردي يجب أن يتصنف action", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "صوت إطلاق نار في الخارج" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "audio-narrative-action"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "صوت إطلاق نار في الخارج",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual(["format-action"]);

    editor.remove();
  });

  test("أنا سامعك بعد اسم شخصية يجب أن تبقى dialogue", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "أحمد:\nأنا سامعك" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "direct-speech-not-action"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "أحمد:",
      "أنا سامعك",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("اسم داخل سطر وصفي يجب أن يبقى action وليس character", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "تخرج نهال سماحة من الباب" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "name-inside-action"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "تخرج نهال سماحة من الباب",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual(["format-action"]);

    editor.remove();
  });

  test("character بدون نقطتين يجب ألا يفتح بلوك حوار", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "نور\nأنا هنا" : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "character-needs-colon"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "نور",
      "أنا هنا",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-action",
      "format-action",
    ]);

    editor.remove();
  });

  test("داخل بلوك الحوار: اسم الشخصية في بداية السطر بدون نقطتين يجب فصله إلى character ثم dialogue", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "عبد العزيز:\nأنا سامعك\nجهيمان لو كلهم مثلك يا عبد العزيز ... لسيطرت على الحجاز كله و ليس ..."
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "implicit-speaker-without-colon-inside-dialogue"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "عبد العزيز:",
      "أنا سامعك",
      "جهيمان:",
      "لو كلهم مثلك يا عبد العزيز ... لسيطرت على الحجاز كله و ليس ...",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("داخل بلوك الحوار: لا يجب فصل كلمات النفي/الاستفهام كاسم شخصية (لن/اين)", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "عبد العزيز:\nلن اسأل .. فأقد ملك عدم الاجابة ...\nاين هو .. لم اراه من الامس"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "implicit-speaker-guard-no-negation-interrogative"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "عبد العزيز:",
      "لن اسأل .. فأقد ملك عدم الاجابة ...",
      "اين هو .. لم اراه من الامس",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("لا يتم دمج أسطر الأكشن المستقلة تلقائياً", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain" ? "يدخل أحمد إلى الغرفة.\nينظر حوله." : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "no-action-overmerge"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "يدخل أحمد إلى الغرفة.",
      "ينظر حوله.",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-action",
      "format-action",
    ]);

    editor.remove();
  });

  test("أفعال السرد داخل بلوك الحوار يجب أن تُحسم action (حالة واقعية)", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "محمود:\nأنا معاك\nيرفع محمود يده معترضا\nينهض منصف من على الارض ليقف بجوار بوسي\nيقف بجوارها محمود"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "realistic-action-inside-dialogue-block"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "محمود:",
      "أنا معاك",
      "يرفع محمود يده معترضا",
      "ينهض منصف من على الارض ليقف بجوار بوسي",
      "يقف بجوارها محمود",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-action",
      "format-action",
      "format-action",
    ]);

    editor.remove();
  });

  test("دمج الا + سطى: يجب ينجح حتى مع أسطر @dom-element بينهما", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "@dom-element:div\nالا\n@dom-element:div\nسطى:\n@dom-element:div"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "broken-name-with-dom-artifacts"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs).toHaveLength(1);
    expect(lineDivs[0]?.textContent?.trim()).toBe("الاسطى:");
    expect(lineDivs[0]?.className).toBe("format-character");

    editor.remove();
  });

  test("يجب دمج الأسماء المكسورة قبل النقطتين حتى لو الجزء الأخير حرف/حرفين (جهيما+ن:، خا+لد:...)", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "@dom-element:div\nجهيما\nن:\nنا\nيف:\nالقحطا\nني:\nخا\nلد:\n@dom-element:div"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "merge-broken-character-names-alif-cases"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "جهيمان:",
      "نايف:",
      "القحطاني:",
      "خالد:",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-character",
      "format-character",
      "format-character",
    ]);

    editor.remove();
  });

  test("لا يجب تقسيم اسم الشخصية قبل النقطتين الملتصقة (جهيمان:تسلمتهم ونظائره)", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "جهيمان:تسلمتهم\nنايف:جاهز\nخالد:حاضر\nالقحطاني:ادخل يا جهيمان"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "no-inline-name-split-before-colon"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "جهيمان:",
      "تسلمتهم",
      "نايف:",
      "جاهز",
      "خالد:",
      "حاضر",
      "القحطاني:",
      "ادخل يا جهيمان",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-character",
      "format-dialogue",
      "format-character",
      "format-dialogue",
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("يجب دمج اسم الشخصية المكسور حتى مع سطور HTML منسوخة من المحرر", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? '<div class="format-action" data-paste-index="1">يبتسم جهيمان</div>\n<div class="format-action" data-paste-index="2">جهيما</div>\n<div class="format-character" data-paste-index="3">ن:</div>\n<div class="format-dialogue" data-paste-index="4">بين عينه و الرشاشها</div>'
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "merge-broken-character-with-html-artifacts"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "يبتسم جهيمان",
      "جهيمان:",
      "بين عينه و الرشاشها",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-action",
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("يجب تجاهل سطر وسيط من علامات اتجاه غير مرئية بين جزئي الاسم", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "يبتسم جهيمان\nجهيما\n\u200f\nن:\nبين عينه و الرشاشها"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "merge-broken-character-with-rtl-mark-line"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "يبتسم جهيمان",
      "جهيمان:",
      "بين عينه و الرشاشها",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-action",
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });

  test("تصدم هند... بين سطرين حوار يجب أن تتحسم action بدون الاعتماد على الشرطة", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const e = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn((type: string) =>
          type === "text/plain"
            ? "صبري : وده هيحصل ازاي لو عملناها .. ما هيتعرف وهنروح في داهية كلنا في داهية يا محمود\nتصدم هند وتتركه لتجلس بجوار مرمر\nبوسي : الدكتور محذرني ان ابرة الجلوكوز تفضل طول الوقت متعلقة"
            : ""
        ),
      },
    } as any;

    const updateContentFn = vi.fn();

    await handlePaste(
      e,
      { current: editor } as any,
      () => ({}) as any,
      updateContentFn,
      null,
      "sandwiched-narrative-action-without-dash"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const lineDivs = Array.from(editor.querySelectorAll("div"));
    expect(lineDivs.map((d) => d.textContent?.trim())).toEqual([
      "صبري:",
      "وده هيحصل ازاي لو عملناها .. ما هيتعرف وهنروح في داهية كلنا في داهية يا محمود",
      "تصدم هند وتتركه لتجلس بجوار مرمر",
      "بوسي:",
      "الدكتور محذرني ان ابرة الجلوكوز تفضل طول الوقت متعلقة",
    ]);
    expect(lineDivs.map((d) => d.className)).toEqual([
      "format-character",
      "format-dialogue",
      "format-action",
      "format-character",
      "format-dialogue",
    ]);

    editor.remove();
  });
});
