/**
 * @description
 * نواة نظام التصنيف - Classification Core System
 * المحرك الأساسي لمراجعة وتحسين تصنيفات السيناريو
 *
 * @responsibilities
 * - مراجعة التصنيفات بعد التصنيف الأولي
 * - تشغيل كاشفات متخصصة لاكتشاف الأخطاء المحتملة
 * - تجميع درجات الاشتباه من مصادر متعددة
 * - إعداد بيانات السياق للمراجعة الذكية
 * - ضمان جودة التصنيف قبل إرساله للذكاء الاصطناعي
 *
 * @dependencies
 * - text-utils.ts: أدوات التحقق من بنية النص
 * - arabic-patterns.ts: بعض الأنماط الأساسية
 * - screenplay.ts: أنواع السيناريو
 *
 * @stateManagement
 * - Stateless: دوال نقية بدون حالة
 * - يعتمد على مدخلات فقط لاتخاذ القرارات
 *
 * @example
 * ```typescript
 * // مراجعة تصنيفات
 * const reviewer = new PostClassificationReviewer();
 * const packet = reviewer.review(classifiedLines);
 * if (packet.totalSuspicious > 0) {
 *   // إرسال للمراجعة الذكية
 * }
 * ```
 */

/**
 * =====================================================================
 * نظام مراجعة التصنيفات (Post-Classification Reviewer)
 * =====================================================================
 *
 * الغرض: مراجعة تصنيفات عناصر السيناريو بعد تصنيفها بواسطة دوال التصنيف الأصلية.
 * يعمل كحلقة وصل بين مرحلة التصنيف المحلي ومرحلة التحكيم بالنموذج اللغوي.
 *
 * المبدأ الأساسي: Precision over Recall
 * - الأولوية لتقليل الإنذارات الكاذبة (False Positives)
 * - كل سطر يُرسل للنموذج اللغوي = تكلفة ووقت، فل ازم نكون متأكدين من الشك
 *
 * آلية العمل:
 * 1. استلام السطور المصنّفة مسبقاً مع بياناتها
 * 2. تمرير نافذة سياق (10 سطور) على كل سطر
 * 3. تشغيل مجموعة كاشفات (Detectors) متخصصة على كل سطر
 * 4. تجميع درجات الاشتباه من كل كاشف
 * 5. تصدير السطور المشتبه فيها مع سياقها جاهزة للنموذج اللغوي
 *
 * ✅ VALID_SEQUENCES مُصلحة حسب screenplay-rules.ts
 * =====================================================================
 */

import type { LineType } from "@/types/screenplay";
import {
  isActionCueLine,
  isActionVerbStart,
  matchesActionStartPattern,
  hasActionVerbStructure,
  // isActionWithDash و isImperativeStart غير مستخدمة لكن محتفظين بها للمستقبل
} from "./text-utils";
import { PRONOUN_ACTION_RE } from "./arabic-patterns";

// =====================================================================
// الأنواع والواجهات (Types & Interfaces)
// =====================================================================

/** سطر مصنّف مسبقاً - المدخل الأساسي للنظام */
export interface ClassifiedLine {
  /** رقم السطر في المستند */
  readonly lineIndex: number;
  /** النص الأصلي للسطر */
  readonly text: string;
  /** التصنيف المعيّن من دوال التصنيف */
  readonly assignedType: LineType;
  /** درجة الثقة من المصنّف الأصلي (0-100) */
  readonly originalConfidence: number;
  /** الطريقة المستخدمة في التصنيف */
  readonly classificationMethod: "regex" | "ml" | "context" | "fallback";
}

/** نتيجة كاشف واحد لسطر واحد */
export interface DetectorFinding {
  /** معرّف الكاشف */
  readonly detectorId: string;
  /** درجة الاشتباه (0-100) - كلما زادت كلما زاد الشك */
  readonly suspicionScore: number;
  /** سبب الاشتباه بالعربية */
  readonly reason: string;
  /** التصنيف البديل المقترح إن وُجد */
  readonly suggestedType: LineType | null;
}

/** سطر مشتبه فيه - المخرج النهائي */
export interface SuspiciousLine {
  /** السطر المشتبه فيه */
  readonly line: ClassifiedLine;
  /** درجة الاشتباه الإجمالية (0-100) */
  readonly totalSuspicion: number;
  /** نتائج الكاشفات التي رفعت الاشتباه */
  readonly findings: readonly DetectorFinding[];
  /** سطور السياق المحيطة (للإرسال مع السطر للنموذج اللغوي) */
  readonly contextLines: readonly ClassifiedLine[];
}

/** حزمة جاهزة للإرسال للنموذج اللغوي */
export interface LLMReviewPacket {
  /** عدد السطور المشتبه فيها */
  readonly totalSuspicious: number;
  /** إجمالي السطور المراجَعة */
  readonly totalReviewed: number;
  /** نسبة الاشتباه */
  readonly suspicionRate: number;
  /** السطور المشتبه فيها مرتبة بدرجة الاشتباه تنازلياً */
  readonly suspiciousLines: readonly SuspiciousLine[];
}

