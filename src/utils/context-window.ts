/**
 * =========================
 *  Context Window - نافذة السياق المحسّنة
 * =========================
 *
 * إدارة نافذة سياق موسّعة (10 أسطر) مع تتبع العلاقات بين الأسطر
 */

export type {
  DialogueBlock,
  LineRelation,
  ContextWindow,
} from "./classification-core";
export {
  addLineRelation,
  createContextWindow,
  detectPattern,
  getActiveDialogueBlock,
  trackDialogueBlock,
  updateConfidence,
} from "./classification-core";
