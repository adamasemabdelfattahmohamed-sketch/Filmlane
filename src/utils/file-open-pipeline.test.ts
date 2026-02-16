import { describe, expect, it } from "vitest";
import type { FileExtractionResult } from "@/types/file-import";
import { buildFileOpenPipelineAction } from "./file-open-pipeline";

const baseExtraction = (
  overrides: Partial<FileExtractionResult>
): FileExtractionResult => ({
  text: "",
  fileType: "docx",
  method: "mammoth",
  usedOcr: false,
  warnings: [],
  attempts: ["mammoth"],
  ...overrides,
});

describe("buildFileOpenPipelineAction", () => {
  it("prefers structured blocks direct import when blocks and text are present", () => {
    const action = buildFileOpenPipelineAction(
      baseExtraction({
        method: "app-payload",
        text: "مشهد 1\nوصف الحدث",
        structuredBlocks: [
          { formatId: "scene-header-1", text: "مشهد 1" },
          { formatId: "action", text: "وصف الحدث" },
        ],
      }),
      "replace"
    );

    expect(action.kind).toBe("import-structured-blocks");
    if (action.kind !== "import-structured-blocks") return;
    expect(action.blocks).toHaveLength(2);
    expect(action.toast.description).toContain("استيراد التنسيق البنيوي");
    expect(action.toast.description).toContain("Filmlane 1:1");
    expect(action.telemetry.openPipeline).toBe("structured-direct");
    expect(action.telemetry.source).toBe("structured-blocks");
    expect(action.telemetry.preprocessedSteps).toEqual([]);
  });

  it("imports structured blocks when extraction text is empty", () => {
    const action = buildFileOpenPipelineAction(
      baseExtraction({
        text: "",
        fileType: "doc",
        structuredBlocks: [
          { formatId: "scene-header-1", text: "مشهد1" },
          { formatId: "action", text: "وصف" },
        ],
      }),
      "replace"
    );

    expect(action.kind).toBe("import-structured-blocks");
    if (action.kind !== "import-structured-blocks") return;
    expect(action.blocks[0]?.text).toBe("مشهد1");
    expect(action.telemetry.openPipeline).toBe("structured-direct");
    expect(action.telemetry.source).toBe("structured-blocks");
    expect(action.telemetry.preprocessedSteps).toEqual([]);
  });

  it("rejects empty extraction text with destructive toast", () => {
    const action = buildFileOpenPipelineAction(
      baseExtraction({
        text: "   ",
        structuredBlocks: undefined,
      }),
      "insert"
    );

    expect(action.kind).toBe("reject");
    if (action.kind !== "reject") return;
    expect(action.toast.variant).toBe("destructive");
    expect(action.toast.title).toBe("ملف فارغ");
  });

  it("returns paste-like classified import action when text exists", () => {
    const action = buildFileOpenPipelineAction(
      baseExtraction({
        fileType: "doc",
        text: "مشهد1 داخلي - نهار",
        warnings: ["تنبيه اختباري"],
      }),
      "replace"
    );

    expect(action.kind).toBe("import-classified-text");
    if (action.kind !== "import-classified-text") return;
    expect(action.text).toContain("مشهد1");
    expect(action.toast.description).toContain("تنبيه اختباري");
    expect(action.telemetry.openPipeline).toBe("paste-classifier");
    expect(action.telemetry.preprocessedSteps).toEqual([]);
  });
});
