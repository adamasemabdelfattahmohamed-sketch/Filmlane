import { logger } from "./logger";
import type {
  ClassificationRecord,
  ContextMemory,
  Correction,
} from "@/types/screenplay";
import type { DialogueBlock, LineRelation } from "./classification-core";
import { detectPattern } from "./classification-core";
import { saveJSON, loadJSON } from "./storage";
import { normalizeCharacterName } from "./text-utils";

/**
 * @description
 * مدير ذاكرة السياق - Context Memory Manager
 * يدير حالة الجلسة ويحافظ على السياق عبر التفاعلات
 *
 * @responsibilities
 * - تتبع الشخصيات الشائعة في السيناريو الحالي
 * - تخزين المواقع المتكررة (INT./EXT.)
 * - حفظ سجل الحوارات لكل شخصية
 * - دعم التعلم من تصحيحات المستخدم
 * - التخزين المؤقت في localStorage
 *
 * @boundaries
 * - يفعل: إدارة حالة السياق والتخزين
 * - لا يفعل: لا يحتوي على منطق تصنيف مباشر
 *
 * @dependencies
 * - logger: تسجيل الأحداث
 * - storage: التخزين المحلي
 * - text-utils: تطبيع أسماء الشخصيات
 *
 * @stateManagement
 * - يحتفظ بحالة الجلسة في Map داخلي
 * - يستخدم localStorage للحفظ الدائم
 * - Thread-safe للاستخدام المتزامن
 *
 * @example
 * ```typescript
 * const manager = new ContextMemoryManager();
 * await manager.loadContext('session-123');
 * manager.recordCharacter('أحمد');
 * manager.saveContext('session-123');
 * ```
 */

const MEMORY_INVALID_SINGLE_TOKENS = new Set([
  "انا",
  "أنا",
  "انت",
  "إنت",
  "أنت",
  "هي",
  "هو",
  "هم",
  "هن",
]);

