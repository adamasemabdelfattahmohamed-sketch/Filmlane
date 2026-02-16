/**
 * =========================
 *  Hybrid Classifier - النظام الهجين للتصنيف
 * =========================
 *
 * يجمع بين:
 * 1. Regex (ثقة عالية 95%+) → مباشر
 * 2. ML Classifier (ثقة متوسطة 80-95%) → Naive Bayes
 * 3. Context Refinement (ثقة 70-80%) → السياق
 * 4. User Feedback (ثقة < 70%) → طلب تأكيد
 */

export type { HybridResult } from "./classification-core";
export {
  HybridClassifier,
  HybridClassifier as default,
} from "./classification-core";
