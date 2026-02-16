import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", ".next", "node_modules", "files (12)"] }, // تجاهل مجلدات البناء والتوثيق
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended, // قواعد TypeScript الأساسية
    ],
    files: ["**/*.{ts,tsx}"], // تطبيق القواعد على ملفات TypeScript
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules, // قواعد الـ Hooks (مهمة جداً في React)

      // قواعد إضافية لتحسين الجودة
      "react/react-in-jsx-scope": "off", // غير مطلوب في Next.js/React 19
      "no-console": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ], // تجاهل المتغيرات التي تبدأ بـ _
      "@typescript-eslint/no-explicit-any": "warn", // يحذرك عند استخدام any بكثرة
    },
  }
);
