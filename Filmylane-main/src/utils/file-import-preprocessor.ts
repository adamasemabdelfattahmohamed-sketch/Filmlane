import type { ImportedFileType } from "@/types/file-import";

export interface ImportPreprocessResult {
  text: string;
  applied: string[];
}

const normalizeNewlines = (value: string): string =>
  (value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const SCENE_STATUS_TOKENS =
  "نهار|ليل|صباح|مساء|فجر|داخلي|خارجي|داخل\\s*[-/]\\s*خارجي|خارج\\s*[-/]\\s*داخلي";

const normalizeSceneHeaderSpacing = (line: string): string => {
  let normalized = line;

  // "مشهد1" -> "مشهد 1"
  normalized = normalized.replace(
    /(^|\s)(مشهد|scene)\s*([0-9٠-٩]+)/giu,
    (_match, prefix: string, word: string, number: string) =>
      `${prefix}${word} ${number}`
  );

  // "مشهد 1 نهار -داخلي" -> "مشهد 1 - نهار -داخلي"
  normalized = normalized.replace(
    new RegExp(
      `^((?:مشهد|scene)\\s*[0-9٠-٩]+)\\s+(?=(?:${SCENE_STATUS_TOKENS})\\b)`,
      "iu"
    ),
    "$1 - "
  );

  // "مشهد 1     نهار - داخلي" -> "مشهد 1 - نهار - داخلي"
  normalized = normalized.replace(
    /^((?:مشهد|scene)\s*[0-9٠-٩]+)\s{2,}(.*)$/iu,
    (_match, firstPart: string, secondPart: string) =>
      `${firstPart.trim()} - ${secondPart.trim()}`
  );

  return normalized;
};

const looksLikeCharacterCue = (line: string): boolean =>
  /[:：]\s*$/.test(line.trim()) && line.trim().length <= 48;

const BULLET_PREFIX_REGEX = /^[\u200E\u200F\s]*(?:[-–—•▪●]+)\s*/u;

const stripBulletPrefix = (
  line: string
): { line: string; stripped: boolean } => {
  const strippedLine = line.replace(BULLET_PREFIX_REGEX, "");
  return {
    line: strippedLine,
    stripped: strippedLine !== line,
  };
};

const isLikelySpeakerName = (value: string): boolean => {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > 28) return false;
  if (name.split(" ").length > 4) return false;
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return false;
  if (/^(?:مشهد|scene|قطع|انتقال|داخلي|خارجي)$/iu.test(name)) return false;
  return true;
};

const normalizeDialogueBulletLine = (line: string): string[] => {
  const cueOnlyMatch = line.match(/^([^:：]{1,42})\s*[:：]\s*$/u);
  if (cueOnlyMatch) {
    const speaker = cueOnlyMatch[1]?.trim() ?? "";
    if (speaker && isLikelySpeakerName(speaker)) {
      return [`${speaker}:`];
    }
  }

  const inlineMatch = line.match(/^([^:：]{1,42})\s*[:：]\s*(.+)$/u);
  if (!inlineMatch) return [line];

  const speaker = inlineMatch[1]?.trim() ?? "";
  const dialogue = inlineMatch[2]?.trim() ?? "";
  if (!speaker || !dialogue || !isLikelySpeakerName(speaker)) return [line];

  return [`${speaker} : ${dialogue}`];
};

const looksLikeBoundaryLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^(?:قطع|cut\s+to|انتقال)/iu.test(trimmed)) return true;
  if (/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(trimmed)) return true;
  const inlineCueMatch = trimmed.match(/^([^:：]{1,30})\s*[:：]\s+\S+/u);
  if (inlineCueMatch && isLikelySpeakerName(inlineCueMatch[1] ?? "")) return true;
  if (looksLikeCharacterCue(trimmed)) return true;
  return false;
};

const endsWithStrongPunctuation = (line: string): boolean =>
  /[.!؟?!…:：]\s*$/u.test(line.trim());

