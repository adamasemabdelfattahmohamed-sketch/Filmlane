import { Mistral } from "@mistralai/mistralai";

/**
 * mistral-ocr.ts
 * استخراج النصوص من ملفات PDF الممسوحة عبر Mistral OCR SDK الرسمي.
 */

const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest";
const OCR_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

type MistralOcrPage = {
  index?: number;
  markdown?: string;
};

type MistralOcrResponse = {
  pages?: MistralOcrPage[];
};

let mistralClient: Mistral | null = null;

/**
 * التحقق من توفر مفتاح Mistral API
 */
export function isMistralConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY غير مُعرَّف. يرجى إضافته في متغيرات البيئة."
    );
  }

  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey });
  }

  return mistralClient;
}

function buildPdfDataUrl(fileBuffer: Buffer): string {
  const base64Pdf = fileBuffer.toString("base64");
  return `data:application/pdf;base64,${base64Pdf}`;
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapOcrResponseToText(response: unknown): string {
  const pages = (response as MistralOcrResponse)?.pages;
  if (!Array.isArray(pages)) {
    throw new Error("استجابة Mistral OCR لا تحتوي على صفحات قابلة للقراءة.");
  }

  const mergedText = pages
    .map((page) => ({
      index:
        typeof page?.index === "number" && Number.isFinite(page.index)
          ? page.index
          : Number.MAX_SAFE_INTEGER,
      markdown: typeof page?.markdown === "string" ? page.markdown : "",
    }))
    .sort((a, b) => a.index - b.index)
    .map((page) => page.markdown)
    .join("\n\n");

  const cleaned = cleanExtractedText(mergedText);
  if (!cleaned) {
    throw new Error("Mistral OCR أعاد نصًا فارغًا.");
  }

  return cleaned;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const timeoutError = new Error(
        `انتهت مهلة Mistral OCR بعد ${timeoutMs}ms`
      );
      timeoutError.name = "TimeoutError";
      reject(timeoutError);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function runMistralOcr(documentUrl: string): Promise<string> {
  const client = getMistralClient();
  const response = await withTimeout(
    client.ocr.process({
      document: {
        type: "document_url",
        documentUrl,
      },
      model: MISTRAL_OCR_MODEL,
      includeImageBase64: false,
    }),
    OCR_TIMEOUT_MS
  );

  return mapOcrResponseToText(response);
}

/**
 * استخراج نص من ملف PDF باستخدام Mistral OCR SDK الرسمي
 * @param fileBuffer - محتوى الملف كـ Buffer
 * @param _filename - اسم الملف الأصلي (للتوافق مع الواجهة الحالية)
 * @returns النص المستخرج من جميع الصفحات
 */
export async function extractTextWithMistralOcr(
  fileBuffer: Buffer,
  _filename: string
): Promise<string> {
  const documentUrl = buildPdfDataUrl(fileBuffer);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await runMistralOcr(documentUrl);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error(
    `فشل OCR من Mistral بعد ${MAX_RETRIES + 1} محاولة: ${
      lastError?.message ?? "خطأ غير معروف"
    }`
  );
}
