/**
 * file-extraction.ts - منطق استخراج النصوص من الملفات (Server-side)
 * يدعم: txt, fountain, fdx, docx, pdf, doc
 */

import type {
  ExtractionMethod,
  FileExtractionResult,
  ImportedFileType,
} from "@/types/file-import";
import type { ScreenplayBlock } from "./document-model";
import {
  extractPayloadFromText,
} from "./document-model";
import {
  computeImportedTextQualityScore,
} from "./file-import-preprocessor";
import { convertDocBufferToText } from "./doc-converter-flow";
import { runPdfConverterFlow } from "./pdf-converter-flow-runner";

type ExtractionCoreResult = {
  text: string;
  method: ExtractionMethod;
  usedOcr: boolean;
  warnings: string[];
  attempts: string[];
  qualityScore?: number;
  normalizationApplied?: string[];
  structuredBlocks?: FileExtractionResult["structuredBlocks"];
  payloadVersion?: number;
};

// ==================== Text/Fountain/FDX ====================

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeExtractedText(text: string): string {
  return normalizeNewlines(text)
    .split("\u0000")
    .join("")
    .split("\u000B")
    .join("\n")
    .replace(/\f/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/^\uFEFF/, "");
}

const INLINE_SPEAKER_RE = /^([^:：]{1,30})\s*[:：]\s*(.+)$/u;
const SPEAKER_CUE_RE = /^([^:：]{1,30})\s*[:：]\s*$/u;
const SCENE_STATUS_SEGMENT_RE =
  /(?:نهار|ليل|صباح|مساء|داخلي|خارجي|داخل[يى]\s*[-/]\s*خارج[يى]|خارج[يى]\s*[-/]\s*داخل[يى])/iu;
const SCENE_TOP_LINE_RE = new RegExp(
  String.raw`^((?:مشهد|scene)\s*[0-9٠-٩]+)\s*(?:[-–—]\s*)?(${SCENE_STATUS_SEGMENT_RE.source}.+)$`,
  "iu"
);
const SCENE_HEADER_1_ONLY_RE = /^(?:مشهد|scene)\s*[0-9٠-٩]+(?:\s*[:：])?$/iu;
const TRANSITION_LINE_RE = /^(?:قطع|انتقال(?:\s+إلى)?|cut\s+to)\s*[:：]?$/iu;
const ACTION_START_RE =
  /^(?:يرفع|ينهض|يقف|تنتقل|تصدم|يتبادل|يبتسم|يصمت|تتركه|تتناول|يجلس|ترفع|تجلس|يدخل|وهو)\b/u;
const DIALOGUE_INLINE_ACTION_SPLIT_RE =
  /\s((?:و?(?:يقف|تقف|يرفع|ينهض|تنتقل|تصدم|يتبادل|يبتسم|يصمت|تتركه|تتناول|ترفع)|وتقف).+)$/u;
const ACTION_INLINE_ACTION_SPLIT_RE =
  /\s((?:و?(?:ترفع|ينهض|تنتقل|تصدم|يتبادل|يبتسم|يصمت|تتركه|تتناول)).+)$/u;

const normalizeInlineSpaces = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeOcrArabicArtifacts = (value: string): string => {
  return value
    .replace(/^بس\s*م\b/iu, "بسم")
    .replace(/\bاهلل\b/gu, "الله")
    .replace(/\bالرمحن\b/gu, "الرحمن")
    .replace(/\bالرحمي\b/gu, "الرحيم")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
};

const isLikelySpeakerName = (value: string): boolean => {
  const name = normalizeInlineSpaces(value);
  if (!name || name.length > 28) return false;
  if (name.split(" ").length > 4) return false;
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return false;
  if (/^(?:مشهد|scene|قطع|انتقال|داخلي|خارجي)$/iu.test(name)) return false;
  return true;
};

const shouldMergeActionContinuation = (previous: string, current: string): boolean => {
  const prev = normalizeInlineSpaces(previous);
  const curr = normalizeInlineSpaces(current);
  if (!prev || !curr) return false;
  if (SCENE_TOP_LINE_RE.test(curr) || SCENE_HEADER_1_ONLY_RE.test(curr)) return false;
  if (INLINE_SPEAKER_RE.test(curr) || SPEAKER_CUE_RE.test(curr)) return false;
  if (TRANSITION_LINE_RE.test(curr)) return false;
  if (/^(?:\.{3}|…|،|(?:و|ثم|ف)|الاخرى|بجوار|كل|يشتريني|بالك|بأربعة|العيشة|فيكوا|بسيط|ابويا)\b/u.test(curr))
    return true;
  if (prev.length >= 70 && curr.length <= 90 && !ACTION_START_RE.test(curr))
    return true;
  return false;
};

