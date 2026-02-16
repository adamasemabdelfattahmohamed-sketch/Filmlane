import React from "react";
import { logger } from "./logger";
import { ContextMemoryManager } from "./context-memory-manager";
import type {
  ClassificationRecord,
  ContextMemory,
  LineContext,
} from "@/types/screenplay";
import {
  ACTION_CUE_RE,
  ACTION_VERB_FOLLOWED_BY_NAME_AND_VERB_RE,
  ARABIC_ONLY_WITH_NUMBERS_RE,
  BASMALA_ALLAH_RE,
  BASMALA_BASM_RE,
  BASMALA_RAHIM_RE,
  BASMALA_RAHMAN_RE,
  CHARACTER_RE,
  CHARACTER_STOP_WORDS,
  CONVERSATIONAL_MARKERS_RE,
  CONVERSATIONAL_STARTS,
  IMPERATIVE_VERB_SET,
  INLINE_DIALOGUE_GLUE_RE,
  INLINE_DIALOGUE_RE,
  PARENTHETICAL_RE,
  PRONOUN_ACTION_RE,
  PRONOUN_PREFIX_RE,
  QUOTE_MARKS_RE,
  SCENE_HEADER3_KNOWN_PLACES_RE,
  SCENE_HEADER3_MULTI_LOCATION_EXACT_RE,
  SCENE_HEADER3_MULTI_LOCATION_RE,
  SCENE_HEADER3_PREFIX_RE,
  SCENE_HEADER3_RANGE_RE,
  SCENE_LOCATION_RE,
  SCENE_NUMBER_EXACT_RE,
  SCENE_NUMBER_RE,
  SCENE_TIME_RE,
  SHORT_DIALOGUE_WORDS,
  THEN_ACTION_RE,
  TRANSITION_RE,
  VOCATIVE_RE,
  VOCATIVE_TITLES_RE,
} from "./arabic-patterns";
import {
  addLineRelation,
  createContextWindow,
  PostClassificationReviewer,
  trackDialogueBlock as trackWindowDialogueBlock,
  updateConfidence as updateWindowConfidence,
} from "./classification-core";
import type { ClassifiedLine, HybridClassifier } from "./classification-core";
import type { FeedbackCollector } from "./feedback-collector";
import type {
  AgentReviewRequestPayload,
  AgentReviewResponsePayload,
} from "@/types/agent-review";
import type { LineType } from "@/types/screenplay";

// Import shared text utilities from text-utils.ts
import {
  normalizeLine as baseNormalizeLine,
  normalizeCharacterName as baseNormalizeCharacterName,
  stripLeadingBullets,
  cleanInvisibleChars,
  cssObjectToString,
  isActionWithDash as baseIsActionWithDash,
  isActionVerbStart,
  matchesActionStartPattern,
  hasActionVerbStructure,
  isActionCueLine,
  hasSentencePunctuation,
} from "./text-utils";

// Re-export for backward compatibility
export { isImperativeStart } from "./text-utils";

/**
 * Callback للحصول على تأكيد المستخدم عند الثقة المنخفضة
 */
export type ConfirmationCallback = (
  line: string,
  suggestedType: string,
  confidence: number
) => Promise<string>;

type PendingPasteConfirmationJob = {
  pendingCount: number;
  run: () => Promise<void>;
};

const pendingPasteConfirmationJobs = new Map<
  string,
  PendingPasteConfirmationJob
>();
const pendingAgentAbortControllers = new Map<string, AbortController>();
const DOM_ARTIFACT_TOKEN_RE = /@dom-element:[^\s]+/gi;
const HTML_TAG_RE = /<[^>]+>/g;
// قرار تشغيل مؤقت: تعطيل كامل لمسار Hybrid/ML والتركيز على مسار واحد فقط.
const HYBRID_AND_ML_ENABLED = false;

type AgentWarningCallback = (message: string) => void;
type AgentAppliedCallback = (meta: {
  appliedCount: number;
  model: string;
  latencyMs: number;
}) => void;
type AgentSkippedCallback = (reason: string) => void;
type ImportSource = "clipboard" | "file-import";

const extractPlainTextFromHtmlLikeLine = (line: string): string => {
  const raw = (line ?? "").trim();
  if (!raw || !/[<>]/.test(raw)) return raw;

  try {
    const tmp = document.createElement("div");
    tmp.innerHTML = raw;
    const text = (tmp.textContent || "").replace(/\u00A0/g, " ").trim();
    if (text) return text;
  } catch {
    // fallback regex-only stripping below
  }

  return raw
    .replace(HTML_TAG_RE, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const runPendingPasteConfirmations = async (
  pasteBatchId: string
): Promise<void> => {
  const job = pendingPasteConfirmationJobs.get(pasteBatchId);
  if (!job) return;
  pendingPasteConfirmationJobs.delete(pasteBatchId);
  try {
    await job.run();
  } catch (error) {
    logger.error(`خطأ في تشغيل التأكيدات المؤجلة: ${error}`, {
      component: "Paste",
    });
  }
};

const REVIEWABLE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene-header-1",
  "scene-header-2",
  "scene-header-3",
  "scene-header-top-line",
  "transition",
  "parenthetical",
  "basmala",
]);

const isLineType = (value: string): value is LineType =>
  REVIEWABLE_TYPES.has(value as LineType);

const shouldSkipAgentReviewInRuntime = (): boolean => {
  if (typeof window === "undefined") return true;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
    return true;
  return false;
};

const toClassifiedLineRecords = (
  items: Array<{
    line: string;
    sceneHeaderParts?: { number: string; description: string } | null;
  }>,
  resolvedTypes: string[],
  resolvedConfidences: number[]
): ClassifiedLine[] => {
  const records: ClassifiedLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const assignedTypeRaw = item.sceneHeaderParts
      ? "scene-header-top-line"
      : resolvedTypes[i];
    if (!isLineType(assignedTypeRaw)) continue;

    records.push({
      lineIndex: i,
      text: item.line,
      assignedType: assignedTypeRaw,
      originalConfidence: Math.max(
        0,
        Math.min(100, resolvedConfidences[i] ?? 80)
      ),
      classificationMethod: "context",
    });
  }
  return records;
};

const requestAgentReview = async (
  request: AgentReviewRequestPayload,
  sessionId: string
): Promise<AgentReviewResponsePayload> => {
  if (shouldSkipAgentReviewInRuntime()) {
    return {
      status: "skipped",
      model: "claude-opus-4-6",
      decisions: [],
      message: "Agent review skipped in current runtime.",
      latencyMs: 0,
    };
  }

  const existing = pendingAgentAbortControllers.get(sessionId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  pendingAgentAbortControllers.set(sessionId, controller);

  try {
    const response = await fetch("/api/agent/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        status: "error",
        model: "claude-opus-4-6",
        decisions: [],
        message: `فشل استدعاء Route المراجعة (${response.status}): ${body}`,
        latencyMs: 0,
      };
    }

    const payload = (await response.json()) as AgentReviewResponsePayload;
    return payload;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      return {
        status: "skipped",
        model: "claude-opus-4-6",
        decisions: [],
        message: "تم إلغاء طلب المراجعة بسبب عملية لصق أحدث.",
        latencyMs: 0,
      };
    }

    return {
      status: "error",
      model: "claude-opus-4-6",
      decisions: [],
      message: `فشل طلب المراجعة: ${error}`,
      latencyMs: 0,
    };
  } finally {
    const current = pendingAgentAbortControllers.get(sessionId);
    if (current === controller) {
      pendingAgentAbortControllers.delete(sessionId);
    }
  }
};

/**
 * =========================
 *  Spacing Rules (قواعد التباعد بين العناصر)
 * =========================
 *
 * القواعد:
 * - basmala → أي عنصر: لا سطر فارغ
 * - scene-header-2 → scene-header-3: سطر فارغ
 * - scene-header-3 → action: سطر فارغ
 * - action → action/character/transition: سطر فارغ
 * - character → dialogue/parenthetical: لا سطر فارغ (ممنوع!)
 * - dialogue → character/action/transition: سطر فارغ
 * - parenthetical → يتبع نفس قواعد dialogue
 * - transition → scene-header-1/scene-header-top-line: سطر فارغ
 */
const getSpacingMarginTop = (
  previousFormat: string,
  currentFormat: string
): string => {
  if (previousFormat === "basmala") {
    return "0";
  }

  if (previousFormat === "character") {
    if (currentFormat === "dialogue" || currentFormat === "parenthetical") {
      return "0";
    }
  }

  if (previousFormat === "parenthetical" && currentFormat === "dialogue") {
    return "0";
  }

  if (
    previousFormat === "scene-header-2" &&
    currentFormat === "scene-header-3"
  ) {
    return "0";
  }

  if (previousFormat === "scene-header-3" && currentFormat === "action") {
    return "12pt";
  }

  if (previousFormat === "action") {
    if (
      currentFormat === "action" ||
      currentFormat === "character" ||
      currentFormat === "transition"
    ) {
      return "12pt";
    }
  }

  if (previousFormat === "dialogue") {
    if (
      currentFormat === "character" ||
      currentFormat === "action" ||
      currentFormat === "transition"
    ) {
      return "12pt";
    }
  }

  if (previousFormat === "parenthetical") {
    if (
      currentFormat === "character" ||
      currentFormat === "action" ||
      currentFormat === "transition"
    ) {
      return "0";
    }
  }

  if (previousFormat === "transition") {
    if (
      currentFormat === "scene-header-1" ||
      currentFormat === "scene-header-top-line"
    ) {
      return "12pt";
    }
  }

  return "";
};

const buildLineDivHTML = (
  className: string,
  styles: React.CSSProperties,
  text: string,
  marginTop?: string,
  attrs?: Record<string, string>
): string => {
  const div = document.createElement("div");
  div.className = className;

  const finalStyles = { ...styles };
  if (marginTop) {
    finalStyles.marginTop = marginTop;
  }

  div.setAttribute("style", cssObjectToString(finalStyles));
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      div.setAttribute(key, value);
    });
  }
  div.textContent = text;
  return div.outerHTML;
};

const looksLikeNarrativeActionSyntax = (normalized: string): boolean => {
  const text = (normalized ?? "").trim();
  if (!text) return false;
  if (/[:：]\s*$/.test(text)) return false;
  if (/[؟?!]/.test(text)) return false;

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;

  const isVerbLikeToken = (token: string): boolean => {
    const cleaned = token.replace(/[^\u0600-\u06FF]/g, "");
    return /^(?:[وف]?)[يت][\u0600-\u06FF]{2,}$/.test(cleaned);
  };

  const first = tokens[0] || "";
  const second = tokens[1] || "";
  const startsWithVerbLike =
    isVerbLikeToken(first) ||
    ((first === "ثم" || first === "و" || first === "ف") &&
      isVerbLikeToken(second));

  if (!startsWithVerbLike) return false;

  const hasNarrativeConnectors =
    /\s+(?:و|ثم|بينما|وقد|لت|لي|ل(?:ي|ت)|حتى|بجوار|أمام|خلف|داخل|خارج|الى|إلى|نحو)\b/.test(
      text
    );

  return hasNarrativeConnectors || tokens.length >= 5;
};