const isValidMemoryCharacterName = (rawName: string): boolean => {
  const normalized = normalizeCharacterName(rawName);
  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 40) return false;
  if (/[؟!؟,،"«»]/.test(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (tokens.length === 1 && MEMORY_INVALID_SINGLE_TOKENS.has(tokens[0]))
    return false;
  return true;
};

const detectLocalRepeatedPattern = (
  classifications: readonly string[]
): string | null => {
  if (!Array.isArray(classifications) || classifications.length < 4)
    return null;

  const detectInOrder = (ordered: readonly string[]): string | null => {
    const pairCounts = new Map<string, number>();
    for (let i = 0; i < ordered.length - 1; i++) {
      const first = (ordered[i] || "").trim();
      const second = (ordered[i + 1] || "").trim();
      if (!first || !second) continue;
      const key = `${first}-${second}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }

    let bestPattern: string | null = null;
    let bestCount = 0;
    pairCounts.forEach((count, pattern) => {
      if (count > bestCount) {
        bestCount = count;
        bestPattern = pattern;
      }
    });

    return bestCount >= 2 ? bestPattern : null;
  };

  return (
    detectInOrder(classifications) ||
    detectInOrder([...classifications].reverse())
  );
};

export type { ClassificationRecord, ContextMemory };

/**
 * @description
 * ذاكرة السياق المحسّنة - Enhanced Context Memory
 * توسيع ContextMemory ببيانات إضافية للتعلم
 *
 * @responsibilities
 * - تخزين كتل الحوار الكاملة
 * - تتبع علاقات الأسطر (ما قبل/بعد)
 * - حفظ تصحيحات المستخدم للتعلم
 * - بناء خريطة ثقة للتصنيفات
 *
 * @example
 * ```typescript
 * const enhanced: EnhancedContextMemory = {
 *   sessionId: 'sess-123',
 *   lastModified: Date.now(),
 *   data: {
 *     commonCharacters: ['أحمد'],
 *     commonLocations: ['غرفة'],
 *     lastClassifications: ['character', 'dialogue'],
 *     characterDialogueMap: { 'أحمد': 5 },
 *     dialogueBlocks: [...],
 *     lineRelationships: [...],
 *     userCorrections: [...],
 *     confidenceMap: { 'أحمد:': 0.95 }
 *   }
 * };
 * ```
 */
export interface EnhancedContextMemory extends ContextMemory {
  data: ContextMemory["data"] & {
    dialogueBlocks: DialogueBlock[];
    lineRelationships: LineRelation[];
    userCorrections: Correction[];
    confidenceMap: { [line: string]: number };
  };
}

/**
 * @description
 * مدير ذاكرة السياق المحسّن - Context Memory Manager
 * صنف يدير حالة الجلسة مع دعم التخزين المؤقت والتعلم
 *
 * @responsibilities
 * - تحميل/حفظ السياق من/إلى localStorage
 * - تسجيل الشخصيات والمواقع الجديدة
 * - دمج تصحيحات المستخدم في السياق
 * - كشف الأنماط المتكررة في التصنيفات
 *
 * @boundaries
 * - يفعل: إدارة حالة السياق والتخزين
 * - لا يفعل: لا يحتوي على منطق تصنيف مباشر
 *
 * @dependencies
 * - logger: تسجيل الأحداث
 * - storage: التخزين المحلي
 * - text-utils: تطبيع أسماء الشخصيات
 *
 * @example
 * ```typescript
 * const manager = new ContextMemoryManager();
 * const ctx = await manager.loadContext('session-123');
 * manager.recordCharacter('فاطمة');
 * await manager.saveContext('session-123');
 * ```
 */
export class ContextMemoryManager {
  private storage: Map<string, EnhancedContextMemory> = new Map();

  constructor() {
    logger.info("ContextMemoryManager initialized (enhanced).", {
      component: "MemoryManager",
    });
  }

  async loadContext(sessionId: string): Promise<EnhancedContextMemory | null> {
    // أولاً: حاول التحميل من الذاكرة
    if (this.storage.has(sessionId)) {
      logger.info(`Loading context for session: ${sessionId}`, {
        component: "MemoryManager",
      });
      return JSON.parse(JSON.stringify(this.storage.get(sessionId)!));
    }

    // ثانياً: حاول التحميل من localStorage
    const loaded = this.loadFromLocalStorage(sessionId);
    if (loaded) {
      this.storage.set(sessionId, loaded);
      return loaded;
    }

    logger.debug(
      `No context found for session: ${sessionId} (سيتم إنشاء سياق جديد)`,
      {
        component: "MemoryManager",
      }
    );
    return null;
  }

  async saveContext(
    sessionId: string,
    memory: EnhancedContextMemory | ContextMemory
  ): Promise<void> {
    logger.info(`Saving context for session: ${sessionId}`, {
      component: "MemoryManager",
    });

    // تحويل ContextMemory العادي إلى Enhanced إذا لزم الأمر
    const enhanced = this.ensureEnhanced(memory);
    this.storage.set(sessionId, JSON.parse(JSON.stringify(enhanced)));

    // حفظ في localStorage
    this.saveToLocalStorage(sessionId);
  }

  async updateMemory(
    sessionId: string,
    classifications: ClassificationRecord[]
  ): Promise<void> {
    logger.info(
      `Updating memory for session ${sessionId} with ${classifications.length} records.`,
      { component: "MemoryManager" }
    );

    const existing = await this.loadContext(sessionId);
    const memory: EnhancedContextMemory =
      existing || this.createDefaultMemory(sessionId);

    memory.lastModified = Date.now();
    memory.data.lastClassifications = classifications
      .map((c) => c.classification)
      .concat(memory.data.lastClassifications)
      .slice(0, 20);

    classifications.forEach((record) => {
      if (record.classification === "character") {
        const charName = normalizeCharacterName(record.line);
        if (isValidMemoryCharacterName(charName)) {
          if (!memory.data.commonCharacters.includes(charName)) {
            memory.data.commonCharacters.push(charName);
          }
          memory.data.characterDialogueMap[charName] =
            (memory.data.characterDialogueMap[charName] || 0) + 1;
        }
      }
    });

    await this.saveContext(sessionId, memory);
  }

  // ===== ميزات جديدة =====

  /** حفظ في localStorage */
  saveToLocalStorage(sessionId: string): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    const key = `screenplay-memory-${sessionId}`;
    saveJSON(key, memory);
  }

  /** تحميل من localStorage */
  loadFromLocalStorage(sessionId: string): EnhancedContextMemory | null {
    const key = `screenplay-memory-${sessionId}`;
    const parsed = loadJSON<EnhancedContextMemory | null>(key, null);
    if (parsed) {
      return this.ensureEnhanced(parsed);
    }
    return null;
  }

  /** تتبع كتلة حوار */
  trackDialogueBlock(
    sessionId: string,
    character: string,
    startLine: number,
    endLine: number
  ): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    const block: DialogueBlock = {
      character,
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
    };

    memory.data.dialogueBlocks.push(block);

    // الاحتفاظ بأحدث 50 كتلة فقط
    if (memory.data.dialogueBlocks.length > 50) {
      memory.data.dialogueBlocks = memory.data.dialogueBlocks.slice(-50);
    }

    this.saveToLocalStorage(sessionId);
  }

  /** إضافة علاقة بين سطرين */
  addLineRelation(sessionId: string, relation: LineRelation): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.lineRelationships.push(relation);

    if (memory.data.lineRelationships.length > 200) {
      memory.data.lineRelationships = memory.data.lineRelationships.slice(-200);
    }

    this.saveToLocalStorage(sessionId);
  }

  /** كشف نمط متكرر - uses shared detectPattern with 'newest-first' order */
  detectPattern(sessionId: string): string | null {
    let memory = this.storage.get(sessionId);
    if (!memory) {
      const loaded = this.loadFromLocalStorage(sessionId);
      if (loaded) {
        this.storage.set(sessionId, loaded);
        memory = loaded;
      }
    }
    if (!memory) return null;

    // Use shared detectPattern with 'newest-first' since lastClassifications is stored newest-first
    const sharedPattern = detectPattern(
      memory.data.lastClassifications,
      "newest-first"
    );
    if (sharedPattern) return sharedPattern;

    // Fallback محلي لأن shared detectPattern قد يكون dummy في بعض البيئات.
    return detectLocalRepeatedPattern(memory.data.lastClassifications);
  }

  /** إضافة تصحيح من المستخدم */
  addUserCorrection(sessionId: string, correction: Correction): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.userCorrections.push(correction);

    // الاحتفاظ بأحدث 200 تصحيح
    if (memory.data.userCorrections.length > 200) {
      memory.data.userCorrections = memory.data.userCorrections.slice(-200);
    }

    this.saveToLocalStorage(sessionId);
  }

  /** الحصول على تصحيحات المستخدم */
  getUserCorrections(sessionId: string): Correction[] {
    const memory = this.storage.get(sessionId);
    return memory?.data.userCorrections || [];
  }

  /** تحديث ثقة التصنيف */
  updateConfidence(sessionId: string, line: string, confidence: number): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.confidenceMap[line] = confidence;

    this.saveToLocalStorage(sessionId);
  }

  // ===== أدوات داخلية =====

  private createDefaultMemory(sessionId: string): EnhancedContextMemory {
    return {
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
  }

  private ensureEnhanced(
    memory: ContextMemory | EnhancedContextMemory
  ): EnhancedContextMemory {
    const data = memory.data as EnhancedContextMemory["data"];
    return {
      ...memory,
      data: {
        ...memory.data,
        dialogueBlocks: data.dialogueBlocks || [],
        lineRelationships: data.lineRelationships || [],
        userCorrections: data.userCorrections || [],
        confidenceMap: data.confidenceMap || {},
      },
    };
  }
}
