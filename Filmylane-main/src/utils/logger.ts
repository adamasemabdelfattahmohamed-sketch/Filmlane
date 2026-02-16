/**
 * @description
 * أداة السجلات - Logger Utility
 * نظام تسجيل مرن مع ألوان و Emoji للتطوير
 *
 * @responsibilities
 * - تسجيل الرسائل بمستويات مختلفة (info, warn, error, debug, success)
 * - تنسيق الألوان حسب مستوى السجل (Jungle Green Theme)
 * - عرض الوقت والمكون والإجراء
 * - كتم السجلات في وضع الإنتاج (ما عدا الأخطاء)
 *
 * @boundaries
 * - يفعل: تسجيل في Console فقط
 * - لا يفعل: لا يُرسل للخادم أو يخزن في ملف
 *
 * @example
 * ```typescript
 * import { logger } from '@/utils/logger';
 *
 * logger.info('تم تحميل السياق', { component: 'MemoryManager' });
 * logger.error('فشل الاتصال', { data: error });
 * ```
 */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

type LogLevel = "info" | "warn" | "error" | "debug" | "success";

interface LogOptions {
  component?: string; // اسم المكون
  action?: string; // الإجراء المنفذ
  data?: any; // بيانات إضافية
  timestamp?: boolean; // إظهار الوقت
}

const isDevelopment = process.env.NODE_ENV === "development";

// ألوان السجلات - Jungle Green Theme
const logColors = {
  info: "#40A5B3", // Teal
  warn: "#f08c00", // Amber
  error: "#e03131", // Red
  debug: "#746842", // Bronze
  success: "#029784", // Jungle Green
} as const;

/**
 * طباعة سجل منسق
 */
function log(level: LogLevel, message: string, options: LogOptions = {}) {
  if (!isDevelopment && level === "debug") return;

  const { component, action, data, timestamp = true } = options;

  const time = timestamp ? new Date().toLocaleTimeString("ar-SA") : "";
  const componentStr = component ? `[${component}]` : "";
  const actionStr = action ? `{${action}}` : "";

  const prefix = `${time} ${componentStr} ${actionStr}`.trim();
  const color = logColors[level];

  const emoji = {
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    debug: "🔍",
    success: "✅",
  }[level];

  console.log(
    `%c${emoji} ${prefix} %c${message}`,
    `color: ${color}; font-weight: bold;`,
    `color: ${color};`,
    data || ""
  );
}

/**
 * Logger object - كائن السجلات
 */
export const logger = {
  /**
   * معلومات عامة
   */
  info: (message: string, options?: LogOptions) => {
    log("info", message, options);
  },

  /**
   * تحذير
   */
  warn: (message: string, options?: LogOptions) => {
    log("warn", message, options);
  },

  /**
   * خطأ
   */
  error: (message: string, options?: LogOptions) => {
    log("error", message, options);
    if (options?.data instanceof Error) {
      console.error(options.data);
    }
  },

  /**
   * تصحيح
   */
  debug: (message: string, options?: LogOptions) => {
    log("debug", message, options);
  },

  /**
   * نجاح
   */
  success: (message: string, options?: LogOptions) => {
    log("success", message, options);
  },

  /**
   * توقيت الأداء
   */
  time: (label: string) => {
    if (isDevelopment) {
      console.time(`⏱️ ${label}`);
    }
  },

  /**
   * انتهاء توقيت الأداء
   */
  timeEnd: (label: string) => {
    if (isDevelopment) {
      console.timeEnd(`⏱️ ${label}`);
    }
  },

  /**
   * مجموعة سجلات
   */
  group: (label: string, collapsed = false) => {
    if (isDevelopment) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  },

  /**
   * انتهاء المجموعة
   */
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },

  /**
   * جدول
   */
  table: (data: any) => {
    if (isDevelopment) {
      console.table(data);
    }
  },
};

/**
 * تتبع الأخطاء
 */
export function trackError(error: Error, context?: string) {
  logger.error(`خطأ${context ? ` في ${context}` : ""}`, {
    component: "ErrorTracker",
    data: {
      message: error.message,
      stack: error.stack,
      context,
    },
  });

  // هنا يمكن إضافة integration مع Sentry أو أي خدمة تتبع أخرى
  // if (typeof window !== 'undefined') {
  //   Sentry.captureException(error);
  // }
}

/**
 * تتبع الأحداث
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
) {
  logger.info(`حدث: ${eventName}`, {
    component: "Analytics",
    data: properties,
  });

  // هنا يمكن إضافة integration مع Google Analytics أو أي خدمة تحليلات أخرى
  // if (typeof window !== 'undefined') {
  //   gtag('event', eventName, properties);
  // }
}

export default logger;
