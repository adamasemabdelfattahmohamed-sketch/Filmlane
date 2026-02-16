import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mammothExtractRawTextMock,
  pdfLoadMock,
  convertDocBufferToTextMock,
  runPdfConverterFlowMock,
} = vi.hoisted(() => ({
  mammothExtractRawTextMock: vi.fn(),
  pdfLoadMock: vi.fn(),
  convertDocBufferToTextMock: vi.fn(),
  runPdfConverterFlowMock: vi.fn(),
}));

vi.mock("mammoth", () => ({
  extractRawText: mammothExtractRawTextMock,
  default: {
    extractRawText: mammothExtractRawTextMock,
  },
}));

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    load: pdfLoadMock,
  },
}));

vi.mock("./doc-converter-flow", () => ({
  convertDocBufferToText: convertDocBufferToTextMock,
}));

vi.mock("./pdf-converter-flow-runner", () => ({
  runPdfConverterFlow: runPdfConverterFlowMock,
}));

import {
  buildPayloadMarker,
  createPayloadFromBlocks,
  encodeScreenplayPayload,
} from "./document-model";
import { extractFileText } from "./file-extraction";

describe("extractFileText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfLoadMock.mockResolvedValue({
      getSubject: () => null,
      getKeywords: () => [],
      getTitle: () => null,
      getProducer: () => null,
    });
    runPdfConverterFlowMock.mockResolvedValue({
      text: "OCR result",
      warnings: [],
      attempts: ["pdf-converter-flow"],
      textOutputPath: "C:\\Temp\\script_output.txt",
    });
    convertDocBufferToTextMock.mockResolvedValue({
      text: "مشهد1\nوصف الحدث",
      method: "doc-converter-flow",
      warnings: [],
      attempts: ["doc-converter-flow"],
    });
  });

  it("extracts txt content", async () => {
    const result = await extractFileText(
      Buffer.from("مرحبا\nسطر ثاني"),
      "a.txt",
      "txt"
    );
    expect(result.method).toBe("native-text");
    expect(result.text).toContain("مرحبا");
    expect(result.usedOcr).toBe(false);
  });

  it("extracts app payload from docx marker", async () => {
    const payload = createPayloadFromBlocks([
      { formatId: "scene-header-1", text: "مشهد 1:" },
      { formatId: "action", text: "وصف" },
    ]);
    const marker = buildPayloadMarker(encodeScreenplayPayload(payload));
    mammothExtractRawTextMock.mockResolvedValueOnce({
      value: `محتوى\n${marker}\nنهاية`,
    });

    const result = await extractFileText(Buffer.from("x"), "b.docx", "docx");
    expect(result.method).toBe("app-payload");
    expect(result.payloadVersion).toBe(1);
    expect(result.structuredBlocks?.length).toBe(2);
    expect(result.structuredBlocks?.[0]?.formatId).toBe("scene-header-1");
  });

  it("keeps non-payload docx text raw before classifier stage", async () => {
    mammothExtractRawTextMock.mockResolvedValueOnce({
      value: "مشهد1 داخلي - نهار",
    });

    const result = await extractFileText(
      Buffer.from("docx"),
      "raw.docx",
      "docx"
    );
    expect(result.method).toBe("mammoth");
    expect(result.text).toBe("مشهد1 داخلي - نهار");
    expect(result.structuredBlocks).toBeUndefined();
    expect(result.normalizationApplied).toBeUndefined();
  });

  it("uses pdf-converter-flow TXT output for pdf import", async () => {
    const result = await extractFileText(Buffer.from("pdf"), "d.pdf", "pdf");
    expect(result.method).toBe("ocr-mistral");
    expect(result.usedOcr).toBe(true);
    expect(result.text).toBe("OCR result");
    expect(runPdfConverterFlowMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "d.pdf"
    );
    expect(result.attempts).toContain("pdf-converter-flow");
  });

  it("fails with explicit message when pdf-converter-flow fails", async () => {
    runPdfConverterFlowMock.mockRejectedValueOnce(
      new Error("فشل تحويل ملف PDF عبر pdf-converter-flow")
    );

    await expect(
      extractFileText(Buffer.from("pdf"), "e.pdf", "pdf")
    ).rejects.toThrow("فشل استخراج نص من PDF");
  });

  it("uses doc-converter-flow as the only doc extraction path", async () => {
    const result = await extractFileText(Buffer.from("doc"), "f.doc", "doc");
    expect(result.method).toBe("doc-converter-flow");
    expect(result.usedOcr).toBe(false);
    expect(result.attempts).toEqual(["doc-converter-flow"]);
    expect(convertDocBufferToTextMock).toHaveBeenCalledTimes(1);
    expect(convertDocBufferToTextMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "f.doc"
    );
  });

  it("fails explicitly when doc-converter-flow fails", async () => {
    convertDocBufferToTextMock.mockRejectedValueOnce(
      new Error("فشل تحويل ملف .doc عبر doc-converter-flow")
    );

    await expect(
      extractFileText(Buffer.from("doc"), "broken.doc", "doc")
    ).rejects.toThrow("فشل تحويل ملف .doc عبر doc-converter-flow");
  });
});
