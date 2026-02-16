import React from "react";

export const EDITOR_STYLE_FORMAT_IDS = [
  "basmala",
  "scene-header-1",
  "scene-header-2",
  "scene-header-3",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "scene-header-top-line",
] as const;

export type EditorStyleFormatId = (typeof EDITOR_STYLE_FORMAT_IDS)[number];

/**
 * @function getFormatStyles
 * @description يحصل على الـ CSS styles المناسبة لكل نوع من أنواع التنسيق في السيناريو
 * @param formatType - نوع التنسيق (action, character, dialogue, etc.)
 * @param selectedSize - حجم الخط المحدد
 * @returns React.CSSProperties - الـ styles المناسبة
 */
export const getFormatStyles = (
  formatType: EditorStyleFormatId | string,
  selectedSize: string = "12pt",
  selectedFont: string = "AzarMehrMonospaced-San"
): React.CSSProperties => {
  const normalizedSize = selectedSize === "12pt" ? selectedSize : "12pt";
  const normalizedLineHeight = "15pt";
  const baseStyles: React.CSSProperties = {
    fontFamily: selectedFont,
    fontSize: normalizedSize,
    direction: "rtl",
    lineHeight: normalizedLineHeight,
    minHeight: normalizedLineHeight,
    fontWeight: "bold",
  };

  const formatStyles: { [key: string]: React.CSSProperties } = {
    basmala: {
      textAlign: "left",
      direction: "rtl",
      width: "100%",
      fontWeight: "bold",
      margin: "0 0 0 0",
    },
    "scene-header-top-line": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      width: "100%",
      fontWeight: "normal",
    },
    "scene-header-1": {
      fontWeight: "normal",
      textTransform: "uppercase",
    },
    "scene-header-2": {
      flex: "0 0 auto",
      fontWeight: "normal",
    },
    "scene-header-3": {
      textAlign: "center",
      fontWeight: "normal",
    },
    action: {
      textAlign: "justify",
      textAlignLast: "right",
      textJustify: "inter-word",
      width: "100%",
      margin: "0",
    },
    character: {
      textAlign: "center",
      margin: "0 auto",
    },
    parenthetical: {
      textAlign: "center",
      margin: "0 auto",
    },
    dialogue: {
      width: "4.1in",
      textAlign: "center",
      margin: "0 auto",
      fontWeight: "bold",
      paddingLeft: "1.5em",
      paddingRight: "1em",
      paddingTop: "0.25em",
      paddingBottom: "0",
    },
    transition: {
      textAlign: "center",
      margin: "0 auto",
    },
  };

  const finalStyles = { ...baseStyles, ...formatStyles[formatType] };
  return finalStyles;
};
