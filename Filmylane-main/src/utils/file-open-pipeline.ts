import type { FileExtractionResult, FileImportMode } from "@/types/file-import";
import type { ScreenplayBlock } from "./document-model";

type SuccessVariant = "default";
type ErrorVariant = "destructive";

type FileOpenToast = {
  title: string;
  description: string;
  variant?: SuccessVariant | ErrorVariant;
};

type FileOpenPipelineTelemetry = {
  openPipeline: "paste-classifier" | "structured-direct";
  method: FileExtractionResult["method"];
  source: "structured-blocks" | "extracted-text";
  usedOcr: boolean;
  qualityScore?: number;
  warnings: string[];
  preprocessedSteps: string[];
};

type ImportClassifiedAction = {
  kind: "import-classified-text";
  mode: FileImportMode;
  text: string;
  toast: FileOpenToast;
  telemetry: FileOpenPipelineTelemetry;
};

type ImportStructuredAction = {
  kind: "import-structured-blocks";
  mode: FileImportMode;
  blocks: ScreenplayBlock[];
  toast: FileOpenToast;
  telemetry: FileOpenPipelineTelemetry;
};

type RejectAction = {
  kind: "reject";
  mode: FileImportMode;
  toast: FileOpenToast & { variant: ErrorVariant };
  telemetry: FileOpenPipelineTelemetry;
};

export type FileOpenPipelineAction =
  | ImportStructuredAction
  | ImportClassifiedAction
  | RejectAction;

const buildModeLabel = (mode: FileImportMode): string =>
  mode === "replace" ? "تم فتح" : "تم إدراج";

const buildTelemetry = (
  extraction: FileExtractionResult,
  source: FileOpenPipelineTelemetry["source"],
  openPipeline: FileOpenPipelineTelemetry["openPipeline"]
): FileOpenPipelineTelemetry => ({
  openPipeline,
  method: extraction.method,
  source,
  usedOcr: extraction.usedOcr,
  qualityScore: extraction.qualityScore,
  warnings: extraction.warnings,
  preprocessedSteps: [],
});

export function buildFileOpenPipelineAction(
  extraction: FileExtractionResult,
  mode: FileImportMode
): FileOpenPipelineAction {
  const modeLabel = buildModeLabel(mode);
  const normalizedBlocks = (extraction.structuredBlocks ?? [])
    .map((block) => ({
      ...block,
      text: (block.text || "").trim(),
    }))
    .filter((block) => block.text.length > 0);

  if (normalizedBlocks.length > 0) {
    let description = `${modeLabel} الملف بنجاح\nتم استيراد التنسيق البنيوي مباشرة`;
    if (extraction.usedOcr) {
      description += " (تم استخدام OCR)";
    }
    if (extraction.method === "app-payload") {
      description += "\n(تم استرجاع بنية Filmlane 1:1)";
    }
    if (extraction.warnings.length > 0) {
      description += `\n⚠️ ${extraction.warnings[0]}`;
    }

    return {
      kind: "import-structured-blocks",
      mode,
      toast: {
        title: modeLabel,
        description,
      },
      blocks: normalizedBlocks,
      telemetry: buildTelemetry(extraction, "structured-blocks", "structured-direct"),
    };
  }

  const sourceText = extraction.text ?? "";
  if (!sourceText.trim()) {
    return {
      kind: "reject",
      mode,
      toast: {
        title: "ملف فارغ",
        description: "لم يتم العثور على نص في الملف المحدد.",
        variant: "destructive",
      },
      telemetry: buildTelemetry(extraction, "extracted-text", "paste-classifier"),
    };
  }

  let description = `${modeLabel} الملف بنجاح\nتم تطبيق تصنيف اللصق`;
  if (extraction.usedOcr) {
    description += " (تم استخدام OCR)";
  }
  if (extraction.method === "app-payload") {
    description += "\n(لم تتوفر كتل بنيوية قابلة للاسترجاع المباشر)";
  }
  if (extraction.warnings.length > 0) {
    description += `\n⚠️ ${extraction.warnings[0]}`;
  }

  return {
    kind: "import-classified-text",
    mode,
    text: sourceText,
    toast: {
      title: modeLabel,
      description,
    },
    telemetry: buildTelemetry(extraction, "extracted-text", "paste-classifier"),
  };
}
