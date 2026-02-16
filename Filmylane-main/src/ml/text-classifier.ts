/**
 * =========================
 *  Arabic Text Classifier - مصنف النصوص العربية
 * =========================
 *
 * تنفيذ خفيف لـ TF-IDF + Multinomial Naive Bayes
 * لا يحتاج GPU أو مكتبات خارجية
 */

import { TRAINING_EXAMPLES, type TrainingExample } from "./training-data";

export interface ClassificationResult {
  type: string;
  confidence: number;
  isML: boolean;
}

/**
 * مصنف النصوص العربية - Naive Bayes مع TF-IDF
 */
export class ArabicTextClassifier {
  private vocabulary: Map<string, number> = new Map();
  private idfWeights: number[] = [];
  private classPriors: Map<string, number> = new Map();
  private classWordProbs: Map<string, number[]> = new Map();
  private classes: string[] = [];
  private trained: boolean = false;

  /**
   * تقطيع النص العربي إلى كلمات
   */
  private tokenize(text: string): string[] {
    return text
      .trim()
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * بناء المفردات من بيانات التدريب
   */
  private buildVocabulary(examples: TrainingExample[]): void {
    const wordSet = new Set<string>();
    examples.forEach((ex) => {
      this.tokenize(ex.text).forEach((token) => wordSet.add(token));
    });

    let index = 0;
    wordSet.forEach((word) => {
      this.vocabulary.set(word, index++);
    });
  }

  /**
   * حساب IDF weights
   */
  private computeIDF(examples: TrainingExample[]): void {
    const N = examples.length;
    const docFreq = new Array(this.vocabulary.size).fill(0);

    examples.forEach((ex) => {
      const tokens = new Set(this.tokenize(ex.text));
      tokens.forEach((token) => {
        const idx = this.vocabulary.get(token);
        if (idx !== undefined) {
          docFreq[idx]++;
        }
      });
    });

    this.idfWeights = docFreq.map((df) => Math.log((N + 1) / (df + 1)) + 1);
  }

  /**
   * تحويل النص إلى TF-IDF vector
   */
  private vectorize(tokens: string[]): number[] {
    const termFreq = new Map<string, number>();
    tokens.forEach((token) => {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    });

    const vector = new Array(this.vocabulary.size).fill(0);
    termFreq.forEach((freq, term) => {
      const index = this.vocabulary.get(term);
      if (index !== undefined) {
        vector[index] = (freq / tokens.length) * this.idfWeights[index];
      }
    });

    return vector;
  }

  /**
   * تدريب النموذج (Multinomial Naive Bayes)
   */
  train(extraExamples: TrainingExample[] = []): void {
    const allExamples = [...TRAINING_EXAMPLES, ...extraExamples];

    // بناء المفردات
    this.buildVocabulary(allExamples);
    this.computeIDF(allExamples);

    // تحديد الفئات
    const classSet = new Set<string>();
    allExamples.forEach((ex) => classSet.add(ex.label));
    this.classes = [...classSet];

    // حساب الاحتمالات المسبقة
    const N = allExamples.length;
    const classCounts = new Map<string, number>();
    allExamples.forEach((ex) => {
      classCounts.set(ex.label, (classCounts.get(ex.label) || 0) + 1);
    });

    this.classes.forEach((cls) => {
      this.classPriors.set(cls, Math.log((classCounts.get(cls) || 0) / N));
    });

    // حساب احتمالات الكلمات لكل فئة (مع Laplace smoothing)
    const vocabSize = this.vocabulary.size;
    const alpha = 1; // Laplace smoothing parameter

    this.classes.forEach((cls) => {
      const classExamples = allExamples.filter((ex) => ex.label === cls);
      const wordCounts = new Array(vocabSize).fill(0);
      let totalWords = 0;

      classExamples.forEach((ex) => {
        const tokens = this.tokenize(ex.text);
        tokens.forEach((token) => {
          const idx = this.vocabulary.get(token);
          if (idx !== undefined) {
            wordCounts[idx]++;
            totalWords++;
          }
        });
      });

      // log probabilities مع Laplace smoothing
      const logProbs = wordCounts.map((count) =>
        Math.log((count + alpha) / (totalWords + alpha * vocabSize))
      );

      this.classWordProbs.set(cls, logProbs);
    });

    this.trained = true;
  }

  /**
   * تصنيف نص جديد
   */
  classify(text: string): ClassificationResult {
    if (!this.trained) {
      this.train();
    }

    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return { type: "action", confidence: 30, isML: true };
    }

    let bestClass = this.classes[0];
    let bestScore = -Infinity;
    const scores: Map<string, number> = new Map();

    this.classes.forEach((cls) => {
      let score = this.classPriors.get(cls) || 0;
      const wordProbs = this.classWordProbs.get(cls)!;

      tokens.forEach((token) => {
        const idx = this.vocabulary.get(token);
        if (idx !== undefined) {
          score += wordProbs[idx];
        }
      });

      scores.set(cls, score);
      if (score > bestScore) {
        bestScore = score;
        bestClass = cls;
      }
    });

    // تحويل log-probabilities إلى احتمالات عادية (softmax)
    const maxScore = bestScore;
    let sumExp = 0;
    const expScores = new Map<string, number>();

    scores.forEach((score, cls) => {
      const exp = Math.exp(score - maxScore);
      expScores.set(cls, exp);
      sumExp += exp;
    });

    const confidence = ((expScores.get(bestClass) || 0) / sumExp) * 100;

    return {
      type: bestClass,
      confidence: Math.min(confidence, 99),
      isML: true,
    };
  }

  /**
   * هل تم تدريب النموذج؟
   */
  isReady(): boolean {
    return this.trained;
  }

  /**
   * إعادة التدريب مع أمثلة إضافية (تصحيحات المستخدم)
   */
  retrain(corrections: { text: string; label: string }[]): void {
    this.train(corrections);
  }
}

export default ArabicTextClassifier;
