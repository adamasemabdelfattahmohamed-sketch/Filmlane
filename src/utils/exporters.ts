import {
  buildPayloadMarker,
  createPayloadFromBlocks,
  encodeScreenplayPayload,
  htmlToScreenplayBlocks,
  type ScreenplayBlock,
} from "./document-model";

/**
 * @description
 * مصدّر السيناريو - Screenplay Exporter
 * أدوات لتصدير السيناريو بصيغ مختلفة
 */
export const exportToFountain = (htmlContent: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  let fountain = "";

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const className = element.className;
    const text = element.textContent?.trim() || "";

    if (className.includes("scene-heading")) {
      fountain += `${text.toUpperCase()}\n\n`;
    } else if (className.includes("character")) {
      fountain += `${text.toUpperCase()}\n`;
    } else if (className.includes("dialogue")) {
      fountain += `${text}\n\n`;
    } else if (className.includes("action")) {
      fountain += `${text}\n\n`;
    } else if (className.includes("transition")) {
      fountain += `${text.toUpperCase()}\n\n`;
    }
  });

  return fountain;
};

export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string = "text/plain"
) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

type PdfLayoutPreset = {
  alignment: "right" | "center" | "left";
  bold?: boolean;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentStartPt?: number;
  indentEndPt?: number;
  uppercase?: boolean;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PDF_MARGIN = 56;
const PDF_FONT_SIZE = 12;
const PDF_LINE_HEIGHT = 20;
const PDF_MAIN_FONT = "/fonts/AzarMehrMonospaced_Sans_Regular.ttf";
const PDF_BOLD_FONT = "/fonts/AzarMehrMonospaced_Sans_Bold.ttf";

const pointsToTwips = (value: number): number =>
  Math.max(0, Math.round(value * 20));

const getPdfPreset = (formatId: ScreenplayBlock["formatId"]): PdfLayoutPreset => {
  switch (formatId) {
    case "basmala":
      return { alignment: "center", bold: true, spacingAfterPt: 10 };
    case "scene-header-1":
      return {
        alignment: "right",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 6,
        uppercase: true,
      };
    case "scene-header-2":
      return { alignment: "right", spacingAfterPt: 4 };
    case "scene-header-3":
      return { alignment: "center", spacingAfterPt: 4 };
    case "scene-header-top-line":
      return { alignment: "right", spacingAfterPt: 6 };
    case "character":
      return {
        alignment: "center",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 2,
      };
    case "dialogue":
      return {
        alignment: "right",
        spacingAfterPt: 6,
        indentStartPt: 28,
        indentEndPt: 22,
      };
    case "parenthetical":
      return { alignment: "center", spacingAfterPt: 4 };
    case "transition":
      return {
        alignment: "left",
        bold: true,
        spacingBeforePt: 6,
        spacingAfterPt: 6,
      };
    case "action":
      return { alignment: "right", spacingAfterPt: 6 };
    default:
      return { alignment: "right", spacingAfterPt: 6 };
  }
};

const normalizeText = (value: string): string =>
  (value ?? "").replace(/\u00A0/g, " ").replace(/\r/g, "").trim();

const splitWords = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const wrapTextToWidth = (
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font: any,
  fontSize: number,
  maxWidth: number
): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) return [""];
  const words = splitWords(normalized);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[i];
  }

  lines.push(current);
  return lines;
};

const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
};

const toPdfFilename = (name: string): string =>
  name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;

const resolveBlocksForExport = (
  content: string,
  blocks?: ScreenplayBlock[]
): ScreenplayBlock[] => {
  if (Array.isArray(blocks) && blocks.length > 0) {
    return blocks;
  }
  return htmlToScreenplayBlocks(content);
};