const shouldMergeDialogueContinuation = (
  previous: string,
  current: string
): boolean => {
  const prev = normalizeInlineSpaces(previous);
  const curr = normalizeInlineSpaces(current);
  if (!prev || !curr) return false;
  if (SCENE_TOP_LINE_RE.test(curr) || SCENE_HEADER_1_ONLY_RE.test(curr)) return false;
  if (INLINE_SPEAKER_RE.test(curr) || SPEAKER_CUE_RE.test(curr)) return false;
  if (TRANSITION_LINE_RE.test(curr)) return false;
  if (ACTION_START_RE.test(curr)) return false;
  if (/^(?:\.{3}|…|،|(?:و|ثم|ف)|يا|كل|يشتريني|بالك|بأربعة|العيشة|فيكوا|بسيط|ابويا)\b/u.test(curr))
    return true;
  return !/[.!؟?!…]\s*$/u.test(prev);
};

const buildStructuredBlocksFromNormalizedText = (
  text: string
): ScreenplayBlock[] => {
  const lines = normalizeExtractedText(text)
    .split("\n")
    .map((line) => normalizeOcrArabicArtifacts(normalizeInlineSpaces(line)))
    .filter(Boolean);

  const blocks: ScreenplayBlock[] = [];
  let expectingSceneHeader3 = false;
  let expectingDialogueAfterCue = false;

  const pushBlock = (formatId: ScreenplayBlock["formatId"], lineText: string) => {
    if (!lineText) return;
    blocks.push({ formatId, text: lineText });
  };

  for (const line of lines) {
    if (/^بسم\b/u.test(line) || /^بسم الله/u.test(line)) {
      pushBlock("basmala", line);
      expectingSceneHeader3 = false;
      expectingDialogueAfterCue = false;
      continue;
    }

    const topLineMatch = line.match(SCENE_TOP_LINE_RE);
    if (topLineMatch) {
      pushBlock("scene-header-1", normalizeInlineSpaces(topLineMatch[1] ?? ""));
      pushBlock("scene-header-2", normalizeInlineSpaces(topLineMatch[2] ?? ""));
      expectingSceneHeader3 = true;
      expectingDialogueAfterCue = false;
      continue;
    }

    if (SCENE_HEADER_1_ONLY_RE.test(line)) {
      pushBlock("scene-header-1", line.replace(/[:：]\s*$/u, "").trim());
      expectingSceneHeader3 = true;
      expectingDialogueAfterCue = false;
      continue;
    }

    if (expectingSceneHeader3) {
      if (!TRANSITION_LINE_RE.test(line) && !INLINE_SPEAKER_RE.test(line)) {
        pushBlock("scene-header-3", line);
        expectingSceneHeader3 = false;
        expectingDialogueAfterCue = false;
        continue;
      }
      expectingSceneHeader3 = false;
    }

    if (TRANSITION_LINE_RE.test(line)) {
      pushBlock("transition", line);
      expectingDialogueAfterCue = false;
      continue;
    }

    const cueOnlyMatch = line.match(SPEAKER_CUE_RE);
    if (cueOnlyMatch && isLikelySpeakerName(cueOnlyMatch[1] ?? "")) {
      pushBlock("character", `${normalizeInlineSpaces(cueOnlyMatch[1] ?? "")}:`);
      expectingDialogueAfterCue = true;
      continue;
    }

    const inlineSpeakerMatch = line.match(INLINE_SPEAKER_RE);
    if (inlineSpeakerMatch && isLikelySpeakerName(inlineSpeakerMatch[1] ?? "")) {
      pushBlock("character", `${normalizeInlineSpaces(inlineSpeakerMatch[1] ?? "")}:`);
      pushBlock("dialogue", normalizeInlineSpaces(inlineSpeakerMatch[2] ?? ""));
      expectingDialogueAfterCue = false;
      continue;
    }

    const lastBlock = blocks[blocks.length - 1];
    if (expectingDialogueAfterCue && lastBlock?.formatId === "character") {
      pushBlock("dialogue", line);
      expectingDialogueAfterCue = false;
      continue;
    }

    if (lastBlock?.formatId === "dialogue") {
      if (shouldMergeDialogueContinuation(lastBlock.text, line)) {
        lastBlock.text = `${lastBlock.text} ${line}`.replace(/\s+/g, " ").trim();
        continue;
      }
    }

    if (lastBlock?.formatId === "action") {
      if (shouldMergeActionContinuation(lastBlock.text, line)) {
        lastBlock.text = `${lastBlock.text} ${line}`.replace(/\s+/g, " ").trim();
        continue;
      }
    }

    pushBlock("action", line);
    expectingDialogueAfterCue = false;
  }

  const expandedBlocks: ScreenplayBlock[] = [];
  for (const block of blocks) {
    if (block.formatId === "dialogue") {
      const match = block.text.match(DIALOGUE_INLINE_ACTION_SPLIT_RE);
      const actionTail = normalizeInlineSpaces(match?.[1] ?? "");
      const dialogueText = normalizeInlineSpaces(
        match ? block.text.slice(0, match.index).trim() : block.text
      );
      if (actionTail && dialogueText.length >= 3 && actionTail.length >= 12) {
        expandedBlocks.push({ formatId: "dialogue", text: dialogueText });
        expandedBlocks.push({ formatId: "action", text: actionTail });
        continue;
      }
    }

    if (block.formatId === "action") {
      const match = block.text.match(ACTION_INLINE_ACTION_SPLIT_RE);
      const actionTail = normalizeInlineSpaces(match?.[1] ?? "");
      const actionHead = normalizeInlineSpaces(
        match ? block.text.slice(0, match.index).trim() : block.text
      );
      if (actionTail && actionHead.length >= 60 && actionTail.length >= 20) {
        expandedBlocks.push({ formatId: "action", text: actionHead });
        expandedBlocks.push({ formatId: "action", text: actionTail });
        continue;
      }
    }

    expandedBlocks.push(block);
  }

  return expandedBlocks;
};

