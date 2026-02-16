import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockEditorApi = {
  hasSelection: ReturnType<typeof vi.fn>;
  copySelectionToClipboard: ReturnType<typeof vi.fn>;
  cutSelectionToClipboard: ReturnType<typeof vi.fn>;
  pasteFromClipboard: ReturnType<typeof vi.fn>;
  undoCommandOperation: ReturnType<typeof vi.fn>;
  redoCommandOperation: ReturnType<typeof vi.fn>;
  selectAllContent: ReturnType<typeof vi.fn>;
  focusEditor: ReturnType<typeof vi.fn>;
  importClassifiedText: ReturnType<typeof vi.fn>;
  importStructuredBlocks: ReturnType<typeof vi.fn>;
  exportStructuredBlocks: ReturnType<typeof vi.fn>;
};

const toastMock = vi.fn();
let editorHostElement: HTMLDivElement | null = null;
let mockEditorApi: MockEditorApi;

const resetMockEditorApi = () => {
  mockEditorApi = {
    hasSelection: vi.fn(() => true),
    copySelectionToClipboard: vi.fn(async () => true),
    cutSelectionToClipboard: vi.fn(async () => true),
    pasteFromClipboard: vi.fn(async () => true),
    undoCommandOperation: vi.fn(() => true),
    redoCommandOperation: vi.fn(() => true),
    selectAllContent: vi.fn(),
    focusEditor: vi.fn(),
    importClassifiedText: vi.fn(async () => {}),
    importStructuredBlocks: vi.fn(async () => {}),
    exportStructuredBlocks: vi.fn(() => [
      { formatId: "action", text: "export-block" },
    ]),
  };
};

resetMockEditorApi();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/ui/hover-border-gradient", () => ({
  HoverBorderGradient: ({
    as: Component = "div",
    children,
    onMouseDown,
    onClick,
    className,
  }: {
    as?: React.ElementType;
    children?: React.ReactNode;
    onMouseDown?: React.MouseEventHandler<HTMLElement>;
    onClick?: React.MouseEventHandler<HTMLElement>;
    className?: string;
  }) =>
    React.createElement(
      Component,
      {
        className,
        onMouseDown,
        onClick,
      },
      children
    ),
}));

vi.mock("./EditorFooter", () => ({
  EditorFooter: () => <div data-testid="mock-editor-footer" />,
}));

vi.mock("@/components/ui/background-ripple-effect", () => ({
  BackgroundRippleEffect: () => <div data-testid="mock-background-ripple" />,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-context-menu">{children}</div>
  ),
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-context-trigger">{children}</div>
  ),
  ContextMenuContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="mock-context-content" className={className}>
      {children}
    </div>
  ),
  ContextMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" data-testid="mock-context-item" onClick={onSelect}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <div data-testid="mock-context-separator" />,
  ContextMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("./EditorArea", async () => {
  const reactModule = await vi.importActual<typeof import("react")>("react");
  const MockEditorArea = reactModule.forwardRef(
    (
      _props: Record<string, unknown>,
      ref: React.ForwardedRef<Record<string, unknown>>
    ) => {
      const hostRef = reactModule.useRef<HTMLDivElement>(null);

      reactModule.useEffect(() => {
        editorHostElement = hostRef.current;
        return () => {
          editorHostElement = null;
        };
      }, []);

      reactModule.useImperativeHandle(ref, () => ({
        insertContent: vi.fn(),
        getElement: () => hostRef.current,
        getAllText: () => "",
        getAllHtml: () => "",
        hasSelection: mockEditorApi.hasSelection,
        copySelectionToClipboard: mockEditorApi.copySelectionToClipboard,
        cutSelectionToClipboard: mockEditorApi.cutSelectionToClipboard,
        pasteFromClipboard: mockEditorApi.pasteFromClipboard,
        pasteFromDataTransfer: vi.fn(async () => true),
        pastePlainTextWithClassifier: vi.fn(async () => {}),
        undoCommandOperation: mockEditorApi.undoCommandOperation,
        redoCommandOperation: mockEditorApi.redoCommandOperation,
        selectAllContent: mockEditorApi.selectAllContent,
        focusEditor: mockEditorApi.focusEditor,
        importClassifiedText: mockEditorApi.importClassifiedText,
        importStructuredBlocks: mockEditorApi.importStructuredBlocks,
        exportStructuredBlocks: mockEditorApi.exportStructuredBlocks,
      }));

      return (
        <div
          ref={hostRef}
          data-testid="mock-editor-area"
          contentEditable={true}
          suppressContentEditableWarning={true}
        />
      );
    }
  );

  return {
    EditorArea: MockEditorArea,
  };
});

