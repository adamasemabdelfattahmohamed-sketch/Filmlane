/**
 * @description
 * أدوات التخزين المحلي - Storage Utilities
 * دوال آمنة للتعامل مع localStorage مع JSON serialization
 *
 * @responsibilities
 * - توفير دوال آمنة للقراءة/الكتابة في localStorage
 - معالجة الأخطاء تلقائياً (try/catch)
 * - JSON serialization/deserialization
 * - دعم SSR (فحص typeof window)
 *
 * @boundaries
 * - يفعل: التخزين المحلي فقط
 * - لا يفعل: لا يتعامل مع IndexedDB أو cookies
 *
 * @dependencies
 * - logger: تسجيل الأخطاء
 *
 * @example
 * ```typescript
 * import { saveJSON, loadJSON } from '@/utils/storage';
 *
 * saveJSON('user-preferences', { theme: 'dark' });
 * const prefs = loadJSON('user-preferences', { theme: 'light' });
 * ```
 */

import { logger } from "./logger";

/**
 * Safely get an item from localStorage
 * @param key - The storage key
 * @returns The stored string or null if not found/error
 */
export const safeGetItem = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    logger.warn(`Failed to get item from localStorage: ${key}`, {
      data: error,
    });
    return null;
  }
};

/**
 * Safely set an item in localStorage
 * @param key - The storage key
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export const safeSetItem = (key: string, value: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    logger.warn(`Failed to set item in localStorage: ${key}`, { data: error });
    return false;
  }
};

/**
 * Safely remove an item from localStorage
 * @param key - The storage key
 * @returns true if successful, false otherwise
 */
export const safeRemoveItem = (key: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    logger.warn(`Failed to remove item from localStorage: ${key}`, {
      data: error,
    });
    return false;
  }
};

/**
 * Safely load and parse JSON from localStorage
 * @param key - The storage key
 * @param defaultValue - Default value if not found or error
 * @returns The parsed value or defaultValue
 */
export const loadJSON = <T>(key: string, defaultValue: T): T => {
  if (typeof window === "undefined") return defaultValue;
  try {
    const data = localStorage.getItem(key);
    if (!data) return defaultValue;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.warn(`Failed to load JSON from localStorage: ${key}`, {
      data: error,
    });
    return defaultValue;
  }
};

/**
 * Safely stringify and save JSON to localStorage
 * @param key - The storage key
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export const saveJSON = <T>(key: string, value: T): boolean => {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn(`Failed to save JSON to localStorage: ${key}`, { data: error });
    return false;
  }
};
