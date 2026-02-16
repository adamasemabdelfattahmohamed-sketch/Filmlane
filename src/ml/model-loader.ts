/**
 * =========================
 *  Model Loader - تحميل وإدارة نموذج التصنيف
 * =========================
 *
 * مسؤول عن:
 * - تحميل النموذج المُدرّب (أو تدريبه من الصفر)
 * - حفظ/تحميل النموذج من localStorage
 * - إدارة دورة حياة النموذج
 */

import { ArabicTextClassifier } from "./text-classifier";
import type { TrainingExample } from "./training-data";
import { loadJSON, saveJSON, safeRemoveItem } from "@/utils/storage";

const MODEL_STORAGE_KEY = "screenplay-ml-model-state";
const MODEL_VERSION_KEY = "screenplay-ml-model-version";
const CURRENT_MODEL_VERSION = "1.0.0";

export interface ModelState {
  version: string;
  trainedAt: number;
  exampleCount: number;
  extraExamples: TrainingExample[];
}

/**
 * تحميل النموذج - يدير تهيئة وتدريب المصنف
 */
export class ModelLoader {
  private classifier: ArabicTextClassifier | null = null;
  private state: ModelState | null = null;
  private loading: boolean = false;
  private loadPromise: Promise<ArabicTextClassifier> | null = null;

  /**
   * تحميل أو تدريب النموذج
   * يستخدم requestIdleCallback لعدم حجب الـ UI
   */
  async loadModel(): Promise<ArabicTextClassifier> {
    if (this.classifier?.isReady()) {
      return this.classifier;
    }

    // تجنب التحميل المتكرر
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._doLoad();
    return this.loadPromise;
  }

  private async _doLoad(): Promise<ArabicTextClassifier> {
    this.loading = true;

    try {
      this.classifier = new ArabicTextClassifier();

      // محاولة تحميل أمثلة إضافية محفوظة
      const savedState = this.loadState();
      const extraExamples = savedState?.extraExamples || [];

      // تدريب بشكل non-blocking
      await this.trainNonBlocking(extraExamples);

      this.state = {
        version: CURRENT_MODEL_VERSION,
        trainedAt: Date.now(),
        exampleCount: 300 + extraExamples.length, // تقريبي
        extraExamples,
      };

      return this.classifier;
    } finally {
      this.loading = false;
      this.loadPromise = null;
    }
  }

  /**
   * تدريب non-blocking باستخدام requestIdleCallback أو setTimeout
   */
  private trainNonBlocking(extraExamples: TrainingExample[]): Promise<void> {
    return new Promise((resolve) => {
      const doTrain = () => {
        this.classifier!.train(extraExamples);
        resolve();
      };

      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(doTrain, { timeout: 2000 });
      } else {
        setTimeout(doTrain, 0);
      }
    });
  }

  /**
   * إعادة التدريب مع أمثلة إضافية (تصحيحات المستخدم)
   */
  async retrain(newExamples: TrainingExample[]): Promise<void> {
    if (!this.classifier) {
      await this.loadModel();
    }

    const allExtra = [...(this.state?.extraExamples || []), ...newExamples];

    await this.trainNonBlocking(allExtra);

    this.state = {
      version: CURRENT_MODEL_VERSION,
      trainedAt: Date.now(),
      exampleCount: 300 + allExtra.length,
      extraExamples: allExtra,
    };

    this.saveState();
  }

  /**
   * الحصول على المصنف (يجب استدعاء loadModel أولاً)
   */
  getClassifier(): ArabicTextClassifier | null {
    return this.classifier;
  }

  /**
   * هل النموذج جاهز؟
   */
  isReady(): boolean {
    return this.classifier?.isReady() ?? false;
  }

  /**
   * هل يتم التحميل حالياً؟
   */
  isLoading(): boolean {
    return this.loading;
  }

  /**
   * حفظ حالة النموذج في localStorage
   */
  private saveState(): void {
    if (!this.state) return;
    saveJSON(MODEL_STORAGE_KEY, this.state);
    saveJSON(MODEL_VERSION_KEY, CURRENT_MODEL_VERSION);
  }

  /**
   * تحميل حالة النموذج من localStorage
   */
  private loadState(): ModelState | null {
    const version = loadJSON<string | null>(MODEL_VERSION_KEY, null);
    if (version !== CURRENT_MODEL_VERSION) return null;

    return loadJSON<ModelState | null>(MODEL_STORAGE_KEY, null);
  }

  /**
   * مسح النموذج المحفوظ
   */
  clearSavedModel(): void {
    safeRemoveItem(MODEL_STORAGE_KEY);
    safeRemoveItem(MODEL_VERSION_KEY);
  }
}

export default ModelLoader;