const shouldJoinWrappedLine = (previous: string, current: string): boolean => {
  const prev = previous.trim();
  const curr = current.trim();
  if (!prev || !curr) return false;
  if (looksLikeBoundaryLine(prev) || looksLikeBoundaryLine(curr)) return false;
  if (endsWithStrongPunctuation(prev)) return false;
  if (/^(?:\.{3}|…|،|و|ثم)/u.test(curr)) return true;
  if (curr.length <= 16) return true;
  if (prev.length >= 90 && curr.length <= 90) return true;
  if ((prev.match(/\(/g) ?? []).length > (prev.match(/\)/g) ?? []).length)
    return true;
  return false;
};

const mergeWrappedLines = (rawText: string): string => {
  const inputLines = normalizeNewlines(rawText).split("\n");
  const output: string[] = [];

  for (const sourceLine of inputLines) {
    const cleanedLine = sourceLine
      .replace(/\u200E|\u200F/g, "")
      .replace(/\t+/g, "    ")
      .trim();
    const sceneNormalizedLine = normalizeSceneHeaderSpacing(cleanedLine);
    const collapsedLine = sceneNormalizedLine.replace(/\s+/g, " ").trim();
    const { line: withoutBullet } = stripBulletPrefix(collapsedLine);
    const normalizedSegments = normalizeDialogueBulletLine(withoutBullet);

    if (normalizedSegments.every((segment) => !segment.trim())) {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      continue;
    }

    for (const segment of normalizedSegments) {
      const normalizedLine = segment.trim();
      if (!normalizedLine) continue;

      const lastIndex = output.length - 1;
      if (
        lastIndex >= 0 &&
        output[lastIndex] &&
        shouldJoinWrappedLine(output[lastIndex], normalizedLine)
      ) {
        output[lastIndex] = `${output[lastIndex].trim()} ${normalizedLine}`.trim();
        continue;
      }

      output.push(normalizedLine);
    }
  }

  while (output.length > 0 && output[output.length - 1] === "") {
    output.pop();
  }

  return output.join("\n");
};

const preprocessPdfText = (text: string): ImportPreprocessResult => {
  let result = normalizeNewlines(text);
  const applied: string[] = [];

  if (/[▪●•]/u.test(result)) {
    result = result.replace(/[▪●•]\s*/gu, "\n");
    applied.push("pdf-bullet-line-split");
  }

  const merged = mergeWrappedLines(result);
  if (merged !== result) {
    result = merged;
    applied.push("pdf-wrapped-lines-normalized");
  }

  return { text: result.trim(), applied };
};

export const normalizeDocTextFromAntiword = (
  text: string
): ImportPreprocessResult => {
  const merged = mergeWrappedLines(text);
  const hasSceneFixes =
    /\b(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(text) &&
    !/\b(?:مشهد|scene)\s+[0-9٠-٩]+/iu.test(text);

  return {
    text: merged.trim(),
    applied: [
      "antiword-tab-normalization",
      "antiword-wrapped-lines-normalized",
      ...(hasSceneFixes ? ["antiword-scene-header-spacing"] : []),
    ],
  };
};

export const preprocessImportedTextForClassifier = (
  text: string,
  fileType: ImportedFileType
): ImportPreprocessResult => {
  switch (fileType) {
    case "doc":
      return normalizeDocTextFromAntiword(text);
    case "docx": {
      const merged = mergeWrappedLines(text);
      const applied =
        merged !== text
          ? ["docx-tab-spacing-normalization", "docx-wrapped-lines-normalized"]
          : ["docx-tab-spacing-normalization"];
      return { text: merged.trim(), applied };
    }
    case "pdf":
      return preprocessPdfText(text);
    default:
      return { text: normalizeNewlines(text).trim(), applied: [] };
  }
};

export const computeImportedTextQualityScore = (text: string): number => {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return 0;

  let anomalies = 0;
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1] ?? "";

    if (/مشهد[0-9٠-٩]/u.test(current)) anomalies += 2;
    if (/^(?:-|•|▪|●)\s*/u.test(current)) anomalies += 1.2;
    if (current.length <= 8 && !looksLikeCharacterCue(current)) anomalies += 1;
    if (
      i < lines.length - 1 &&
      !endsWithStrongPunctuation(current) &&
      !looksLikeBoundaryLine(current) &&
      !looksLikeBoundaryLine(next)
    ) {
      anomalies += 0.7;
    }
  }

  const denominator = Math.max(1, lines.length * 2.2);
  const score = Math.max(0, 1 - anomalies / denominator);
  return Number(score.toFixed(3));
};
