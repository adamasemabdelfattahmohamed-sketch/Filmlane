/**
 * /api/files/extract - API Route لاستخراج نص من ملفات
 * يستقبل ملف عبر FormData ويعيد النص المستخرج + metadata
 */

import { NextRequest, NextResponse } from "next/server";
import { extractFileText } from "@/utils/file-extraction";
import { getFileType, type FileExtractionResponse } from "@/types/file-import";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest
): Promise<NextResponse<FileExtractionResponse>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "لم يتم إرسال ملف" },
        { status: 400 }
      );
    }

    const fileType = getFileType(file.name);
    if (!fileType) {
      return NextResponse.json(
        {
          success: false,
          error: `نوع الملف غير مدعوم: ${file.name}. الأنواع المدعومة: doc, docx, txt, pdf, fountain, fdx`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await extractFileText(buffer, file.name, fileType);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    const stack = error instanceof Error ? error.stack : undefined;
    const isExtractionFailure =
      /فشل استخراج نص|فشل تحويل ملف \.doc|MISTRAL_API_KEY|antiword|doc-converter-flow|Word COM|OCR|mammoth|pdf/i.test(
        message
      );

    // eslint-disable-next-line no-console
    console.error("[api/files/extract] extraction failed", {
      message,
      stack,
    });

    return NextResponse.json(
      { success: false, error: message },
      { status: isExtractionFailure ? 422 : 500 }
    );
  }
}
