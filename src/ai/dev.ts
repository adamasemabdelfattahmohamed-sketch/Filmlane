/**
 * إعداد بيئة التطوير لتدفقات الذكاء الاصطناعي
 *
 * @description
 * ملف تهيئة لتدفقات الذكاء الاصطناعي في بيئة التطوير.
 * يقوم بتحميل متغيرات البيئة وتسجيل التدفقات المتاحة.
 * يُستخدم لاختبار وتطوير تدفقات AI محلياً قبل النشر.
 *
 * @example
 * // تشغيل في بيئة التطوير
 * import './ai/dev';
 * // التدفقات تُسجل تلقائياً
 */
import { config } from "dotenv";
config();

import "@/ai/flows/auto-format-screenplay.ts";
import "@/ai/flows/generate-scene-ideas.ts";