/** إعدادات النظام */
export interface ReviewerConfig {
  /** حجم نافذة السياق (عدد السطور قبل وبعد) - الافتراضي 5 (مجموع 10) */
  readonly contextRadius: number;
  /** الحد الأدنى لدرجة الاشتباه لإدراج السطر (0-100) - الافتراضي 60 */
  readonly suspicionThreshold: number;
  /** الحد الأقصى لعدد السطور المشتبه فيها كنسبة من الإجمالي - الافتراضي 0.15 */
  readonly maxSuspicionRatio: number;
  /**
   * أقل عدد إشارات (Detectors) مطلوب لاعتبار السطر "مشتبه"
   * الهدف: تقليل الشك المفرط الناتج عن إشارة منفردة
   */
  readonly minSignalsForSuspicion: number;
  /**
   * عتبة استثناء: لو إشارة واحدة لكن شدتها عالية جداً نسمح بالتصعيد
   * (مثال: انتهاك فادح وواضح)
   */
  readonly highSeveritySingleSignal: number;
  /** تفعيل/تعطيل كاشفات محددة */
  readonly enabledDetectors: ReadonlySet<string>;
}

// =====================================================================
// الإعدادات الافتراضية
// =====================================================================

const DEFAULT_CONFIG: ReviewerConfig = {
  contextRadius: 5,
  // إعدادات أكثر تحفظاً لتقليل الإنذارات الكاذبة وقت اللصق
  suspicionThreshold: 74,
  maxSuspicionRatio: 0.08,
  minSignalsForSuspicion: 2,
  highSeveritySingleSignal: 90,
  enabledDetectors: new Set([
    "sequence-violation",
    "content-type-mismatch",
    "split-character-fragment",
    "statistical-anomaly",
    "confidence-drop",
  ]),
};

// =====================================================================
// قواعد تسلسل السيناريو (Screenplay Sequence Grammar)
// ✅ مُصلحة حسب screenplay-rules.ts
// =====================================================================

/**
 * خريطة التسلسلات المسموحة في السيناريو
 * المفتاح: نوع السطر الحالي
 * القيمة: الأنواع المسموح أن تأتي بعده
 *
 * ✅ تم التصحيح بناءً على screenplay-rules.ts (المرجع الصحيح)
 */
const VALID_SEQUENCES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  // ✅ character → dialogue أو parenthetical فقط
  ["character", new Set(["dialogue", "parenthetical"])],

  // ✅ parenthetical → dialogue فقط
  ["parenthetical", new Set(["dialogue"])],

  // ✅ dialogue → dialogue (استكمال)، action، character، transition، parenthetical
  [
    "dialogue",
    new Set(["dialogue", "action", "character", "transition", "parenthetical"]),
  ],

  // ✅ action → action, character, transition, scene-header-1/top-line
  [
    "action",
    new Set([
      "action",
      "character",
      "transition",
      "scene-header-1",
      "scene-header-top-line",
    ]),
  ],

  // ✅ transition → scene-header-1 / top-line / action
  [
    "transition",
    new Set(["scene-header-1", "scene-header-top-line", "action"]),
  ],

  // top-line عنصر مركب في مسار اللصق وقد يتبعه أكشن مباشرة
  [
    "scene-header-top-line",
    new Set([
      "action",
      "character",
      "transition",
      "scene-header-1",
      "scene-header-top-line",
    ]),
  ],

  // قد تأتي 2/3 أو أكشن مباشرة حسب شكل الملف
  [
    "scene-header-1",
    new Set([
      "scene-header-2",
      "scene-header-3",
      "action",
      "scene-header-top-line",
    ]),
  ],

  ["scene-header-2", new Set(["scene-header-3", "action"])],

  ["scene-header-3", new Set(["action", "character"])],

  // ✅ basmala → scene-header-top-line, scene-header-1, action, character
  [
    "basmala",
    new Set(["scene-header-top-line", "scene-header-1", "action", "character"]),
  ],
]);

/**
 * درجة خطورة كل نوع من انتهاكات التسلسل
 * بعض الانتهاكات أخطر من غيرها
 */
const SEQUENCE_VIOLATION_SEVERITY: ReadonlyMap<string, number> = new Map([
  // انتهاكات حرجة (خطأ شبه مؤكد)
  ["character→character", 95],
  ["parenthetical→action", 90],
  ["parenthetical→character", 90],
  ["parenthetical→transition", 90],

  // انتهاكات عالية (خطأ محتمل جداً)
  ["transition→dialogue", 80],
  ["transition→character", 75],

  // انتهاكات متوسطة (تستحق المراجعة)
  ["scene-header-1→dialogue", 70],
  ["scene-header-2→dialogue", 70],
  ["scene-header-3→dialogue", 70],
  ["scene-header-1→action", 75], // يجب المرور على scene-header-2 و 3 أولاً
  ["scene-header-1→character", 75],
  ["scene-header-2→action", 75], // يجب المرور على scene-header-3 أولاً
  ["scene-header-2→character", 75],
]);

// =====================================================================
// أدوات تحليل المحتوى النصي
// =====================================================================

/** خصائص نصية مستخلصة من السطر */
interface TextFeatures {
  readonly wordCount: number;
  readonly charCount: number;
  readonly hasColon: boolean;
  readonly hasPunctuation: boolean;
  readonly startsWithDash: boolean;
  readonly startsWithBullet: boolean;
  readonly isParenthetical: boolean;
  readonly hasActionIndicators: boolean;
  readonly hasDialogueIndicators: boolean;
  readonly isUppercaseArabic: boolean;
  readonly endsWithColon: boolean;
  readonly isEmpty: boolean;
  readonly normalized: string;
}

/**
 * استخلاص الخصائص النصية من سطر واحد
 * هذه الدالة مركزية - تُستدعى مرة واحدة لكل سطر ونتائجها تُمرر لكل الكاشفات
 */
