/**
 * =========================
 *  Text Utilities - أدوات النصوص المشتركة
 * =========================
 *
 * @description
 * مصدر الحقيقة الواحد (Single Source of Truth) لجميع دوال معالجة النصوص
 * المستخدمة في نظام تصنيف السيناريو.
 *
 * تم استخلاص هذه الدوال من عدة ملفات لتجنب التكرار:
 * - paste-classifier.ts
 * - classification-core.ts
 * - hybrid-classifier.ts
 *
 * @responsibilities
 * - تطبيع النص العربي (إزالة التشكيل والمحارف غير المرئية)
 * - كشف أنماط الأكشن (أفعال، شرطات، بادئات)
 * - معالجة أسماء الشخصيات (تطبيع، تنظيف)
 * - أدوات عامة للنصوص
 *
 * @boundaries
 * - يفعل: معالجة نصية بحتة - لا side effects
 * - لا يفعل: لا يحتوي على منطق تصنيف أو حالة
 *
 * @dependencies
 * - arabic-patterns.ts: أنماط Regex والمجموعات
 *
 * @architecture
 * Pure Functions - دوال نقية بدون side effects
 *
 * @complexity
 * معظم الدوال O(n) حيث n طول النص
 *
 * @example
 * ```typescript
 * import { normalizeLine, isActionVerbStart } from '@/utils/text-utils';
 *
 * const clean = normalizeLine('  يـدخــلُ  '); // 'يدخل'
 * const isAction = isActionVerbStart('يدخل أحمد'); // true
 * ```
 */

import {
  ACTION_CUE_RE,
  ACTION_START_PATTERNS,
  FULL_ACTION_VERB_SET,
  IMPERATIVE_VERB_SET,
  MASDAR_PREFIX_RE,
  NEGATION_PLUS_VERB_RE,
  PRONOUN_PLUS_VERB_RE,
  VERB_WITH_PRONOUN_SUFFIX_RE,
} from "./arabic-patterns";

/**
 * normalizes an Arabic text line by removing diacritics, invisible characters,
 * and standardizing spacing.
 * @param input - The raw input string.
 * @returns The normalized string.
 */
