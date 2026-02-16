import { useEffect, useRef } from "react";
import { loadJSON, saveJSON } from "@/utils/storage";

export function useAutoSave<T>(key: string, value: T, delay: number = 3000) {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveJSON(key, value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, value, delay]);
}

/**
 * @deprecated Use loadJSON from @/utils/storage instead
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  return loadJSON<T>(key, defaultValue);
}
