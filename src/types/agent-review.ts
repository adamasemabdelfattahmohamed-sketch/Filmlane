import type { LineType } from "@/types/screenplay";

/**
 * @description
 * سطر السياق للمراجعة - Agent Review Context Line
 * يُستخدم لتمثيل سطر واحد ضمن السياق المُرسل للوكيل (Claude) للمراجعة
 *
 * @responsibilities
 * - توفير بيانات السطر مع موقعه النسبي
 * - إرفاق التصنيف المعيّن لتحلل التسلسل
 * - بناء سياق متكامل للوكيل لاتخاذ قرار دقيق
 *
 * @example
 * ```typescript
 * const contextLine: AgentReviewContextLine = {
 *   lineIndex: 5,
 *   assignedType: 'character',
 *   text: 'أحمد:'
 * };
 * ```
 */
export interface AgentReviewContextLine {
  lineIndex: number;
  assignedType: LineType;
  text: string;
}

/**
 * @description
 * السطر المشتبه فيه - Agent Suspicious Line Payload
 * يُمثل سطراً تم اكتشافه على أنه "مشتبه" بواسطة نظام المراجعة
 *
 * @responsibilities
 * - تخزين بيانات السطر المشتبه (النص، التصنيف، درجة الاشتباه)
 * - تسجيل أسباب الاشتباه من الكاشفات المختلفة
 * - توفير سياق السطور المحيطة للمراجعة الذكية
 *
 * @example
 * ```typescript
 * const suspicious: AgentSuspiciousLinePayload = {
 *   itemIndex: 3,
 *   lineIndex: 12,
 *   text: 'الا',
 *   assignedType: 'action',
 *   totalSuspicion: 85,
 *   reasons: ['sequence-violation: character→action', 'split-character-fragment'],
 *   contextLines: [...]
 * };
 * ```
 */
export interface AgentSuspiciousLinePayload {
  itemIndex: number;
  lineIndex: number;
  text: string;
  assignedType: LineType;
  totalSuspicion: number;
  reasons: string[];
  contextLines: AgentReviewContextLine[];
}

/**
 * @description
 * طلب مراجعة الوكيل - Agent Review Request Payload
 * الحمولة المُرسلة إلى API المراجعة الذكية
 *
 * @responsibilities
 * - تجميع جميع السطور المشتبهة للمراجعة
 * - توفير معرّف الجلسة للتتبع
 * - إحصائيات المراجعة (عدد السطور المُراجعة)
 *
 * @example
 * ```typescript
 * const request: AgentReviewRequestPayload = {
 *   sessionId: 'sess-abc-123',
 *   totalReviewed: 150,
 *   suspiciousLines: [suspiciousLine1, suspiciousLine2]
 * };
 * ```
 */
export interface AgentReviewRequestPayload {
  sessionId: string;
  totalReviewed: number;
  suspiciousLines: AgentSuspiciousLinePayload[];
}

/**
 * @description
 * قرار مراجعة الوكيل - Agent Review Decision
 * يُمثل قرار Claude بشأن سطر مشتبه واحد
 *
 * @responsibilities
 * - تحديد التصنيف النهائي بعد المراجعة
 * - توفير مستوى الثقة في القرار
 * - تبرير القرار بشرح منطقي
 *
 * @example
 * ```typescript
 * const decision: AgentReviewDecision = {
 *   itemIndex: 3,
 *   finalType: 'character',
 *   confidence: 0.92,
 *   reason: 'النص "الا" جزء من اسم "الاسطى" مكسور، يجب دمجه مع السطر التالي'
 * };
 * ```
 */
export interface AgentReviewDecision {
  itemIndex: number;
  finalType: LineType;
  confidence: number;
  reason: string;
}

/**
 * @description
 * استجابة مراجعة الوكيل - Agent Review Response Payload
 * النتيجة المُرجعة من API المراجعة الذكية
 *
 * @responsibilities
 * - تقديم حالة الاستجابة (applied/skipped/warning/error)
 * - إرجاع قائمة القرارات لكل سطر مشتبه
 * - توفير معلومات التشخيص (الوقت، النموذج)
 *
 * @example
 * ```typescript
 * const response: AgentReviewResponsePayload = {
 *   status: 'applied',
 *   model: 'claude-sonnet-4-20250514',
 *   decisions: [decision1, decision2],
 *   message: 'تم تطبيق 2 تغيير من 2 مشتبه',
 *   latencyMs: 1450
 * };
 * ```
 */
export interface AgentReviewResponsePayload {
  status: "applied" | "skipped" | "warning" | "error";
  model: string;
  decisions: AgentReviewDecision[];
  message: string;
  latencyMs: number;
}
