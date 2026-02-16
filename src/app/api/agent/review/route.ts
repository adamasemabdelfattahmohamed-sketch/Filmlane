import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { LineType } from "@/types/screenplay";
import type { AgentReviewRequestPayload } from "@/types/agent-review";
import {
  MODEL_ID,
  reviewSuspiciousLinesWithClaude,
} from "@/utils/Arabic-Screenplay-Classifier-Agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lineTypeSchema = z.enum([
  "action",
  "dialogue",
  "character",
  "scene-header-1",
  "scene-header-2",
  "scene-header-3",
  "scene-header-top-line",
  "transition",
  "parenthetical",
  "basmala",
] satisfies [LineType, ...LineType[]]);

const contextLineSchema = z.object({
  lineIndex: z.number().int().nonnegative(),
  assignedType: lineTypeSchema,
  text: z.string(),
});

const suspiciousLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(),
  lineIndex: z.number().int().nonnegative(),
  text: z.string(),
  assignedType: lineTypeSchema,
  totalSuspicion: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  contextLines: z.array(contextLineSchema),
});

const reviewRequestSchema = z.object({
  sessionId: z.string().min(1),
  totalReviewed: z.number().int().nonnegative(),
  suspiciousLines: z.array(suspiciousLineSchema),
});

/**
 * مسار API لمراجعة الوكيل الذكي للأسطر المشبوهة
 *
 * @description
 * يتعامل مع طلبات مراجعة الأسطر المشبوهة في السيناريو باستخدام Claude AI.
 * يقوم بتحليل الأسطر ذات الثقة المنخفضة ويوفر تصنيفات محسنة.
 * يتضمن التحقق من صحة المدخلات باستخدام Zod ومعالجة الأخطاء.
 *
 * @param {NextRequest} request - طلب HTTP من العميل
 * @returns {Promise<NextResponse>} استجابة JSON مع نتائج المراجعة أو رسالة خطأ
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "error",
        model: MODEL_ID,
        decisions: [],
        message: "Body JSON غير صالح.",
        latencyMs: Date.now() - startedAt,
      },
      { status: 400 }
    );
  }

  const parsed = reviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        model: MODEL_ID,
        decisions: [],
        message: "المدخلات غير مطابقة للمخطط المطلوب.",
        issues: parsed.error.issues,
        latencyMs: Date.now() - startedAt,
      },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      status: "warning",
      model: MODEL_ID,
      decisions: [],
      message: "ANTHROPIC_API_KEY غير موجود؛ تم تخطي مرحلة الوكيل.",
      latencyMs: Date.now() - startedAt,
    });
  }

  try {
    const result = await reviewSuspiciousLinesWithClaude(
      parsed.data as AgentReviewRequestPayload
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        model: MODEL_ID,
        decisions: [],
        message: `فشل تنفيذ مسار المراجعة: ${error}`,
        latencyMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
