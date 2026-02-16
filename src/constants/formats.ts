import {
  BookHeart,
  Film,
  MapPin,
  Camera,
  Feather,
  UserSquare,
  Parentheses,
  MessageCircle,
  FastForward,
  SeparatorHorizontal,
} from "lucide-react";
import type { ScreenplayFormat } from "@/types/screenplay";

export const screenplayFormats: ScreenplayFormat[] = [
  {
    id: "basmala",
    label: "بسملة",
    shortcut: "",
    color: "bg-purple-200/50 dark:bg-purple-800/50",
    icon: BookHeart,
  },
  {
    id: "scene-header-top-line",
    label: "عنوان المشهد (سطر علوي)",
    shortcut: "",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: SeparatorHorizontal,
  },
  {
    id: "scene-header-1",
    label: "عنوان المشهد (1)",
    shortcut: "Ctrl+1",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: Film,
  },
  {
    id: "scene-header-2",
    label: "عنوان المشهد (2)",
    shortcut: "Tab",
    color: "bg-sky-200/50 dark:bg-sky-800/50",
    icon: MapPin,
  },
  {
    id: "scene-header-3",
    label: "عنوان المشهد (3)",
    shortcut: "Tab",
    color: "bg-cyan-200/50 dark:bg-cyan-800/50",
    icon: Camera,
  },
  {
    id: "action",
    label: "الفعل/الحدث",
    shortcut: "Ctrl+4",
    color: "bg-gray-200/50 dark:bg-gray-700/50",
    icon: Feather,
  },
  {
    id: "character",
    label: "شخصية",
    shortcut: "Ctrl+2",
    color: "bg-green-200/50 dark:bg-green-800/50",
    icon: UserSquare,
  },
  {
    id: "parenthetical",
    label: "بين قوسين",
    shortcut: "Tab",
    color: "bg-yellow-200/50 dark:bg-yellow-800/50",
    icon: Parentheses,
  },
  {
    id: "dialogue",
    label: "حوار",
    shortcut: "Ctrl+3",
    color: "bg-orange-200/50 dark:bg-orange-800/50",
    icon: MessageCircle,
  },
  {
    id: "transition",
    label: "انتقال",
    shortcut: "Ctrl+6",
    color: "bg-red-200/50 dark:bg-red-800/50",
    icon: FastForward,
  },
];

export const formatClassMap: { [key: string]: string } =
  screenplayFormats.reduce(
    (acc, format) => {
      acc[format.id] = `format-${format.id}`;
      return acc;
    },
    {} as { [key: string]: string }
  );

/**
 * Format shortcut map for Ctrl+number keyboard shortcuts
 * Used in EditorArea for quick format switching
 */
export const formatShortcutMap: { [key: string]: string } = {
  "1": "scene-header-1",
  "2": "character",
  "3": "dialogue",
  "4": "action",
  "6": "transition",
};

/**
 * Classification type options for the confirmation dialog
 * Used in ConfirmationDialog component
 */
export const classificationTypeOptions = [
  { value: "action", label: "حركة (Action)" },
  { value: "dialogue", label: "حوار (Dialogue)" },
  { value: "character", label: "شخصية (Character)" },
  { value: "scene-header-1", label: "عنوان مشهد - مستوى 1" },
  { value: "scene-header-2", label: "عنوان مشهد - مستوى 2" },
  { value: "scene-header-3", label: "عنوان مشهد - مستوى 3" },
  { value: "transition", label: "انتقال (Transition)" },
  { value: "parenthetical", label: "توصيف (Parenthetical)" },
];
