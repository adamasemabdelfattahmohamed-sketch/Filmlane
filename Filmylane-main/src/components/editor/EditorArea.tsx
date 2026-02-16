"use client";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
} from "react";
import {
  handlePaste as newHandlePaste,
  runPendingPasteConfirmations,
  ContextMemoryManager,
  EDITOR_STYLE_FORMAT_IDS,
  getFormatStyles,
  getNextFormatOnTab,
  getNextFormatOnEnter,
  HybridClassifier,
  FeedbackCollector,
  htmlToScreenplayBlocks,
  logger,
  screenplayBlocksToHtml,
} from "@/utils";
import { FileImportMode } from "@/types/file-import"; // Import this
import type { ScreenplayBlock } from "@/utils/document-model";
import type { ClipboardOrigin, EditorClipboardPayload } from "@/types/editor-clipboard";
import { FILMLANE_CLIPBOARD_MIME } from "@/types/editor-clipboard";
import { ClassificationConfirmationDialog } from "./ConfirmationDialog";
import {
  formatClassMap,
  screenplayFormats,
  formatShortcutMap,
  CONTENT_HEIGHT_PX,
} from "@/constants";
import type { DocumentStats } from "@/types/screenplay";

export interface EditorHandle {
  insertContent: (content: string, mode?: "insert" | "replace") => void;
  getElement: () => HTMLDivElement | null;
  getAllText: () => string;
  getAllHtml: () => string;
  hasSelection: () => boolean;
  copySelectionToClipboard: () => Promise<boolean>;
  cutSelectionToClipboard: () => Promise<boolean>;
  pasteFromClipboard: (origin: ClipboardOrigin) => Promise<boolean>;
  pasteFromDataTransfer: (
    clipboardData: DataTransfer,
    origin: ClipboardOrigin
  ) => Promise<boolean>;
  pastePlainTextWithClassifier: (text: string) => Promise<void>;
  undoCommandOperation: () => boolean;
  redoCommandOperation: () => boolean;
  selectAllContent: () => void;
  focusEditor: () => void;
  /** استيراد نص عبر مسار paste 1:1 (يمرر النص كأنه لصق) */
  importClassifiedText: (
    text: string,
    mode: "replace" | "insert"
  ) => Promise<void>;
  importStructuredBlocks: (
    blocks: ScreenplayBlock[],
    mode: "replace" | "insert"
  ) => Promise<void>;
  exportStructuredBlocks: () => ScreenplayBlock[];
}

interface EditorAreaProps {
  onContentChange: () => void;
  onStatsChange: (stats: DocumentStats) => void;
  onFormatChange: (format: string) => void;
  font: string;
  size: string;
  pageCount: number;
  onImporterReady?: (
    importer: (text: string, mode: FileImportMode) => Promise<void>
  ) => void;
}

type SerializedSelection = {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  collapsed: boolean;
} | null;

type EditorCommandSnapshot = {
  htmlByBody: string[];
  selection: SerializedSelection;
};

type EditorCommandEntry = {
  before: EditorCommandSnapshot;
  after: EditorCommandSnapshot;
};

const MAX_COMMAND_HISTORY_ENTRIES = 100;
type SelectionScopeTelemetry = "partial" | "page" | "multipage" | "select-all";

const isClipboardSourceKind = (
  value: unknown
): value is EditorClipboardPayload["sourceKind"] =>
  value === "selection" || value === "document";

