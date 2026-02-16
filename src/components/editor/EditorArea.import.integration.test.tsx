import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorArea, type EditorHandle } from "./EditorArea";

function setCursorToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function collectEditorText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll(".screenplay-sheet__body > div"))
    .map((node) => (node.textContent || "").trim())
    .filter(Boolean)
    .join("\n");
}

describe("EditorArea file import integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let editorRef: React.RefObject<EditorHandle | null>;

  beforeEach(async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

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
  });

  it("replace mode clears existing content and imports via paste pipeline", async () => {
    const body = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLElement;
    expect(body).toBeTruthy();

    body.innerHTML = '<div class="format-action">OLD CONTENT</div>';
    setCursorToEnd(body);

    await act(async () => {
      await editorRef.current?.importClassifiedText(
        "new imported text",
        "replace"
      );
    });

    const text = collectEditorText(container);
    expect(text).not.toContain("OLD CONTENT");
    expect(text).toContain("new imported text");
  });

  it("insert mode preserves existing content and appends imported text", async () => {
    const body = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLElement;
    expect(body).toBeTruthy();

    body.innerHTML = '<div class="format-action">KEEP CONTENT</div>';
    setCursorToEnd(body);

    await act(async () => {
      await editorRef.current?.importClassifiedText("inserted text", "insert");
    });

    const text = collectEditorText(container);
    expect(text).toContain("KEEP CONTENT");
    expect(text).toContain("inserted text");
  });

  it("import operations are undoable through command history", async () => {
    const body = container.querySelector(
      ".screenplay-sheet__body"
    ) as HTMLElement;
    expect(body).toBeTruthy();

    body.innerHTML = '<div class="format-action">UNDO SOURCE</div>';
    setCursorToEnd(body);

    await act(async () => {
      await editorRef.current?.importClassifiedText(
        "replace target",
        "replace"
      );
    });

    expect(collectEditorText(container)).toContain("replace target");

    await act(async () => {
      const undone = editorRef.current?.undoCommandOperation();
      expect(undone).toBe(true);
    });

    expect(collectEditorText(container)).toContain("UNDO SOURCE");
  });
});
