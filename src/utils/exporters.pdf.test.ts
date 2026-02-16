import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportToPDF } from "./exporters";

const drawTextMock = vi.fn();
const addPageMock = vi.fn(() => ({
  drawText: drawTextMock,
}));
const setTitleMock = vi.fn();
const setSubjectMock = vi.fn();
const setKeywordsMock = vi.fn();
const embedFontMock = vi.fn(async () => ({
  widthOfTextAtSize: (value: string) => value.length * 5,
}));
const saveMock = vi.fn(async () => new Uint8Array([1, 2, 3]));
const registerFontkitMock = vi.fn();

const createMock = vi.fn(async () => ({
  addPage: addPageMock,
  setTitle: setTitleMock,
  setSubject: setSubjectMock,
  setKeywords: setKeywordsMock,
  embedFont: embedFontMock,
  save: saveMock,
  registerFontkit: registerFontkitMock,
}));

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    create: createMock,
  },
  rgb: () => ({ r: 0, g: 0, b: 0 }),
}));

vi.mock("@pdf-lib/fontkit", () => ({
  default: {},
}));

describe("exportToPDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([10, 20, 30]).buffer,
      }))
    );
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:pdf"),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  it("creates downloadable PDF without window.print flow", async () => {
    const openSpy = vi.spyOn(window, "open");
    await exportToPDF('<div class="format-action">سطر</div>', "test");
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(setSubjectMock).toHaveBeenCalledTimes(1);
    expect(String(setSubjectMock.mock.calls[0][0])).toContain(
      "[[FILMLANE_PAYLOAD_V1:"
    );
    expect(drawTextMock).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("accepts structured blocks input", async () => {
    await exportToPDF("", "blocks", {
      blocks: [
        { formatId: "scene-header-1", text: "مشهد 1" },
        { formatId: "scene-header-2", text: "داخلي - بيت - نهار" },
        { formatId: "action", text: "وصف" },
      ],
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(drawTextMock).toHaveBeenCalled();
  });
});