const extractTextFeatures = (text: string): TextFeatures => {
  const normalized = text.replace(/[\u200f\u200e\ufeff]/g, "").trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  return {
    wordCount: words.length,
    charCount: normalized.length,
    hasColon: /[:：]/.test(normalized),
    hasPunctuation: /[.!?؟،,؛;]/.test(normalized),
    startsWithDash: /^[-–—]/.test(normalized),
    startsWithBullet: /^[•●○]/.test(normalized),
    isParenthetical: /^\(.*\)$/.test(normalized),
    hasActionIndicators: detectActionIndicators(normalized),
    hasDialogueIndicators: detectDialogueIndicators(normalized),
    isUppercaseArabic:
      words.length <= 3 &&
      !normalized.includes(" ") === false &&
      !/[.!?؟]/.test(normalized),
    endsWithColon: /[:：]\s*$/.test(normalized),
    isEmpty: normalized.length === 0,
    normalized,
  };
};

/**
 * كشف مؤشرات وصف المشهد (Action)
 * يفحص أنماط متعددة تدل على أن السطر وصف مشهد وليس حوار
 */
const detectActionIndicators = (text: string): boolean => {
  if (!text) return false;

  // شرطة في البداية → وصف مشهد
  if (/^[-–—]/.test(text)) return true;
  // نقطة في البداية
  if (/^[•●○]/.test(text)) return true;

  try {
    if (isActionCueLine(text)) return true;
    if (matchesActionStartPattern(text)) return true;
    if (isActionVerbStart(text)) return true;
    if (hasActionVerbStructure(text)) return true;
    if (PRONOUN_ACTION_RE.test(text)) return true;
  } catch {
    // في حالة فشل أي من الدوال الخارجية، نتجاهل ونكمل
  }

  return false;
};

/**
 * كشف مؤشرات الحوار
 * أنماط تدل على أن السطر حوار وليس وصف
 */
