import type { ScreenplayBlock } from "@/utils/document-model";

export const FILMLANE_CLIPBOARD_MIME =
  "application/x-filmlane-blocks+json" as const;

export type ClipboardSourceKind = "selection" | "document";

export type ClipboardOrigin = "menu" | "shortcut" | "context" | "native";

export interface EditorClipboardPayload {
  plainText: string;
  html?: string;
  blocks?: ScreenplayBlock[];
  sourceKind: ClipboardSourceKind;
  hash: string;
  createdAt: string;
}
