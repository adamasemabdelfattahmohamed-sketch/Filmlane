import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportToDocx } from "./exporters";

const documentCtorMock = vi.fn();
const paragraphCtorMock = vi.fn();
const textRunCtorMock = vi.fn();
const toBlobMock = vi.fn();

vi.mock("docx", () => {
  const MockDocument = documentCtorMock.mockImplementation(function (
    this: { options: unknown },
    options
  ) {
    this.options = options;
  });

  const MockParagraph = paragraphCtorMock.mockImplementation(function (
    this: { options: unknown },
    options
  ) {
    this.options = options;
  });

  const MockTextRun = textRunCtorMock.mockImplementation(function (
    this: { options: unknown },
    options
  ) {
    this.options = options;
  });

  return {
    AlignmentType: {
      RIGHT: "right",
      LEFT: "left",
      CENTER: "center",
      JUSTIFIED: "both",
    },
    Document: MockDocument,
    Paragraph: MockParagraph,
    TextRun: MockTextRun,
    Packer: {
      toBlob: toBlobMock,
    },
  };
});

describe("exportToDocx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toBlobMock.mockResolvedValue(
      new Blob(["PK"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:docx-export"),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  it("builds a DOCX document and downloads it", async () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    await exportToDocx(
      '<div class="format-action">سطر أول</div><div class="format-dialogue">حوار</div>',
      "screenplay.docx"
    );

    expect(documentCtorMock).toHaveBeenCalledTimes(1);
    expect(toBlobMock).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);

    const createdDoc = documentCtorMock.mock.calls[0][0] as {
      sections: Array<{ children: unknown[] }>;
    };
    expect(createdDoc.sections[0]?.children.length).toBeGreaterThan(0);
  });

  it("still creates a valid file when content is empty", async () => {
    await exportToDocx("", "empty.docx");

    expect(documentCtorMock).toHaveBeenCalledTimes(1);
    const createdDoc = documentCtorMock.mock.calls[0][0] as {
      sections: Array<{ children: unknown[] }>;
    };
    expect(createdDoc.sections[0]?.children.length).toBe(2);
    expect(toBlobMock).toHaveBeenCalledTimes(1);
  });

  it("uses provided structured blocks when available", async () => {
    await exportToDocx("", "blocks.docx", {
      blocks: [
        { formatId: "scene-header-1", text: "مشهد 1" },
        { formatId: "scene-header-2", text: "داخلي - بيت - نهار" },
        { formatId: "action", text: "وصف" },
      ],
    });

    const createdDoc = documentCtorMock.mock.calls[0][0] as {
      sections: Array<{ children: unknown[] }>;
    };
    expect(createdDoc.sections[0]?.children.length).toBeGreaterThan(2);
  });
});
