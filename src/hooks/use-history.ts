import { useState, useCallback } from "react";

export function useHistory<T>(initialState: T) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<T[]>([initialState]);

  const setState = useCallback(
    (action: T | ((prev: T) => T)) => {
      setHistory((currentHistory) => {
        const newState =
          typeof action === "function"
            ? (action as (prev: T) => T)(currentHistory[index])
            : action;

        const newHistory = currentHistory.slice(0, index + 1);
        newHistory.push(newState);

        setIndex(newHistory.length - 1);
        return newHistory;
      });
    },
    [index]
  );

  const undo = useCallback(() => {
    if (index > 0) {
      setIndex(index - 1);
    }
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) {
      setIndex(index + 1);
    }
  }, [index, history.length]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return {
    state: history[index],
    set: setState,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
