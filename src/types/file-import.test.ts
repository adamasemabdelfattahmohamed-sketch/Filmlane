/**
 * اختبارات الأنواع التعاقدية لاستيراد الملفات
 */

import { describe, it, expect } from "vitest";
import { getFileType, ACCEPTED_FILE_EXTENSIONS } from "./file-import";

describe("getFileType", () => {
  it("should return correct type for supported extensions", () => {
    expect(getFileType("test.doc")).toBe("doc");
    expect(getFileType("test.docx")).toBe("docx");
    expect(getFileType("test.txt")).toBe("txt");
    expect(getFileType("test.pdf")).toBe("pdf");
    expect(getFileType("test.fountain")).toBe("fountain");
    expect(getFileType("test.fdx")).toBe("fdx");
  });

  it("should be case insensitive", () => {
    expect(getFileType("test.DOC")).toBe("doc");
    expect(getFileType("test.PDF")).toBe("pdf");
    expect(getFileType("TEST.DOCX")).toBe("docx");
  });

  it("should return null for unsupported extensions", () => {
    expect(getFileType("test.jpg")).toBeNull();
    expect(getFileType("test.xlsx")).toBeNull();
    expect(getFileType("test")).toBeNull();
  });

  it("should handle filenames with multiple dots", () => {
    expect(getFileType("my.screenplay.v2.pdf")).toBe("pdf");
    expect(getFileType("script.final.doc")).toBe("doc");
  });
});

describe("ACCEPTED_FILE_EXTENSIONS", () => {
  it("should include all supported extensions", () => {
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".doc");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".docx");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".txt");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".pdf");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".fountain");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".fdx");
  });
});