const detectDialogueIndicators = (text: string): boolean => {
  if (!text) return false;

  // علامات الاقتباس
  if (/^["«"']/.test(text)) return true;
  // أنماط الكلام المباشر
  if (/^(قال|قالت|يقول|تقول|سأل|سألت|أجاب|أجابت|رد|ردت)/.test(text))
    return false; // هذا سرد مش حوار
  // نص قصير بدون علامات ترقيم خاصة بالأوصاف
  if (text.length < 100 && !/^[-–—•●○]/.test(text)) return true;

  return false;
};

/**
 * تطبيع جزء اسم محتمل (إزالة النقطتين والمحارف غير المرئية)
 */
const normalizeNameFragment = (text: string): string =>
  (text ?? "")
    .replace(/[\u200f\u200e\ufeff]/g, "")
    .replace(/[:：]/g, "")
    .trim();

/**
 * فحص محافظ: هل النص "قد" يكون جزء اسم شخصية؟
 * الهدف: تجنب الإنذارات الكاذبة قدر الإمكان.
 */
const isLikelyCharacterFragment = (
  text: string,
  limits: { minChars: number; maxChars: number; maxWords: number }
): boolean => {
  const normalized = normalizeNameFragment(text);
  if (!normalized) return false;
  if (
    normalized.length < limits.minChars ||
    normalized.length > limits.maxChars
  )
    return false;
  if (/[.!?؟،,؛;"'«»()[\]{}]/.test(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > limits.maxWords) return false;

  return tokens.every((token) => /^[\u0600-\u06FF0-9٠-٩]+$/.test(token));
};

/**
 * هل السطر يحمل إشارة سرد/وصف واضحة؟
 * يستخدم لاستبعاد حالات الدمج الوهمي.
 */
const hasStrongNarrativeActionSignal = (text: string): boolean => {
  const normalized = (text ?? "").trim();
  if (!normalized) return false;
  if (/^[-–—•●○]/.test(normalized)) return true;

  try {
    return (
      isActionCueLine(normalized) ||
      matchesActionStartPattern(normalized) ||
      isActionVerbStart(normalized) ||
      hasActionVerbStructure(normalized) ||
      PRONOUN_ACTION_RE.test(normalized)
    );
  } catch {
    return false;
  }
};

// =================================================================
// الكاشفات (Detectors)
// =====================================================================

/**
 * واجهة الكاشف الموحدة
 * كل كاشف بيفحص جانب معيّن من صحة التصنيف
 */
interface SuspicionDetector {
  readonly id: string;
  detect(
    line: ClassifiedLine,
    features: TextFeatures,
    context: readonly ClassifiedLine[],
    linePosition: number
  ): DetectorFinding | null;
}

// ---------------------------------------------------------------------
// كاشف انتهاك التسلسل (Sequence Violation Detector)
// ---------------------------------------------------------------------

/**
 * يفحص: هل التصنيف الحالي يأتي في تسلسل منطقي بعد السطر السابق؟
 *
 * مثال: لو السطر السابق "حوار" والحالي "حوار" → انتهاك
 * لأن في السيناريو لازم يكون بينهم اسم شخصية على الأقل
 *
 * استثناء مهم: أول سطر في المستند أو بعد سطر فارغ → لا يُفحص
 */
const createSequenceViolationDetector = (): SuspicionDetector => ({
  id: "sequence-violation",

  detect(
    line: ClassifiedLine,
    _features: TextFeatures,
    context: readonly ClassifiedLine[],
    linePosition: number
  ): DetectorFinding | null {
    // لا نفحص أول سطر
    if (linePosition === 0) return null;

    // السطر السابق المباشر
    const prevLine = context[linePosition - 1];
    if (!prevLine) return null;

    const prevType = String(prevLine.assignedType);
    const currentType = String(line.assignedType);

    // فحص التسلسل المسموح
    const allowedNext = VALID_SEQUENCES.get(prevType);

    // لو النوع السابق مش في الخريطة أصلاً → لا نحكم
    if (!allowedNext) return null;

    // لو التسلسل مسموح → لا اشتباه
    if (allowedNext.has(currentType)) return null;

    //تحديد درجة الخطورة
    const violationKey = `${prevType}→${currentType}`;
    const severity = SEQUENCE_VIOLATION_SEVERITY.get(violationKey) ?? 65;

    // تحديد التصنيف البديل المقترح
    const suggestedType = suggestTypeFromSequence(prevType, line, _features);

    return {
      detectorId: "sequence-violation",
      suspicionScore: severity,
      reason: `انتهاك تسلسل: "${currentType}" بعد "${prevType}" غير متوقع`,
      suggestedType,
    };
  },
});

/**
 * اقتراح تصنيف بديل بناءً على السطر السابق وخصائص المحتوى
 */
const suggestTypeFromSequence = (
  prevType: string,
  line: ClassifiedLine,
  features: TextFeatures
): LineType | null => {
  // بعد character → الأرجح dialogue
  if (prevType === "character") {
    return features.isParenthetical
      ? ("parenthetical" as LineType)
      : ("dialogue" as LineType);
  }

  // بعد parenthetical → dialogue
  if (prevType === "parenthetical") {
    return "dialogue" as LineType;
  }

  // بعد dialogue → character أو action
  if (prevType === "dialogue") {
    if (
      features.endsWithColon ||
      (features.wordCount <= 3 && !features.hasPunctuation)
    ) {
      return "character" as LineType;
    }
    return "action" as LineType;
  }

  // بعد transition → scene-header-1
  if (prevType === "transition") {
    return "scene-header-1" as LineType;
  }

  // بعد scene-header-1 → scene-header-2
  if (prevType === "scene-header-1") {
    return "scene-header-2" as LineType;
  }

  // بعد scene-header-2 → scene-header-3
  if (prevType === "scene-header-2") {
    return "scene-header-3" as LineType;
  }

  // بعد scene-header-3 → action
  if (prevType === "scene-header-3") {
    return "action" as LineType;
  }

  return null;
};

// ---------------------------------------------------------------------
// كاشف تناقض المحتوى مع التصنيف (Content-Type Mismatch Detector)
// ---------------------------------------------------------------------

/**
 * يفحص: هل خصائص النص تتوافق مع التصنيف المعيّن؟
 *
 * أمثلة على التناقض:
 * - سطر مصنّف "character" لكنه 50 كلمة → مريب
 * - سطر مصنّف "action" لكنه كلمتين بدون شرطة → مريب
 * - سطر مصنّف "dialogue" لكن فيه شرطة في البداية → مريب
 *
 * هذا الكاشف بيركّز على التناقضات الواضحة فقط (Precision)
 */
const createContentTypeMismatchDetector = (): SuspicionDetector => ({
  id: "content-type-mismatch",

  detect(
    line: ClassifiedLine,
    features: TextFeatures,
    _context: readonly ClassifiedLine[],
    _linePosition: number
  ): DetectorFinding | null {
    if (features.isEmpty) return null;

    const type = String(line.assignedType);

    // --- فحوصات character ---
    if (type === "character") {
      // اسم شخصية طويل جداً → مريب
      if (features.wordCount > 5) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 80,
          reason: `مصنّف "character" لكنه ${features.wordCount} كلمات - طويل جداً لاسم شخصية`,
          suggestedType: features.hasActionIndicators
            ? ("action" as LineType)
            : ("dialogue" as LineType),
        };
      }
      // اسم شخصية فيه علامات ترقيم نهائية
      if (/[.!?؟]$/.test(features.normalized)) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 75,
          reason: 'مصنّف "character" لكنه ينتهي بعلامة ترقيم جملة',
          suggestedType: "dialogue" as LineType,
        };
      }
    }

    // --- فحوصات dialogue ---
    if (type === "dialogue") {
      // حوار يبدأ بشرطة → أرجح action
      if (features.startsWithDash && features.hasActionIndicators) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 82,
          reason: 'مصنّف "dialogue" لكنه يبدأ بشرطة ويحتوي مؤشرات وصف مشهد',
          suggestedType: "action" as LineType,
        };
      }
      // حوار فيه أقواس كاملة → parenthetical
      if (features.isParenthetical) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 88,
          reason: 'مصنّف "dialogue" لكنه محاط بأقواس بالكامل → إرشاد مسرحي',
          suggestedType: "parenthetical" as LineType,
        };
      }
    }

    // --- فحوصات action ---
    if (type === "action") {
      // وصف مشهد ينتهي بنقطتين → أرجح character
      if (features.endsWithColon && features.wordCount <= 3) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 78,
          reason: 'مصنّف "action" لكنه ينتهي بنقطتين وقصير → أرجح اسم شخصية',
          suggestedType: "character" as LineType,
        };
      }
    }

    // --- فحوصات parenthetical ---
    if (type === "parenthetical") {
      // إرشاد مسرحي بدون أقواس
      if (
        !features.isParenthetical &&
        !features.normalized.includes("(") &&
        !features.normalized.includes("（")
      ) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 72,
          reason: 'مصنّف "parenthetical" لكن لا يحتوي أقواس',
          suggestedType: "dialogue" as LineType,
        };
      }
    }

    // --- فحوصات transition ---
    if (type === "transition") {
      // انتقال طويل جداً
      if (features.wordCount > 6) {
        return {
          detectorId: "content-type-mismatch",
          suspicionScore: 70,
          reason: `مصنّف "transition" لكنه ${features.wordCount} كلمات - طويل جداً للانتقال`,
          suggestedType: "action" as LineType,
        };
      }
    }

    return null;
  },
});