const shouldMergeWrappedLines = (
  previousLine: string,
  currentLine: string,
  previousType?: string,
  _importSource: ImportSource = "clipboard"
): boolean => {
  const prev = previousLine.trim();
  const curr = currentLine.trim();
  if (!prev || !curr) return false;
  if (/^(?:-|•)/.test(prev) || /^(?:-|•)/.test(curr)) return false;
  if (SCENE_NUMBER_EXACT_RE.test(prev) || SCENE_NUMBER_EXACT_RE.test(curr))
    return false;
  if (TRANSITION_RE.test(curr) || TRANSITION_RE.test(prev)) return false;
  if (/^[-–—]+\s*/.test(curr)) return false;

  // للشخصية: لا دمج أبدًا.
  if (previousType === "character") return false;

  const currNormalized = normalizeLine(curr);
  if (!currNormalized) return false;
  if (looksLikeNarrativeActionSyntax(currNormalized)) return false;
  if (/[:：]\s*$/.test(curr)) return false;
  if (parseInlineCharacterDialogue(currNormalized)) return false;
  if (
    isCompleteSceneHeader(curr) ||
    isSceneHeader1(curr) ||
    isSceneHeader2(curr) ||
    isSceneHeader3Standalone(curr) ||
    isTransition(curr)
  ) {
    return false;
  }
  if (
    isActionVerbStart(currNormalized) ||
    matchesActionStartPattern(currNormalized) ||
    hasActionVerbStructure(currNormalized)
  ) {
    return false;
  }

  // الدمج مسموح فقط لاستكمال حوار مكسور بصريًا.
  if (previousType !== "dialogue") return false;
  const prevEndsSentence = /[.!؟?!…»"]\s*$/.test(prev);
  const startsAsContinuation = /^(?:\.{3}|…|،|(?:و|ثم)\s+)/.test(
    currNormalized
  );
  return startsAsContinuation && !prevEndsSentence;
};

// ==========================================
//  تحديث دالة دمج الأسماء المكسورة (الاسطى)
// ==========================================
const mergeBrokenCharacterName = (
  previousLine: string,
  currentLine: string
): string | null => {
  const prevRaw = (previousLine ?? "").trim();
  const currRaw = (currentLine ?? "").trim();

  // 1. فحوصات سريعة للإلغاء
  if (!prevRaw || !currRaw) {
    logger.info(
      `❌ Merge check 1 failed: empty lines (prev="${prevRaw}", curr="${currRaw}")`,
      { component: "MergeDebug" }
    );
    return null;
  }
  if (/[.!؟"]$/.test(prevRaw)) {
    logger.info(
      `❌ Merge check 2 failed: prevRaw ends with sentence punctuation ("${prevRaw}")`,
      { component: "MergeDebug" }
    );
    return null;
  }

  // 2. التنظيف الأساسي
  const prevNormalized = normalizeLine(prevRaw);
  const currNormalized = normalizeLine(currRaw);

  if (!prevNormalized || !currNormalized) {
    logger.info(
      `❌ Merge check 3 failed: normalized empty (prevNorm="${prevNormalized}", currNorm="${currNormalized}")`,
      { component: "MergeDebug" }
    );
    return null;
  }
  if (stripLeadingBullets(prevRaw) !== prevRaw) {
    logger.info(`❌ Merge check 4 failed: prevRaw has bullets ("${prevRaw}")`, {
      component: "MergeDebug",
    });
    return null;
  }
  if (stripLeadingBullets(currRaw) !== currRaw) {
    logger.info(`❌ Merge check 5 failed: currRaw has bullets ("${currRaw}")`, {
      component: "MergeDebug",
    });
    return null;
  }

  // السطر السابق لا يجب أن يكون مشهداً أو انتقالاً
  if (
    isCompleteSceneHeader(prevRaw) ||
    isTransition(prevRaw) ||
    SCENE_NUMBER_EXACT_RE.test(prevNormalized)
  ) {
    logger.info(
      `❌ Merge check 6 failed: prevRaw is scene/transition ("${prevRaw}")`,
      { component: "MergeDebug" }
    );
    return null;
  }

  // هام: السطر الحالي (الجزء الثاني) يجب أن يحتوي على علامة نهاية الاسم
  if (!currNormalized.endsWith(":") && !currNormalized.endsWith("：")) {
    logger.info(
      `❌ Merge check 7 failed: currNormalized doesn't end with colon ("${currNormalized}")`,
      { component: "MergeDebug" }
    );
    return null;
  }

  logger.info(
    `✅ Merge checks passed! Attempting merge: "${prevRaw}" + "${currRaw}"`,
    { component: "MergeDebug" }
  );

  // 3. استخراج الأجزاء للدمج
  const prevNamePart = prevNormalized.replace(/[:：]+\s*$/, "").trim();
  const currNamePart = currNormalized.replace(/[:：]+\s*$/, "").trim();
  if (!prevNamePart || !currNamePart) return null;

  // 4. شروط الطول (Heuristics) - محسّنة للحالات القصيرة
  // السطر الأول ممكن يكون قصير جداً (حتى حرف واحد زي "ا" أو "الا")
  if (prevNamePart.length > 25) return null; // الجزء الأول مش لازم يكون طويل قوي
  if (currNamePart.split(/\s+/).filter(Boolean).length > 3) return null;

  // التأكد أن الدمج النهائي مش أطول من الحد المسموح بـ CHARACTER_RE (32 حرف)
  if (prevNamePart.length + currNamePart.length > 32) return null;

  // 5. المحاولة الأولى: الدمج المباشر
  const directMerge = `${prevNamePart}${currNamePart}`;

  // 6. المحاولة الثانية: الدمج بمسافة
  const spaceMerge = `${prevNamePart} ${currNamePart}`;

  // 7. اختبار النتيجة النهائية
  if (CHARACTER_RE.test(`${directMerge}:`)) {
    if (!/[.!؟,،"«»]/.test(directMerge)) {
      logger.info(
        `✅ دمج مباشر ناجح: "${prevNamePart}" + "${currNamePart}" → "${directMerge}:"`,
        { component: "Merge" }
      );
      return `${directMerge}:`;
    }
  }

  if (CHARACTER_RE.test(`${spaceMerge}:`)) {
    if (!/[.!؟,،"«»]/.test(spaceMerge)) {
      logger.info(
        `✅ دمج بمسافة ناجح: "${prevNamePart}" + "${currNamePart}" → "${spaceMerge}:"`,
        { component: "Merge" }
      );
      return `${spaceMerge}:`;
    }
  }

  // فشل الدمج - log للتشخيص
  if (
    prevNamePart.includes("الا") ||
    currNamePart.includes("سطى") ||
    (prevNamePart.length <= 4 &&
      currNamePart.length <= 5 &&
      currNormalized.endsWith(":"))
  ) {
    logger.warn(
      `❌ فشل الدمج: "${prevNamePart}" + "${currNamePart}" (directTest=${CHARACTER_RE.test(`${directMerge}:`)}, spaceTest=${CHARACTER_RE.test(`${spaceMerge}:`)})`,
      { component: "Merge" }
    );
  }

  return null;
};

// Use base normalizeLine from text-utils (no changes needed)
const normalizeLine = baseNormalizeLine;

// Use base normalizeCharacterName from text-utils
const normalizeCharacterName = baseNormalizeCharacterName;

const parseBulletLine = (
  line: string
): {
  text: string;
  inlineParsed: {
    characterName: string;
    dialogueText: string;
    cue?: string;
  } | null;
} => {
  const raw = line.trim();
  const withoutBullet = stripLeadingBullets(raw);
  const normalized = normalizeLine(withoutBullet);
  const inlineParsed = parseInlineCharacterDialogue(normalized);
  return { text: normalized, inlineParsed };
};

const splitInlineBulletMarkers = (line: string): string[] => {
  // Use cleanInvisibleChars from text-utils, with newline-to-space normalization
  const plainLine = extractPlainTextFromHtmlLikeLine(line);
  const cleanedLine = cleanInvisibleChars(plainLine)
    .replace(DOM_ARTIFACT_TOKEN_RE, " ")
    .replace(/\n/g, " ") // Normalize newlines to spaces for inline processing
    .replace(/\s+/g, " ")
    .trim();

  // إرجاع السطر المنظف مباشرة
  return [cleanedLine];
};

const splitActionPrefixedCharacter = (
  line: string
): { actionText: string; characterText: string } | null => {
  const normalized = normalizeLine(line);
  const match = normalized.match(/^(.+?)[:：]\s*$/);
  if (!match) return null;

  const noColon = match[1].trim();
  const tokens = noColon.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  const startsWithActionPrefix =
    tokens[0] === "وهو" ||
    tokens[0] === "وهي" ||
    (tokens[0] === "ثم" && (tokens[1] === "وهو" || tokens[1] === "وهي"));
  if (!startsWithActionPrefix) return null;

  for (let k = 1; k <= 3; k++) {
    if (tokens.length - k < 2) continue;
    const candidateName = normalizeCharacterName(tokens.slice(-k).join(" "));
    const actionPart = tokens.slice(0, -k).join(" ").trim();
    if (!candidateName || !actionPart) continue;
    const isActionPattern =
      matchesActionStartPattern(actionPart) ||
      isActionVerbStart(actionPart) ||
      hasActionVerbStructure(actionPart);
    if (!isActionPattern) continue;
    if (!CHARACTER_RE.test(`${candidateName}:`)) continue;
    return {
      actionText: actionPart,
      characterText: `${candidateName}:`,
    };
  }

  return null;
};

// Paste-specific isActionWithDash with extra scene/transition exclusions
const isActionWithDash = (line: string): boolean => {
  const result = baseIsActionWithDash(line);
  if (!result) return false;

  const trimmed = line.trim();
  const withoutDash = trimmed.replace(/^[-–—]+\s*/, "");

  if (
    isCompleteSceneHeader(withoutDash) ||
    isSceneHeader1(withoutDash) ||
    isSceneHeader2(withoutDash)
  ) {
    return false;
  }
  if (isTransition(withoutDash)) return false;
  return true;
};

const isDashNarrativeActionLine = (line: string): boolean => {
  const trimmed = (line ?? "").trim();
  if (!trimmed) return false;
  if (!/^[-–—]+\s*\S/.test(trimmed)) return false;

  const withoutDash = trimmed.replace(/^[-–—]+\s*/, "");
  const normalized = normalizeLine(withoutDash);
  if (!normalized) return false;
  if (/[:：]\s*$/.test(normalized)) return false;

  if (
    isCompleteSceneHeader(normalized) ||
    isSceneHeader1(normalized) ||
    isSceneHeader2(normalized) ||
    isSceneHeader3Standalone(normalized) ||
    isTransition(normalized)
  ) {
    return false;
  }

  return true;
};

/**
 * =========================
 *  Basmala
 * =========================
 */

const isBasmala = (line: string): boolean => {
  const cleaned = line
    // eslint-disable-next-line no-useless-escape
    .replace(/[{}()\[\]]/g, "")
    .replace(/[\u200f\u200e\ufeff]/g, "")
    .trim();
  const normalized = normalizeLine(cleaned);

  const compact = normalized.replace(/[^\u0600-\u06FF\s]/g, "");
  const hasBasm = BASMALA_BASM_RE.test(compact);
  const hasAllah = BASMALA_ALLAH_RE.test(compact);
  const hasRahman =
    BASMALA_RAHMAN_RE.test(compact) || BASMALA_RAHIM_RE.test(compact);

  return hasBasm && hasAllah && hasRahman;
};

/**
 * =========================
 *  Scene Header Logic
 * =========================
 */

const isSceneHeader1 = (line: string): boolean => {
  const normalized = normalizeLine(line);
  return SCENE_NUMBER_RE.test(normalized);
};

const isSceneHeader2 = (line: string): boolean => {
  const normalized = normalizeLine(line)
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasTime = SCENE_TIME_RE.test(normalized);
  const hasLocation = SCENE_LOCATION_RE.test(normalized);
  return hasTime && hasLocation;
};

const isCompleteSceneHeader = (line: string): boolean => {
  const normalized = normalizeLine(line);
  return SCENE_NUMBER_EXACT_RE.test(normalized) && isSceneHeader2(normalized);
};

const splitSceneHeader = (
  line: string
): { number: string; description: string } | null => {
  const match = line.match(
    /^\s*((?:مشهد|scene)\s*[0-9٠-٩]+)\s*[-–—:،]?\s*(.*)/i
  );
  if (!match) return null;
  return {
    number: match[1].trim(),
    description: match[2].trim(),
  };
};

const isTransition = (line: string): boolean => {
  const normalized = normalizeLine(line);
  return TRANSITION_RE.test(normalized);
};

const isSceneHeader3Standalone = (line: string): boolean => {
  const normalized = normalizeLine(line);
  const normalizedWithoutColon = normalized.replace(/:+\s*$/, "");
  const wordCount = normalizedWithoutColon.split(/\s+/).filter(Boolean).length;

  if (!normalizedWithoutColon) return false;
  if (wordCount > 14) return false;
  if (hasSentencePunctuation(normalizedWithoutColon)) return false;
  if (isTransition(normalizedWithoutColon)) return false;
  if (isActionVerbStart(normalizedWithoutColon)) return false;
  if (matchesActionStartPattern(normalizedWithoutColon)) return false;

  if (SCENE_HEADER3_PREFIX_RE.test(normalizedWithoutColon)) return true;

  if (SCENE_HEADER3_RANGE_RE.test(normalizedWithoutColon)) {
    return true;
  }

  if (SCENE_HEADER3_MULTI_LOCATION_EXACT_RE.test(normalizedWithoutColon)) {
    return true;
  }

  return false;
};

/**
 * =========================
 *  Action Logic
 * =========================
 */

const isLikelyAction = (line: string): boolean => {
  if (!line || !line.trim()) return false;

  const normalized = normalizeLine(line);

  if (isActionWithDash(line)) return true;
  if (isActionCueLine(normalized)) return true;
  if (matchesActionStartPattern(normalized)) return true;
  if (isActionVerbStart(normalized)) return true;
  if (hasActionVerbStructure(normalized)) return true;

  return false;
};

type ActionEvidence = {
  byDash: boolean;
  byCue: boolean;
  byPattern: boolean;
  byVerb: boolean;
  byStructure: boolean;
  byNarrativeSyntax: boolean;
  byPronounAction: boolean;
  byThenAction: boolean;
  byAudioNarrative: boolean;
};

const NARRATIVE_AUDIO_CUE_RE =
  /^(?:نسمع|يسمع|تسمع|يُسمع|صوت|أصوات|دوي|ضجيج|طرق(?:ات)?|طلقات|انفجار|رنين|صفير|صراخ|صرخة|همس|أنين|بكاء|ضحك)(?:\s+\S|$)/;
const DIALOGUE_PRONOUN_START_RE =
  /^(?:أنا|انا|إحنا|احنا|إنت|انت|إنتي|انتي|أنت|أنتِ)\s+/;
const NON_CHARACTER_SINGLE_TOKENS = new Set([
  "أنا",
  "انا",
  "إحنا",
  "احنا",
  "إنت",
  "انت",
  "إنتي",
  "انتي",
  "أنت",
  "أنتِ",
  "هو",
  "هي",
  "هم",
  "هن",
]);

const NON_NAME_TOKENS = new Set([
  ...Array.from(CHARACTER_STOP_WORDS),
  ...CONVERSATIONAL_STARTS,
  ...SHORT_DIALOGUE_WORDS,
  "لن",
  "لم",
  "لا",
  "ما",
  "هل",
  "لو",
  "إن",
  "ان",
  "إذا",
  "اذا",
  "أين",
  "اين",
  "متى",
  "كيف",
  "لماذا",
  "ليه",
  "ليش",
  "فين",
  "ازاي",
  "إزاي",
  "ده",
  "دي",
  "ذلك",
  "تلك",
  "هنا",
  "هناك",
  "قال",
  "قالت",
  "يقول",
  "تقول",
  "سأل",
  "سألت",
  "رد",
  "ردت",
  "أجاب",
  "اجاب",
  "أجابت",
  "اجابت",
]);

const getContextTypeScore = (
  ctx: LineContext,
  targetTypes: readonly string[]
): number => {
  const recent = ctx.previousTypes.slice(-10).reverse();
  let score = 0;
  for (let i = 0; i < recent.length; i++) {
    const t = recent[i] || "";
    if (!targetTypes.includes(t)) continue;
    if (i <= 1) {
      score += 3;
    } else if (i <= 4) {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score;
};

const hasDirectDialogueCues = (normalized: string): boolean => {
  const firstToken = normalized.split(/\s+/)[0] ?? "";
  if (CONVERSATIONAL_STARTS.includes(firstToken)) return true;
  if (VOCATIVE_RE.test(normalized) || VOCATIVE_TITLES_RE.test(normalized))
    return true;
  if (CONVERSATIONAL_MARKERS_RE.test(normalized)) return true;
  if (DIALOGUE_PRONOUN_START_RE.test(normalized)) return true;
  if (QUOTE_MARKS_RE.test(normalized)) return true;
  return false;
};

const collectActionEvidence = (
  line: string,
  normalized: string,
  sourceLine: string = line
): ActionEvidence => {
  return {
    byDash: isActionWithDash(line) || isDashNarrativeActionLine(sourceLine),
    byCue: isActionCueLine(normalized),
    byPattern: matchesActionStartPattern(normalized),
    byVerb: isActionVerbStart(normalized),
    byStructure: hasActionVerbStructure(normalized),
    byNarrativeSyntax: looksLikeNarrativeActionSyntax(normalized),
    byPronounAction: PRONOUN_ACTION_RE.test(normalized),
    byThenAction: THEN_ACTION_RE.test(normalized),
    byAudioNarrative: NARRATIVE_AUDIO_CUE_RE.test(normalized),
  };
};

const isDialogueHardBreaker = (
  line: string,
  ctx: LineContext,
  actionEvidence: ActionEvidence
): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return true;

  if (
    isCompleteSceneHeader(trimmed) ||
    isSceneHeader1(trimmed) ||
    isSceneHeader2(trimmed) ||
    isSceneHeader3Standalone(trimmed) ||
    isTransition(trimmed)
  ) {
    return true;
  }

  const lastType = ctx.previousTypes[ctx.previousTypes.length - 1] || "";
  const characterCandidate = isCharacterLine(trimmed, {
    lastFormat: lastType,
    isInDialogueBlock: ctx.pattern.isInDialogueBlock,
  });
  if (passesCharacterDefinitionGate(trimmed, ctx, characterCandidate))
    return true;

  const strongActionSignal =
    actionEvidence.byDash ||
    actionEvidence.byPattern ||
    actionEvidence.byVerb ||
    actionEvidence.byNarrativeSyntax ||
    actionEvidence.byPronounAction ||
    actionEvidence.byThenAction ||
    actionEvidence.byAudioNarrative;

  if (
    strongActionSignal &&
    passesActionDefinitionGate(trimmed, ctx, actionEvidence)
  ) {
    return true;
  }

  return false;
};

const passesActionDefinitionGate = (
  line: string,
  ctx: LineContext,
  evidence: ActionEvidence
): boolean => {
  const normalized = normalizeLine(line);
  if (!normalized) return false;

  const hasStrongNarrativeVisual =
    evidence.byDash ||
    evidence.byPattern ||
    evidence.byVerb ||
    evidence.byStructure ||
    evidence.byNarrativeSyntax ||
    evidence.byPronounAction ||
    evidence.byThenAction;
  const hasNarrativeAudio = evidence.byAudioNarrative;
  const hasAnyActionSignal =
    hasStrongNarrativeVisual || hasNarrativeAudio || evidence.byCue;
  if (!hasAnyActionSignal) return false;

  const hasSpeechSignals = hasDirectDialogueCues(normalized);
  if (
    hasSpeechSignals &&
    !hasNarrativeAudio &&
    !evidence.byDash &&
    !evidence.byPronounAction &&
    !evidence.byThenAction &&
    !evidence.byPattern &&
    !evidence.byVerb &&
    !evidence.byStructure &&
    !evidence.byNarrativeSyntax
  ) {
    return false;
  }

  const dialogueContextScore = getContextTypeScore(ctx, [
    "character",
    "dialogue",
    "parenthetical",
  ]);
  const actionContextScore = getContextTypeScore(ctx, ["action"]);
  if (
    dialogueContextScore >= actionContextScore + 4 &&
    !hasNarrativeAudio &&
    !evidence.byDash &&
    !evidence.byPronounAction &&
    !evidence.byThenAction &&
    !evidence.byPattern &&
    !evidence.byVerb &&
    !evidence.byStructure &&
    !evidence.byNarrativeSyntax
  ) {
    return false;
  }

  if (ctx.pattern.isInDialogueBlock) {
    const strongInsideDialogue =
      hasNarrativeAudio ||
      evidence.byDash ||
      evidence.byPattern ||
      evidence.byPronounAction ||
      evidence.byThenAction ||
      evidence.byVerb ||
      evidence.byStructure ||
      evidence.byNarrativeSyntax ||
      evidence.byCue;
    if (!strongInsideDialogue) return false;
  }

  return true;
};

const passesDialogueDefinitionGate = (
  line: string,
  ctx: LineContext,
  dialogueScore: number,
  actionEvidence: ActionEvidence
): boolean => {
  const normalized = normalizeLine(line);
  if (!normalized) return false;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const looksLikeSpeakerLabel = /[:：]\s*$/.test(line.trim()) && wordCount <= 5;
  if (looksLikeSpeakerLabel) return false;

  const hasDirectCues = hasDirectDialogueCues(normalized);
  const hasQuestionOrExclaim = /[؟?!]/.test(line);
  const dialogueContextScore = getContextTypeScore(ctx, [
    "character",
    "dialogue",
    "parenthetical",
  ]);
  const actionContextScore = getContextTypeScore(ctx, ["action"]);
  const lastType = ctx.previousTypes[ctx.previousTypes.length - 1] || "";

  const strongActionSignal =
    actionEvidence.byDash ||
    actionEvidence.byPattern ||
    actionEvidence.byVerb ||
    actionEvidence.byNarrativeSyntax ||
    actionEvidence.byPronounAction ||
    actionEvidence.byThenAction ||
    actionEvidence.byAudioNarrative;

  if (ctx.pattern.isInDialogueBlock) {
    if (isDialogueHardBreaker(line, ctx, actionEvidence)) return false;
    return true;
  }

  // خارج بلوك الحوار: لا نبدأ dialogue إلا بدليل صريح قوي.
  const canStartDialogueFromContext =
    lastType === "character" ||
    lastType === "parenthetical" ||
    lastType === "dialogue";
  const hasStrongStandaloneSpeechCue =
    QUOTE_MARKS_RE.test(line) ||
    VOCATIVE_RE.test(normalized) ||
    hasQuestionOrExclaim;

  if (!canStartDialogueFromContext && !hasStrongStandaloneSpeechCue) {
    return false;
  }

  if (
    dialogueScore >= 3 &&
    !(strongActionSignal && !hasDirectCues && !hasQuestionOrExclaim)
  ) {
    return true;
  }

  if (
    (hasDirectCues || hasQuestionOrExclaim) &&
    dialogueContextScore >= actionContextScore
  ) {
    return true;
  }

  return false;
};

const passesCharacterDefinitionGate = (
  line: string,
  ctx: LineContext,
  isCandidate: boolean
): boolean => {
  if (!isCandidate) return false;
  const trimmed = line.trim();
  if (!/[:：]\s*$/.test(trimmed)) return false;

  const normalized = normalizeCharacterName(trimmed);
  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (tokens.length === 1 && NON_CHARACTER_SINGLE_TOKENS.has(tokens[0]))
    return false;
  if (tokens.some((t) => CHARACTER_STOP_WORDS.has(t))) return false;

  if (
    isActionVerbStart(normalized) ||
    matchesActionStartPattern(normalized) ||
    hasActionVerbStructure(normalized)
  ) {
    return false;
  }
  if (/[؟!؟,،"«»]/.test(normalized)) return false;
  if (hasDirectDialogueCues(normalized)) return false;
  if (!ARABIC_ONLY_WITH_NUMBERS_RE.test(normalized)) return false;

  // استخدام السياق هنا فقط كمنع للضوضاء، مش كدليل لإثبات الشخصية.
  const lastType = ctx.previousTypes[ctx.previousTypes.length - 1];
  if (ctx.pattern.isInSceneHeader && lastType !== "scene-header-2")
    return false;

  return true;
};

/**
 * =========================
 *  Character Logic
 * =========================
 */

/**
 * دالة للتحقق من الكلمات الحوارية القصيرة
 * تساعد في تمييز الحوار القصير من أسماء الشخصيات
 */
const isShortDialogueWord = (line: string): boolean => {
  const normalized = normalizeLine(line).toLowerCase();
  return SHORT_DIALOGUE_WORDS.includes(normalized);
};

const isParenthetical = (line: string): boolean => {
  return PARENTHETICAL_RE.test(line.trim());
};

const parseInlineCharacterDialogue = (
  line: string
): { characterName: string; dialogueText: string; cue?: string } | null => {
  const trimmed = line.trim();

  const glueMatch = trimmed.match(INLINE_DIALOGUE_GLUE_RE);
  if (glueMatch) {
    const cueText = glueMatch[1].trim();
    const candidateName = normalizeCharacterName(glueMatch[2]);
    const dialogueText = (glueMatch[3] || "").trim();
    const nameTokens = candidateName.split(/\s+/).filter(Boolean);
    const hasForbiddenNameToken = nameTokens.some((token) => {
      const normalizedToken = normalizeLine(token);
      return (
        CHARACTER_STOP_WORDS.has(normalizedToken) ||
        NON_NAME_TOKENS.has(normalizedToken)
      );
    });
    const isValidCharacterName =
      nameTokens.length > 0 &&
      nameTokens.length <= 3 &&
      !(
        nameTokens.length === 1 &&
        NON_CHARACTER_SINGLE_TOKENS.has(nameTokens[0])
      ) &&
      !hasForbiddenNameToken &&
      !isShortDialogueWord(candidateName) &&
      !/[؟!؟,،"«»]/.test(candidateName) &&
      !(
        isActionVerbStart(candidateName) ||
        matchesActionStartPattern(candidateName) ||
        hasActionVerbStructure(candidateName)
      ) &&
      CHARACTER_RE.test(`${candidateName}:`);

    // مسار الـ glue مخصص فقط لحالات cue + character الملتصقة مثل "مبتسماعبد العزيز: ..."
    if (
      cueText &&
      isActionCueLine(cueText) &&
      candidateName &&
      dialogueText &&
      isValidCharacterName
    ) {
      return { characterName: candidateName, dialogueText, cue: cueText };
    }
  }

  const inlineMatch = trimmed.match(INLINE_DIALOGUE_RE);
  if (!inlineMatch) return null;

  const rawNamePart = (inlineMatch[1] || "").trim();
  const dialogueText = (inlineMatch[2] || "").trim();
  if (!rawNamePart || !dialogueText) return null;

  const nameTokens = rawNamePart.split(/\s+/).filter(Boolean);
  if (nameTokens.length >= 2) {
    const maxNameTokens = Math.min(3, nameTokens.length - 1);
    for (let k = 1; k <= maxNameTokens; k++) {
      const candidateName = normalizeCharacterName(
        nameTokens.slice(-k).join(" ")
      );
      const cueText = nameTokens.slice(0, -k).join(" ").trim();
      if (!cueText) continue;
      if (!isActionCueLine(cueText)) continue;
      if (!CHARACTER_RE.test(`${candidateName}:`)) continue;
      return { characterName: candidateName, dialogueText, cue: cueText };
    }
  }

  const normalizedName = normalizeCharacterName(rawNamePart);
  if (!CHARACTER_RE.test(`${normalizedName}:`)) return null;
  return { characterName: normalizedName, dialogueText };
};

const parseImplicitCharacterDialogueWithoutColon = (
  line: string,
  ctx: LineContext
): { characterName: string; dialogueText: string; cue?: string } | null => {
  const trimmed = (line ?? "").trim();
  if (!trimmed) return null;
  if (/[:：]/.test(trimmed)) return null;

  // نفعّل الاستدلال فقط داخل سياق حواري لتجنب false positives.
  if (!ctx.pattern.isInDialogueBlock) return null;
  if (
    isCompleteSceneHeader(trimmed) ||
    isTransition(trimmed) ||
    isParenthetical(trimmed)
  ) {
    return null;
  }

  const normalizedLine = normalizeLine(trimmed);
  if (!normalizedLine) return null;

  const tokens = normalizedLine.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  const maxNameTokens = Math.min(3, tokens.length - 1);
  for (let k = 1; k <= maxNameTokens; k++) {
    const candidateName = normalizeCharacterName(tokens.slice(0, k).join(" "));
    const dialogueText = tokens.slice(k).join(" ").trim();
    if (!candidateName || !dialogueText) continue;
    if (!ARABIC_ONLY_WITH_NUMBERS_RE.test(candidateName)) continue;

    const nameTokens = candidateName.split(/\s+/).filter(Boolean);
    if (nameTokens.length === 0 || nameTokens.length > 3) continue;
    if (nameTokens.some((t) => CHARACTER_STOP_WORDS.has(t))) continue;
    if (
      nameTokens.length === 1 &&
      NON_CHARACTER_SINGLE_TOKENS.has(nameTokens[0])
    )
      continue;
    if (
      nameTokens.some((t) => {
        const normalizedToken = normalizeLine(t);
        return NON_NAME_TOKENS.has(normalizedToken);
      })
    ) {
      continue;
    }

    if (isShortDialogueWord(candidateName)) continue;
    if (/[؟!؟,،"«»]/.test(candidateName)) continue;
    if (
      isActionVerbStart(candidateName) ||
      matchesActionStartPattern(candidateName) ||
      hasActionVerbStructure(candidateName)
    ) {
      continue;
    }
    if (!CHARACTER_RE.test(`${candidateName}:`)) continue;

    const normalizedDialogue = normalizeLine(dialogueText);
    if (!normalizedDialogue) continue;

    const hasSpeechCue =
      hasDirectDialogueCues(normalizedDialogue) ||
      /[؟?!]/.test(dialogueText) ||
      /(?:\.{2,}|…)/.test(dialogueText);
    if (!hasSpeechCue) continue;

    const dialogueActionEvidence = collectActionEvidence(
      dialogueText,
      normalizedDialogue,
      dialogueText
    );
    const hasStrongNarrativeAction =
      dialogueActionEvidence.byDash ||
      dialogueActionEvidence.byPattern ||
      dialogueActionEvidence.byVerb ||
      dialogueActionEvidence.byStructure ||
      dialogueActionEvidence.byNarrativeSyntax ||
      dialogueActionEvidence.byPronounAction ||
      dialogueActionEvidence.byThenAction ||
      dialogueActionEvidence.byAudioNarrative;
    if (hasStrongNarrativeAction) continue;

    return { characterName: candidateName, dialogueText };
  }

  return null;
};

const isCharacterLine = (
  line: string,
  context?: { lastFormat: string; isInDialogueBlock: boolean }
): boolean => {
  const raw = line ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (
    isCompleteSceneHeader(trimmed) ||
    isTransition(trimmed) ||
    isParenthetical(trimmed)
  ) {
    return false;
  }

  // قاعدة تعريفية صارمة: CHARACTER لازم ينتهي بنقطتين.
  if (!/[:：]\s*$/.test(trimmed)) return false;

  const namePart = normalizeCharacterName(trimmed);
  if (!namePart) return false;
  if (!ARABIC_ONLY_WITH_NUMBERS_RE.test(namePart)) return false;

  const tokens = namePart.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (tokens.some((t) => CHARACTER_STOP_WORDS.has(t))) return false;
  if (tokens.length === 1 && NON_CHARACTER_SINGLE_TOKENS.has(tokens[0]))
    return false;

  if (isShortDialogueWord(namePart)) return false;
  if (/[؟!؟,،"«»]/.test(namePart)) return false;
  if (isActionVerbStart(namePart)) return false;
  if (matchesActionStartPattern(namePart)) return false;
  if (hasActionVerbStructure(namePart)) return false;

  if (
    context?.isInDialogueBlock &&
    context.lastFormat === "dialogue" &&
    tokens.length === 1 &&
    namePart.length < 4
  ) {
    return false;
  }

  return CHARACTER_RE.test(`${namePart}:`);
};

/**
 * دالة ذكية لحساب احتمالية أن يكون السطر حواراً بناءً على محتواه اللغوي
 * Smart Linguistic Heuristic for Dialogue Detection
 * تحسينات: دعم السياق للتصنيف الأكثر دقة
 */
const getDialogueProbability = (
  line: string,
  context?: LineContext
): number => {
  let score = 0;
  const normalized = normalizeLine(line);

  // 1. Punctuation Indicators (علامات الترقيم الحوارية)
  // إصلاح: تقليل وزن علامة الاستفهام إذا كانت الجملة تبدأ بفعل action
  // لأن بعض الجمل الوصفية تحتوي على علامات استفهام بلاغية/استنكارية
  let questionMarkScore = 3;
  if (/[؟?]/.test(line)) {
    // فحص إذا كانت الجملة تبدأ بفعل action متبوعاً باسم ثم فعل آخر
    // مثال: "يصمت صبري و ينظر اليه ؟" - هذا وصف action وليس dialogue
    if (ACTION_VERB_FOLLOWED_BY_NAME_AND_VERB_RE.test(normalized)) {
      questionMarkScore = 0; // إلغاء نقاط علامة الاستفهام لأنها بلاغية
    } else if (isActionVerbStart(normalized)) {
      // إذا بدأت بفعل action، قلل نقاط علامة الاستفهام
      questionMarkScore = 1;
    }
    score += questionMarkScore;
  }

  if (/[!]/.test(line)) score += 2; // Exclamation is stronger for dialogue
  if (/\.{2}/.test(line)) score += 1; // Ellipses often indicate trailing dialogue

  // 2. Vocative Particles (أدوات النداء)
  // "Ya" followed by a word
  if (VOCATIVE_RE.test(normalized)) score += 4;
  if (VOCATIVE_TITLES_RE.test(normalized)) score += 2; // Specific common vocatives

  // 3. Conversational Start (بدايات حوارية شائعة)
  const firstWord = normalized.split(" ")[0];
  if (CONVERSATIONAL_STARTS.includes(firstWord)) score += 2;

  // Check deeper in the sentence for conversational markers
  if (CONVERSATIONAL_MARKERS_RE.test(normalized)) score += 1;

  // 4. Quotation Marks (علامات التنصيص)
  if (QUOTE_MARKS_RE.test(line)) score += 2;

  // 5. Length Heuristic (الطول)
  if (normalized.length > 5 && normalized.length < 150) score += 1;

  // Penalties (عقوبات)
  if (isSceneHeader1(line) || isSceneHeader2(line)) score -= 10;

  // 6. Context-aware Action Verb Penalty (عقوبة الأفعال مع مراعاة السياق)
  if (isActionVerbStart(line)) {
    // إذا كان في سياق حواري، قلل العقوبة
    if (context?.pattern.isInDialogueBlock) {
      if (score < 2) {
        score -= 1; // عقوبة أقل
      }
    } else {
      if (score < 4) {
        score -= 3;
      }
    }
  }

  // 7. Check for imperative verbs in conversational context
  if (IMPERATIVE_VERB_SET.has(firstWord)) {
    // إذا كان بعد character أو dialogue، زد النقاط (مؤشر قوي للحوار)
    if (context) {
      const lastType = context.previousTypes[context.previousTypes.length - 1];
      if (
        lastType === "character" ||
        lastType === "dialogue" ||
        context.pattern.isInDialogueBlock
      ) {
        score += 3; // مؤشر قوي أنه حوار
      }
    }
  }

  return score;
};

/**
 * =========================
 *  Context Model
 * =========================
 */

const buildContext = (
  lines: string[],
  currentIndex: number,
  previousTypes: string[]
): LineContext => {
  const WINDOW_SIZE = 10;
  const currentLine = lines[currentIndex] || "";

  const previousLines: string[] = [];
  for (let i = Math.max(0, currentIndex - WINDOW_SIZE); i < currentIndex; i++) {
    previousLines.push(lines[i] || "");
  }

  const nextLines: string[] = [];
  for (
    let i = currentIndex + 1;
    i < Math.min(lines.length, currentIndex + WINDOW_SIZE + 1);
    i++
  ) {
    nextLines.push(lines[i] || "");
  }

  const trimmedLine = currentLine.trim();
  const normalized = normalizeLine(currentLine);
  const stats = {
    wordCount: normalized.split(/\s+/).filter(Boolean).length,
    charCount: trimmedLine.length,
    hasColon: trimmedLine.includes(":") || trimmedLine.includes("："),
    hasPunctuation: /[.!?،؛]/.test(trimmedLine),
    startsWithBullet:
      /^[\s\u200E\u200F\u061C\uFEFF]*[•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃*+]/.test(
        currentLine
      ),
    isShort: trimmedLine.length < 30,
    isLong: trimmedLine.length > 100,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _recentTypes = previousTypes.slice(-10);
  const lastType = previousTypes[previousTypes.length - 1];

  const isInDialogueBlock =
    lastType === "character" ||
    lastType === "dialogue" ||
    lastType === "parenthetical";

  const isInSceneHeader =
    lastType === "scene-header-top-line" ||
    lastType === "scene-header-1" ||
    lastType === "scene-header-2";

  // const recentTypes = ctx.previousTypes.slice(-3);
  let lastSceneDistance = -1;
  for (let i = previousTypes.length - 1; i >= 0; i--) {
    if (previousTypes[i]?.includes("scene-header")) {
      lastSceneDistance = previousTypes.length - 1 - i;
      break;
    }
  }

  let lastCharacterDistance = -1;
  for (let i = previousTypes.length - 1; i >= 0; i--) {
    if (previousTypes[i] === "character") {
      lastCharacterDistance = previousTypes.length - 1 - i;
      break;
    }
  }

  return {
    previousLines,
    currentLine,
    nextLines,
    previousTypes,
    stats,
    pattern: {
      isInDialogueBlock,
      isInSceneHeader,
      lastSceneDistance,
      lastCharacterDistance,
    },
  };
};

/**
 * =========================
 *  Core Classification Pipeline
 * =========================
 */

const isSceneHeader3 = (line: string, ctx: LineContext): boolean => {
  const normalized = normalizeLine(line);
  const normalizedWithoutColon = normalized.replace(/:+\s*$/, "");
  const wordCount = normalizedWithoutColon.split(/\s+/).filter(Boolean).length;
  const lastType = ctx.previousTypes[ctx.previousTypes.length - 1];

  if (
    ["scene-header-top-line", "scene-header-1", "scene-header-2"].includes(
      lastType
    ) &&
    wordCount <= 12 &&
    !hasSentencePunctuation(line) &&
    !isActionVerbStart(normalizedWithoutColon) &&
    !matchesActionStartPattern(normalizedWithoutColon)
  ) {
    return true;
  }

  if (SCENE_HEADER3_KNOWN_PLACES_RE.test(normalizedWithoutColon)) {
    return true;
  }

  if (SCENE_HEADER3_MULTI_LOCATION_RE.test(normalizedWithoutColon)) {
    return true;
  }

  return false;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _isLikelyCharacter = (line: string, ctx: LineContext): boolean => {
  if (!ctx.stats.isShort || ctx.stats.wordCount > 5) return false;

  // Character names generally don't have dialogue punctuation
  // Unless it ends with colon (handled elsewhere)
  if (/[؟!؟"«»]/.test(line) && !line.includes(":")) return false;

  // Refined Logic (New):
  // Even if it HAS a colon, if the text before the colon is PURELY an imperative verb
  // it might be dialogue like "Enter:" (meaning "He says 'Enter'").
  // Though standard screenplay uses "NAME:", sometimes people write "Start:" as action?
  // User case: "ادخل:" -> This looks like an imperative verb "Edkhol".
  const namePart = line.split(":")[0].trim();
  const nameNormalized = normalizeLine(namePart);
  const actionishPrefix = PRONOUN_PREFIX_RE.test(nameNormalized);
  // const isLikelyCharacter = CHARACTER_RE.test(normalized);
  if (
    actionishPrefix &&
    (isActionVerbStart(nameNormalized) ||
      matchesActionStartPattern(nameNormalized))
  ) {
    return false;
  }

  // List of verbs that might look like names but are commands
  if (IMPERATIVE_VERB_SET.has(nameNormalized)) {
    // If the "name" is just a command, treat it as Dialogue (or Action/Parenthetical based on context)
    // The user said: "ادخل:" was treated as character. They want it as Dialogue?
    // "ادخل:" -> Dialogue "Enter." (as in someone speaking the command)
    return false;
  }

  if (isTransition(line)) return false;
  if (
    isActionVerbStart(normalizeLine(line)) ||
    matchesActionStartPattern(normalizeLine(line))
  )
    return false;

  if (ctx.stats.hasPunctuation && !ctx.stats.hasColon) return false;

  const nextLine = ctx.nextLines[0];
  if (nextLine) {
    if (isCompleteSceneHeader(nextLine) || isTransition(nextLine)) return false;
  }

  if (ctx.pattern.lastCharacterDistance === 1) return false;

  return true;
};

type ResolvedNarrativeType = "action" | "dialogue" | "character";

type NarrativeDecision = {
  type: ResolvedNarrativeType;
  reason: string;
  gap: number;
  scores: Record<ResolvedNarrativeType, number>;
  contradictions: Record<ResolvedNarrativeType, number>;
  candidates: readonly ResolvedNarrativeType[];
};

const scoreActionEvidence = (evidence: ActionEvidence): number => {
  let score = 0;
  if (evidence.byDash) score += 4;
  if (evidence.byPattern) score += 3;
  if (evidence.byVerb) score += 2;
  if (evidence.byStructure) score += 2;
  if (evidence.byNarrativeSyntax) score += 3;
  if (evidence.byPronounAction) score += 3;
  if (evidence.byThenAction) score += 2;
  if (evidence.byCue) score += 2;
  if (evidence.byAudioNarrative) score += 3;
  return score;
};

const resolveNarrativeDecision = (
  line: string,
  ctx: LineContext,
  dialogueScore: number,
  actionEvidence: ActionEvidence
): NarrativeDecision => {
  const lastType = ctx.previousTypes[ctx.previousTypes.length - 1] || "";
  const normalized = normalizeLine(line);
  const trimmed = line.trim();

  const characterCandidate = passesCharacterDefinitionGate(
    line,
    ctx,
    isCharacterLine(line, {
      lastFormat: lastType,
      isInDialogueBlock: ctx.pattern.isInDialogueBlock,
    })
  );
  const dialogueCandidate = passesDialogueDefinitionGate(
    line,
    ctx,
    dialogueScore,
    actionEvidence
  );
  const actionCandidate = passesActionDefinitionGate(line, ctx, actionEvidence);
  const actionSignalScore = scoreActionEvidence(actionEvidence);
  const hasDirectDialogueSignals =
    hasDirectDialogueCues(normalized) || /[؟?!]/.test(line);
  const dialogueContextScore = getContextTypeScore(ctx, [
    "character",
    "dialogue",
    "parenthetical",
  ]);
  const actionContextScore = getContextTypeScore(ctx, ["action"]);

  const scores: Record<ResolvedNarrativeType, number> = {
    action: Number.NEGATIVE_INFINITY,
    dialogue: Number.NEGATIVE_INFINITY,
    character: Number.NEGATIVE_INFINITY,
  };
  const contradictions: Record<ResolvedNarrativeType, number> = {
    action: 0,
    dialogue: 0,
    character: 0,
  };

  if (characterCandidate) {
    let score = 11;
    if (/[:：]\s*$/.test(trimmed)) score += 4;
    if (ctx.pattern.isInDialogueBlock) score += 1;
    if (ctx.stats.wordCount <= 3) score += 1;
    score += Math.min(3, getContextTypeScore(ctx, ["character"]));
    if (hasDirectDialogueSignals) contradictions.character += 3;
    if (actionSignalScore >= 4) contradictions.character += 3;
    if (ctx.pattern.isInDialogueBlock && lastType === "dialogue")
      contradictions.character += 1;
    score -= contradictions.character;
    scores.character = score;
  }

  if (dialogueCandidate) {
    let score = 6;
    score += Math.min(6, Math.max(0, dialogueScore));
    score += Math.min(
      4,
      getContextTypeScore(ctx, ["character", "dialogue", "parenthetical"])
    );
    if (hasDirectDialogueCues(normalized)) score += 2;
    if (/[؟?!]/.test(line)) score += 1;
    if (ctx.pattern.isInDialogueBlock) score += 3;
    if (actionSignalScore >= 5) contradictions.dialogue += 3;
    if (
      actionCandidate &&
      actionSignalScore >= 4 &&
      !hasDirectDialogueSignals
    ) {
      contradictions.dialogue += 4;
    }
    if (actionContextScore >= dialogueContextScore + 2)
      contradictions.dialogue += 2;
    score -= contradictions.dialogue;
    scores.dialogue = score;
  }

  if (actionCandidate) {
    let score = 6;
    score += Math.min(5, getContextTypeScore(ctx, ["action"]));
    score += scoreActionEvidence(actionEvidence);
    if (
      ctx.pattern.isInDialogueBlock &&
      !actionEvidence.byDash &&
      !actionEvidence.byPattern &&
      !actionEvidence.byPronounAction &&
      !actionEvidence.byThenAction &&
      !actionEvidence.byAudioNarrative &&
      !actionEvidence.byNarrativeSyntax
    ) {
      score -= 2;
    }
    if (hasDirectDialogueSignals && actionSignalScore <= 2)
      contradictions.action += 3;
    if (
      dialogueContextScore >= actionContextScore + 3 &&
      actionSignalScore <= 3
    ) {
      contradictions.action += 2;
    }
    if (
      ctx.pattern.isInDialogueBlock &&
      lastType === "dialogue" &&
      actionSignalScore <= 2
    ) {
      contradictions.action += 2;
    }
    score -= contradictions.action;
    scores.action = score;
  }

  const candidates = (Object.keys(scores) as ResolvedNarrativeType[]).filter(
    (k) => Number.isFinite(scores[k])
  );

  if (candidates.length === 0) {
    return {
      type: "action",
      reason: "fallback:no-candidate",
      gap: 0,
      scores,
      contradictions,
      candidates,
    };
  }

  if (characterCandidate && /[:：]\s*$/.test(trimmed)) {
    return {
      type: "character",
      reason: "gate:character-with-colon",
      gap: 99,
      scores,
      contradictions,
      candidates,
    };
  }

  const sorted = [...candidates].sort((a, b) => scores[b] - scores[a]);
  const best = sorted[0] || "action";
  const second = sorted[1];
  const gap = second ? scores[best] - scores[second] : scores[best];

  if (gap <= 1.5) {
    if (
      ctx.pattern.isInDialogueBlock &&
      dialogueCandidate &&
      !isDialogueHardBreaker(line, ctx, actionEvidence)
    ) {
      return {
        type: "dialogue",
        reason: "tie:dialogue-context",
        gap,
        scores,
        contradictions,
        candidates,
      };
    }
    if (actionCandidate) {
      return {
        type: "action",
        reason: "tie:safe-action",
        gap,
        scores,
        contradictions,
        candidates,
      };
    }
  }

  return {
    type: best,
    reason: "score:max",
    gap,
    scores,
    contradictions,
    candidates,
  };
};

const classifyWithContext = (line: string, ctx: LineContext): string => {
  const sourceLine = (ctx.currentLine || line).trim();
  const normalized = normalizeLine(line);
  const actionEvidence = collectActionEvidence(line, normalized, sourceLine);
  const dialogueScore = getDialogueProbability(line, ctx);

  if (isBasmala(line)) return "basmala";

  if (isCompleteSceneHeader(line)) return "scene-header-top-line";
  if (isSceneHeader1(line)) return "scene-header-1";
  if (isSceneHeader2(line)) return "scene-header-2";
  if (isTransition(line)) return "transition";

  if (isSceneHeader3Standalone(line)) {
    return "scene-header-3";
  }

  if (isActionWithDash(line) || isDashNarrativeActionLine(sourceLine))
    return "action";

  if (isParenthetical(line)) {
    // Parenthetical logic refined:
    // It's a parenthetical if it's in a dialogue block OR follows a character immediately
    if (
      ctx.pattern.isInDialogueBlock ||
      ctx.previousTypes[ctx.previousTypes.length - 1] === "character"
    ) {
      return "parenthetical";
    }

    // تحسين: تحقق من المحتوى داخل الأقواس
    const content = line
      .trim()
      // eslint-disable-next-line no-useless-escape
      .replace(/^[\(（]/, "")
      // eslint-disable-next-line no-useless-escape
      .replace(/[\)）]$/, "");
    const normalized = normalizeLine(content);

    // إذا كان المحتوى يشبه action cue (مبتسماً، بغضب، إلخ)
    if (ACTION_CUE_RE.test(normalized)) {
      // إذا كان السياق السابق dialogue أو character، فهو parenthetical
      if (
        ctx.previousTypes
          .slice(-3)
          .some((t) => t === "dialogue" || t === "character")
      ) {
        return "parenthetical";
      }
      // وإلا فهو action
      return "action";
    }

    // افتراضي: action إذا لم يكن في سياق حواري
    return "action";
  }

  if (ctx.pattern.isInSceneHeader) {
    if (isSceneHeader3(line, ctx)) {
      return "scene-header-3";
    }
  }

  const decision = resolveNarrativeDecision(
    line,
    ctx,
    dialogueScore,
    actionEvidence
  );

  logger.debug(
    `Decision ${decision.type} (reason=${decision.reason}, gap=${decision.gap.toFixed(
      2
    )})`,
    {
      component: "Decision",
      data: {
        line: line.trim(),
        candidates: decision.candidates,
        scores: decision.scores,
        contradictions: decision.contradictions,
        isInDialogueBlock: ctx.pattern.isInDialogueBlock,
      },
    }
  );

  return decision.type;
};

/**
 * =========================
 * AUTO FIX DISABLED
 * =========================
 * تم تعطيل خاصية التصحيح التلقائي بناءً على طلب المستخدم
 * لضمان عدم تجاوز قواعد Regex الصارمة.
 */
const autoFixClassification = (
  line: string,
  ctx: LineContext,
  classification: string
): string => {
  // EMERGENCY OVERRIDE: Return the classification exactly as received
  // from the Regex/Hybrid classifier without any "smart" modifications.
  return classification;
};

/**
 * =========================
 *  Memory-Enhanced Classification
 * =========================
 */

const classifyWithContextAndMemory = async (
  line: string,
  ctx: LineContext,
  memoryManager: ContextMemoryManager | null,
  sessionId: string
): Promise<string> => {
  let classification = classifyWithContext(line, ctx);

  if (!memoryManager) return classification;

  try {
    const memory: ContextMemory | null =
      await memoryManager.loadContext(sessionId);
    if (!memory) return classification;

    if (ctx.stats.isShort && !ctx.stats.hasPunctuation && ctx.stats.hasColon) {
      const normalizedLineName = normalizeCharacterName(line).toLowerCase();
      const knownCharacter = memory.data.commonCharacters.find((char) => {
        return (
          normalizeCharacterName(char).toLowerCase() === normalizedLineName
        );
      });

      if (knownCharacter && ctx.stats.wordCount <= 5 && line.length < 60) {
        classification = "character";
      }
    }

    const recentPattern = memory.data.lastClassifications.slice(0, 3).join("-");
    const lastType = ctx.previousTypes[ctx.previousTypes.length - 1];

    if (
      recentPattern.startsWith("character-dialogue") &&
      lastType === "dialogue" &&
      !ctx.stats.hasColon &&
      isLikelyAction(line) &&
      passesActionDefinitionGate(
        line,
        ctx,
        collectActionEvidence(line, normalizeLine(line))
      )
    ) {
      classification = "action";
    }

    if (
      recentPattern === "dialogue-dialogue-dialogue" &&
      lastType === "dialogue" &&
      !ctx.stats.hasColon &&
      !isCompleteSceneHeader(line)
    ) {
      classification = "dialogue";
    }

    if (
      recentPattern === "action-action-action" &&
      lastType === "action" &&
      ctx.stats.isLong
    ) {
      classification = "action";
    }

    if (classification === "character") {
      const charName = normalizeCharacterName(line);
      const appearances = memory.data.characterDialogueMap[charName] || 0;

      if (appearances >= 3) {
        classification = "character";
      }
    }
  } catch (error) {
    logger.error(`خطأ في استخدام الذاكرة: ${error}`, { component: "Memory" });
  }

  return classification;
};

/**
 * =========================
 *  Paste Handler
 * =========================
 */

export const handlePaste = async (
  e: React.ClipboardEvent,
  editorRef: React.RefObject<HTMLDivElement | null>,
  getFormatStylesFn: (
    formatType: string,
    size: string,
    font: string
  ) => React.CSSProperties,
  updateContentFn: () => void,
  memoryManager: ContextMemoryManager | null = null,
  sessionId: string = `session-${Date.now()}`,
  hybridClassifier: HybridClassifier | null = null,
  feedbackCollector: FeedbackCollector | null = null,
  confirmationCallback: ConfirmationCallback | null = null,
  onPendingConfirmations:
    | ((pasteBatchId: string, pendingCount: number) => void)
    | null = null,
  onAgentWarning: AgentWarningCallback | null = null,
  onAgentApplied: AgentAppliedCallback | null = null,
  onAgentSkipped: AgentSkippedCallback | null = null,
  importSource: ImportSource = "clipboard"
): Promise<void> => {
  e.preventDefault();

  const previousAgentController = pendingAgentAbortControllers.get(sessionId);
  if (previousAgentController) {
    previousAgentController.abort();
    pendingAgentAbortControllers.delete(sessionId);
  }

  logger.info(`🚀 بدء عملية اللصق (Session: ${sessionId})`, {
    component: "Paste",
  });
  if (!HYBRID_AND_ML_ENABLED) {
    logger.info("🔒 Hybrid/ML معطّل: استخدام Regex + Context + Memory فقط", {
      component: "Paste",
    });
  }

  const textData = e.clipboardData.getData("text/plain");
  if (!textData) {
    logger.warn("لا يوجد نص للصق", { component: "Paste" });
    return;
  }

  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    logger.error("لا يوجد تحديد نشط", { component: "Paste" });
    return;
  }

  // Use cleanInvisibleChars from text-utils for clipboard preprocessing
  const cleanedTextData = cleanInvisibleChars(textData)
    .replace(DOM_ARTIFACT_TOKEN_RE, "")
    .replace(/\u00A0/g, " ");

  const rawLines = cleanedTextData
    .split("\n")
    .map((line) => extractPlainTextFromHtmlLikeLine(line))
    .filter((line) => normalizeLine(line).length > 0);
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const trimmedRaw = extractPlainTextFromHtmlLikeLine(rawLine)
      .replace(DOM_ARTIFACT_TOKEN_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!trimmedRaw) continue;

    const expanded = splitInlineBulletMarkers(trimmedRaw);
    for (const piece of expanded) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const lastIndex = lines.length - 1;

      const currBulletParsed = parseBulletLine(trimmed);
      const currHasInlineSpeaker = Boolean(currBulletParsed.inlineParsed);

      if (lastIndex >= 0 && importSource === "clipboard") {
        const mergedBrokenCharacter = mergeBrokenCharacterName(
          lines[lastIndex],
          trimmed
        );
        if (mergedBrokenCharacter) {
          logger.info(
            `✅ دمج ناجح: "${lines[lastIndex]}" + "${trimmed}" → "${mergedBrokenCharacter}"`,
            { component: "Merge" }
          );
          lines[lastIndex] = mergedBrokenCharacter;
          continue;
        }
      }
      if (lastIndex >= 0) {
        const prevNormalizedForMerge = normalizeLine(lines[lastIndex]);
        const previousTypeGuess = prevNormalizedForMerge.endsWith(":")
          ? "character"
          : isLikelyAction(prevNormalizedForMerge)
            ? "action"
            : "dialogue";

        if (
          shouldMergeWrappedLines(
            lines[lastIndex],
            trimmed,
            previousTypeGuess,
            importSource
          )
        ) {
          if (!currHasInlineSpeaker) {
            lines[lastIndex] = `${lines[lastIndex].trim()} ${trimmed}`;
            continue;
          }
        }
      }
      if (lastIndex >= 0) {
        const prevNormalized = normalizeLine(lines[lastIndex]);
        const currNormalized = normalizeLine(trimmed);
        const isContinuation = /^(?:\.{3}|…)/.test(currNormalized);
        const prevInline = parseInlineCharacterDialogue(prevNormalized);
        if (isContinuation && prevInline) {
          const continuationText = stripLeadingBullets(trimmed);
          lines[lastIndex] = `${lines[lastIndex].trim()} ${continuationText}`
            .replace(/\s+/g, " ")
            .trim();
          continue;
        }
      }
      lines.push(trimmed);
    }
  }
  logger.info(`📋 بدء معالجة ${lines.length} سطر`, { component: "Paste" });
  logger.info(
    `أول 3 أسطر: ${lines
      .slice(0, 3)
      .map((l) => `"${l.substring(0, 30)}..."`)
      .join(", ")}`,
    { component: "Paste" }
  );

  let formattedHTML = "";
  let previousFormatClass = "action";
  const provisionalTypes: string[] = [];
  const finalTypes: string[] = [];
  const classificationRecords: ClassificationRecord[] = [];
  const dialogueBlocksToTrack: Array<{
    character: string;
    startLine: number;
    endLine: number;
  }> = [];
  let contextWindow = createContextWindow();
  let outputLineIndex = 0;
  let lastRecordedIndex: number | null = null;
  let lastRecordedType: string | null = null;
  let activeDialogueBlock: {
    character: string;
    startLine: number;
    endLine: number;
  } | null = null;

  const closeDialogueBlock = (): void => {
    if (!activeDialogueBlock) return;
    contextWindow = trackWindowDialogueBlock(
      contextWindow,
      activeDialogueBlock.character,
      activeDialogueBlock.startLine,
      activeDialogueBlock.endLine
    );
    dialogueBlocksToTrack.push({ ...activeDialogueBlock });
    activeDialogueBlock = null;
  };

  const recordClassification = (
    lineText: string,
    classification: string,
    confidence?: number
  ): void => {
    const trimmedLineText = lineText.trim();
    if (!trimmedLineText) return;

    outputLineIndex += 1;
    classificationRecords.push({
      line: trimmedLineText,
      classification,
      timestamp: Date.now(),
    });

    if (lastRecordedIndex !== null && lastRecordedType) {
      const isDialogueLike =
        classification === "dialogue" || classification === "parenthetical";
      const wasDialogueLike =
        lastRecordedType === "dialogue" || lastRecordedType === "parenthetical";

      if (lastRecordedType === "character" && isDialogueLike) {
        contextWindow = addLineRelation(
          contextWindow,
          lastRecordedIndex,
          outputLineIndex,
          "response"
        );
      } else if (wasDialogueLike && isDialogueLike) {
        contextWindow = addLineRelation(
          contextWindow,
          lastRecordedIndex,
          outputLineIndex,
          "continuation"
        );
      } else if (lastRecordedType === "action" && isDialogueLike) {
        contextWindow = addLineRelation(
          contextWindow,
          lastRecordedIndex,
          outputLineIndex,
          "action-result"
        );
      }
    }

    lastRecordedIndex = outputLineIndex;
    lastRecordedType = classification;

    if (confidence !== undefined && confidence < 100) {
      contextWindow = updateWindowConfidence(
        contextWindow,
        outputLineIndex,
        confidence
      );
    }

    if (classification === "character") {
      closeDialogueBlock();
      activeDialogueBlock = {
        character: trimmedLineText.replace(/[:：]/g, "").trim(),
        startLine: outputLineIndex,
        endLine: outputLineIndex,
      };
      return;
    }

    if (classification === "dialogue" || classification === "parenthetical") {
      if (activeDialogueBlock) {
        activeDialogueBlock.endLine = outputLineIndex;
      }
      return;
    }

    closeDialogueBlock();
  };

  type CollectedItem = {
    sourceLineIndex: number;
    line: string;
    ctx: LineContext;
    classification: string;
    confidence: number;
    needsConfirmation: boolean;
    suggestedType?: string;
    sceneHeaderParts?: { number: string; description: string } | null;
    skipAutoFix: boolean;
    skipColonFix: boolean;
  };

  const collectedItems: CollectedItem[] = [];

  logger.info(`بدء معالجة ${lines.length} سطر...`, { component: "Processing" });

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (!trimmedLine) continue;

    const bulletParsed = parseBulletLine(trimmedLine);
    const strippedLine = bulletParsed.text;
    const ctx = buildContext(lines, i, provisionalTypes);

    const actionPrefixed = splitActionPrefixedCharacter(strippedLine);
    if (actionPrefixed) {
      collectedItems.push({
        sourceLineIndex: i,
        line: actionPrefixed.actionText,
        ctx,
        classification: "action",
        confidence: 100,
        needsConfirmation: false,
        skipAutoFix: true,
        skipColonFix: true,
      });
      provisionalTypes.push("action");

      collectedItems.push({
        sourceLineIndex: i,
        line: actionPrefixed.characterText,
        ctx,
        classification: "character",
        confidence: 100,
        needsConfirmation: false,
        skipAutoFix: true,
        skipColonFix: true,
      });
      provisionalTypes.push("character");
      continue;
    }

    const explicitInlineParsed =
      bulletParsed.inlineParsed ?? parseInlineCharacterDialogue(strippedLine);
    const inlineParsed =
      explicitInlineParsed ??
      parseImplicitCharacterDialogueWithoutColon(strippedLine, ctx);

    if (inlineParsed) {
      const { characterName, dialogueText, cue } = inlineParsed;

      if (cue) {
        collectedItems.push({
          sourceLineIndex: i,
          line: cue,
          ctx,
          classification: "action",
          confidence: 100,
          needsConfirmation: false,
          skipAutoFix: true,
          skipColonFix: true,
        });
        provisionalTypes.push("action");
      }

      collectedItems.push({
        sourceLineIndex: i,
        line: `${characterName}:`,
        ctx,
        classification: "character",
        confidence: 100,
        needsConfirmation: false,
        skipAutoFix: true,
        skipColonFix: true,
      });
      provisionalTypes.push("character");

      collectedItems.push({
        sourceLineIndex: i,
        line: dialogueText,
        ctx,
        classification: "dialogue",
        confidence: 100,
        needsConfirmation: false,
        skipAutoFix: true,
        skipColonFix: true,
      });
      provisionalTypes.push("dialogue");
      continue;
    }

    // === النظام الهجين: Regex → ML → Context → User Feedback ===
    let classification: string;
    let hybridConfidence = 100;
    let needsConfirmation = false;
    let suggestedType: string | undefined;

    if (
      HYBRID_AND_ML_ENABLED &&
      hybridClassifier &&
      hybridClassifier.isReady()
    ) {
      // الخطوة 1: تصنيف regex أساسي
      const regexResult = classifyWithContext(strippedLine, ctx);
      // الخطوة 2: تمرير عبر النظام الهجين
      const hybridResult = await hybridClassifier.classifyLine(
        strippedLine,
        regexResult,
        ctx,
        sessionId
      );
      classification = hybridResult.type;
      hybridConfidence = hybridResult.confidence;

      if (hybridResult.needsConfirmation && confirmationCallback) {
        needsConfirmation = true;
        suggestedType = hybridResult.type;
      }
    } else {
      // fallback: النظام القديم
      classification = await classifyWithContextAndMemory(
        strippedLine,
        ctx,
        memoryManager,
        sessionId
      );
    }

    if (classification === "scene-header-top-line") {
      const parts = splitSceneHeader(strippedLine);
      if (parts) {
        collectedItems.push({
          sourceLineIndex: i,
          line: strippedLine,
          ctx,
          classification: "scene-header-top-line",
          confidence: hybridConfidence,
          needsConfirmation: false,
          suggestedType: undefined,
          sceneHeaderParts: parts,
          skipAutoFix: true,
          skipColonFix: true,
        });
        provisionalTypes.push("scene-header-top-line");
        continue;
      }
    }

    collectedItems.push({
      sourceLineIndex: i,
      line: strippedLine,
      ctx,
      classification,
      confidence: hybridConfidence,
      needsConfirmation,
      suggestedType,
      sceneHeaderParts: null,
      skipAutoFix: false,
      skipColonFix: false,
    });

    const provisionalFormatClass = autoFixClassification(
      strippedLine,
      ctx,
      classification
    );

    provisionalTypes.push(provisionalFormatClass);
  }

  const pasteBatchId = `${sessionId}-${Date.now()}`;
  const pasteCaretMarkerAttr = `paste-caret-${pasteBatchId}`;
  const resolvedTypes: string[] = collectedItems.map(
    (item) => item.classification
  );
  const resolvedConfidences: number[] = collectedItems.map(
    (item) => item.confidence
  );

  for (let itemIndex = 0; itemIndex < collectedItems.length; itemIndex++) {
    const item = collectedItems[itemIndex];
    const resolvedType = resolvedTypes[itemIndex];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _resolvedConfidence = resolvedConfidences[itemIndex];

    if (item.sceneHeaderParts) {
      const parts = item.sceneHeaderParts;
      const topLevelStyles = getFormatStylesFn("scene-header-top-line", "", "");
      const part1Styles = getFormatStylesFn("scene-header-1", "", "");
      const part2Styles = getFormatStylesFn("scene-header-2", "", "");

      const part1HTML = buildLineDivHTML(
        "format-scene-header-1",
        part1Styles,
        parts.number
      );
      const part2HTML = buildLineDivHTML(
        "format-scene-header-2",
        part2Styles,
        parts.description
      );

      const topLevelMarginTop = getSpacingMarginTop(
        previousFormatClass,
        "scene-header-top-line"
      );
      const topLevelDiv = document.createElement("div");
      topLevelDiv.className = "format-scene-header-top-line";
      const topLevelStylesWithSpacing = { ...topLevelStyles };
      if (topLevelMarginTop) {
        topLevelStylesWithSpacing.marginTop = topLevelMarginTop;
      }
      topLevelDiv.setAttribute(
        "style",
        cssObjectToString(topLevelStylesWithSpacing)
      );
      topLevelDiv.setAttribute("data-paste-batch", pasteBatchId);
      topLevelDiv.setAttribute("data-paste-index", String(itemIndex));
      topLevelDiv.innerHTML = part1HTML + part2HTML;

      formattedHTML += topLevelDiv.outerHTML;

      finalTypes.push("scene-header-top-line");
      previousFormatClass = "scene-header-top-line";
      continue;
    }

    const ctxForFinal = buildContext(lines, item.sourceLineIndex, finalTypes);

    const formatClass = item.skipAutoFix
      ? resolvedType
      : autoFixClassification(item.line, ctxForFinal, resolvedType);

    // DIAGNOSTIC LOG
    if (
      item.line.includes("الاسطى") ||
      item.line.includes("الا") ||
      item.line.includes("سطى") ||
      item.line.includes("مازال") ||
      item.line.includes("يتوضأ")
    ) {
      logger.info(`🎯 نتيجة نهائية: "${item.line}" → ${formatClass}`, {
        component: "Final",
      });
    }
    let cleanLine = item.line;

    if (
      !item.skipColonFix &&
      formatClass === "character" &&
      !cleanLine.endsWith(":") &&
      !cleanLine.endsWith("：")
    ) {
      cleanLine = cleanLine + ":";
    }

    const marginTop = getSpacingMarginTop(previousFormatClass, formatClass);
    const styles = getFormatStylesFn(formatClass, "", "");
    const lineHTML = buildLineDivHTML(
      `format-${formatClass}`,
      styles,
      cleanLine,
      marginTop,
      {
        "data-paste-batch": pasteBatchId,
        "data-paste-index": String(itemIndex),
      }
    );
    formattedHTML += lineHTML;

    finalTypes.push(formatClass);
    previousFormatClass = formatClass;
  }

  formattedHTML += `<span data-paste-caret="${pasteCaretMarkerAttr}" style="display:inline-block;width:0;height:0;overflow:hidden;">&#8203;</span>`;

  let insertedWithNativeUndo: boolean;
  try {
    insertedWithNativeUndo = document.execCommand(
      "insertHTML",
      false,
      formattedHTML
    );
  } catch {
    insertedWithNativeUndo = false;
  }

  if (!insertedWithNativeUndo) {
    const range = selection.getRangeAt(0);
    range.deleteContents();

    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = formattedHTML;

    const fragment = document.createDocumentFragment();
    while (tempContainer.firstChild) {
      fragment.appendChild(tempContainer.firstChild);
    }

    range.insertNode(fragment);
  }

  const markerFromEditor =
    editorRef.current &&
    typeof (editorRef.current as unknown as { querySelector?: unknown })
      .querySelector === "function"
      ? (editorRef.current as unknown as ParentNode).querySelector(
          `[data-paste-caret="${pasteCaretMarkerAttr}"]`
        )
      : null;
  const marker =
    markerFromEditor ??
    document.querySelector(`[data-paste-caret="${pasteCaretMarkerAttr}"]`);
  if (marker && marker.parentNode) {
    const caretRange = document.createRange();
    caretRange.setStartAfter(marker);
    caretRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caretRange);
    marker.parentNode.removeChild(marker);
  }

  updateContentFn();

  const pendingCount = confirmationCallback
    ? collectedItems.filter((item) => item.needsConfirmation).length
    : 0;

  const runDeferredConfirmations = async (): Promise<void> => {
    const hasConfirmations = Boolean(
      confirmationCallback &&
      collectedItems.some((item) => item.needsConfirmation)
    );

    const finalResolvedTypes: string[] = collectedItems.map(
      (item) => item.classification
    );
    const finalResolvedConfidences: number[] = collectedItems.map(
      (item) => item.confidence
    );

    if (hasConfirmations && confirmationCallback) {
      for (let itemIndex = 0; itemIndex < collectedItems.length; itemIndex++) {
        const item = collectedItems[itemIndex];
        if (!item.needsConfirmation) continue;

        const suggested = item.suggestedType ?? item.classification;
        const confirmedType = await confirmationCallback(
          item.line,
          suggested,
          item.confidence
        );

        if (confirmedType !== suggested && feedbackCollector) {
          feedbackCollector.addCorrection(
            item.line,
            suggested,
            confirmedType,
            item.confidence
          );
        }

        finalResolvedTypes[itemIndex] = confirmedType;
        finalResolvedConfidences[itemIndex] = 100;
      }

      if (
        feedbackCollector &&
        hybridClassifier &&
        feedbackCollector.shouldRetrain()
      ) {
        hybridClassifier.retrainWithCorrections(
          feedbackCollector.exportForTraining()
        );
      }
    }

    const classifiedLines = toClassifiedLineRecords(
      collectedItems,
      finalResolvedTypes,
      finalResolvedConfidences
    );
    const reviewer = new PostClassificationReviewer();
    const reviewPacket = reviewer.review(classifiedLines);

    if (reviewPacket.suspiciousLines.length === 0) {
      onAgentSkipped?.("no-suspicious-lines");
    } else {
      const suspiciousPayload = reviewPacket.suspiciousLines
        .map((suspect) => {
          const itemIndex = suspect.line.lineIndex;
          const item = collectedItems[itemIndex];
          if (!item) return null;
          if (!isLineType(suspect.line.assignedType)) return null;

          return {
            itemIndex,
            lineIndex: suspect.line.lineIndex,
            text: item.line,
            assignedType: suspect.line.assignedType,
            totalSuspicion: suspect.totalSuspicion,
            reasons: suspect.findings.map((f) => f.reason),
            contextLines: suspect.contextLines
              .filter((ctxLine) => isLineType(ctxLine.assignedType))
              .map((ctxLine) => ({
                lineIndex: ctxLine.lineIndex,
                assignedType: ctxLine.assignedType,
                text: ctxLine.text,
              })),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (suspiciousPayload.length === 0) {
        onAgentSkipped?.("suspicious-filtered-out");
      } else {
        const agentRequest: AgentReviewRequestPayload = {
          sessionId,
          totalReviewed: reviewPacket.totalReviewed,
          suspiciousLines: suspiciousPayload,
        };

        const agentResponse = await requestAgentReview(agentRequest, sessionId);
        if (agentResponse.status === "warning") {
          onAgentWarning?.(agentResponse.message);
          onAgentSkipped?.("warning");
        } else if (agentResponse.status === "error") {
          onAgentWarning?.(agentResponse.message);
          onAgentSkipped?.("error");
        } else if (agentResponse.status === "applied") {
          let appliedCount = 0;
          for (const decision of agentResponse.decisions) {
            const idx = decision.itemIndex;
            if (idx < 0 || idx >= finalResolvedTypes.length) continue;
            if (!isLineType(decision.finalType)) continue;
            if (finalResolvedTypes[idx] === decision.finalType) continue;
            finalResolvedTypes[idx] = decision.finalType;
            finalResolvedConfidences[idx] = Math.max(
              85,
              Math.round((decision.confidence ?? 0.9) * 100)
            );
            appliedCount += 1;
          }

          if (appliedCount > 0) {
            onAgentApplied?.({
              appliedCount,
              model: agentResponse.model,
              latencyMs: agentResponse.latencyMs,
            });
          } else {
            onAgentSkipped?.("applied-without-diff");
          }
        } else {
          onAgentSkipped?.("skipped");
        }
      }
    }

    const domTypes: string[] = [];
    let domPreviousFormat = "action";

    for (let itemIndex = 0; itemIndex < collectedItems.length; itemIndex++) {
      const item = collectedItems[itemIndex];
      const resolvedType = finalResolvedTypes[itemIndex];

      const el = document.querySelector(
        `[data-paste-batch="${pasteBatchId}"][data-paste-index="${itemIndex}"]`
      ) as HTMLDivElement | null;
      if (!el) continue;

      if (item.sceneHeaderParts) {
        domTypes.push("scene-header-top-line");
        domPreviousFormat = "scene-header-top-line";
        continue;
      }

      const ctxForDom = buildContext(lines, item.sourceLineIndex, domTypes);
      const formatClass = item.skipAutoFix
        ? resolvedType
        : autoFixClassification(item.line, ctxForDom, resolvedType);
      let cleanLine = item.line;
      if (
        !item.skipColonFix &&
        formatClass === "character" &&
        !cleanLine.endsWith(":") &&
        !cleanLine.endsWith("：")
      ) {
        cleanLine = cleanLine + ":";
      }

      const marginTop = getSpacingMarginTop(domPreviousFormat, formatClass);
      const styles = getFormatStylesFn(formatClass, "", "");
      const finalStyles = { ...styles };
      if (marginTop) {
        finalStyles.marginTop = marginTop;
      }

      el.className = `format-${formatClass}`;
      el.setAttribute("style", cssObjectToString(finalStyles));
      el.textContent = cleanLine;

      domTypes.push(formatClass);
      domPreviousFormat = formatClass;
    }

    updateContentFn();

    // تحديث الذاكرة بعد التأكيدات (أو بدونها) بناءً على الأنواع النهائية
    if (memoryManager) {
      classificationRecords.length = 0;
      dialogueBlocksToTrack.length = 0;
      contextWindow = createContextWindow();
      outputLineIndex = 0;
      lastRecordedIndex = null;
      lastRecordedType = null;
      activeDialogueBlock = null;

      const memTypes: string[] = [];
      for (let itemIndex = 0; itemIndex < collectedItems.length; itemIndex++) {
        const item = collectedItems[itemIndex];
        const resolvedType = finalResolvedTypes[itemIndex];
        const resolvedConfidence = finalResolvedConfidences[itemIndex];

        if (item.sceneHeaderParts) {
          memTypes.push("scene-header-top-line");
          recordClassification(
            item.line,
            "scene-header-top-line",
            resolvedConfidence
          );
          continue;
        }

        const ctxForMem = buildContext(lines, item.sourceLineIndex, memTypes);
        const formatClass = item.skipAutoFix
          ? resolvedType
          : autoFixClassification(item.line, ctxForMem, resolvedType);
        let cleanLine = item.line;
        if (
          !item.skipColonFix &&
          formatClass === "character" &&
          !cleanLine.endsWith(":") &&
          !cleanLine.endsWith("：")
        ) {
          cleanLine = cleanLine + ":";
        }

        memTypes.push(formatClass);
        recordClassification(cleanLine, formatClass, resolvedConfidence);
      }

      closeDialogueBlock();

      if (classificationRecords.length > 0) {
        try {
          await memoryManager.updateMemory(sessionId, classificationRecords);
          if (dialogueBlocksToTrack.length > 0) {
            dialogueBlocksToTrack.forEach(
              ({ character, startLine, endLine }) => {
                memoryManager.trackDialogueBlock(
                  sessionId,
                  character,
                  startLine,
                  endLine
                );
              }
            );
          }
          if (contextWindow.lineRelationships.length > 0) {
            contextWindow.lineRelationships.forEach((relation) => {
              memoryManager.addLineRelation(sessionId, relation);
            });
          }
          if (contextWindow.confidenceMap.size > 0) {
            contextWindow.confidenceMap.forEach((confidence, lineIndex) => {
              const record = classificationRecords[lineIndex - 1];
              if (record) {
                memoryManager.updateConfidence(
                  sessionId,
                  record.line,
                  confidence
                );
              }
            });
          }
        } catch (error) {
          logger.error(`خطأ في تحديث الذاكرة: ${error}`, {
            component: "Memory",
          });
        }
      }
    }
  };

  if (pendingCount > 0 && confirmationCallback) {
    pendingPasteConfirmationJobs.set(pasteBatchId, {
      pendingCount,
      run: runDeferredConfirmations,
    });
    onPendingConfirmations?.(pasteBatchId, pendingCount);
  } else {
    setTimeout(() => {
      runDeferredConfirmations().catch((error) => {
        logger.error(`خطأ في التأكيد المؤجل: ${error}`, { component: "Paste" });
      });
    }, 0);
  }

  logger.info("✅ تم إكمال عملية اللصق والتنسيق", { component: "Paste" });
};
