import { useMemo } from "react";

/**
 * Custom hook for managing resizable panel layouts with localStorage persistence.
 *
 * @param {Object} options
 * @param {string} options.id Unique ID for the layout group to be stored in localStorage.
 * @param {number[]} options.defaultLayout Default sizes (percentages) if no layout is stored.
 * @returns {Object} { defaultLayout, onLayoutChanged } to spread onto ResizablePanelGroup.
 */
export function useSplitLayout({ id, defaultLayout: initialLayout }) {
  const STORAGE_KEY = `pyzone-layout:${id}`;

  const defaultLayout = useMemo(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to read split layout from localStorage", e);
    }
    return initialLayout;
  }, [initialLayout, STORAGE_KEY]);

  const onLayoutChanged = (sizes) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch (e) {
      console.warn("Failed to save split layout to localStorage", e);
    }
  };

  return { defaultLayout, onLayoutChanged };
}