const computeClipboardHash = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const EditorArea = forwardRef<EditorHandle, EditorAreaProps>(
  (
    {
      onContentChange,
      onStatsChange,
      onFormatChange,
      font: _font,
      size: _size,
      pageCount: _pageCount,
      onImporterReady,
    },
    ref
  ) => {
    const fixedFont = "AzarMehrMonospaced-San";
    const fixedSize = "12pt";
    const containerRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<number[]>([1]);
    const commandHistoryRef = useRef<{
      undo: EditorCommandEntry[];
      redo: EditorCommandEntry[];
      applying: boolean;
    }>({
      undo: [],
      redo: [],
      applying: false,
    });
    const syntheticSelectAllRef = useRef(false);
    const lastInternalClipboardRef = useRef<EditorClipboardPayload | null>(null);

    const getAllContentNodes = useCallback(() => {
      if (!containerRef.current) return [];
      const bodies = containerRef.current.querySelectorAll(
        ".screenplay-sheet__body"
      );
      const nodes: Element[] = [];
      bodies.forEach((body) => {
        Array.from(body.children).forEach((child) => nodes.push(child));
      });
      return nodes;
    }, []);

    const getAllBodies = useCallback(() => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLDivElement>(
          ".screenplay-sheet__body"
        )
      );
    }, []);

    const extractBlocksFromEditorBodies = useCallback((): ScreenplayBlock[] => {
      const formatIds = new Set<string>(EDITOR_STYLE_FORMAT_IDS);
      const blocks: ScreenplayBlock[] = [];
      const bodies = getAllBodies();

      for (const body of bodies) {
        for (const childNode of Array.from(body.childNodes)) {
          if (childNode.nodeType !== Node.ELEMENT_NODE) continue;
          const element = childNode as HTMLElement;

          if (element.classList.contains("format-scene-header-top-line")) {
            const header1 = Array.from(element.children).find((child) =>
              child.classList.contains("format-scene-header-1")
            );
            const header2 = Array.from(element.children).find((child) =>
              child.classList.contains("format-scene-header-2")
            );

            if (header1) {
              blocks.push({
                formatId: "scene-header-1",
                text: (header1.textContent || "").trim(),
              });
            }
            if (header2) {
              blocks.push({
                formatId: "scene-header-2",
                text: (header2.textContent || "").trim(),
              });
            }
            continue;
          }

          const classMatch = Array.from(element.classList).find((className) =>
            className.startsWith("format-")
          );
          const rawId = classMatch?.slice("format-".length) ?? "";
          const formatId = formatIds.has(rawId) ? rawId : "action";

          blocks.push({
            formatId: formatId as ScreenplayBlock["formatId"],
            text: (element.textContent || "").trim(),
          });
        }
      }

      return blocks;
    }, [getAllBodies]);

    const getNodePathFromRoot = useCallback(
      (root: Node, node: Node): number[] | null => {
        const path: number[] = [];
        let current: Node | null = node;

        while (current && current !== root) {
          const parentNodeRef: Node | null = current.parentNode;
          if (!parentNodeRef) return null;
          const index = Array.prototype.indexOf.call(
            parentNodeRef.childNodes,
            current
          );
          if (index < 0) return null;
          path.unshift(index);
          current = parentNodeRef;
        }

        if (current !== root) return null;
        return path;
      },
      []
    );

    const resolveNodePathFromRoot = useCallback(
      (root: Node, path: number[]): Node | null => {
        let current: Node = root;
        for (const index of path) {
          if (!current.childNodes[index]) return null;
          current = current.childNodes[index];
        }
        return current;
      },
      []
    );

    const clampSelectionOffset = useCallback(
      (node: Node, offset: number): number => {
        if (node.nodeType === Node.TEXT_NODE) {
          return Math.max(0, Math.min(offset, node.textContent?.length ?? 0));
        }

        return Math.max(0, Math.min(offset, node.childNodes.length));
      },
      []
    );

    const getSelectionRangeInsideEditor = useCallback((): Range | null => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.rangeCount === 0) return null;

      const range = selection.getRangeAt(0);
      if (
        !container.contains(range.startContainer) ||
        !container.contains(range.endContainer)
      ) {
        return null;
      }

      return range;
    }, []);

    const getClosestEditorBody = useCallback((node: Node | null): HTMLDivElement | null => {
      if (!node) return null;
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as HTMLElement)
          : node.parentElement;
      if (!element) return null;
      return (
        element.closest(".screenplay-sheet__body") as HTMLDivElement | null
      );
    }, []);

    const detectSelectionScope = useCallback((): SelectionScopeTelemetry => {
      if (syntheticSelectAllRef.current) {
        return "select-all";
      }

      const activeRange = getSelectionRangeInsideEditor();
      if (!activeRange || activeRange.collapsed) {
        return "partial";
      }

      const startBody = getClosestEditorBody(activeRange.startContainer);
      const endBody = getClosestEditorBody(activeRange.endContainer);
      if (!startBody || !endBody) {
        return "partial";
      }

      if (startBody !== endBody) {
        return "multipage";
      }

      const bodyRange = document.createRange();
      bodyRange.selectNodeContents(startBody);

      const startsAtBodyStart =
        activeRange.compareBoundaryPoints(Range.START_TO_START, bodyRange) <= 0;
      const endsAtBodyEnd =
        activeRange.compareBoundaryPoints(Range.END_TO_END, bodyRange) >= 0;

      return startsAtBodyStart && endsAtBodyEnd ? "page" : "partial";
    }, [getClosestEditorBody, getSelectionRangeInsideEditor]);

    const extractPlainTextFromRange = useCallback((range: Range): string => {
      const fragment = range.cloneContents();
      const temp = document.createElement("div");
      temp.appendChild(fragment);
      const extracted = temp.innerText || temp.textContent || range.toString();
      return extracted.replace(/\u00A0/g, " ");
    }, []);

    const extractTextFromHtml = useCallback((html: string): string => {
      const temp = document.createElement("div");
      temp.innerHTML = html;
      return (temp.innerText || temp.textContent || "").replace(/\u00A0/g, " ").trim();
    }, []);

    const normalizeClipboardBlocks = useCallback(
      (blocks: ScreenplayBlock[]): ScreenplayBlock[] =>
        blocks
          .map((block) => ({
            ...block,
            text: (block.text || "").replace(/\u00A0/g, " ").trim(),
          }))
          .filter((block) => block.text.length > 0),
      []
    );

    const buildClipboardPayloadFromBlocks = useCallback(
      (
        blocks: ScreenplayBlock[],
        sourceKind: EditorClipboardPayload["sourceKind"],
        fallbackHtml = ""
      ): EditorClipboardPayload | null => {
        const normalizedBlocks = normalizeClipboardBlocks(blocks);
        const plainText =
          normalizedBlocks.length > 0
            ? normalizedBlocks.map((block) => block.text).join("\n")
            : extractTextFromHtml(fallbackHtml);
        const html =
          normalizedBlocks.length > 0
            ? screenplayBlocksToHtml(normalizedBlocks)
            : fallbackHtml;

        if (!plainText.trim() && !html.trim()) return null;

        const createdAt = new Date().toISOString();
        const hash = computeClipboardHash(
          `${sourceKind}|${plainText}|${html}|${JSON.stringify(normalizedBlocks)}`
        );

        return {
          plainText,
          html: html || undefined,
          blocks: normalizedBlocks.length > 0 ? normalizedBlocks : undefined,
          sourceKind,
          hash,
          createdAt,
        };
      },
      [extractTextFromHtml, normalizeClipboardBlocks]
    );

    const buildClipboardPayloadFromSelection = useCallback((): EditorClipboardPayload | null => {
      if (syntheticSelectAllRef.current) {
        return buildClipboardPayloadFromBlocks(
          extractBlocksFromEditorBodies(),
          "document"
        );
      }

      const activeRange = getSelectionRangeInsideEditor();
      if (!activeRange || activeRange.collapsed) return null;

      const fragment = activeRange.cloneContents();
      const temp = document.createElement("div");
      temp.appendChild(fragment);
      const html = temp.innerHTML.trim();
      const plainText = extractPlainTextFromRange(activeRange).trim();
      const blocks = html ? htmlToScreenplayBlocks(html) : [];

      if (blocks.length > 0) {
        return buildClipboardPayloadFromBlocks(blocks, "selection", html);
      }

      if (!plainText) return null;

      const createdAt = new Date().toISOString();
      const hash = computeClipboardHash(`selection|${plainText}|${html}`);
      return {
        plainText,
        html: html || undefined,
        sourceKind: "selection",
        hash,
        createdAt,
      };
    }, [
      buildClipboardPayloadFromBlocks,
      extractBlocksFromEditorBodies,
      extractPlainTextFromRange,
      getSelectionRangeInsideEditor,
    ]);

    const setClipboardDataFromPayload = useCallback(
      (clipboardData: DataTransfer, payload: EditorClipboardPayload) => {
        clipboardData.setData("text/plain", payload.plainText);
        if (payload.html) {
          clipboardData.setData("text/html", payload.html);
        }
        clipboardData.setData(FILMLANE_CLIPBOARD_MIME, JSON.stringify(payload));
      },
      []
    );

    const writeClipboardPayload = useCallback(
      async (payload: EditorClipboardPayload): Promise<boolean> => {
        lastInternalClipboardRef.current = payload;

        try {
          const clipboardItemCtor = (globalThis as { ClipboardItem?: typeof ClipboardItem })
            .ClipboardItem;
          if (navigator.clipboard?.write && clipboardItemCtor) {
            const mimeData: Record<string, Blob> = {
              "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
              [FILMLANE_CLIPBOARD_MIME]: new Blob([JSON.stringify(payload)], {
                type: FILMLANE_CLIPBOARD_MIME,
              }),
            };
            if (payload.html) {
              mimeData["text/html"] = new Blob([payload.html], { type: "text/html" });
            }
            await navigator.clipboard.write([new clipboardItemCtor(mimeData)]);
            return true;
          }
        } catch {
          // fallback to writeText below
        }

        try {
          await navigator.clipboard.writeText(payload.plainText);
          return true;
        } catch {
          return false;
        }
      },
      []
    );

    const isLikelyFilmlaneHtml = useCallback((html: string): boolean => {
      if (!html.trim()) return false;
      return /class\s*=\s*["'][^"']*format-[^"']*["']/i.test(html);
    }, []);

    const parseClipboardPayload = useCallback(
      (rawPayload: string): EditorClipboardPayload | null => {
        if (!rawPayload.trim()) return null;
        try {
          const parsed = JSON.parse(rawPayload) as Partial<EditorClipboardPayload>;
          if (
            typeof parsed.plainText !== "string" ||
            typeof parsed.hash !== "string" ||
            typeof parsed.createdAt !== "string" ||
            !isClipboardSourceKind(parsed.sourceKind)
          ) {
            return null;
          }

          const blocks = Array.isArray(parsed.blocks)
            ? normalizeClipboardBlocks(
                parsed.blocks.filter(
                  (block): block is ScreenplayBlock =>
                    typeof block === "object" &&
                    block !== null &&
                    typeof block.formatId === "string" &&
                    typeof block.text === "string"
                )
              )
            : undefined;

          const html = typeof parsed.html === "string" ? parsed.html : undefined;
          const payloadToVerify = `${parsed.sourceKind}|${parsed.plainText}|${html ?? ""}|${JSON.stringify(
            blocks ?? []
          )}`;
          const expectedHash = computeClipboardHash(payloadToVerify);
          if (parsed.hash !== expectedHash) {
            return null;
          }

          return {
            plainText: parsed.plainText,
            html,
            blocks: blocks && blocks.length > 0 ? blocks : undefined,
            sourceKind: parsed.sourceKind,
            hash: parsed.hash,
            createdAt: parsed.createdAt,
          };
        } catch {
          return null;
        }
      },
      [normalizeClipboardBlocks]
    );

    const serializeSelection = useCallback(
      (range: Range): SerializedSelection => {
        const container = containerRef.current;
        if (!container) return null;

        const startPath = getNodePathFromRoot(container, range.startContainer);
        const endPath = getNodePathFromRoot(container, range.endContainer);
        if (!startPath || !endPath) return null;

        return {
          startPath,
          startOffset: range.startOffset,
          endPath,
          endOffset: range.endOffset,
          collapsed: range.collapsed,
        };
      },
      [getNodePathFromRoot]
    );

    const restoreSerializedSelection = useCallback(
      (serialized: SerializedSelection): boolean => {
        if (!serialized) return false;
        const container = containerRef.current;
        const selection = window.getSelection();
        if (!container || !selection) return false;

        const startNode = resolveNodePathFromRoot(
          container,
          serialized.startPath
        );
        const endNode = resolveNodePathFromRoot(container, serialized.endPath);
        if (!startNode || !endNode) return false;

        const range = document.createRange();

        try {
          range.setStart(
            startNode,
            clampSelectionOffset(startNode, serialized.startOffset)
          );
          range.setEnd(
            endNode,
            clampSelectionOffset(endNode, serialized.endOffset)
          );
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        } catch {
          return false;
        }
      },
      [clampSelectionOffset, resolveNodePathFromRoot]
    );

    const focusEditorEnd = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;
      const targetBody = bodies[bodies.length - 1];
      targetBody.focus();

      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(targetBody);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const ensureDocumentHasAtLeastOneLine = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      const hasAnyElement = bodies.some((body) =>
        Array.from(body.childNodes).some(
          (node) => node.nodeType === Node.ELEMENT_NODE
        )
      );

      if (hasAnyElement) return;

      const firstBody = bodies[0];
      const fallback = document.createElement("div");
      fallback.className = formatClassMap.action;
      fallback.innerHTML = "<br>";
      firstBody.appendChild(fallback);

      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(fallback);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const clearAllEditorBodies = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      bodies.forEach((body) => {
        body.innerHTML = "";
      });
      ensureDocumentHasAtLeastOneLine();
    }, [ensureDocumentHasAtLeastOneLine, getAllBodies]);

    const normalizeBodiesAfterDelete = useCallback(() => {
      const bodies = getAllBodies();
      for (const body of bodies) {
        const removable: Node[] = [];
        body.childNodes.forEach((node) => {
          if (
            node.nodeType === Node.TEXT_NODE &&
            !(node.textContent || "").trim()
          ) {
            removable.push(node);
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const isBareEmpty =
              el.childNodes.length === 0 ||
              (el.innerHTML.trim() === "" && !el.textContent);
            if (isBareEmpty) {
              removable.push(node);
            }
          }
        });
        removable.forEach((node) => node.parentNode?.removeChild(node));
      }
    }, [getAllBodies]);

    const captureCommandSnapshot =
      useCallback((): EditorCommandSnapshot | null => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return null;

        const activeRange = getSelectionRangeInsideEditor();
        return {
          htmlByBody: bodies.map((body) => body.innerHTML),
          selection: activeRange
            ? serializeSelection(activeRange.cloneRange())
            : null,
        };
      }, [getAllBodies, getSelectionRangeInsideEditor, serializeSelection]);

    const commitCommandEntry = useCallback(
      (
        before: EditorCommandSnapshot | null,
        after: EditorCommandSnapshot | null
      ) => {
        if (!before || !after) return;
        if (before.htmlByBody.join("||") === after.htmlByBody.join("||"))
          return;

        const history = commandHistoryRef.current;
        if (history.applying) return;

        history.undo.push({ before, after });
        if (history.undo.length > MAX_COMMAND_HISTORY_ENTRIES) {
          history.undo.shift();
        }
        history.redo = [];
      },
      []
    );

    const isCurrentElementEmpty = () => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return true;
      const range = selection.getRangeAt(0);
      let currentElement = range.commonAncestorContainer;
      while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
        currentElement = currentElement.parentNode!;
      }
      while (
        currentElement &&
        (currentElement as HTMLElement).tagName !== "DIV" &&
        (currentElement as HTMLElement).contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        (currentElement as HTMLElement).contentEditable === "true"
      )
        return true;
      return (currentElement.textContent || "").trim().length === 0;
    };

    const getCurrentFormat = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return "action";
      let node = selection.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode!;
      }
      while (
        node &&
        node.parentNode &&
        (node.parentNode as HTMLElement).contentEditable !== "true"
      ) {
        node = node.parentNode;
      }
      if (node && node instanceof HTMLElement && node.className) {
        const format = screenplayFormats.find((f) =>
          node.classList.contains(formatClassMap[f.id])
        );
        if (format) return format.id;
      }
      return "action";
    };

    const applyFormatToCurrentLine = (formatType: string) => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      let currentElement = range.commonAncestorContainer;
      while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
        currentElement = currentElement.parentNode!;
      }
      while (
        currentElement &&
        (currentElement as HTMLElement).tagName !== "DIV" &&
        (currentElement as HTMLElement).contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        (currentElement as HTMLElement).contentEditable === "true"
      ) {
        document.execCommand("formatBlock", false, "div");
        const newSelection = window.getSelection();
        if (!newSelection || !newSelection.rangeCount) return;
        currentElement = newSelection.getRangeAt(0).commonAncestorContainer;
        while (
          currentElement &&
          currentElement.nodeType !== Node.ELEMENT_NODE
        ) {
          currentElement = currentElement.parentNode!;
        }
      }

      if (currentElement && currentElement instanceof HTMLElement) {
        Object.values(formatClassMap).forEach((cls) =>
          currentElement.classList.remove(cls)
        );
        currentElement.classList.add(formatClassMap[formatType]);

        const newRange = document.createRange();
        newRange.selectNodeContents(currentElement);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
        handleInput();
      }
    };

    // Helper to check if a node is a "character" format (should stay with following dialogue)
    const isCharacterNode = (node: Element) => {
      return node.classList.contains(formatClassMap["character"]);
    };

    // Helper to check if a node is dialogue/parenthetical (should stay with character)
    const isDialogueOrParenthetical = (node: Element) => {
      return (
        node.classList.contains(formatClassMap["dialogue"]) ||
        node.classList.contains(formatClassMap["parenthetical"])
      );
    };

    const repaginate = useCallback(() => {
      if (!containerRef.current) return;

      const nodes = getAllContentNodes();
      if (nodes.length === 0) return;

      const bodies = Array.from(
        containerRef.current.querySelectorAll(".screenplay-sheet__body")
      ) as HTMLElement[];

      if (bodies.length === 0) return;

      let currentBodyIndex = 0;
      let currentBody = bodies[currentBodyIndex];
      let currentHeight = 0;

      const allNodes = [...nodes];

      bodies.forEach((b) => (b.innerHTML = ""));

      currentBody = bodies[0];
      currentHeight = 0;
      currentBodyIndex = 0;

      let nodesBuffer: Element[] = [];

      // Get group of related nodes (character + dialogue/parenthetical)
      const getRelatedGroup = (startIndex: number): Element[] => {
        const group: Element[] = [allNodes[startIndex]];

        // If this is a character, include following dialogue/parenthetical
        if (isCharacterNode(allNodes[startIndex])) {
          for (let j = startIndex + 1; j < allNodes.length; j++) {
            if (isDialogueOrParenthetical(allNodes[j])) {
              group.push(allNodes[j]);
              // Only keep first dialogue block with character
              if (allNodes[j].classList.contains(formatClassMap["dialogue"])) {
                break;
              }
            } else {
              break;
            }
          }
        }
        return group;
      };

      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i] as HTMLElement;

        // Check if this is a character node - we need to keep it with its dialogue
        if (isCharacterNode(node)) {
          const group = getRelatedGroup(i);
          let groupHeight = 0;

          // Calculate total height of the group
          group.forEach((n) => {
            currentBody.appendChild(n);
            groupHeight +=
              (n as HTMLElement).offsetHeight +
              parseInt(window.getComputedStyle(n).marginTop || "0") +
              parseInt(window.getComputedStyle(n).marginBottom || "0");
          });

          // Remove them temporarily
          group.forEach((n) => currentBody.removeChild(n));

          // Check if group fits on current page
          if (
            currentHeight + groupHeight > CONTENT_HEIGHT_PX - 20 &&
            currentHeight > 0
          ) {
            // Move entire group to next page
            currentBodyIndex++;
            if (currentBodyIndex >= bodies.length) {
              nodesBuffer = allNodes.slice(i);
              break;
            }
            currentBody = bodies[currentBodyIndex];
            currentHeight = 0;
          }

          // Add the group
          group.forEach((n) => {
            currentBody.appendChild(n);
            currentHeight +=
              (n as HTMLElement).offsetHeight +
              parseInt(window.getComputedStyle(n).marginTop || "0") +
              parseInt(window.getComputedStyle(n).marginBottom || "0");
          });

          // Skip the nodes we already processed
          i += group.length - 1;
          continue;
        }

        // Regular node handling
        currentBody.appendChild(node);

        const nodeHeight =
          node.offsetHeight +
          parseInt(window.getComputedStyle(node).marginTop || "0") +
          parseInt(window.getComputedStyle(node).marginBottom || "0");

        if (currentHeight + nodeHeight > CONTENT_HEIGHT_PX - 20) {
          if (currentHeight > 0) {
            currentBody.removeChild(node);

            currentBodyIndex++;
            if (currentBodyIndex >= bodies.length) {
              nodesBuffer = allNodes.slice(i);
              break;
            }

            currentBody = bodies[currentBodyIndex];
            currentBody.appendChild(node);
            currentHeight = nodeHeight;
          } else {
            currentHeight += nodeHeight;
          }
        } else {
          currentHeight += nodeHeight;
        }
      }

      if (nodesBuffer.length > 0) {
        setPages((prev) => [
          ...prev,
          ...Array.from({ length: 1 }, (_, k) => prev.length + 1 + k),
        ]);
        nodesBuffer.forEach((n) => currentBody.appendChild(n));
      }
    }, [getAllContentNodes]);

    const handleInput = useCallback(() => {
      onContentChange();
      requestAnimationFrame(repaginate);

      if (containerRef.current) {
        const allText = getAllContentNodes()
          .map((n) => (n as HTMLElement).innerText)
          .join("\n");
        const words = allText.trim().split(/\s+/).filter(Boolean).length;
        const characters = allText.length;
        const scenes = containerRef.current.querySelectorAll(
          ".format-scene-header-1"
        ).length;
        onStatsChange({ words, characters, pages: pages.length, scenes });
      }

      const format = getCurrentFormat();
      onFormatChange(format);
    }, [
      onContentChange,
      onStatsChange,
      onFormatChange,
      getAllContentNodes,
      pages.length,
      repaginate,
    ]);

    const applyCommandSnapshot = useCallback(
      (snapshot: EditorCommandSnapshot) => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;

        const mergedHtml = snapshot.htmlByBody.join("");
        bodies.forEach((body, index) => {
          body.innerHTML = index === 0 ? mergedHtml : "";
        });
        ensureDocumentHasAtLeastOneLine();
        repaginate();
        handleInput();

        requestAnimationFrame(() => {
          if (!restoreSerializedSelection(snapshot.selection)) {
            focusEditorEnd();
          }
        });
      },
      [
        ensureDocumentHasAtLeastOneLine,
        focusEditorEnd,
        getAllBodies,
        handleInput,
        repaginate,
        restoreSerializedSelection,
      ]
    );

    const memoryManager = useMemo(() => new ContextMemoryManager(), []);
    const hybridClassifier = useMemo(() => {
      const hc = new HybridClassifier(memoryManager);
      hc.initialize();
      return hc;
    }, [memoryManager]);
    const feedbackCollector = useMemo(() => new FeedbackCollector(), []);

    const [pendingConfirmations, setPendingConfirmations] = useState<
      Array<{ pasteBatchId: string; count: number }>
    >([]);

    // حالة حوار تأكيد التصنيف
    const [confirmationState, setConfirmationState] = useState<{
      open: boolean;
      line: string;
      suggestedType: string;
      confidence: number;
      resolve: ((type: string) => void) | null;
    }>({
      open: false,
      line: "",
      suggestedType: "action",
      confidence: 0,
      resolve: null,
    });

    const handleConfirmClassification = (finalType: string) => {
      if (confirmationState.resolve) {
        confirmationState.resolve(finalType);
      }
      setConfirmationState((prev) => ({ ...prev, open: false, resolve: null }));
    };

    const handleCancelConfirmation = () => {
      if (confirmationState.resolve) {
        confirmationState.resolve(confirmationState.suggestedType);
      }
      setConfirmationState((prev) => ({ ...prev, open: false, resolve: null }));
    };

    const virtualEditorRef = useMemo(
      () => ({
        current: {
          get lastChild() {
            if (!containerRef.current) return null;
            const bodies = containerRef.current.querySelectorAll(
              ".screenplay-sheet__body"
            );
            if (bodies.length === 0) return null;
            return bodies[bodies.length - 1].lastChild;
          },
        } as unknown as HTMLDivElement,
      }),
      []
    );

    // Callback لطلب تأكيد المستخدم عند الثقة المنخفضة
    const requestConfirmation = useCallback(
      (
        line: string,
        suggestedType: string,
        confidence: number
      ): Promise<string> => {
        return new Promise((resolve) => {
          setConfirmationState({
            open: true,
            line,
            suggestedType,
            confidence,
            resolve,
          });
        });
      },
      []
    );

    const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      await pasteFromDataTransfer(e.clipboardData, "native");
    };

    const importViaPastePipeline = useCallback(
      async (text: string, importSource: "clipboard" | "file-import") => {
        const pseudoPasteEvent = {
          preventDefault: () => {},
          clipboardData: {
            getData: (format: string) => (format === "text/plain" ? text : ""),
          },
        } as unknown as React.ClipboardEvent<HTMLDivElement>;

        await newHandlePaste(
          pseudoPasteEvent,
          virtualEditorRef,
          (formatType) => getFormatStyles(formatType, fixedSize, fixedFont),
          handleInput,
          memoryManager,
          undefined,
          hybridClassifier,
          feedbackCollector,
          requestConfirmation,
          (pasteBatchId, pendingCount) => {
            setPendingConfirmations((prev) => [
              ...prev,
              { pasteBatchId, count: pendingCount },
            ]);
          },
          null,
          null,
          null,
          importSource
        );
      },
      [
        virtualEditorRef,
        fixedSize,
        fixedFont,
        handleInput,
        memoryManager,
          hybridClassifier,
          feedbackCollector,
          requestConfirmation,
          setPendingConfirmations,
        ]
    );

    const executeCommandWithHistory = useCallback(
      async (operation: () => Promise<void>) => {
        const before = captureCommandSnapshot();
        await operation();
        const after = captureCommandSnapshot();
        commitCommandEntry(before, after);
      },
      [captureCommandSnapshot, commitCommandEntry]
    );

    const ensureSelectionReadyForPaste = useCallback(() => {
      const activeRange = getSelectionRangeInsideEditor();
      if (activeRange) return;
      focusEditorEnd();
    }, [focusEditorEnd, getSelectionRangeInsideEditor]);

    const clearDocumentForReplacePaste = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      bodies.forEach((body) => {
        body.innerHTML = "";
      });

      const firstBody = bodies[0];
      firstBody.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(firstBody);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const applyStructuredBlocks = useCallback(
      async (blocks: ScreenplayBlock[], mode: FileImportMode) => {
        const html = screenplayBlocksToHtml(blocks);

        await executeCommandWithHistory(async () => {
          if (mode === "replace") {
            const bodies = getAllBodies();
            if (bodies.length === 0) return;
            bodies.forEach((body) => {
              body.innerHTML = "";
            });
            bodies[0].innerHTML =
              html.trim().length > 0
                ? html
                : '<div class="format-action"><br></div>';
            ensureDocumentHasAtLeastOneLine();
            repaginate();
            handleInput();
            focusEditorEnd();
            return;
          }

          ensureSelectionReadyForPaste();
          let insertedWithNativeUndo = false;
          if (typeof document.execCommand === "function") {
            try {
              insertedWithNativeUndo = document.execCommand(
                "insertHTML",
                false,
                html
              );
            } catch {
              insertedWithNativeUndo = false;
            }
          }
          if (!insertedWithNativeUndo) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();

              const tempContainer = document.createElement("div");
              tempContainer.innerHTML = html;
              const fragment = document.createDocumentFragment();
              while (tempContainer.firstChild) {
                fragment.appendChild(tempContainer.firstChild);
              }
              range.insertNode(fragment);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
          ensureDocumentHasAtLeastOneLine();
          repaginate();
          handleInput();
        });

        syntheticSelectAllRef.current = false;
      },
      [
        ensureDocumentHasAtLeastOneLine,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        focusEditorEnd,
        getAllBodies,
        handleInput,
        repaginate,
      ]
    );

    const pastePlainTextWithClassifier = useCallback(
      async (text: string) => {
        const normalized = (text ?? "").replace(/\r\n/g, "\n");
        if (!normalized.trim()) return;

        await executeCommandWithHistory(async () => {
          if (syntheticSelectAllRef.current) {
            clearAllEditorBodies();
            clearDocumentForReplacePaste();
          } else {
            ensureSelectionReadyForPaste();
          }
          await importViaPastePipeline(normalized, "clipboard");
        });
        syntheticSelectAllRef.current = false;
      },
      [
        clearAllEditorBodies,
        clearDocumentForReplacePaste,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        importViaPastePipeline,
      ]
    );

    const pasteFromCandidate = useCallback(
      async (
        candidate: {
          plainText: string;
          htmlText: string;
          filmlanePayloadRaw: string;
        },
        origin: ClipboardOrigin
      ): Promise<boolean> => {
        ensureSelectionReadyForPaste();

        const customPayload = parseClipboardPayload(candidate.filmlanePayloadRaw);
        if (customPayload?.blocks && customPayload.blocks.length > 0) {
          logger.info("paste_path=filmlane-rich", {
            component: "EditorClipboard",
            data: {
              origin,
              selectionScope: detectSelectionScope(),
            },
          });
          await applyStructuredBlocks(
            customPayload.blocks,
            syntheticSelectAllRef.current ? "replace" : "insert"
          );
          return true;
        }

        if (isLikelyFilmlaneHtml(candidate.htmlText)) {
          const htmlBlocks = normalizeClipboardBlocks(
            htmlToScreenplayBlocks(candidate.htmlText)
          );
          if (htmlBlocks.length > 0) {
            logger.info("paste_path=filmlane-rich", {
              component: "EditorClipboard",
              data: {
                origin,
                selectionScope: detectSelectionScope(),
              },
            });
            await applyStructuredBlocks(
              htmlBlocks,
              syntheticSelectAllRef.current ? "replace" : "insert"
            );
            return true;
          }
        }

        const fallbackText =
          candidate.plainText.trim() || extractTextFromHtml(candidate.htmlText);
        if (!fallbackText.trim()) {
          return false;
        }

        logger.info("paste_path=plain-classifier", {
          component: "EditorClipboard",
          data: {
            origin,
            selectionScope: detectSelectionScope(),
          },
        });
        await pastePlainTextWithClassifier(fallbackText);
        return true;
      },
      [
        ensureSelectionReadyForPaste,
        extractTextFromHtml,
        applyStructuredBlocks,
        isLikelyFilmlaneHtml,
        normalizeClipboardBlocks,
        parseClipboardPayload,
        pastePlainTextWithClassifier,
        detectSelectionScope,
      ]
    );

    const pasteFromDataTransfer = useCallback(
      async (clipboardData: DataTransfer, origin: ClipboardOrigin): Promise<boolean> => {
        return pasteFromCandidate(
          {
            plainText: clipboardData.getData("text/plain") || "",
            htmlText: clipboardData.getData("text/html") || "",
            filmlanePayloadRaw: clipboardData.getData(FILMLANE_CLIPBOARD_MIME) || "",
          },
          origin
        );
      },
      [pasteFromCandidate]
    );

    const pasteFromClipboard = useCallback(
      async (origin: ClipboardOrigin): Promise<boolean> => {
        try {
          if (navigator.clipboard?.read) {
            const clipboardItems = await navigator.clipboard.read();
            let plainText = "";
            let htmlText = "";
            let filmlanePayloadRaw = "";

            for (const item of clipboardItems) {
              if (!plainText && item.types.includes("text/plain")) {
                plainText = await (await item.getType("text/plain")).text();
              }
              if (!htmlText && item.types.includes("text/html")) {
                htmlText = await (await item.getType("text/html")).text();
              }
              if (!filmlanePayloadRaw && item.types.includes(FILMLANE_CLIPBOARD_MIME)) {
                filmlanePayloadRaw = await (
                  await item.getType(FILMLANE_CLIPBOARD_MIME)
                ).text();
              }
            }

            if (!plainText && !htmlText && !filmlanePayloadRaw) {
              const cachedPayload = lastInternalClipboardRef.current;
              if (cachedPayload) {
                filmlanePayloadRaw = JSON.stringify(cachedPayload);
              }
            }

            return pasteFromCandidate(
              { plainText, htmlText, filmlanePayloadRaw },
              origin
            );
          }
        } catch {
          // fall through to readText fallback
        }

        try {
          const plainText = await navigator.clipboard.readText();
          if (!plainText.trim()) {
            const cachedPayload = lastInternalClipboardRef.current;
            if (!cachedPayload) return false;
            return pasteFromCandidate(
              {
                plainText: cachedPayload.plainText,
                htmlText: cachedPayload.html ?? "",
                filmlanePayloadRaw: JSON.stringify(cachedPayload),
              },
              origin
            );
          }
          return pasteFromCandidate(
            { plainText, htmlText: "", filmlanePayloadRaw: "" },
            origin
          );
        } catch {
          const cachedPayload = lastInternalClipboardRef.current;
          if (!cachedPayload) return false;
          return pasteFromCandidate(
            {
              plainText: cachedPayload.plainText,
              htmlText: cachedPayload.html ?? "",
              filmlanePayloadRaw: JSON.stringify(cachedPayload),
            },
            origin
          );
        }
      },
      [pasteFromCandidate]
    );

    const hasSelection = useCallback((): boolean => {
      if (syntheticSelectAllRef.current) {
        return getAllContentNodes().length > 0;
      }
      const activeRange = getSelectionRangeInsideEditor();
      return Boolean(activeRange && !activeRange.collapsed);
    }, [getAllContentNodes, getSelectionRangeInsideEditor]);

    const copySelectionToClipboard = useCallback(async (): Promise<boolean> => {
      const payload = buildClipboardPayloadFromSelection();
      if (!payload) return false;
      return writeClipboardPayload(payload);
    }, [
      buildClipboardPayloadFromSelection,
      writeClipboardPayload,
    ]);

    const deleteSelectionContent = useCallback(async (): Promise<boolean> => {
      if (syntheticSelectAllRef.current) {
        await executeCommandWithHistory(async () => {
          clearAllEditorBodies();
          repaginate();
          handleInput();
        });
        syntheticSelectAllRef.current = false;
        return true;
      }

      const activeRange = getSelectionRangeInsideEditor();
      if (!activeRange || activeRange.collapsed) return false;

      const rangeToDelete = activeRange.cloneRange();
      await executeCommandWithHistory(async () => {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(rangeToDelete);
        }

        rangeToDelete.deleteContents();
        rangeToDelete.collapse(true);

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(rangeToDelete);
        }

        normalizeBodiesAfterDelete();
        ensureDocumentHasAtLeastOneLine();
        repaginate();
        handleInput();
      });

      syntheticSelectAllRef.current = false;
      return true;
    }, [
      clearAllEditorBodies,
      ensureDocumentHasAtLeastOneLine,
      executeCommandWithHistory,
      getSelectionRangeInsideEditor,
      handleInput,
      normalizeBodiesAfterDelete,
      repaginate,
    ]);

    const cutSelectionToClipboard = useCallback(async (): Promise<boolean> => {
      const payload = buildClipboardPayloadFromSelection();
      if (!payload) return false;

      const copied = await writeClipboardPayload(payload);
      if (!copied) return false;

      return deleteSelectionContent();
    }, [
      buildClipboardPayloadFromSelection,
      deleteSelectionContent,
      writeClipboardPayload,
    ]);

    const undoCommandOperation = useCallback((): boolean => {
      const history = commandHistoryRef.current;
      const entry = history.undo.pop();
      if (!entry) return false;

      history.redo.push(entry);
      history.applying = true;
      try {
        applyCommandSnapshot(entry.before);
      } finally {
        history.applying = false;
      }
      syntheticSelectAllRef.current = false;
      return true;
    }, [applyCommandSnapshot]);

    const redoCommandOperation = useCallback((): boolean => {
      const history = commandHistoryRef.current;
      const entry = history.redo.pop();
      if (!entry) return false;

      history.undo.push(entry);
      history.applying = true;
      try {
        applyCommandSnapshot(entry.after);
      } finally {
        history.applying = false;
      }
      syntheticSelectAllRef.current = false;
      return true;
    }, [applyCommandSnapshot]);

    const findFirstContentNode = useCallback(
      (root: HTMLElement): Node | null => {
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return (node.textContent || "").length > 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP;
              }

              if (
                node.nodeType === Node.ELEMENT_NODE &&
                (node as HTMLElement).tagName === "BR"
              ) {
                return NodeFilter.FILTER_ACCEPT;
              }

              return NodeFilter.FILTER_SKIP;
            },
          }
        );
        return walker.nextNode();
      },
      []
    );

    const findLastContentNode = useCallback(
      (root: HTMLElement): Node | null => {
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return (node.textContent || "").length > 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP;
              }

              if (
                node.nodeType === Node.ELEMENT_NODE &&
                (node as HTMLElement).tagName === "BR"
              ) {
                return NodeFilter.FILTER_ACCEPT;
              }

              return NodeFilter.FILTER_SKIP;
            },
          }
        );

        let current = walker.nextNode();
        let last: Node | null = null;
        while (current) {
          last = current;
          current = walker.nextNode();
        }

        return last;
      },
      []
    );

    const selectAllContent = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      const firstBodyWithContent =
        bodies.find((body) => (findFirstContentNode(body) ?? null) !== null) ??
        bodies[0];
      const lastBodyWithContent =
        [...bodies]
          .reverse()
          .find((body) => (findLastContentNode(body) ?? null) !== null) ??
        bodies[bodies.length - 1];

      const startNode =
        findFirstContentNode(firstBodyWithContent) ?? firstBodyWithContent;
      const endNode =
        findLastContentNode(lastBodyWithContent) ?? lastBodyWithContent;

      const selection = window.getSelection();
      if (!selection) return;

      const range = document.createRange();
      range.setStart(startNode, 0);
      range.setEnd(
        endNode,
        clampSelectionOffset(endNode, Number.MAX_SAFE_INTEGER)
      );
      selection.removeAllRanges();
      selection.addRange(range);
      syntheticSelectAllRef.current = true;
    }, [
      clampSelectionOffset,
      findFirstContentNode,
      findLastContentNode,
      getAllBodies,
    ]);

    // --- Import Logic ---
    const importClassifiedText = useCallback(
      async (text: string, mode: FileImportMode) => {
        await executeCommandWithHistory(async () => {
          if (mode === "replace") {
            clearDocumentForReplacePaste();
            repaginate();
          } else {
            ensureSelectionReadyForPaste();
          }

          await importViaPastePipeline(text, "file-import");
        });
        syntheticSelectAllRef.current = false;
      },
      [
        clearDocumentForReplacePaste,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        importViaPastePipeline,
        repaginate,
      ]
    );

    const importStructuredBlocks = useCallback(
      async (blocks: ScreenplayBlock[], mode: FileImportMode) => {
        await applyStructuredBlocks(blocks, mode);
      },
      [applyStructuredBlocks]
    );

    // Expose importer
    useEffect(() => {
      if (onImporterReady) {
        onImporterReady(importClassifiedText);
      }
    }, [onImporterReady, importClassifiedText]);

    const handleRunPendingConfirmations = useCallback(async () => {
      if (pendingConfirmations.length === 0) return;
      const batches = [...pendingConfirmations];
      setPendingConfirmations([]);
      for (const batch of batches) {
        await runPendingPasteConfirmations(batch.pasteBatchId);
      }
    }, [pendingConfirmations]);

    const handleCopyEvent = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        const payload = buildClipboardPayloadFromSelection();
        if (!payload) return;

        if (e.clipboardData) {
          e.preventDefault();
          setClipboardDataFromPayload(e.clipboardData, payload);
          lastInternalClipboardRef.current = payload;
        }
      },
      [buildClipboardPayloadFromSelection, setClipboardDataFromPayload]
    );

    const handleCut = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        const payload = buildClipboardPayloadFromSelection();
        if (!payload) return;

        e.preventDefault();
        if (e.clipboardData) {
          setClipboardDataFromPayload(e.clipboardData, payload);
          lastInternalClipboardRef.current = payload;
          void deleteSelectionContent();
          return;
        }

        void (async () => {
          const copied = await writeClipboardPayload(payload);
          if (!copied) return;
          await deleteSelectionContent();
        })();
      },
      [
        buildClipboardPayloadFromSelection,
        deleteSelectionContent,
        setClipboardDataFromPayload,
        writeClipboardPayload,
      ]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeRange = getSelectionRangeInsideEditor();
        const hasActiveSelection =
          syntheticSelectAllRef.current || Boolean(activeRange && !activeRange.collapsed);

        if (hasActiveSelection) {
          e.preventDefault();
          void deleteSelectionContent();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const currentFormat = getCurrentFormat();
        const nextFormat = getNextFormatOnEnter(currentFormat);

        document.execCommand("insertParagraph");

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          let parentElement = range.startContainer.parentElement;

          if (parentElement && parentElement.tagName !== "DIV") {
            parentElement = parentElement.parentElement;
          }

          if (parentElement && parentElement.tagName === "DIV") {
            Object.values(formatClassMap).forEach((cls) =>
              parentElement.classList.remove(cls)
            );
            parentElement.classList.add(formatClassMap[nextFormat]);

            range.selectNodeContents(parentElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        handleInput();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const currentFormat = getCurrentFormat();
        const isEmpty = isCurrentElementEmpty();
        const nextFormat = getNextFormatOnTab(
          currentFormat,
          isEmpty,
          e.shiftKey
        );
        if (nextFormat !== currentFormat) {
          applyFormatToCurrentLine(nextFormat);
        }
        return;
      }

      // Use formatShortcutMap from constants instead of inline map
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (formatShortcutMap[key]) {
          e.preventDefault();
          applyFormatToCurrentLine(formatShortcutMap[key]);
        }
      }
    };

    useEffect(() => {
      repaginate();
    }, [pages.length, repaginate]);

    useImperativeHandle(ref, () => ({
      insertContent: (
        content: string,
        mode: "insert" | "replace" = "insert"
      ) => {
        if (mode === "replace") {
          if (containerRef.current) {
            const bodies = containerRef.current.querySelectorAll(
              ".screenplay-sheet__body"
            );
            bodies.forEach((b) => (b.innerHTML = ""));
            if (bodies[0]) {
              bodies[0].innerHTML = content;
              repaginate();
              handleInput();
            }
          }
        } else {
          document.execCommand("insertHTML", false, content);
          handleInput();
        }
      },
      getElement: () => containerRef.current,
      getAllText: () => {
        const nodes = getAllContentNodes();
        return nodes.map((n) => (n as HTMLElement).innerText).join("\n");
      },
      getAllHtml: () => {
        const bodies = getAllBodies();
        return bodies
          .map((body) => body.innerHTML.trim())
          .filter((content) => content.length > 0 && content !== "<br>")
          .join("");
      },
      hasSelection,
      copySelectionToClipboard,
      cutSelectionToClipboard,
      pasteFromClipboard,
      pasteFromDataTransfer,
      pastePlainTextWithClassifier,
      undoCommandOperation,
      redoCommandOperation,
      selectAllContent,
      focusEditor: () => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;
        const target = bodies[bodies.length - 1];
        target.focus();
      },
      importClassifiedText,
      importStructuredBlocks,
      exportStructuredBlocks: extractBlocksFromEditorBodies,
    }));

    return (
      <div className="screenplay-container" ref={containerRef}>
        {pendingConfirmations.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-white/10 bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 transition-colors hover:bg-neutral-800"
              onClick={handleRunPendingConfirmations}
            >
              تأكيد التصنيفات (
              {pendingConfirmations.reduce((sum, x) => sum + x.count, 0)})
            </button>
          </div>
        )}
        <ClassificationConfirmationDialog
          open={confirmationState.open}
          line={confirmationState.line}
          suggestedType={confirmationState.suggestedType}
          confidence={confirmationState.confidence}
          onConfirm={handleConfirmClassification}
          onCancel={handleCancelConfirmation}
        />
        {pages.map((pageId, index) => (
          <div
            key={pageId}
            className="screenplay-sheet"
            style={{
              borderRadius: "1.5rem",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="screenplay-sheet__header">
              {/* Optional content for header */}
            </div>

            <div
              className="screenplay-sheet__body"
              contentEditable={true}
              suppressContentEditableWarning={true}
              onInput={handleInput}
              onPaste={handlePaste}
              onCopy={handleCopyEvent}
              onCut={handleCut}
              onKeyDown={handleKeyDown}
            />

            <div className="screenplay-sheet__footer">
              <div className="screenplay-page-number">{index + 1}.</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
);

EditorArea.displayName = "EditorArea";