export const normalizeLine = (input: string): string => {
  return input
    .replace(/[\u064B-\u065F\u0670]/g, "") // Remove diacritics
    .replace(/[\u200f\u200e\ufeff\u061C\t]+/g, "") // Remove directional marks and zero-width chars
    .replace(/\uF0B7/g, "") // Word bullet (Private Use Area)
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Zero-width characters
    .replace(/[\u2028\u2029]/g, " ") // Line/paragraph separators
    .replace(/[\uE000-\uF8FF]/g, "") // Private Use Area
    .replace(/[\u00AD]/g, "") // Soft hyphen
    .replace(
      // eslint-disable-next-line no-useless-escape
      /^[\s\u200E\u200F\u061C\ufeFF]*[•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃*+\-]+\s*/g,
      ""
    ) // Leading bullets
    .replace(/\s*[:：﹕︰∶꞉ː˸]\s*/g, ":") // Standardize colons
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * Normalizes a character name by removing trailing colons and extra spaces.
 * @param input - The raw character name.
 * @returns The normalized character name.
 */
export const normalizeCharacterName = (input: string): string => {
  return normalizeLine(input)
    .replace(/[:：]+\s*$/, "")
    .trim();
};

/**
 * Checks if a line is an action line starting with a dash.
 * @param line - The line to check.
 * @returns True if it's an action-with-dash line.
 */
export const isActionWithDash = (line: string): boolean => {
  const trimmed = line.trim();
  if (!/^[-–—]/.test(trimmed)) return false;
  const withoutDash = trimmed.replace(/^[-–—]+\s*/, "");
  return Boolean(withoutDash);
};

/**
 * Checks if a line starts with an action verb.
 * @param line - The line to check.
 * @returns True if the line starts with an action verb.
 */
export const isActionVerbStart = (line: string): boolean => {
  const firstToken = normalizeLine(line).split(/\s+/)[0] ?? "";
  const normalized = firstToken
    .replace(/[\u200E\u200F\u061C]/g, "")
    .replace(/[^\u0600-\u06FF]/g, "");
  if (!normalized) return false;
  if (FULL_ACTION_VERB_SET.has(normalized)) return true;

  const leadingParticles = ["و", "ف", "ل"];
  for (const p of leadingParticles) {
    if (normalized.startsWith(p) && normalized.length > 1) {
      const candidate = normalized.slice(1);
      if (FULL_ACTION_VERB_SET.has(candidate)) return true;
    }
  }

  return false;
};

/**
 * Checks if a line matches any of the action start patterns.
 * @param line - The line to check.
 * @returns True if it matches an action start pattern.
 */
export const matchesActionStartPattern = (line: string): boolean => {
  const normalized = normalizeLine(line);
  return ACTION_START_PATTERNS.some((pattern) => pattern.test(normalized));
};

/**
 * Checks if a line has the structure of an action verb phrase.
 * @param line - The line to check.
 * @returns True if it has an action verb structure.
 */
export const hasActionVerbStructure = (line: string): boolean => {
  const normalized = normalizeLine(line);
  if (NEGATION_PLUS_VERB_RE.test(normalized)) return true;
  if (PRONOUN_PLUS_VERB_RE.test(normalized)) return true;
  if (VERB_WITH_PRONOUN_SUFFIX_RE.test(normalized)) return true;
  if (MASDAR_PREFIX_RE.test(normalized)) return true;
  return false;
};

/**
 * Checks if a line is an action cue line (short action indicator).
 * @param line - The line to check.
 * @returns True if it's an action cue line.
 */
export const isActionCueLine = (line: string): boolean => {
  const normalized = normalizeLine(line).replace(/[:：]\s*$/, "");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  if (/[.!?،؛]/.test(normalized)) return false;
  return ACTION_CUE_RE.test(normalized);
};

/**
 * Checks if a line starts with an imperative verb.
 * @param line - The line to check.
 * @returns True if it starts with an imperative verb.
 */
export const isImperativeStart = (line: string): boolean => {
  const firstToken = normalizeLine(line).split(/\s+/)[0] ?? "";
  return IMPERATIVE_VERB_SET.has(firstToken);
};

/**
 * Checks if a line has sentence-ending punctuation.
 * @param line - The line to check.
 * @returns True if it has sentence punctuation.
 */
export const hasSentencePunctuation = (line: string): boolean => {
  return /[.!?،؛]/.test(line);
};

/**
 * Strips leading bullet markers from a line.
 * @param input - The line to process.
 * @returns The line without leading bullets.
 */
export const stripLeadingBullets = (input: string): string => {
  return input.replace(
    // eslint-disable-next-line no-useless-escape
    /^[\s\u200E\u200F\u061C\ufeFF]*[•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃*+\-]+\s*/,
    ""
  );
};

/**
 * Cleans text from invisible characters that can break Arabic words.
 * @param text - The text to clean.
 * @returns The cleaned text.
 */
export const cleanInvisibleChars = (text: string): string => {
  return text
    .replace(/\uF0B7/g, "") // Word bullet
    .replace(/[\uE000-\uF8FF]/g, "") // Private Use Area
    .replace(/[\u200f\u200e\u061C]/g, "") // Directional marks
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Zero-width characters
    .replace(/[\u2028\u2029]/g, "\n") // Line/paragraph separators
    .replace(/[\u00AD]/g, "") // Soft hyphen
    .replace(/\r\n/g, "\n") // Windows line endings
    .replace(/\r/g, "\n"); // Old Mac line endings
};

/**
 * CSS object to string converter for inline styles.
 * @param styles - React CSSProperties object.
 * @returns CSS string.
 */
export const cssObjectToString = (styles: React.CSSProperties): string => {
  return Object.entries(styles)
    .map(([key, value]) => {
      const cssKey = key.replace(
        /[A-Z]/g,
        (match) => `-${match.toLowerCase()}`
      );
      return `${cssKey}: ${String(value)}`;
    })
    .join("; ");
};
