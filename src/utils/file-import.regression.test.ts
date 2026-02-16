import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { handlePaste } from "./paste-classifier";
import { extractFileText } from "./file-extraction";
import {
  buildPayloadMarker,
  createPayloadFromBlocks,
  encodeScreenplayPayload,
  extractPayloadFromText,
  htmlToScreenplayBlocks,
  screenplayBlocksToHtml,
  type ScreenplayBlock,
} from "./document-model";
import { buildFileOpenPipelineAction } from "./file-open-pipeline";

type FixtureFileType = "doc" | "docx" | "pdf";

type BaselineShape = {
  blocks: ScreenplayBlock[];
  normalizedText: string;
  formatHistogram: Record<string, number>;
};

const FIXTURE_DIR = resolve(process.cwd(), "tests", "fixtures", "regression");

const loadFixture = (name: string): Buffer =>
  readFileSync(resolve(FIXTURE_DIR, name));

const loadBaseline = (): BaselineShape => {
  const raw = readFileSync(
    resolve(FIXTURE_DIR, "12.paste-baseline.blocks.json"),
    "utf8"
  );
  return JSON.parse(raw) as BaselineShape;
};

const classifyTextViaPastePipeline = async (
  text: string,
  importSource: "clipboard" | "file-import"
): Promise<ScreenplayBlock[]> => {
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  document.body.appendChild(editor);

  const selection = window.getSelection();
  if (!selection) throw new Error("Selection unavailable");
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  const event = {
    preventDefault: () => {},
    clipboardData: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  } as unknown as Parameters<typeof handlePaste>[0];

  await handlePaste(
    event,
    { current: editor },
    () => ({}),
    () => {},
    null,
    `regression-${Date.now()}`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    importSource
  );
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));

  const blocks = htmlToScreenplayBlocks(editor.innerHTML);
  editor.remove();
  return blocks;
};

const lcsLength = (a: string[], b: string[]): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[a.length][b.length];
};

const collapseAdjacentFormats = (formats: string[]): string[] => {
  const collapsed: string[] = [];
  for (const format of formats) {
    if (collapsed[collapsed.length - 1] === format) continue;
    collapsed.push(format);
  }
  return collapsed;
};

const formatAgreementScore = (candidate: ScreenplayBlock[], baseline: ScreenplayBlock[]): number => {
  const candidateTypes = collapseAdjacentFormats(
    candidate.map((block) => block.formatId)
  );
  const baselineTypes = collapseAdjacentFormats(
    baseline.map((block) => block.formatId)
  );
  const lcs = lcsLength(candidateTypes, baselineTypes);
  return Number((lcs / Math.max(candidateTypes.length, baselineTypes.length, 1)).toFixed(3));
};

const importFixtureAsBlocks = async (fileType: FixtureFileType): Promise<ScreenplayBlock[]> => {
  const buffer = loadFixture(`12.${fileType}`);
  const extraction = await extractFileText(buffer, `12.${fileType}`, fileType);
  const action = buildFileOpenPipelineAction(extraction, "replace");
  if (action.kind === "reject") {
    throw new Error(`fixture import rejected: ${action.toast.description}`);
  }
  if (action.kind === "import-structured-blocks") {
    return action.blocks;
  }
  return classifyTextViaPastePipeline(action.text, "file-import");
};

describe("file import regression: 12.doc / 12.docx / 12.pdf", () => {
  it(
    "matches paste baseline for doc/docx/pdf with required quality gates",
    async () => {
    const baseline = loadBaseline();
    const baselineBlocks = baseline.blocks;

    const docBlocks = await importFixtureAsBlocks("doc");
    const docxBlocks = await importFixtureAsBlocks("docx");
    const pdfBlocks = await importFixtureAsBlocks("pdf");

    const docScore = formatAgreementScore(docBlocks, baselineBlocks);
    const docxScore = formatAgreementScore(docxBlocks, baselineBlocks);
    const pdfScore = formatAgreementScore(pdfBlocks, baselineBlocks);

    expect(docScore).toBeGreaterThanOrEqual(0.95);
    expect(docxScore).toBeGreaterThanOrEqual(0.95);
    expect(pdfScore).toBeGreaterThanOrEqual(0.9);
    },
    30_000
  );

  it(
    "keeps block sequence stable on html/payload round-trip",
    async () => {
    const docBlocks = await importFixtureAsBlocks("doc");
    const html = screenplayBlocksToHtml(docBlocks);
    const htmlRoundTripBlocks = htmlToScreenplayBlocks(html);

    const payload = createPayloadFromBlocks(docBlocks);
    const marker = buildPayloadMarker(encodeScreenplayPayload(payload));
    const payloadRoundTrip = extractPayloadFromText(marker);
    const payloadBlocks = payloadRoundTrip?.blocks ?? [];

    const htmlScore = formatAgreementScore(htmlRoundTripBlocks, docBlocks);
    const payloadScore = formatAgreementScore(payloadBlocks, docBlocks);

    expect(htmlScore).toBeGreaterThanOrEqual(0.98);
    expect(payloadScore).toBeGreaterThanOrEqual(0.99);
    },
    30_000
  );
});