function extractTextFromBuffer(buffer: Buffer): string {
  const utf8Text = buffer.toString("utf-8");
  const hasReplacementChars =
    utf8Text.includes("\uFFFD") || utf8Text.includes("�");
  if (!hasReplacementChars) return normalizeNewlines(utf8Text);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");
    const win1256Text = iconv.decode(buffer, "windows-1256") as string;
    if (win1256Text && !win1256Text.includes("\uFFFD")) {
      return normalizeNewlines(win1256Text);
    }
  } catch {
    // pass
  }

  return normalizeNewlines(buffer.toString("latin1"));
}

const payloadToExtractionResult = (
  payload: NonNullable<ReturnType<typeof extractPayloadFromText>>,
  attempts: string[],
  warnings: string[]
): ExtractionCoreResult => {
  return {
    text: payload.blocks.map((block) => block.text).join("\n"),
    method: "app-payload",
    usedOcr: false,
    warnings,
    attempts,
    qualityScore: 1,
    normalizationApplied: ["payload-direct-restore"],
    structuredBlocks: payload.blocks,
    payloadVersion: payload.version,
  };
};

// ==================== DOCX ====================

async function extractTextFromDocx(buffer: Buffer): Promise<ExtractionCoreResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import("mammoth")) as any;
  const extractRawText =
    mammoth.extractRawText || mammoth.default?.extractRawText;
  const result = await extractRawText({ buffer });
  const text = normalizeExtractedText(result.value as string);
  const payload = extractPayloadFromText(text);
  if (payload) {
    return payloadToExtractionResult(payload, ["mammoth", "payload-marker"], []);
  }

  return {
    text,
    method: "mammoth",
    usedOcr: false,
    warnings: [],
    attempts: ["mammoth"],
    qualityScore: computeImportedTextQualityScore(text),
  };
}

// ==================== PDF ====================

async function extractTextFromPdf(
  buffer: Buffer,
  filename: string
): Promise<ExtractionCoreResult> {
  const warnings: string[] = [];
  const attempts: string[] = [];

  try {
    const converted = await runPdfConverterFlow(buffer, filename);
    attempts.push(...converted.attempts);
    warnings.push(...converted.warnings);

    const outputText = normalizeExtractedText(converted.text);
    if (!outputText.trim()) {
      throw new Error("pdf-converter-flow أعاد ملف TXT فارغًا.");
    }

    return {
      text: outputText,
      method: "ocr-mistral",
      usedOcr: true,
      warnings,
      attempts,
      qualityScore: computeImportedTextQualityScore(outputText),
    };
  } catch (error) {
    warnings.push(
      `فشل pdf-converter-flow: ${error instanceof Error ? error.message : "خطأ غير معروف"}`
    );
    throw new Error(`فشل استخراج نص من PDF.\nالتحذيرات:\n${warnings.join("\n")}`, {
      cause: error,
    });
  }
}

// ==================== DOC ====================

async function extractTextFromDoc(
  buffer: Buffer,
  filename: string
): Promise<ExtractionCoreResult> {
  const result = await convertDocBufferToText(buffer, filename);
  return {
    text: result.text,
    method: result.method,
    usedOcr: false,
    warnings: [...result.warnings],
    attempts: [...result.attempts],
    qualityScore: computeImportedTextQualityScore(result.text),
  };
}

// ==================== Main ====================

export async function extractFileText(
  buffer: Buffer,
  filename: string,
  fileType: ImportedFileType
): Promise<FileExtractionResult> {
  switch (fileType) {
    case "txt":
    case "fountain":
    case "fdx": {
      const text = normalizeExtractedText(extractTextFromBuffer(buffer));
      return {
        text,
        fileType,
        method: "native-text",
        usedOcr: false,
        warnings: [],
        attempts: ["native-text"],
        qualityScore: computeImportedTextQualityScore(text),
      };
    }

    case "docx": {
      const result = await extractTextFromDocx(buffer);
      return {
        ...result,
        text: normalizeExtractedText(result.text),
        fileType,
      };
    }

    case "pdf": {
      const result = await extractTextFromPdf(buffer, filename);
      return {
        ...result,
        text: normalizeExtractedText(result.text),
        fileType,
      };
    }

    case "doc": {
      const result = await extractTextFromDoc(buffer, filename);
      return {
        ...result,
        text: normalizeExtractedText(result.text),
        fileType,
      };
    }

    default:
      throw new Error(`نوع الملف غير مدعوم: ${fileType}`);
  }
}