import { ScreenplayEditor } from "./ScreenplayEditor";

const waitForAsyncActions = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const getButtonByText = (
  container: HTMLElement,
  label: string,
  options?: { withinContextMenu?: boolean }
): HTMLButtonElement => {
  const wantContext = options?.withinContextMenu ?? false;
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  );
  const match = buttons.find((button) => {
    const inContextMenu = Boolean(
      button.closest('[data-testid="mock-context-content"]')
    );
    const normalized = (button.textContent || "").replace(/\s+/g, " ").trim();
    if (inContextMenu !== wantContext) return false;
    return normalized.includes(label);
  });

  if (!match) {
    throw new Error(`Button with label "${label}" was not found`);
  }

  return match;
};

const setSelectionInsideEditor = () => {
  if (!editorHostElement) throw new Error("Mock editor host is not mounted");
  const selection = window.getSelection();
  if (!selection) throw new Error("Selection API is unavailable");

  const range = document.createRange();
  range.setStart(editorHostElement, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
};

describe("ScreenplayEditor shared edit-command entry points", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resetMockEditorApi();
    toastMock.mockReset();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<ScreenplayEditor />);
    });

    setSelectionInsideEditor();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("routes Edit menu commands to the same clipboard/select dispatcher", async () => {
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "تراجع").click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "إعادة").click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "نسخ").click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "قص").click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "لصق").click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تعديل").click();
    });
    await act(async () => {
      getButtonByText(container, "تحديد الكل").click();
      await waitForAsyncActions();
    });

    expect(mockEditorApi.undoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.redoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.copySelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.cutSelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenCalledWith("menu");
    expect(mockEditorApi.selectAllContent).toHaveBeenCalledTimes(1);
  });

  it("routes keyboard shortcuts to the same clipboard/select dispatcher", async () => {
    const triggerShortcut = async (
      key: string,
      options?: { shift?: boolean }
    ) => {
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            ctrlKey: true,
            shiftKey: Boolean(options?.shift),
            bubbles: true,
            cancelable: true,
          })
        );
        await waitForAsyncActions();
      });
    };

    await triggerShortcut("c");
    await triggerShortcut("x");
    await triggerShortcut("v");
    await triggerShortcut("a");
    await triggerShortcut("z");
    await triggerShortcut("y");

    expect(mockEditorApi.undoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.redoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.copySelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.cutSelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenLastCalledWith("shortcut");
    expect(mockEditorApi.selectAllContent).toHaveBeenCalledTimes(1);
  });

  it("routes context-menu commands to the same clipboard/select dispatcher", async () => {
    await act(async () => {
      getButtonByText(container, "تراجع", { withinContextMenu: true }).click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "إعادة", { withinContextMenu: true }).click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "نسخ", { withinContextMenu: true }).click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "قص", { withinContextMenu: true }).click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "لصق", { withinContextMenu: true }).click();
      await waitForAsyncActions();
    });
    await act(async () => {
      getButtonByText(container, "تحديد الكل", {
        withinContextMenu: true,
      }).click();
      await waitForAsyncActions();
    });

    expect(mockEditorApi.undoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.redoCommandOperation).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.copySelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.cutSelectionToClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenCalledTimes(1);
    expect(mockEditorApi.pasteFromClipboard).toHaveBeenLastCalledWith("context");
    expect(mockEditorApi.selectAllContent).toHaveBeenCalledTimes(1);
  });
});