// ---------------------------------------------------------------------
// كاشف تجزئة اسم الشخصية عبر سطرين (Split Character Fragment Detector)
// ---------------------------------------------------------------------

/**
 * يرصد حالة متكررة في اللصق من DOCX/PDF:
 * - السطر الحالي مصنف action قصير جداً (جزء اسم)
 * - السطر التالي مصنف character قصير جداً وينتهي بنقطتين
 * - دمج الجزئين يعطي اسم شخصية منطقي
 *
 * الهدف: تصعيد الحالة للمراجعة، وليس تعديل النص تلقائياً.
 */
const createSplitCharacterFragmentDetector = (): SuspicionDetector => ({
  id: "split-character-fragment",

  detect(
    line: ClassifiedLine,
    features: TextFeatures,
    context: readonly ClassifiedLine[],
    linePosition: number
  ): DetectorFinding | null {
    if (features.isEmpty) return null;
    if (String(line.assignedType) !== "action") return null;
    if (features.wordCount > 2) return null;

    const currentText = normalizeNameFragment(line.text);
    if (
      !isLikelyCharacterFragment(currentText, {
        minChars: 2,
        maxChars: 14,
        maxWords: 2,
      })
    ) {
      return null;
    }

    // لو فيه إشارة سرد واضحة، نعتبره Action حقيقي ونستبعده
    if (hasStrongNarrativeActionSignal(features.normalized)) return null;

    const nextLine = context[linePosition + 1];
    if (!nextLine || String(nextLine.assignedType) !== "character") return null;

    const nextFeatures = extractTextFeatures(nextLine.text);
    if (!nextFeatures.endsWithColon) return null;

    const nextText = normalizeNameFragment(nextLine.text);
    if (
      !isLikelyCharacterFragment(nextText, {
        minChars: 1,
        maxChars: 4,
        maxWords: 1,
      })
    ) {
      return null;
    }

    const mergedDirect = `${currentText}${nextText}`;
    const mergedWithSpace = `${currentText} ${nextText}`;
    const mergedLooksLikeName =
      isLikelyCharacterFragment(mergedDirect, {
        minChars: 3,
        maxChars: 32,
        maxWords: 3,
      }) ||
      isLikelyCharacterFragment(mergedWithSpace, {
        minChars: 3,
        maxChars: 32,
        maxWords: 3,
      });

    if (!mergedLooksLikeName) return null;

    return {
      detectorId: "split-character-fragment",
      suspicionScore: 92,
      reason: `اشتباه تجزئة اسم شخصية بين سطرين: "${currentText}" + "${nextText}"`,
      // التصحيح غالباً يحتاج دمج نصي، لذلك لا نقترح Type بديل هنا
      suggestedType: null,
    };
  },
});

// ---------------------------------------------------------------------
// كاشف الشذوذ الإحصائي (Statistical Anomaly Detector)
// ---------------------------------------------------------------------

/**
 * النطاقات الإحصائية الطبيعية لكل نوع
 * مبنية على تحليل سيناريوهات عربية فعلية
 *
 * minWords/maxWords: النطاق الطبيعي لعدد الكلمات
 * النطاق واسع عمداً → نريد كشف الحالات الشاذة فقط
 */
const TYPE_STATISTICS: ReadonlyMap<
  string,
  { minWords: number; maxWords: number }
> = new Map([
  ["character", { minWords: 1, maxWords: 4 }],
  ["parenthetical", { minWords: 1, maxWords: 12 }],
  ["transition", { minWords: 1, maxWords: 5 }],
  // رفع الحدود لأن بعض ملفات اللصق العربية بتكون سطور طويلة جدًا قبل إعادة اللف
  ["dialogue", { minWords: 1, maxWords: 140 }],
  ["action", { minWords: 2, maxWords: 240 }],
  ["scene-header-1", { minWords: 2, maxWords: 15 }],
  ["scene-header-2", { minWords: 2, maxWords: 15 }],
  ["scene-header-3", { minWords: 2, maxWords: 15 }],
  ["scene-header-top-line", { minWords: 1, maxWords: 10 }],
  ["basmala", { minWords: 1, maxWords: 6 }],
]);

const createStatisticalAnomalyDetector = (): SuspicionDetector => ({
  id: "statistical-anomaly",

  detect(
    line: ClassifiedLine,
    features: TextFeatures,
    _context: readonly ClassifiedLine[],
    _linePosition: number
  ): DetectorFinding | null {
    if (features.isEmpty) return null;

    const type = String(line.assignedType);
    const stats = TYPE_STATISTICS.get(type);
    if (!stats) return null;

    // فحص الخروج عن النطاق الطبيعي
    if (features.wordCount > stats.maxWords) {
      const excess = features.wordCount - stats.maxWords;
      const score = Math.min(60 + excess * 3, 90);
      return {
        detectorId: "statistical-anomaly",
        suspicionScore: score,
        reason: `"${type}" بطول ${features.wordCount} كلمة يتجاوز الحد الأقصى الطبيعي (${stats.maxWords})`,
        suggestedType: null,
      };
    }

    // كلمة واحدة مصنّفة action → مريب (لكن مش بالضرورة غلط)
    if (type === "action" && features.wordCount < stats.minWords) {
      return {
        detectorId: "statistical-anomaly",
        suspicionScore: 55,
        reason: `"action" بكلمة واحدة فقط - قصير جداً لوصف مشهد`,
        suggestedType: "character" as LineType,
      };
    }

    return null;
  },
});

