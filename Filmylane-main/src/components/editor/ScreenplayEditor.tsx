"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  IconInfoCircle,
  IconList,
  IconAlignLeft,
  IconAlignRight,
  IconAlignCenter,
  IconItalic,
  IconBold,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceFloppy,
  IconUpload,
  IconHistory,
  IconMessage,
  IconBulb,
  IconStethoscope,
  IconDownload,
  IconMovie,
  IconChevronDown,
  IconFileText,
  IconSettings,
  IconSearch,
  IconUser,
  IconSparkles,
  IconFilePlus,
  IconFolderOpen,
  IconCopy,
  IconClipboard,
  IconScissors,
  IconSelect,
  IconWand,
  IconFileExport,
  IconPrinter,
  IconKeyboard,
  IconHelp,
} from "@tabler/icons-react";
import {
  applyPhotoMontageToSceneHeaderLine,
  buildFileOpenPipelineAction,
  cn,
  EDITOR_STYLE_FORMAT_IDS,
  exportToDocx,
  exportToPDF,
  logger,
  type EditorStyleFormatId,
} from "@/utils";
import {
  ACCEPTED_FILE_EXTENSIONS,
  type FileExtractionResponse,
} from "@/types/file-import";
import { motion, AnimatePresence } from "motion/react";
import { insertMenuDefinitions, screenplayFormats } from "@/constants";
import { EditorArea, EditorHandle } from "./EditorArea";
import { EditorFooter } from "./EditorFooter";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { useToast } from "@/hooks/use-toast";
import type { DocumentStats } from "@/types/screenplay";
import type { ClipboardOrigin } from "@/types/editor-clipboard";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// --- Dock Icon Component ---
function DockIcon({
  icon: Icon,
  onClick,
  onMouseDown,
  active = false,
}: {
  icon: React.ElementType;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
}) {
  return (
    <div className="relative z-10 flex h-10 w-10 items-center justify-center">
      <HoverBorderGradient
        as="button"
        onClick={onClick}
        onMouseDown={onMouseDown}
        containerClassName="h-full w-full rounded-full"
        className={cn(
          "flex h-full w-full items-center justify-center p-0 transition-all duration-200",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-neutral-900/90 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        )}
      >
        <Icon size={20} stroke={1.5} />
      </HoverBorderGradient>
      {active && (
        <div className="absolute -bottom-2 h-1 w-1 rounded-full bg-primary blur-[1px]" />
      )}
    </div>
  );
}

// --- Background Grid Component ---
const BackgroundGrid = () => (
  <div className="pointer-events-none fixed inset-0 z-0">
    <div className="absolute inset-0 bg-neutral-950 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
    <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary opacity-20 blur-[100px]"></div>
    <div className="absolute bottom-0 right-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-accent opacity-20 blur-[100px]"></div>
  </div>
);

