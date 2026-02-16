// Screenplay Editor Color Palette - Jungle Green Edition
// أفان تيتر - منصة النسخة

export const colors = [
  // Dark Base
  "#070100", // Dark - الخلفية الداكنة

  // Jungle Green Theme Colors
  "#029784", // Jungle Green - اللون الأساسي
  "#40A5B3", // Teal - اللون الثانوي
  "#746842", // Bronze - التفاصيل

  // Accent Colors
  "#e03131", // Red - أحمر
  "#c2255c", // Pink - وردي
  "#9c36b5", // Purple - بنفسجي
  "#6741d9", // Deep Purple - بنفسجي داكن
  "#3b5bdb", // Indigo - نيلي
  "#1b6ec2", // Blue - أزرق
  "#0c8599", // Cyan - سماوي
  "#099268", // Green - أخضر
  "#2f9e44", // Forest Green - أخضر غابة
  "#66a80f", // Lime - ليموني
  "#f08c00", // Amber - كهرماني
  "#e8590c", // Orange - برتقالي

  // Grays
  "#868e96", // Gray - رمادي
  "#343a40", // Dark Gray - رمادي داكن
  "#000000", // Black - أسود
];

// Brand Colors - الألوان المميزة للمنصة
export const brandColors = {
  jungleGreen: "#029784",
  teal: "#40A5B3",
  bronze: "#746842",
  dark: "#070100",
} as const;

// Semantic Colors - الألوان الدلالية
export const semanticColors = {
  primary: "#029784", // Jungle Green
  secondary: "#40A5B3", // Teal
  accent: "#746842", // Bronze
  success: "#099268", // Green
  warning: "#f08c00", // Amber
  error: "#e03131", // Red
  info: "#1b6ec2", // Blue
  creative: "#c2255c", // Pink
  technical: "#3b5bdb", // Indigo
} as const;

// Text Highlight Colors - ألوان تمييز النصوص
export const highlightColors = [
  "#029784", // Jungle Green
  "#40A5B3", // Teal
  "#099268", // Green
  "#1b6ec2", // Blue
  "#f08c00", // Amber
  "#e03131", // Red
  "#c2255c", // Pink
  "#9c36b5", // Purple
] as const;

// Gradient Presets - تدرجات جاهزة
export const gradients = {
  jungle: "linear-gradient(135deg, #029784, #40A5B3)",
  jungleFull: "linear-gradient(135deg, #029784, #40A5B3, #746842)",
  bronze: "linear-gradient(135deg, #746842, #40A5B3)",
  creative: "linear-gradient(135deg, #c2255c, #40A5B3)",
  success: "linear-gradient(135deg, #099268, #029784)",
  sunset: "linear-gradient(135deg, #f08c00, #e8590c)",
  ocean: "linear-gradient(135deg, #1b6ec2, #0c8599)",
  forest: "linear-gradient(135deg, #2f9e44, #099268)",
} as const;

// Export default color palette
export default colors;