const readFontBytes = async (path: string): Promise<Uint8Array> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`تعذر تحميل الخط: ${path}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

export const exportToPDF = async (
  content: string,
  filename: string = "screenplay",
  options?: { openAfterExport?: boolean; blocks?: ScreenplayBlock[] }
) => {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;

  const blocks = resolveBlocksForExport(content, options?.blocks);
  const payload = createPayloadFromBlocks(blocks, {
    font: "AzarMehrMonospaced-San",
    size: "12pt",
  });
  const encodedPayload = encodeScreenplayPayload(payload);
  const payloadMarker = buildPayloadMarker(encodedPayload);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = await readFontBytes(PDF_MAIN_FONT);
  const boldFontBytes = await readFontBytes(PDF_BOLD_FONT);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, {
    subset: true,
  });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, {
    subset: true,
  });

  pdfDoc.setTitle(filename);
  pdfDoc.setSubject(payloadMarker);
  pdfDoc.setKeywords(["filmlane", "screenplay", "rtl", "payload"]);

  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - PDF_MARGIN;

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight >= PDF_MARGIN) return;
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - PDF_MARGIN;
  };

  for (const block of blocks) {
    const preset = getPdfPreset(block.formatId);
    const text = preset.uppercase
      ? normalizeText(block.text).toUpperCase()
      : normalizeText(block.text);
    const activeFont = preset.bold ? boldFont : regularFont;
    const indentStart = preset.indentStartPt ?? 0;
    const indentEnd = preset.indentEndPt ?? 0;
    const usableWidth =
      A4_WIDTH - PDF_MARGIN * 2 - Math.max(0, indentStart) - Math.max(0, indentEnd);
    const lines = wrapTextToWidth(text, activeFont, PDF_FONT_SIZE, usableWidth);

    y -= preset.spacingBeforePt ?? 0;
    ensureSpace(lines.length * PDF_LINE_HEIGHT + (preset.spacingAfterPt ?? 0) + 12);

    for (const line of lines) {
      const width = activeFont.widthOfTextAtSize(line, PDF_FONT_SIZE);
      const baseX = PDF_MARGIN + indentStart;
      const lineX =
        preset.alignment === "center"
          ? baseX + (usableWidth - width) / 2
          : preset.alignment === "left"
            ? baseX
            : baseX + usableWidth - width;
      page.drawText(line, {
        x: Math.max(PDF_MARGIN, lineX),
        y,
        size: PDF_FONT_SIZE,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
      y -= PDF_LINE_HEIGHT;
      ensureSpace(PDF_LINE_HEIGHT + (preset.spacingAfterPt ?? 0));
    }

    y -= preset.spacingAfterPt ?? 0;
  }

  // Marker نصي مخفي داخل الملف لدعم الاسترجاع حتى مع فقدان بعض metadata.
  page.drawText(payloadMarker, {
    x: 1,
    y: 1,
    size: 1,
    font: regularFont,
    color: rgb(1, 1, 1),
    opacity: 0,
  });

  const bytes = await pdfDoc.save();
  const binary = new Uint8Array(bytes.byteLength);
  binary.set(bytes);
  const pdfArrayBuffer = binary.buffer;
  const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

  if (options?.openAfterExport) {
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (printWindow) {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
    return;
  }

  triggerBlobDownload(blob, toPdfFilename(filename));
};

/**
 * تصدير إلى DOCX - Export to DOCX
 * يصدّر السيناريو إلى ملف DOCX حقيقي (OpenXML) قابل للفتح مباشرة في Word
 */
type DocxParagraphPreset = {
  alignment: "right" | "center" | "left" | "justify";
  bold?: boolean;
  italics?: boolean;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentStartTwip?: number;
  indentEndTwip?: number;
};

const DEFAULT_DOCX_FONT = "AzarMehrMonospaced-San";
const DEFAULT_DOCX_SIZE_HALF_POINTS = 24; // 12pt

const getDocxPresetForFormat = (
  formatId: ScreenplayBlock["formatId"]
): DocxParagraphPreset => {
  switch (formatId) {
    case "basmala":
      return {
        alignment: "center",
        bold: true,
        spacingAfterPt: 10,
      };
    case "scene-header-1":
      return {
        alignment: "right",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 6,
      };
    case "scene-header-2":
      return {
        alignment: "right",
        spacingAfterPt: 4,
      };
    case "scene-header-3":
      return {
        alignment: "center",
        spacingAfterPt: 4,
      };
    case "scene-header-top-line":
      return {
        alignment: "right",
        spacingAfterPt: 6,
      };
    case "character":
      return {
        alignment: "center",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 2,
      };
    case "dialogue":
      return {
        alignment: "right",
        spacingAfterPt: 6,
        indentStartTwip: 960,
        indentEndTwip: 720,
      };
    case "parenthetical":
      return {
        alignment: "center",
        italics: true,
        spacingAfterPt: 4,
      };
    case "transition":
      return {
        alignment: "left",
        bold: true,
        spacingBeforePt: 6,
        spacingAfterPt: 6,
      };
    case "action":
      return {
        alignment: "justify",
        spacingAfterPt: 6,
      };
    default:
      return {
        alignment: "right",
        spacingAfterPt: 6,
      };
  }
};

const mapAlignment = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AlignmentType: any,
  alignment: DocxParagraphPreset["alignment"]
) => {
  switch (alignment) {
    case "center":
      return AlignmentType.CENTER;
    case "left":
      return AlignmentType.LEFT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.RIGHT;
  }
};

export const exportToDocx = async (
  content: string,
  filename: string = "screenplay.docx",
  options?: { blocks?: ScreenplayBlock[] }
) => {
  const { AlignmentType, Document, Packer, Paragraph, TextRun } =
    await import("docx");
  const blocks = resolveBlocksForExport(content, options?.blocks);
  const payload = createPayloadFromBlocks(blocks, {
    font: "AzarMehrMonospaced-San",
    size: "12pt",
  });
  const payloadMarker = buildPayloadMarker(encodeScreenplayPayload(payload));

  const paragraphs = blocks.map((block) => {
    const preset = getDocxPresetForFormat(block.formatId);
    return new Paragraph({
      bidirectional: true,
      alignment: mapAlignment(AlignmentType, preset.alignment),
      spacing: {
        before: pointsToTwips(preset.spacingBeforePt ?? 0),
        after: pointsToTwips(preset.spacingAfterPt ?? 0),
      },
      indent: {
        start: preset.indentStartTwip,
        end: preset.indentEndTwip,
      },
      children: [
        new TextRun({
          text: normalizeText(block.text),
          font: DEFAULT_DOCX_FONT,
          size: DEFAULT_DOCX_SIZE_HALF_POINTS,
          bold: preset.bold,
          italics: preset.italics,
        }),
      ],
    });
  });

  if (paragraphs.length === 0) {
    paragraphs.push(
      new Paragraph({
        bidirectional: true,
        children: [
          new TextRun({
            text: "",
            font: DEFAULT_DOCX_FONT,
            size: DEFAULT_DOCX_SIZE_HALF_POINTS,
          }),
        ],
      })
    );
  }

  // Marker مخفي (لون أبيض + حجم صغير جداً) لاستعادة payload 1:1 عند الفتح.
  paragraphs.push(
    new Paragraph({
      bidirectional: true,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({
          text: payloadMarker,
          color: "FFFFFF",
          size: 2,
          font: DEFAULT_DOCX_FONT,
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Legacy PDF export - kept for compatibility
 * @deprecated Use exportToPDF(content, filename) instead
 */
export const exportToPDFLegacy = async (
  element: HTMLElement,
  filename: string
) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const styles = `
    <style>
      @page { margin: 1in; }
      body { font-family: 'Courier New', monospace; font-size: 12pt; line-height: 14pt; }
      .scene-heading { text-transform: uppercase; font-weight: bold; margin: 2em 0 1em; }
      .character { text-transform: uppercase; margin: 1em 0 0 2in; }
      .dialogue { margin: 0 1.5in 1em 1in; }
      .action { margin: 1em 0; }
      .transition { text-transform: uppercase; text-align: right; margin: 1em 0; }
    </style>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        ${styles}
      </head>
      <body>${element.innerHTML}</body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};
