/**
 * =========================
 *  Feedback Collector - جامع تصحيحات المستخدم
 * =========================
 *
 * @description
 * جامع تصحيحات المستخدم - Feedback Collector
 * يجمع تصحيحات المستخدم على التصنيفات الخاطئة ويحفظها في localStorage
 * لاستخدامها في إعادة تدريب المصنف وتحسين الدقة.
 *
 * @responsibilities
 * - جمع تصحيحات المستخدم على التصنيفات
 * - حفظ التصحيحات في localStorage
 * - تصدير التصحيحات كبيانات تدريب
 * - تحديد متى يجب إعادة التدريب (كل 50 تصحيح)
 * - مسح التصحيحات عند الحاجة
 *
 * @boundaries
 * يفعل: جمع وحفظ التصحيحات، تحديد وقت إعادة التدريب
 * لا يفعل: إعادة التدريب الفعلية (يتم في model-loader)، التصنيف
 *
 * @dependencies
 * - storage.ts: لحفظ/تحميل البيانات من localStorage
 * - types/screenplay.ts: لنوع Correction
 *
 * @stateManagement
 * - Stateful: يحتفظ بقائمة التصحيحات في الذاكرة
 * - Persistent: يحفظ في localStorage
 *
 * @architecture
 * - نمط: Repository Pattern
 * - التخزين: localStorage
 * - الحد الأقصى: غير محدود (يُنصح بالمسح دورياً)
 *
 * @example
 * ```typescript
 * const collector = new FeedbackCollector();
 *
 * // إضافة تصحيح
 * collector.addCorrection(
 *   "يدخل أحمد",
 *   "dialogue",
 *   "action",
 *   75
 * );
 *
 * // التحقق من الحاجة لإعادة التدريب
 * if (collector.shouldRetrain()) {
 *   const trainingData = collector.exportForTraining();
 *   await modelLoader.retrain(trainingData);
 *   collector.clearCorrections();
 * }
 * ```
 */

import type { Correction } from "@/types/screenplay";
import { loadJSON, saveJSON } from "./storage";

export type { Correction };

/**
 * جامع تصحيحات المستخدم
 *
 * @class FeedbackCollector
 */
export class FeedbackCollector {
  private corrections: Correction[] = [];
  private readonly STORAGE_KEY = "screenplay-user-corrections";

  constructor() {
    this.loadCorrections();
  }

  addCorrection(
    line: string,
    originalType: string,
    correctedType: string,
    confidence: number
  ): void {
    const correction: Correction = {
      line,
      originalType,
      correctedType,
      confidence,
      timestamp: Date.now(),
    };

    this.corrections.push(correction);
    this.saveCorrections();
  }

  getCorrections(): Correction[] {
    return this.corrections;
  }

  getCorrectionCount(): number {
    return this.corrections.length;
  }

  /**
   * هل يجب إعادة التدريب؟ (عند تجاوز 50 تصحيح)
   */
  shouldRetrain(): boolean {
    return this.corrections.length >= 50 && this.corrections.length % 50 === 0;
  }

  /**
   * تصدير التصحيحات كبيانات تدريب
   */
  exportForTraining(): { text: string; label: string }[] {
    return this.corrections.map((c) => ({
      text: c.line,
      label: c.correctedType,
    }));
  }

  /**
   * مسح جميع التصحيحات
   */
  clearCorrections(): void {
    this.corrections = [];
    this.saveCorrections();
  }

  private saveCorrections(): void {
    saveJSON(this.STORAGE_KEY, this.corrections);
  }

  private loadCorrections(): void {
    this.corrections = loadJSON<Correction[]>(this.STORAGE_KEY, []);
  }
}

export default FeedbackCollector;
