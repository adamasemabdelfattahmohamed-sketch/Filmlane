import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorArea, type EditorHandle } from "./EditorArea";

function buildSecondBody(container: HTMLElement): HTMLDivElement {
  const screenplayContainer = container.querySelector(
    ".screenplay-container"
  ) as HTMLDivElement;
  if (!screenplayContainer) {
    throw new Error("screenplay-container not found");
  }

  const sheet = document.createElement("div");
  sheet.className = "screenplay-sheet";

  const header = document.createElement("div");
  header.className = "screenplay-sheet__header";

  const body = document.createElement("div");
  body.className = "screenplay-sheet__body";
  body.contentEditable = "true";

  const footer = document.createElement("div");
  footer.className = "screenplay-sheet__footer";

  sheet.appendChild(header);
  sheet.appendChild(body);
  sheet.appendChild(footer);
  screenplayContainer.appendChild(sheet);
  return body;
}

function setCollapsedSelectionAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setRangeSelection(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number
) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getActiveRangeSnapshot() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
    collapsed: range.collapsed,
  };
}

function collectEditorText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll(".screenplay-sheet__body > div"))
    .map((node) => (node.textContent || "").trim())
    .filter(Boolean)
    .join("\n");
}

describe("EditorArea selection operations integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let editorRef: React.RefObject<EditorHandle | null>;
  let writeTextMock: ReturnType<typeof vi.fn>;
  let readTextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    writeTextMock = vi.fn(async () => {});
    readTextMock = vi.fn(async () => "");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
        readText: readTextMock,
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    editorRef = createRef<EditorHandle>();

    await act(async () => {
      root.render(
        <EditorArea
          ref={editorRef}
          onContentChange={() => {}}
          onStatsChange={() => {}}
          onFormatChange={() => {}}
          font="AzarMehrMonospaced-San"
          size="12pt"
          pageCount={1}
        />
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("cuts full multi-page selection after selectAllContent", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">PAGE-1 LINE</div>';
    secondBody.innerHTML = '<div class="format-action">PAGE-2 LINE</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
      const result = await editorRef.current?.cutSelectionToClipboard();
      expect(result).toBe(true);
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("PAGE-1 LINE");
    expect(text).not.toContain("PAGE-2 LINE");
    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it("keeps select-all cut across pages even if browser collapses visual range to first host", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">FIRST-PAGE</div>';
    secondBody.innerHTML = '<div class="format-action">SECOND-PAGE</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
    });

    const firstTextNode = firstBody.querySelector("div")?.firstChild;
    if (!firstTextNode) {
      throw new Error("first page text node is missing");
    }

    // Mimic browsers that end up clamping the active range to first editable host.
    setRangeSelection(firstTextNode, 0, firstTextNode, 5);

    await act(async () => {
      const result = await editorRef.current?.cutSelectionToClipboard();
      expect(result).toBe(true);
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("FIRST-PAGE");
    expect(text).not.toContain("SECOND-PAGE");
  });

  it("deletes full multi-page selection on Delete after selectAllContent", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">DEL-ONE</div>';
    secondBody.innerHTML = '<div class="format-action">DEL-TWO</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
    });

    await act(async () => {
      firstBody.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true })
      );
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("DEL-ONE");
    expect(text).not.toContain("DEL-TWO");
  });

  it("copies full multi-page selection then pastes through classifier path", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">ALPHA</div>';
    secondBody.innerHTML = '<div class="format-action">BETA</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
      const copied = await editorRef.current?.copySelectionToClipboard();
      expect(copied).toBe(true);
    });

    const copiedText = (writeTextMock.mock.calls[0]?.[0] as string) ?? "";
    setCollapsedSelectionAtEnd(secondBody);

    await act(async () => {
      await editorRef.current?.pastePlainTextWithClassifier(copiedText);
    });

    const text = collectEditorText(container);
    expect(text).toContain("ALPHA");
    expect(text).toContain("BETA");
  });

  it("keeps caret near insertion point after paste instead of jumping to document end", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">PAGE1</div>';
    secondBody.innerHTML = '<div class="format-action">PAGE2-END</div>';

    const firstTextNode = firstBody.querySelector("div")?.firstChild;
    if (!firstTextNode) {
      throw new Error("first page text node is missing");
    }

    // Place caret inside page 1 before paste.
    setRangeSelection(firstTextNode, 2, firstTextNode, 2);

    await act(async () => {
      await editorRef.current?.pastePlainTextWithClassifier("INSERTED");
    });

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    expect(selection?.rangeCount).toBeGreaterThan(0);
    const range = selection!.getRangeAt(0);
    expect(firstBody.contains(range.startContainer)).toBe(true);
  });

  it("does not change active selection on copy", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    firstBody.innerHTML = '<div class="format-action">COPY-RANGE</div>';

    const textNode = firstBody.querySelector("div")?.firstChild;
    if (!textNode) {
      throw new Error("copy target text node is missing");
    }

    setRangeSelection(textNode, 1, textNode, 5);
    const before = getActiveRangeSnapshot();
    if (!before) {
      throw new Error("selection before copy is missing");
    }

    await act(async () => {
      const result = await editorRef.current?.copySelectionToClipboard();
      expect(result).toBe(true);
    });

    const after = getActiveRangeSnapshot();
    expect(after).toBeTruthy();
    expect(after?.startContainer).toBe(before.startContainer);
    expect(after?.startOffset).toBe(before.startOffset);
    expect(after?.endContainer).toBe(before.endContainer);
    expect(after?.endOffset).toBe(before.endOffset);
    expect(after?.collapsed).toBe(before.collapsed);
  });

  it("cuts partial selection spanning end of page 1 to start of page 2", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">ABCDE</div>';
    secondBody.innerHTML = '<div class="format-action">12345</div>';

    const firstText = firstBody.querySelector("div")?.firstChild;
    const secondText = secondBody.querySelector("div")?.firstChild;
    if (!firstText || !secondText) {
      throw new Error("Failed to build text nodes for selection");
    }

    setRangeSelection(firstText, 2, secondText, 3);

    await act(async () => {
      const result = await editorRef.current?.cutSelectionToClipboard();
      expect(result).toBe(true);
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("ABCDE");
    expect(text).not.toContain("12345");
    expect(text).toContain("AB");
    expect(text).toContain("45");
  });

  it("does not delete selected content when clipboard write fails on cut", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">KEEP-ONE</div>';
    secondBody.innerHTML = '<div class="format-action">KEEP-TWO</div>';
    writeTextMock.mockRejectedValueOnce(new Error("clipboard denied"));

    await act(async () => {
      editorRef.current?.selectAllContent();
      const result = await editorRef.current?.cutSelectionToClipboard();
      expect(result).toBe(false);
    });

    const text = collectEditorText(container);
    expect(text).toContain("KEEP-ONE");
    expect(text).toContain("KEEP-TWO");
  });

  it("undo restores content after multi-page cut", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">UNDO-ONE</div>';
    secondBody.innerHTML = '<div class="format-action">UNDO-TWO</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
      await editorRef.current?.cutSelectionToClipboard();
    });

    expect(collectEditorText(container)).not.toContain("UNDO-ONE");
    expect(collectEditorText(container)).not.toContain("UNDO-TWO");

    await act(async () => {
      const undone = editorRef.current?.undoCommandOperation();
      expect(undone).toBe(true);
    });

    const restored = collectEditorText(container);
    expect(restored).toContain("UNDO-ONE");
    expect(restored).toContain("UNDO-TWO");
  });

  it("redo reapplies cut after undo", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;
    const secondBody = buildSecondBody(container);

    firstBody.innerHTML = '<div class="format-action">REDO-ONE</div>';
    secondBody.innerHTML = '<div class="format-action">REDO-TWO</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
      await editorRef.current?.cutSelectionToClipboard();
      editorRef.current?.undoCommandOperation();
      const redone = editorRef.current?.redoCommandOperation();
      expect(redone).toBe(true);
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("REDO-ONE");
    expect(text).not.toContain("REDO-TWO");
  });

  it("pastes filmlane html from dataTransfer as structured blocks (keeps format classes)", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;

    firstBody.innerHTML = '<div class="format-action">ANCHOR</div>';
    setCollapsedSelectionAtEnd(firstBody);

    const html =
      '<div class="format-character">سالم:</div><div class="format-dialogue">أهلاً.</div>';
    const dt = {
      getData: (type: string) => {
        if (type === "text/html") return html;
        if (type === "text/plain") return "سالم:\nأهلاً.";
        return "";
      },
    } as unknown as DataTransfer;

    await act(async () => {
      const result = await editorRef.current?.pasteFromDataTransfer(dt, "native");
      expect(result).toBe(true);
    });

    expect(firstBody.querySelector(".format-character")).toBeTruthy();
    expect(firstBody.querySelector(".format-dialogue")).toBeTruthy();
  });

  it("uses internal clipboard payload cache when clipboard read is unavailable", async () => {
    const firstBody = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLDivElement;

    firstBody.innerHTML =
      '<div class="format-character">نادر:</div><div class="format-dialogue">اختبار.</div>';

    await act(async () => {
      editorRef.current?.selectAllContent();
      const copied = await editorRef.current?.copySelectionToClipboard();
      expect(copied).toBe(true);
      await editorRef.current?.cutSelectionToClipboard();
    });

    readTextMock.mockRejectedValueOnce(new Error("clipboard denied"));

    await act(async () => {
      const pasted = await editorRef.current?.pasteFromClipboard("menu");
      expect(pasted).toBe(true);
    });

    const text = collectEditorText(container);
    expect(text).toContain("نادر:");
    expect(text).toContain("اختبار.");
    expect(firstBody.querySelector(".format-character")).toBeTruthy();
    expect(firstBody.querySelector(".format-dialogue")).toBeTruthy();
  });
});