// --- Sidebar Item Component ---
const SidebarItem = ({
  icon: Icon,
  label,
  active = false,
  items = [],
  isOpen = false,
  onToggle,
  onItemClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  items?: string[];
  isOpen?: boolean;
  onToggle?: () => void;
  onItemClick?: (item: string) => void;
}) => (
  <div className="mb-2">
    <HoverBorderGradient
      as="button"
      onClick={onToggle}
      containerClassName="w-full rounded-xl"
      className={cn(
        "flex w-full items-center gap-3 bg-neutral-900/50 p-3 transition-all duration-200",
        active ? "text-white" : "text-neutral-500 hover:text-neutral-200"
      )}
      duration={1}
    >
      <Icon size={20} stroke={1.5} />
      <span className="flex-1 text-right text-sm font-medium">{label}</span>
      {items.length > 0 && (
        <IconChevronDown
          size={14}
          className={cn(
            "text-neutral-600 transition-transform duration-300",
            isOpen ? "rotate-0" : "rotate-90"
          )}
        />
      )}
    </HoverBorderGradient>

    <AnimatePresence>
      {isOpen && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 8 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          className="overflow-hidden pr-4"
        >
          {items.map((subItem, idx) => (
            <motion.div
              key={idx}
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => onItemClick?.(subItem)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <div className="h-1 w-1 rounded-full bg-neutral-600" />
              {subItem}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

type MenuActionId =
  | "new-file"
  | "open-file"
  | "insert-file"
  | "save-file"
  | "save-as-file"
  | "print-file"
  | "export-pdf"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "select-all"
  | "bold"
  | "italic"
  | "align-right"
  | "align-center"
  | "align-left"
  | "spell-check"
  | "script-analysis"
  | "ai-suggestions"
  | "show-help"
  | "about"
  | `insert-format:${EditorStyleFormatId}`;

type CommandOrigin = Exclude<ClipboardOrigin, "native">;

const INSERT_ACTION_PREFIX = "insert-format:" as const;
const INSERT_FORMAT_SET = new Set<string>(EDITOR_STYLE_FORMAT_IDS);

const toInsertActionId = (
  formatId: EditorStyleFormatId
): `insert-format:${EditorStyleFormatId}` =>
  `${INSERT_ACTION_PREFIX}${formatId}`;

const parseInsertActionId = (actionId: string): EditorStyleFormatId | null => {
  if (!actionId.startsWith(INSERT_ACTION_PREFIX)) return null;
  const rawId = actionId.slice(INSERT_ACTION_PREFIX.length);
  if (!INSERT_FORMAT_SET.has(rawId)) return null;
  return rawId as EditorStyleFormatId;
};

export const ScreenplayEditor = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [openSidebarItem, setOpenSidebarItem] = useState<string | null>(null);
  const [currentFormat, setCurrentFormat] = useState("action");
  const [stats, setStats] = useState<DocumentStats>({
    words: 0,
    characters: 0,
    pages: 1,
    scenes: 0,
  });

  const editorRef = useRef<EditorHandle>(null);
  const preservedSelectionRef = useRef<Range | null>(null);
  const shortcutActionRef = useRef<
    (actionId: MenuActionId, origin?: CommandOrigin) => void
  >(() => {});
  const { toast } = useToast();

  const toggleMenu = (id: string) => {
    setActiveMenu(activeMenu === id ? null : id);
  };

  const handleContentChange = useCallback(() => {}, []);
  const handleStatsChange = useCallback(
    (newStats: DocumentStats) => setStats(newStats),
    []
  );
  const handleFormatChange = useCallback(
    (format: string) => setCurrentFormat(format),
    []
  );

  const ensureDocxFilename = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return "";
    const sanitizedBase = trimmedName.replace(/[<>:"/\\|?*]+/g, "_");
    if (!sanitizedBase.toLowerCase().endsWith(".docx")) {
      return `${sanitizedBase}.docx`;
    }
    return sanitizedBase;
  }, []);

  const getEditorContentForExport = useCallback(() => {
    const htmlContent = editorRef.current?.getAllHtml() ?? "";
    if (!htmlContent.trim()) {
      toast({
        title: "خطأ",
        description: "لا يوجد محتوى للحفظ أو الطباعة. اكتب شيئاً أولاً.",
        variant: "destructive",
      });
      return null;
    }
    return htmlContent;
  }, [toast]);

  const getEditorBlocksForExport = useCallback(() => {
    const blocks = editorRef.current?.exportStructuredBlocks() ?? [];
    if (blocks.length === 0) {
      toast({
        title: "خطأ",
        description: "لا يوجد محتوى للحفظ أو الطباعة. اكتب شيئاً أولاً.",
        variant: "destructive",
      });
      return null;
    }
    return blocks;
  }, [toast]);

  const captureEditorSelection = useCallback(() => {
    const editorElement = editorRef.current?.getElement();
    const selection = window.getSelection();
    if (!editorElement || !selection || selection.rangeCount === 0) {
      preservedSelectionRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorElement.contains(range.commonAncestorContainer)) {
      preservedSelectionRef.current = null;
      return;
    }

    preservedSelectionRef.current = range.cloneRange();
  }, []);

  const isSelectionInsideEditor = useCallback(() => {
    const editorElement = editorRef.current?.getElement();
    const selection = window.getSelection();
    if (!editorElement || !selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return editorElement.contains(range.commonAncestorContainer);
  }, []);

  const restoreEditorSelection = useCallback(() => {
    const editorElement = editorRef.current?.getElement();
    const savedRange = preservedSelectionRef.current;
    const selection = window.getSelection();

    if (!editorElement || !savedRange || !selection) {
      return false;
    }

    try {
      if (!editorElement.contains(savedRange.commonAncestorContainer)) {
        return false;
      }
      selection.removeAllRanges();
      selection.addRange(savedRange.cloneRange());
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      captureEditorSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [captureEditorSelection]);

  const ensureEditorFocus = useCallback(() => {
    if (isSelectionInsideEditor()) return true;
    if (restoreEditorSelection()) return true;
    editorRef.current?.focusEditor();
    captureEditorSelection();
    return true;
  }, [captureEditorSelection, isSelectionInsideEditor, restoreEditorSelection]);

  const getCurrentEditorLineElement = useCallback((): HTMLDivElement | null => {
    const editorElement = editorRef.current?.getElement();
    const selection = window.getSelection();
    if (!editorElement || !selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!editorElement.contains(range.startContainer)) {
      return null;
    }

    const node: Node | null = range.startContainer;
    let element: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;

    while (element && element !== editorElement) {
      if (
        element.tagName === "DIV" &&
        element.parentElement?.classList.contains("screenplay-sheet__body")
      ) {
        return element as HTMLDivElement;
      }
      element = element.parentElement;
    }

    return null;
  }, []);

  const placeCursorAtEndOfNode = useCallback((element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const notifyEditorInput = useCallback((lineElement: HTMLElement) => {
    const body = lineElement.closest(".screenplay-sheet__body");
    if (!body) return;
    body.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const executeEditorCommand = useCallback(
    (command: string, value?: string) => {
      ensureEditorFocus();
      document.execCommand(command, false, value);
      captureEditorSelection();
    },
    [captureEditorSelection, ensureEditorFocus]
  );

  const hasNonCollapsedSelectionInEditor = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!range.collapsed && isSelectionInsideEditor()) {
      return true;
    }
    const savedRange = preservedSelectionRef.current;
    return Boolean(savedRange && !savedRange.collapsed);
  }, [isSelectionInsideEditor]);

  const handlePreserveSelectionMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      captureEditorSelection();
    },
    [captureEditorSelection]
  );

  // ============ FILE OPERATIONS ============
  const handleNewFile = () => {
    if (
      confirm("هل تريد إنشاء مستند جديد؟ سيتم فقدان التغييرات غير المحفوظة.")
    ) {
      editorRef.current?.insertContent(
        '<div class="format-action"><br></div>',
        "replace"
      );
      toast({ title: "مستند جديد", description: "تم إنشاء مستند جديد بنجاح" });
    }
    setActiveMenu(null);
  };

  /**
   * فتح ملف واستيراده عبر مسار paste 1:1 (يستبدل المحتوى بالكامل)
   */
  const handleOpenFile = async () => {
    await importFileViaPipeline("replace");
    setActiveMenu(null);
  };

  /**
   * إدراج ملف عند موضع المؤشر عبر مسار paste 1:1
   */
  const handleInsertFile = async () => {
    await importFileViaPipeline("insert");
    setActiveMenu(null);
  };

  /**
   * مسار مشترك: اختيار ملف → استخراج النص → تمريره عبر paste 1:1
   */
  const importFileViaPipeline = async (mode: "replace" | "insert") => {
    const file = await pickFile(ACCEPTED_FILE_EXTENSIONS);
    if (!file) return;

    toast({
      title: "جاري الاستخراج",
      description: `جاري قراءة الملف: ${file.name}...`,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/files/extract", {
        method: "POST",
        body: formData,
      });

      let result: FileExtractionResponse | null = null;
      let fallbackResponseText = "";

      try {
        result = (await response.json()) as FileExtractionResponse;
      } catch {
        fallbackResponseText = await response.text().catch(() => "");
      }

      if (!response.ok || !result?.success || !result.data) {
        const statusLabel = `(${response.status})`;
        toast({
          title: "فشل الاستخراج",
          description:
            result?.error ||
            fallbackResponseText ||
            `حدث خطأ أثناء قراءة الملف ${statusLabel}`,
          variant: "destructive",
        });
        return;
      }

      const pipelineAction = buildFileOpenPipelineAction(result.data, mode);
      logger.info(`open_pipeline=${pipelineAction.telemetry.openPipeline}`, {
        component: "FileOpen",
        action: mode,
        data: pipelineAction.telemetry,
      });

      if (pipelineAction.kind === "reject") {
        toast(pipelineAction.toast);
        return;
      }

      if (pipelineAction.kind === "import-structured-blocks") {
        await editorRef.current?.importStructuredBlocks(pipelineAction.blocks, mode);
      } else {
        await editorRef.current?.importClassifiedText(pipelineAction.text, mode);
      }
      toast(pipelineAction.toast);
    } catch (error) {
      toast({
        title: "خطأ",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء استخراج الملف",
        variant: "destructive",
      });
    }
  };

  /**
   * فتح مربع اختيار ملف وإرجاع الملف المختار
   */
  const pickFile = (accept: string): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        resolve(file);
      };
      // إذا أُلغيَت النافذة
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  };

  const handleSaveFile = async () => {
    const content = getEditorContentForExport();
    if (!content) {
      setActiveMenu(null);
      return;
    }
    const blocks = getEditorBlocksForExport();
    if (!blocks) {
      setActiveMenu(null);
      return;
    }

    try {
      await exportToDocx(content, "screenplay.docx", { blocks });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ الملف بصيغة DOCX مع التنسيق",
      });
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إنشاء ملف DOCX.",
        variant: "destructive",
      });
    }

    setActiveMenu(null);
  };

  const handleSaveAsFile = async () => {
    const content = getEditorContentForExport();
    if (!content) {
      setActiveMenu(null);
      return;
    }
    const blocks = getEditorBlocksForExport();
    if (!blocks) {
      setActiveMenu(null);
      return;
    }

    const userInput = window.prompt("اكتب اسم الملف", "screenplay.docx");
    if (userInput === null) {
      setActiveMenu(null);
      return;
    }

    const filename = ensureDocxFilename(userInput);
    if (!filename) {
      toast({
        title: "اسم غير صالح",
        description: "الرجاء إدخال اسم ملف صحيح.",
        variant: "destructive",
      });
      setActiveMenu(null);
      return;
    }

    try {
      await exportToDocx(content, filename, { blocks });
      toast({
        title: "تم الحفظ باسم",
        description: `تم حفظ الملف: ${filename}`,
      });
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إنشاء ملف DOCX.",
        variant: "destructive",
      });
    }

    setActiveMenu(null);
  };

  const handlePrintFile = async () => {
    const content = getEditorContentForExport();
    if (!content) {
      setActiveMenu(null);
      return;
    }
    const blocks = getEditorBlocksForExport();
    if (!blocks) {
      setActiveMenu(null);
      return;
    }

    toast({ title: "جاري الطباعة", description: "جاري تجهيز PDF للطباعة..." });
    await exportToPDF(content, "سيناريو", { openAfterExport: true, blocks });
    setActiveMenu(null);
  };

  const handleExportPDF = async () => {
    const content = getEditorContentForExport();
    if (!content) {
      return;
    }
    const blocks = getEditorBlocksForExport();
    if (!blocks) {
      return;
    }

    toast({ title: "جاري التصدير", description: "جاري إنشاء PDF..." });

    await exportToPDF(content, "سيناريو", { blocks });

    setActiveMenu(null);
  };

  // ============ EDIT OPERATIONS ============
  const handleUndo = () => {
    ensureEditorFocus();
    const handled = editorRef.current?.undoCommandOperation() ?? false;
    if (!handled) {
      executeEditorCommand("undo");
    } else {
      captureEditorSelection();
    }
    setActiveMenu(null);
  };

  const handleRedo = () => {
    ensureEditorFocus();
    const handled = editorRef.current?.redoCommandOperation() ?? false;
    if (!handled) {
      executeEditorCommand("redo");
    } else {
      captureEditorSelection();
    }
    setActiveMenu(null);
  };

  const handleCopy = async (_origin: CommandOrigin = "menu") => {
    ensureEditorFocus();
    if (
      !(editorRef.current?.hasSelection() || hasNonCollapsedSelectionInEditor())
    ) {
      toast({
        title: "لا يوجد تحديد",
        description: "حدد نصًا داخل المحرر أولاً.",
        variant: "destructive",
      });
      setActiveMenu(null);
      return;
    }

    const copied = await editorRef.current?.copySelectionToClipboard();
    if (!copied) {
      toast({
        title: "فشل النسخ",
        description: "تعذر النسخ إلى الحافظة. تحقق من صلاحيات المتصفح.",
        variant: "destructive",
      });
      setActiveMenu(null);
      return;
    }

    toast({ title: "تم النسخ", description: "تم نسخ النص المحدد بالكامل" });
    setActiveMenu(null);
  };

  const handleCut = async (_origin: CommandOrigin = "menu") => {
    ensureEditorFocus();
    if (
      !(editorRef.current?.hasSelection() || hasNonCollapsedSelectionInEditor())
    ) {
      toast({
        title: "لا يوجد تحديد",
        description: "حدد نصًا داخل المحرر أولاً.",
        variant: "destructive",
      });
      setActiveMenu(null);
      return;
    }

    const cut = await editorRef.current?.cutSelectionToClipboard();
    if (!cut) {
      toast({
        title: "فشل القص",
        description:
          "تعذر الوصول للحافظة، لذلك لم يتم حذف أي نص للحفاظ على البيانات.",
        variant: "destructive",
      });
      setActiveMenu(null);
      return;
    }

    toast({ title: "تم القص", description: "تم قص كل النص المحدد" });
    setActiveMenu(null);
  };

  const handlePaste = async (origin: CommandOrigin = "menu") => {
    captureEditorSelection();
    ensureEditorFocus();
    try {
      const pasted =
        (await editorRef.current?.pasteFromClipboard(origin)) ?? false;
      if (!pasted) {
        throw new Error("clipboard-unavailable");
      }
      captureEditorSelection();
      toast({ title: "تم اللصق", description: "تم لصق النص بنجاح" });
    } catch {
      toast({
        title: "فشل اللصق",
        description: "تعذّر قراءة الحافظة. تحقق من صلاحيات المتصفح.",
        variant: "destructive",
      });
    }
    setActiveMenu(null);
  };

  const handleSelectAll = () => {
    editorRef.current?.selectAllContent();
    captureEditorSelection();
    setActiveMenu(null);
  };

  // ============ FORMAT OPERATIONS ============
  const handleBold = () => {
    executeEditorCommand("bold");
  };

  const handleItalic = () => {
    executeEditorCommand("italic");
  };

  const handleAlignRight = () => {
    executeEditorCommand("justifyRight");
  };

  const handleAlignCenter = () => {
    executeEditorCommand("justifyCenter");
  };

  const handleAlignLeft = () => {
    executeEditorCommand("justifyLeft");
  };

  // ============ INSERT OPERATIONS ============
  const handleInsertByFormatId = useCallback(
    (formatId: EditorStyleFormatId) => {
      ensureEditorFocus();
      const definition = insertMenuDefinitions.find(
        (item) => item.id === formatId
      );
      if (!definition) return;

      if (definition.insertBehavior === "photo-montage") {
        const currentLine = getCurrentEditorLineElement();
        if (!currentLine || !applyPhotoMontageToSceneHeaderLine(currentLine)) {
          toast({
            title: "تعذر إدراج فوتو مونتاج",
            description: "ضع المؤشر داخل رأس المشهد (1) أولًا.",
            variant: "destructive",
          });
          setActiveMenu(null);
          return;
        }

        notifyEditorInput(currentLine);
        placeCursorAtEndOfNode(currentLine);
        captureEditorSelection();
        setActiveMenu(null);
        return;
      }

      if (!definition.defaultTemplate) {
        setActiveMenu(null);
        return;
      }

      editorRef.current?.insertContent(
        `<div class="format-${definition.id}">${definition.defaultTemplate}</div>`,
        "insert"
      );
      captureEditorSelection();
      setActiveMenu(null);
    },
    [
      captureEditorSelection,
      ensureEditorFocus,
      getCurrentEditorLineElement,
      notifyEditorInput,
      placeCursorAtEndOfNode,
      toast,
    ]
  );

  // ============ TOOLS ============
  const handleSpellCheck = () => {
    toast({
      title: "فحص الإملاء",
      description: "جاري فحص الأخطاء الإملائية...",
    });
    setActiveMenu(null);
  };

  const handleScriptAnalysis = () => {
    toast({ title: "تحليل السيناريو", description: "جاري تحليل السيناريو..." });
    setActiveMenu(null);
  };

  const handleAISuggestions = () => {
    toast({
      title: "اقتراحات الذكاء الاصطناعي",
      description: "جاري توليد الاقتراحات...",
    });
    setActiveMenu(null);
  };

  // ============ HELP ============
  const handleShowHelp = () => {
    toast({
      title: "اختصارات لوحة المفاتيح",
      description:
        "Ctrl+1: عنوان مشهد | Ctrl+2: شخصية | Ctrl+3: حوار | Ctrl+4: حدث | Tab: تغيير التنسيق",
    });
    setActiveMenu(null);
  };

  const handleAbout = () => {
    toast({
      title: "أفان تيتر",
      description: "محرر سيناريوهات احترافي - النسخة 1.0",
    });
    setActiveMenu(null);
  };

  // ============ SIDEBAR HANDLERS ============
  const handleRecentDocClick = (item: string) => {
    toast({ title: "فتح مستند", description: `جاري فتح: ${item}` });
  };

  const handleProjectClick = (item: string) => {
    toast({ title: "فتح مشروع", description: `جاري فتح مشروع: ${item}` });
  };

  const handleLibraryClick = (item: string) => {
    toast({ title: "المكتبة", description: `جاري فتح قسم: ${item}` });
  };

  const handleSettingsClick = (item: string) => {
    const settingsMap: Record<string, string> = {
      عام: "الإعدادات العامة للتطبيق",
      المظهر: "تخصيص الألوان والخطوط",
      الحساب: "إعدادات الحساب والمزامنة",
      "النسخ الاحتياطي": "إدارة النسخ الاحتياطية",
    };
    toast({
      title: item,
      description: settingsMap[item] || "جاري فتح الإعدادات...",
    });
  };

  const handleMenuAction = (
    actionId: MenuActionId,
    origin: CommandOrigin = "menu"
  ) => {
    const insertFormatId = parseInsertActionId(actionId);
    if (insertFormatId) {
      handleInsertByFormatId(insertFormatId);
      return;
    }

    switch (actionId) {
      case "new-file":
        handleNewFile();
        break;
      case "open-file":
        void handleOpenFile();
        break;
      case "insert-file":
        void handleInsertFile();
        break;
      case "save-file":
        void handleSaveFile();
        break;
      case "save-as-file":
        void handleSaveAsFile();
        break;
      case "print-file":
        void handlePrintFile();
        break;
      case "export-pdf":
        void handleExportPDF();
        break;
      case "undo":
        handleUndo();
        break;
      case "redo":
        handleRedo();
        break;
      case "cut":
        void handleCut(origin);
        break;
      case "copy":
        void handleCopy(origin);
        break;
      case "paste":
        void handlePaste(origin);
        break;
      case "select-all":
        handleSelectAll();
        break;
      case "bold":
        handleBold();
        break;
      case "italic":
        handleItalic();
        break;
      case "align-right":
        handleAlignRight();
        break;
      case "align-center":
        handleAlignCenter();
        break;
      case "align-left":
        handleAlignLeft();
        break;
      case "spell-check":
        handleSpellCheck();
        break;
      case "script-analysis":
        handleScriptAnalysis();
        break;
      case "ai-suggestions":
        handleAISuggestions();
        break;
      case "show-help":
        handleShowHelp();
        break;
      case "about":
        handleAbout();
        break;
    }
  };

  // Keep latest action dispatcher for global shortcuts without re-binding listeners.
  useEffect(() => {
    shortcutActionRef.current = handleMenuAction;
  });

  useEffect(() => {
    const isTextInputOutsideEditor = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const editorElement = editorRef.current?.getElement();
      if (editorElement && editorElement.contains(target)) {
        return false;
      }
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTextInputOutsideEditor(e.target)) return;

      const key = e.key.toLowerCase();
      const withShift = e.shiftKey;
      const inEditorContext =
        isSelectionInsideEditor() || Boolean(preservedSelectionRef.current);
      const runAction = (actionId: MenuActionId) => {
        shortcutActionRef.current(actionId, "shortcut");
      };

      if (key === "n") {
        e.preventDefault();
        runAction("new-file");
        return;
      }

      if (key === "o") {
        e.preventDefault();
        runAction("open-file");
        return;
      }

      if (key === "s" && withShift) {
        e.preventDefault();
        runAction("save-as-file");
        return;
      }

      if (key === "s") {
        e.preventDefault();
        runAction("save-file");
        return;
      }

      if (key === "p") {
        e.preventDefault();
        runAction("print-file");
        return;
      }

      if (key === "a") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("select-all");
        return;
      }

      if (key === "z" && withShift) {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("redo");
        return;
      }

      if (key === "z") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("undo");
        return;
      }

      if (key === "y") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("redo");
        return;
      }

      if (key === "x") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("cut");
        return;
      }

      if (key === "c") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("copy");
        return;
      }

      if (key === "v") {
        if (!inEditorContext) return;
        e.preventDefault();
        runAction("paste");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isSelectionInsideEditor]);

  // ============ MENU DEFINITIONS ============
  const menuItems: Record<
    string,
    Array<{ label: string; icon: React.ElementType; actionId: MenuActionId }>
  > = {
    ملف: [
      { label: "مستند جديد", icon: IconFilePlus, actionId: "new-file" },
      { label: "فتح...", icon: IconFolderOpen, actionId: "open-file" },
      { label: "إدراج ملف...", icon: IconUpload, actionId: "insert-file" },
      { label: "حفظ", icon: IconDeviceFloppy, actionId: "save-file" },
      { label: "حفظ باسم...", icon: IconDownload, actionId: "save-as-file" },
      { label: "طباعة", icon: IconPrinter, actionId: "print-file" },
      { label: "تصدير كـ PDF", icon: IconFileExport, actionId: "export-pdf" },
    ],
    تعديل: [
      { label: "تراجع", icon: IconArrowBackUp, actionId: "undo" },
      { label: "إعادة", icon: IconArrowForwardUp, actionId: "redo" },
      { label: "قص", icon: IconScissors, actionId: "cut" },
      { label: "نسخ", icon: IconCopy, actionId: "copy" },
      { label: "لصق", icon: IconClipboard, actionId: "paste" },
      { label: "تحديد الكل", icon: IconSelect, actionId: "select-all" },
    ],
    إدراج: insertMenuDefinitions.map((item) => ({
      label: item.label,
      icon: item.icon,
      actionId: toInsertActionId(item.id),
    })),
    تنسيق: [
      { label: "غامق", icon: IconBold, actionId: "bold" },
      { label: "مائل", icon: IconItalic, actionId: "italic" },
      {
        label: "محاذاة لليمين",
        icon: IconAlignRight,
        actionId: "align-right",
      },
      { label: "توسيط", icon: IconAlignCenter, actionId: "align-center" },
      { label: "محاذاة لليسار", icon: IconAlignLeft, actionId: "align-left" },
    ],
    أدوات: [
      { label: "فحص الإملاء", icon: IconWand, actionId: "spell-check" },
      {
        label: "تحليل السيناريو",
        icon: IconStethoscope,
        actionId: "script-analysis",
      },
      { label: "اقتراحات ذكية", icon: IconBulb, actionId: "ai-suggestions" },
    ],
    مساعدة: [
      {
        label: "اختصارات لوحة المفاتيح",
        icon: IconKeyboard,
        actionId: "show-help",
      },
      { label: "حول أفان تيتر", icon: IconHelp, actionId: "about" },
    ],
  };

  return (
    <div
      className="selection:bg-primary/30 flex h-screen flex-col overflow-hidden bg-neutral-950 font-['Cairo'] text-neutral-200 selection:text-primary-foreground"
      dir="rtl"
    >
      <BackgroundGrid />

      {/* Header - Transparent Glass */}
      <header className="relative z-50 flex h-20 flex-shrink-0 items-center justify-between bg-neutral-950/80 px-8 backdrop-blur-md">
        <div className="flex items-center gap-6">
          {/* Logo Brand - أفان تيتر */}
          <HoverBorderGradient
            containerClassName="rounded-lg cursor-pointer group"
            as="div"
            className="flex items-center gap-3 bg-neutral-900/80 px-4 py-2 leading-none"
          >
            <span className="flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0F4C8A]"></span>
            </span>
            <span className="bg-gradient-to-r from-[#0F4C8A]/60 to-[#0F4C8A] bg-clip-text text-2xl font-bold text-transparent transition-all duration-300 group-hover:to-accent">
              أفان تيتر
            </span>
          </HoverBorderGradient>

          {/* Menus */}
          <nav className="relative z-50 flex items-center gap-2 rounded-full border border-white/5 bg-neutral-900/50 p-1.5 backdrop-blur-md">
            {["ملف", "تعديل", "إدراج", "تنسيق", "أدوات", "مساعدة"].map(
              (menu) => (
                <div key={menu} className="group relative">
                  <HoverBorderGradient
                    as="button"
                    onMouseDown={handlePreserveSelectionMouseDown}
                    onClick={() => toggleMenu(menu)}
                    containerClassName="rounded-full"
                    className={cn(
                      "bg-neutral-900/80 px-4 py-1.5 text-sm font-medium transition-all hover:bg-neutral-800",
                      activeMenu === menu
                        ? "text-white"
                        : "text-neutral-400 group-hover:text-white"
                    )}
                  >
                    {menu}
                  </HoverBorderGradient>

                  <AnimatePresence>
                    {activeMenu === menu && (
                      <motion.div
                        initial={{
                          opacity: 0,
                          y: 10,
                          scale: 0.95,
                          filter: "blur(4px)",
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          filter: "blur(0px)",
                        }}
                        exit={{
                          opacity: 0,
                          y: 10,
                          scale: 0.95,
                          filter: "blur(4px)",
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                        className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#111] p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
                      >
                        {menuItems[menu]?.map((item, idx) => (
                          <motion.button
                            key={idx}
                            onMouseDown={handlePreserveSelectionMouseDown}
                            onClick={() => handleMenuAction(item.actionId)}
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-sm text-neutral-400 transition-all hover:bg-white/10 hover:text-white"
                          >
                            <item.icon
                              size={16}
                              className="text-neutral-500 group-hover:text-white"
                            />
                            <span className="flex-1">{item.label}</span>
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            )}
          </nav>
        </div>

        {/* User Actions & Stats */}
        <div className="flex items-center gap-4">
          <HoverBorderGradient
            as="button"
            containerClassName="rounded-full"
            className="bg-ring/10 flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ring"
            duration={1}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ring" />
            Online
          </HoverBorderGradient>

          <HoverBorderGradient
            as="div"
            containerClassName="rounded-full cursor-pointer"
            className="flex h-10 w-10 items-center justify-center bg-gradient-to-tr from-neutral-800 to-neutral-700 p-0"
            duration={1}
          >
            <IconUser className="text-neutral-300" size={18} />
          </HoverBorderGradient>

          {/* Platform Badge - النسخة */}
          <HoverBorderGradient
            containerClassName="rounded-lg cursor-pointer group"
            as="div"
            className="flex items-center gap-3 bg-neutral-900/80 px-4 py-2 leading-none"
          >
            <span className="bg-gradient-to-r from-[#029784]/60 to-[#029784] bg-clip-text text-2xl font-bold text-transparent transition-all duration-300 group-hover:to-[#40A5B3]">
              النسخة
            </span>
            <span className="flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#029784]"></span>
            </span>
          </HoverBorderGradient>
        </div>
      </header>

      {/* Main Layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Sidebar - Floating Glass Panel */}
        <aside className="flex w-72 flex-col p-6">
          <HoverBorderGradient
            containerClassName="h-full w-full rounded-3xl"
            className="flex h-full w-full flex-col items-stretch bg-neutral-900/30 p-4 backdrop-blur-xl"
            as="div"
            duration={1}
          >
            {/* Search Input */}
            <div className="group relative mb-8">
              <HoverBorderGradient
                containerClassName="rounded-xl w-full group"
                className="flex w-full items-center bg-neutral-950 px-3 py-3"
                as="div"
                duration={1}
              >
                <IconSearch
                  size={18}
                  className="text-neutral-500 transition-colors group-focus-within:text-primary"
                />
                <input
                  type="text"
                  placeholder="بحث..."
                  className="w-full border-none bg-transparent px-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
                />
                <kbd className="hidden rounded bg-neutral-800 px-1.5 font-sans text-[10px] text-neutral-400 group-hover:block">
                  ⌘K
                </kbd>
              </HoverBorderGradient>
            </div>

            <div className="space-y-2">
              <SidebarItem
                icon={IconFileText}
                label="المستندات الأخيرة"
                items={[
                  "سيناريو فيلم.docx",
                  "مسودة الحلقة 1.docx",
                  "ملاحظات المخرج.docx",
                ]}
                isOpen={openSidebarItem === "docs"}
                onToggle={() =>
                  setOpenSidebarItem(openSidebarItem === "docs" ? null : "docs")
                }
                onItemClick={handleRecentDocClick}
              />
              <SidebarItem
                icon={IconList}
                label="المشاريع"
                items={["مسلسل الأخوة", "فيلم الرحلة", "مسلسل الحارة"]}
                isOpen={openSidebarItem === "projects"}
                onToggle={() =>
                  setOpenSidebarItem(
                    openSidebarItem === "projects" ? null : "projects"
                  )
                }
                onItemClick={handleProjectClick}
              />
              <SidebarItem
                icon={IconUpload}
                label="المكتبة"
                items={["القوالب", "الشخصيات", "المشاهد المحفوظة", "المفضلة"]}
                isOpen={openSidebarItem === "library"}
                onToggle={() =>
                  setOpenSidebarItem(
                    openSidebarItem === "library" ? null : "library"
                  )
                }
                onItemClick={handleLibraryClick}
              />
              <SidebarItem
                icon={IconSettings}
                label="الإعدادات"
                items={["عام", "المظهر", "الحساب", "النسخ الاحتياطي"]}
                isOpen={openSidebarItem === "settings"}
                onToggle={() =>
                  setOpenSidebarItem(
                    openSidebarItem === "settings" ? null : "settings"
                  )
                }
                onItemClick={handleSettingsClick}
              />
            </div>

            <div className="mt-auto">
              <HoverBorderGradient
                containerClassName="rounded-2xl w-full"
                className="from-primary/10 to-accent/10 flex w-full flex-col items-start bg-gradient-to-br p-4"
                as="div"
                duration={1}
              >
                <IconSparkles className="mb-2 text-primary" size={20} />
                <p className="text-xs font-light leading-relaxed text-muted-foreground">
                  تم تفعيل وضع التركيز الذكي. استمتع بتجربة كتابة خالية من
                  المشتتات.
                </p>
              </HoverBorderGradient>
            </div>
          </HoverBorderGradient>
        </aside>

        {/* Editor Area */}
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {/* Floating Dock Toolbar */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex justify-center pt-2">
            <motion.div
              className="pointer-events-auto"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <HoverBorderGradient
                as="div"
                containerClassName="rounded-2xl mx-auto"
                className="flex h-16 items-end gap-2 bg-neutral-900/80 px-4 pb-3"
              >
                {/* Group 1: Media/Export */}
                <DockIcon
                  icon={IconMovie}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={() =>
                    toast({
                      title: "معاينة",
                      description: "جاري فتح معاينة الفيلم...",
                    })
                  }
                />
                <DockIcon
                  icon={IconDownload}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleExportPDF}
                />

                <div className="mx-2 mb-4 h-5 w-[1px] bg-gradient-to-b from-transparent via-neutral-600/50 to-transparent" />

                {/* Group 2: Tools */}
                <DockIcon
                  icon={IconStethoscope}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleScriptAnalysis}
                />
                <DockIcon
                  icon={IconBulb}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleAISuggestions}
                />

                <div className="mx-2 mb-4 h-5 w-[1px] bg-gradient-to-b from-transparent via-neutral-600/50 to-transparent" />

                {/* Group 3: Actions */}
                <DockIcon
                  icon={IconMessage}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={() =>
                    toast({
                      title: "الملاحظات",
                      description: "جاري فتح لوحة الملاحظات...",
                    })
                  }
                />
                <DockIcon
                  icon={IconHistory}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={() =>
                    toast({
                      title: "السجل",
                      description: "جاري عرض سجل التغييرات...",
                    })
                  }
                />
                <DockIcon
                  icon={IconUpload}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleOpenFile}
                />
                <DockIcon
                  icon={IconDeviceFloppy}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={() => void handleSaveFile()}
                />

                <div className="mx-2 mb-4 h-5 w-[1px] bg-gradient-to-b from-transparent via-neutral-600/50 to-transparent" />

                {/* Group 4: Formatting */}
                <DockIcon
                  icon={IconArrowBackUp}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleUndo}
                />
                <DockIcon
                  icon={IconArrowForwardUp}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleRedo}
                />
                <DockIcon
                  icon={IconBold}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleBold}
                />
                <DockIcon
                  icon={IconItalic}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleItalic}
                />
                <DockIcon
                  icon={IconAlignRight}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleAlignRight}
                />
                <DockIcon
                  icon={IconAlignCenter}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleAlignCenter}
                />

                <div className="mx-2 mb-4 h-5 w-[1px] bg-gradient-to-b from-transparent via-neutral-600/50 to-transparent" />

                {/* Group 5: Info */}
                <DockIcon
                  icon={IconInfoCircle}
                  onMouseDown={handlePreserveSelectionMouseDown}
                  onClick={handleShowHelp}
                />
              </HoverBorderGradient>
            </motion.div>
          </div>

          {/* Editor Canvas */}
          <div className="scrollbar-hide flex flex-1 justify-center overflow-y-auto p-8 pt-24">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative -mt-8 w-full max-w-[850px] pb-20"
            >
              {/* Background Ripple Effect */}
              <BackgroundRippleEffect
                rows={15}
                cols={20}
                cellSize={50}
                className="opacity-50"
              />

              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div onContextMenu={captureEditorSelection}>
                    <EditorArea
                      ref={editorRef}
                      onContentChange={handleContentChange}
                      onStatsChange={handleStatsChange}
                      onFormatChange={handleFormatChange}
                      font="AzarMehrMonospaced-San"
                      size="12pt"
                      pageCount={stats.pages}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onSelect={() => handleMenuAction("undo", "context")}>
                    تراجع
                    <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleMenuAction("redo", "context")}>
                    إعادة
                    <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => handleMenuAction("cut", "context")}>
                    قص
                    <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleMenuAction("copy", "context")}>
                    نسخ
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleMenuAction("paste", "context")}>
                    لصق
                    <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => handleMenuAction("select-all", "context")}
                  >
                    تحديد الكل
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </motion.div>
          </div>
        </main>
      </div>

      <div className="relative z-50 flex-shrink-0 bg-neutral-950/80 backdrop-blur-md">
        <EditorFooter
          stats={stats}
          currentFormatLabel={
            screenplayFormats.find((f) => f.id === currentFormat)?.label || ""
          }
        />
      </div>
    </div>
  );
};