// ---------------------------------------------------------------------
// كاشف انخفاض الثقة (Confidence Drop Detector)
// ---------------------------------------------------------------------

/**
 * يفحص: هل المصنّف الأصلي كان متردد في تصنيفه؟
 *
 * لو الثقة الأصلية منخفضة + الطريقة fallback → السطر يستحق مراجعة
 * لو الثقة الأصلية عالية + regex → السطر آمن غالباً
 *
 * هذا الكاشف بمفرده لا يكفي لرفع الاشتباه
 * لكنه بيعزز الاشتباه لو كاشف تاني اشتبه في نفس السطر
 */
const createConfidenceDropDetector = (): SuspicionDetector => ({
  id: "confidence-drop",

  detect(
    line: ClassifiedLine,
    _features: TextFeatures,
    _context: readonly ClassifiedLine[],
    _linePosition: number
  ): DetectorFinding | null {
    // regex عالي الثقة → لا اشتباه
    if (
      line.classificationMethod === "regex" &&
      line.originalConfidence >= 90
    ) {
      return null;
    }

    // fallback بثقة منخفضة → مريب
    if (
      line.classificationMethod === "fallback" &&
      line.originalConfidence < 60
    ) {
      return {
        detectorId: "confidence-drop",
        suspicionScore: 50,
        reason: `تصنيف بطريقة fallback بثقة ${line.originalConfidence}% فقط`,
        suggestedType: null,
      };
    }

    // أي طريقة بثقة منخفضة جداً
    if (line.originalConfidence < 45) {
      return {
        detectorId: "confidence-drop",
        suspicionScore: 55,
        reason: `ثقة التصنيف الأصلي منخفضة جداً: ${line.originalConfidence}%`,
        suggestedType: null,
      };
    }

    return null;
  },
});

// =====================================================================
// محرك المراجعة الرئيسي (Review Engine)
// =====================================================================

/**
 * حساب درجة الاشتباه الإجمالية من نتائج عدة كاشفات
 *
 * المنطق:
 * - لو كاشف واحد بس اشتبه → ناخد درجته مباشرة
 * - لو أكتر من كاشف → بنجمّع بطريقة weighted: أعلى درجة + 30% من الباقي
 * - الحد الأقصى 99 (مفيش 100% اشتباه)
 *
 * السبب: كاشفين مشتبهين في نفس السطر = اشتباه أقوى من مجرد جمع
 * لكن مش المضاعفة لأن ممكن يكونوا بيكشفوا نفس المشكلة
 */
const calculateTotalSuspicion = (
  findings: readonly DetectorFinding[]
): number => {
  if (findings.length === 0) return 0;
  if (findings.length === 1) return findings[0].suspicionScore;

  // ترتيب تنازلي
  const sorted = [...findings].sort(
    (a, b) => b.suspicionScore - a.suspicionScore
  );

  // أعلى درجة + 30% من مجموع الباقي
  const primary = sorted[0].suspicionScore;
  const secondary = sorted
    .slice(1)
    .reduce((sum, f) => sum + f.suspicionScore, 0);
  const combined = primary + secondary * 0.3;

  return Math.min(Math.round(combined), 99);
};

/**
 * استخلاص نافذة السياق حول سطر معيّن
 * بترجع السطور المحيطة ضمن نطاق contextRadius
 */
const extractContextWindow = (
  lines: readonly ClassifiedLine[],
  centerIndex: number,
  radius: number
): readonly ClassifiedLine[] => {
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(lines.length, centerIndex + radius + 1);
  return lines.slice(start, end);
};

// =====================================================================
// الكلاس الرئيسي
// =====================================================================

/**
 * مراجع التصنيفات (PostClassificationReviewer)
 *
 * الاستخدام:
 * ```typescript
 * const reviewer = new PostClassificationReviewer();
 * const packet = reviewer.review(classifiedLines);
 * // packet.suspiciousLines → جاهزة للإرسال للنموذج اللغوي
 * ```
 */
export class PostClassificationReviewer {
  private readonly config: ReviewerConfig;
  private readonly detectors: readonly SuspicionDetector[];

  constructor(config?: Partial<ReviewerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detectors = this.initializeDetectors();
  }

  /**
   * بوابة التصعيد النهائي:
   * - لا نصعد إلا عند وجود أكثر من إشارة
   * - أو إشارة منفردة لكنها شديدة جدًا
   */
  private shouldEscalate(
    totalSuspicion: number,
    findings: readonly DetectorFinding[]
  ): boolean {
    if (totalSuspicion < this.config.suspicionThreshold) return false;
    if (findings.length >= this.config.minSignalsForSuspicion) return true;
    return totalSuspicion >= this.config.highSeveritySingleSignal;
  }

  /**
   * تهيئة الكاشفات المفعّلة حسب الإعدادات
   */
  private initializeDetectors(): readonly SuspicionDetector[] {
    const allDetectors: readonly SuspicionDetector[] = [
      createSequenceViolationDetector(),
      createContentTypeMismatchDetector(),
      createSplitCharacterFragmentDetector(),
      createStatisticalAnomalyDetector(),
      createConfidenceDropDetector(),
    ];

    return allDetectors.filter((d) => this.config.enabledDetectors.has(d.id));
  }

