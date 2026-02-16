// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { ocrProcessMock, MistralMock } = vi.hoisted(() => {
  const ocrProcessMock = vi.fn();
  const MistralMock = vi.fn(function MistralConstructorMock() {
    return {
      ocr: {
        process: ocrProcessMock,
      },
    };
  });

  return { ocrProcessMock, MistralMock };
});

vi.mock("@mistralai/mistralai", () => ({
  Mistral: MistralMock,
}));

describe("mistral-ocr", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    ocrProcessMock.mockReset();
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_OCR_MODEL;
  });

  it("fails with actionable error when MISTRAL_API_KEY is missing", async () => {
    const module = await import("./mistral-ocr");
    expect(module.isMistralConfigured()).toBe(false);
    await expect(
      module.extractTextWithMistralOcr(Buffer.from("%PDF-1.7"), "12.pdf")
    ).rejects.toThrow("MISTRAL_API_KEY غير مُعرَّف");
  });

  it("uses official SDK with document_url payload and merges pages by index", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    ocrProcessMock.mockResolvedValueOnce({
      pages: [
        { index: 2, markdown: "الصفحة الثالثة" },
        { index: 0, markdown: "الصفحة الأولى" },
        { index: 1, markdown: "الصفحة الثانية" },
      ],
    });

    const module = await import("./mistral-ocr");
    const result = await module.extractTextWithMistralOcr(
      Buffer.from("%PDF-1.7"),
      "12.pdf"
    );

    expect(MistralMock).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(ocrProcessMock).toHaveBeenCalledTimes(1);

    const payload = ocrProcessMock.mock.calls[0]?.[0] as {
      model: string;
      includeImageBase64: boolean;
      document: { type: string; documentUrl: string };
    };

    expect(payload.model).toBe("mistral-ocr-latest");
    expect(payload.includeImageBase64).toBe(false);
    expect(payload.document.type).toBe("document_url");
    expect(payload.document.documentUrl.startsWith("data:application/pdf;base64,")).toBe(
      true
    );
    expect(result).toBe("الصفحة الأولى\n\nالصفحة الثانية\n\nالصفحة الثالثة");
  });

  it("retries on transient errors and applies minimal text cleanup", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    ocrProcessMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        pages: [{ index: 0, markdown: "سطر 1\r\n\r\n\r\nسطر 2\u0001" }],
      });

    const module = await import("./mistral-ocr");
    const result = await module.extractTextWithMistralOcr(
      Buffer.from("%PDF-1.7"),
      "12.pdf"
    );

    expect(ocrProcessMock).toHaveBeenCalledTimes(2);
    expect(result).toBe("سطر 1\n\nسطر 2");
  });
});
