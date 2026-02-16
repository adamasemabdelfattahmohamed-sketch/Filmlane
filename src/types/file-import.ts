/**
 * file-import.ts - الأنواع التعاقدية لاستيراد الملفات
 * تعريف الواجهات والأنواع المستخدمة في مسار فتح/إدراج الملفات
 */

import type { ScreenplayBlock } from "@/utils/document-model";

/** وضع استيراد الملف */
export type FileImportMode = "replace" | "insert";

/** أنواع الملفات المدعومة */
export type ImportedFileType =
  | "doc"
  | "docx"
  | "txt"
  | "pdf"
  | "fountain"
  | "fdx";

/** طريقة الاستخراج المستخدمة */
export type ExtractionMethod =
  | "native-text"
  | "mammoth"
  | "antiword"
  | "doc-converter-flow"
  | "word-com"
  | "ocr-mistral"
  | "app-payload";

/** نتيجة استخراج نص من ملف */
export interface FileExtractionResult {
  /** النص المستخرج */
  text: string;
  /** نوع الملف الأصلي */
  fileType: ImportedFileType;
  /** الطريقة المستخدمة للاستخراج */
  method: ExtractionMethod;
  /** هل تم استخدام OCR */
  usedOcr: boolean;
  /** تحذيرات غير حرجة */
  warnings: string[];
  /** سجل المحاولات */
  attempts: string[];
  /** مؤشر جودة النص المستخرج (0..1) */
  qualityScore?: number;
  /** ما هي خطوات التطبيع المطبقة على النص */
  normalizationApplied?: string[];
  /** كتل مستخرجة 1:1 من payload التطبيق إن توفرت */
  structuredBlocks?: ScreenplayBlock[];
  /** إصدار payload عند الاسترجاع المباشر */
  payloadVersion?: number;
}

/** طلب استخراج ملف للـ API */
export interface FileExtractionRequest {
  /** اسم الملف الأصلي */
  filename: string;
  /** امتداد الملف */
  extension: ImportedFileType;
}

/** استجابة API الاستخراج */
export interface FileExtractionResponse {
  success: boolean;
  data?: FileExtractionResult;
  error?: string;
}

/** امتدادات الملفات المقبولة */
export const ACCEPTED_FILE_EXTENSIONS =
  ".doc,.docx,.txt,.pdf,.fountain,.fdx" as const;

/** Map من الامتدادات إلى أنواع الملفات */
export function getFileType(filename: string): ImportedFileType | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "doc":
      return "doc";
    case "docx":
      return "docx";
    case "txt":
      return "txt";
    case "pdf":
      return "pdf";
    case "fountain":
      return "fountain";
    case "fdx":
      return "fdx";
    default:
      return null;
  }
}