  /**
   * المراجعة الرئيسية - نقطة الدخول الوحيدة
   *
   * تستلم مصفوفة السطور المصنّفة وترجع حزمة جاهزة للنموذج اللغوي
   * تحتوي فقط السطور المشتبه فيها مع سياقها
   */
  review(classifiedLines: readonly ClassifiedLine[]): LLMReviewPacket {
    if (classifiedLines.length === 0) {
      return {
        totalSuspicious: 0,
        totalReviewed: 0,
        suspicionRate: 0,
        suspiciousLines: [],
      };
    }

    // المرحلة 1: تشغيل الكاشفات على كل سطر
    const rawSuspicious: SuspiciousLine[] = [];

    for (let i = 0; i < classifiedLines.length; i++) {
      const line = classifiedLines[i];
      const features = extractTextFeatures(line.text);
      const context = extractContextWindow(
        classifiedLines,
        i,
        this.config.contextRadius
      );

      // حساب الموضع النسبي داخل ن افذة السياق
      const linePositionInContext =
        i - Math.max(0, i - this.config.contextRadius);

      // تشغيل كل كاشف
      const findings: DetectorFinding[] = [];
      for (const detector of this.detectors) {
        const finding = detector.detect(
          line,
          features,
          context,
          linePositionInContext
        );
        if (finding !== null) {
          findings.push(finding);
        }
      }

      // حساب الاشتباه الإجمالي
      const totalSuspicion = calculateTotalSuspicion(findings);

      // لو تجاوز الحد → إضافة للقائمة
      if (this.shouldEscalate(totalSuspicion, findings)) {
        rawSuspicious.push({
          line,
          totalSuspicion,
          findings,
          contextLines: context,
        });
      }
    }

    // المرحلة 2: تقليم النتائج حسب الحد الأقصى للنسبة
    const maxAllowed = Math.ceil(
      classifiedLines.length * this.config.maxSuspicionRatio
    );
    const trimmed = rawSuspicious
      .sort((a, b) => b.totalSuspicion - a.totalSuspicion)
      .slice(0, maxAllowed);

    return {
      totalSuspicious: trimmed.length,
      totalReviewed: classifiedLines.length,
      suspicionRate: trimmed.length / classifiedLines.length,
      suspiciousLines: trimmed,
    };
  }

  /**
   * مراجعة سطر واحد بسياقه
   * مفيدة للمراجعة التفاعلية أثناء الكتابة (سطر بسطر)
   */
  reviewSingleLine(
    line: ClassifiedLine,
    surroundingLines: readonly ClassifiedLine[]
  ): SuspiciousLine | null {
    const features = extractTextFeatures(line.text);

    // إيجاد موضع السطر في السياق
    const linePosition = surroundingLines.findIndex(
      (l) => l.lineIndex === line.lineIndex
    );
    if (linePosition === -1) return null;

    const findings: DetectorFinding[] = [];
    for (const detector of this.detectors) {
      const finding = detector.detect(
        line,
        features,
        surroundingLines,
        linePosition
      );
      if (finding !== null) {
        findings.push(finding);
      }
    }

    const totalSuspicion = calculateTotalSuspicion(findings);

    if (totalSuspicion < this.config.suspicionThreshold) {
      return null;
    }

    return {
      line,
      totalSuspicion,
      findings,
      contextLines: surroundingLines,
    };
  }

  /**
   * تحويل حزمة المراجعة إلى نص مهيكل للنموذج اللغوي
   *
   * بينتج prompt مُحسّن يحتوي:
   * 1. السطر المشتبه فيه
   * 2. التصنيف الحالي وأسباب الاشتباه
   * 3. السياق المحيط (10 سطور)
   * 4. التصنيف البديل المقترح إن وُجد
   *
   * التنسيق مصمم لتقليل التوكنات مع الحفاظ على كل المعلومات المطلوبة
   */
  formatForLLM(packet: LLMReviewPacket): string {
    if (packet.suspiciousLines.length === 0) {
      return "";
    }

    const sections: string[] = [
      `<review_request count="${packet.totalSuspicious}" total_lines="${packet.totalReviewed}">`,
    ];

    for (const suspicious of packet.suspiciousLines) {
      const { line, totalSuspicion, findings, contextLines } = suspicious;

      // سياق مضغوط: رقم|نوع|نص
      const contextStr = contextLines
        .map((cl) => {
          const marker = cl.lineIndex === line.lineIndex ? ">>>" : "   ";
          return `${marker} L${cl.lineIndex}|${cl.assignedType}|${cl.text}`;
        })
        .join("\n");

      // أسباب الاشتباه
      const reasons = findings.map((f) => f.reason).join("؛ ");

      // التصنيف البديل المقترح (أول اقتراح غير null)
      const suggested =
        findings.find((f) => f.suggestedType !== null)?.suggestedType ?? "";

      sections.push(
        `<suspect line="${line.lineIndex}" current="${line.assignedType}" suspicion="${totalSuspicion}" suggested="${suggested}">`,
        `<reasons>${reasons}</reasons>`,
        `<context>\n${contextStr}\n</context>`,
        `</suspect>`
      );
    }

    sections.push("</review_request>");
    return sections.join("\n");
  }
}

// =====================================================================
// طبقة التوافق (Compatibility Layer)
// =====================================================================
//
// هذه الدوال والأنواع موجودة للتوافق مع الكود القديم فقط.
// النظام الجديد (PostClassificationReviewer) لا يستخدمها.
//
// الملفات التي تستخدم هذه الدوال:
// - paste-classifier.ts
// - context-window.ts
// - context-memory-manager.ts
// - hybrid-classifier.ts
// =====================================================================

/** كتلة حوار (اسم شخصية + سطور الحوار التابعة) */
export interface DialogueBlock {
  /** اسم الشخصية */
  readonly character: string;
  /** رقم سطر البداية */
  readonly startLine: number;
  /** رقم سطر النهاية */
  readonly endLine: number;
  /** عدد السطور في الكتلة */
  readonly lineCount?: number;
}

