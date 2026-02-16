import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

/**
 * إعداد Genkit للذكاء الاصطناعي
 *
 * @description
 * تهيئة مثيل Genkit مع Google AI كمزود الخدمة وGemini 2.5 Flash كنموذج افتراضي.
 * يُستخدم كأساس لجميع تدفقات الذكاء الاصطناعي في التطبيق.
 * يدعم الإضافات والنماذج المختلفة للتوسع المستقبلي.
 *
 * @example
 * import { ai } from '@/ai/genkit';
 * // استخدام في تدفق جديد
 * const flow = ai.defineFlow({...});
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: "googleai/gemini-2.5-flash",
});