/** علاقة بين سطرين */
export interface LineRelation {
  /** رقم السطر المصدر */
  readonly from: number;
  /** رقم السطر الهدف */
  readonly to: number;
  /** نوع العلاقة */
  readonly type: "response" | "continuation" | "action-result";
}

/** نافذة سياق - هيكل بيانات يحتفظ بالعلاقات والثقة */
export interface ContextWindow {
  /** علاقات بين السطور */
  readonly lineRelationships: readonly LineRelation[];
  /** خريطة الثقة لكل سطر */
  readonly confidenceMap: ReadonlyMap<number, number>;
  /** كتل الحوار المسجلة */
  readonly dialogueBlocks: readonly DialogueBlock[];
}

/**
 * إنشاء نافذة سياق فارغة
 */
export function createContextWindow(): ContextWindow {
  return {
    lineRelationships: [],
    confidenceMap: new Map(),
    dialogueBlocks: [],
  };
}

/**
 * إضافة علاقة بين سطرين
 */
export function addLineRelation(
  window: ContextWindow,
  from: number,
  to: number,
  type: "response" | "continuation" | "action-result"
): ContextWindow {
  return {
    ...window,
    lineRelationships: [...window.lineRelationships, { from, to, type }],
  };
}

/**
 * تسجيل كتلة حوار
 */
export function trackDialogueBlock(
  window: ContextWindow,
  character: string,
  startLine: number,
  endLine: number
): ContextWindow {
  return {
    ...window,
    dialogueBlocks: [
      ...window.dialogueBlocks,
      { character, startLine, endLine },
    ],
  };
}

/**
 * تحديث درجة الثقة لسطر معيّن
 */
export function updateConfidence(
  window: ContextWindow,
  lineIndex: number,
  confidence: number
): ContextWindow {
  const newMap = new Map(window.confidenceMap);
  newMap.set(lineIndex, confidence);
  return {
    ...window,
    confidenceMap: newMap,
  };
}

/**
 * كشف نمط من النص (dummy implementation)
 * بتاخد optional parameter للترتيب (للتوافق مع context-memory-manager)
 */
export function detectPattern(
  _text: string | readonly unknown[],
  _order?: string
): string | null {
  return null;
}

/**
 * الحصول على آخر كتلة حوار نشطة
 */
export function getActiveDialogueBlock(
  window: ContextWindow
): DialogueBlock | null {
  if (window.dialogueBlocks.length === 0) return null;
  return window.dialogueBlocks[window.dialogueBlocks.length - 1];
}

/**
 * نتيجة المصنّف الهجين
 */
export interface HybridResult {
  /** نوع التصنيف */
  readonly type: string;
  /** درجة الثقة */
  readonly confidence: number;
  /** هل يحتاج تأكيد من المستخدم */
  readonly needsConfirmation: boolean;
}

/**
 * المصنّف الهجين - Dummy Implementation
 *
 * النظام الجديد (PostClassificationReviewer) لا يستخدم هذا المصنف.
 * هذا التطبيق موجود فقط للتوافق مع paste-classifier.ts و EditorArea.tsx
 */
export class HybridClassifier {
  /**
   * mlClassifier property for test compatibility
   */
  mlClassifier: {
    classify: (line: string) => {
      type: string;
      confidence: number;
      isML?: boolean;
    };
  };

  /**
   * Constructor - يقبل optional context manager
   */
  constructor(_contextOrMemory?: unknown) {
    // Initialize mlClassifier with a default classify method
    this.mlClassifier = {
      classify: () => ({ type: "unknown", confidence: 0, isML: false }),
    };
  }

  /**
   * التحقق من جاهزية المصنّف
   * (يعمل دائماً لأنه يستخدم regex فقط)
   */
  isReady(): boolean {
    return true;
  }

  /**
   * تصنيف سطر باستخدام Regex + Context
   */
  async classifyLine(
    line: string,
    fallbackType: string,
    _context: unknown,
    _sessionId: string
  ): Promise<HybridResult & { method?: string }> {
    const trimmed = line.trim();

    // بسملة - ثقة عالية
    if (/بسم\s+الله/i.test(trimmed)) {
      return {
        type: "basmala",
        confidence: 99,
        needsConfirmation: false,
        method: "regex",
      };
    }

    // عنوان مشهد - ثقة عالية
    if (/(?:مشهد|scene)\s*(?:رقم\s*)?\d/i.test(trimmed)) {
      return {
        type: "scene-header-1",
        confidence: 95,
        needsConfirmation: false,
        method: "regex",
      };
    }

    // انتقال - ثقة عالية
    if (
      /^(?:قطع|اختفاء|تحول|انتقال|fade|cut|dissolve|wipe)(?:\s+(?:إلى|to))?[:\s]*$/i.test(
        trimmed
      )
    ) {
      return {
        type: "transition",
        confidence: 95,
        needsConfirmation: false,
        method: "regex",
      };
    }

    return {
      type: fallbackType,
      confidence: 80,
      needsConfirmation: false,
      method: "context",
    };
  }

  /**
   * إعادة التدريب بالتصحيحات (no-op للتوافق)
   */
  retrainWithCorrections(_corrections: unknown): void {
    // No-op: النظام الحالي لا يستخدم هذه الميزة
  }

  /**
   * تهيئة المصنّف (dummy - لا يفعل شيئاً)
   */
  initialize(): void {
    // No-op: النظام الجديد لا يحتاج تهيئة
  }
}

export default PostClassificationReviewer;
